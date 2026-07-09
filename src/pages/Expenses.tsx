import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Plus, Search, Download, Lightbulb, X, Pencil, Link2, Trash2, CheckCircle2, CheckCheck, Repeat2, Check, Star, RotateCcw, Loader2, RefreshCw, MoreHorizontal, ChevronDown, ChevronUp, Sparkles, Landmark } from 'lucide-react';
import { useStore, useCategoryList, useCategoryColorMap, useAllTransactions } from '../store';
import { useSettings } from '../store/settingsStore';
import Card from '../components/common/Card';
import Modal from '../components/common/Modal';
import { fmtCurrency, fmtDate } from '../utils/format';
import type { Transaction, Category } from '../types';
import { parseCalVisa, parseIsracard, parseMax, parseGenericCSV } from '../utils/parsers';
import { llmAnalyzeNewTransactions, llmCategorizeBatch } from '../utils/llmCategorizer';
import { getLocalLinkRecommendations } from '../utils/syncHelpers';
import { nanoid } from '../utils/nanoid';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
const PAGE_SIZE = 20;

export default function Expenses() {
  const { transactions, recurring, addTransactions, updateTransaction, deleteTransaction, categoryRules, categoryRulesMeta, setCategoryRule, aiRecommendations, setAiRecommendations, markTransactionsAsAiProcessed, resetAiProcessing, income, deleteIncome, addIgnoredIdentifier, overrideCategory, deleteCategoryRule, updateRecurring } = useStore();
  const allTransactions = useAllTransactions();
  const categoryList = useCategoryList();
  const catColors = useCategoryColorMap();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<Category | 'הכל'>('הכל');
  const [sourceFilter, setSourceFilter] = useState<string | 'הכל'>('הכל');
  const [monthFilter, setMonthFilter] = useState('');
  const [pendingFilter, setPendingFilter] = useState(false);
  const [linkedFilter, setLinkedFilter] = useState(false);
  const [dupeModal, setDupeModal] = useState(false);
  const [page, setPage] = useState(1);
  const [importModal, setImportModal] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [addTxnTypeModal, setAddTxnTypeModal] = useState(false);
  const [editTxn, setEditTxn] = useState<Transaction | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importType, setImportType] = useState<'cal' | 'isracard' | 'max' | 'generic'>('cal');
  const [importCard, setImportCard] = useState('ויזה כאל');
  const [rulesModal, setRulesModal] = useState(false);
  const [rulesTab, setRulesTab] = useState<'pending' | 'saved'>('pending');
  const [draftCats, setDraftCats] = useState<Record<string, Category>>({});
  const [aiDebugLog, setAiDebugLog] = useState<any>(null);

  // Inline recurring link popover (real transactions)
  const [linkingTxnId, setLinkingTxnId] = useState<string | null>(null);
  // Inline "link to existing transaction" popover (virtual transactions)
  const [linkingVirtTxnId, setLinkingVirtTxnId] = useState<string | null>(null);
  // Inline "refresh/validate occurrence amount" popover (virtual transactions)
  const [refreshVirtId, setRefreshVirtId] = useState<string | null>(null);
  const [refreshAmt, setRefreshAmt] = useState('');

  // AI Suggestions
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, import('../types').AiSuggestion>>({});
  const [isSingleAILoading, setIsSingleAILoading] = useState(false);
  const [aiBatchLoading, setAiBatchLoading] = useState(false);
  const [aiBatchConfidences, setAiBatchConfidences] = useState<Record<string, number>>({});
  const [txnDetailsModal, setTxnDetailsModal] = useState<Transaction | null>(null);
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [editCategoryVal, setEditCategoryVal] = useState<Category>('אחר');
  const [expandedAiTxn, setExpandedAiTxn] = useState<string | null>(null);
  // Import dedup preview
  type DupResult = { fresh: Transaction[]; dupes: number; total: number; allDupes: boolean };
  const [dupResult, setDupResult] = useState<DupResult | null>(null);

  // Import success toast
  type ToastData = { count: number; totalAmt: number; avg: number; topCat: string; dateRange: string };
  const [importToast, setImportToast] = useState<ToastData | null>(null);

  function buildToast(txns: Transaction[]): ToastData {
    const totalAmt = txns.reduce((a, t) => a + t.amount, 0);
    const avg = totalAmt / txns.length;
    const byCat: Record<string, number> = {};
    for (const t of txns) byCat[t.category] = (byCat[t.category] || 0) + 1;
    const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
    const dates = txns.map((t) => t.date).sort();
    const first = dates[0].slice(0, 7);
    const last  = dates[dates.length - 1].slice(0, 7);
    return { count: txns.length, totalAmt, avg, topCat, dateRange: first === last ? first : `${first} – ${last}` };
  }

  const BLANK_FORM = { date: new Date().toISOString().slice(0, 10), business: '', amount: '', category: 'אחר' as Category, source: 'מזומן', notes: '', recurringId: '' };
  const [form, setForm] = useState(BLANK_FORM);
  const [editForm, setEditForm] = useState(BLANK_FORM);

  const months = [...new Set(allTransactions.map((t) => t.date.slice(0, 7)))].sort().reverse();
  const sources = [...new Set(allTransactions.map((t) => t.source))].filter(Boolean).sort();

  // All unique business names with NO rule at all (neither auto-category nor __manual__)
  // Virtual transactions are excluded — their names are user-defined recurring charge names.
  const pendingBusinesses = (() => {
    const map: Record<string, { currentCategory: Category; count: number }> = {};
    for (const t of transactions) {
      if (!categoryRules[t.business]) {
        if (!map[t.business]) map[t.business] = { currentCategory: t.category, count: 0 };
        map[t.business].count++;
      }
    }
    return Object.entries(map).sort((a, b) => b[1].count - a[1].count);
  })();

  const [rulesSearch, setRulesSearch] = useState('');

  const filteredPendingBusinesses = useMemo(() => {
    const query = rulesSearch.trim().toLowerCase();
    if (!query) return pendingBusinesses;
    return pendingBusinesses.filter(([business]) => business.toLowerCase().includes(query));
  }, [pendingBusinesses, rulesSearch]);

  const sortedSavedRules = useMemo(() => {
    return Object.entries(categoryRules)
      .filter(([, v]) => v !== '__manual__')
      .sort((a, b) => {
        const metaA = categoryRulesMeta?.[a[0]];
        const metaB = categoryRulesMeta?.[b[0]];
        const timeA = metaA?.date ? new Date(metaA.date).getTime() : 0;
        const timeB = metaB?.date ? new Date(metaB.date).getTime() : 0;
        return timeB - timeA;
      });
  }, [categoryRules, categoryRulesMeta]);

  const sortedManualRules = useMemo(() => {
    return Object.entries(categoryRules)
      .filter(([, v]) => v === '__manual__')
      .sort((a, b) => {
        const metaA = categoryRulesMeta?.[a[0]];
        const metaB = categoryRulesMeta?.[b[0]];
        const timeA = metaA?.date ? new Date(metaA.date).getTime() : 0;
        const timeB = metaB?.date ? new Date(metaB.date).getTime() : 0;
        return timeB - timeA;
      });
  }, [categoryRules, categoryRulesMeta]);

  const filteredSavedRules = useMemo(() => {
    const query = rulesSearch.trim().toLowerCase();
    if (!query) return sortedSavedRules;
    return sortedSavedRules.filter(([business, category]) =>
      business.toLowerCase().includes(query) || category.toLowerCase().includes(query)
    );
  }, [sortedSavedRules, rulesSearch]);

  const filteredManualRules = useMemo(() => {
    const query = rulesSearch.trim().toLowerCase();
    if (!query) return sortedManualRules;
    return sortedManualRules.filter(([business]) =>
      business.toLowerCase().includes(query)
    );
  }, [sortedManualRules, rulesSearch]);

  const pendingCount = allTransactions.filter((t) => t.isVirtual).length;
  const linkedCount  = allTransactions.filter((t) => !!t.recurringId && !t.isVirtual).length;

  const activeAiDeletes = useMemo(() => {
    return aiRecommendations?.toDelete?.filter(d => transactions.some(t => t.id === d.transactionId)) || [];
  }, [aiRecommendations?.toDelete, transactions]);

  const activeAiIncomeDeletes = useMemo(() => {
    return aiRecommendations?.incomesToDelete?.filter(d => income.some(i => i.id === d.incomeId)) || [];
  }, [aiRecommendations?.incomesToDelete, income]);

  const activeAiLinks = useMemo(() => {
    return aiRecommendations?.toLink?.filter(l => transactions.some(t => t.id === l.transactionId)) || [];
  }, [aiRecommendations?.toLink, transactions]);

  const analyzeSingleTransaction = async (txn: Transaction) => {
    setIsSingleAILoading(true);
    try {
      const recommendations = await llmAnalyzeNewTransactions(
        [txn],
        [], // incomes
        recurring,
        categoryList,
        categoryRules
      );

      const currentRecs = aiRecommendations || { toDelete: [], toLink: [], categorizations: {}, incomesToDelete: [], incomeCategorizations: {} };
      
      const newRecs = {
        toDelete: [...currentRecs.toDelete.filter(d => d.transactionId !== txn.id), ...(recommendations.toDelete || [])],
        toLink: [...currentRecs.toLink.filter(l => l.transactionId !== txn.id), ...(recommendations.toLink || [])],
        categorizations: { ...currentRecs.categorizations, ...recommendations.categorizations },
        incomesToDelete: currentRecs.incomesToDelete,
        incomeCategorizations: currentRecs.incomeCategorizations
      };
      
      if (recommendations.categorizations[txn.business]) {
        const aiCat = recommendations.categorizations[txn.business];
        const updatedFields = { 
          category: aiCat.category as Category, 
          aiRecommendation: 'סווג אוטומטית על ידי AI',
          aiConfidence: aiCat.confidence
        };
        updateTransaction(txn.id, updatedFields);
        setCategoryRule(txn.business, aiCat.category as Category);
        setTxnDetailsModal(prev => prev && prev.id === txn.id ? { ...prev, ...updatedFields } : prev);
      }

      setAiRecommendations(newRecs);
      toast.success('בדיקת AI הושלמה לעסקה זו');
    } catch (e: any) {
      toast.error('שגיאה בסריקת ה-AI: ' + e.message);
    } finally {
      setIsSingleAILoading(false);
    }
  };

  const handleBatchAiCategorize = async () => {
    if (pendingBusinesses.length === 0) return;
    setAiBatchLoading(true);
    try {
      // Pick one transaction per pending business to get the amount (optional, helps LLM context)
      const txnsToAnalyze = pendingBusinesses.map(([biz]) => {
        const tx = transactions.find(t => t.business === biz);
        return { business: biz, amount: tx?.amount || 0 };
      });
      const results = await llmCategorizeBatch(txnsToAnalyze, categoryList, categoryRules);
      
      const newDrafts = { ...draftCats };
      const newConfidences = { ...aiBatchConfidences };
      for (const [biz, res] of Object.entries(results)) {
        if (res.category && categoryList.includes(res.category)) {
          newDrafts[biz] = res.category;
          newConfidences[biz] = res.confidence ?? 0;
        }
      }
      setDraftCats(newDrafts);
      setAiBatchConfidences(newConfidences);
      toast.success('זיהוי AI הושלם. אנא אשר את ההצעות.');
    } catch (e: any) {
      toast.error('שגיאה בזיהוי AI: ' + e.message);
    } finally {
      setAiBatchLoading(false);
    }
  };

  // Detect potential duplicate transactions: same business + same amount + ≤3 days apart
  const potentialDupes = useMemo(() => {
    const real = transactions.filter((t) => !t.isVirtual);
    const pairs: { a: Transaction; b: Transaction; reason: string }[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < real.length; i++) {
      for (let j = i + 1; j < real.length; j++) {
        const a = real[i], b = real[j];
        if (a.business !== b.business || a.amount !== b.amount) continue;
        const diff = Math.abs(
          new Date(a.date + 'T00:00:00').getTime() - new Date(b.date + 'T00:00:00').getTime()
        ) / 86400_000;
        if (diff > 3) continue;
        const key = [a.id, b.id].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({
          a, b,
          reason: diff === 0 ? 'תאריך + עסק + סכום זהים' : `הפרש ${Math.round(diff)} ימים — עסק וסכום זהים`,
        });
      }
    }
    return pairs;
  }, [transactions]);

  const virtualIncomesToDisplay = useMemo(() => {
    return activeAiIncomeDeletes.map(d => {
      const inc = income.find(i => i.id === d.incomeId);
      if (!inc) return null;
      return {
        id: inc.id,
        date: inc.date,
        business: inc.source,
        amount: inc.netAmount,
        currency: 'ILS',
        category: 'העברה/המרה',
        source: 'הכנסה מומלצת למחיקה',
        isVirtual: false,
        aiRecommendation: d.reason,
        isIncomeToDelete: true
      } as unknown as Transaction;
    }).filter(Boolean) as Transaction[];
  }, [activeAiIncomeDeletes, income]);

  const combinedTransactions = [...allTransactions, ...virtualIncomesToDisplay];

  const filtered = combinedTransactions
    .filter((t) => {
      if (pendingFilter && !t.isVirtual) return false;
      if (linkedFilter && (!t.recurringId || t.isVirtual)) return false;
      if (search) {
        const query = search.trim().toLowerCase();
        const businessMatch = t.business.toLowerCase().includes(query);
        const categoryMatch = t.category.toLowerCase().includes(query);
        const sourceMatch = t.source ? t.source.toLowerCase().includes(query) : false;
        const notesMatch = t.notes ? t.notes.toLowerCase().includes(query) : false;
        const amountMatch = t.amount.toString().includes(query) || fmtCurrency(t.amount).includes(query) || (t.currency && t.currency.toLowerCase().includes(query));
        const dateMatch = t.date.includes(query) || fmtDate(t.date).includes(query);
        const aiMatch = t.aiConfidence !== undefined && `${t.aiConfidence}%`.includes(query);
        let metadataMatch = false;
        if (t.metadata && typeof t.metadata === 'object') {
          try {
            metadataMatch = JSON.stringify(t.metadata).toLowerCase().includes(query);
          } catch (e) {}
        }
        if (!businessMatch && !categoryMatch && !sourceMatch && !notesMatch && !amountMatch && !dateMatch && !aiMatch && !metadataMatch) {
          return false;
        }
      }
      if (catFilter !== 'הכל' && t.category !== catFilter) return false;
      if (sourceFilter !== 'הכל' && t.source !== sourceFilter) return false;
      if (monthFilter && !t.date.startsWith(monthFilter)) return false;
      return true;
    })
    .sort((a, b) => {
      if (aiRecommendations) {
        const aIsRec = aiRecommendations.toDelete?.some(d => d.transactionId === a.id) || 
                       aiRecommendations.toLink?.some(l => l.transactionId === a.id) || 
                       (a as any).isIncomeToDelete;
        const bIsRec = aiRecommendations.toDelete?.some(d => d.transactionId === b.id) || 
                       aiRecommendations.toLink?.some(l => l.transactionId === b.id) || 
                       (b as any).isIncomeToDelete;
                       
        if (aIsRec && !bIsRec) return -1;
        if (!aIsRec && bIsRec) return 1;
      }
      return b.date.localeCompare(a.date);
    });

  const total = filtered.reduce((a, t) => a + t.amount, 0);
  const paginated = filtered.slice(0, page * PAGE_SIZE);

  function openEdit(t: Transaction) {
    setEditTxn(t);
    setEditForm({ date: t.date, business: t.business, amount: String(t.amount), category: t.category, source: t.source, notes: t.notes, recurringId: t.recurringId ?? '' });
  }

  function saveEdit() {
    if (!editTxn) return;
    const newRecurringId = editForm.recurringId || undefined;
    const oldRecurringId = editTxn.recurringId;
    updateTransaction(editTxn.id, {
      date: editForm.date,
      business: editForm.business,
      amount: parseFloat(editForm.amount),
      category: editForm.category,
      source: editForm.source,
      notes: editForm.notes,
      recurringId: newRecurringId,
      isRecurring: !!newRecurringId,
    });
    // sync occurrence override on the recurring charge side
    if (newRecurringId !== oldRecurringId) {
      const monthKey = editForm.date.slice(0, 7);
      if (newRecurringId) {
        useStore.getState().setRecurringOccurrence(newRecurringId, monthKey, { transactionId: editTxn.id });
      }
      if (oldRecurringId) {
        const rec = useStore.getState().recurring.find(r => r.id === oldRecurringId);
        const ov = rec?.occurrenceOverrides?.[monthKey];
        if (ov?.transactionId === editTxn.id) {
          useStore.getState().setRecurringOccurrence(oldRecurringId, monthKey, { transactionId: undefined });
        }
      }
    }
    setEditTxn(null);
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setImporting(true);
    try {
      const results = await Promise.all(files.map((f) => {
        if (importType === 'cal') return parseCalVisa(f, importCard);
        if (importType === 'isracard') return parseIsracard(f, importCard);
        if (importType === 'max') return parseMax(f, importCard);
        return parseGenericCSV(f, importCard);
      }));
      const allParsed = results.flat();
      const existingKeys = new Set(
        transactions.map((t) => `${t.date}|${t.business}|${t.amount}`)
      );
      const fresh = allParsed.filter((t) => !existingKeys.has(`${t.date}|${t.business}|${t.amount}`));
      const dupes = allParsed.length - fresh.length;
      if (fresh.length === 0) {
        setDupResult({ fresh: [], dupes, total: allParsed.length, allDupes: true });
      } else if (dupes > 0) {
        setDupResult({ fresh, dupes, total: allParsed.length, allDupes: false });
      } else {
        addTransactions(fresh);
        setImportModal(false);
        setDupResult(null);
        setImportToast(buildToast(fresh));
      }
    } catch (e) {
      alert('שגיאה בייבוא הקובץ');
    }
    setImporting(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  function confirmImport() {
    if (!dupResult || dupResult.fresh.length === 0) return;
    const fresh = dupResult.fresh;
    addTransactions(fresh);
    setDupResult(null);
    setImportModal(false);
    setImportToast(buildToast(fresh));
  }

  function linkTxnToRecurring(t: Transaction, newRecurringId: string | undefined) {
    const oldId = t.recurringId;
    updateTransaction(t.id, { recurringId: newRecurringId, isRecurring: !!newRecurringId });
    const monthKey = t.date.slice(0, 7);
    if (newRecurringId) {
      useStore.getState().setRecurringOccurrence(newRecurringId, monthKey, { transactionId: t.id });
    }
    if (oldId && oldId !== newRecurringId) {
      const rec = useStore.getState().recurring.find((r) => r.id === oldId);
      const ov = rec?.occurrenceOverrides?.[monthKey];
      if (ov?.transactionId === t.id) {
        useStore.getState().setRecurringOccurrence(oldId, monthKey, { transactionId: undefined });
      }
    }
  }

  /** Link a virtual recurring occurrence to an already-imported real transaction. */
  function linkVirtToExisting(virt: Transaction, real: Transaction) {
    const state    = useStore.getState();
    const monthKey = virt.date.slice(0, 7);
    state.updateTransaction(real.id, { recurringId: virt.recurringId, isRecurring: true });
    if (virt.recurringId) {
      state.setRecurringOccurrence(virt.recurringId, monthKey, { transactionId: real.id });
    }
  }

  /** Dismiss a virtual recurring occurrence — stores dismissed:true so it won't reappear. */
  function dismissVirtual(t: Transaction) {
    if (!t.recurringId) return;
    useStore.getState().setRecurringOccurrence(t.recurringId, t.date.slice(0, 7), { dismissed: true });
  }

  /** Confirm a virtual recurring transaction as an actual payment. */
  function confirmVirtual(t: Transaction) {
    const state   = useStore.getState();
    const monthKey = t.date.slice(0, 7);
    // Check if a real transaction already matches (e.g. imported before confirming)
    const existing = state.transactions.find(
      (x) => !x.isVirtual && x.date === t.date && x.business === t.business && x.amount === t.amount,
    );
    if (existing) {
      // Link that existing transaction to the recurring charge
      state.updateTransaction(existing.id, { recurringId: t.recurringId, isRecurring: true });
      if (t.recurringId) state.setRecurringOccurrence(t.recurringId, monthKey, { transactionId: existing.id });
    } else {
      const realId = nanoid();
      state.addTransactions([{ ...t, id: realId, isVirtual: false }]);
      if (t.recurringId) state.setRecurringOccurrence(t.recurringId, monthKey, { transactionId: realId });
    }
  }

  function exportExcel() {
    const data = filtered.map((t) => ({
      תאריך: fmtDate(t.date), עסק: t.business, סכום: t.amount, מטבע: t.currency,
      קטגוריה: t.category, מקור: t.source, הערות: t.notes,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'עסקאות');
    XLSX.writeFile(wb, 'finstar-expenses.xlsx');
  }

  function addManual() {
    addTransactions([{
      id: nanoid(), date: form.date, business: form.business,
      amount: parseFloat(form.amount), currency: 'ILS',
      category: form.category, isRecurring: false, source: form.source,
      notes: form.notes, pending: false, aiCategorized: false,
    }]);
    setAddModal(false);
    setForm(BLANK_FORM);
  }

  return (
    <div className="space-y-5" onClick={() => { setLinkingTxnId(null); setLinkingVirtTxnId(null); setRefreshVirtId(null); }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">הוצאות וחיובים</h1>
          <p className="text-slate-500 text-sm">{filtered.length} עסקאות • סה"כ {fmtCurrency(total)}</p>
        </div>
        <div className="flex gap-2 items-center">
          {/* Smart categorization lightbulb */}
          <button
            onClick={() => { setRulesTab('pending'); setDraftCats({}); setRulesModal(true); }}
            className="relative flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 hover:bg-slate-50"
          >
            <Lightbulb size={16} className={pendingBusinesses.length > 0 ? 'text-amber-500' : 'text-slate-400'} />
            קטגוריות אוטומטיות
            {pendingBusinesses.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                {pendingBusinesses.length}
              </span>
            )}
          </button>
          {/* Duplicate detector */}
          <button
            onClick={() => setDupeModal(true)}
            className="relative flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 hover:bg-slate-50"
          >
            <Star size={16} className={potentialDupes.length > 0 ? 'text-amber-500' : 'text-slate-400'} />
            זיהוי כפילויות
            {potentialDupes.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                {potentialDupes.length}
              </span>
            )}
          </button>

          <button onClick={exportExcel} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 hover:bg-slate-50">
            <Download size={16} /> ייצוא
          </button>
          <button onClick={() => setAddTxnTypeModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-xl text-sm text-white hover:bg-blue-700">
            <Plus size={16} /> הוספת תנועות
          </button>
        </div>
      </div>

      {aiRecommendations && (activeAiDeletes.length > 0 || activeAiLinks.length > 0) && (
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-150 p-4 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 text-blue-700 p-2.5 rounded-lg">
              <Sparkles size={20} className="animate-pulse" />
            </div>
            <div>
              <h3 className="font-semibold text-blue-900 text-sm">המלצות AI חדשות לטיפול</h3>
              <p className="text-xs text-blue-700 mt-0.5">
                נמצאו {activeAiDeletes.length} עסקאות כפולות למחיקה ו-{activeAiLinks.length} התאמות לחיובים קבועים.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {aiRecommendations.log && (
              <button
                onClick={() => setAiDebugLog(aiRecommendations.log!)}
                className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors"
              >
                לוג ניתוח AI
              </button>
            )}
          </div>
        </Card>
      )}

      {/* Filters */}
      <Card className="flex flex-wrap gap-3 items-center py-3">
        <div className="flex items-center gap-2 flex-1 min-w-48 bg-slate-50 rounded-lg px-3 py-2">
          <Search size={14} className="text-slate-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="חיפוש עסק..." className="bg-transparent text-sm outline-none flex-1 text-slate-700 placeholder:text-slate-400" />
        </div>
        <select value={monthFilter} onChange={(e) => { setMonthFilter(e.target.value); setPage(1); }}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white">
          <option value="">כל החודשים</option>
          {months.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={catFilter} onChange={(e) => { setCatFilter(e.target.value as any); setPage(1); }}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white">
          <option value="הכל">כל הקטגוריות</option>
          {categoryList.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white">
          <option value="הכל">כל המקורות</option>
          {sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button
          onClick={() => { setPendingFilter((v) => !v); setLinkedFilter(false); setPage(1); }}
          className={`relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
            pendingFilter
              ? 'bg-violet-600 text-white border-violet-600'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Repeat2 size={14} />
          ממתינים לאישור
          {pendingCount > 0 && (
            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
              pendingFilter ? 'bg-white/25 text-white' : 'bg-violet-100 text-violet-600'
            }`}>
              {pendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => { setLinkedFilter((v) => !v); setPendingFilter(false); setPage(1); }}
          className={`relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
            linkedFilter
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Link2 size={14} />
          מקושר לחיוב קבוע
          {linkedCount > 0 && (
            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
              linkedFilter ? 'bg-white/25 text-white' : 'bg-blue-100 text-blue-600'
            }`}>
              {linkedCount}
            </span>
          )}
        </button>
      </Card>

      {/* AI Scan Banner (Removed) */}

      {/* Table */}
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-right px-4 py-3 text-slate-500 font-medium">תאריך</th>
              <th className="text-right px-4 py-3 text-slate-500 font-medium">עסק</th>
              <th className="text-right px-4 py-3 text-slate-500 font-medium">קטגוריה</th>
              <th className="text-right px-4 py-3 text-slate-500 font-medium">סכום</th>
              <th className="text-right px-4 py-3 text-slate-500 font-medium">מקור</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((t) => {
              const aiDel = aiRecommendations?.toDelete?.find((r) => r.transactionId === t.id);
              const aiLink = aiRecommendations?.toLink?.find((r) => r.transactionId === t.id);
              
              let rowBg = 'border-slate-50 hover:bg-slate-50';
              if (t.isVirtual) {
                rowBg = 'border-violet-100 bg-violet-50/40 hover:bg-violet-50/70';
              } else if (aiDel || (t as any).isIncomeToDelete) {
                rowBg = 'border-red-100 bg-red-50/60 hover:bg-red-100/60 transition-colors shadow-[inset_4px_0_0_0_rgb(239,68,68)]';
              } else if (aiLink) {
                rowBg = 'border-blue-100 bg-blue-50/60 hover:bg-blue-100/60 transition-colors shadow-[inset_4px_0_0_0_rgb(59,130,246)]';
              }

              return (
                <tr key={t.id} onClick={() => setTxnDetailsModal(t)} className={`border-b transition-colors cursor-pointer ${rowBg}`}>
                  <td className="px-4 py-3 text-slate-600">{fmtDate(t.date)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{t.business}</div>
                    {t.notes && <div className="text-xs text-slate-400">{t.notes}</div>}
                    
                    {t.isVirtual ? (
                      <div className="inline-flex items-center gap-1 mt-0.5 text-[10px] bg-violet-50 text-violet-500 border border-violet-200 rounded-full px-1.5 py-0.5">
                        <Repeat2 size={8} /> חיוב קבוע — ממתין לאישור
                      </div>
                    ) : t.recurringId ? (() => {
                      const rec = recurring.find(r => r.id === t.recurringId);
                      return rec ? (
                        <div className="inline-flex items-center gap-1 mt-0.5 text-[10px] bg-blue-50 text-blue-600 border border-blue-100 rounded-full px-1.5 py-0.5">
                          <Link2 size={8} /> {rec.name}
                        </div>
                      ) : null;
                    })() : null}

                    {aiDel && (
                      <div className="inline-flex items-center gap-1.5 mt-1 text-[10.5px] bg-red-50 text-red-700 border border-red-200 rounded-full px-2 py-0.5 font-medium">
                        <span>המלצת AI: כפילות מומלצת למחיקה ({aiDel.reason})</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setAiRecommendations({
                              ...aiRecommendations!,
                              toDelete: aiRecommendations!.toDelete.filter(d => d.transactionId !== t.id)
                            });
                          }}
                          className="hover:bg-red-200 rounded-full p-0.5 text-red-500"
                          title="התעלם מהמלצה"
                        >
                          <X size={8} />
                        </button>
                      </div>
                    )}

                    {(t as any).isIncomeToDelete && (
                      <div className="inline-flex items-center gap-1.5 mt-1 text-[10.5px] bg-red-50 text-red-700 border border-red-200 rounded-full px-2 py-0.5 font-medium">
                        <span>המלצת AI: המרת מט"ח שהיא אינה הוצאה או הכנסה ({t.aiRecommendation})</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setAiRecommendations({
                              ...aiRecommendations!,
                              incomesToDelete: aiRecommendations!.incomesToDelete?.filter(d => d.incomeId !== t.id)
                            });
                          }}
                          className="hover:bg-red-200 rounded-full p-0.5 text-red-500"
                          title="התעלם מהמלצה"
                        >
                          <X size={8} />
                        </button>
                      </div>
                    )}

                    {aiLink && (() => {
                      const rec = recurring.find(r => r.id === aiLink.recurringId);
                      const isExpanded = expandedAiTxn === t.id;
                      return (
                        <div className="mt-1 flex flex-col gap-1 max-w-lg">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedAiTxn(isExpanded ? null : t.id);
                            }}
                            className="inline-flex items-center gap-1.5 self-start text-[10.5px] bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5 font-medium hover:bg-blue-100 transition-colors"
                          >
                            <Sparkles size={8} className="text-blue-500 animate-pulse" />
                            <span>מומלץ לקשר לחיוב קבוע: "{rec?.name || 'חיוב קבוע'}"</span>
                            {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                          </button>
                          
                          {isExpanded && (
                            <div className="bg-white/95 border border-blue-100 rounded-lg p-2.5 text-xs text-slate-700 space-y-1.5 shadow-sm mt-0.5">
                              <div className="font-semibold text-blue-800">הסבר המערכת:</div>
                              <div className="leading-relaxed">{aiLink.reason}</div>
                              {rec && (
                                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 text-[11px] text-slate-500">
                                  <div>סכום קבוע: <span className="font-medium text-slate-700">{fmtCurrency(rec.amount)}</span></div>
                                  <div>יום בחודש: <span className="font-medium text-slate-700">{rec.dayOfMonth}</span></div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                <td className="px-4 py-3">
                  {t.isVirtual ? (
                    /* Virtual rows: plain read-only badge */
                    <span
                      className="text-xs px-2 py-1 rounded-full font-medium"
                      style={{ backgroundColor: (catColors[t.category] ?? '#9ca3af') + '20', color: catColors[t.category] ?? '#9ca3af' }}
                    >
                      {t.category}
                    </span>
                  ) : categoryRules[t.business] === '__manual__' ? (
                    /* ── Manual business: editable dropdown ── */
                    <select
                      value={t.category}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => overrideCategory(t.id, e.target.value as Category)}
                      className="text-xs px-2 py-1 rounded-full border-0 font-medium cursor-pointer ring-1 ring-inset"
                      style={{
                        backgroundColor: (catColors[t.category] ?? '#9ca3af') + '20',
                        color: catColors[t.category] ?? '#9ca3af',
                        ['--tw-ring-color' as any]: (catColors[t.category] ?? '#9ca3af') + '60',
                      }}
                    >
                      {categoryList.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : (
                    /* ── Auto / pending business: clickable badge → rules modal ── */
                    <button
                      onClick={() => { setRulesTab('pending'); setDraftCats({}); setRulesModal(true); }}
                      title="שנה דרך קטגוריות אוטומטיות"
                      className="text-xs px-2 py-1 rounded-full font-medium cursor-pointer hover:opacity-75 transition-opacity"
                      style={{ backgroundColor: (catColors[t.category] ?? '#9ca3af') + '20', color: catColors[t.category] ?? '#9ca3af' }}
                    >
                      {t.category}
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 font-semibold text-slate-900">
                  {fmtCurrency(t.amount)}
                  {t.currency !== 'ILS' && <span className="text-xs text-slate-400 mr-1">({t.currency})</span>}
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">{t.source}</td>
                <td className="px-4 py-3">
                  {t.isVirtual ? (
                    /* Virtual row: link to existing  +  confirm */
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {/* ── Link to nearby real transaction ── */}
                      <div className="relative">
                        <button
                          onClick={() => setLinkingVirtTxnId(linkingVirtTxnId === t.id ? null : t.id)}
                          title="קשר לעסקה קיימת"
                          className={`flex items-center gap-1 text-xs px-2.5 py-1 border rounded-lg transition-colors ${
                            linkingVirtTxnId === t.id
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <Link2 size={11} /> קשר
                        </button>
                        {linkingVirtTxnId === t.id && (() => {
                          const virtMs   = new Date(t.date + 'T00:00:00').getTime();
                          const nearby   = transactions
                            .filter((r) => {
                              if (r.recurringId) return false;
                              const diff = Math.abs(new Date(r.date + 'T00:00:00').getTime() - virtMs);
                              return diff <= 6 * 86400_000;
                            })
                            .sort((a, b) => {
                              const da = Math.abs(new Date(a.date + 'T00:00:00').getTime() - virtMs);
                              const db = Math.abs(new Date(b.date + 'T00:00:00').getTime() - virtMs);
                              return da - db;
                            });
                          return (
                            <div className="absolute left-0 top-8 z-50 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden w-72 animate-scale-in">
                              <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500">
                                עסקאות בטווח ±6 ימים מ-{fmtDate(t.date)}
                              </div>
                              <div className="max-h-52 overflow-y-auto py-1">
                                {nearby.length === 0 ? (
                                  <p className="px-3 py-3 text-xs text-slate-400 text-center">לא נמצאו עסקאות בטווח</p>
                                ) : nearby.map((real) => (
                                  <button
                                    key={real.id}
                                    onClick={() => { linkVirtToExisting(t, real); setLinkingVirtTxnId(null); }}
                                    className="w-full text-right px-3 py-2.5 hover:bg-blue-50 transition-colors flex items-center justify-between gap-3"
                                  >
                                    <span className="flex-1 min-w-0">
                                      <span className="block text-sm font-medium text-slate-800 truncate">{real.business}</span>
                                      <span className="text-xs text-slate-400">{fmtDate(real.date)}</span>
                                    </span>
                                    <span className="text-sm font-semibold text-slate-700 shrink-0">{fmtCurrency(real.amount)}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                      {/* ── Confirm as new payment ── */}
                      <button
                        onClick={() => { confirmVirtual(t); setLinkingVirtTxnId(null); }}
                        title="אשר כתשלום שבוצע"
                        className="flex items-center gap-1 text-xs px-2.5 py-1 bg-green-50 text-green-600 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                      >
                        <Check size={11} /> אשר
                      </button>
                      {/* ── Refresh / validate occurrence amount ── */}
                      {(() => {
                        const rec = recurring.find(r => r.id === t.recurringId);
                        const hasOverride = rec?.occurrenceOverrides?.[t.date.slice(0, 7)]?.amount !== undefined;
                        return (
                          <div className="relative">
                            <button
                              onClick={() => {
                                if (refreshVirtId === t.id) { setRefreshVirtId(null); return; }
                                setRefreshVirtId(t.id);
                                setRefreshAmt(String(t.amount));
                              }}
                              title="רענן / עדכן סכום"
                              className={`flex items-center gap-1 text-xs px-2.5 py-1 border rounded-lg transition-colors ${
                                refreshVirtId === t.id
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : hasOverride
                                    ? 'bg-indigo-50 text-indigo-500 border-indigo-200 hover:bg-indigo-100'
                                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              <RotateCcw size={11} /> רענן
                            </button>
                            {refreshVirtId === t.id && (
                              <div
                                className="absolute left-0 top-8 z-50 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden w-56 animate-scale-in"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500">
                                  סכום {t.date.slice(0, 7)}
                                  {rec && <span className="font-normal text-slate-400 mr-1">— {rec.name}</span>}
                                </div>
                                <div className="p-3 space-y-2">
                                  {rec && (
                                    <div className="text-xs text-slate-400">ברירת מחדל: {fmtCurrency(rec.amount)}</div>
                                  )}
                                  <input
                                    type="number"
                                    value={refreshAmt}
                                    onChange={(e) => setRefreshAmt(e.target.value)}
                                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50 outline-none"
                                    autoFocus
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => {
                                        if (!t.recurringId) return;
                                        const amt = parseFloat(refreshAmt);
                                        if (!isNaN(amt) && amt > 0) {
                                          useStore.getState().setRecurringOccurrence(t.recurringId, t.date.slice(0, 7), { amount: amt });
                                        }
                                        setRefreshVirtId(null);
                                      }}
                                      className="flex-1 bg-indigo-600 text-white text-xs py-1.5 rounded-lg hover:bg-indigo-700 font-medium"
                                    >
                                      שמור
                                    </button>
                                    {hasOverride && (
                                      <button
                                        onClick={() => {
                                          if (!t.recurringId) return;
                                          useStore.getState().setRecurringOccurrence(t.recurringId, t.date.slice(0, 7), { amount: undefined });
                                          setRefreshVirtId(null);
                                        }}
                                        title="אפס לסכום ברירת מחדל"
                                        className="text-xs px-2 py-1.5 border border-slate-200 text-slate-400 rounded-lg hover:bg-slate-50"
                                      >
                                        איפוס
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      {/* ── Dismiss (skip this occurrence) ── */}
                      <button
                        onClick={() => { dismissVirtual(t); setLinkingVirtTxnId(null); }}
                        title="דלג על תשלום זה"
                        className="flex items-center gap-1 text-xs px-2 py-1 bg-slate-50 text-slate-400 border border-slate-200 rounded-lg hover:bg-red-50 hover:text-red-400 hover:border-red-200 transition-colors"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      {aiLink && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Find corresponding virtual transaction for this month
                            const monthKey = t.date.slice(0, 7);
                            const virt = allTransactions.find(
                              v => v.isVirtual && v.recurringId === aiLink.recurringId && v.date.slice(0, 7) === monthKey
                            );
                            if (virt) {
                              linkVirtToExisting(virt, t);
                            } else {
                              linkTxnToRecurring(t, aiLink.recurringId);
                            }
                            
                            // Remove from recommendations
                            setAiRecommendations({
                              ...aiRecommendations!,
                              toLink: aiRecommendations!.toLink.filter(l => l.transactionId !== t.id)
                            });
                            toast.success('הקישור אושר בהצלחה!', { icon: '✅' });
                          }}
                          className="flex items-center gap-1 text-[11px] px-2 py-0.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium ml-1 shrink-0 shadow-sm cursor-pointer"
                        >
                          <Check size={9} />
                          אשר קישור
                        </button>
                      )}
                      
                      {/* Inline recurring link button */}
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setLinkingTxnId(linkingTxnId === t.id ? null : t.id)}
                          title="קשר לחיוב קבוע"
                          className={`p-1 rounded transition-colors ${t.recurringId ? 'text-blue-400 hover:text-blue-600' : 'text-slate-300 hover:text-blue-400'}`}
                        >
                          <Link2 size={13} />
                        </button>
                        {linkingTxnId === t.id && (
                          <div className="absolute left-0 top-7 z-50 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden min-w-52 animate-scale-in">
                            <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500">
                              קשר לחיוב קבוע
                            </div>
                            <div className="max-h-48 overflow-y-auto py-1">
                              <button
                                onClick={() => { linkTxnToRecurring(t, undefined); setLinkingTxnId(null); }}
                                className={`w-full text-right px-3 py-2 text-sm hover:bg-slate-50 transition-colors ${!t.recurringId ? 'text-slate-400' : 'text-slate-600 font-medium'}`}
                              >
                                — ללא קישור —
                              </button>
                              {recurring.map((r) => (
                                <button
                                  key={r.id}
                                  onClick={() => { linkTxnToRecurring(t, r.id); setLinkingTxnId(null); }}
                                  className={`w-full text-right px-3 py-2 text-sm hover:bg-blue-50 transition-colors flex items-center justify-between gap-2 ${t.recurringId === r.id ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700'}`}
                                >
                                  <span className="truncate">{r.name}</span>
                                  <span className="text-xs text-slate-400 shrink-0">{fmtCurrency(r.amount)}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <button onClick={() => openEdit(t)} className="text-slate-300 hover:text-blue-500 p-1">
                        <Pencil size={13} />
                      </button>
                      
                      {aiDel ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteTransaction(t.id);
                            // Clear from recommendations
                            setAiRecommendations({
                              ...aiRecommendations!,
                              toDelete: aiRecommendations!.toDelete.filter(d => d.transactionId !== t.id)
                            });
                            toast.success('העסקה הכפולה נמחקה', { icon: '🗑️' });
                          }}
                          title="מחק עסקה כפולה"
                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      ) : (t as any).isIncomeToDelete ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteIncome(t.id);
                            // Incomes have no stable scraper identifier — register the
                            // date+source+amount key the sync dedup checks against, so
                            // this currency-conversion income isn't re-imported next sync.
                            addIgnoredIdentifier(`${t.date}-${t.business}-${t.amount}`);
                            setAiRecommendations({
                              ...aiRecommendations!,
                              incomesToDelete: aiRecommendations!.incomesToDelete?.filter(d => d.incomeId !== t.id)
                            });
                            toast.success('המרת המט"ח נמחקה', { icon: '🗑️' });
                          }}
                          title="מחק המרת מט״ח"
                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      ) : (
                        <button onClick={() => deleteTransaction(t.id)} className="text-slate-300 hover:text-red-400 p-1">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
          </tbody>
        </table>
        {paginated.length < filtered.length && (
          <div className="p-4 text-center">
            <button onClick={() => setPage(p => p + 1)} className="text-sm text-blue-600 hover:underline">
              טען עוד ({filtered.length - paginated.length} נותרו)
            </button>
          </div>
        )}
      </Card>

      {/* Edit Transaction Modal */}
      <Modal open={!!editTxn} onClose={() => setEditTxn(null)} title={`ערוך — ${editTxn?.business ?? ''}`}>
        <div className="space-y-4">
          {editTxn?.aiRecommendation && (
            <div className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg text-sm text-blue-800 flex items-center gap-2">
              <Sparkles size={16} className="text-blue-600" />
              <span className="font-semibold">המלצת מערכת:</span> {editTxn.aiRecommendation}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">תאריך</label>
            <input type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">שם עסק</label>
            <input value={editForm.business} onChange={(e) => setEditForm({ ...editForm, business: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">סכום (₪)</label>
            <input type="number" value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">קטגוריה</label>
            <select value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value as Category })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              {categoryList.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">כרטיס/מקור</label>
            <input value={editForm.source} onChange={(e) => setEditForm({ ...editForm, source: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">הערות</label>
            <input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              קשר לחיוב קבוע
              <span className="font-normal text-slate-400 mr-1 text-xs">(כדי לא לספור פעמיים)</span>
            </label>
            <select
              value={editForm.recurringId}
              onChange={(e) => setEditForm({ ...editForm, recurringId: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">— ללא קישור —</option>
              {recurring.map((r) => (
                <option key={r.id} value={r.id}>{r.name} ({fmtCurrency(r.amount)}/חודש)</option>
              ))}
            </select>
          </div>
          <button onClick={saveEdit} disabled={!editForm.business || !editForm.amount}
            className="w-full bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
            שמור שינויים
          </button>
        </div>
      </Modal>

      {/* Import Modal */}
      <Modal open={importModal} onClose={() => { setImportModal(false); setDupResult(null); }} title="יבוא עסקאות">
        <div className="space-y-4">
          {/* ── Dedup result: ALL duplicates → blocked ── */}
          {dupResult?.allDupes ? (
            <div className="space-y-4">
              <div className="rounded-xl p-5 text-center" style={{ background: 'linear-gradient(135deg,#fef2f2,#fee2e2)', border: '1px solid #fca5a5' }}>
                <div className="text-3xl mb-2">🚫</div>
                <div className="font-bold text-red-700 text-base mb-1">כל הרשומות כבר קיימות</div>
                <div className="text-sm text-red-500">
                  כל {dupResult.total} הרשומות מהקובץ כבר נמצאות במסד הנתונים.<br />
                  הקובץ לא יתווסף שוב.
                </div>
              </div>
              <button onClick={() => setDupResult(null)} className="w-full border border-slate-200 text-slate-600 rounded-xl py-2.5 text-sm hover:bg-slate-50">
                חזור
              </button>
            </div>
          ) : dupResult ? (
            /* ── Dedup result: SOME duplicates → warn + confirm ── */
            <div className="space-y-4">
              <div className="rounded-xl p-5" style={{ background: 'linear-gradient(135deg,#fffbeb,#fef3c7)', border: '1px solid #fde68a' }}>
                <div className="font-bold text-amber-800 text-base mb-3">⚠️ נמצאו כפילויות</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-amber-700">סה"כ רשומות בקובץ</span>
                    <span className="font-bold text-amber-900">{dupResult.total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-600">כפילויות (כבר קיימות)</span>
                    <span className="font-bold text-red-700">{dupResult.dupes}</span>
                  </div>
                  <div className="border-t border-amber-200 pt-2 flex justify-between">
                    <span className="text-green-700 font-medium">רשומות חדשות לייבוא</span>
                    <span className="font-bold text-green-700">{dupResult.fresh.length}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setDupResult(null)} className="flex-1 border border-slate-200 text-slate-600 rounded-xl py-2.5 text-sm hover:bg-slate-50">
                  חזור
                </button>
                <button onClick={confirmImport} className="flex-1 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700">
                  ייבא {dupResult.fresh.length} רשומות חדשות
                </button>
              </div>
            </div>
          ) : (
            /* ── Normal import form ── */
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">סוג קובץ</label>
                <select value={importType} onChange={(e) => setImportType(e.target.value as any)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                  <option value="cal">כאל ויזה (XLSX)</option>
                  <option value="isracard">ישראכרט מסטרקארד (XLSX)</option>
                  <option value="max">מקס (XLSX)</option>
                  <option value="generic">CSV גנרי</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">שם הכרטיס</label>
                <input value={importCard} onChange={(e) => setImportCard(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:bg-slate-50 transition-colors"
              >
                <Upload size={24} className="text-slate-400 mx-auto mb-2" />
                {importing ? (
                  <p className="text-sm text-blue-600 font-medium">מייבא קבצים...</p>
                ) : (
                  <>
                    <p className="text-sm text-slate-600">לחץ לבחירת קבצים</p>
                    <p className="text-xs text-slate-400 mt-1">ניתן לבחור מספר קבצים בו-זמנית • XLSX / CSV</p>
                  </>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.csv,.xls" className="hidden" multiple onChange={handleFiles} />
            </>
          )}
        </div>
      </Modal>

      {/* ── Smart Categorization Modal ─────────────────────────────────── */}
      <Modal open={rulesModal} onClose={() => { setRulesModal(false); setRulesSearch(''); }} title="קטגוריות אוטומטיות">
        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex rounded-xl overflow-hidden border border-slate-200">
            <button
              onClick={() => setRulesTab('pending')}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${rulesTab === 'pending' ? 'bg-amber-500 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
            >
              ממתינים לשיוך
              {pendingBusinesses.length > 0 && (
                <span className={`mr-2 text-xs font-bold px-1.5 py-0.5 rounded-full ${rulesTab === 'pending' ? 'bg-white/30 text-white' : 'bg-amber-100 text-amber-600'}`}>
                  {pendingBusinesses.length}
                </span>
              )}
            </button>
            <div className="w-px bg-slate-200" />
            <button
              onClick={() => setRulesTab('saved')}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${rulesTab === 'saved' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
            >
              כללים שמורים
              {Object.keys(categoryRules).length > 0 && (
                <span className={`mr-2 text-xs font-bold px-1.5 py-0.5 rounded-full ${rulesTab === 'saved' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {Object.keys(categoryRules).length}
                </span>
              )}
            </button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              value={rulesSearch}
              onChange={(e) => setRulesSearch(e.target.value)}
              placeholder={rulesTab === 'pending' ? "חיפוש בממתינים לשיוך..." : "חיפוש בכללים שמורים..."}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-slate-400 bg-slate-50/50"
            />
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          </div>

          {/* ── Tab: ממתינים ─────────────────────────────────────────── */}
          {rulesTab === 'pending' && (
            <div className="space-y-2">
              {filteredPendingBusinesses.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
                  {rulesSearch ? (
                    <>
                      <Search size={32} className="text-slate-300" />
                      <p className="text-sm font-medium text-slate-600">לא נמצאו ממתינים לשיוך מתאימים לחיפוש</p>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={32} className="text-green-400" />
                      <p className="text-sm font-medium text-slate-600">כל בתי העסק משוייכים! 🎉</p>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between pb-1">
                    <p className="text-xs text-slate-400">
                      בתי עסק שאין להם כלל שמור. שמור קטגוריה קבועה, או סמן "ידני" אם תרצה לבחור בכל פעם מחדש.
                    </p>
                    <button
                      onClick={handleBatchAiCategorize}
                      disabled={aiBatchLoading || !useSettings.getState().llmApiKey}
                      title={!useSettings.getState().llmApiKey ? "יש להגדיר מפתח AI בהגדרות" : "זיהוי אוטומטי לכל הממתינים"}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-medium hover:bg-indigo-100 transition-colors disabled:opacity-50"
                    >
                      {aiBatchLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      זיהוי ב-AI
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto space-y-2 pl-1">
                    {filteredPendingBusinesses.map(([business, { currentCategory, count }]) => {
                      const draft = draftCats[business] ?? currentCategory;
                      return (
                        <div key={business} className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-slate-800 text-sm truncate">{business}</div>
                            <div className="text-xs text-slate-400 flex items-center gap-2">
                              <span>{count} עסקאות</span>
                              {aiBatchConfidences[business] !== undefined && (
                                <span className={`font-medium ${aiBatchConfidences[business] >= (useSettings.getState().aiConfidenceThreshold ?? 80) ? 'text-green-600' : 'text-amber-600'}`}>
                                  (ביטחון {aiBatchConfidences[business]}%)
                                </span>
                              )}
                            </div>
                          </div>
                          <select
                            value={draft}
                            onChange={(e) => setDraftCats({ ...draftCats, [business]: e.target.value as Category })}
                            className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white shrink-0 max-w-32"
                          >
                            {categoryList.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                          {/* Save as fixed rule */}
                          <button
                            onClick={() => {
                              setCategoryRule(business, draft);
                              setDraftCats((prev) => { const n = { ...prev }; delete n[business]; return n; });
                            }}
                            title="שמור קטגוריה קבועה לכל עסקאות עסק זה"
                            className="shrink-0 bg-amber-500 text-white text-xs px-2.5 py-1.5 rounded-lg hover:bg-amber-600 font-medium"
                          >
                            שמור
                          </button>
                          {/* Mark as manual */}
                          <button
                            onClick={() => setCategoryRule(business, '__manual__')}
                            title="סמן כ׳ידני׳ — תצטרך לבחור קטגוריה ידנית לכל עסקה"
                            className="shrink-0 border border-slate-300 text-slate-500 text-xs px-2.5 py-1.5 rounded-lg hover:bg-slate-100 font-medium"
                          >
                            ידני
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {filteredPendingBusinesses.length > 1 && (
                    <button
                      onClick={() => {
                        filteredPendingBusinesses.forEach(([business, { currentCategory }]) => {
                          setCategoryRule(business, draftCats[business] ?? currentCategory);
                        });
                        setDraftCats({});
                      }}
                      className="w-full border border-amber-300 text-amber-700 text-sm py-2 rounded-xl hover:bg-amber-50 font-medium"
                    >
                      שמור הכל כקטגוריות קבועות
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Tab: כללים שמורים ────────────────────────────────────── */}
          {rulesTab === 'saved' && (
            <div className="space-y-3">
              {Object.keys(categoryRules).length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
                  <Lightbulb size={32} className="text-slate-300" />
                  <p className="text-sm">אין כללים שמורים עדיין</p>
                </div>
              ) : filteredSavedRules.length === 0 && filteredManualRules.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
                  <Search size={32} className="text-slate-300" />
                  <p className="text-sm">לא נמצאו כללים מתאימים לחיפוש</p>
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto space-y-1 pl-1">
                  {/* Auto-category rules */}
                  {filteredSavedRules.length > 0 && (
                    <>
                      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-1 py-1">קטגוריה אוטומטית</div>
                      {filteredSavedRules.map(([business, category]) => {
                        const meta = categoryRulesMeta?.[business];
                        const dateStr = meta?.date ? new Date(meta.date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
                        
                        return (
                          <div key={business} className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 rounded-xl">
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-slate-800 truncate block">{business}</span>
                              {dateStr && <span className="text-[10px] text-slate-400 block mt-0.5">נשמר ב-{dateStr}</span>}
                            </div>
                            <div
                              className="text-xs px-2 py-1 rounded-full font-medium shrink-0"
                              style={{ backgroundColor: (catColors[category] ?? '#9ca3af') + '25', color: catColors[category] ?? '#9ca3af' }}
                            >
                              {category}
                            </div>
                            <button
                              onClick={() => deleteCategoryRule(business)}
                              title="מחק כלל — העסק יחזור לרשימת הממתינים"
                              className="text-slate-300 hover:text-red-400 shrink-0"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        );
                      })}
                    </>
                  )}

                  {/* Manual businesses */}
                  {filteredManualRules.length > 0 && (
                    <>
                      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-1 py-1 mt-2">ידני — בחירה בכל פעם מחדש</div>
                      {filteredManualRules.map(([business]) => {
                        const meta = categoryRulesMeta?.[business];
                        const dateStr = meta?.date ? new Date(meta.date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

                        return (
                          <div key={business} className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 rounded-xl">
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-slate-800 truncate block">{business}</span>
                              {dateStr && <span className="text-[10px] text-slate-400 block mt-0.5">נשמר ב-{dateStr}</span>}
                            </div>
                            <span className="text-xs px-2 py-1 rounded-full font-medium bg-slate-200 text-slate-500 shrink-0">
                              ידני
                            </span>
                            <button
                              onClick={() => deleteCategoryRule(business)}
                              title="הסר — העסק יחזור לרשימת הממתינים"
                              className="text-slate-300 hover:text-red-400 shrink-0"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* ── Import success toast ─────────────────────────────────────── */}
      {importToast && (
        <ImportToast data={importToast} onClose={() => setImportToast(null)} />
      )}

      {/* ── Duplicate detector modal ──────────────────────────────────── */}
      <Modal open={dupeModal} onClose={() => setDupeModal(false)} title={`זיהוי כפילויות${potentialDupes.length > 0 ? ` — ${potentialDupes.length} נמצאו` : ''}`}>
        {potentialDupes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-slate-400">
            <Star size={36} className="text-slate-200" />
            <p className="text-sm font-medium text-slate-500">לא נמצאו עסקאות כפולות</p>
            <p className="text-xs text-center">כל העסקאות נראות ייחודיות — אין זוגות עם אותו עסק, סכום, ותאריך קרוב.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pl-1">
            <p className="text-xs text-slate-400 pb-1">
              עסקאות עם אותו עסק + אותו סכום + תאריך באותו היום או עד 3 ימי הפרש. מחק את העסקה הכפולה.
            </p>
            {potentialDupes.map(({ a, b, reason }, idx) => (
              <div key={idx} className="border border-amber-100 rounded-xl overflow-hidden">
                <div className="px-3 py-1.5 bg-amber-50 text-[11px] font-semibold text-amber-700">{reason}</div>
                {[a, b].map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 border-t border-amber-50 first:border-t-0">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-slate-800 truncate block">{t.business}</span>
                      <span className="text-xs text-slate-400">{fmtDate(t.date)} • {t.source}</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-700 shrink-0">{fmtCurrency(t.amount)}</span>
                    <button
                      onClick={() => deleteTransaction(t.id)}
                      className="shrink-0 text-slate-300 hover:text-red-500 transition-colors p-1"
                      title="מחק עסקה זו"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Add Txn Type Modal */}
      <Modal open={addTxnTypeModal} onClose={() => setAddTxnTypeModal(false)} title="איך תרצה להוסיף תנועות?">
        <div className="flex flex-col gap-3 p-2" dir="rtl">
          <button
            onClick={() => { setAddTxnTypeModal(false); navigate('/settings?tab=banks'); }}
            className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-xl hover:bg-blue-50 hover:border-blue-200 transition-colors text-right"
          >
            <div className="bg-indigo-100 p-3 rounded-full text-indigo-600">
              <Landmark size={24} />
            </div>
            <div>
              <div className="font-bold text-slate-800">סנכרון אוטומטי מהבנק</div>
              <div className="text-xs text-slate-500 mt-0.5">סנכרן את כרטיסי האשראי וחשבונות הבנק שלך אוטומטית</div>
            </div>
          </button>

          <button
            onClick={() => { setAddTxnTypeModal(false); setAddModal(true); }}
            className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-xl hover:bg-blue-50 hover:border-blue-200 transition-colors text-right"
          >
            <div className="bg-blue-100 p-3 rounded-full text-blue-600">
              <Plus size={24} />
            </div>
            <div>
              <div className="font-bold text-slate-800">הזנה ידנית</div>
              <div className="text-xs text-slate-500 mt-0.5">הוסף עסקאות אחת אחת באופן ידני</div>
            </div>
          </button>
          
          <button
            onClick={() => { setAddTxnTypeModal(false); setImportModal(true); }}
            className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-xl hover:bg-blue-50 hover:border-blue-200 transition-colors text-right"
          >
            <div className="bg-emerald-100 p-3 rounded-full text-emerald-600">
              <Upload size={24} />
            </div>
            <div>
              <div className="font-bold text-slate-800">ייבוא מאקסל / CSV</div>
              <div className="text-xs text-slate-500 mt-0.5">העלה קובץ עם הרבה עסקאות בבת אחת</div>
            </div>
          </button>
        </div>
      </Modal>

      {/* Add Manual Modal */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="הוסף הוצאה">
        <div className="space-y-4">
          {(['date', 'business', 'amount', 'source', 'notes'] as const).map((field) => (
            <div key={field}>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {{ date: 'תאריך', business: 'שם עסק', amount: 'סכום (₪)', source: 'כרטיס/מקור', notes: 'הערות' }[field]}
              </label>
              <input
                type={field === 'date' ? 'date' : field === 'amount' ? 'number' : 'text'}
                value={form[field]}
                onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">קטגוריה</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              {categoryList.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button
            onClick={addManual}
            disabled={!form.business || !form.amount}
            className="w-full bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
          >
            הוסף הוצאה
          </button>
        </div>
      </Modal>

      {/* Transaction Details Modal */}
      {/* Transaction Details Modal */}
      <Modal open={!!txnDetailsModal} onClose={() => { setTxnDetailsModal(null); setIsEditingCategory(false); }} title="פרטי עסקה">
        {txnDetailsModal && (
          <div className="space-y-4 text-sm" dir="rtl">
            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div>
                <div className="text-slate-500 text-[11px] font-medium mb-1">שם עסק</div>
                <div className="font-semibold text-slate-900">{txnDetailsModal.business}</div>
              </div>
              <div>
                <div className="text-slate-500 text-[11px] font-medium mb-1">סכום</div>
                <div className="font-semibold text-slate-900" dir="ltr">{fmtCurrency(txnDetailsModal.amount)} {txnDetailsModal.currency !== 'ILS' ? `(${txnDetailsModal.currency})` : ''}</div>
              </div>
              <div>
                <div className="text-slate-500 text-[11px] font-medium mb-1">תאריך</div>
                <div className="font-medium text-slate-800">{fmtDate(txnDetailsModal.date)}</div>
              </div>
              <div>
                <div className="text-slate-500 text-[11px] font-medium mb-1">קטגוריה</div>
                {isEditingCategory ? (
                  <select
                    value={editCategoryVal}
                    onChange={(e) => setEditCategoryVal(e.target.value as Category)}
                    className="w-full border border-slate-200 rounded-lg px-2 py-1 bg-white text-sm font-medium"
                  >
                    {categoryList.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                ) : (
                  <div className="font-medium text-slate-800">{txnDetailsModal.category}</div>
                )}
              </div>
              <div>
                <div className="text-slate-500 text-[11px] font-medium mb-1">מקור השורה</div>
                <div className="font-medium text-slate-800">{txnDetailsModal.source}</div>
              </div>
              {txnDetailsModal.recurringId && (
                <div>
                  <div className="text-slate-500 text-[11px] font-medium mb-1">מקושר לחיוב קבוע</div>
                  <div className="font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded inline-block text-xs">
                    {recurring.find(r => r.id === txnDetailsModal.recurringId)?.name || 'כן'}
                  </div>
                </div>
              )}
              {txnDetailsModal.aiConfidence !== undefined && (
                <div>
                  <div className="text-slate-500 text-[11px] font-medium mb-1">רמת ביטחון סיווג AI</div>
                  <div className="font-semibold text-slate-800">{txnDetailsModal.aiConfidence}%</div>
                </div>
              )}
            </div>
            
            {txnDetailsModal.notes && (
              <div>
                <div className="text-slate-500 text-[11px] font-medium mb-1">הערות</div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-slate-700 whitespace-pre-wrap">
                  {txnDetailsModal.notes}
                </div>
              </div>
            )}
            
            {txnDetailsModal.metadata && Object.keys(txnDetailsModal.metadata).length > 0 && (
              <div>
                <div className="text-slate-500 text-[11px] font-medium mb-1">מידע נוסף (מטא-דאטה)</div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs text-slate-600 font-mono text-left overflow-x-auto" dir="ltr">
                  <pre>{JSON.stringify(txnDetailsModal.metadata, null, 2)}</pre>
                </div>
              </div>
            )}
            
            <div className="pt-2 flex gap-2">
              {isEditingCategory ? (
                <>
                  <button 
                    onClick={() => {
                      if (txnDetailsModal) {
                        if (txnDetailsModal.isVirtual && txnDetailsModal.recurringId) {
                          updateRecurring(txnDetailsModal.recurringId, { category: editCategoryVal });
                        } else {
                          overrideCategory(txnDetailsModal.id, editCategoryVal);
                        }
                        setTxnDetailsModal({ ...txnDetailsModal, category: editCategoryVal });
                        setIsEditingCategory(false);
                      }
                    }} 
                    className="flex-1 bg-green-600 text-white rounded-xl py-2.5 text-sm hover:bg-green-700 font-medium"
                  >
                    שמור
                  </button>
                  <button 
                    onClick={() => setIsEditingCategory(false)} 
                    className="flex-1 bg-white border border-slate-200 text-slate-700 rounded-xl py-2.5 text-sm hover:bg-slate-50 font-medium"
                  >
                    ביטול
                  </button>
                </>
              ) : (
                <>
                  <button 
                    onClick={() => {
                      setIsEditingCategory(true);
                      setEditCategoryVal(txnDetailsModal.category);
                    }} 
                    className="flex-1 bg-white border border-slate-200 text-slate-700 rounded-xl py-2.5 text-sm hover:bg-slate-50 font-medium"
                  >
                    ערוך
                  </button>
                  <button 
                    onClick={() => analyzeSingleTransaction(txnDetailsModal)} 
                    disabled={isSingleAILoading}
                    className="flex-1 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 text-blue-700 rounded-xl py-2.5 text-sm hover:from-blue-100 hover:to-indigo-100 font-medium flex justify-center items-center gap-1 disabled:opacity-50"
                  >
                    {isSingleAILoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    בדיקת AI
                  </button>
                  {!txnDetailsModal.isVirtual && (
                    <button 
                      onClick={() => { deleteTransaction(txnDetailsModal.id); setTxnDetailsModal(null); }} 
                      className="flex-1 bg-red-50 border border-red-100 text-red-600 rounded-xl py-2.5 text-sm hover:bg-red-100 font-medium"
                    >
                      מחק עסקה
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </Modal>
      {/* AI Debug Log Modal */}
      <Modal open={!!aiDebugLog} onClose={() => setAiDebugLog(null)} title="לוג ניתוח AI">
        {aiDebugLog && (
          <div className="space-y-4">
            <div className="bg-slate-800 text-slate-300 p-4 rounded-xl font-mono text-xs overflow-x-auto" dir="ltr">
              <div className="text-slate-400 mb-2">Prompt:</div>
              <pre className="whitespace-pre-wrap">{aiDebugLog.prompt}</pre>
              <div className="text-slate-400 mt-6 mb-2">Response:</div>
              <pre className="whitespace-pre-wrap">{aiDebugLog.response}</pre>
            </div>
            <button 
              onClick={() => setAiDebugLog(null)} 
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 rounded-lg transition-colors"
            >
              סגור
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── Import success toast ──────────────────────────────────────────────────────
const TOAST_DURATION = 6000; // ms

function ImportToast({
  data,
  onClose,
}: {
  data: { count: number; totalAmt: number; avg: number; topCat: string; dateRange: string };
  onClose: () => void;
}) {
  const [progress, setProgress] = useState(100);
  const [leaving, setLeaving] = useState(false);
  const pausedRef   = useRef(false);
  const remainingRef = useRef(TOAST_DURATION);
  const lastTickRef  = useRef(Date.now());

  function dismiss() {
    setLeaving(true);
    setTimeout(onClose, 260); // wait for slide-out animation
  }

  useEffect(() => {
    const id = setInterval(() => {
      if (pausedRef.current) {
        lastTickRef.current = Date.now(); // reset tick so we don't "catch up" after unpause
        return;
      }
      const now = Date.now();
      const elapsed = now - lastTickRef.current;
      lastTickRef.current = now;
      remainingRef.current -= elapsed;
      if (remainingRef.current <= 0) { dismiss(); return; }
      setProgress((remainingRef.current / TOAST_DURATION) * 100);
    }, 40);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`fixed bottom-6 left-6 z-[60] w-80 bg-white rounded-2xl shadow-2xl overflow-hidden ${
        leaving ? 'animate-slide-out' : 'animate-slide-up'
      }`}
      style={{ border: '1px solid rgba(226,232,240,0.8)' }}
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; lastTickRef.current = Date.now(); }}
    >
      {/* Timer bar — drains left to right */}
      <div className="h-1 bg-slate-100">
        <div
          className="h-full bg-green-500 transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
            <CheckCheck size={18} className="text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-900 text-sm">ייבוא הצליח!</div>
            <div className="text-xs text-slate-500 mt-0.5">
              יובאו <span className="font-bold text-slate-700">{data.count}</span> עסקאות
            </div>
          </div>
          <button
            onClick={dismiss}
            className="text-slate-300 hover:text-slate-500 shrink-0 p-0.5 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Stats grid */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="bg-slate-50 rounded-xl p-2.5">
            <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">סה"כ יובא</div>
            <div className="text-sm font-bold text-slate-800">{fmtCurrency(data.totalAmt)}</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-2.5">
            <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">ממוצע לעסקה</div>
            <div className="text-sm font-bold text-slate-800">{fmtCurrency(data.avg)}</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-2.5">
            <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">קטגוריה מובילה</div>
            <div className="text-xs font-semibold text-slate-700 truncate">{data.topCat}</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-2.5">
            <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">טווח תאריכים</div>
            <div className="text-xs font-semibold text-slate-700">{data.dateRange}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
