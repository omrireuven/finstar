import { useState } from 'react';
import { Plus, AlertCircle, Pencil } from 'lucide-react';
import { useStore } from '../store';
import Card from '../components/common/Card';
import Modal from '../components/common/Modal';
import Badge from '../components/common/Badge';
import { fmtCurrency, fmtDate, fmt } from '../utils/format';
import type { SavingsAccount } from '../types';

const BANKS = ['בנק הפועלים', 'בנק לאומי', 'מזרחי-טפחות', 'בנק דיסקונט', 'הבנק הבינלאומי', 'בנק מרכנתיל', 'אחר'];
const BLANK = { bank: BANKS[0], name: '', amount: '', interestRate: '', maturityDate: '', openDate: new Date().toISOString().slice(0, 10) };

export default function Savings() {
  const { savings, addSavings, updateSavings, deleteSavings } = useStore();
  const [modal, setModal] = useState(false);
  const [editItem, setEditItem] = useState<SavingsAccount | null>(null);
  const [form, setForm] = useState(BLANK);

  function openEdit(s: SavingsAccount) {
    setEditItem(s);
    setForm({ bank: s.bank, name: s.name, amount: String(s.amount), interestRate: String(s.interestRate), maturityDate: s.maturityDate, openDate: s.openDate });
  }

  function saveEdit() {
    if (!editItem) return;
    updateSavings(editItem.id, { bank: form.bank, name: form.name, amount: +form.amount, interestRate: +form.interestRate, maturityDate: form.maturityDate, openDate: form.openDate });
    setEditItem(null);
  }

  const open = savings.filter((s) => s.open);
  const totalBalance = open.reduce((a, s) => a + s.amount, 0);
  const avgRate = open.length > 0 ? open.reduce((a, s) => a + s.interestRate, 0) / open.length : 0;

  function calcAccruedInterest(s: typeof savings[0]) {
    const days = (new Date().getTime() - new Date(s.openDate).getTime()) / (1000 * 86400);
    return s.amount * (s.interestRate / 100) * (days / 365);
  }

  function daysToMaturity(maturityDate: string) {
    return Math.round((new Date(maturityDate).getTime() - new Date().getTime()) / (1000 * 86400));
  }

  function addAccount() {
    addSavings({ bank: form.bank, name: form.name, amount: +form.amount, interestRate: +form.interestRate, maturityDate: form.maturityDate, openDate: form.openDate, open: true });
    setModal(false);
    setForm({ bank: BANKS[0], name: '', amount: '', interestRate: '', maturityDate: '', openDate: new Date().toISOString().slice(0, 10) });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">חסכונות ופיקדונות</h1>
          <p className="text-slate-500 text-sm">{open.length} פיקדונות פעילים</p>
        </div>
        <button onClick={() => setModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-xl text-sm text-white hover:bg-blue-700">
          <Plus size={16} /> הוסף פיקדון
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="text-sm text-slate-500">סה"כ בחסכונות</div>
          <div className="text-2xl font-bold text-slate-900">{fmtCurrency(totalBalance)}</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">ריבית ממוצעת</div>
          <div className="text-2xl font-bold text-green-600">{fmt(avgRate, 1)}%</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">ריבית שנצברה (הערכה)</div>
          <div className="text-2xl font-bold text-slate-900">{fmtCurrency(open.reduce((a, s) => a + calcAccruedInterest(s), 0))}</div>
        </Card>
      </div>

      <div className="space-y-4">
        {savings.map((s) => {
          const dtm = daysToMaturity(s.maturityDate);
          const accrued = calcAccruedInterest(s);
          return (
            <Card key={s.id}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-slate-900">{s.name}</h3>
                    {dtm <= 30 && dtm > 0 && (
                      <Badge variant="amber"><AlertCircle size={10} className="ml-1" />פג בעוד {dtm} ימים</Badge>
                    )}
                    {dtm <= 0 && <Badge variant="red">פג</Badge>}
                    {!s.open && <Badge variant="gray">סגור</Badge>}
                  </div>
                  <div className="text-sm text-slate-500">{s.bank}</div>
                </div>
                <div className="text-left">
                  <div className="text-xl font-bold text-slate-900">{fmtCurrency(s.amount)}</div>
                  <div className="text-sm text-green-600">{fmt(s.interestRate, 1)}% שנתי</div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-100 text-sm">
                <div>
                  <div className="text-slate-400">תאריך פתיחה</div>
                  <div className="font-medium text-slate-700">{fmtDate(s.openDate)}</div>
                </div>
                <div>
                  <div className="text-slate-400">תאריך פירעון</div>
                  <div className="font-medium text-slate-700">{fmtDate(s.maturityDate)}</div>
                </div>
                <div>
                  <div className="text-slate-400">ריבית שנצברה</div>
                  <div className="font-medium text-green-600">{fmtCurrency(accrued)}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(s)}
                    className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1">
                    <Pencil size={11} /> ערוך
                  </button>
                  <button onClick={() => updateSavings(s.id, { open: !s.open })}
                    className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50">
                    {s.open ? 'סגור' : 'פתח'}
                  </button>
                  <button onClick={() => deleteSavings(s.id)} className="text-xs px-3 py-1.5 border border-red-100 text-red-500 rounded-lg hover:bg-red-50">מחק</button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Edit modal */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title={`ערוך פיקדון — ${editItem?.name ?? ''}`}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">בנק</label>
            <select value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          {([
            { key: 'name', label: 'שם הפיקדון' },
            { key: 'amount', label: 'סכום (₪)', type: 'number' },
            { key: 'interestRate', label: 'ריבית שנתית (%)', type: 'number' },
            { key: 'openDate', label: 'תאריך פתיחה', type: 'date' },
            { key: 'maturityDate', label: 'תאריך פירעון', type: 'date' },
          ] as { key: string; label: string; type?: string }[]).map(({ key, label, type = 'text' }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
              <input type={type} value={(form as Record<string, string>)[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          ))}
          <button onClick={saveEdit}
            className="w-full bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700">
            שמור שינויים
          </button>
        </div>
      </Modal>

      <Modal open={modal} onClose={() => setModal(false)} title="הוסף פיקדון">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">בנק</label>
            <select value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          {[
            { key: 'name', label: 'שם הפיקדון' },
            { key: 'amount', label: 'סכום (₪)', type: 'number' },
            { key: 'interestRate', label: 'ריבית שנתית (%)', type: 'number' },
            { key: 'openDate', label: 'תאריך פתיחה', type: 'date' },
            { key: 'maturityDate', label: 'תאריך פירעון', type: 'date' },
          ].map(({ key, label, type = 'text' }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
              <input type={type} value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          ))}
          <button onClick={addAccount} disabled={!form.amount || !form.maturityDate}
            className="w-full bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
            הוסף פיקדון
          </button>
        </div>
      </Modal>
    </div>
  );
}
