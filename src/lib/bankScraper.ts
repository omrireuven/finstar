import type { Transaction, BankCompanyMeta, IncomeEntry } from '../types';
import { categorize } from '../utils/categorizer';

// ── API base ─────────────────────────────────────────────────────────────────

const SCRAPE_API = '/api/scrape';

// ── Fetch supported companies ────────────────────────────────────────────────

export async function fetchSupportedCompanies(): Promise<BankCompanyMeta[]> {
  const res = await fetch(`${SCRAPE_API}/companies`);
  if (!res.ok) throw new Error('Failed to fetch companies');
  const data = await res.json();
  return data.companies;
}

// ── Health check ─────────────────────────────────────────────────────────────

export async function checkScraperHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${SCRAPE_API}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch (e) {
    return false;
  }
}

// ── Scrape bank transactions ─────────────────────────────────────────────────

export interface ScrapeResult {
  success: boolean;
  accounts?: {
    accountNumber: string;
    balance?: number;
    txns: ScrapedTxn[];
  }[];
  errorType?: string;
  errorMessage?: string;
}

interface ScrapedTxn {
  type: string;
  identifier?: number;
  date: string;
  processedDate: string;
  originalAmount: number;
  originalCurrency: string;
  chargedAmount: number;
  chargedCurrency: string;
  description: string;
  memo: string | null;
  installments?: { number: number; total: number };
  status: string;
}

export async function scrapeBank(
  companyId: string,
  credentials: Record<string, string>,
  startDate?: string,
): Promise<ScrapeResult> {
  const res = await fetch(`${SCRAPE_API}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, credentials, startDate }),
  });

  const data = await res.json();
  return data;
}

// ── Map scraped transactions to Finstar format ───────────────────────────────

let _idCounter = 0;
function genId(): string {
  return `bank-${Date.now()}-${++_idCounter}`;
}

/**
 * Convert scraped bank transactions to Finstar Transaction objects.
 * Applies existing categoryRules for auto-categorization.
 */
export async function mapScrapedTransactions(
  scraped: ScrapeResult,
  companyId: string,
  companyName: string,
  categoryRules: Record<string, string>,
): Promise<{ expenses: Transaction[]; incomes: IncomeEntry[] }> {
  if (!scraped.success || !scraped.accounts) return { expenses: [], incomes: [] };

  const expenses: Transaction[] = [];
  const incomes: IncomeEntry[] = [];

  for (const account of scraped.accounts) {
    for (const txn of account.txns) {
      const business = txn.description || 'ללא תיאור';
      const date = txn.date ? txn.date.slice(0, 10) : new Date().toISOString().slice(0, 10);
      
      // User rule: Only positive amounts from BANKS go to Incomes page.
      // Credit card positive amounts (refunds) stay in Expenses page as negative amounts.
      const BANKS = ['hapoalim', 'leumi', 'mizrahi', 'discount', 'mercantile', 'otsarHahayal', 'union', 'beinleumi', 'massad', 'yahav', 'oneZero', 'pagi'];
      const isBank = BANKS.includes(companyId);
      
      const isIncome = isBank && (txn.chargedAmount > 0);
      const isCreditCardRefund = !isBank && (txn.chargedAmount > 0);

      if (isIncome) {
        incomes.push({
          id: genId(),
          date,
          source: business,
          type: 'אחר',
          netAmount: Math.abs(txn.chargedAmount),
          recurring: false
        });
        continue;
      }

      // Expenses (or Credit Card Refunds)
      let amount = Math.abs(txn.chargedAmount);
      if (isCreditCardRefund) {
        amount = -amount; // Store refund as a negative expense
      }
      
      // Auto-categorize via existing rules
      const ruleCategory = categoryRules[business];
      let category = (ruleCategory && ruleCategory !== '__manual__') ? ruleCategory : undefined;
      
      if (!category) {
        const { category: baseCat } = categorize(business);
        if (baseCat !== 'אחר') {
          category = baseCat;
        } else {
          category = 'אחר'; // fallback to Other, user can use AI batch process
        }
      }

      // Build installment note
      let notes = txn.memo || '';
      if (txn.installments) {
        const instNote = `תשלום ${txn.installments.number}/${txn.installments.total}`;
        notes = notes ? `${notes} | ${instNote}` : instNote;
      }
      if (account.accountNumber) {
        const accNote = `חשבון: ${account.accountNumber}`;
        notes = notes ? `${notes} | ${accNote}` : accNote;
      }

      const currency = txn.originalCurrency === 'ILS' ? 'ILS' :
                       txn.originalCurrency === 'USD' ? 'USD' :
                       txn.originalCurrency || 'ILS';

      expenses.push({
        id: genId(),
        date,
        business,
        amount,
        currency,
        category,
        isRecurring: false,
        source: companyName,
        notes,
        pending: false, // Automatically approve all scraped transactions per user request
        aiCategorized: false,
        aiProcessed: false, // Needs AI batch processing
        categoryOverride: (ruleCategory && ruleCategory !== '__manual__') ? ruleCategory : undefined,
        metadata: {
          identifier: txn.identifier,
          processedDate: txn.processedDate,
          originalAmount: txn.originalAmount,
          originalCurrency: txn.originalCurrency,
          chargedAmount: txn.chargedAmount,
          chargedCurrency: txn.chargedCurrency,
          status: txn.status,
          memo: txn.memo || undefined,
          installments: txn.installments,
        }
      });
    }
  }

  return { expenses, incomes };
}

// ── Error message translation ────────────────────────────────────────────────

const ERROR_MESSAGES: Record<string, string> = {
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

export function getErrorMessage(errorType?: string): string {
  if (!errorType) return 'שגיאה לא ידועה';
  return ERROR_MESSAGES[errorType] || `שגיאה: ${errorType}`;
}
