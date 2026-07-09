/**
 * Server-side bank/credit-card sync, triggered by the Telegram /sync command.
 * Ported from src/hooks/useManualSync.ts + src/lib/bankScraper.ts +
 * src/utils/llmCategorizer.ts + src/utils/syncHelpers.ts, so a sync can run
 * from a chat message without the web app open in a browser.
 */
import fs from 'fs';

const DB_FILE = process.env.DB_FILE || './finstar-db.json';
const SETTINGS_FILE = process.env.SETTINGS_FILE || '../finstar-settings.json';
const SCRAPER_URL = process.env.SCRAPER_URL || 'http://finstar-scraper:3003';

function readDb() {
  try {
    if (!fs.existsSync(DB_FILE)) return { state: {} };
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch (e) {
    return { state: {} };
  }
}
function writeDb(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data), 'utf-8');
}
function readSettings() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return { state: {} };
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
  } catch (e) {
    return { state: {} };
  }
}
function writeSettings(data) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data), 'utf-8');
}

let _idCounter = 0;
function genId() {
  return `bank-${Date.now()}-${++_idCounter}`;
}

// ── Local keyword categorizer (ported from src/utils/categorizer.ts) ────────

const KEYWORD_MAP = {
  'מזון וסופרמרקט': ['שופרסל', 'רמי לוי', 'ויקטורי', 'מגה', 'חצי חינם', 'יינות ביתן', 'סופר', 'מאפה', 'מינימרקט'],
  'מסעדות וקפה': ['קפה', 'יפניקה', 'פיצה', 'מקדונלד', 'קפטן', 'סושי', 'ברגר', 'מסעדה', 'גריל', 'wolt', 'ten bis', 'cibus'],
  'תחבורה': ['דלק', 'חבר', 'תחנת', 'פארקינג', 'רב-קו', 'רב קו', 'סונול', 'פז ', 'אוטובוס', 'רכבת', 'מוניות'],
  'דיור': ['שכר דירה', 'שכירות', 'משכנתא', 'דמי שכירות', 'שוכר', 'בעל דירה', 'דירה'],
  'שירותים': ['חשמל', 'מים', 'גז', 'ועד בית', 'ארנונה', 'עיריית', 'עירית', 'ביוב', 'חברת חשמל'],
  'תקשורת': ['פרטנר', 'הוט', 'סלקום', 'בזק', 'cellcom', 'גולן טלקום'],
  'מנויים ובידור': ['netflix', 'spotify', 'apple', 'google', 'youtube', 'amazon', 'disney', 'yes', 'canva', 'adobe', 'microsoft', 'dropbox', 'icloud'],
  'בריאות': ['סופרפארם', 'מכבי', 'רוקח', 'רופא', 'כללית', 'לאומית', 'בית חולים', 'אופטיקה'],
  'קניות': ['זארה', 'zara', 'h&m', 'ikea', 'aliexpress', 'shein', 'temu', 'שופינג', 'castro', 'nike', 'adidas'],
  'ביטוח': ['מגדל', 'הראל', 'כלל ביטוח', 'מנורה', 'ביטוח', 'הפניקס', 'שירביט'],
  'חינוך': ['סטימצקי', 'udemy', 'בית ספר', 'אוניברסיטה', 'קורס', 'coursera'],
  'ממשלתי': ['כביש אגרה', 'דואר ישראל', 'נתיבי איילון', 'קנס', 'מס הכנסה', 'ביטוח לאומי'],
  'אחר': [],
};

function categorize(business) {
  const lower = business.toLowerCase();
  for (const [cat, keywords] of Object.entries(KEYWORD_MAP)) {
    if (cat === 'אחר') continue;
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) return cat;
    }
  }
  return 'אחר';
}

// ── Bank scraper client + mapping (ported from src/lib/bankScraper.ts) ──────

