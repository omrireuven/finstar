import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useMemo } from 'react';
import type {
  Transaction, RecurringCharge, RecurringOccurrenceOverride,
  PortfolioLot, SavingsAccount,
  GemelFund, PensionFund, IncomeEntry, Goal, JournalEntry, Category, CategoryDef,
} from '../types';
import { ALL_CATEGORIES, CATEGORY_COLORS } from '../types';
import {
  mockTransactions, mockRecurring, mockLots, mockPrices, mockSavings,
  mockGemel, mockPension, mockIncome, mockGoals, mockJournal, USD_ILS,
} from '../data/mockData';
import { nanoid } from '../utils/nanoid';

// ── Built-in categories (used as initial store state) ────────────────────────
const INITIAL_CATEGORIES: CategoryDef[] = ALL_CATEGORIES.map((name, i) => ({
  id: `cat-builtin-${i + 1}`,
  name,
  color: CATEGORY_COLORS[name] ?? '#9ca3af',
  isBuiltIn: true,
}));

interface FinstarState {
  transactions: Transaction[];
  recurring: RecurringCharge[];
  lots: PortfolioLot[];
  prices: Record<string, number>;
  usdIls: number;
  savings: SavingsAccount[];
  gemel: GemelFund[];
  pension: PensionFund[];
  income: IncomeEntry[];
  goals: Goal[];
  journal: JournalEntry[];
  lastPriceUpdate: string;
  categories: CategoryDef[];
  categoryRules: Record<string, Category>; // business name → category

  addTransactions: (txns: Transaction[]) => void;
  updateTransaction: (id: string, patch: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;
  overrideCategory: (id: string, category: Category) => void;

  addRecurring: (r: RecurringCharge) => void;
  updateRecurring: (id: string, patch: Partial<RecurringCharge>) => void;
  deleteRecurring: (id: string) => void;
  toggleRecurring: (id: string) => void;
  setRecurringOccurrence: (id: string, monthKey: string, data: Partial<RecurringOccurrenceOverride> | null) => void;

  addLot: (lot: Omit<PortfolioLot, 'id'>) => void;
  updateLot: (id: string, patch: Partial<PortfolioLot>) => void;
  deleteLot: (id: string) => void;
  updatePrices: (prices: Record<string, number>) => void;

  addSavings: (s: Omit<SavingsAccount, 'id'>) => void;
  updateSavings: (id: string, patch: Partial<SavingsAccount>) => void;
  deleteSavings: (id: string) => void;

  updateGemel: (id: string, patch: Partial<GemelFund>) => void;
  addGemel: (g: Omit<GemelFund, 'id'>) => void;
  deleteGemel: (id: string) => void;

  updatePension: (id: string, patch: Partial<PensionFund>) => void;

  addIncome: (e: Omit<IncomeEntry, 'id'>) => void;
  updateIncome: (id: string, patch: Partial<IncomeEntry>) => void;
  deleteIncome: (id: string) => void;

  setGoal: (category: Category, amount: number) => void;
  deleteGoal: (id: string) => void;

  addCategory: (name: string, color: string) => void;
  updateCategory: (id: string, patch: { name?: string; color?: string }) => void;
  removeCategory: (id: string) => void;

  /** Save a business→category rule and retroactively update all matching transactions. */
  setCategoryRule: (business: string, category: Category) => void;
  deleteCategoryRule: (business: string) => void;

  resetAllData: () => void;

  addJournalEntry: (e: Omit<JournalEntry, 'id'>) => void;
}

export const useStore = create<FinstarState>()(
  persist(
    (set) => ({
      transactions: mockTransactions,
      recurring: mockRecurring,
      lots: mockLots,
      prices: mockPrices,
      usdIls: USD_ILS,
      savings: mockSavings,
      gemel: mockGemel,
      pension: mockPension,
      income: mockIncome,
      goals: mockGoals,
      journal: mockJournal,
      lastPriceUpdate: '',
      categories: INITIAL_CATEGORIES,
      categoryRules: {},

      addTransactions: (txns) =>
        set((s) => {
          const existingKeys = new Set(s.transactions.map((t) => `${t.date}-${t.business}-${t.amount}`));
          const fresh = txns
            .filter((t) => !existingKeys.has(`${t.date}-${t.business}-${t.amount}`))
            .map((t) => {
              const ruleCategory = s.categoryRules[t.business];
              // '__manual__' = user wants to categorize this business manually every time
              if (ruleCategory && ruleCategory !== '__manual__') {
                return { ...t, category: ruleCategory, categoryOverride: ruleCategory, aiCategorized: false };
              }
              return t;
            });
          return { transactions: [...s.transactions, ...fresh] };
        }),

      updateTransaction: (id, patch) =>
        set((s) => ({ transactions: s.transactions.map((t) => t.id === id ? { ...t, ...patch } : t) })),

      deleteTransaction: (id) =>
        set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) })),

