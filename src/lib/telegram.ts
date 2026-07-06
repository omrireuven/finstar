/**
 * Telegram Bot API helper.
 * Telegram allows browser-side HTTPS calls to api.telegram.org (CORS enabled).
 * User creates bot via @BotFather, gets token + chat_id.
 */

const TG_BASE = typeof window !== 'undefined' ? '/api/telegram' : 'https://api.telegram.org';

// ── Incoming update types ────────────────────────────────────────────────────

export interface TgUser { id: number; first_name: string; }
export interface TgChat { id: number; }
export interface TgMessage { message_id: number; from?: TgUser; chat: TgChat; text?: string; date: number; }
export interface TgCallbackQuery { id: string; from: TgUser; message?: TgMessage; data?: string; }
export interface TgUpdate { update_id: number; message?: TgMessage; callback_query?: TgCallbackQuery; }

/** Fetch new updates since offset. Returns [] on error. */
export async function getUpdatesPolling(token: string, offset: number): Promise<TgUpdate[]> {
  if (!token) return [];
  try {
    const res = await fetch(`${TG_BASE}/bot${token}/getUpdates?offset=${offset}&limit=100&timeout=0`);
    if (res.status === 401) {
      throw new Error('401_UNAUTHORIZED');
    }
    const json = await res.json();
    return json.ok ? (json.result as TgUpdate[]) : [];
  } catch (err: any) {
    if (err?.message === '401_UNAUTHORIZED') throw err;
    return [];
  }
}

/**
 * Send a persistent Reply Keyboard (bottom of chat, no callbacks).
 * Buttons send their label as a plain text message.
 */
export async function sendReplyKeyboard(
  token: string,
  chatId: string,
  text: string,
  buttons: string[][],   // rows of button labels
): Promise<boolean> {
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
          persistent: true,         // keeps keyboard visible (Bot API 6.3+)
          one_time_keyboard: false,
        },
      }),
    });
    return res.ok;
  } catch { return false; }
}

/** Send a message with an inline keyboard. Returns the sent message_id (or null on error). */
export async function sendInlineKeyboard(
  token: string,
  chatId: string,
  text: string,
  buttons: { text: string; callback_data: string }[][]
): Promise<number | null> {
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
  } catch { return null; }
}

/** Acknowledge a callback query (removes the loading spinner on the button). */
export async function answerCallbackQuery(token: string, queryId: string, text?: string): Promise<void> {
  if (!token) return;
  try {
    await fetch(`${TG_BASE}/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: queryId, text: text ?? '' }),
    });
  } catch { /* silent */ }
}

/** Edit the text of an existing message (e.g. after button press). */
export async function editMessageText(token: string, chatId: string, messageId: number, text: string): Promise<void> {
  if (!token) return;
  try {
    await fetch(`${TG_BASE}/bot${token}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML' }),
    });
  } catch { /* silent */ }
}

