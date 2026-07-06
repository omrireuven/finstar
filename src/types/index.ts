// Dynamic — runtime categories are stored in Zustand; this type is open-ended
export type Category = string;

export interface CategoryDef {
  id: string;
  name: string;
  color: string;
  isBuiltIn: boolean;
}

export interface AiSuggestion {
  category: Category;
  confidence?: number;
  originalCategory?: Category;
}

export interface AiBatchRecommendations {
  toDelete: { transactionId: string; reason: string }[];
  toLink: { transactionId: string; recurringId: string; reason: string }[];
  categorizations: Record<string, { category: Category; confidence: number }>;
  incomesToDelete?: { incomeId: string; reason: string }[];
  incomeCategorizations?: Record<string, IncomeEntry['type']>;
  log?: any;
}

export interface TransactionMetadata {
  identifier?: string | number;
  processedDate?: string;
  originalAmount?: number;
  originalCurrency?: string;
  chargedAmount?: number;
  chargedCurrency?: string;
  status?: string;
  memo?: string;
  installments?: {
    number: number;
    total: number;
  };
}

export interface Transaction {
  id: string;
  date: string;
  business: string;
  amount: number;
  currency: string;
  category: Category;
  isRecurring: boolean;
  source: string;
  notes: string;
  pending: boolean;
  categoryOverride?: Category;
  aiCategorized: boolean;
  aiProcessed?: boolean; // whether this has been through the batch AI recommendations (delete/link) pipeline
  aiRecommendation?: string; // specific recommendation text for this transaction (e.g. "Delete duplicate", "Link to recurring")
  aiLog?: { prompt: string; response: string }; // stores the batch prompt/response for this transaction
  aiConfidence?: number; // confidence score (0-100) from AI categorization
  recurringId?: string;  // links this transaction to a RecurringCharge occurrence
  isVirtual?: boolean;   // true = synthesised from recurring charge, not persisted
  metadata?: TransactionMetadata; // additional raw data from bank scraper
}

/** Per-month override for a single recurring charge occurrence */
export interface RecurringOccurrenceOverride {
  amount?: number;         // actual amount paid (if different from default)
  note?: string;           // free-text note about this occurrence
  transactionId?: string;  // ID of the matching Transaction in expenses
  dismissed?: boolean;     // user explicitly skipped this virtual occurrence
}

export interface RecurringCharge {
  id: string;
  name: string;
  category: Category;
  amount: number;
  dayOfMonth: number;
  card: string;
  active: boolean;
  /** 'permanent' = ongoing with no end (Netflix, rent). No occurrence list.
   *  'periodic'  = finite installments with a known end date (phone plan, gym contract).
   *  Defaults to 'permanent' when absent (backward-compat). */
  chargeType?: 'permanent' | 'periodic';
  cancelUrl?: string;
  startDate?: string; // YYYY-MM-DD — required by UI, optional in type for compat
  endDate?: string;   // YYYY-MM-DD — required for periodic
  occurrenceOverrides?: Record<string, RecurringOccurrenceOverride>; // key: YYYY-MM
}

export interface Goal {
  id: string;
  category: Category;
  targetAmount: number;
}

export interface PortfolioLot {
  id: string;
  ticker: string;
  name: string;
  sector: string;
  buyDate: string;
  quantity: number;
  buyPrice: number;
  commission: number;
  sellDate?: string;
  sellPrice?: number;
  currency: string;
}

export interface SavingsAccount {
  id: string;
  bank: string;
  name: string;
  amount: number;
  interestRate: number;
  maturityDate: string;
  openDate: string;
  open: boolean;
  link?: string;
  logoUrl?: string;
}

export interface GemelFund {
  id: string;
  name: string;
  company: string;
  balance: number;
  track: string;
  /** דמי ניהול מצבירה — % שנתי מהיתרה */
  managementFee: number;
  /** דמי ניהול מהפקדות — % מכל הפקדה חדשה */
  depositFee: number;
  /** תשואה — כפי שמופיעה בפורטל הקרן (כוללת ריבית דריבית) */
  annualReturn: number;
  /** % of salary employee contributes */
  employeeContribution: number;
  /** % of salary employer contributes */
  employerContribution: number;
  /** Gross salary basis for monthly deposit calculation */
  salary: number;
  link?: string;
  logoUrl?: string;
}

