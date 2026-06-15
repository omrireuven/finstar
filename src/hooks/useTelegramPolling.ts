/**
 * Telegram two-way bot — live-ref state machine.
 *
 * Main menu  ──  Reply Keyboard (persistent, no callbacks, much more reliable)
 * Wizards    ──  Inline keyboard for category picker, confirmations, etc.
 *
 * Features
 * ─────────
 * /menu /budget /last /pending /find [kw] /help /cancel
 * Quick-add:  "150 קפה גרג"
 * Wizard:     amount → business → category
 * NLP:        "כמה הוצאתי החודש?" / "כמה נשאר לי בקניות?"
 * Auto alerts: recurring charges · pending approvals · budget warnings
 * Auto digests: daily · weekly · monthly
 *
 * Poll: 5 s   |   Scheduled checks: every 60 s
 */
import { useEffect, useRef } from 'react';
import { useStore, usePortfolioSummary } from '../store';
import { useSettings } from '../store/settingsStore';
import {
  getUpdatesPolling, sendMessage, sendReplyKeyboard, sendInlineKeyboard,
  answerCallbackQuery, editMessageText, sendPhoto,
} from '../lib/telegram';
import { capturePortfolioChart } from '../utils/capturePortfolioChart';
import { nanoid } from '../utils/nanoid';
import { currentMonthKey } from '../utils/format';

const POLL_MS  = 5_000;
const CHECK_MS = 60_000;

// ── Types ────────────────────────────────────────────────────────────────────

type ConvStep =
  | { step: 'idle' }
  | { step: 'find' }
  | { step: 'amount' }
  | { step: 'business'; amount: number }
  | { step: 'category'; amount: number; business: string }
  | { step: 'rec_amount'; recurringId: string; monthKey: string }
  | { step: 'edit_amount'; txnId: string };

// ── Module helpers ───────────────────────────────────────────────────────────

/** Escape HTML special characters in user-provided strings for Telegram HTML parse_mode. */
function escHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function parseAmount(s: string): number | null {
  const n = parseFloat(s.trim().replace(',', '.'));
  return isNaN(n) || n <= 0 ? null : n;
}

function progressBar(pct: number, len = 10): string {
  const filled = Math.min(Math.round((pct / 100) * len), len);
  return '▓'.repeat(filled) + '░'.repeat(len - filled);
}

