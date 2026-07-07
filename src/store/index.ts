import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

const apiUrl = typeof window === 'undefined' ? 'http://localhost:3002/api/db' : '/api/db';

let pendingSaves = 0;
let isSaving = false;
let nextSaveValue: string | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (pendingSaves > 0) {
      e.preventDefault();
      e.returnValue = 'הנתונים עדיין נשמרים, האם אתה בטוח שברצונך לצאת?';
      return e.returnValue;
    }
  });
}

const serverStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const res = await fetch(apiUrl, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      const data = await res.json();
      if (!data || Object.keys(data).length === 0 || data.state === null) {
        console.log('Server returned empty data, migrating from local storage if available');
        if (typeof window !== 'undefined' && window.localStorage) {
          const localData = window.localStorage.getItem(name);
          if (localData) {
            // Migrate local data to server
            fetch(apiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: localData,
            }).catch(e => console.error('Migration failed:', e));
            return localData;
          }
        }
        return null;
      }
      return JSON.stringify(data);
    } catch (e) {
      console.warn('Failed to fetch from server db (server might be down). Halting app to prevent data wipe.', e);
      alert('השרת לא זמין. אנא רענן את העמוד בעוד מספר שניות כדי למנוע אובדן נתונים.');
      // Hang hydration forever so Zustand doesn't initialize with empty state and overwrite the DB
      return await new Promise(() => {});
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    nextSaveValue = value;
    if (isSaving) return;
    
    isSaving = true;
    pendingSaves++;
    
    try {
      while (nextSaveValue !== null) {
        const valueToSave = nextSaveValue;
        nextSaveValue = null;
        
        try {
          await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: valueToSave,
          });
        } catch (e) {
          console.warn('Failed to save to server db', e);
        }
      }
      
      // Ensure local storage is cleared so data is strictly on the server
      if (typeof window !== 'undefined' && window.localStorage) window.localStorage.removeItem(name);
    } finally {
      isSaving = false;
      pendingSaves--;
    }
  },
  removeItem: async (name: string): Promise<void> => {
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.removeItem(name);
  },
};
import { useMemo } from 'react';
import type {
  Transaction, RecurringCharge, RecurringOccurrenceOverride,
  PortfolioLot, SavingsAccount,
  GemelFund, HishtalmutFund, PensionFund, IncomeEntry, Goal, JournalEntry, Category, CategoryDef, AiBatchRecommendations
} from '../types';
import { ALL_CATEGORIES, CATEGORY_COLORS } from '../types';
const USD_ILS = 3.65;
import { nanoid } from '../utils/nanoid';

// ── Built-in categories (used as initial store state) ────────────────────────
const INITIAL_CATEGORIES: CategoryDef[] = ALL_CATEGORIES.map((name, i) => ({
  id: `cat-builtin-${i + 1}`,
  name,
  color: CATEGORY_COLORS[name] ?? '#9ca3af',
  isBuiltIn: true,
}));
export interface CategoryRuleMeta {
  date: string;
  source: 'ai' | 'manual' | 'ai-override';
  originalAiCat?: string;
}

interface FinstarState {
  transactions: Transaction[];
  ignoredIdentifiers: string[]; // Identifiers of deleted scraped transactions to prevent re-import
  addIgnoredIdentifier: (id: string) => void;
  aiRecommendations: AiBatchRecommendations | null; // stored batch recommendations
  recurring: RecurringCharge[];
  lots: PortfolioLot[];
  prices: Record<string, number>;
  usdIls: number;
  usdIlsLastUpdate: string;
  savings: SavingsAccount[];
  gemel: GemelFund[];
  hishtalmut: HishtalmutFund[];
  pension: PensionFund[];
  income: IncomeEntry[];
  goals: Goal[];
  journal: JournalEntry[];
  lastPriceUpdate: string;
  categories: CategoryDef[];
  categoryRules: Record<string, Category>; // business name → category
  categoryRulesMeta: Record<string, CategoryRuleMeta>; // business name → rule metadata

