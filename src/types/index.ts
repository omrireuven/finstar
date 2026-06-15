// Dynamic — runtime categories are stored in Zustand; this type is open-ended
export type Category = string;

export interface CategoryDef {
  id: string;
  name: string;
  color: string;
  isBuiltIn: boolean;
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
  recurringId?: string;  // links this transaction to a RecurringCharge occurrence
  isVirtual?: boolean;   // true = synthesised from recurring charge, not persisted
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

// Static built-in palette — used for initialization only; runtime colors come from the store
export const CATEGORY_COLORS: Record<string, string> = {
  'מזון וסופרמרקט': '#22c55e',
  'מסעדות וקפה': '#f97316',
  'תחבורה': '#3b82f6',
  'דיור': '#0891b2',
  'שירותים': '#ef4444',
  'תקשורת': '#8b5cf6',
  'מנויים ובידור': '#7c3aed',
  'בריאות': '#ec4899',
  'קניות': '#d97706',
  'ביטוח': '#6b7280',
  'חינוך': '#166534',
  'ממשלתי': '#374151',
  'אחר': '#9ca3af',
};

// Static ordered list — used for store initialization only
export const ALL_CATEGORIES: string[] = [
  'מזון וסופרמרקט', 'מסעדות וקפה', 'תחבורה', 'דיור',
  'שירותים', 'תקשורת', 'מנויים ובידור', 'בריאות',
  'קניות', 'ביטוח', 'חינוך', 'ממשלתי', 'אחר',
];
