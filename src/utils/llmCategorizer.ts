import { useSettings } from '../store/settingsStore';
import type { Category } from '../types';

const MODEL_TIMEOUT_MS = 8_000; // 8 seconds per model before giving up and trying next

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = MODEL_TIMEOUT_MS): Promise<Response> {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);

  const providedSignal = options.signal;
  let onAbort = () => { };

  if (providedSignal) {
    onAbort = () => timeoutController.abort();
    providedSignal.addEventListener('abort', onAbort);
    if (providedSignal.aborted) timeoutController.abort();
  }

  try {
    const res = await fetch(url, { ...options, signal: timeoutController.signal });
    return res;
  } catch (err: any) {
    if (providedSignal?.aborted) throw new Error('ABORTED_BY_USER');
    if (err.name === 'AbortError') throw new Error('TIMEOUT');
    throw err;
  } finally {
    clearTimeout(timer);
    if (providedSignal) {
      providedSignal.removeEventListener('abort', onAbort);
    }
  }
}

function escapeInternalQuotes(jsonStr: string): string {
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
        // Look ahead to check if this quote is structural
        let isStructural = false;
        let j = i + 1;
        while (j < jsonStr.length && /\s/.test(jsonStr[j])) {
          j++;
        }
        const nextChar = j < jsonStr.length ? jsonStr[j] : '';
        if (nextChar === ':' || nextChar === ',' || nextChar === '}' || nextChar === ']' || nextChar === '') {
          isStructural = true;
        }
        
        if (isStructural) {
          inString = false;
          result += char;
        } else {
          result += '\\"';
        }
      }
    } else {
      result += char;
    }
  }
  return result;
}

