import { useState } from 'react';
import { Plus, ExternalLink, Pencil } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useStore } from '../store';
import Card from '../components/common/Card';
import Modal from '../components/common/Modal';
import { fmtCurrency, fmt } from '../utils/format';

const COMPANIES = ['מיטב', 'הפניקס', 'מגדל', 'הראל', 'כלל', 'מנורה', 'פסגות', 'אלטשולר שחם'];
const TRACKS = ['מסלול כללי', 'אג"ח שקלי', 'מניות', 'מניות חו"ל', 'מסלול סולידי', 'מסלול הלכתי'];

const LINKS: Record<string, string> = {
  'מיטב': 'https://www.meitav.co.il', 'הפניקס': 'https://www.phoenix.co.il',
  'מגדל': 'https://www.migdal.co.il', 'הראל': 'https://www.harel.co.il',
  'כלל': 'https://www.clal-finance.co.il',
};

export default function Gemel() {
  const { gemel, addGemel, updateGemel, deleteGemel } = useStore();
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', company: COMPANIES[0], balance: '', track: TRACKS[0], managementFee: '', annualReturn: '', depositFee: '', employeeContribution: '', employerContribution: '', salary: '' });

  function openEdit(g: typeof gemel[0]) {
    setEditId(g.id);
    setForm({ name: g.name, company: g.company, balance: String(g.balance), track: g.track, managementFee: String(g.managementFee), annualReturn: String(g.annualReturn), depositFee: String(g.depositFee || 0), employeeContribution: String(g.employeeContribution || 0), employerContribution: String(g.employerContribution || 0), salary: String(g.salary || 0) });
  }

  function saveEdit() {
    if (!editId) return;
    updateGemel(editId, { name: form.name, company: form.company, balance: +form.balance, track: form.track, managementFee: +form.managementFee, annualReturn: +form.annualReturn, depositFee: +form.depositFee, employeeContribution: +form.employeeContribution, employerContribution: +form.employerContribution, salary: +form.salary });
    setEditId(null);
  }

  const totalBalance = gemel.reduce((a, g) => a + g.balance, 0);
  const avgReturn = gemel.length > 0 ? gemel.reduce((a, g) => a + g.annualReturn, 0) / gemel.length : 0;

  // Mock balance chart
  const months = ['נוב', 'דצ', 'ינו', 'פב', 'מר', 'אפ', 'מא'];
  const chartData = months.map((m, i) => ({ month: m, יתרה: Math.round(totalBalance * (0.88 + i * 0.02)) }));

  function addFund() {
    addGemel({ name: form.name, company: form.company, balance: +form.balance, track: form.track, managementFee: +form.managementFee, annualReturn: +form.annualReturn, depositFee: +form.depositFee, employeeContribution: +form.employeeContribution, employerContribution: +form.employerContribution, salary: +form.salary });
    setModal(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">קופות גמל</h1>
          <p className="text-slate-500 text-sm">{gemel.length} קרנות</p>
        </div>
        <button onClick={() => setModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-xl text-sm text-white hover:bg-blue-700">
          <Plus size={16} /> הוסף קרן
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="text-sm text-slate-500">סה"כ יתרה</div>
          <div className="text-2xl font-bold text-slate-900">{fmtCurrency(totalBalance)}</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">תשואה שנתית ממוצעת</div>
          <div className="text-2xl font-bold text-green-600">{fmt(avgReturn, 1)}%</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">דמי ניהול ממוצעים</div>
          <div className="text-2xl font-bold text-slate-900">{fmt(gemel.length > 0 ? gemel.reduce((a,g)=>a+g.managementFee,0)/gemel.length : 0, 2)}%</div>
        </Card>
      </div>

      {totalBalance > 0 && (
        <Card>
          <h2 className="font-semibold text-slate-900 mb-4">יתרה לאורך זמן</h2>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData}>
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => `₪${(v/1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: unknown) => fmtCurrency(v as number)} />
              <Area type="monotone" dataKey="יתרה" stroke="#8b5cf6" fill="#8b5cf620" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      <div className="space-y-4">
        {gemel.map((g) => (
          <Card key={g.id}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">{g.name}</h3>
                <div className="text-sm text-slate-500">{g.company} • {g.track}</div>
              </div>
              <div className="flex items-center gap-3">
                {LINKS[g.company] && (
                  <a href={LINKS[g.company]} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">
                    <ExternalLink size={16} />
                  </a>
                )}
                <div className="text-left">
                  <div className="text-xl font-bold text-slate-900">{fmtCurrency(g.balance)}</div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-100 text-sm">
              <div><div className="text-slate-400">דמי ניהול</div><div className="font-medium">{fmt(g.managementFee, 2)}%</div></div>
              <div><div className="text-slate-400">תשואה שנתית</div><div className={`font-medium ${g.annualReturn >= 0 ? 'text-green-600' : 'text-red-500'}`}>{g.annualReturn >= 0 ? '+' : ''}{fmt(g.annualReturn, 1)}%</div></div>
              <div><div className="text-slate-400">תשואה מצטברת</div><div className={`font-medium ${g.annualReturn >= 0 ? 'text-green-600' : 'text-red-500'}`}>{g.annualReturn >= 0 ? '+' : ''}{fmt(g.annualReturn, 1)}%</div></div>
              <div className="flex gap-2 items-end">
                <button onClick={() => openEdit(g)} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1">
                  <Pencil size={11} /> ערוך
                </button>
                <button onClick={() => deleteGemel(g.id)} className="text-xs px-3 py-1.5 border border-red-100 text-red-500 rounded-lg hover:bg-red-50">מחק</button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Edit modal */}
      <Modal open={!!editId} onClose={() => setEditId(null)} title="ערוך קופת גמל">
        <div className="space-y-4">
          {([
            { key: 'name', label: 'שם הקרן' },
            { key: 'balance', label: 'יתרה נוכחית (₪)', type: 'number' },
            { key: 'managementFee', label: 'דמי ניהול (%)', type: 'number' },
            { key: 'annualReturn', label: 'תשואה שנתית (%)', type: 'number' },
          ] as { key: string; label: string; type?: string }[]).map(({ key, label, type = 'text' }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
              <input type={type} value={(form as Record<string, string>)[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          ))}
          {[{ key: 'company', label: 'חברה מנהלת', opts: COMPANIES }, { key: 'track', label: 'מסלול', opts: TRACKS }].map(({ key, label, opts }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
              <select value={(form as Record<string, string>)[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                {opts.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
          <button onClick={saveEdit} className="w-full bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700">
            שמור שינויים
          </button>
        </div>
      </Modal>

      <Modal open={modal} onClose={() => setModal(false)} title="הוסף קופת גמל">
        <div className="space-y-4">
          {[
            { key: 'name', label: 'שם הקרן' },
            { key: 'balance', label: 'יתרה נוכחית (₪)', type: 'number' },
            { key: 'managementFee', label: 'דמי ניהול (%)', type: 'number' },
            { key: 'annualReturn', label: 'תשואה שנתית (%)', type: 'number' },
          ].map(({ key, label, type = 'text' }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
              <input type={type} value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          ))}
          {[{ key: 'company', label: 'חברה מנהלת', opts: COMPANIES }, { key: 'track', label: 'מסלול', opts: TRACKS }].map(({ key, label, opts }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
              <select value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                {opts.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
          <button onClick={addFund} disabled={!form.name || !form.balance}
            className="w-full bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
            הוסף קרן
          </button>
        </div>
      </Modal>
    </div>
  );
}
