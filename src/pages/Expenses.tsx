import { useState, useRef } from 'react';
import { Upload, Plus, Search, Download, Sparkles, X, Pencil, Link2 } from 'lucide-react';
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
  const { transactions, recurring, addTransactions, overrideCategory, deleteTransaction, updateTransaction } = useStore();
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

  const BLANK_FORM = { date: new Date().toISOString().slice(0, 10), business: '', amount: '', category: 'אחר' as Category, source: 'מזומן', notes: '', recurringId: '' };
  const [form, setForm] = useState(BLANK_FORM);
  const [editForm, setEditForm] = useState(BLANK_FORM);

  const months = [...new Set(transactions.map((t) => t.date.slice(0, 7)))].sort().reverse();

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

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      let txns;
      if (importType === 'cal') txns = await parseCalVisa(file, importCard);
      else if (importType === 'isracard') txns = await parseIsracard(file, importCard);
      else txns = await parseGenericCSV(file, importCard);
      addTransactions(txns);
      setImportModal(false);
      alert(`יובאו ${txns.length} עסקאות בהצלחה`);
    } catch {
      alert('שגיאה בייבוא הקובץ');
    }
    setImporting(false);
    if (fileRef.current) fileRef.current.value = '';
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
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">הוצאות וחיובים</h1>
          <p className="text-slate-500 text-sm">{filtered.length} עסקאות • סה"כ {fmtCurrency(total)}</p>
        </div>
        <div className="flex gap-2">
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
                  <div className="flex items-center gap-1">
                    <select
                      value={t.category}
                      onChange={(e) => overrideCategory(t.id, e.target.value as Category)}
                      className="text-xs px-2 py-1 rounded-full border-0 font-medium cursor-pointer"
                      style={{ backgroundColor: (catColors[t.category] ?? '#9ca3af') + '20', color: catColors[t.category] ?? '#9ca3af' }}
                    >
                      {categoryList.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    {t.aiCategorized && !t.categoryOverride && (
                      <Sparkles size={12} className="text-purple-400" />
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 font-semibold text-slate-900">
                  {fmtCurrency(t.amount)}
                  {t.currency !== 'ILS' && <span className="text-xs text-slate-400 mr-1">({t.currency})</span>}
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">{t.source}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
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
      <Modal open={importModal} onClose={() => setImportModal(false)} title="יבוא עסקאות">
        <div className="space-y-4">
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
            className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:bg-slate-50"
          >
            <Upload size={24} className="text-slate-400 mx-auto mb-2" />
            <p className="text-sm text-slate-600">{importing ? 'מייבא...' : 'לחץ לבחירת קובץ'}</p>
            <p className="text-xs text-slate-400 mt-1">XLSX / CSV עד 10MB</p>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.csv,.xls" className="hidden" onChange={handleFile} />
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