      overrideCategory: (id, category) =>
        set((s) => ({ transactions: s.transactions.map((t) => t.id === id ? { ...t, category, categoryOverride: category, aiCategorized: false } : t) })),

      addRecurring: (r) => set((s) => ({ recurring: [...s.recurring, r] })),
      updateRecurring: (id, patch) =>
        set((s) => ({ recurring: s.recurring.map((r) => r.id === id ? { ...r, ...patch } : r) })),
      deleteRecurring: (id) =>
        set((s) => ({ recurring: s.recurring.filter((r) => r.id !== id) })),
      toggleRecurring: (id) =>
        set((s) => ({ recurring: s.recurring.map((r) => r.id === id ? { ...r, active: !r.active } : r) })),

      setRecurringOccurrence: (id, monthKey, data) =>
        set((s) => ({
          recurring: s.recurring.map((r) => {
            if (r.id !== id) return r;
            const overrides = { ...(r.occurrenceOverrides ?? {}) };
            if (data === null) {
              delete overrides[monthKey];
            } else {
              overrides[monthKey] = { ...overrides[monthKey], ...data };
            }
            return { ...r, occurrenceOverrides: overrides };
          }),
        })),

      addLot: (lot) => set((s) => ({ lots: [...s.lots, { ...lot, id: nanoid() }] })),
      updateLot: (id, patch) =>
        set((s) => ({ lots: s.lots.map((l) => l.id === id ? { ...l, ...patch } : l) })),
      deleteLot: (id) => set((s) => ({ lots: s.lots.filter((l) => l.id !== id) })),
      updatePrices: (prices) => set({ prices, lastPriceUpdate: new Date().toISOString() }),

      addSavings: (sv) => set((s) => ({ savings: [...s.savings, { ...sv, id: nanoid() }] })),
      updateSavings: (id, patch) =>
        set((s) => ({ savings: s.savings.map((sv) => sv.id === id ? { ...sv, ...patch } : sv) })),
      deleteSavings: (id) => set((s) => ({ savings: s.savings.filter((sv) => sv.id !== id) })),

      addGemel: (g) => set((s) => ({ gemel: [...s.gemel, { ...g, id: nanoid() }] })),
      updateGemel: (id, patch) =>
        set((s) => ({ gemel: s.gemel.map((g) => g.id === id ? { ...g, ...patch } : g) })),
      deleteGemel: (id) => set((s) => ({ gemel: s.gemel.filter((g) => g.id !== id) })),

      updatePension: (id, patch) =>
        set((s) => ({ pension: s.pension.map((p) => p.id === id ? { ...p, ...patch } : p) })),

      addIncome: (e) => set((s) => ({ income: [...s.income, { ...e, id: nanoid() }] })),
      updateIncome: (id, patch) =>
        set((s) => ({ income: s.income.map((e) => e.id === id ? { ...e, ...patch } : e) })),
      deleteIncome: (id) => set((s) => ({ income: s.income.filter((e) => e.id !== id) })),

      setGoal: (category, amount) =>
        set((s) => {
          const existing = s.goals.find((g) => g.category === category);
          if (existing) {
            return { goals: s.goals.map((g) => g.id === existing.id ? { ...g, targetAmount: amount } : g) };
          }
          return { goals: [...s.goals, { id: nanoid(), category, targetAmount: amount }] };
        }),

      deleteGoal: (id) => set((s) => ({ goals: s.goals.filter((g) => g.id !== id) })),

      addCategory: (name, color) =>
        set((s) => ({ categories: [...s.categories, { id: nanoid(), name, color, isBuiltIn: false }] })),

