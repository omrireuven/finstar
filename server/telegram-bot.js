import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { renderPortfolioChartPng, renderPortfolioCardsPng } from './portfolioChart.js';
import { renderPendingSummaryPng } from './pendingChart.js';
import { runBankSync } from './bankSync.js';
import { buildBackupBuffer } from './backup.js';
import { renderBudgetChartPng } from './budgetChart.js';

const DB_FILE = process.env.DB_FILE || './finstar-db.json';
const SETTINGS_FILE = process.env.SETTINGS_FILE || '../finstar-settings.json';

// In-memory sets to track already-sent alerts within this process runtime
const sentConfirmations = new Set();
const sentBudgetWarnings = new Set();
// message_ids of the last summary sent for each type, so re-requesting one replaces it instead of piling up
let lastPortfolioMsgIds = [];
let lastPendingMsgIds = [];
let lastBudgetMsgIds = [];

let conv = { step: 'idle' };
let pollTimeout = null;
let scheduledTimer = null;
let running = false;
let isPolling = false;

// ── File access helpers ──────────────────────────────────────────────────────

function readDb() {
  try {
    if (!fs.existsSync(DB_FILE)) return { state: {} };
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('[Telegram Bot] Error reading DB:', e);
    return { state: {} };
  }
}

function writeDb(data) {
  try {
    // Bind-mounting a single file (rather than a directory) into the
    // container means the temp-file+rename dance fails with EBUSY on
    // Docker Desktop's file-sharing layer, so we write in place instead.
    fs.writeFileSync(DB_FILE, JSON.stringify(data), 'utf-8');
    return true;
  } catch (e) {
    console.error('[Telegram Bot] Error writing DB:', e);
    return false;
  }
}

function readSettings() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return { state: {} };
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('[Telegram Bot] Error reading Settings:', e);
    return { state: {} };
  }
}

function writeSettings(data) {
  try {
    // Bind-mounting a single file (rather than a directory) into the
    // container means the temp-file+rename dance fails with EBUSY on
    // Docker Desktop's file-sharing layer, so we write in place instead.
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data), 'utf-8');
    return true;
  } catch (e) {
    console.error('[Telegram Bot] Error writing Settings:', e);
    return false;
  }
}

// ── Telegram Bot API Helpers ─────────────────────────────────────────────────

const TG_BASE = 'https://api.telegram.org';

async function getUpdatesPolling(token, offset) {
  if (!token) return [];
  try {
    const res = await fetch(`${TG_BASE}/bot${token}/getUpdates?offset=${offset}&limit=100&timeout=0`);
    if (res.status === 401) throw new Error('401_UNAUTHORIZED');
    const json = await res.json();
    return json.ok ? json.result : [];
  } catch (err) {
    if (err.message === '401_UNAUTHORIZED') throw err;
    return [];
  }
}

/** @returns {Promise<number|null>} the sent message_id, or null on failure */
async function sendMessage(token, chatId, text) {
  if (!token || !chatId) return null;
  try {
    const res = await fetch(`${TG_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    });
    const json = await res.json();
    return json.ok ? json.result.message_id : null;
  } catch (e) {
    return null;
  }
}

/**
 * photo: either a URL string (e.g. a QuickChart link) or a PNG Buffer to upload directly.
 * @returns {Promise<number|null>} the sent message_id, or null on failure
 */
async function sendPhoto(token, chatId, photo, caption = '') {
  if (!token || !chatId) return null;
  try {
    let res;
    if (Buffer.isBuffer(photo)) {
      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('photo', new Blob([photo], { type: 'image/png' }), 'chart.png');
      if (caption) form.append('caption', caption);
      form.append('parse_mode', 'HTML');
      res = await fetch(`${TG_BASE}/bot${token}/sendPhoto`, { method: 'POST', body: form });
    } else {
      res = await fetch(`${TG_BASE}/bot${token}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          photo,
          caption: caption,
          parse_mode: 'HTML',
        }),
      });
    }
    const json = await res.json();
    return json.ok ? json.result.message_id : null;
  } catch (e) {
    return null;
  }
}

/** Deletes a message previously sent by the bot (only works within Telegram's 48h window). */
async function deleteMessage(token, chatId, messageId) {
  if (!token || !chatId || !messageId) return;
  try {
    await fetch(`${TG_BASE}/bot${token}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    });
  } catch (e) { /* silent — message may already be gone or too old to delete */ }
}

async function sendDocument(token, chatId, buffer, filename, caption = '') {
  if (!token || !chatId) return false;
  try {
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('document', new Blob([buffer], { type: 'application/json' }), filename);
    if (caption) form.append('caption', caption);
    form.append('parse_mode', 'HTML');
    const res = await fetch(`${TG_BASE}/bot${token}/sendDocument`, { method: 'POST', body: form });
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function sendReplyKeyboard(token, chatId, text, buttons) {
  if (!token || !chatId) return false;
  try {
    const res = await fetch(`${TG_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: {
          keyboard: buttons.map((row) => row.map((t) => ({ text: t }))),
          resize_keyboard: true,
          persistent: true,
          one_time_keyboard: false,
        },
      }),
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function sendInlineKeyboard(token, chatId, text, buttons) {
  if (!token || !chatId) return null;
  try {
    const res = await fetch(`${TG_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
      }),
    });
    const json = await res.json();
    return json.ok ? json.result.message_id : null;
  } catch (e) {
    return null;
  }
}

async function answerCallbackQuery(token, queryId, text) {
  if (!token) return;
  try {
    await fetch(`${TG_BASE}/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: queryId, text: text ?? '' }),
    });
  } catch (e) { /* silent */ }
}