function extractJson(text: string): any {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    const jsonStr = text.slice(start, end + 1);
    const cleaned = escapeInternalQuotes(jsonStr);
    return JSON.parse(cleaned);
  }
  return JSON.parse(escapeInternalQuotes(text));
}

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 2, delayMs = 1500): Promise<Response> {
  let attempts = 0;
  while (attempts <= maxRetries) {
    try {
      const res = await fetchWithTimeout(url, options);
      if (res.status === 429 && attempts < maxRetries) {
        attempts++;
        console.warn(`[LLM Categorizer] Got 429 from ${url}, retrying in ${delayMs}ms (attempt ${attempts}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      return res;
    } catch (err: any) {
      if (attempts < maxRetries && err.message !== 'ABORTED_BY_USER') {
        attempts++;
        console.warn(`[LLM Categorizer] Request failed (${err.message}), retrying in ${delayMs}ms (attempt ${attempts}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error('RATE_LIMIT_429');
}


const CATEGORIES: Category[] = [
  'מזון וסופרמרקט',
  'מסעדות וקפה',
  'תחבורה',
  'דיור',
  'שירותים',
  'תקשורת',
  'מנויים ובידור',
  'בריאות',
  'קניות',
  'ביטוח',
  'חינוך',
  'ממשלתי',
  'אחר'
];

export const GEMINI_FALLBACK_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-2.0-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-2.0-flash',
  'gemini-3-flash-preview',
  'gemini-3.5-flash'
];

export async function llmCategorize(
  business: string,
  availableCategories: Category[],
  examples: Record<string, Category> = {}
): Promise<import('../types').AiSuggestion> {
  const { llmApiKey, llmProvider, llmModel } = useSettings.getState();

  if (!llmApiKey) {
    return { category: 'אחר' }; // fallback if no API key
  }

  const prompt = `
You are an expert financial transaction categorizer for an Israeli user.
Your goal is to accurately classify the given business name into EXACTLY ONE of the provided categories.
Use your internal knowledge of Israeli businesses, brands, and acronyms.
Hints for Israeli businesses:
- Gas stations (פז, סונול, דלק, דור אלון), parking (פנגו, סלופארק) -> רכב - אנרגיה / רכב - תחזוקה
- Supermarkets (שופרסל, רמי לוי, יוחננוף, טיב טעם, am:pm) -> מזון וסופרמרקט
- Insurance (ביטוח ישיר, הראל, מנורה, מגדל, כלל) -> ביטוחים
- Pharmacies (סופר-פארם, Be, בתי מרקחת) -> בריאות ופארם
- Restaurants, cafes, Wolt, Ten Bis, Cibus -> מסעדות וקפה
- Online Shopping (AliExpress, SHEIN, Amazon, Temu) -> קניות אונליין

Available Categories (Strict List):
${availableCategories.map(c => `- ${c}`).join('\n')}

${Object.keys(examples).length > 0 ? `The user explicitly overrode the AI in the past for the following businesses. You MUST learn from these manual overrides:\n${Object.entries(examples).map(([b, c]) => `- "${b}" -> "${c}"`).join('\n')}\n\n` : ''}Business Name: "${business}"

Return ONLY a valid JSON object with "category" (string) and "confidence" (number 0-100 indicating how confident you are in this categorization).
Example format:
{
  "category": "category 1",
  "confidence": 95
}
  `.trim();

  try {
    if (llmProvider === 'gemini') {
      const fallbackModels = [
        'gemini-flash-lite-latest',
        'gemini-2.0-flash-lite',
        'gemini-2.5-flash-lite',
        'gemini-3.1-flash-lite',
        'gemini-flash-latest',
        'gemini-2.0-flash',
        'gemini-3-flash-preview',
        'gemini-3.5-flash'
      ];
      const activeModelString = llmModel === 'gemini-flash-latest' ? 'gemini-flash-lite-latest' : (llmModel || 'gemini-flash-lite-latest');
      const remainingFallback = fallbackModels.filter(m => m !== activeModelString);
      const modelsToTry = [activeModelString, ...remainingFallback];

      const keys = [
        useSettings.getState().llmApiKey,
        useSettings.getState().llmApiKey2,
        useSettings.getState().llmApiKey3
      ].filter(Boolean) as string[];

      let lastError: Error | null = null;
      let data: any = null;
      let successfulModel = '';
      const failedModels: string[] = [];

      for (const model of modelsToTry) {
        useSettings.getState().update({ activeAiModel: model });
        const currentHistory = useSettings.getState().aiDebugHistory || [];
        useSettings.getState().update({
          aiDebugHistory: [...currentHistory, { model, prompt, response: '...', status: 'loading' }]
        });
        
        let modelSuccess = false;
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
            const res = await fetchWithRetry(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                  temperature: 0.1,
                  maxOutputTokens: 20,
                }
              })
            });
            if (res.status === 429) {
              throw new Error('RATE_LIMIT_429');
            }
            if (res.status === 503) {
              throw new Error('SERVICE_UNAVAILABLE_503');
            }
            data = await res.json();
            successfulModel = model;
            modelSuccess = true;
            break;
          } catch (err: any) {
            console.warn(`[LLM Categorizer] Key ${i+1} failed for model ${model}:`, err);
            lastError = err;
          }
        }

        if (modelSuccess) {
          // update history for success
          const hSuccess = useSettings.getState().aiDebugHistory || [];
          useSettings.getState().update({
            aiDebugHistory: hSuccess.map(h => h.model === model ? { ...h, response: data.candidates?.[0]?.content?.parts?.[0]?.text || JSON.stringify(data), status: 'success' } : h)
          });
          break; // if successful, exit loop
        } else {
          failedModels.push(model);
          // update history for failure
          const hFail = useSettings.getState().aiDebugHistory || [];
          useSettings.getState().update({
            failedAiModels: [...failedModels],
            aiDebugHistory: hFail.map(h => h.model === model ? { ...h, response: lastError?.message === 'TIMEOUT' ? `⏱ timeout (${MODEL_TIMEOUT_MS / 1000}s)` : (lastError?.message || String(lastError)), status: 'failed' } : h)
          });
        }
      }

      if (!data) {
        throw lastError || new Error('All models failed');
      }

      if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        let text = data.candidates[0].content.parts[0].text.trim();
        try {
          const parsed = extractJson(text);
          if (parsed && typeof parsed.category === 'string') {
            return parsed;
          }
        } catch (e) {
          // fallback to regex mapping if json parsing fails
          const match = availableCategories.find(c => text.includes(c));
          if (match) return { category: match };
        }
      }
    } else if (llmProvider === 'openai') {
      const modelString = llmModel || 'gpt-4o-mini';
      const url = 'https://api.openai.com/v1/chat/completions';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${llmApiKey}`
        },
        body: JSON.stringify({
          model: modelString,
          messages: [
            { role: 'system', content: 'You are a categorizer.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.1,
          max_tokens: 10,
        })
      });
      if (res.status === 429) {
        throw new Error('RATE_LIMIT_429');
      }
      const data = await res.json();
      if (data.choices && data.choices[0]?.message?.content) {
        let text = data.choices[0].message.content.trim();
        text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed.category === 'string') {
            return parsed;
          }
        } catch (e) {
          const match = availableCategories.find(c => text.includes(c));
          if (match) return { category: match };
        }
      }
    }
  } catch (err: any) {
    console.error(`[LLM Categorizer] Failed to categorize "${business}":`, err);
    if (err.message === 'RATE_LIMIT_429') {
      throw err;
    }
  }

  return { category: 'אחר' };
}

export async function llmCategorizeBatch(
  transactions: { business: string; amount: number }[],
  availableCategories: Category[],
  examples: Record<string, Category> = {}
): Promise<Record<string, import('../types').AiSuggestion>> {
  const { llmApiKey, llmProvider, llmModel } = useSettings.getState();

  const result: Record<string, import('../types').AiSuggestion> = {};
  if (!llmApiKey || transactions.length === 0) {
    transactions.forEach(t => result[t.business] = { category: 'אחר' });
    return result;
  }

  const prompt = `
You are an expert financial transaction categorizer for an Israeli user.
Classify each of the following business names into EXACTLY ONE of the provided categories.
Hints for Israeli businesses:
- Gas stations (פז, סונול, דלק, דור אלון), parking (פנגו, סלופארק) -> רכב - אנרגיה / רכב - תחזוקה
- Supermarkets (שופרסל, רמי לוי, יוחננוף, טיב טעם, am:pm) -> מזון וסופרמרקט
- Insurance (ביטוח ישיר, הראל, מנורה, מגדל, כלל) -> ביטוחים
- Pharmacies (סופר-פארם, Be, בתי מרקחת) -> בריאות ופארם
- Restaurants, cafes, Wolt, Ten Bis, Cibus -> מסעדות וקפה
- Online Shopping (AliExpress, SHEIN, Amazon, Temu) -> קניות אונליין

Available Categories (Strict List):
${availableCategories.map(c => `- ${c}`).join('\n')}

${Object.keys(examples).length > 0 ? `The user explicitly overrode the AI in the past for the following businesses. You MUST learn from these manual overrides:\n${Object.entries(examples).map(([b, c]) => `- "${b}" -> "${c}"`).join('\n')}\n\n` : ''}

Transactions to categorize:
${transactions.map(t => `- Business: "${t.business}", Amount: ${t.amount}`).join('\n')}

Return ONLY a valid JSON object where the keys are the exact business names, and the values are objects with "category" (string) and "confidence" (number 0-100 indicating how confident you are).
Example format:
{
  "business 1": {
    "category": "category 1",
    "confidence": 90
  }
}
  `.trim();

  try {
    if (llmProvider === 'gemini') {
      const activeModelString = llmModel === 'gemini-flash-latest' ? 'gemini-flash-lite-latest' : (llmModel || 'gemini-flash-lite-latest');
      const remainingFallback = GEMINI_FALLBACK_MODELS.filter(m => m !== activeModelString);
      const modelsToTry = [activeModelString, ...remainingFallback];

      const keys = [
        useSettings.getState().llmApiKey,
        useSettings.getState().llmApiKey2,
        useSettings.getState().llmApiKey3
      ].filter(Boolean) as string[];

      let lastError: Error | null = null;
      let data: any = null;
      let successfulModel = '';
      const failedModels: string[] = [];

      for (const model of modelsToTry) {
        useSettings.getState().update({ activeAiModel: model });
        const currentHistory = useSettings.getState().aiDebugHistory || [];
        useSettings.getState().update({
          aiDebugHistory: [...currentHistory, { model, prompt, response: '...', status: 'loading' }]
        });
        
        let modelSuccess = false;
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
            const res = await fetchWithRetry(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                  temperature: 0.1,
                  responseMimeType: "application/json",
                }
              })
            });
            if (res.status === 429) {
              throw new Error('RATE_LIMIT_429');
            }
            if (res.status === 503) {
              throw new Error('SERVICE_UNAVAILABLE_503');
            }
            data = await res.json();
            successfulModel = model;
            modelSuccess = true;
            break;
          } catch (err: any) {
            console.warn(`[LLM Categorizer] Key ${i+1} failed for model ${model}:`, err);
            lastError = err;
          }
        }

        if (modelSuccess) {
          // update history for success
          const hSuccess = useSettings.getState().aiDebugHistory || [];
          useSettings.getState().update({
            aiDebugHistory: hSuccess.map(h => h.model === model ? { ...h, response: data.candidates?.[0]?.content?.parts?.[0]?.text || JSON.stringify(data), status: 'success' } : h)
          });
          break; // if successful, exit loop
        } else {
          failedModels.push(model);
          // update history for failure
          const hFail = useSettings.getState().aiDebugHistory || [];
          useSettings.getState().update({
            failedAiModels: [...failedModels],
            aiDebugHistory: hFail.map(h => h.model === model ? { ...h, response: lastError?.message === 'TIMEOUT' ? `⏱ timeout (${MODEL_TIMEOUT_MS / 1000}s)` : (lastError?.message || String(lastError)), status: 'failed' } : h)
          });
        }
      }

      if (!data) {
        throw lastError || new Error('All models failed');
      }

      if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        const responseText = data.candidates[0].content.parts[0].text;
        let parsedText = responseText.trim();
        try {
          const parsed = extractJson(parsedText);
          transactions.forEach(t => {
            const b = t.business;
            if (parsed[b] && typeof parsed[b].category === 'string') {
              result[b] = parsed[b];
            } else {
              result[b] = { category: 'אחר' };
            }
          });
          return result;
        } catch (e: any) {
          console.error(`[LLM Categorizer] Failed to parse batch JSON from model ${successfulModel}. Raw response:\n${responseText}`);
          throw new Error(`JSON_PARSE_ERROR: Model ${successfulModel} returned invalid JSON. Response snippet: "${responseText.slice(0, 100)}..."`);
        }
      }
    } else if (llmProvider === 'openai') {
      const modelString = llmModel || 'gpt-4o-mini';
      const url = 'https://api.openai.com/v1/chat/completions';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${llmApiKey}`
        },
        body: JSON.stringify({
          model: modelString,
          messages: [
            { role: 'system', content: 'You are a categorizer. You must reply with JSON.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.1,
          response_format: { type: "json_object" }
        })
      });
      if (res.status === 429) {
        throw new Error('RATE_LIMIT_429');
      }
      if (res.status === 503) {
        throw new Error('SERVICE_UNAVAILABLE_503');
      }
      const data = await res.json();

      if (data.choices && data.choices[0]?.message?.content) {
        const parsedText = data.choices[0].message.content.trim();
        const parsed = JSON.parse(parsedText);
        transactions.forEach(t => {
          const b = t.business;
          if (parsed[b] && typeof parsed[b].category === 'string') {
            result[b] = parsed[b];
          } else {
            result[b] = { category: 'אחר' };
          }
        });
        return result;
      }
    }
  } catch (err: any) {
    console.error(`[LLM Categorizer] Failed to batch categorize:`, err);
    throw err;
  }

  transactions.forEach(t => { if (!result[t.business]) result[t.business] = { category: 'אחר' } });
  return result;
}
async function llmAnalyzeNewTransactionsChunk(
  transactions: import('../types').Transaction[],
  incomes: import('../types').IncomeEntry[],
  recurringCharges: import('../types').RecurringCharge[],
  availableCategories: import('../types').Category[],
  examples: Record<string, import('../types').Category> = {},
  abortSignal?: AbortSignal
): Promise<import('../types').AiBatchRecommendations & { log?: { prompt: string; response: string } }> {
  const { llmApiKey, llmProvider, llmModel } = useSettings.getState();

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
4. "incomesToDelete": An array of objects { "incomeId": string, "reason": string } for incomes that should be deleted because they are internal currency transfers, foreign currency purchases, or money moving between accounts (e.g., "המרת מטח", "העברה מחשבון מטח", "רכישת מטח", "מט"ח"). Reason MUST be in Hebrew (e.g., "העברה פנימית של מטח, לא הכנסה אמיתית").
5. "incomeCategorizations": A mapping of income source names to one of the strict types: ['משכורת', 'שכ"ד', 'פרילנס', 'דיבידנד', 'ריבית', 'אחר']. 
   CRITICAL: ONLY categorize incomes that are NOT in the "incomesToDelete" list! If an income is being deleted, DO NOT map it here.
   Note: Sources containing "מופת קבע", "צהל", or "משכורת" MUST be mapped to "משכורת".

Hints for Israeli businesses:
- Credit card aggregations (ANY business name containing "ישראכרט", "לאומי קארד", "כאל", "cal", "max", "ויזה", "אמריקן אקספרס", or "כרטיסי אשראי") MUST HAVE THEIR IDs ADDED TO "toDelete". This is non-negotiable!
- Internal currency transactions (e.g., "רכישת מטח", "רכישת מטח נוכחי", "המרת מטח", "העברה מחשבון מטח") MUST HAVE THEIR IDs ADDED TO "toDelete" (if expense) or "incomesToDelete" (if income). They are just moving money within the accounts and are NEVER real expenses or incomes!
- Gas stations (פז, סונול, דלק, דור אלון), parking (פנגו, סלופארק) -> רכב - אנרגיה / רכב - תחזוקה
- Supermarkets (שופרסל, רמי לוי, יוחננוף, טיב טעם, am:pm) -> מזון וסופרמרקט
- Insurance (ביטוח ישיר, הראל, מנורה, מגדל, כלל) -> ביטוחים
- Pharmacies (סופר-פארם, Be, בתי מרקחת) -> בריאות ופארם
- Restaurants, cafes, Wolt, Ten Bis, Cibus -> מסעדות וקפה
- Online Shopping (AliExpress, SHEIN, Amazon, Temu) -> קניות אונליין
- Checks ("משיכת שיק", "שיק מנותב", "צ'ק"): PRIORITIZE linking these to recurring rent charges in "toLink" based on amount and date, ignoring the check number. If no recurring charge matches, categorize as "דיור ושכר דירה". NEVER delete them.
Available Categories (Strict List):
${availableCategories.map(c => `- ${c}`).join('\n')}

${Object.keys(examples).length > 0 ? `The user explicitly overrode the AI in the past for the following businesses. You MUST learn from these manual overrides:\n${Object.entries(examples).map(([b, c]) => `- "${b}" -> "${c}"`).join('\n')}\n\n` : ''}

User's Active Recurring Charges (Subscriptions/Bills):
${recurringCharges.filter(r => r.active).map(r => `- ID: "${r.id}", Name: "${r.name}", Amount: ${r.amount}, Billing Day: ${r.dayOfMonth}`).join('\n')}

Newly Imported Transactions (Expenses) to Analyze:
${transactions.length === 0 ? 'None' : transactions.map(t => `- ID: "${t.id}", Business: "${t.business}", Amount: ${t.amount}, Date: ${t.date}`).join('\n')}

List of UNIQUE BUSINESSES you MUST categorize (unless deleted/linked). Do not skip ANY of these:
${[...new Set(transactions.map(t => t.business))].map(b => `- "${b}"`).join('\n')}

Newly Imported Incomes to Analyze:
${incomes.length === 0 ? 'None' : incomes.map(i => `- ID: "${i.id}", Source: "${i.source}", Amount: ${i.netAmount}, Date: ${i.date}`).join('\n')}

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
      const remainingFallback = GEMINI_FALLBACK_MODELS.filter(m => m !== activeModelString);
      const modelsToTry = [activeModelString, ...remainingFallback];

      const keys = [
        useSettings.getState().llmApiKey,
        useSettings.getState().llmApiKey2,
        useSettings.getState().llmApiKey3
      ].filter(Boolean) as string[];

      let lastError: Error | null = null;
      let data: any = null;
      let successfulModel = '';
      const failedModels: string[] = [];

      for (const model of modelsToTry) {
        useSettings.getState().update({ activeAiModel: model });
        const currentHistory = useSettings.getState().aiDebugHistory || [];
        useSettings.getState().update({
          aiDebugHistory: [...currentHistory, { model, prompt, response: '...', status: 'loading' }]
        });
        
        let modelSuccess = false;
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
            const res = await fetchWithRetry(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: abortSignal,
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                  temperature: 0.1,
                  responseMimeType: "application/json",
                }
              })
            });
            if (res.status === 429) throw new Error('RATE_LIMIT_429');
            if (res.status === 503) throw new Error('SERVICE_UNAVAILABLE_503');
            data = await res.json();
            successfulModel = model;
            modelSuccess = true;
            break;
          } catch (err: any) {
            console.warn(`[LLM Categorizer] Key ${i+1} failed for model ${model}:`, err);
            lastError = err;
          }
        }

        if (modelSuccess) {
          const hSuccess = useSettings.getState().aiDebugHistory || [];
          useSettings.getState().update({
            aiDebugHistory: hSuccess.map(h => h.model === model ? { ...h, response: data.candidates?.[0]?.content?.parts?.[0]?.text || JSON.stringify(data), status: 'success' } : h)
          });
          break;
        } else {
          failedModels.push(model);
          const hFail = useSettings.getState().aiDebugHistory || [];
          useSettings.getState().update({
            failedAiModels: [...failedModels],
            aiDebugHistory: hFail.map(h => h.model === model ? { ...h, response: lastError?.message === 'TIMEOUT' ? `⏱ timeout (${MODEL_TIMEOUT_MS / 1000}s)` : (lastError?.message || String(lastError)), status: 'failed' } : h)
          });
        }
      }

      if (!data) throw lastError || new Error('All models failed');

      if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        const responseText = data.candidates[0].content.parts[0].text;
        let parsedText = responseText.trim();
        try {
          const parsed = extractJson(parsedText);
          return {
            toDelete: Array.isArray(parsed.toDelete) ? parsed.toDelete : [],
            toLink: Array.isArray(parsed.toLink) ? parsed.toLink : [],
            categorizations: parsed.categorizations || {},
            incomesToDelete: Array.isArray(parsed.incomesToDelete) ? parsed.incomesToDelete : [],
            incomeCategorizations: parsed.incomeCategorizations || {},
            log: { prompt, response: responseText }
          };
        } catch (e: any) {
          console.error(`[LLM Categorizer] Failed to parse batch JSON from model ${successfulModel}. Raw response:\n${responseText}`);
          throw new Error(`JSON_PARSE_ERROR: Model ${successfulModel} returned invalid JSON. Response snippet: "${responseText.slice(0, 100)}..."`);
        }
      }
    } else if (llmProvider === 'openai') {
      const modelString = llmModel || 'gpt-4o-mini';
      const url = 'https://api.openai.com/v1/chat/completions';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${llmApiKey}`
        },
        body: JSON.stringify({
          model: modelString,
          messages: [
            { role: 'system', content: 'You are a categorizer. You must reply with JSON.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.1,
          response_format: { type: "json_object" }
        })
      });
      if (res.status === 429) throw new Error('RATE_LIMIT_429');
      if (res.status === 503) throw new Error('SERVICE_UNAVAILABLE_503');
      const data = await res.json();

      if (data.choices && data.choices[0]?.message?.content) {
        const responseText = data.choices[0].message.content;
        const parsed = JSON.parse(responseText);
        return {
          toDelete: Array.isArray(parsed.toDelete) ? parsed.toDelete : [],
          toLink: Array.isArray(parsed.toLink) ? parsed.toLink : [],
          categorizations: parsed.categorizations || {},
          incomesToDelete: Array.isArray(parsed.incomesToDelete) ? parsed.incomesToDelete : [],
          incomeCategorizations: parsed.incomeCategorizations || {},
          log: { prompt, response: responseText }
        };
      }
    }
  } catch (err: any) {
    console.error(`[LLM Categorizer] Failed to analyze new transactions:`, err);
    throw err;
  }

  return { toDelete: [], toLink: [], categorizations: {} };
}

export async function llmAnalyzeNewTransactions(
  transactions: import('../types').Transaction[],
  incomes: import('../types').IncomeEntry[],
  recurringCharges: import('../types').RecurringCharge[],
  availableCategories: import('../types').Category[],
  examples: Record<string, import('../types').Category> = {},
  abortSignal?: AbortSignal
): Promise<import('../types').AiBatchRecommendations & { log?: { prompt: string; response: string } }> {
  const { llmApiKey } = useSettings.getState();
  if (!llmApiKey || (transactions.length === 0 && incomes.length === 0)) {
    return { toDelete: [], toLink: [], categorizations: {} };
  }

  // Combine and chunk to max 40 items total
  const combinedItems: (
    | { type: 'tx'; data: import('../types').Transaction }
    | { type: 'inc'; data: import('../types').IncomeEntry }
  )[] = [
    ...transactions.map(t => ({ type: 'tx' as const, data: t })),
    ...incomes.map(i => ({ type: 'inc' as const, data: i }))
  ];

  const merged: import('../types').AiBatchRecommendations & { log?: { prompt: string; response: string } } = {
    toDelete: [],
    toLink: [],
    categorizations: {},
    incomesToDelete: [],
    incomeCategorizations: {},
  };

  const logs: string[] = [];

  // Run chunks sequentially
  for (let i = 0; i < combinedItems.length; i += 40) {
    const chunk = combinedItems.slice(i, i + 40);
    const chunkTx = chunk.filter(x => x.type === 'tx').map(x => x.data);
    const chunkInc = chunk.filter(x => x.type === 'inc').map(x => x.data);

    const res = await llmAnalyzeNewTransactionsChunk(
      chunkTx,
      chunkInc,
      recurringCharges,
      availableCategories,
      examples,
      abortSignal
    );

    merged.toDelete.push(...res.toDelete);
    merged.toLink.push(...res.toLink);
    Object.assign(merged.categorizations, res.categorizations);
    if (res.incomesToDelete) {
      merged.incomesToDelete!.push(...res.incomesToDelete);
    }
    if (res.incomeCategorizations) {
      Object.assign(merged.incomeCategorizations!, res.incomeCategorizations);
    }
    if (res.log) {
      logs.push(`--- Chunk ${Math.floor(i / 40) + 1} ---\nPrompt:\n${res.log.prompt}\nResponse:\n${res.log.response}`);
    }
  }

  if (logs.length > 0) {
    merged.log = {
      prompt: `Combined ${logs.length} chunks`,
      response: logs.join('\n\n')
    };
  }

  return merged;
}