      updateCategory: (id, patch) =>
        set((s) => {
          const cat = s.categories.find((c) => c.id === id);
          if (!cat) return s;
          const newName = patch.name ?? cat.name;
          const nameChanged = !!patch.name && patch.name !== cat.name;
          return {
            categories: s.categories.map((c) => c.id === id ? { ...c, ...patch } : c),
            transactions: nameChanged
              ? s.transactions.map((t) => t.category === cat.name ? { ...t, category: newName } : t)
              : s.transactions,
            recurring: nameChanged
              ? s.recurring.map((r) => r.category === cat.name ? { ...r, category: newName } : r)
              : s.recurring,
            goals: nameChanged
              ? s.goals.map((g) => g.category === cat.name ? { ...g, category: newName } : g)
              : s.goals,
          };
        }),

      removeCategory: (id) =>
        set((s) => {
          const cat = s.categories.find((c) => c.id === id);
          if (!cat || cat.name === 'אחר') return s; // keep 'אחר' as the fallback
          return {
            categories: s.categories.filter((c) => c.id !== id),
            transactions: s.transactions.map((t) => t.category === cat.name ? { ...t, category: 'אחר' } : t),
            recurring: s.recurring.map((r) => r.category === cat.name ? { ...r, category: 'אחר' } : r),
            goals: s.goals.filter((g) => g.category !== cat.name),
          };
        }),

      setCategoryRule: (business, category) =>
        set((s) => ({
          categoryRules: { ...s.categoryRules, [business]: category },
          transactions: s.transactions.map((t) =>
            t.business === business
              ? { ...t, category, categoryOverride: category, aiCategorized: false }
              : t
          ),
        })),

      deleteCategoryRule: (business) =>
        set((s) => {
          const rules = { ...s.categoryRules };
          delete rules[business];
          return { categoryRules: rules };
        }),

      resetAllData: () =>
        set({
          transactions: [],
          recurring: [],
          lots: [],
          prices: {},
          usdIls: USD_ILS,
          savings: [],
          gemel: [],
          pension: [],
          income: [],
          goals: [],
          journal: [],
          lastPriceUpdate: '',
          categoryRules: {},
          // categories kept — user configured them
        }),

      addJournalEntry: (e) => set((s) => ({
        journal: [...s.journal.filter((j) => !(j.year === e.year && j.month === e.month)), { ...e, id: nanoid() }],
      })),
    }),
    { name: 'finstar-store' }
  )
);

// ── Category hooks ────────────────────────────────────────────────────────────

/** Returns category names in stored order (built-ins first, then custom). */
export function useCategoryList(): string[] {
  const cats = useStore((s) => s.categories);
  return useMemo(() => cats.map((c) => c.name), [cats]);
}

/** Returns a name→color map for all categories (built-ins + custom). */
export function useCategoryColorMap(): Record<string, string> {
  const cats = useStore((s) => s.categories);
  return useMemo(
    () => Object.fromEntries(cats.map((c) => [c.name, c.color])),
    [cats],
  );
}

// ── All-transactions selector (real + virtual from recurring charges) ─────────

/** Generate all YYYY-MM strings from `from` to `to` (inclusive). */
function genMonths(fromYYYYMM: string, toYYYYMM: string): string[] {
  const result: string[] = [];
  let [y, m] = fromYYYYMM.split('-').map(Number);
  const [ey, em] = toYYYYMM.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    result.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) { m = 1; y++; }
  }
  return result;
}

/**
 * Returns real transactions merged with virtual ones synthesised from active
 * recurring charges.  A virtual entry is suppressed for a given month when a
 * real transaction already has `recurringId` pointing to that charge
 * (i.e. the user already linked or confirmed the occurrence).
 */