export async function sendPhoto(
  token: string,
  chatId: string,
  blob: Blob,
  caption?: string
): Promise<boolean> {
  if (!token || !chatId) return false;
  try {
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('photo', blob, 'portfolio.png');
    if (caption) form.append('caption', caption);
    form.append('parse_mode', 'HTML');
    const res = await fetch(`${TG_BASE}/bot${token}/sendPhoto`, { method: 'POST', body: form });
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendMessage(
  token: string,
  chatId: string,
  text: string
): Promise<boolean> {
  if (!token || !chatId) return false;
  try {
    const res = await fetch(
      `${TG_BASE}/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
        }),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** Test connection — returns true if token is valid. */
export async function testBot(token: string): Promise<{ ok: boolean; name?: string }> {
  if (!token) return { ok: false };
  try {
    const res = await fetch(`${TG_BASE}/bot${token}/getMe`);
    const json = await res.json();
    return { ok: json.ok === true, name: json.result?.username };
  } catch {
    return { ok: false };
  }
}

/** Get the last message's chat_id (helps user find their chat ID). */
export async function getUpdates(token: string): Promise<string | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${TG_BASE}/bot${token}/getUpdates?limit=1`);
    const json = await res.json();
    const msg = json?.result?.[0]?.message ?? json?.result?.[0]?.channel_post;
    return msg?.chat?.id ? String(msg.chat.id) : null;
  } catch {
    return null;
  }
}

// ── Pre-built alert messages ────────────────────────────────────────────────

export function alertBudgetOverrun(category: string, spent: number, budget: number): string {
  return (
    `⚠️ <b>פינסטאר — חריגה מתקציב</b>\n\n` +
    `קטגוריה: <b>${category}</b>\n` +
    `הוצאה: ₪${spent.toLocaleString('he-IL')}\n` +
    `תקציב: ₪${budget.toLocaleString('he-IL')}\n` +
    `חריגה: ₪${(spent - budget).toLocaleString('he-IL')}`
  );
}

export function alertSavingsExpiry(name: string, bank: string, amount: number, maturity: string): string {
  return (
    `📅 <b>פינסטאר — פיקדון עומד לפוג</b>\n\n` +
    `פיקדון: <b>${name}</b> (${bank})\n` +
    `סכום: ₪${amount.toLocaleString('he-IL')}\n` +
    `תאריך פירעון: ${maturity}`
  );
}

export function alertRecurringCharge(name: string, amount: number, day: number): string {
  return (
    `💳 <b>פינסטאר — חיוב קבוע ב-3 ימים</b>\n\n` +
    `<b>${name}</b>\n` +
    `סכום: ₪${amount.toLocaleString('he-IL')}\n` +
    `ביום: ${day} לחודש`
  );
}

export function alertPortfolioChange(ticker: string, changePct: number, price: number): string {
  const emoji = changePct > 0 ? '📈' : '📉';
  return (
    `${emoji} <b>פינסטאר — שינוי בתיק</b>\n\n` +
    `<b>${ticker}</b>: ${changePct > 0 ? '+' : ''}${changePct.toFixed(2)}%\n` +
    `מחיר נוכחי: $${price.toFixed(2)}`
  );
}

export interface PortfolioSummaryRow {
  ticker: string;
  quantity: number;
  price: number;        // current price (USD or local)
  currency: string;
  costILS: number;
  valueILS: number;
  pnlILS: number;
  pnlPct: number;
}

export function portfolioSummaryMessage(
  rows: PortfolioSummaryRow[],
  totalValueILS: number,
  totalPnlILS: number,
  usdIls: number
): string {
  const date = new Date().toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const totalPnlPct = rows.reduce((s, r) => s + r.costILS, 0) > 0
    ? (totalPnlILS / rows.reduce((s, r) => s + r.costILS, 0)) * 100
    : 0;
  const pnlEmoji = totalPnlILS >= 0 ? '📈' : '📉';

  const header =
    `📊 <b>סיכום תיק מניות — ${date}</b>\n` +
    `<code>1$ = ₪${usdIls.toFixed(2)}</code>\n\n`;

  const rowLines = rows
    .sort((a, b) => b.valueILS - a.valueILS)
    .map((r) => {
      const sign = r.pnlILS >= 0 ? '+' : '';
      const em = r.pnlILS >= 0 ? '🟢' : '🔴';
      return (
        `${em} <b>${r.ticker}</b>  ×${r.quantity}\n` +
        `   שווי: ₪${Math.round(r.valueILS).toLocaleString('he-IL')}` +
        `  |  תשואה: ${sign}${r.pnlPct.toFixed(1)}% (${sign}₪${Math.round(r.pnlILS).toLocaleString('he-IL')})`
      );
    })
    .join('\n');

  const footer =
    `\n\n${pnlEmoji} <b>סה"כ שווי:</b> ₪${Math.round(totalValueILS).toLocaleString('he-IL')}\n` +
    `<b>רווח/הפסד כולל:</b> ${totalPnlILS >= 0 ? '+' : ''}₪${Math.round(totalPnlILS).toLocaleString('he-IL')} ` +
    `(${totalPnlILS >= 0 ? '+' : ''}${totalPnlPct.toFixed(1)}%)`;

  return header + rowLines + footer;
}
