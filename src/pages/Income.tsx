import { useState } from 'react';
import { Plus, X, Pencil } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useStore } from '../store';
import Card from '../components/common/Card';
import Modal from '../components/common/Modal';
import Badge from '../components/common/Badge';
import { fmtCurrency, fmtDate, fmt } from '../utils/format';
import type { IncomeEntry } from '../types';

const TYPES: IncomeEntry['type'][] = ['משכורת', 'שכ"ד', 'פרילנס', 'דיבידנד', 'ריבית', 'אחר'];
const BLANK_FORM = { date: new Date().toISOString().slice(0, 10), source: '', type: 'משכורת' as IncomeEntry['type'], grossAmount: '', netAmount: '', recurring: false };

export default function Income() {
  const { income, addIncome, updateIncome, deleteIncome } = useStore();
  const [modal, setModal] = useState(false);
  const [editItem, setEditItem] = useState<IncomeEntry | null>(null);
  const [form, setForm] = useState(BLANK_FORM);

  function openEdit(e: IncomeEntry) {
    setEditItem(e);
    setForm({ date: e.date, source: e.source, type: e.type, grossAmount: e.grossAmount ? String(e.grossAmount) : '', netAmount: String(e.netAmount), recurring: e.recurring });
  }

  function saveEdit() {
    if (!editItem) return;
    updateIncome(editItem.id, { date: form.date, source: form.source, type: form.type, grossAmount: form.grossAmount ? +form.grossAmount : undefined, netAmount: +form.netAmount, recurring: form.recurring });
    setEditItem(null);
  }

  // Last 6 months chart
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('he-IL', { month: 'short' });
    const total = income.filter((e) => e.date.startsWith(key)).reduce((a, e) => a + e.netAmount, 0);
    return { month: label, הכנסה: total };
  }).reverse();

  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthIncome = income.filter((e) => e.date.startsWith(thisMonth)).reduce((a, e) => a + e.netAmount, 0);
  const monthGross = income.filter((e) => e.date.startsWith(thisMonth)).reduce((a, e) => a + (e.grossAmount ?? e.netAmount), 0);

  function addEntry() {
    addIncome({ date: form.date, source: form.source, type: form.type, grossAmount: form.grossAmount ? +form.grossAmount : undefined, netAmount: +form.netAmount, recurring: form.recurring });
    setModal(false);
    setForm(BLANK_FORM);
  }

  const typeColors: Record<string, 'green' | 'blue' | 'purple' | 'amber'> = {
    'משכורת': 'green', 'שכ"ד': 'blue', 'פרילנס': 'purple', 'דיבידנד': 'amber', 'ריבית': 'amber', 'אחר': 'green',
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">הכנסות</h1>
          <p className="text-slate-500 text-sm">{income.length} רשומות</p>
        </div>
        <button onClick={() => setModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-xl text-sm text-white hover:bg-blue-700">
          <Plus size={16} /> הוסף הכנסה
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="text-sm text-slate-500">הכנסה נטו החודש</div>
          <div className="text-2xl font-bold text-green-600">{fmtCurrency(monthIncome)}</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">ברוטו החודש</div>
          <div className="text-2xl font-bold text-slate-900">{fmtCurrency(monthGross)}</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">ממוצע חצי שנה</div>
          <div className="text-2xl font-bold text-slate-900">{fmtCurrency(months.reduce((a, m) => a + m.הכנסה, 0) / 6)}</div>
        </Card>
      </div>

      <Card>
        <h2 className="font-semibold text-slate-900 mb-4">הכנסות 6 חודשים אחרונים</h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={months}>
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v: unknown) => fmtCurrency(v as number)} />
            <Bar dataKey="הכנסה" fill="#22c55e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[500px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {['תאריך', 'מקור', 'סוג', 'ברוטו', 'נטו', ''].map((h) => (
                <th key={h} className="text-right px-4 py-3 text-slate-500 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...income].sort((a, b) => b.date.localeCompare(a.date)).map((e) => (
              <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-600">{fmtDate(e.date)}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{e.source}</td>
                <td className="px-4 py-3"><Badge variant={typeColors[e.type] ?? 'gray'}>{e.type}</Badge></td>
                <td className="px-4 py-3 text-slate-500">{e.grossAmount ? fmtCurrency(e.grossAmount) : '—'}</td>
                <td className="px-4 py-3 font-semibold text-green-600">{fmtCurrency(e.netAmount)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(e)} className="text-slate-300 hover:text-blue-500 p-1"><Pencil size={13} /></button>
                    <button onClick={() => deleteIncome(e.id)} className="text-slate-300 hover:text-red-400 p-1"><X size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Edit modal */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title={`ערוך — ${editItem?.source ?? ''}`}>
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-slate-700 mb-1">תאריך</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">מקור</label>
            <input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">סוג</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as IncomeEntry['type'] })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">ברוטו (₪) — אופציונלי</label>
            <input type="number" value={form.grossAmount} onChange={(e) => setForm({ ...form, grossAmount: e.target.value })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">נטו (₪)</label>
            <input type="number" value={form.netAmount} onChange={(e) => setForm({ ...form, netAmount: e.target.value })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.recurring} onChange={(e) => setForm({ ...form, recurring: e.target.checked })} className="rounded" />
            <span className="text-sm text-slate-700">הכנסה קבועה חוזרת</span>
          </label>
          <button onClick={saveEdit} disabled={!form.source || !form.netAmount}
            className="w-full bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-40">שמור שינויים</button>
        </div>
      </Modal>

      <Modal open={modal} onClose={() => setModal(false)} title="הוסף הכנסה">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">תאריך</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">מקור</label>
            <input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">סוג</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">ברוטו (₪) — אופציונלי</label>
            <input type="number" value={form.grossAmount} onChange={(e) => setForm({ ...form, grossAmount: e.target.value })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">נטו (₪)</label>
            <input type="number" value={form.netAmount} onChange={(e) => setForm({ ...form, netAmount: e.target.value })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.recurring} onChange={(e) => setForm({ ...form, recurring: e.target.checked })} className="rounded" />
            <span className="text-sm text-slate-700">הכנסה קבועה חוזרת</span>
          </label>
          <button onClick={addEntry} disabled={!form.source || !form.netAmount}
            className="w-full bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
            הוסף הכנסה
          </button>
        </div>
      </Modal>
    </div>
  );
}
