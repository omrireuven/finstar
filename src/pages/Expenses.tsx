import { useState, useRef } from 'react';
import { Upload, Plus, Search, Download, Lightbulb, X, Pencil, Link2, Trash2, CheckCircle2 } from 'lucide-react';
import { useStore, useCategoryList, useCategoryColorMap } from '../store';
import Card from '../components/common/Card';
import Modal from '../components/common/Modal';
import { fmtCurrency, fmtDate } from '../utils/format';
import type { Transaction, Category } from '../types';
import { parseCalVisa, parseIsracard, parseGenericCSV } from '../utils/parsers';
import { nanoid } from '../utils/nanoid';
import * as XLSX from 'xlsx';

const PAGE_SIZE = 20;

export default function Expenses() {
  const { transactions, recurring, categoryRules, addTransactions, overrideCategory,
          deleteTransaction, updateTransaction, setCategoryRule, deleteCategoryRule } = useStore();
  const categoryList = useCategoryList();
  const catColors = useCategoryColorMap();

  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<Category | 'הכל'>('הכל');
  const [monthFilter, setMonthFilter] = useState('');
  const [page, setPage] = useState(1);
  const [importModal, setImportModal] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [editTxn, setEditTxn] = useState<Transaction | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importType, setImportType] = useState<'cal' | 'isracard' | 'generic'>('cal');
  const [importCard, setImportCard] = useState('ויזה כאל');
  const [rulesModal, setRulesModal] = useState(false);
  const [rulesTab, setRulesTab] = useState<'pending' | 'saved'>('pending');
  const [draftCats, setDraftCats] = useState<Record<string, Category>>({});

  // Inline recurring link popover
  const [linkingTxnId, setLinkingTxnId] = useState<string | null>(null);

  // Import dedup preview
  type DupResult = { fresh: Transaction[]; dupes: number; total: number; allDupes: boolean };
  const [dupResult, setDupResult] = useState<DupResult | null>(null);

  const BLANK_FORM = { date: new Date().toISOString().slice(0, 10), business: '', amount: '', category: 'אחר' as Category, source: 'מזומן', notes: '', recurringId: '' };
  const [form, setForm] = useState(BLANK_FORM);
  const [editForm, setEditForm] = useState(BLANK_FORM);

  const months = [...new Set(transactions.map((t) => t.date.slice(0, 7)))].sort().reverse();

  // All unique business names with NO rule at all (neither auto-category nor __manual__)
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

  const savedRules   = Object.entries(categoryRules).filter(([, v]) => v !== '__manual__');
  const manualRules  = Object.entries(categoryRules).filter(([, v]) => v === '__manual__');

  const filtered = transactions
    .filter((t) => {
      if (search && !t.business.toLowerCase().includes(search.toLowerCase()) && !t.category.includes(search)) return false;
      if (catFilter !== 'הכל' && t.category !== catFilter) return false;
      if (monthFilter && !t.date.startsWith(monthFilter)) return false;
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

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
      }
    } catch {
      alert('שגיאה בייבוא הקובץ');
    }
    setImporting(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  function confirmImport() {
    if (!dupResult || dupResult.fresh.length === 0) return;
    addTransactions(dupResult.fresh);
    setDupResult(null);
    setImportModal(false);
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
    <div className="space-y-5" onClick={() => setLinkingTxnId(null)}>
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
          <button onClick={() => setAddModal(true)} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 hover:bg-slate-50">
            <Plus size={16} /> הוסף ידנית
          </button>
          <button onClick={exportExcel} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 hover:bg-slate-50">
            <Download size={16} /> ייצוא
          </button>
          <button onClick={() => setImportModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-xl text-sm text-white hover:bg-blue-700">
            <Upload size={16} /> יבא CSV/XLSX
          </button>
        </div>
      </div>

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
      </Card>

      {/* Table */}
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
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
            {paginated.map((t) => (
              <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 text-slate-600">{fmtDate(t.date)}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{t.business}</div>
                  {t.notes && <div className="text-xs text-slate-400">{t.notes}</div>}
                  {t.recurringId && (() => {
                    const rec = recurring.find(r => r.id === t.recurringId);
                    return rec ? (
                      <div className="inline-flex items-center gap-1 mt-0.5 text-[10px] bg-blue-50 text-blue-600 border border-blue-100 rounded-full px-1.5 py-0.5">
                        <Link2 size={8} /> {rec.name}
                      </div>
                    ) : null;
                  })()}
                </td>
                <td className="px-4 py-3">
                  {categoryRules[t.business] === '__manual__' ? (
                    /* ── Manual business: editable dropdown ── */
                    <select
                      value={t.category}
                      onChange={(e) => overrideCategory(t.id, e.target.value as Category)}
                      className="text-xs px-2 py-1 rounded-full border-0 font-medium cursor-pointer ring-1 ring-inset"
                      style={{
                        backgroundColor: (catColors[t.category] ?? '#9ca3af') + '20',
                        color: catColors[t.category] ?? '#9ca3af',
                        ringColor: (catColors[t.category] ?? '#9ca3af') + '60',
                      }}
                    >
                      {categoryList.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : (
                    /* ── Auto / pending business: read-only badge ── */
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
                  <div className="flex items-center gap-1">
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
                    <button onClick={() => deleteTransaction(t.id)} className="text-slate-300 hover:text-red-400 p-1">
                      <X size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
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
      <Modal open={rulesModal} onClose={() => setRulesModal(false)} title="קטגוריות אוטומטיות">
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

          {/* ── Tab: ממתינים ─────────────────────────────────────────── */}
          {rulesTab === 'pending' && (
            <div className="space-y-2">
              {pendingBusinesses.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
                  <CheckCircle2 size={32} className="text-green-400" />
                  <p className="text-sm font-medium text-slate-600">כל בתי העסק משוייכים! 🎉</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-slate-400 pb-1">
                    בתי עסק שאין להם כלל שמור. שמור קטגוריה קבועה, או סמן "ידני" אם תרצה לבחור בכל פעם מחדש.
                  </p>
                  <div className="max-h-80 overflow-y-auto space-y-2 pl-1">
                    {pendingBusinesses.map(([business, { currentCategory, count }]) => {
                      const draft = draftCats[business] ?? currentCategory;
                      return (
                        <div key={business} className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-slate-800 text-sm truncate">{business}</div>
                            <div className="text-xs text-slate-400">{count} עסקאות</div>
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
                  {pendingBusinesses.length > 1 && (
                    <button
                      onClick={() => {
                        pendingBusinesses.forEach(([business, { currentCategory }]) => {
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
              ) : (
                <div className="max-h-80 overflow-y-auto space-y-1 pl-1">
                  {/* Auto-category rules */}
                  {savedRules.length > 0 && (
                    <>
                      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-1 py-1">קטגוריה אוטומטית</div>
                      {savedRules.sort((a, b) => a[0].localeCompare(b[0])).map(([business, category]) => (
                        <div key={business} className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 rounded-xl">
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-slate-800 truncate block">{business}</span>
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
                      ))}
                    </>
                  )}

                  {/* Manual businesses */}
                  {manualRules.length > 0 && (
                    <>
                      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-1 py-1 mt-2">ידני — בחירה בכל פעם מחדש</div>
                      {manualRules.sort((a, b) => a[0].localeCompare(b[0])).map(([business]) => (
                        <div key={business} className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 rounded-xl">
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-slate-800 truncate block">{business}</span>
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
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
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
    </div>
  );
}