export interface HishtalmutFund {
  id: string;
  name: string;
  company: string;
  balance: number;
  track: string;
  managementFee: number;
  /** Annual return % — cumulative is computed via compound interest from openDate */
  annualReturn: number;
  /** % of salary employee contributes (typically 2.5%) */
  employeeContribution: number;
  /** % of salary employer contributes (typically 7.5%) */
  employerContribution: number;
  /** Gross salary basis for monthly deposit calculations */
  salary: number;
  /** Date deposits started (YYYY-MM-DD) — determines 6-year lock expiry */
  openDate?: string;
  link?: string;
  logoUrl?: string;
}

export interface PensionFund {
  id: string;
  name: string;
  company: string;
  balance: number;
  track: string;
  managementFee: number;
  employeeContribution: number;
  employerContribution: number;
  compensationContribution: number;
  retirementAge: number;
  birthYear: number;
  salary: number;         // gross salary basis for contribution calculations
  expectedReturn: number; // expected annual return % for projection
  link?: string;
  logoUrl?: string;
}

export interface IncomeEntry {
  id: string;
  date: string;
  source: string;
  type: 'משכורת' | 'שכ"ד' | 'פרילנס' | 'דיבידנד' | 'ריבית' | 'אחר';
  grossAmount?: number;
  netAmount: number;
  recurring: boolean;
}

export interface JournalEntry {
  id: string;
  year: number;
  month: number;
  score: number;
  narrative: string;
  totalExpenses: number;
  totalIncome: number;
  saved: number;
  goalsAchieved: number;
  totalGoals: number;
}

export interface Alert {
  id: string;
  type: 'warning' | 'info' | 'danger';
  message: string;
  link?: string;
  date: string;
}

export interface BankLoginField {
  name: string;
  label: string;
  type: 'text' | 'password';
}

export interface BankCompanyMeta {
  id: string;
  name: string;
  originalName: string;
  loginFields: BankLoginField[];
}

export interface SyncLog {
  date: string;
  status: 'success' | 'error';
  txnCount?: number;
  errorMessage?: string;
}

export interface BankAccountConfig {
  id: string;
  companyId: string;         // e.g. 'leumi', 'visaCal'
  companyName: string;       // Hebrew display name
  nickname: string;          // user-defined nickname
  credentials: Record<string, string>; // dynamic per company
  lastSync?: string;         // ISO date string
  lastSyncStatus?: 'success' | 'error';
  lastSyncError?: string;
  lastSyncTxnCount?: number; // how many transactions were imported
  syncLogs?: SyncLog[];      // history of syncs
}

// Static built-in palette — used for initialization only; runtime colors come from the store
export const CATEGORY_COLORS: Record<string, string> = {
  'דיור': '#0891b2',
  'חשבונות שוטפים': '#ef4444',
  'ביטוחים': '#6b7280',
  'רכב - אנרגיה': '#f59e0b',
  'רכב - תחזוקה': '#f97316',
  'מזון וסופרמרקט': '#22c55e',
  'מסעדות וקפה': '#fbbf24',
  'בריאות ופארם': '#ec4899',
  'קניות כלליות': '#d97706',
  'קניות אונליין': '#f472b6',
  'חינוך ואקדמיה': '#166534',
  'העשרה והסמכות': '#0ea5e9',
  'תוכנה ושירותי ענן': '#6366f1',
  'מנויים ובידור': '#7c3aed',
  'תחביבים ופרויקטים אישיים': '#a855f7',
  'חופשות וטיולים': '#14b8a6',
  'מתנות ואירועים': '#f43f5e',
  'חיסכון והשקעות': '#84cc16',
  'ממשלתי ופיננסי': '#374151',
  'אחר (בלתי מתוכנן)': '#9ca3af',
};

// Static ordered list — used for store initialization only
export const ALL_CATEGORIES: string[] = [
  'דיור', 'חשבונות שוטפים', 'ביטוחים',
  'רכב - אנרגיה', 'רכב - תחזוקה',
  'מזון וסופרמרקט', 'מסעדות וקפה', 'בריאות ופארם', 'קניות כלליות', 'קניות אונליין',
  'חינוך ואקדמיה', 'העשרה והסמכות', 'תוכנה ושירותי ענן',
  'מנויים ובידור', 'תחביבים ופרויקטים אישיים', 'חופשות וטיולים', 'מתנות ואירועים',
  'חיסכון והשקעות', 'ממשלתי ופיננסי', 'אחר (בלתי מתוכנן)'
];