async function scrapeBank(companyId, credentials, startDate) {
  const res = await fetch(`${SCRAPER_URL}/api/scrape`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, credentials, startDate }),
  });
  return res.json();
}

const ERROR_MESSAGES = {
  INVALID_PASSWORD: 'סיסמה שגויה — בדוק את הפרטים',
  CHANGE_PASSWORD: 'הבנק דורש החלפת סיסמה — היכנס לאתר הבנק',
  ACCOUNT_BLOCKED: 'החשבון חסום — פנה לבנק',
  UNKNOWN_ERROR: 'שגיאה לא ידועה מהבנק',
  TIMEOUT: 'הסנכרון ארך יותר מדי זמן — נסה שוב',
  GENERIC: 'שגיאה כללית בסנכרון',
  SERVER_ERROR: 'שגיאה פנימית בסקרייפר - הבנק חסם או שינה מבנה',
  MISSING_PARAMS: 'פרמטרים חסרים — בדוק את הגדרות החשבון',
  INVALID_COMPANY: 'חברה לא מוכרת',
};
function getErrorMessage(errorType) {
  if (!errorType) return 'שגיאה לא ידועה';
  return ERROR_MESSAGES[errorType] || `שגיאה: ${errorType}`;
}

const BANKS = ['hapoalim', 'leumi', 'mizrahi', 'discount', 'mercantile', 'otsarHahayal', 'union', 'beinleumi', 'massad', 'yahav', 'oneZero', 'pagi'];

function mapScrapedTransactions(scraped, companyId, companyName, categoryRules) {
  if (!scraped.success || !scraped.accounts) return { expenses: [], incomes: [] };

  const expenses = [];
  const incomes = [];
  const isBank = BANKS.includes(companyId);

  for (const account of scraped.accounts) {
    for (const txn of account.txns) {
      const business = txn.description || 'ללא תיאור';
      const date = txn.date ? txn.date.slice(0, 10) : new Date().toISOString().slice(0, 10);

      const isIncome = isBank && txn.chargedAmount > 0;
      const isCreditCardRefund = !isBank && txn.chargedAmount > 0;

      if (isIncome) {
        incomes.push({ id: genId(), date, source: business, type: 'אחר', netAmount: Math.abs(txn.chargedAmount), recurring: false });
        continue;
      }

      let amount = Math.abs(txn.chargedAmount);
      if (isCreditCardRefund) amount = -amount;

      const ruleCategory = categoryRules[business];
      let category = ruleCategory && ruleCategory !== '__manual__' ? ruleCategory : undefined;
      if (!category) category = categorize(business);

      let notes = txn.memo || '';
      if (txn.installments) {
        const instNote = `תשלום ${txn.installments.number}/${txn.installments.total}`;
        notes = notes ? `${notes} | ${instNote}` : instNote;
      }
      if (account.accountNumber) {
        const accNote = `חשבון: ${account.accountNumber}`;
        notes = notes ? `${notes} | ${accNote}` : accNote;
      }

      const currency = txn.originalCurrency === 'ILS' ? 'ILS' : txn.originalCurrency === 'USD' ? 'USD' : (txn.originalCurrency || 'ILS');

      expenses.push({
        id: genId(), date, business, amount, currency, category,
        isRecurring: false, source: companyName, notes,
        pending: false, aiCategorized: false, aiProcessed: false,
        categoryOverride: ruleCategory && ruleCategory !== '__manual__' ? ruleCategory : undefined,
        metadata: {
          identifier: txn.identifier, processedDate: txn.processedDate,
          originalAmount: txn.originalAmount, originalCurrency: txn.originalCurrency,
          chargedAmount: txn.chargedAmount, chargedCurrency: txn.chargedCurrency,
          status: txn.status, memo: txn.memo || undefined, installments: txn.installments,
        },
      });
    }
  }

  return { expenses, incomes };
}

// ── Local recurring-link heuristic (ported from src/utils/syncHelpers.ts) ───