export function useAllTransactions(): Transaction[] {
  const transactions = useStore((s) => s.transactions);
  const recurring    = useStore((s) => s.recurring);

  return useMemo(() => {
    const today  = new Date();
    const nowKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    // (recurringId|monthKey) pairs already covered by a linked real transaction
    const covered = new Set<string>();
    for (const t of transactions) {
      if (t.recurringId) covered.add(`${t.recurringId}|${t.date.slice(0, 7)}`);
    }

    const virtual: Transaction[] = [];

    for (const rec of recurring) {
      if (!rec.active) continue;

      // Start month — if no startDate, only generate for the current month
      const startKey = rec.startDate ? rec.startDate.slice(0, 7) : nowKey;

      // End month
      const endKey = (rec.chargeType === 'periodic' && rec.endDate)
        ? rec.endDate.slice(0, 7)
        : nowKey;

      for (const mk of genMonths(startKey, endKey)) {
        // Already handled by a real linked transaction
        if (covered.has(`${rec.id}|${mk}`)) continue;
        // Occurrence override explicitly tied to a real transaction
        if (rec.occurrenceOverrides?.[mk]?.transactionId) continue;
        // User explicitly dismissed this occurrence
        if (rec.occurrenceOverrides?.[mk]?.dismissed) continue;

        const override  = rec.occurrenceOverrides?.[mk];
        const [my, mm]  = mk.split('-').map(Number);
        const maxDay    = new Date(my, mm, 0).getDate();
        const day       = Math.min(rec.dayOfMonth, maxDay);
        const date      = `${mk}-${String(day).padStart(2, '0')}`;

        // Only show once the charge date has arrived (today counts as passed)
        if (new Date(date + 'T23:59:59') > today) continue;

        const amount    = override?.amount ?? rec.amount;

        virtual.push({
          id:            `virt-${rec.id}-${mk}`,
          date,
          business:      rec.name,
          amount,
          currency:      'ILS',
          category:      rec.category,
          isRecurring:   true,
          source:        rec.card,
          notes:         override?.note ?? '',
          pending:       false,
          aiCategorized: false,
          recurringId:   rec.id,
          isVirtual:     true,
        });
      }
    }

    return [...transactions, ...virtual];
  }, [transactions, recurring]);
}

// ── Portfolio selector ────────────────────────────────────────────────────────

// Selectors — use primitive subscriptions + useMemo to avoid getSnapshot loop
export const usePortfolioSummary = () => {
  const lots   = useStore((s) => s.lots);
  const prices = useStore((s) => s.prices);
  const usdIls = useStore((s) => s.usdIls);

  return useMemo(() => {
    const byTicker: Record<string, { ticker: string; name: string; sector: string; quantity: number; cost: number; currency: string }> = {};

    for (const lot of lots.filter((l) => !l.sellDate)) {
      if (!byTicker[lot.ticker]) {
        byTicker[lot.ticker] = { ticker: lot.ticker, name: lot.name, sector: lot.sector, quantity: 0, cost: 0, currency: lot.currency };
      }
      byTicker[lot.ticker].quantity += lot.quantity;
      // cost accumulated in native currency (USD lots → USD, ILS lots → ILS)
      byTicker[lot.ticker].cost += lot.quantity * lot.buyPrice + lot.commission;
    }

    const rows = Object.values(byTicker).map((r) => {
      const price = prices[r.ticker] ?? 0;
      const rate  = r.currency === 'USD' ? usdIls : 1;

      // Native-currency values (no conversion)
      const currentValueNative = r.quantity * price;         // in USD or ILS
      const costNative         = r.cost;                     // in USD or ILS
      const pnlNative          = currentValueNative - costNative;
      const pnlPct             = costNative > 0 ? (pnlNative / costNative) * 100 : 0;

      // ILS-equivalent values (for cross-currency totals and dashboard)
      const currentValueILS = currentValueNative * rate;
      const costILS         = costNative * rate;
      const pnlILS          = pnlNative * rate;

      return {
        ...r,
        price,
        // ── Native currency (display primary) ──
        currentValueNative,
        costNative,
        pnlNative,
        avgCost: costNative / r.quantity,   // per share, native currency
        // ── ILS-equivalent (totals, chart, dashboard) ──
        currentValue: currentValueILS,       // backward compat alias
        currentValueILS,
        pnl: pnlILS,                         // backward compat alias
        pnlILS,
        pnlPct,
      };
    });

    // Totals: native per currency + combined ILS
    const totalValue     = rows.reduce((a, r) => a + r.currentValueILS, 0);
    const totalNativeUSD = rows.filter((r) => r.currency === 'USD').reduce((a, r) => a + r.currentValueNative, 0);
    const totalNativeILS = rows.filter((r) => r.currency === 'ILS').reduce((a, r) => a + r.currentValueNative, 0);

    return { rows, totalValue, totalNativeUSD, totalNativeILS };
  }, [lots, prices, usdIls]);
};