async function editMessageText(token, chatId, messageId, text) {
  if (!token || !chatId || !messageId) return false;
  try {
    const res = await fetch(`${TG_BASE}/bot${token}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
      }),
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function testBot(token) {
  try {
    const res = await fetch(`${TG_BASE}/bot${token}/getMe`);
    // Only a 401 definitively means the token itself is invalid/revoked.
    if (res.status === 401) return { ok: false, invalid: true };
    const json = await res.json();
    return { ok: res.ok && json.ok, invalid: false };
  } catch (e) {
    // Network/DNS hiccup (e.g. right after container start) — not a token problem.
    return { ok: false, invalid: false };
  }
}

// ── General Utility Helpers ──────────────────────────────────────────────────

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function parseAmount(s) {
  const n = parseFloat(s.trim().replace(',', '.'));
  return isNaN(n) || n <= 0 ? null : n;
}

/**
 * Deletes a transaction and, if it came from a bank/credit sync (has a
 * scraper identifier), registers it so it won't be re-imported on the next
 * sync — mirrors the web app's `deleteTransaction` store action.
 */
function deleteTransactionAndRegister(dbObj, txnId) {
  const dbState = dbObj.state || {};
  const transactions = dbState.transactions || [];
  const txn = transactions.find((t) => t.id === txnId);

  dbState.transactions = transactions.filter((t) => t.id !== txnId);

  if (txn?.metadata?.identifier) {
    const identifier = String(txn.metadata.identifier);
    const ignored = dbState.ignoredIdentifiers || [];
    if (!ignored.includes(identifier)) dbState.ignoredIdentifiers = [...ignored, identifier];

    const log = dbState.deletedTransactionsLog || [];
    dbState.deletedTransactionsLog = [
      { identifier, business: txn.business, amount: txn.amount, date: txn.date, deletedAt: new Date().toISOString() },
      ...log,
    ].slice(0, 500);
  }

  dbObj.state = dbState;
  writeDb(dbObj);
  return txn;
}

function progressBar(pct, len = 10) {
  const filled = Math.min(Math.round((pct / 100) * len), len);
  return '▓'.repeat(filled) + '░'.repeat(len - filled);
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function weekKey(d = new Date()) {
  const y = d.getFullYear();
  const start = new Date(y, 0, 1);
  const week = Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
  return `${y}-W${String(week).padStart(2, '0')}`;
}

// ── Merged / Virtual Transactions Selector ───────────────────────────────────

function genMonths(fromYYYYMM, toYYYYMM) {
  const result = [];
  let [y, m] = fromYYYYMM.split('-').map(Number);
  const [ey, em] = toYYYYMM.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    result.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) { m = 1; y++; }
  }
  return result;
}

function getAllTransactions(dbState) {
  const transactions = dbState.transactions || [];
  const recurring = dbState.recurring || [];
  const today = new Date();
  const nowKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const covered = new Set();
  for (const t of transactions) {
    if (t.recurringId) covered.add(`${t.recurringId}|${t.date.slice(0, 7)}`);
  }

  const virtual = [];

  for (const rec of recurring) {
    if (!rec.active) continue;

    const startKey = rec.startDate ? rec.startDate.slice(0, 7) : nowKey;
    const endKey = (rec.chargeType === 'periodic' && rec.endDate)
      ? rec.endDate.slice(0, 7)
      : nowKey;

    for (const mk of genMonths(startKey, endKey)) {
      if (covered.has(`${rec.id}|${mk}`)) continue;
      const overrideTxId = rec.occurrenceOverrides?.[mk]?.transactionId;
      if (overrideTxId && transactions.some(t => t.id === overrideTxId)) continue;
      if (rec.occurrenceOverrides?.[mk]?.dismissed) continue;

      const override = rec.occurrenceOverrides?.[mk];
      const [my, mm] = mk.split('-').map(Number);
      const maxDay = new Date(my, mm, 0).getDate();
      const day = Math.min(rec.dayOfMonth, maxDay);
      const date = `${mk}-${String(day).padStart(2, '0')}`;

      if (new Date(date + 'T23:59:59') > today) continue;

      const amount = override?.amount ?? rec.amount;

      virtual.push({
        id: `virt-${rec.id}-${mk}`,
        date,
        business: rec.name,
        amount,
        currency: 'ILS',
        category: rec.category,
        isRecurring: true,
        source: rec.card,
        notes: override?.note ?? '',
        pending: false,
        aiCategorized: false,
        recurringId: rec.id,
        isVirtual: true,
      });
    }
  }

  return [...transactions, ...virtual];
}

// ── Portfolio summary formatter ──────────────────────────────────────────────

/** Computes per-ticker rows (value, cost, P&L) shared by both chart builders and the text fallback. */
function getPortfolioRows(dbState) {
  const lots = dbState.lots || [];
  const prices = dbState.prices || {};
  const usdIls = dbState.usdIls || 3.65;

  const byTicker = {};
  for (const lot of lots.filter((l) => !l.sellDate)) {
    if (!byTicker[lot.ticker]) {
      byTicker[lot.ticker] = { ticker: lot.ticker, name: lot.name, quantity: 0, cost: 0, currency: lot.currency };
    }
    byTicker[lot.ticker].quantity += lot.quantity;
    byTicker[lot.ticker].cost += lot.quantity * lot.buyPrice + lot.commission;
  }

  return Object.values(byTicker).map((r) => {
    const price = prices[r.ticker] ?? 0;
    const rate = r.currency === 'USD' ? usdIls : 1;
    const currentValueNative = r.quantity * price;
    const pnlNative = currentValueNative - r.cost;
    const pnlPct = r.cost > 0 ? (pnlNative / r.cost) * 100 : 0;
    return {
      ticker: r.ticker,
      name: r.name,
      currentValueILS: currentValueNative * rate,
      costILS: r.cost * rate,
      pnlILS: pnlNative * rate,
      pnlPct,
    };
  });
}

function getPortfolioSummaryText(dbState) {
  const usdIls = dbState.usdIls || 3.65;
  const rows = getPortfolioRows(dbState).filter(r => r.currentValueILS > 0);

  if (rows.length === 0) {
    return '⚠️ לא נמצאו מניות בתיק.';
  }

  const totalValue = rows.reduce((a, r) => a + r.currentValueILS, 0);
  const totalCost = rows.reduce((a, r) => a + r.costILS, 0);
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  const sortedRows = rows.sort((a, b) => b.currentValueILS - a.currentValueILS);
  const stockLines = sortedRows.map(r => {
    const pnlSign = r.pnlILS >= 0 ? '▲ +' : '▼ ';
    return `📈 <b>${r.ticker}</b> (${r.name || r.ticker})
    שווי: ₪${Math.round(r.currentValueILS).toLocaleString('he-IL')}
    רווח/הפסד: ${pnlSign}${Math.round(r.pnlILS).toLocaleString('he-IL')} (${r.pnlPct.toFixed(1)}%)`;
  }).join('\n\n');

  const overallPnlSign = totalPnl >= 0 ? '▲ +' : '▼ ';
  return `📊 <b>סיכום תיק מניות — ${new Date().toLocaleDateString('he-IL')}</b>\n\n` +
         `💳 <b>שווי כולל:</b> ₪${Math.round(totalValue).toLocaleString('he-IL')}\n` +
         `עלות כוללת: ₪${Math.round(totalCost).toLocaleString('he-IL')}\n` +
         `רווח/הפסד כולל: <b>${overallPnlSign}₪${Math.round(Math.abs(totalPnl)).toLocaleString('he-IL')} (${totalPnlPct.toFixed(1)}%)</b>\n\n` +
         `📋 <b>אחזקות:</b>\n\n${stockLines}\n\n` +
         `<i>שער חליפין: ₪${usdIls.toFixed(2)}/$</i>`;
}

// ── Bot command logic ────────────────────────────────────────────────────────

async function sendMenu(tk, cid) {
  const dbObj = readDb();
  const recurring = dbObj.state?.recurring || [];
  const allTxns = getAllTransactions(dbObj.state || {});
  
  const today = new Date().getDate();
  const upcoming = recurring.filter((r) => {
    if (!r.active) return false;
    const d = r.dayOfMonth - today;
    return d >= 0 && d <= 7;
  }).length;
  const pend = allTxns.filter((t) => t.isVirtual).length;

  await sendReplyKeyboard(tk, cid,
    '🤖 בחר פעולה:',
    [
      ['➕ הוסף הוצאה',          '💰 תקציב החודש'],
      ['📋 הוצאות אחרונות',      `✅ ממתינות${pend > 0 ? ` (${pend})` : ''}`],
      ['🔍 חיפוש',               `📅 חיובים קרובים${upcoming > 0 ? ` (${upcoming})` : ''}`],
      ['📊 סיכום תיק מניות'],
      ['🔄 סנכרון בנקים',        '💾 גיבוי נתונים'],
    ],
  );
}

async function sendUpcomingCharges(tk, cid) {
  const dbObj = readDb();
  const recurring = dbObj.state?.recurring || [];
  const today = new Date().getDate();
  const upcoming = recurring
    .filter((r) => r.active && r.dayOfMonth >= today && r.dayOfMonth <= today + 7)
    .sort((a, b) => a.dayOfMonth - b.dayOfMonth);

  if (upcoming.length === 0) {
    await sendMessage(tk, cid, '✅ אין חיובים קרובים ב-7 הימים הקרובים.');
  } else {
    const lines = upcoming.map((r) => {
      const d = r.dayOfMonth - today;
      const when = d === 0 ? 'היום' : d === 1 ? 'מחר' : `בעוד ${d} ימים`;
      return `💳 <b>${r.name}</b> — ₪${r.amount.toLocaleString('he-IL')} (${when})`;
    }).join('\n');
    await sendMessage(tk, cid, `📋 <b>חיובים קרובים</b>\n\n${lines}`);
  }
}

/** Shared budget computation used by both the chart image and the text fallback. */
function getBudgetData(dbState) {
  const transactions = dbState.transactions || [];
  const goals = dbState.goals || [];
  const categories = dbState.categories || [];

  const mk = currentMonthKey();
  const monthName = new Date().toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });

  const monthTxns = transactions.filter((t) => t.date.startsWith(mk) && !t.pending);
  const catAmt = {};
  for (const t of monthTxns) catAmt[t.category] = (catAmt[t.category] ?? 0) + t.amount;

  const total = monthTxns.reduce((s, t) => s + t.amount, 0);

  const withBudget = goals
    .filter((g) => (catAmt[g.category] ?? 0) > 0 || g.targetAmount > 0)
    .map((g) => {
      const spent = catAmt[g.category] ?? 0;
      const pct = g.targetAmount > 0 ? (spent / g.targetAmount) * 100 : 0;
      return { category: g.category, spent, target: g.targetAmount, pct };
    })
    .sort((a, b) => b.pct - a.pct);

  const noBudget = categories
    .filter((c) => catAmt[c.name] && !goals.find((g) => g.category === c.name))
    .map((c) => ({ category: c.name, spent: catAmt[c.name] }));

  return { total, withBudget, noBudget, monthName };
}

async function sendBudgetStatus(tk, cid) {
  const dbObj = readDb();
  const dbState = dbObj.state || {};
  const { total, withBudget, noBudget, monthName } = getBudgetData(dbState);

  const noBudgetText = noBudget.length
    ? noBudget.map((c) => `${c.category} ₪${Math.round(c.spent).toLocaleString('he-IL')}`).join(' • ')
    : '';

  if (lastBudgetMsgIds.length > 0) {
    await Promise.all(lastBudgetMsgIds.map((id) => deleteMessage(tk, cid, id)));
    lastBudgetMsgIds = [];
  }

  if (withBudget.length === 0) {
    let msg = `💰 <b>תקציב — ${monthName}</b>\n\n—`;
    if (noBudgetText) msg += `\n\n<i>ללא תקציב:</i> ${noBudgetText}`;
    msg += `\n\n💳 <b>סה"כ החודש:</b> ₪${Math.round(total).toLocaleString('he-IL')}`;
    const msgId = await sendMessage(tk, cid, msg);
    lastBudgetMsgIds = msgId ? [msgId] : [];
    return;
  }

  const chartPng = renderBudgetChartPng(withBudget, monthName);
  const untouched = withBudget.filter((g) => g.spent === 0).length;

  let caption = `💰 <b>תקציב — ${monthName}</b>\n💳 סה"כ החודש: ₪${Math.round(total).toLocaleString('he-IL')}`;
  if (untouched > 0) caption += `\n<i>${untouched} קטגוריות עם תקציב עדיין ללא הוצאה החודש</i>`;
  if (noBudgetText) caption += `\n\n<i>ללא תקציב:</i> ${noBudgetText}`;

  const newIds = [];
  if (!chartPng) {
    const msgId = await sendMessage(tk, cid, caption);
    if (msgId) newIds.push(msgId);
  } else if (caption.length <= 1000) {
    const msgId = await sendPhoto(tk, cid, chartPng, caption);
    if (msgId) newIds.push(msgId);
  } else {
    // Caption too long for a photo caption (1024-char Telegram limit) — send the
    // chart with a short caption and the full breakdown as a follow-up message.
    const msgId1 = await sendPhoto(tk, cid, chartPng, `💰 <b>תקציב — ${monthName}</b>`);
    if (msgId1) newIds.push(msgId1);
    const msgId2 = await sendMessage(tk, cid, caption);
    if (msgId2) newIds.push(msgId2);
  }
  lastBudgetMsgIds = newIds;
}

async function sendLastTransactions(tk, cid, count = 5) {
  const dbObj = readDb();
  const transactions = dbObj.state?.transactions || [];
  const sorted = transactions
    .filter((t) => !t.isVirtual)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const last = sorted.slice(0, count);

  if (last.length === 0) {
    await sendMessage(tk, cid, '📋 אין הוצאות עדיין.');
    return;
  }

  const lines = last.map((t, i) => {
    const d = new Date(t.date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
    const pen = t.pending ? ' ⏳' : '';
    return `${i + 1}. ${d}  <b>${escHtml(t.business)}</b>  ₪${t.amount.toLocaleString('he-IL')} (${escHtml(t.category)})${pen}`;
  }).join('\n');

  const buttons = last.map((t, i) => ([
    { text: `🗑️ ${i + 1}. ${t.business} ₪${t.amount.toLocaleString('he-IL')}`, callback_data: `txn_del:${t.id}` },
  ]));

  await sendInlineKeyboard(tk, cid,
    `📋 <b>הוצאות אחרונות</b>\n\n${lines}\n\n<i>לחץ שורה למחיקה:</i>`,
    buttons,
  );
}

const FIND_PAGE = 10;

async function sendFindResults(tk, cid, keyword, offset = 0) {
  const dbObj = readDb();
  const transactions = dbObj.state?.transactions || [];
  const kw = keyword.toLowerCase();
  const all = transactions
    .filter((t) => t.business.toLowerCase().includes(kw) || t.category.toLowerCase().includes(kw))
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));

  if (all.length === 0) {
    await sendMessage(tk, cid, `🔍 לא נמצאו תוצאות עבור "<b>${escHtml(keyword)}</b>"`);
    return;
  }

  const page = all.slice(offset, offset + FIND_PAGE);
  const hasMore = offset + FIND_PAGE < all.length;

  const shownCount = offset + page.length;
  const shownTotal = all.slice(0, shownCount).reduce((s, t) => s + t.amount, 0);

  const header = offset === 0
    ? `🔍 <b>תוצאות: "${escHtml(keyword)}"</b>`
    : `🔍 <b>"${escHtml(keyword)}"</b> — ${offset + 1}–${shownCount}`;

  const lines = page.map((t) => {
    const d = new Date(t.date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
    return `📅 ${d}  <b>${escHtml(t.business)}</b>  ₪${t.amount.toLocaleString('he-IL')} (${escHtml(t.category)})`;
  }).join('\n');

  const footer = `\n\n<b>${shownCount} רשומות • סה"כ ₪${Math.round(shownTotal).toLocaleString('he-IL')}</b>`;
  const text = `${header}\n\n${lines}${footer}`;

  if (hasMore) {
    const safeKw = keyword.slice(0, 20);
    const nextOff = offset + FIND_PAGE;
    const remaining = all.length - nextOff;
    await sendInlineKeyboard(tk, cid, text, [[
      { text: `📄 הצג עוד (${remaining} נוספות)`, callback_data: `find_more:${safeKw}:${nextOff}` },
    ]]);
  } else {
    await sendMessage(tk, cid, text);
  }
}

async function sendDailySummary(tk, cid) {
  const dbObj = readDb();
  const transactions = dbObj.state?.transactions || [];
  const today = new Date().toISOString().slice(0, 10);
  const dayTxns = transactions.filter((t) => t.date === today && !t.pending && !t.isVirtual);
  const dateStr = new Date().toLocaleDateString('he-IL', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

  if (dayTxns.length === 0) {
    await sendMessage(tk, cid, `📅 <b>סיכום יום — ${dateStr}</b>\n\nלא נרשמו הוצאות היום.`);
    return;
  }

  const total = dayTxns.reduce((s, t) => s + t.amount, 0);
  const lines = dayTxns.map((t, i) =>
    `${i + 1}. <b>${escHtml(t.business)}</b>  ₪${t.amount.toLocaleString('he-IL')} (${escHtml(t.category)})`
  ).join('\n');

  const byCat = {};
  for (const t of dayTxns) byCat[t.category] = (byCat[t.category] ?? 0) + t.amount;
  const catLines = Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amt]) => `  ${cat}: ₪${Math.round(amt).toLocaleString('he-IL')}`)
    .join('\n');

  await sendInlineKeyboard(tk, cid,
    `📅 <b>סיכום יום — ${dateStr}</b>\n\n${lines}\n\n${catLines}\n\n💳 <b>סה"כ: ₪${Math.round(total).toLocaleString('he-IL')}</b>`,
    [[
      { text: '📋 ערוך / מחק',  callback_data: 'last_txns' },
      { text: '✅ הכל תקין',     callback_data: 'daily_ok' },
    ]],
  );
}

