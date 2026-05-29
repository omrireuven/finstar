/**
 * Telegram Bot API helper.
 * Telegram allows browser-side HTTPS calls to api.telegram.org (CORS enabled).
 * User creates bot via @BotFather, gets token + chat_id.
 */

const TG_BASE = 'https://api.telegram.org';

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