function getLocalLinkRecommendations(newExpenses, recurringCharges, allTransactions) {
  const recommendations = [];
  const activeRecurring = recurringCharges.filter((r) => r.active);
  const today = new Date();

  for (const t of newExpenses) {
    if (t.recurringId || t.isVirtual) continue;
    let bestMatch = null;

    for (const r of activeRecurring) {
      const amountDiff = Math.abs(t.amount - r.amount);
      const isAmountClose = amountDiff / r.amount <= 0.15 || amountDiff <= 10;
      if (!isAmountClose) continue;

      const tDate = new Date(t.date);
      if (tDate > today) continue;

      const tYear = tDate.getFullYear();
      const tMonth = tDate.getMonth();
      const maxDay = new Date(tYear, tMonth + 1, 0).getDate();
      const billingDay = Math.min(r.dayOfMonth, maxDay);
      const billingDate = new Date(tYear, tMonth, billingDay);
      const dayDiff = Math.abs(tDate.getTime() - billingDate.getTime()) / 86400000;
      if (dayDiff > 7) continue;

      const tNameClean = t.business.toLowerCase().trim();
      const rNameClean = r.name.toLowerCase().trim();
      const isExactName = tNameClean === rNameClean;
      const isSubstring = tNameClean.includes(rNameClean) || rNameClean.includes(tNameClean);
      const isCategoryMatch = t.category === r.category;

      let priority = 0, reason = '';
      if (isExactName) { priority = 3; reason = `התאמה מדויקת בשם העסק וסכום קרוב`; }
      else if (isSubstring) { priority = 2; reason = `שם עסק דומה ("${r.name}") וסכום קרוב`; }
      else if (isCategoryMatch) { priority = 1; reason = `קטגוריה זהה ("${r.category}"), סכום קרוב וסמיכות תאריכים`; }
      else continue;

      if (!bestMatch || priority > bestMatch.priority) bestMatch = { recurringId: r.id, reason, priority };
    }

    if (bestMatch) recommendations.push({ transactionId: t.id, recurringId: bestMatch.recurringId, reason: bestMatch.reason });
  }

  return recommendations;
}

// ── LLM categorizer (ported from src/utils/llmCategorizer.ts) ───────────────

const MODEL_TIMEOUT_MS = 35_000;
const GEMINI_FALLBACK_MODELS = [
  'gemini-flash-lite-latest', 'gemini-2.0-flash-lite', 'gemini-2.5-flash-lite',
  'gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-2.0-flash',
  'gemini-3-flash-preview', 'gemini-3.5-flash',
];