async function sendWeeklySummary(tk, cid) {
  const dbObj = readDb();
  const transactions = dbObj.state?.transactions || [];
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const ws = weekStart.toISOString().slice(0, 10);
  const we = now.toISOString().slice(0, 10);
  const txns = transactions.filter((t) => t.date >= ws && t.date <= we && !t.pending && !t.isVirtual);
  const wFrom = weekStart.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
  const wTo = now.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });

  if (txns.length === 0) {
    await sendMessage(tk, cid, `📊 <b>סיכום שבוע — ${wFrom}–${wTo}</b>\n\nלא נרשמו הוצאות השבוע.`);
    return;
  }

  const total = txns.reduce((s, t) => s + t.amount, 0);
  const byCat = {};
  for (const t of txns) byCat[t.category] = (byCat[t.category] ?? 0) + t.amount;

  const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const maxAmt = sorted[0]?.[1] ?? 1;
  const lines = sorted.map(([cat, amt]) =>
    `${progressBar((amt / maxAmt) * 100, 8)}  <b>${cat}</b>  ₪${Math.round(amt).toLocaleString('he-IL')}`
  ).join('\n');

  await sendMessage(tk, cid,
    `📊 <b>סיכום שבוע — ${wFrom}–${wTo}</b>\n\n${lines}\n\n💳 <b>סה"כ: ₪${Math.round(total).toLocaleString('he-IL')}</b>  (${txns.length} עסקאות)`,
  );
}

async function sendMonthlySummary(tk, cid) {
  const dbObj = readDb();
  const dbState = dbObj.state || {};
  const transactions = dbState.transactions || [];
  const goals = dbState.goals || [];
  
  const prev = new Date();
  prev.setDate(0);
  const mk = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  const monthName = prev.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });

  const txns = transactions.filter((t) => t.date.startsWith(mk) && !t.pending && !t.isVirtual);

  if (txns.length === 0) {
    await sendMessage(tk, cid, `📊 <b>סיכום חודש — ${monthName}</b>\n\nלא נרשמו הוצאות.`);
    return;
  }

  const total = txns.reduce((s, t) => s + t.amount, 0);
  const byCat = {};
  for (const t of txns) byCat[t.category] = (byCat[t.category] ?? 0) + t.amount;

  const lines = Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([cat, amt]) => {
      const goal = goals.find((g) => g.category === cat);
      const pct = goal ? `  (${Math.round((amt / goal.targetAmount) * 100)}% מהתקציב)` : '';
      return `  <b>${cat}</b>: ₪${Math.round(amt).toLocaleString('he-IL')}${pct}`;
    })
    .join('\n');

  await sendMessage(tk, cid,
    `📊 <b>סיכום חודש — ${monthName}</b>\n\n${lines}\n\n💳 <b>סה"כ: ₪${Math.round(total).toLocaleString('he-IL')}</b>  (${txns.length} עסקאות)`,
  );
}