function weekKey(d: Date = new Date()): string {
  const y     = d.getFullYear();
  const start = new Date(y, 0, 1);
  const week  = Math.ceil(((d.getTime() - start.getTime()) / 86_400_000 + start.getDay() + 1) / 7);
  return `${y}-W${String(week).padStart(2, '0')}`;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useTelegramPolling() {

  const store        = useStore();
  const portfolioRef = usePortfolioSummary();
  const settings     = useSettings();

  // handleText / handleCallback are stored here so poll() always calls
  // the latest version — avoids stale-closure bugs after HMR or re-renders.
  const liveRef = useRef({
    store, portfolioRef, settings,
    conv:               { step: 'idle' } as ConvStep,
    sentConfirmations:  new Set<string>(),
    sentPendingAlerts:  new Set<string>(),
    sentBudgetWarnings: new Set<string>(),
    // updated below after every function definition
    handleText:     null as null | ((text: string, date: number, tk: string, cid: string) => Promise<void>),
    handleCallback: null as null | ((qid: string, data: string, msgId: number | undefined, tk: string, cid: string) => Promise<void>),
  });

  liveRef.current.store        = store;
  liveRef.current.portfolioRef = portfolioRef;
  liveRef.current.settings     = settings;

  // ── sendMenu — uses Reply Keyboard (no callbacks, persists at bottom) ──────

  async function sendMenu(tk: string, cid: string) {
    const { store: { recurring, transactions } } = liveRef.current;
    const today   = new Date().getDate();
    const upcoming = recurring.filter((r) => {
      if (!r.active) return false;
      const d = r.dayOfMonth - today;
      return d >= 0 && d <= 7;
    }).length;
    const pend = transactions.filter((t) => t.pending && !t.isVirtual).length;

    await sendReplyKeyboard(tk, cid,
      '🤖 בחר פעולה:',
      [
        ['➕ הוסף הוצאה',          '💰 תקציב החודש'],
        ['📋 הוצאות אחרונות',      `✅ ממתינות${pend > 0 ? ` (${pend})` : ''}`],
        ['🔍 חיפוש',               `📅 חיובים קרובים${upcoming > 0 ? ` (${upcoming})` : ''}`],
        ['📊 סיכום תיק מניות'],
      ],
    );
  }

  // ── sendPortfolioChart ────────────────────────────────────────────────────

  async function sendPortfolioChart(tk: string, cid: string) {
    const { store: { lots, usdIls }, portfolioRef: { rows }, settings: { corsProxy } } = liveRef.current;
    // Fire-and-forget: don't await so chart capture starts immediately in parallel
    sendMessage(tk, cid, '⏳ מכין תמונת גרף...');
    try {
      const blob = await capturePortfolioChart(lots, usdIls, corsProxy, rows);
      await sendPhoto(tk, cid, blob, `📊 סיכום תיק — ${new Date().toLocaleDateString('he-IL')}`);
    } catch {
      await sendMessage(tk, cid, '⚠️ לא ניתן לייצר גרף כרגע. ודא שיש מניות בתיק.');
    }
  }

  // ── sendUpcomingCharges ───────────────────────────────────────────────────

  async function sendUpcomingCharges(tk: string, cid: string) {
    const { store: { recurring } } = liveRef.current;
    const today    = new Date().getDate();
    const upcoming = recurring
      .filter((r) => r.active && r.dayOfMonth >= today && r.dayOfMonth <= today + 7)
      .sort((a, b) => a.dayOfMonth - b.dayOfMonth);
    if (upcoming.length === 0) {
      await sendMessage(tk, cid, '✅ אין חיובים קרובים ב-7 הימים הקרובים.');
    } else {
      const lines = upcoming.map((r) => {
        const d    = r.dayOfMonth - today;
        const when = d === 0 ? 'היום' : d === 1 ? 'מחר' : `בעוד ${d} ימים`;
        return `💳 <b>${r.name}</b> — ₪${r.amount.toLocaleString('he-IL')} (${when})`;
      }).join('\n');
      await sendMessage(tk, cid, `📋 <b>חיובים קרובים</b>\n\n${lines}`);
    }
  }

  // ── sendBudgetStatus ──────────────────────────────────────────────────────

  async function sendBudgetStatus(tk: string, cid: string) {
    const { store: { transactions, goals, categories } } = liveRef.current;
    const mk        = currentMonthKey();
    const monthName = new Date().toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });

    const monthTxns = transactions.filter((t) => t.date.startsWith(mk) && !t.pending);
    const catAmt: Record<string, number> = {};
    for (const t of monthTxns) catAmt[t.category] = (catAmt[t.category] ?? 0) + t.amount;

    const total = monthTxns.reduce((s, t) => s + t.amount, 0);

    const withBudget = goals
      .filter((g) => (catAmt[g.category] ?? 0) > 0 || g.targetAmount > 0)
      .sort((a, b) => {
        const pa = a.targetAmount > 0 ? (catAmt[a.category] ?? 0) / a.targetAmount : 0;
        const pb = b.targetAmount > 0 ? (catAmt[b.category] ?? 0) / b.targetAmount : 0;
        return pb - pa;
      });

    const budgetLines = withBudget.map((g) => {
      const spent = catAmt[g.category] ?? 0;
      const pct   = g.targetAmount > 0 ? (spent / g.targetAmount) * 100 : 0;
      const flag  = pct >= 100 ? ' 🔴' : pct >= 80 ? ' ⚠️' : '';
      return `${progressBar(pct)}  <b>${g.category}</b>  ₪${Math.round(spent).toLocaleString('he-IL')} / ₪${g.targetAmount.toLocaleString('he-IL')} (${Math.round(pct)}%)${flag}`;
    }).join('\n');

    const noBudget = categories
      .filter((c) => catAmt[c.name] && !goals.find((g) => g.category === c.name))
      .map((c) => `${c.name} ₪${Math.round(catAmt[c.name]).toLocaleString('he-IL')}`)
      .join(' • ');

    let msg = `💰 <b>תקציב — ${monthName}</b>\n\n${budgetLines || '—'}`;
    if (noBudget) msg += `\n\n<i>ללא תקציב:</i> ${noBudget}`;
    msg += `\n\n💳 <b>סה"כ החודש:</b> ₪${Math.round(total).toLocaleString('he-IL')}`;

    await sendMessage(tk, cid, msg);
  }

  // ── sendLastTransactions ──────────────────────────────────────────────────

  async function sendLastTransactions(tk: string, cid: string, count = 5) {
    const { store: { transactions } } = liveRef.current;
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
      const d   = new Date(t.date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
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

  // ── sendFindResults ───────────────────────────────────────────────────────

  const FIND_PAGE = 10;

  async function sendFindResults(tk: string, cid: string, keyword: string, offset = 0) {
    const { store: { transactions } } = liveRef.current;
    const kw  = keyword.toLowerCase();
    const all = transactions
      .filter((t) => t.business.toLowerCase().includes(kw) || t.category.toLowerCase().includes(kw))
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));

    if (all.length === 0) {
      await sendMessage(tk, cid, `🔍 לא נמצאו תוצאות עבור "<b>${escHtml(keyword)}</b>"`);
      return;
    }

    const page    = all.slice(offset, offset + FIND_PAGE);
    const hasMore = offset + FIND_PAGE < all.length;

    // Cumulative: sum & count of everything shown so far (not the full dataset)
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
    const text   = `${header}\n\n${lines}${footer}`;

    if (hasMore) {
      // Telegram callback_data limit: 64 bytes. Hebrew = 2 bytes/char → cap keyword at 20 chars.
      const safeKw  = keyword.slice(0, 20);
      const nextOff = offset + FIND_PAGE;
      const remaining = all.length - nextOff;
      await sendInlineKeyboard(tk, cid, text, [[
        { text: `📄 הצג עוד (${remaining} נוספות)`, callback_data: `find_more:${safeKw}:${nextOff}` },
      ]]);
    } else {
      await sendMessage(tk, cid, text);
    }
  }

  // ── sendDailySummary ──────────────────────────────────────────────────────

  async function sendDailySummary(tk: string, cid: string) {
    const { store: { transactions } } = liveRef.current;
    const today   = new Date().toISOString().slice(0, 10);
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

    const byCat: Record<string, number> = {};
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

  // ── sendWeeklySummary ─────────────────────────────────────────────────────

  async function sendWeeklySummary(tk: string, cid: string) {
    const { store: { transactions } } = liveRef.current;
    const now       = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const ws  = weekStart.toISOString().slice(0, 10);
    const we  = now.toISOString().slice(0, 10);
    const txns = transactions.filter((t) => t.date >= ws && t.date <= we && !t.pending && !t.isVirtual);
    const wFrom = weekStart.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
    const wTo   = now.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });

    if (txns.length === 0) {
      await sendMessage(tk, cid, `📊 <b>סיכום שבוע — ${wFrom}–${wTo}</b>\n\nלא נרשמו הוצאות השבוע.`);
      return;
    }

    const total  = txns.reduce((s, t) => s + t.amount, 0);
    const byCat: Record<string, number> = {};
    for (const t of txns) byCat[t.category] = (byCat[t.category] ?? 0) + t.amount;

    const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const maxAmt = sorted[0]?.[1] ?? 1;
    const lines  = sorted.map(([cat, amt]) =>
      `${progressBar((amt / maxAmt) * 100, 8)}  <b>${cat}</b>  ₪${Math.round(amt).toLocaleString('he-IL')}`
    ).join('\n');

    await sendMessage(tk, cid,
      `📊 <b>סיכום שבוע — ${wFrom}–${wTo}</b>\n\n${lines}\n\n💳 <b>סה"כ: ₪${Math.round(total).toLocaleString('he-IL')}</b>  (${txns.length} עסקאות)`,
    );
  }

  // ── sendMonthlySummary ────────────────────────────────────────────────────

  async function sendMonthlySummary(tk: string, cid: string) {
    const { store: { transactions, goals } } = liveRef.current;
    const prev      = new Date();
    prev.setDate(0); // last day of previous month
    const mk        = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    const monthName = prev.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });

    const txns = transactions.filter((t) => t.date.startsWith(mk) && !t.pending && !t.isVirtual);

    if (txns.length === 0) {
      await sendMessage(tk, cid, `📊 <b>סיכום חודש — ${monthName}</b>\n\nלא נרשמו הוצאות.`);
      return;
    }

    const total  = txns.reduce((s, t) => s + t.amount, 0);
    const byCat: Record<string, number> = {};
    for (const t of txns) byCat[t.category] = (byCat[t.category] ?? 0) + t.amount;

    const lines = Object.entries(byCat)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([cat, amt]) => {
        const goal = goals.find((g) => g.category === cat);
        const pct  = goal ? `  (${Math.round((amt / goal.targetAmount) * 100)}% מהתקציב)` : '';
        return `  <b>${cat}</b>: ₪${Math.round(amt).toLocaleString('he-IL')}${pct}`;
      })
      .join('\n');

    await sendMessage(tk, cid,
      `📊 <b>סיכום חודש — ${monthName}</b>\n\n${lines}\n\n💳 <b>סה"כ: ₪${Math.round(total).toLocaleString('he-IL')}</b>  (${txns.length} עסקאות)`,
    );
  }

  // ── Budget warning for one category ──────────────────────────────────────

  async function checkBudgetWarningForCat(tk: string, cid: string, cat: string, spent: number, budget: number, mk: string) {
    const { sentBudgetWarnings, settings: { notifyBudgetOverrun } } = liveRef.current;
    if (!notifyBudgetOverrun) return;
    const pct  = (spent / budget) * 100;
    const k80  = `${mk}:${cat}:80`;
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

  // ── handleText ────────────────────────────────────────────────────────────

  async function handleText(text: string, msgDate: number, tk: string, cid: string) {
    const {
      store: { recurring, categories, categoryRules, goals, transactions,
               addTransactions, setRecurringOccurrence, updateTransaction },
    } = liveRef.current;
    const t     = text.trim();
    const state = liveRef.current.conv;

    // ── Reply Keyboard button presses (matched by emoji prefix) ──────────
    // These arrive as plain text messages — no callbacks involved.
    if (t.startsWith('➕')) {
      liveRef.current.conv = { step: 'amount' };
      await sendMessage(tk, cid, '💰 כמה שילמת?\nשלח סכום, למשל: <code>150</code>\n\n/cancel לביטול');
      return;
    }
    if (t.startsWith('💰 תקציב')) {
      liveRef.current.conv = { step: 'idle' };
      await sendBudgetStatus(tk, cid);
      return;
    }
    if (t.startsWith('📋 הוצאות')) {
      liveRef.current.conv = { step: 'idle' };
      await sendLastTransactions(tk, cid);
      return;
    }
    if (t.includes('ממתינות')) {
      liveRef.current.conv = { step: 'idle' };
      try {
        const pendNow = (liveRef.current.store?.transactions ?? []).filter(
          (x) => x.pending && !x.isVirtual
        );
        if (pendNow.length === 0) {
          await sendMessage(tk, cid, '✅ אין עסקאות ממתינות לאישור.');
        } else {
          await sendMessage(tk, cid, `⏳ נמצאו ${pendNow.length} עסקאות ממתינות:`);
          await checkPendingTransactions(tk, cid, true);
        }
        await sendMenu(tk, cid);
      } catch (err) {
        await sendMessage(tk, cid, `⚠️ שגיאה בטעינת ממתינות: ${String(err).slice(0, 80)}`);
      }
      return;
    }
    if (t.startsWith('🔍 חיפוש') || t === '🔍') {
      liveRef.current.conv = { step: 'find' };
      await sendMessage(tk, cid, '🔍 מה לחפש? שלח מילה (שם עסק או קטגוריה):\n\n/cancel לביטול');
      return;
    }
    if (t.startsWith('📊 סיכום תיק')) {
      liveRef.current.conv = { step: 'idle' };
      await sendPortfolioChart(tk, cid);
      return;
    }
    if (t.startsWith('📅 חיובים')) {
      liveRef.current.conv = { step: 'idle' };
      await sendUpcomingCharges(tk, cid);
      return;
    }

    // ── Text commands ─────────────────────────────────────────────────────
    if (t === '/start' || t === '/menu') {
      liveRef.current.conv = { step: 'idle' };
      await sendMenu(tk, cid);
      return;
    }
    if (t === '/help') {
      liveRef.current.conv = { step: 'idle' };
      await sendMessage(tk, cid,
        `❓ <b>עזרה — פינסטאר בוט</b>\n\n` +
        `/menu — תפריט (מקלדת)\n` +
        `/budget — תקציב החודש\n` +
        `/last — 5 הוצאות אחרונות\n` +
        `/pending — עסקאות ממתינות\n` +
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
      liveRef.current.conv = { step: 'idle' };
      await sendMessage(tk, cid, '❌ הפעולה בוטלה.');
      await sendMenu(tk, cid);
      return;
    }
    if (t === '/budget') {
      liveRef.current.conv = { step: 'idle' };
      await sendBudgetStatus(tk, cid);
      return;
    }
    if (t === '/last') {
      liveRef.current.conv = { step: 'idle' };
      await sendLastTransactions(tk, cid);
      return;
    }
    if (t === '/pending') {
      liveRef.current.conv = { step: 'idle' };
      await checkPendingTransactions(tk, cid, true);
      return;
    }
    if (t.startsWith('/find')) {
      liveRef.current.conv = { step: 'idle' };
      const kw = t.slice(5).trim();
      if (!kw) {
        await sendMessage(tk, cid, '🔍 שלח <code>/find [מילה]</code> — למשל: <code>/find קפה</code>');
      } else {
        await sendFindResults(tk, cid, kw);
      }
      return;
    }

    // ── Wizard steps ──────────────────────────────────────────────────────

    if (state.step === 'find') {
      liveRef.current.conv = { step: 'idle' };
      await sendFindResults(tk, cid, t);
      return;
    }

    if (state.step === 'amount') {
      const amount = parseAmount(t);
      if (!amount) {
        await sendMessage(tk, cid, '⚠️ לא זיהיתי סכום. שלח מספר, למשל: <code>150</code>\n\n/cancel לביטול');
        return;
      }
      liveRef.current.conv = { step: 'business', amount };
      await sendMessage(tk, cid, `💰 סכום: ₪${amount.toLocaleString('he-IL')}\n\n🏪 מה שם העסק?`);
      return;
    }

    if (state.step === 'business') {
      liveRef.current.conv = { step: 'category', amount: state.amount, business: t };
      const btns = chunk(categories.map((c) => ({ text: c.name, callback_data: `cat:${c.name}` })), 3);
      await sendInlineKeyboard(tk, cid,
        `🏪 עסק: <b>${escHtml(t)}</b>\n💰 סכום: ₪${state.amount.toLocaleString('he-IL')}\n\n📂 בחר קטגוריה:`,
        btns,
      );
      return;
    }

    if (state.step === 'rec_amount') {
      const { recurringId, monthKey } = state;
      liveRef.current.conv = { step: 'idle' };
      const amount = parseAmount(t);
      if (!amount) {
        await sendMessage(tk, cid, '⚠️ סכום לא תקין. /cancel לביטול');
        return;
      }
      const rec = recurring.find((r) => r.id === recurringId);
      if (rec) {
        const txnId  = nanoid();
        const dateStr = `${monthKey}-${String(rec.dayOfMonth).padStart(2, '0')}`;
        addTransactions([{
          id: txnId, date: dateStr, business: rec.name, amount, currency: 'ILS',
          category: rec.category, isRecurring: true, source: 'telegram',
          notes: 'אושר דרך טלגרם', pending: false, aiCategorized: false,
          recurringId, categoryOverride: undefined,
        }]);
        setRecurringOccurrence(recurringId, monthKey, { amount, transactionId: txnId });
        await sendMessage(tk, cid, `✅ <b>נרשם!</b>\n${rec.name} — ₪${amount.toLocaleString('he-IL')}`);
      }
      await sendMenu(tk, cid);
      return;
    }

    if (state.step === 'edit_amount') {
      const { txnId } = state;
      liveRef.current.conv = { step: 'idle' };
      const amount = parseAmount(t);
      if (!amount) {
        await sendMessage(tk, cid, '⚠️ סכום לא תקין. /cancel לביטול');
        return;
      }
      const txn = transactions.find((x) => x.id === txnId);
      if (txn) {
        updateTransaction(txnId, { amount, pending: false });
        await sendMessage(tk, cid, `✅ עודכן: <b>${txn.business}</b> — ₪${amount.toLocaleString('he-IL')}`);
      }
      await sendMenu(tk, cid);
      return;
    }

    // ── Idle: NLP + quick-add ─────────────────────────────────────────────
    if (state.step === 'idle') {
      const lower = t.toLowerCase();

      // Budget / remaining
      if (/תקציב|budget/.test(lower) || /כמה נשאר/.test(t)) {
        const rem = t.match(/כמה נשאר (?:לי )?(?:ב)?(.+)/i);
        if (rem) {
          const catName = rem[1].trim();
          const cat = categories.find((c) => c.name.includes(catName));
          if (cat) {
            const mk    = currentMonthKey();
            const spent = transactions.filter((x) => x.date.startsWith(mk) && x.category === cat.name && !x.pending).reduce((s, x) => s + x.amount, 0);
            const goal  = goals.find((g) => g.category === cat.name);
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
          const d   = new Date().toISOString().slice(0, 10);
          const amt = transactions.filter((x) => x.date === d && !x.pending).reduce((s, x) => s + x.amount, 0);
          await sendMessage(tk, cid, `📅 היום הוצאת: ₪${Math.round(amt).toLocaleString('he-IL')}`);
          return;
        }
        if (/השבוע/.test(t)) {
          const now = new Date();
          const ws  = new Date(now); ws.setDate(now.getDate() - now.getDay());
          const amt = transactions.filter((x) => x.date >= ws.toISOString().slice(0, 10) && !x.pending).reduce((s, x) => s + x.amount, 0);
          await sendMessage(tk, cid, `📅 השבוע הוצאת: ₪${Math.round(amt).toLocaleString('he-IL')}`);
          return;
        }
        const catM = t.match(/כמה הוצאתי (?:ה?חודש )?(?:ב|על) ?(.+)/i);
        if (catM) {
          const cat = categories.find((c) => c.name.includes(catM[1].trim()));
          if (cat) {
            const mk  = currentMonthKey();
            const amt = transactions.filter((x) => x.date.startsWith(mk) && x.category === cat.name && !x.pending).reduce((s, x) => s + x.amount, 0);
            await sendMessage(tk, cid, `📂 החודש הוצאת ₪${Math.round(amt).toLocaleString('he-IL')} על <b>${cat.name}</b>`);
            return;
          }
        }
        const mk  = currentMonthKey();
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
        const amount   = parseFloat(qaMatch[1].replace(',', '.'));
        const business = qaMatch[2].trim();
        const rule     = categoryRules[business];
        const category = (rule && rule !== '__manual__') ? rule : 'אחר';
        const dateStr  = new Date(msgDate * 1000).toISOString().slice(0, 10);
        addTransactions([{
          id: nanoid(), date: dateStr, business, amount, currency: 'ILS',
          category, isRecurring: false, source: 'telegram',
          notes: '', pending: false, aiCategorized: false, categoryOverride: undefined,
        }]);
        await sendMessage(tk, cid,
          `✅ <b>נוסף!</b>\n🏪 ${escHtml(business)}\n💰 ₪${amount.toLocaleString('he-IL')}\n📂 ${escHtml(category)}`);
        const mk   = currentMonthKey();
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

  // ── handleCallback — always call answerCallbackQuery before any await ─────
  // (Called only for inline keyboard buttons — wizard/confirmations/delete)

  async function handleCallback(queryId: string, data: string, msgId: number | undefined, tk: string, cid: string) {
    const {
      store: { recurring, lots, usdIls, goals, transactions,
               addTransactions, setRecurringOccurrence,
               updateTransaction, deleteTransaction },
      portfolioRef: { rows },
      settings: { corsProxy },
    } = liveRef.current;

    // ── Inline callbacks from daily summary ──────────────────────────────
    if (data === 'last_txns') {
      await answerCallbackQuery(tk, queryId);
      await sendLastTransactions(tk, cid);
      return;
    }
    if (data === 'daily_ok') {
      await answerCallbackQuery(tk, queryId, '👍');
      return;
    }

    // ── Transaction delete ────────────────────────────────────────────────
    if (data.startsWith('txn_del:')) {
      const txnId = data.slice(8);
      const txn   = transactions.find((x) => x.id === txnId);
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
      const txn   = transactions.find((x) => x.id === txnId);
      await answerCallbackQuery(tk, queryId, '🗑️ נמחק');
      deleteTransaction(txnId);
      if (msgId) await editMessageText(tk, cid, msgId, `🗑️ <b>${txn?.business ?? 'הוצאה'}</b> נמחקה`);
      return;
    }
    if (data === 'del_cancel') {
      await answerCallbackQuery(tk, queryId, '❌ בוטל');
      if (msgId) await editMessageText(tk, cid, msgId, '❌ המחיקה בוטלה');
      return;
    }

    // ── Pending transaction actions ───────────────────────────────────────
    if (data.startsWith('txn_ok:')) {
      const txnId = data.slice(7);
      const txn   = transactions.find((x) => x.id === txnId);
      await answerCallbackQuery(tk, queryId, txn ? '✅ אושר' : 'לא נמצא');
      if (txn) {
        updateTransaction(txnId, { pending: false });
        if (msgId) await editMessageText(tk, cid, msgId,
          `✅ <b>${escHtml(txn.business)}</b> — ₪${txn.amount.toLocaleString('he-IL')} אושר`);
      }
      await sendMenu(tk, cid);   // refresh pending count in keyboard
      return;
    }
    if (data.startsWith('txn_edit:')) {
      const txnId = data.slice(9);
      const txn   = transactions.find((x) => x.id === txnId);
      await answerCallbackQuery(tk, queryId);
      if (txn) {
        liveRef.current.conv = { step: 'edit_amount', txnId };
        await sendMessage(tk, cid, `✏️ <b>${escHtml(txn.business)}</b>\nמה הסכום הנכון?\n\n/cancel לביטול`);
      }
      return;
    }
    if (data.startsWith('txn_del_pend:')) {
      const txnId = data.slice(13);
      const txn   = transactions.find((x) => x.id === txnId);
      await answerCallbackQuery(tk, queryId, '🗑️ נמחק');
      deleteTransaction(txnId);
      if (msgId) await editMessageText(tk, cid, msgId, `🗑️ <b>${escHtml(txn?.business ?? 'הוצאה')}</b> נמחקה`);
      await sendMenu(tk, cid);   // refresh pending count in keyboard
      return;
    }

    // ── Category selection (wizard) ───────────────────────────────────────
    if (data.startsWith('cat:')) {
      const category = data.slice(4);
      const st       = liveRef.current.conv;
      if (st.step !== 'category') {
        await answerCallbackQuery(tk, queryId, 'הפעולה פגה — שלח /menu');
        return;
      }
      const { amount, business } = st;
      liveRef.current.conv = { step: 'idle' };
      await answerCallbackQuery(tk, queryId, '✅ נשמר!');
      addTransactions([{
        id: nanoid(), date: new Date().toISOString().slice(0, 10), business, amount, currency: 'ILS',
        category, isRecurring: false, source: 'telegram',
        notes: '', pending: false, aiCategorized: false, categoryOverride: undefined,
      }]);
      if (msgId) await editMessageText(tk, cid, msgId,
        `✅ <b>נוסף!</b>\n🏪 ${escHtml(business)}\n💰 ₪${amount.toLocaleString('he-IL')}\n📂 ${escHtml(category)}`);
      const mk   = currentMonthKey();
      const goal = goals.find((g) => g.category === category);
      if (goal) {
        const spent = transactions.filter((x) => x.date.startsWith(mk) && x.category === category && !x.pending).reduce((s, x) => s + x.amount, 0) + amount;
        await checkBudgetWarningForCat(tk, cid, category, spent, goal.targetAmount, mk);
      }
      await sendMenu(tk, cid);
      return;
    }

    // ── Find pagination ───────────────────────────────────────────────────
    if (data.startsWith('find_more:')) {
      await answerCallbackQuery(tk, queryId);
      // Format: "find_more:KEYWORD:OFFSET"
      // keyword may contain colons so split only at the last ':'
      const withoutPrefix = data.slice('find_more:'.length);          // "KEYWORD:OFFSET"
      const lastColon     = withoutPrefix.lastIndexOf(':');
      const kw            = withoutPrefix.slice(0, lastColon);
      const nextOff       = parseInt(withoutPrefix.slice(lastColon + 1), 10) || 0;
      await sendFindResults(tk, cid, kw, nextOff);
      return;
    }

    // ── Recurring charge callbacks ────────────────────────────────────────
    const parts    = data.split(':');
    const action   = parts[0];
    const recId    = parts[1];
    const monthKey = parts[2];
    const rec      = recId ? recurring.find((r) => r.id === recId) : undefined;

    if (!rec) {
      await answerCallbackQuery(tk, queryId, '⚠️ החיוב לא נמצא');
      return;
    }

    if (action === 'rec_confirm') {
      const amount  = parseFloat(parts[3]) || rec.amount;
      const txnId   = nanoid();
      const dateStr = `${monthKey}-${String(rec.dayOfMonth).padStart(2, '0')}`;
      await answerCallbackQuery(tk, queryId, '✅ נרשם!');
      addTransactions([{
        id: txnId, date: dateStr, business: rec.name, amount, currency: 'ILS',
        category: rec.category, isRecurring: true, source: 'telegram',
        notes: 'אושר דרך טלגרם', pending: false, aiCategorized: false,
        recurringId: recId, categoryOverride: undefined,
      }]);
      setRecurringOccurrence(recId, monthKey, { amount, transactionId: txnId });
      if (msgId) await editMessageText(tk, cid, msgId,
        `✅ <b>${rec.name}</b> — ₪${amount.toLocaleString('he-IL')} נרשם`);
    } else if (action === 'rec_edit') {
      await answerCallbackQuery(tk, queryId);
      liveRef.current.conv = { step: 'rec_amount', recurringId: recId, monthKey };
      await sendMessage(tk, cid, `✏️ <b>${rec.name}</b>\nמה הסכום שנגבה בפועל?\n\n/cancel לביטול`);
    } else if (action === 'rec_dismiss') {
      await answerCallbackQuery(tk, queryId, '🚫 נדחה');
      setRecurringOccurrence(recId, monthKey, { dismissed: true });
      if (msgId) await editMessageText(tk, cid, msgId, `🚫 <b>${rec.name}</b> — סומן כ"לא בוצע"`);
    } else {
      await answerCallbackQuery(tk, queryId);
    }

    // Suppress unused-var lint for destructured but conditionally-used vars
    void lots; void usdIls; void corsProxy; void rows;
  }

  // ── Keep liveRef in sync with latest function instances (anti-stale-closure) ─
  liveRef.current.handleText     = handleText;
  liveRef.current.handleCallback = handleCallback;

  // ── checkPendingTransactions ──────────────────────────────────────────────

  async function checkPendingTransactions(tk: string, cid: string, force = false) {
    const { store: { transactions }, sentPendingAlerts } = liveRef.current;
    const pending = transactions.filter((t) => t.pending && !t.isVirtual);

    if (pending.length === 0) {
      if (force) await sendMessage(tk, cid, '✅ אין עסקאות ממתינות לאישור.');
      return;
    }

    if (force) {
      // Clear previously-sent flags so a manual re-press always re-shows everything
      for (const txn of pending) sentPendingAlerts.delete(`pend:${txn.id}`);
    }

    for (const txn of pending) {
      const key = `pend:${txn.id}`;
      if (!force && sentPendingAlerts.has(key)) continue;
      sentPendingAlerts.add(key);

      const d   = new Date(txn.date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
      const txt = `⏳ <b>ממתין לאישור</b>\n\n📅 ${d}\n🏪 <b>${escHtml(txn.business)}</b>\n💰 ₪${txn.amount.toLocaleString('he-IL')}\n📂 ${escHtml(txn.category)}`;

      const msgId = await sendInlineKeyboard(tk, cid, txt,
        [[
          { text: '✅ אשר',      callback_data: `txn_ok:${txn.id}` },
          { text: '✏️ שנה סכום', callback_data: `txn_edit:${txn.id}` },
          { text: '🗑️ מחק',      callback_data: `txn_del_pend:${txn.id}` },
        ]],
      );

      // Fallback: inline keyboard failed (e.g. bad HTML / network) — send plain text
      if (!msgId) {
        await sendMessage(tk, cid,
          `⏳ ממתין: ${escHtml(txn.business)} — ₪${txn.amount.toLocaleString('he-IL')} (${escHtml(txn.category)})\n` +
          `שלח /approve_${txn.id.slice(0, 8)} לאישור`
        );
      }
    }
  }

  // ── checkAllBudgetWarnings ────────────────────────────────────────────────

  async function checkAllBudgetWarnings(tk: string, cid: string) {
    const { store: { transactions, goals }, settings: { notifyBudgetOverrun } } = liveRef.current;
    if (!notifyBudgetOverrun || goals.length === 0) return;
    const mk     = currentMonthKey();
    const catAmt: Record<string, number> = {};
    for (const t of transactions.filter((x) => x.date.startsWith(mk) && !x.pending)) {
      catAmt[t.category] = (catAmt[t.category] ?? 0) + t.amount;
    }
    for (const g of goals) {
      const spent = catAmt[g.category] ?? 0;
      if (spent > 0) await checkBudgetWarningForCat(tk, cid, g.category, spent, g.targetAmount, mk);
    }
  }

  // ── checkRecurring ────────────────────────────────────────────────────────

  function checkRecurring(tk: string, cid: string) {
    const { store: { recurring }, settings: { notifyRecurringCharge }, sentConfirmations } = liveRef.current;
    if (!notifyRecurringCharge) return;

    const today    = new Date().getDate();
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
      sendInlineKeyboard(tk, cid,
        `💳 <b>${escHtml(rec.name)}</b>\n\n₪${rec.amount.toLocaleString('he-IL')} — ${when}\n\nהאם החיוב בוצע?`,
        [[
          { text: `✅ כן — ₪${rec.amount}`, callback_data: `rec_confirm:${rec.id}:${monthKey}:${rec.amount}` },
          { text: '✏️ שנה סכום',             callback_data: `rec_edit:${rec.id}:${monthKey}` },
        ],
        [{ text: '🚫 לא בוצע / דחה', callback_data: `rec_dismiss:${rec.id}:${monthKey}` }]],
      );
    }
  }

  // ── Scheduled time-based checks ───────────────────────────────────────────

  async function checkDailySummary(tk: string, cid: string) {
    const { settings: s } = liveRef.current;
    if (!s.dailySummaryEnabled) return;
    const now   = new Date();
    const hhmm  = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const today = now.toISOString().slice(0, 10);
    if (hhmm !== s.dailySummaryTime || s.lastDailySummaryDate === today) return;
    s.update({ lastDailySummaryDate: today });
    await sendDailySummary(tk, cid);
  }

  async function checkWeeklySummary(tk: string, cid: string) {
    const { settings: s } = liveRef.current;
    if (!s.weeklySummaryEnabled) return;
    const now  = new Date();
    if (now.getDay() !== 0) return;
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (hhmm !== '09:00') return;
    const wk = weekKey(now);
    if (s.lastWeeklySummaryKey === wk) return;
    s.update({ lastWeeklySummaryKey: wk });
    await sendWeeklySummary(tk, cid);
  }

  async function checkMonthlySummary(tk: string, cid: string) {
    const { settings: s } = liveRef.current;
    if (!s.monthlySummaryEnabled) return;
    const now  = new Date();
    if (now.getDate() !== 1) return;
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (hhmm !== '09:00') return;
    const mk = currentMonthKey();
    if (s.lastMonthlySummaryKey === mk) return;
    s.update({ lastMonthlySummaryKey: mk });
    await sendMonthlySummary(tk, cid);
  }

  // ── Effect: start / stop polling ──────────────────────────────────────────

  useEffect(() => {
    const { telegramBotToken: tk, telegramChatId: cid, telegramPollingEnabled } = liveRef.current.settings;
    if (!telegramPollingEnabled || !tk || !cid) return;

    let running = true;

    // Welcome + keyboard on first enable
    sendMessage(tk, cid, '🤖 <b>פינסטאר מחובר!</b>').then(() => sendMenu(tk, cid));

    // ── Poll ──────────────────────────────────────────────────────────────
    async function poll() {
      if (!running) return;
      const {
        settings: { lastTelegramUpdateId, telegramChatId: liveCid, telegramBotToken: liveTk },
      } = liveRef.current;

      const updates = await getUpdatesPolling(liveTk, lastTelegramUpdateId + 1);
      if (!running || !updates.length) return;

      let maxId = lastTelegramUpdateId;

      for (const upd of updates) {
        if (upd.update_id > maxId) maxId = upd.update_id;

        // ── Text messages ────────────────────────────────────────────────
        if (upd.message?.text) {
          if (String(upd.message.chat.id).trim() !== liveCid.trim()) continue;
          try {
            // Always call via liveRef so we use the latest function (no stale closure)
            await liveRef.current.handleText!(upd.message.text, upd.message.date, liveTk, liveCid);
          } catch { /* silent — never crash the poll loop */ }

        // ── Callback queries (inline keyboard buttons) ───────────────────
        } else if (upd.callback_query?.data) {
          const cbChatId = String(
            upd.callback_query.message?.chat.id ?? upd.callback_query.from.id
          ).trim();
          if (cbChatId !== liveCid.trim()) {
            // Not our chat — still answer to stop the spinner
            answerCallbackQuery(liveTk, upd.callback_query.id).catch(() => {});
            continue;
          }
          // Always call via liveRef so we use the latest function (no stale closure)
          const qid = upd.callback_query.id;
          liveRef.current.handleCallback!(qid, upd.callback_query.data, upd.callback_query.message?.message_id, liveTk, liveCid)
            .catch(async () => {
              try { await answerCallbackQuery(liveTk, qid, '⚠️ שגיאה'); } catch { /* silent */ }
            });
        }
      }

      if (maxId > lastTelegramUpdateId) {
        liveRef.current.settings.update({ lastTelegramUpdateId: maxId });
      }
    }

    // ── Scheduled checks (every minute) ──────────────────────────────────
    async function scheduled() {
      if (!running) return;
      const { settings: { telegramBotToken: t, telegramChatId: c } } = liveRef.current;
      if (!t || !c) return;
      checkRecurring(t, c);
      await checkPendingTransactions(t, c);
      await checkAllBudgetWarnings(t, c);
      await checkDailySummary(t, c);
      await checkWeeklySummary(t, c);
      await checkMonthlySummary(t, c);
    }

    const pollTimer      = setInterval(poll, POLL_MS);
    const scheduledTimer = setInterval(scheduled, CHECK_MS);

    checkRecurring(tk, cid);
    checkPendingTransactions(tk, cid);

    return () => {
      running = false;
      clearInterval(pollTimer);
      clearInterval(scheduledTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.telegramPollingEnabled, settings.telegramBotToken, settings.telegramChatId]);
}