  addTransactions: (txns: Transaction[]) => void;
  updateTransaction: (id: string, patch: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;
  deleteTransactions: (ids: string[]) => void;
  overrideCategory: (id: string, category: Category) => void;
  markTransactionsAsAiProcessed: (ids: string[], log?: { prompt: string; response: string }) => void;
  resetAiProcessing: (dateCutoff?: string) => void;
  setAiRecommendations: (recommendations: AiBatchRecommendations | null) => void;

  addRecurring: (r: RecurringCharge) => void;
  updateRecurring: (id: string, patch: Partial<RecurringCharge>) => void;
  deleteRecurring: (id: string) => void;
  toggleRecurring: (id: string) => void;
  setRecurringOccurrence: (id: string, monthKey: string, data: Partial<RecurringOccurrenceOverride> | null) => void;

  addLot: (lot: Omit<PortfolioLot, 'id'>) => void;
  updateLot: (id: string, patch: Partial<PortfolioLot>) => void;
  deleteLot: (id: string) => void;
  updatePrices: (prices: Record<string, number>) => void;
  setUsdIls: (rate: number) => void;

  addSavings: (s: Omit<SavingsAccount, 'id'>) => void;
  updateSavings: (id: string, patch: Partial<SavingsAccount>) => void;
  deleteSavings: (id: string) => void;

  updateGemel: (id: string, patch: Partial<GemelFund>) => void;
  addGemel: (g: Omit<GemelFund, 'id'>) => void;
  deleteGemel: (id: string) => void;

  addHishtalmut: (h: Omit<HishtalmutFund, 'id'>) => void;
  updateHishtalmut: (id: string, patch: Partial<HishtalmutFund>) => void;
  deleteHishtalmut: (id: string) => void;

  updatePension: (id: string, patch: Partial<PensionFund>) => void;

  addIncome: (e: Omit<IncomeEntry, 'id'>) => void;
  addIncomes: (incomes: IncomeEntry[]) => void;
  updateIncome: (id: string, patch: Partial<IncomeEntry>) => void;
  deleteIncome: (id: string) => void;

  setGoal: (category: Category, amount: number) => void;
  deleteGoal: (id: string) => void;

  addCategory: (name: string, color: string) => void;
  updateCategory: (id: string, patch: { name?: string; color?: string }) => void;
  removeCategory: (id: string) => void;

  /** Save a business→category rule and retroactively update all matching transactions. */
  setCategoryRule: (business: string, category?: Category, meta?: CategoryRuleMeta) => void;
  deleteCategoryRule: (business: string) => void;

  setGemelGoal: (id: string, goalType: string | 'unassigned') => void;

  resetAllData: () => void;
  resetDataPartial: (keys: string[]) => void;

  addJournalEntry: (e: Omit<JournalEntry, 'id'>) => void;
}

export const useStore = create<FinstarState>()(
  persist(
    (set) => ({
      transactions: [],
      ignoredIdentifiers: [],
      aiRecommendations: null,
      recurring: [],
      lots: [],
      prices: {},
      usdIls: USD_ILS,
      usdIlsLastUpdate: new Date(0).toISOString(),
      savings: [],
      gemel: [],
      hishtalmut: [],
      pension: [],
      income: [],
      goals: [],
      journal: [],
      lastPriceUpdate: new Date(0).toISOString(),
      categories: INITIAL_CATEGORIES,
      categoryRules: {},
      categoryRulesMeta: {},

      addTransactions: (txns) =>
        set((s) => {
          const existingKeys = new Set(s.transactions.map((t) => `${t.date}-${t.business}-${t.amount}`));
          const fresh = txns
            .filter((t) => {
              if (existingKeys.has(`${t.date}-${t.business}-${t.amount}`)) return false;
              if (t.metadata?.identifier && s.ignoredIdentifiers.includes(String(t.metadata.identifier))) return false;
              return true;
            })
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
        set((s) => {
          const t = s.transactions.find((tx) => tx.id === id);
          if (t?.metadata?.identifier) {
            return {
              transactions: s.transactions.filter((tx) => tx.id !== id),
              ignoredIdentifiers: [...s.ignoredIdentifiers, String(t.metadata.identifier)]
            };
          }
          return { transactions: s.transactions.filter((tx) => tx.id !== id) };
        }),

      deleteTransactions: (ids) =>
        set((s) => {
          const idSet = new Set(ids);
          const toDelete = s.transactions.filter((tx) => idSet.has(tx.id));
          const newIgnored = toDelete
            .map((t) => t.metadata?.identifier ? String(t.metadata.identifier) : null)
            .filter((id): id is string => id !== null);

          return {
            transactions: s.transactions.filter((tx) => !idSet.has(tx.id)),
            ignoredIdentifiers: newIgnored.length > 0 ? [...s.ignoredIdentifiers, ...newIgnored] : s.ignoredIdentifiers
          };
        }),
        
      addIgnoredIdentifier: (id) => set((s) => {
        if (!s.ignoredIdentifiers.includes(id)) {
          return { ignoredIdentifiers: [...s.ignoredIdentifiers, id] };
        }
        return s;
      }),

      overrideCategory: (id, category) =>
        set((state) => ({
          transactions: state.transactions.map((t) => (t.id === id ? { ...t, categoryOverride: category, category } : t)),
        })),

      markTransactionsAsAiProcessed: (ids, log) =>
        set((state) => ({
          transactions: state.transactions.map((t) => (ids.includes(t.id) ? { ...t, aiProcessed: true, aiLog: log } : t)),
        })),

      setAiRecommendations: (recommendations) =>
        set(() => ({ aiRecommendations: recommendations })),

      resetAiProcessing: (dateCutoff) =>
        set((s) => {
          return {
            transactions: s.transactions.map((t) => {
              if (t.isVirtual) return t;
              if (dateCutoff && t.date < dateCutoff) return t;
              return { ...t, aiProcessed: false, aiLog: undefined };
            }),
          };
        }),

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
      setUsdIls: (rate) => set({ usdIls: rate, usdIlsLastUpdate: new Date().toISOString() }),

      addSavings: (sv) => set((s) => ({ savings: [...s.savings, { ...sv, id: nanoid() }] })),
      updateSavings: (id, patch) =>
        set((s) => ({ savings: s.savings.map((sv) => sv.id === id ? { ...sv, ...patch } : sv) })),
      deleteSavings: (id) => set((s) => ({ savings: s.savings.filter((sv) => sv.id !== id) })),

      addGemel: (g) => set((s) => ({ gemel: [...s.gemel, { ...g, id: nanoid() }] })),
      updateGemel: (id, patch) =>
        set((s) => ({ gemel: s.gemel.map((g) => g.id === id ? { ...g, ...patch } : g) })),
      deleteGemel: (id) => set((s) => ({ gemel: s.gemel.filter((g) => g.id !== id) })),

      addHishtalmut: (h) => set((s) => ({ hishtalmut: [...s.hishtalmut, { ...h, id: nanoid() }] })),
      updateHishtalmut: (id, patch) =>
        set((s) => ({ hishtalmut: s.hishtalmut.map((h) => h.id === id ? { ...h, ...patch } : h) })),
      deleteHishtalmut: (id) => set((s) => ({ hishtalmut: s.hishtalmut.filter((h) => h.id !== id) })),

      updatePension: (id, patch) =>
        set((s) => ({ pension: s.pension.map((p) => p.id === id ? { ...p, ...patch } : p) })),

      addIncome: (e) => set((s) => ({ income: [...s.income, { ...e, id: nanoid() }] })),
      addIncomes: (incomes) => set((s) => {
        const existingKeys = new Set(s.income.map((i) => `${i.date}-${i.source}-${i.netAmount}`));
        const fresh = incomes.filter((i) => !existingKeys.has(`${i.date}-${i.source}-${i.netAmount}`));
        return { income: [...s.income, ...fresh] };
      }),
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

      setCategoryRule: (business, category, meta) =>
        set((s) => {
          const rules = { ...s.categoryRules };
          const metaRules = { ...(s.categoryRulesMeta || {}) };
          
          if (category === undefined) {
            delete rules[business];
            delete metaRules[business];
          } else {
            rules[business] = category;
            metaRules[business] = meta || {
              date: new Date().toISOString(),
              source: 'manual'
            };
          }
          
          const updatedTransactions = s.transactions.map((t) =>
            t.business === business
              ? { ...t, category: category || "אחר", categoryOverride: category, aiCategorized: false }
              : t
          );

          return { categoryRules: rules, categoryRulesMeta: metaRules, transactions: updatedTransactions };
        }),

      deleteCategoryRule: (business) =>
        set((s) => {
          const rules = { ...s.categoryRules };
          const metaRules = { ...(s.categoryRulesMeta || {}) };
          delete rules[business];
          delete metaRules[business];
          return { categoryRules: rules, categoryRulesMeta: metaRules };
        }),

      setGemelGoal: (id, goalType) =>
        set((s) => ({
          gemel: s.gemel.map((g) => (g.id === id ? { ...g, goalType } : g)),
        })),

      resetDataPartial: (keys) =>
        set((s) => {
          const next: any = {};
          keys.forEach(k => {
            if (k === 'prices' || k === 'categoryRules' || k === 'categoryRulesMeta') next[k] = {};
            else if (k === 'usdIls') { next[k] = 3.65; next['usdIlsLastUpdate'] = ''; }
            else if (k === 'lastPriceUpdate') next[k] = '';
            else next[k] = [];
          });
          return next;
        }),

      resetAllData: () =>
        set({
          transactions: [],
          recurring: [],
          lots: [],
          prices: {},
          usdIls: USD_ILS,
          usdIlsLastUpdate: '',
          savings: [],
          gemel: [],
          hishtalmut: [],
          pension: [],
          income: [],
          goals: [],
          journal: [],
          lastPriceUpdate: '',
          categoryRules: {},
          categoryRulesMeta: {},
          // categories kept — user configured them
        }),

      addJournalEntry: (e) => set((s) => ({
        journal: [...s.journal.filter((j) => !(j.year === e.year && j.month === e.month)), { ...e, id: nanoid() }],
      })),
    }),
    {
      name: 'finstar-store',
      storage: createJSONStorage(() => serverStorage),
      partialize: (state) => ({
        ...state,
        aiRecommendations: state.aiRecommendations 
          ? { ...state.aiRecommendations, log: undefined }
          : null,
      }),
      version: 3,
      migrate: (persistedState: any, version: number) => {
        if (version === 0) {
          // Replace all existing categories with the new list and colors
          persistedState.categories = INITIAL_CATEGORIES;
          // Optionally migrate transactions that used old categories?
          // For now, we just replace the categories list. Old transactions will show the text, 
          // but might not have a color until they are re-categorized or bulk updated.
          // Wait, 'אחר' is now 'אחר (בלתי מתוכנן)'.
          persistedState.transactions = persistedState.transactions?.map((t: any) => {
            if (t.category === 'אחר') return { ...t, category: 'אחר (בלתי מתוכנן)' };
            if (t.category === 'תחבורה') return { ...t, category: 'רכב - אנרגיה' }; // best guess mapping
            if (t.category === 'ביטוח') return { ...t, category: 'ביטוחים' };
            if (t.category === 'חינוך') return { ...t, category: 'חינוך ואקדמיה' };
            if (t.category === 'קניות') return { ...t, category: 'קניות כלליות' };
            return t;
          }) || [];
          persistedState.recurring = persistedState.recurring?.map((r: any) => {
            if (r.category === 'אחר') return { ...r, category: 'אחר (בלתי מתוכנן)' };
            if (r.category === 'תחבורה') return { ...r, category: 'רכב - אנרגיה' };
            if (r.category === 'ביטוח') return { ...r, category: 'ביטוחים' };
            if (r.category === 'חינוך') return { ...r, category: 'חינוך ואקדמיה' };
            if (r.category === 'קניות') return { ...r, category: 'קניות כלליות' };
            return r;
          }) || [];
        }
        
        if (version === 0 || version === 1 || version === 2) {
          const onlineCat = 'קניות אונליין';
          if (!persistedState.categories?.find((c: any) => c.name === onlineCat)) {
            persistedState.categories?.push({
              name: onlineCat,
              color: '#f472b6'
            });
          }
        }
        
        return persistedState as FinstarState;
      },
    }
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
        // Occurrence override explicitly tied to a real transaction that still exists
        const overrideTxId = rec.occurrenceOverrides?.[mk]?.transactionId;
        if (overrideTxId && transactions.some(t => t.id === overrideTxId)) continue;
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