async function fetchWithTimeout(url, options, timeoutMs = MODEL_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('TIMEOUT');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(url, options, maxRetries = 2, delayMs = 1500) {
  let attempts = 0;
  while (attempts <= maxRetries) {
    try {
      const res = await fetchWithTimeout(url, options);
      if (res.status === 429 && attempts < maxRetries) {
        attempts++;
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      return res;
    } catch (err) {
      if (attempts < maxRetries) {
        attempts++;
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error('RATE_LIMIT_429');
}

function escapeInternalQuotes(jsonStr) {
  let result = '';
  let inString = false;
  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    const prevChar = i > 0 ? jsonStr[i - 1] : '';
    if (char === '"' && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        result += char;
      } else {
        let isStructural = false;
        let j = i + 1;
        while (j < jsonStr.length && /\s/.test(jsonStr[j])) j++;
        const nextChar = j < jsonStr.length ? jsonStr[j] : '';
        if (nextChar === ':' || nextChar === ',' || nextChar === '}' || nextChar === ']' || nextChar === '') isStructural = true;
        if (isStructural) { inString = false; result += char; } else { result += '\\"'; }
      }
    } else {
      result += char;
    }
  }
  return result;
}

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return JSON.parse(escapeInternalQuotes(text.slice(start, end + 1)));
  }
  return JSON.parse(escapeInternalQuotes(text));
}

async function llmAnalyzeNewTransactionsChunk(transactions, incomes, recurringCharges, availableCategories, examples, settings) {
  const { llmApiKey, llmProvider, llmModel } = settings;
  if (!llmApiKey || (transactions.length === 0 && incomes.length === 0)) {
    return { toDelete: [], toLink: [], categorizations: {} };
  }

  const prompt = `
You are an expert financial transaction analyzer for an Israeli user.
Your goal is to analyze a batch of newly imported bank and credit card transactions AND incomes.
You need to return a JSON object with up to five fields:
1. "toDelete": An array of objects { "transactionId": string, "reason": string } that should be deleted because they are either:
   - Credit card aggregations (e.g. a single huge charge from "ישראכרט" or "כאל" that aggregates the whole month).
   - Internal currency transfers or foreign currency purchases (e.g. "רכישת מטח נוכחי", "המרת מטבע") which are just moving money within the account to dollars and not actual expenses.
   - Refunds (זיכויים / החזרים): CRITICAL RULE! DO NOT recommend deleting a refund UNLESS you are also recommending deleting the original purchase! If the refund amount is different from the purchase (partial refund), DO NOT delete it! We must never delete just the refund without the purchase.
   - CRITICAL EXCEPTION: NEVER delete check withdrawals (e.g., "משיכת שיק", "שיק מנותב", "צ'ק"). These are actual expenses, not internal transfers!
   Reason MUST be in Hebrew.
2. "toLink": An array of objects { "transactionId": string, "recurringId": string, "reason": string } for transactions that reasonably match an existing recurring charge in the user's active recurring charges list.
   - A match does NOT require an exact business name (e.g., "Wolt" matches "Wolt Ent.", "נטפליקס" matches "Netflix", "פז" matches "פז חלפים").
   - A match does NOT require an exact amount. If the amount is within a ±30% range of the recurring amount (e.g., price changes or currency conversion differences) or matches expected recurring intervals, consider it a match.
   - The billing day can vary by ±7 days.
   - Reason MUST be in Hebrew (e.g., "התאמה של סכום דומה ושם עסק מתאים").
3. "categorizations": A mapping of business names to an object containing the best matching category AND a confidence score (0-100) indicating how accurate you believe this categorization is.
   CRITICAL: You MUST include EVERY SINGLE UNIQUE BUSINESS NAME from the input list! Do not skip any!
4. "incomesToDelete": An array of objects { "incomeId": string, "reason": string } for incomes that should be deleted because they are internal currency transfers, foreign currency purchases, or money moving between accounts. Reason MUST be in Hebrew.
5. "incomeCategorizations": A mapping of income source names to one of the strict types: ['משכורת', 'שכ"ד', 'פרילנס', 'דיבידנד', 'ריבית', 'אחר'].
   CRITICAL: ONLY categorize incomes that are NOT in the "incomesToDelete" list!
   Note: Sources containing "מופת קבע", "צהל", or "משכורת" MUST be mapped to "משכורת".

Hints for Israeli businesses:
- Credit card aggregations (ANY business name containing "ישראכרט", "לאומי קארד", "כאל", "cal", "max", "ויזה", "אמריקן אקספרס", or "כרטיסי אשראי") MUST HAVE THEIR IDs ADDED TO "toDelete". This is non-negotiable!
- Internal currency transactions MUST HAVE THEIR IDs ADDED TO "toDelete" (if expense) or "incomesToDelete" (if income).
- Gas stations (פז, סונול, דלק, דור אלון), parking (פנגו, סלופארק) -> רכב - אנרגיה / רכב - תחזוקה
- Supermarkets (שופרסל, רמי לוי, יוחננוף, טיב טעם, am:pm) -> מזון וסופרמרקט
- Insurance (ביטוח ישיר, הראל, מנורה, מגדל, כלל) -> ביטוחים
- Pharmacies (סופר-פארם, Be, בתי מרקחת) -> בריאות ופארם
- Restaurants, cafes, Wolt, Ten Bis, Cibus -> מסעדות וקפה
- Online Shopping (AliExpress, SHEIN, Amazon, Temu) -> קניות אונליין
- Checks ("משיכת שיק", "שיק מנותב", "צ'ק"): PRIORITIZE linking these to recurring rent charges in "toLink". If no match, categorize as "דיור ושכר דירה". NEVER delete them.

Available Categories (Strict List):
${availableCategories.map((c) => `- ${c}`).join('\n')}

${Object.keys(examples).length > 0 ? `The user explicitly overrode the AI in the past for the following businesses. You MUST learn from these manual overrides:\n${Object.entries(examples).map(([b, c]) => `- "${b}" -> "${c}"`).join('\n')}\n\n` : ''}
User's Active Recurring Charges (Subscriptions/Bills):
${recurringCharges.filter((r) => r.active).map((r) => `- ID: "${r.id}", Name: "${r.name}", Amount: ${r.amount}, Billing Day: ${r.dayOfMonth}`).join('\n')}

Newly Imported Transactions (Expenses) to Analyze:
${transactions.length === 0 ? 'None' : transactions.map((t) => `- ID: "${t.id}", Business: "${t.business}", Amount: ${t.amount}, Date: ${t.date}`).join('\n')}

List of UNIQUE BUSINESSES you MUST categorize (unless deleted/linked). Do not skip ANY of these:
${[...new Set(transactions.map((t) => t.business))].map((b) => `- "${b}"`).join('\n')}

Newly Imported Incomes to Analyze:
${incomes.length === 0 ? 'None' : incomes.map((i) => `- ID: "${i.id}", Source: "${i.source}", Amount: ${i.netAmount}, Date: ${i.date}`).join('\n')}

Return ONLY a valid JSON object matching this TypeScript interface exactly:
{
  "toDelete": { "transactionId": string, "reason": string }[],
  "toLink": { "transactionId": string, "recurringId": string, "reason": string }[],
  "categorizations": { [businessName: string]: { "category": string, "confidence": number } },
  "incomesToDelete": { "incomeId": string, "reason": string }[],
  "incomeCategorizations": { [sourceName: string]: string }
}
  `.trim();

  try {
    if (llmProvider === 'gemini') {
      const activeModelString = llmModel === 'gemini-flash-latest' ? 'gemini-flash-lite-latest' : (llmModel || 'gemini-flash-lite-latest');
      const modelsToTry = [activeModelString, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== activeModelString)];
      const keys = [settings.llmApiKey, settings.llmApiKey2, settings.llmApiKey3].filter(Boolean);

      let lastError = null, data = null, successfulModel = '';
      for (const model of modelsToTry) {
        let modelSuccess = false;
        for (const key of keys) {
          try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
            const res = await fetchWithRetry(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, responseMimeType: 'application/json' } }),
            });
            if (res.status === 429) throw new Error('RATE_LIMIT_429');
            if (res.status === 503) throw new Error('SERVICE_UNAVAILABLE_503');
            data = await res.json();
            successfulModel = model;
            modelSuccess = true;
            break;
          } catch (err) {
            lastError = err;
          }
        }
        if (modelSuccess) break;
      }

      if (!data) throw lastError || new Error('All models failed');

      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        const responseText = data.candidates[0].content.parts[0].text;
        const parsed = extractJson(responseText.trim());
        return {
          toDelete: Array.isArray(parsed.toDelete) ? parsed.toDelete : [],
          toLink: Array.isArray(parsed.toLink) ? parsed.toLink : [],
          categorizations: parsed.categorizations || {},
          incomesToDelete: Array.isArray(parsed.incomesToDelete) ? parsed.incomesToDelete : [],
          incomeCategorizations: parsed.incomeCategorizations || {},
        };
      }
    } else if (llmProvider === 'openai') {
      const modelString = llmModel || 'gpt-4o-mini';
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llmApiKey}` },
        body: JSON.stringify({
          model: modelString,
          messages: [{ role: 'system', content: 'You are a categorizer. You must reply with JSON.' }, { role: 'user', content: prompt }],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      });
      if (res.status === 429) throw new Error('RATE_LIMIT_429');
      const data = await res.json();
      if (data.choices?.[0]?.message?.content) {
        const parsed = JSON.parse(data.choices[0].message.content.trim());
        return {
          toDelete: Array.isArray(parsed.toDelete) ? parsed.toDelete : [],
          toLink: Array.isArray(parsed.toLink) ? parsed.toLink : [],
          categorizations: parsed.categorizations || {},
          incomesToDelete: Array.isArray(parsed.incomesToDelete) ? parsed.incomesToDelete : [],
          incomeCategorizations: parsed.incomeCategorizations || {},
        };
      }
    }
  } catch (err) {
    console.error('[BankSync] LLM analysis failed:', err);
    throw err;
  }

  return { toDelete: [], toLink: [], categorizations: {} };
}

async function llmAnalyzeNewTransactions(transactions, incomes, recurringCharges, availableCategories, examples, settings) {
  if (!settings.llmApiKey || (transactions.length === 0 && incomes.length === 0)) {
    return { toDelete: [], toLink: [], categorizations: {} };
  }

  const combined = [...transactions.map((t) => ({ type: 'tx', data: t })), ...incomes.map((i) => ({ type: 'inc', data: i }))];
  const merged = { toDelete: [], toLink: [], categorizations: {}, incomesToDelete: [], incomeCategorizations: {} };

  for (let i = 0; i < combined.length; i += 40) {
    const chunk = combined.slice(i, i + 40);
    const chunkTx = chunk.filter((x) => x.type === 'tx').map((x) => x.data);
    const chunkInc = chunk.filter((x) => x.type === 'inc').map((x) => x.data);
    const res = await llmAnalyzeNewTransactionsChunk(chunkTx, chunkInc, recurringCharges, availableCategories, examples, settings);
    merged.toDelete.push(...(res.toDelete || []));
    merged.toLink.push(...(res.toLink || []));
    Object.assign(merged.categorizations, res.categorizations);
    if (res.incomesToDelete) merged.incomesToDelete.push(...res.incomesToDelete);
    if (res.incomeCategorizations) Object.assign(merged.incomeCategorizations, res.incomeCategorizations);
  }

  return merged;
}

// ── Orchestration (ported from src/hooks/useManualSync.ts) ──────────────────

function updateAccountInSettings(settingsObj, accountId, patch) {
  const accounts = settingsObj.state.bankAccounts || [];
  const idx = accounts.findIndex((a) => a.id === accountId);
  if (idx !== -1) accounts[idx] = { ...accounts[idx], ...patch };
}

/**
 * Runs a full sync (scrape → dedupe → AI categorize/analyze → save), mirroring
 * the web app's "manual sync" flow, without needing a browser open.
 * @param {string[]} [accountIds] - sync only these bank accounts, or all if omitted
 */
export async function runBankSync(accountIds) {
  const dbObj = readDb();
  const dbState = dbObj.state || {};
  const settingsObj = readSettings();
  const settings = settingsObj.state || {};

  const bankAccounts = settings.bankAccounts || [];
  const accountsToSync = accountIds ? bankAccounts.filter((a) => accountIds.includes(a.id)) : bankAccounts;
  if (accountsToSync.length === 0) return { error: 'no_accounts' };

  const transactions = dbState.transactions || [];
  const income = dbState.income || [];
  const ignoredIdentifiers = dbState.ignoredIdentifiers || [];
  const categoryRules = { ...(dbState.categoryRules || {}) };
  const categoryRulesMeta = { ...(dbState.categoryRulesMeta || {}) };
  const recurring = dbState.recurring || [];
  const categories = dbState.categories || [];

  const newlyImportedExpenses = [];
  const newlyImportedIncomes = [];
  const manualTxnsToDeleteAll = [];
  const accountResults = [];

  for (const account of accountsToSync) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - (settings.autoSyncDaysBack || 30));
      const result = await scrapeBank(account.companyId, account.credentials, startDate.toISOString().slice(0, 10));
      const logDate = new Date().toISOString();

      if (result.success) {
        const { expenses, incomes } = mapScrapedTransactions(result, account.companyId, account.companyName, categoryRules);

        const manualTxnsToDelete = [];
        const freshExpenses = expenses.filter((t) => {
          const existingMatch = transactions.find((ex) => ex.date === t.date && ex.business === t.business && ex.amount === t.amount);
          if (existingMatch) {
            if (existingMatch.metadata?.identifier) return false;
            manualTxnsToDelete.push(existingMatch.id);
          }
          if (t.metadata?.identifier && ignoredIdentifiers.includes(String(t.metadata.identifier))) return false;
          return true;
        });
        if (manualTxnsToDelete.length) manualTxnsToDeleteAll.push(...manualTxnsToDelete);
        if (freshExpenses.length) newlyImportedExpenses.push(...freshExpenses);

        let freshIncomes = [];
        if (incomes.length) {
          const existingIncomeKeys = new Set(income.map((i) => `${i.date}-${i.source}-${i.netAmount}`));
          // Incomes have no stable scraper identifier — dedupe against ignoredIdentifiers
          // by the same date+source+amount key that Expenses.tsx registers on delete.
          freshIncomes = incomes.filter((i) => {
            const key = `${i.date}-${i.source}-${i.netAmount}`;
            return !existingIncomeKeys.has(key) && !ignoredIdentifiers.includes(key);
          });
          if (freshIncomes.length) newlyImportedIncomes.push(...freshIncomes);
        }

        const totalMapped = freshExpenses.length + freshIncomes.length;
        const newLogs = [{ date: logDate, status: 'success', txnCount: totalMapped }, ...(account.syncLogs || [])].slice(0, 20);
        updateAccountInSettings(settingsObj, account.id, {
          lastSync: logDate, lastSyncStatus: 'success', lastSyncError: undefined, lastSyncTxnCount: totalMapped, syncLogs: newLogs,
        });
        accountResults.push({ nickname: account.nickname, ok: true, count: totalMapped });
      } else {
        const errorMessage = getErrorMessage(result.errorType);
        const newLogs = [{ date: logDate, status: 'error', errorMessage }, ...(account.syncLogs || [])].slice(0, 20);
        updateAccountInSettings(settingsObj, account.id, {
          lastSync: logDate, lastSyncStatus: 'error', lastSyncError: errorMessage, lastSyncTxnCount: 0, syncLogs: newLogs,
        });
        accountResults.push({ nickname: account.nickname, ok: false, error: errorMessage });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'שגיאה לא ידועה';
      const logDate = new Date().toISOString();
      const newLogs = [{ date: logDate, status: 'error', errorMessage }, ...(account.syncLogs || [])].slice(0, 20);
      updateAccountInSettings(settingsObj, account.id, {
        lastSync: logDate, lastSyncStatus: 'error', lastSyncError: errorMessage, lastSyncTxnCount: 0, syncLogs: newLogs,
      });
      accountResults.push({ nickname: account.nickname, ok: false, error: errorMessage });
    }
  }

  let finalExpenses = newlyImportedExpenses;
  let finalIncomes = newlyImportedIncomes;
  let analysis = null;
  let extraDeletes = [];
  let combinedLinks = [];

  if (newlyImportedExpenses.length > 0 || newlyImportedIncomes.length > 0) {
    const categoryNames = categories.map((c) => c.name);
    const manualRules = Object.fromEntries(Object.entries(categoryRules).filter(([b]) => categoryRulesMeta?.[b]?.source === 'manual'));
    const threshold = settings.aiConfidenceThreshold ?? 80;

    try {
      analysis = await llmAnalyzeNewTransactions(newlyImportedExpenses, newlyImportedIncomes, recurring, categoryNames, manualRules, settings);

      finalExpenses = newlyImportedExpenses.map((tx) => {
        const aiCat = analysis.categorizations[tx.business];
        const confidence = aiCat?.confidence;
        if (aiCat && aiCat.confidence >= threshold) {
          categoryRules[tx.business] = aiCat.category;
          categoryRulesMeta[tx.business] = { date: new Date().toISOString(), source: 'ai' };
          return { ...tx, category: aiCat.category, categoryOverride: aiCat.category, aiProcessed: true, aiConfidence: confidence };
        }
        return { ...tx, aiProcessed: true, aiConfidence: confidence };
      });

      finalIncomes = newlyImportedIncomes.map((inc) =>
        analysis.incomeCategorizations?.[inc.source] ? { ...inc, type: analysis.incomeCategorizations[inc.source] } : inc
      );

      (analysis.toDelete || []).forEach((aiDel) => {
        const tx = newlyImportedExpenses.find((t) => t.id === aiDel.transactionId);
        if (tx && (tx.amount < 0 || tx.business.includes('החזר') || tx.business.includes('ביטול') || tx.business.includes('זיכוי'))) {
          const opposite = transactions.find((t) => t.business === tx.business && t.amount === Math.abs(tx.amount)) ||
            newlyImportedExpenses.find((t) => t.business === tx.business && t.amount === Math.abs(tx.amount));
          if (opposite && !analysis.toDelete.some((d) => d.transactionId === opposite.id) && !extraDeletes.some((d) => d.transactionId === opposite.id)) {
            extraDeletes.push({ transactionId: opposite.id, reason: `מחיקה אוטומטית כיוון שהעסקה המקורית בוטלה/הוחזרה בתאריך ${tx.date}` });
          }
        }
      });

      const localLinks = getLocalLinkRecommendations(newlyImportedExpenses, recurring, transactions);
      combinedLinks = [...(analysis.toLink || [])];
      for (const local of localLinks) {
        if (!combinedLinks.some((l) => l.transactionId === local.transactionId)) combinedLinks.push(local);
      }

      const currentRecs = dbState.aiRecommendations || { toDelete: [], toLink: [], categorizations: {}, incomesToDelete: [] };
      dbState.aiRecommendations = {
        toDelete: [...(currentRecs.toDelete || []), ...(analysis.toDelete || []), ...extraDeletes],
        toLink: [...(currentRecs.toLink || []), ...combinedLinks],
        categorizations: { ...(currentRecs.categorizations || {}), ...(analysis.categorizations || {}) },
        incomesToDelete: [...(currentRecs.incomesToDelete || []), ...(analysis.incomesToDelete || [])],
      };
    } catch (err) {
      console.error('[BankSync] AI analysis failed:', err);
      // Keep the scraped transactions even if AI analysis failed — they just won't be re-categorized.
    }
  }

  if (manualTxnsToDeleteAll.length) {
    dbState.transactions = transactions.filter((t) => !manualTxnsToDeleteAll.includes(t.id));
  }
  dbState.transactions = [...(dbState.transactions || transactions), ...finalExpenses];
  dbState.income = [...(dbState.income || income), ...finalIncomes];
  dbState.categoryRules = categoryRules;
  dbState.categoryRulesMeta = categoryRulesMeta;
  dbObj.state = dbState;

  writeDb(dbObj);
  writeSettings(settingsObj);

  return {
    accountResults,
    newExpenses: finalExpenses,
    newIncomes: finalIncomes,
    toDelete: [...(analysis?.toDelete || []), ...extraDeletes],
    toLink: combinedLinks,
    threshold: settings.aiConfidenceThreshold ?? 80,
  };
}