async function checkBudgetWarningForCat(tk, cid, cat, spent, budget, mk) {
  const settingsObj = readSettings();
  if (!settingsObj.state?.notifyBudgetOverrun) return;
  
  const pct = (spent / budget) * 100;
  const k80 = `${mk}:${cat}:80`;
  const k100 = `${mk}:${cat}:100`;
  if (pct >= 100 && !sentBudgetWarnings.has(k100)) {
    sentBudgetWarnings.add(k100);
    await sendMessage(tk, cid,
      `🔴 <b>חריגה מתקציב!</b>\n\n${cat}: ₪${Math.round(spent).toLocaleString('he-IL')} מתוך ₪${budget.toLocaleString('he-IL')}`);
  } else if (pct >= 80 && !sentBudgetWarnings.has(k80)) {
    sentBudgetWarnings.add(k80);
    await sendMessage(tk, cid,
      `⚠️ <b>קרוב לגבול תקציב</b>\n\n${cat}: ${Math.round(pct)}% מהתקציב (₪${Math.round(spent).toLocaleString('he-IL')} מ-₪${budget.toLocaleString('he-IL')})`);
  }
}

/** Sends the confirm/edit/dismiss inline keyboard for a single pending item. */
/** @returns {Promise<number|null>} the sent message_id */
async function sendPendingItemDetail(tk, cid, txn) {
  const d = new Date(txn.date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
  const txt = `⏳ <b>חיוב קבוע ממתין לאישור</b>\n\n📅 ${d}\n🏪 <b>${escHtml(txn.business)}</b>\n💰 ₪${txn.amount.toLocaleString('he-IL')}\n📂 ${escHtml(txn.category)}`;

  const msgId = await sendInlineKeyboard(tk, cid, txt,
    [[
      { text: '✅ אשר',      callback_data: `v_ok:${txn.id}` },
      { text: '✏️ שנה סכום', callback_data: `v_edit:${txn.id}` },
      { text: '🗑️ התעלם',    callback_data: `v_dismiss:${txn.id}` },
    ]],
  );

  if (!msgId) {
    return sendMessage(tk, cid,
      `⏳ ממתין: ${escHtml(txn.business)} — ₪${txn.amount.toLocaleString('he-IL')} (${escHtml(txn.category)})\n` +
      `אנא אשר דרך ממשק האתר.`
    );
  }
  return msgId;
}

/**
 * Sends one numbered summary image of all pending items. To act on one, the
 * user replies with its number — handled by the 'pending_select' wizard step.
 */
async function checkPendingTransactions(tk, cid, force = false) {
  const dbObj = readDb();
  const allTxns = getAllTransactions(dbObj.state || {});
  const pending = allTxns.filter((t) => t.isVirtual);

  if (pending.length === 0) {
    if (force) await sendMessage(tk, cid, '✅ אין עסקאות ממתינות לאישור.');
    return;
  }

  if (lastPendingMsgIds.length > 0) {
    await Promise.all(lastPendingMsgIds.map((id) => deleteMessage(tk, cid, id)));
    lastPendingMsgIds = [];
  }

  const png = renderPendingSummaryPng(pending);
  const newIds = [];
  if (png) {
    const msgId = await sendPhoto(tk, cid, png, 'שלח את המספר של העסקה כדי לאשר / לערוך / להתעלם ממנה');
    if (msgId) newIds.push(msgId);
  } else {
    for (const txn of pending) {
      const msgId = await sendPendingItemDetail(tk, cid, txn);
      if (msgId) newIds.push(msgId);
    }
  }
  lastPendingMsgIds = newIds;
  conv = { step: 'pending_select', ids: pending.map((t) => t.id) };
}

/** Builds and sends the full-data JSON backup file — identical to the website's "ייצא JSON" export. */
async function sendBackupFile(tk, cid) {
  try {
    const buffer = buildBackupBuffer();
    const filename = `finstar-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const ok = await sendDocument(tk, cid, buffer, filename, '💾 גיבוי נתונים מלא (ללא פרטי חיבור לבנק)');
    if (!ok) await sendMessage(tk, cid, '⚠️ שליחת קובץ הגיבוי נכשלה.');
  } catch (err) {
    await sendMessage(tk, cid, `⚠️ יצירת הגיבוי נכשלה: ${String(err?.message || err).slice(0, 150)}`);
  }
}

/** Runs a full bank/credit sync and reports newly-found transactions + AI categorization back to the chat. */
async function runSyncCommand(tk, cid) {
  const settingsObj = readSettings();
  const bankAccounts = settingsObj.state?.bankAccounts || [];
  if (bankAccounts.length === 0) {
    await sendMessage(tk, cid, '⚠️ לא הוגדרו חשבונות בנק/אשראי בהגדרות.');
    return;
  }

  await sendMessage(tk, cid, `🔄 <b>מתחיל סנכרון...</b>\n${bankAccounts.length} חשבונות. זה עשוי לקחת כמה דקות.`);

  let result;
  try {
    result = await runBankSync();
  } catch (err) {
    await sendMessage(tk, cid, `⚠️ הסנכרון נכשל: ${String(err?.message || err).slice(0, 150)}`);
    return;
  }

  const accLines = result.accountResults.map((a) =>
    a.ok ? `✅ ${escHtml(a.nickname)} — ${a.count} עסקאות חדשות` : `❌ ${escHtml(a.nickname)} — ${escHtml(a.error)}`
  );
  await sendMessage(tk, cid, `🔄 <b>סנכרון הושלם</b>\n\n${accLines.join('\n')}`);

  const { newExpenses, newIncomes, toDelete, toLink, threshold } = result;

  if (newExpenses.length === 0 && newIncomes.length === 0) {
    await sendMessage(tk, cid, 'לא נמצאו עסקאות חדשות.');
    return;
  }

  if (newExpenses.length > 0) {
    const lines = newExpenses.map((tx, i) => {
      const conf = typeof tx.aiConfidence === 'number' ? ` (${tx.aiConfidence}%${tx.aiConfidence < threshold ? ' — מתחת לסף' : ''})` : '';
      return `${i + 1}. 🏪 <b>${escHtml(tx.business)}</b>  ₪${tx.amount.toLocaleString('he-IL')} — ${escHtml(tx.category)}${conf}`;
    });
    for (const group of chunk(lines, 20)) {
      await sendMessage(tk, cid, `📋 <b>עסקאות חדשות (${newExpenses.length}):</b>\n\n${group.join('\n')}`);
    }
  }

  if (newIncomes.length > 0) {
    const lines = newIncomes.map((inc, i) => `${i + 1}. 💰 <b>${escHtml(inc.source)}</b>  ₪${inc.netAmount.toLocaleString('he-IL')} — ${escHtml(inc.type)}`);
    for (const group of chunk(lines, 20)) {
      await sendMessage(tk, cid, `💰 <b>הכנסות חדשות (${newIncomes.length}):</b>\n\n${group.join('\n')}`);
    }
  }

  if (toDelete.length > 0) {
    const lines = toDelete.map((d, i) => `${i + 1}. ${escHtml(d.reason)}`);
    for (const group of chunk(lines, 20)) {
      await sendMessage(tk, cid, `🗑️ <b>המלצות מחיקה (${toDelete.length}):</b>\n\n${group.join('\n')}\n\n<i>אשר/דחה דרך ממשק האתר.</i>`);
    }
  }

  if (toLink.length > 0) {
    const dbObj = readDb();
    const recurring = dbObj.state?.recurring || [];
    const lines = toLink.map((l, i) => {
      const rec = recurring.find((r) => r.id === l.recurringId);
      return `${i + 1}. → <b>${escHtml(rec?.name || l.recurringId)}</b> — ${escHtml(l.reason)}`;
    });
    for (const group of chunk(lines, 20)) {
      await sendMessage(tk, cid, `🔗 <b>המלצות קישור לחיוב קבוע (${toLink.length}):</b>\n\n${group.join('\n')}\n\n<i>אשר/דחה דרך ממשק האתר.</i>`);
    }
  }
}

// ── Text / callback processing ───────────────────────────────────────────────

async function handleText(text, msgDate, tk, cid) {
  const dbObj = readDb();
  const dbState = dbObj.state || {};
  const recurring = dbState.recurring || [];
  const categories = dbState.categories || [];
  const categoryRules = dbState.categoryRules || {};
  const goals = dbState.goals || [];
  const transactions = dbState.transactions || [];

  const t = text.trim();
  const state = conv;

  // ── Reply Keyboard button presses ──────────────────────────────────────────
  if (t.startsWith('➕')) {
    conv = { step: 'amount' };
    await sendMessage(tk, cid, '💰 כמה שילמת?\nשלח סכום, למשל: <code>150</code>\n\n/cancel לביטול');
    return;
  }
  if (t.startsWith('💰 תקציב')) {
    conv = { step: 'idle' };
    await sendBudgetStatus(tk, cid);
    return;
  }
  if (t.startsWith('📋 הוצאות')) {
    conv = { step: 'idle' };
    await sendLastTransactions(tk, cid);
    return;
  }
  if (t.includes('ממתינות')) {
    conv = { step: 'idle' };
    try {
      await checkPendingTransactions(tk, cid, true);
      await sendMenu(tk, cid);
    } catch (err) {
      await sendMessage(tk, cid, `⚠️ שגיאה בטעינת ממתינות: ${String(err).slice(0, 80)}`);
    }
    return;
  }
  if (t.startsWith('🔍 חיפוש') || t === '🔍') {
    conv = { step: 'find' };
    await sendMessage(tk, cid, '🔍 מה לחפש? שלח מילה (שם עסק או קטגוריה):\n\n/cancel לביטול');
    return;
  }
  if (t.startsWith('📊 סיכום תיק')) {
    conv = { step: 'idle' };
    const rows = getPortfolioRows(dbState).filter(r => r.currentValueILS > 0);
    if (rows.length === 0) {
      await sendMessage(tk, cid, '⚠️ לא נמצאו מניות בתיק.');
      return;
    }
    try {
      const png = await renderPortfolioChartPng(dbState.lots || [], dbState.usdIls || 3.65, rows);
      if (png) {
        // Remove the previous summary's photos so re-requesting it doesn't just pile up images.
        if (lastPortfolioMsgIds.length > 0) {
          await Promise.all(lastPortfolioMsgIds.map((id) => deleteMessage(tk, cid, id)));
          lastPortfolioMsgIds = [];
        }
        const newIds = [];
        const msgId1 = await sendPhoto(tk, cid, png);
        if (msgId1) newIds.push(msgId1);
        const cardsPng = renderPortfolioCardsPng(rows);
        if (cardsPng) {
          const msgId2 = await sendPhoto(tk, cid, cardsPng);
          if (msgId2) newIds.push(msgId2);
        }
        lastPortfolioMsgIds = newIds;
      } else {
        // Not enough price history to draw the line chart — fall back to text.
        await sendMessage(tk, cid, getPortfolioSummaryText(dbState));
      }
    } catch (e) {
      console.error('[Telegram Bot] Failed to render portfolio chart:', e);
      await sendMessage(tk, cid, getPortfolioSummaryText(dbState));
    }
    return;
  }
  if (t.startsWith('📅 חיובים')) {
    conv = { step: 'idle' };
    await sendUpcomingCharges(tk, cid);
    return;
  }
  if (t.startsWith('🔄 סנכרון')) {
    conv = { step: 'idle' };
    await runSyncCommand(tk, cid);
    return;
  }
  if (t.startsWith('💾 גיבוי')) {
    conv = { step: 'idle' };
    await sendBackupFile(tk, cid);
    return;
  }

  // ── Text commands ──────────────────────────────────────────────────────────
  if (t === '/start' || t === '/menu') {
    conv = { step: 'idle' };
    await sendMenu(tk, cid);
    return;
  }
  if (t === '/help') {
    conv = { step: 'idle' };
    await sendMessage(tk, cid,
      `❓ <b>עזרה — פינסטאר בוט</b>\n\n` +
      `/menu — תפריט (מקלדת)\n` +
      `/budget — תקציב החודש\n` +
      `/last — 5 הוצאות אחרונות\n` +
      `/pending — עסקאות ממתינות\n` +
      `/sync — סנכרון חשבונות בנק/אשראי\n` +
      `/backup — קובץ גיבוי JSON מלא\n` +
      `/find [מילה] — חיפוש\n` +
      `/cancel — בטל פעולה נוכחית\n\n` +
      `<b>הוספה מהירה:</b> <code>150 קפה גרג</code>\n\n` +
      `<b>שאלות:</b>\n` +
      `<i>כמה הוצאתי החודש?</i>\n` +
      `<i>כמה נשאר לי בקניות?</i>`
    );
    return;
  }
  if (t === '/cancel') {
    conv = { step: 'idle' };
    await sendMessage(tk, cid, '❌ הפעולה בוטלה.');
    await sendMenu(tk, cid);
    return;
  }
  if (t === '/budget') {
    conv = { step: 'idle' };
    await sendBudgetStatus(tk, cid);
    return;
  }
  if (t === '/last') {
    conv = { step: 'idle' };
    await sendLastTransactions(tk, cid);
    return;
  }
  if (t === '/pending') {
    conv = { step: 'idle' };
    await checkPendingTransactions(tk, cid, true);
    return;
  }
  if (t === '/sync') {
    conv = { step: 'idle' };
    await runSyncCommand(tk, cid);
    return;
  }
  if (t === '/backup') {
    conv = { step: 'idle' };
    await sendBackupFile(tk, cid);
    return;
  }
  if (t.startsWith('/find')) {
    conv = { step: 'idle' };
    const kw = t.slice(5).trim();
    if (!kw) {
      await sendMessage(tk, cid, '🔍 שלח <code>/find [מילה]</code> — למשל: <code>/find קפה</code>');
    } else {
      await sendFindResults(tk, cid, kw);
    }
    return;
  }

  // ── Wizard steps ───────────────────────────────────────────────────────────
  if (state.step === 'pending_select') {
    const num = Number(t);
    if (!Number.isInteger(num) || num < 1 || num > state.ids.length) {
      await sendMessage(tk, cid, `⚠️ שלח מספר בין 1 ל-${state.ids.length} (לפי התמונה), או /cancel לביטול`);
      return;
    }
    const txnId = state.ids[num - 1];
    conv = { step: 'idle' };
    const allTxns = getAllTransactions(dbState);
    const txn = allTxns.find((x) => x.id === txnId);
    if (!txn) {
      await sendMessage(tk, cid, '⚠️ העסקה כבר לא קיימת (אולי טופלה כבר). שלח /pending לרשימה מעודכנת.');
      return;
    }
    await sendPendingItemDetail(tk, cid, txn);
    return;
  }

  if (state.step === 'find') {
    conv = { step: 'idle' };
    await sendFindResults(tk, cid, t);
    return;
  }

  if (state.step === 'amount') {
    const amount = parseAmount(t);
    if (!amount) {
      await sendMessage(tk, cid, '⚠️ לא זיהיתי סכום. שלח מספר, למשל: <code>150</code>\n\n/cancel לביטול');
      return;
    }
    conv = { step: 'business', amount };
    await sendMessage(tk, cid, `💰 סכום: ₪${amount.toLocaleString('he-IL')}\n\n🏪 מה שם העסק?`);
    return;
  }

  if (state.step === 'business') {
    conv = { step: 'category', amount: state.amount, business: t };
    const btns = chunk(categories.map((c) => ({ text: c.name, callback_data: `cat:${c.name}` })), 3);
    await sendInlineKeyboard(tk, cid,
      `🏪 עסק: <b>${escHtml(t)}</b>\n💰 סכום: ₪${state.amount.toLocaleString('he-IL')}\n\n📂 בחר קטגוריה:`,
      btns,
    );
    return;
  }

  if (state.step === 'rec_amount') {
    const { recurringId, monthKey } = state;
    conv = { step: 'idle' };
    const amount = parseAmount(t);
    if (!amount) {
      await sendMessage(tk, cid, '⚠️ סכום לא תקין. /cancel לביטול');
      return;
    }
    const recIdx = recurring.findIndex((r) => r.id === recurringId);
    if (recIdx !== -1) {
      const rec = recurring[recIdx];
      const txnId = crypto.randomUUID();
      const dateStr = `${monthKey}-${String(rec.dayOfMonth).padStart(2, '0')}`;
      
      // Update state
      if (!dbState.transactions) dbState.transactions = [];
      dbState.transactions.push({
        id: txnId, date: dateStr, business: rec.name, amount, currency: 'ILS',
        category: rec.category, isRecurring: true, source: 'telegram',
        notes: 'אושר דרך טלגרם', pending: false, aiCategorized: false,
        recurringId, categoryOverride: undefined,
      });

      if (!rec.occurrenceOverrides) rec.occurrenceOverrides = {};
      rec.occurrenceOverrides[monthKey] = { amount, transactionId: txnId };
      writeDb(dbObj);

      await sendMessage(tk, cid, `✅ <b>נרשם!</b>\n${rec.name} — ₪${amount.toLocaleString('he-IL')}`);
    }
    await sendMenu(tk, cid);
    return;
  }

  if (state.step === 'edit_amount') {
    const { txnId } = state;
    conv = { step: 'idle' };
    const amount = parseAmount(t);
    if (!amount) {
      await sendMessage(tk, cid, '⚠️ סכום לא תקין. /cancel לביטול');
      return;
    }
    
    if (txnId.startsWith('virt-')) {
      const allTxns = getAllTransactions(dbState);
      const txn = allTxns.find(x => x.id === txnId);
      if (txn) {
        const monthKey = txnId.slice(-7);
        const recurringId = txnId.slice(5, -8);
        const realId = crypto.randomUUID();
        
        if (!dbState.transactions) dbState.transactions = [];
        dbState.transactions.push({ ...txn, id: realId, amount, isVirtual: false });
        
        const rec = recurring.find(r => r.id === recurringId);
        if (rec) {
          if (!rec.occurrenceOverrides) rec.occurrenceOverrides = {};
          rec.occurrenceOverrides[monthKey] = { amount, transactionId: realId };
        }
        writeDb(dbObj);
        await sendMessage(tk, cid, `✅ עודכן ונשמר: <b>${txn.business}</b> — ₪${amount.toLocaleString('he-IL')}`);
      }
    } else {
      const txnIdx = transactions.findIndex((x) => x.id === txnId);
      if (txnIdx !== -1) {
        const txn = transactions[txnIdx];
        transactions[txnIdx] = { ...txn, amount, pending: false };
        writeDb(dbObj);
        await sendMessage(tk, cid, `✅ עודכן: <b>${txn.business}</b> — ₪${amount.toLocaleString('he-IL')}`);
      }
    }
    await sendMenu(tk, cid);
    return;
  }

  // ── Idle: NLP + quick-add ──────────────────────────────────────────────────
  if (state.step === 'idle') {
    const lower = t.toLowerCase();

    // Budget / remaining
    if (/תקציב|budget/.test(lower) || /כמה נשאר/.test(t)) {
      const rem = t.match(/כמה נשאר (?:לי )?(?:ב)?(.+)/i);
      if (rem) {
        const catName = rem[1].trim();
        const cat = categories.find((c) => c.name.includes(catName));
        if (cat) {
          const mk = currentMonthKey();
          const spent = transactions.filter((x) => x.date.startsWith(mk) && x.category === cat.name && !x.pending).reduce((s, x) => s + x.amount, 0);
          const goal = goals.find((g) => g.category === cat.name);
          if (goal) {
            const left = goal.targetAmount - spent;
            await sendMessage(tk, cid,
              `💰 <b>${cat.name}</b>\n` +
              `הוצאה: ₪${Math.round(spent).toLocaleString('he-IL')}\n` +
              `תקציב: ₪${goal.targetAmount.toLocaleString('he-IL')}\n` +
              (left >= 0 ? `נשאר: ₪${Math.round(left).toLocaleString('he-IL')}` : `🔴 חריגה של ₪${Math.round(-left).toLocaleString('he-IL')}`)
            );
            return;
          }
        }
      }
      await sendBudgetStatus(tk, cid);
      return;
    }

    // Spending queries
    if (/כמה הוצאתי/.test(t)) {
      if (/היום/.test(t)) {
        const d = new Date().toISOString().slice(0, 10);
        const amt = transactions.filter((x) => x.date === d && !x.pending).reduce((s, x) => s + x.amount, 0);
        await sendMessage(tk, cid, `📅 היום הוצאת: ₪${Math.round(amt).toLocaleString('he-IL')}`);
        return;
      }
      if (/השבוע/.test(t)) {
        const now = new Date();
        const ws = new Date(now); ws.setDate(now.getDate() - now.getDay());
        const amt = transactions.filter((x) => x.date >= ws.toISOString().slice(0, 10) && !x.pending).reduce((s, x) => s + x.amount, 0);
        await sendMessage(tk, cid, `📅 השבוע הוצאת: ₪${Math.round(amt).toLocaleString('he-IL')}`);
        return;
      }
      const catM = t.match(/כמה הוצאתי (?:ה?חודש )?(?:ב|על) ?(.+)/i);
      if (catM) {
        const cat = categories.find((c) => c.name.includes(catM[1].trim()));
        if (cat) {
          const mk = currentMonthKey();
          const amt = transactions.filter((x) => x.date.startsWith(mk) && x.category === cat.name && !x.pending).reduce((s, x) => s + x.amount, 0);
          await sendMessage(tk, cid, `📂 החודש הוצאת ₪${Math.round(amt).toLocaleString('he-IL')} על <b>${cat.name}</b>`);
          return;
        }
      }
      const mk = currentMonthKey();
      const amt = transactions.filter((x) => x.date.startsWith(mk) && !x.pending).reduce((s, x) => s + x.amount, 0);
      await sendMessage(tk, cid, `📅 החודש הוצאת: ₪${Math.round(amt).toLocaleString('he-IL')}`);
      return;
    }

    if (/הוצאות אחרונות?/.test(lower)) {
      await sendLastTransactions(tk, cid);
      return;
    }

    const searchM = t.match(/^(?:חפש|מצא|חפשי|מצאי|search) (.+)/i);
    if (searchM) {
      await sendFindResults(tk, cid, searchM[1]);
      return;
    }

    // Quick-add: "150 קפה גרג"
    const qaMatch = t.replace(/^\/add\s*/i, '').match(/^(\d+(?:[.,]\d{1,2})?)\s+(.+)$/);
    if (qaMatch) {
      const amount = parseFloat(qaMatch[1].replace(',', '.'));
      const business = qaMatch[2].trim();
      const rule = categoryRules[business];
      const category = (rule && rule !== '__manual__') ? rule : 'אחר';
      const dateStr = new Date(msgDate * 1000).toISOString().slice(0, 10);
      
      if (!dbState.transactions) dbState.transactions = [];
      dbState.transactions.push({
        id: crypto.randomUUID(), date: dateStr, business, amount, currency: 'ILS',
        category, isRecurring: false, source: 'telegram',
        notes: '', pending: false, aiCategorized: false, categoryOverride: undefined,
      });
      writeDb(dbObj);

      await sendMessage(tk, cid,
        `✅ <b>נוסף!</b>\n🏪 ${escHtml(business)}\n💰 ₪${amount.toLocaleString('he-IL')}\n📂 ${escHtml(category)}`);
      
      const mk = currentMonthKey();
      const goal = goals.find((g) => g.category === category);
      if (goal) {
        const spent = transactions.filter((x) => x.date.startsWith(mk) && x.category === category && !x.pending).reduce((s, x) => s + x.amount, 0) + amount;
        await checkBudgetWarningForCat(tk, cid, category, spent, goal.targetAmount, mk);
      }
      return;
    }

    // Unknown
    await sendMessage(tk, cid,
      `לא הבנתי 🤔\n\n` +
      `שלח <code>150 קפה גרג</code> להוספה מהירה\n` +
      `שאל <i>"כמה הוצאתי החודש?"</i>`);
  }
}

async function handleCallback(queryId, data, msgId, tk, cid) {
  const dbObj = readDb();
  const dbState = dbObj.state || {};
  const recurring = dbState.recurring || [];
  const goals = dbState.goals || [];
  const transactions = dbState.transactions || [];

  if (data === 'last_txns') {
    await answerCallbackQuery(tk, queryId);
    await sendLastTransactions(tk, cid);
    return;
  }
  if (data === 'daily_ok') {
    await answerCallbackQuery(tk, queryId, '👍');
    return;
  }

  if (data.startsWith('txn_del:')) {
    const txnId = data.slice(8);
    const txn = transactions.find((x) => x.id === txnId);
    await answerCallbackQuery(tk, queryId);
    if (!txn) { await sendMessage(tk, cid, '⚠️ הוצאה לא נמצאה.'); return; }
    await sendInlineKeyboard(tk, cid,
      `🗑️ מחיקת הוצאה:\n<b>${txn.business}</b> — ₪${txn.amount.toLocaleString('he-IL')}\n\nבטוח?`,
      [[
        { text: '✅ כן, מחק', callback_data: `txn_del_ok:${txnId}` },
        { text: '❌ בטל',      callback_data: 'del_cancel' },
      ]],
    );
    return;
  }
  
  if (data.startsWith('txn_del_ok:')) {
    const txnId = data.slice(11);
    await answerCallbackQuery(tk, queryId, '🗑️ נמחק');
    const txn = deleteTransactionAndRegister(dbObj, txnId);
    if (msgId) await editMessageText(tk, cid, msgId, `🗑️ <b>${txn?.business ?? 'הוצאה'}</b> נמחקה`);
    return;
  }
  
  if (data === 'del_cancel') {
    await answerCallbackQuery(tk, queryId, '❌ בוטל');
    if (msgId) await editMessageText(tk, cid, msgId, '❌ המחיקה בוטלה');
    return;
  }

  if (data.startsWith('v_ok:')) {
    const txnId = data.slice(5);
    const allTxns = getAllTransactions(dbState);
    const txn = allTxns.find(t => t.id === txnId);
    await answerCallbackQuery(tk, queryId, txn ? '✅ אושר' : 'לא נמצא');
    if (txn) {
      const monthKey = txnId.slice(-7);
      const recurringId = txnId.slice(5, -8);
      const existing = transactions.find(
        (x) => !x.isVirtual && x.date === txn.date && x.business === txn.business && x.amount === txn.amount,
      );
      if (existing) {
        const idx = transactions.findIndex(t => t.id === existing.id);
        if (idx !== -1) {
          transactions[idx].recurringId = recurringId;
          transactions[idx].isRecurring = true;
        }
        const rec = recurring.find(r => r.id === recurringId);
        if (rec) {
          if (!rec.occurrenceOverrides) rec.occurrenceOverrides = {};
          rec.occurrenceOverrides[monthKey] = { ...rec.occurrenceOverrides[monthKey], transactionId: existing.id };
        }
      } else {
        const realId = crypto.randomUUID();
        if (!dbState.transactions) dbState.transactions = [];
        dbState.transactions.push({ ...txn, id: realId, isVirtual: false });
        
        const rec = recurring.find(r => r.id === recurringId);
        if (rec) {
          if (!rec.occurrenceOverrides) rec.occurrenceOverrides = {};
          rec.occurrenceOverrides[monthKey] = { ...rec.occurrenceOverrides[monthKey], transactionId: realId };
        }
      }
      writeDb(dbObj);
      if (msgId) await editMessageText(tk, cid, msgId,
        `✅ <b>${escHtml(txn.business)}</b> — ₪${txn.amount.toLocaleString('he-IL')} אושר`);
    }
    await sendMenu(tk, cid);
    return;
  }

  if (data.startsWith('v_edit:')) {
    const txnId = data.slice(7);
    const allTxns = getAllTransactions(dbState);
    const txn = allTxns.find(t => t.id === txnId);
    await answerCallbackQuery(tk, queryId);
    if (txn) {
      conv = { step: 'edit_amount', txnId };
      await sendMessage(tk, cid, `✏️ <b>${escHtml(txn.business)}</b> (חיוב קבוע)\nמה הסכום הנכון?\n\n/cancel לביטול`);
    }
    return;
  }

  if (data.startsWith('v_dismiss:')) {
    const txnId = data.slice(10);
    const allTxns = getAllTransactions(dbState);
    const txn = allTxns.find(t => t.id === txnId);
    await answerCallbackQuery(tk, queryId, txn ? '🗑️ הוסר' : 'לא נמצא');
    if (txn) {
      const monthKey = txnId.slice(-7);
      const recurringId = txnId.slice(5, -8);
      const rec = recurring.find(r => r.id === recurringId);
      if (rec) {
        if (!rec.occurrenceOverrides) rec.occurrenceOverrides = {};
        rec.occurrenceOverrides[monthKey] = { ...rec.occurrenceOverrides[monthKey], dismissed: true };
      }
      writeDb(dbObj);
      if (msgId) await editMessageText(tk, cid, msgId,
        `🗑️ <b>${escHtml(txn.business)}</b> הוסר מהממתינים`);
    }
    await sendMenu(tk, cid);
    return;
  }

  if (data.startsWith('txn_ok:')) {
    const txnId = data.slice(7);
    const txn = transactions.find((x) => x.id === txnId);
    await answerCallbackQuery(tk, queryId, txn ? '✅ אושר' : 'לא נמצא');
    if (txn) {
      const idx = transactions.findIndex(t => t.id === txnId);
      if (idx !== -1) transactions[idx].pending = false;
      writeDb(dbObj);
      if (msgId) await editMessageText(tk, cid, msgId,
        `✅ <b>${escHtml(txn.business)}</b> — ₪${txn.amount.toLocaleString('he-IL')} אושר`);
    }
    await sendMenu(tk, cid);
    return;
  }

  if (data.startsWith('txn_edit:')) {
    const txnId = data.slice(9);
    const txn = transactions.find((x) => x.id === txnId);
    await answerCallbackQuery(tk, queryId);
    if (txn) {
      conv = { step: 'edit_amount', txnId };
      await sendMessage(tk, cid, `✏️ <b>${escHtml(txn.business)}</b>\nמה הסכום הנכון?\n\n/cancel לביטול`);
    }
    return;
  }

  if (data.startsWith('txn_del_pend:')) {
    const txnId = data.slice(13);
    await answerCallbackQuery(tk, queryId, '🗑️ נמחק');
    const txn = deleteTransactionAndRegister(dbObj, txnId);
    if (msgId) await editMessageText(tk, cid, msgId, `🗑️ <b>${escHtml(txn?.business ?? 'הוצאה')}</b> נמחקה`);
    await sendMenu(tk, cid);
    return;
  }

  if (data.startsWith('cat:')) {
    const category = data.slice(4);
    const st = conv;
    if (st.step !== 'category') {
      await answerCallbackQuery(tk, queryId, 'הפעולה פגה — שלח /menu');
      return;
    }
    const { amount, business } = st;
    conv = { step: 'idle' };
    await answerCallbackQuery(tk, queryId, '✅ נשמר!');
    
    if (!dbState.transactions) dbState.transactions = [];
    dbState.transactions.push({
      id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), business, amount, currency: 'ILS',
      category, isRecurring: false, source: 'telegram',
      notes: '', pending: false, aiCategorized: false, categoryOverride: undefined,
    });
    writeDb(dbObj);

    if (msgId) await editMessageText(tk, cid, msgId,
      `✅ <b>נוסף!</b>\n🏪 ${escHtml(business)}\n💰 ₪${amount.toLocaleString('he-IL')}\n📂 ${escHtml(category)}`);
    
    const mk = currentMonthKey();
    const goal = goals.find((g) => g.category === category);
    if (goal) {
      const spent = transactions.filter((x) => x.date.startsWith(mk) && x.category === category && !x.pending).reduce((s, x) => s + x.amount, 0) + amount;
      await checkBudgetWarningForCat(tk, cid, category, spent, goal.targetAmount, mk);
    }
    await sendMenu(tk, cid);
    return;
  }

  if (data.startsWith('find_more:')) {
    await answerCallbackQuery(tk, queryId);
    const withoutPrefix = data.slice('find_more:'.length);
    const lastColon = withoutPrefix.lastIndexOf(':');
    const kw = withoutPrefix.slice(0, lastColon);
    const nextOff = parseInt(withoutPrefix.slice(lastColon + 1), 10) || 0;
    await sendFindResults(tk, cid, kw, nextOff);
    return;
  }

  // ── Recurring charge actions ──────────────────────────────────────────────
  const parts = data.split(':');
  const action = parts[0];
  const recId = parts[1];
  const monthKey = parts[2];
  const rec = recId ? recurring.find((r) => r.id === recId) : undefined;

  if (!rec) {
    await answerCallbackQuery(tk, queryId, '⚠️ החיוב לא נמצא');
    return;
  }

  if (action === 'rec_confirm') {
    const amount = parseFloat(parts[3]) || rec.amount;
    const txnId = crypto.randomUUID();
    const dateStr = `${monthKey}-${String(rec.dayOfMonth).padStart(2, '0')}`;
    await answerCallbackQuery(tk, queryId, '✅ נרשם!');
    
    if (!dbState.transactions) dbState.transactions = [];
    dbState.transactions.push({
      id: txnId, date: dateStr, business: rec.name, amount, currency: 'ILS',
      category: rec.category, isRecurring: true, source: 'telegram',
      notes: 'אושר דרך טלגרם', pending: false, aiCategorized: false,
      recurringId: recId, categoryOverride: undefined,
    });
    
    if (!rec.occurrenceOverrides) rec.occurrenceOverrides = {};
    rec.occurrenceOverrides[monthKey] = { amount, transactionId: txnId };
    writeDb(dbObj);

    if (msgId) await editMessageText(tk, cid, msgId,
      `✅ <b>${rec.name}</b> — ₪${amount.toLocaleString('he-IL')} נרשם`);
  } else if (action === 'rec_edit') {
    await answerCallbackQuery(tk, queryId);
    conv = { step: 'rec_amount', recurringId: recId, monthKey };
    await sendMessage(tk, cid, `✏️ <b>${rec.name}</b>\nמה הסכום שנגבה בפועל?\n\n/cancel לביטול`);
  } else if (action === 'rec_dismiss') {
    await answerCallbackQuery(tk, queryId, '🚫 נדחה');
    if (!rec.occurrenceOverrides) rec.occurrenceOverrides = {};
    rec.occurrenceOverrides[monthKey] = { dismissed: true };
    writeDb(dbObj);
    if (msgId) await editMessageText(tk, cid, msgId, `🚫 <b>${rec.name}</b> — סומן כ"לא בוצע"`);
  } else {
    await answerCallbackQuery(tk, queryId);
  }
}

// ── Background Scheduler Loop ────────────────────────────────────────────────

async function checkRecurring(tk, cid) {
  const dbObj = readDb();
  const dbState = dbObj.state || {};
  const recurring = dbState.recurring || [];
  
  const settingsObj = readSettings();
  if (!settingsObj.state?.notifyRecurringCharge) return;

  const today = new Date().getDate();
  const monthKey = currentMonthKey();

  for (const rec of recurring) {
    if (!rec.active) continue;
    const d = rec.dayOfMonth - today;
    if (d < 0 || d > 3) continue;
    const key = `${rec.id}:${monthKey}`;
    if (sentConfirmations.has(key)) continue;

    const ov = rec.occurrenceOverrides?.[monthKey];
    if (ov?.transactionId || ov?.dismissed) continue;
    sentConfirmations.add(key);

    const when = d === 0 ? 'היום' : d === 1 ? 'מחר' : `בעוד ${d} ימים`;
    await sendInlineKeyboard(tk, cid,
      `💳 <b>${escHtml(rec.name)}</b>\n\n₪${rec.amount.toLocaleString('he-IL')} — ${when}\n\nהאם החיוב בוצע?`,
      [[
        { text: `✅ כן — ₪${rec.amount}`, callback_data: `rec_confirm:${rec.id}:${monthKey}:${rec.amount}` },
        { text: '✏️ שנה סכום',             callback_data: `rec_edit:${rec.id}:${monthKey}` },
      ],
      [{ text: '🚫 לא בוצע / דחה', callback_data: `rec_dismiss:${rec.id}:${monthKey}` }]],
    );
  }
}

async function checkAllBudgetWarnings(tk, cid) {
  const dbObj = readDb();
  const dbState = dbObj.state || {};
  const transactions = dbState.transactions || [];
  const goals = dbState.goals || [];
  
  const settingsObj = readSettings();
  if (!settingsObj.state?.notifyBudgetOverrun || goals.length === 0) return;
  
  const mk = currentMonthKey();
  const catAmt = {};
  for (const t of transactions.filter((x) => x.date.startsWith(mk) && !x.pending)) {
    catAmt[t.category] = (catAmt[t.category] ?? 0) + t.amount;
  }
  for (const g of goals) {
    const spent = catAmt[g.category] ?? 0;
    if (spent > 0) await checkBudgetWarningForCat(tk, cid, g.category, spent, g.targetAmount, mk);
  }
}

async function checkDailySummary(tk, cid) {
  const settingsObj = readSettings();
  const s = settingsObj.state || {};
  if (!s.dailySummaryEnabled) return;
  
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const today = now.toISOString().slice(0, 10);
  
  if (hhmm !== s.dailySummaryTime || s.lastDailySummaryDate === today) return;
  
  settingsObj.state.lastDailySummaryDate = today;
  writeSettings(settingsObj);
  
  await sendDailySummary(tk, cid);
}

async function checkWeeklySummary(tk, cid) {
  const settingsObj = readSettings();
  const s = settingsObj.state || {};
  if (!s.weeklySummaryEnabled) return;
  
  const now = new Date();
  if (now.getDay() !== 0) return; // Sunday only
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (hhmm !== '09:00') return;
  
  const wk = weekKey(now);
  if (s.lastWeeklySummaryKey === wk) return;
  
  settingsObj.state.lastWeeklySummaryKey = wk;
  writeSettings(settingsObj);
  
  await sendWeeklySummary(tk, cid);
}

async function checkMonthlySummary(tk, cid) {
  const settingsObj = readSettings();
  const s = settingsObj.state || {};
  if (!s.monthlySummaryEnabled) return;
  
  const now = new Date();
  if (now.getDate() !== 1) return; // 1st of month only
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (hhmm !== '09:00') return;
  
  const mk = currentMonthKey();
  if (s.lastMonthlySummaryKey === mk) return;
  
  settingsObj.state.lastMonthlySummaryKey = mk;
  writeSettings(settingsObj);
  
  await sendMonthlySummary(tk, cid);
}

// ── Polling loops orchestration ──────────────────────────────────────────────

const POLL_MS = 5000;
const CHECK_MS = 60000;

async function pollNext() {
  if (!running) return;
  const settingsObj = readSettings();
  const s = settingsObj.state || {};
  const tk = s.telegramBotToken;
  const cid = s.telegramChatId;
  const pollingEnabled = s.telegramPollingEnabled;
  const lastTelegramUpdateId = s.lastTelegramUpdateId || 0;

  if (pollingEnabled && tk && cid) {
    try {
      await poll(tk, cid, lastTelegramUpdateId);
    } catch (e) {
      console.error('[Telegram Bot] Error during poll:', e);
    }
  }

  if (running) {
    pollTimeout = setTimeout(pollNext, POLL_MS);
  }
}

async function poll(token, chatId, lastUpdateId) {
  if (isPolling) return;
  isPolling = true;
  try {
    let updates = [];
    try {
      updates = await getUpdatesPolling(token, lastUpdateId + 1);
    } catch (err) {
      if (err.message === '401_UNAUTHORIZED') {
        console.error('[Telegram Bot] 401 Unauthorized. Stopping bot polling.');
        const settingsObj = readSettings();
        settingsObj.state.telegramPollingEnabled = false;
        writeSettings(settingsObj);
        return;
      }
    }

    if (!running || !updates.length) return;

    let maxId = lastUpdateId;
    for (const upd of updates) {
      if (upd.update_id > maxId) maxId = upd.update_id;
    }

    if (maxId > lastUpdateId) {
      const settingsObj = readSettings();
      settingsObj.state.lastTelegramUpdateId = maxId;
      writeSettings(settingsObj);
    }

    for (const upd of updates) {
      if (!running) break;

      if (upd.message?.text) {
        if (String(upd.message.chat.id).trim() !== String(chatId).trim()) continue;
        try {
          await handleText(upd.message.text, upd.message.date, token, chatId);
        } catch (e) {
          console.error('[Telegram Bot] Error in handleText:', e);
        }
      } else if (upd.callback_query?.data) {
        const cbChatId = String(upd.callback_query.message?.chat.id ?? upd.callback_query.from.id).trim();
        if (cbChatId !== String(chatId).trim()) {
          await answerCallbackQuery(token, upd.callback_query.id).catch(() => {});
          continue;
        }
        const qid = upd.callback_query.id;
        try {
          await handleCallback(qid, upd.callback_query.data, upd.callback_query.message?.message_id, token, chatId);
        } catch (e) {
          console.error('[Telegram Bot] Error in handleCallback:', e);
          await answerCallbackQuery(token, qid, '⚠️ שגיאה').catch(() => {});
        }
      }
    }
  } finally {
    isPolling = false;
  }
}

async function scheduled() {
  if (!running) return;
  const settingsObj = readSettings();
  const s = settingsObj.state || {};
  const tk = s.telegramBotToken;
  const cid = s.telegramChatId;
  if (!tk || !cid) return;

  try {
    await checkRecurring(tk, cid);
    await checkAllBudgetWarnings(tk, cid);
    await checkDailySummary(tk, cid);
    await checkWeeklySummary(tk, cid);
    await checkMonthlySummary(tk, cid);
  } catch (e) {
    console.error('[Telegram Bot] Error in scheduler loop:', e);
  }
}

export async function startTelegramBot() {
  if (running) return;
  running = true;

  console.log('[Telegram Bot] Initializing backend Telegram Bot service...');

  const settingsObj = readSettings();
  const s = settingsObj.state || {};
  const tk = s.telegramBotToken;
  const cid = s.telegramChatId;
  const pollingEnabled = s.telegramPollingEnabled;

  if (!pollingEnabled || !tk || !cid) {
    console.log('[Telegram Bot] Polling is disabled or missing credentials. Bot is waiting.');
    // Start the outer checks anyway, it will loop and look at settings file changes
    pollTimeout = setTimeout(pollNext, POLL_MS);
    scheduledTimer = setInterval(scheduled, CHECK_MS);
    return;
  }

  try {
    const testRes = await testBot(tk);
    if (!testRes.ok) {
      if (testRes.invalid) {
        console.error('[Telegram Bot] Connection error: Token is invalid (401). Disabling polling in settings.');
        settingsObj.state.telegramPollingEnabled = false;
        writeSettings(settingsObj);
      } else {
        // Transient — e.g. network not up yet right after container start. Don't
        // disable polling; the poll loop below will keep retrying every 5s and
        // recover on its own once Telegram is reachable.
        console.warn('[Telegram Bot] Could not reach Telegram at startup — will keep retrying.');
      }
      pollTimeout = setTimeout(pollNext, POLL_MS);
      scheduledTimer = setInterval(scheduled, CHECK_MS);
      return;
    }

    console.log('[Telegram Bot] 🤖 Finstar Backend Bot connected!');
    await sendMessage(tk, cid, '🤖 <b>שרת פינסטאר מחובר ופעיל ברקע!</b>');
    await sendMenu(tk, cid);

    pollTimeout = setTimeout(pollNext, POLL_MS);
    scheduledTimer = setInterval(scheduled, CHECK_MS);

    // Run initial checks
    await checkRecurring(tk, cid);
    await checkPendingTransactions(tk, cid);
  } catch (e) {
    console.error('[Telegram Bot] Startup failed:', e);
    pollTimeout = setTimeout(pollNext, POLL_MS);
    scheduledTimer = setInterval(scheduled, CHECK_MS);
  }
}

export function stopTelegramBot() {
  if (!running) return;
  running = false;
  clearTimeout(pollTimeout);
  clearInterval(scheduledTimer);
  console.log('[Telegram Bot] Backend Telegram Bot service stopped.');
}
