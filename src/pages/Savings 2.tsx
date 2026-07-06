import { useState } from 'react';
import { Plus, AlertCircle, Pencil, ExternalLink, Info } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useStore } from '../store';
import Card from '../components/common/Card';
import Modal from '../components/common/Modal';
import Badge from '../components/common/Badge';
import { fmtCurrency, fmtDate, fmt } from '../utils/format';
import type { SavingsAccount, GemelFund } from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────
const BANKS = ['בנק הפועלים', 'בנק לאומי', 'מזרחי-טפחות', 'בנק דיסקונט', 'הבנק הבינלאומי', 'בנק מרכנתיל', 'אחר'];
const GEMEL_COMPANIES = ['מיטב', 'הפניקס', 'מגדל', 'הראל', 'כלל', 'מנורה', 'פסגות', 'אלטשולר שחם'];
const GEMEL_TRACKS = ['מסלול כללי', 'אג"ח שקלי', 'מניות', 'מניות חו"ל', 'מסלול סולידי', 'מסלול הלכתי'];
const PENSION_TRACKS = ['מסלול כללי', 'מסלול אג"ח', 'מסלול מניות', 'מסלול הלכתי', 'מסלול סולידי', 'מסלול מניות חו"ל'];
const COMPANY_LINKS: Record<string, string> = {
  'מיטב': 'https://www.meitav.co.il', 'הפניקס': 'https://www.phoenix.co.il',
  'מגדל': 'https://www.migdal.co.il', 'הראל': 'https://www.harel.co.il',
  'כלל': 'https://www.clal-finance.co.il',
};

// ── Pension projection ────────────────────────────────────────────────────────
function projectPension(balance: number, monthlyTotal: number, yearsLeft: number, rate: number) {
  const monthlyRate = rate / 12;
  let b = balance;
  const data = [{ year: 'היום', יתרה: Math.round(b) }];
  for (let y = 1; y <= yearsLeft; y++) {
    for (let m = 0; m < 12; m++) b = b * (1 + monthlyRate) + monthlyTotal;
    if (y % 5 === 0 || y === yearsLeft) data.push({ year: `+${y}`, יתרה: Math.round(b) });
  }
  return { finalBalance: b, data };
}

// ── Tooltip helper ────────────────────────────────────────────────────────────
function Tip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-block">
      <Info size={13} className="text-slate-400 hover:text-blue-500 cursor-help"
        onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} />
      {show && (
        <span className="absolute z-50 bottom-5 right-0 w-56 text-xs bg-slate-800 text-white rounded-lg px-3 py-2 shadow-lg leading-relaxed">
          {text}
        </span>
      )}
    </span>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest col-span-2 pb-1 border-b border-slate-100">
      {children}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
type Tab = 'savings' | 'gemel' | 'pension';

export default function Savings() {
  const { savings, addSavings, updateSavings, deleteSavings,
          gemel, addGemel, updateGemel, deleteGemel,
          pension, updatePension } = useStore();

  const [tab, setTab] = useState<Tab>('savings');

  // ── Savings state ────────────────────────────────────────────────────────
  const SAVINGS_BLANK = { bank: BANKS[0], name: '', amount: '', interestRate: '', maturityDate: '', openDate: new Date().toISOString().slice(0, 10), link: '' };
  const [savingsAddModal, setSavingsAddModal] = useState(false);
  const [savingsEditItem, setSavingsEditItem] = useState<SavingsAccount | null>(null);
  const [savingsForm, setSavingsForm] = useState(SAVINGS_BLANK);

  // ── Gemel state ──────────────────────────────────────────────────────────
  const GEMEL_BLANK = { name: '', company: GEMEL_COMPANIES[0], balance: '', track: GEMEL_TRACKS[0], managementFee: '', annualReturn: '', depositFee: '', employeeContribution: '', employerContribution: '', salary: '' };
  const [gemelAddModal, setGemelAddModal] = useState(false);
  const [gemelEditId, setGemelEditId] = useState<string | null>(null);
  const [gemelForm, setGemelForm] = useState(GEMEL_BLANK);

  // ── Pension state ────────────────────────────────────────────────────────
  const pensionFund = pension[0];
  const [pensionSimAdd, setPensionSimAdd] = useState('');
  const [pensionEditModal, setPensionEditModal] = useState(false);
  const [pensionEditForm, setPensionEditForm] = useState({
    name: '', company: '', balance: '', track: '', salary: '',
    employeeContribution: '', employerContribution: '',
    compensationContribution: '', managementFee: '',
    expectedReturn: '', retirementAge: '', birthYear: '',
  });

  // ── Savings helpers ──────────────────────────────────────────────────────
  const openSavings = savings.filter((s) => s.open);
  const totalSavings = openSavings.reduce((a, s) => a + s.amount, 0);
  const avgRate = openSavings.length > 0 ? openSavings.reduce((a, s) => a + s.interestRate, 0) / openSavings.length : 0;

  function calcAccruedInterest(s: SavingsAccount) {
    const days = (Date.now() - new Date(s.openDate).getTime()) / (1000 * 86400);
    return s.amount * (s.interestRate / 100) * (days / 365);
  }
  function daysToMaturity(d: string) {
    return Math.round((new Date(d).getTime() - Date.now()) / (1000 * 86400));
  }
  function openSavingsEdit(s: SavingsAccount) {
    setSavingsEditItem(s);
    setSavingsForm({ bank: s.bank, name: s.name, amount: String(s.amount), interestRate: String(s.interestRate), maturityDate: s.maturityDate, openDate: s.openDate, link: s.link ?? '' });
  }
  function saveSavingsEdit() {
    if (!savingsEditItem) return;
    updateSavings(savingsEditItem.id, { bank: savingsForm.bank, name: savingsForm.name, amount: +savingsForm.amount, interestRate: +savingsForm.interestRate, maturityDate: savingsForm.maturityDate, openDate: savingsForm.openDate, link: savingsForm.link || undefined });
    setSavingsEditItem(null);
  }
  function addSavingsAccount() {
    addSavings({ bank: savingsForm.bank, name: savingsForm.name, amount: +savingsForm.amount, interestRate: +savingsForm.interestRate, maturityDate: savingsForm.maturityDate, openDate: savingsForm.openDate, open: true, link: savingsForm.link || undefined });
    setSavingsAddModal(false);
    setSavingsForm(SAVINGS_BLANK);
  }

  // ── Gemel helpers ────────────────────────────────────────────────────────
  const totalGemel = gemel.reduce((a, g) => a + g.balance, 0);
  const avgGemelReturn = gemel.length > 0 ? gemel.reduce((a, g) => a + g.annualReturn, 0) / gemel.length : 0;
  const gemelMonths = ['נוב', 'דצ', 'ינו', 'פב', 'מר', 'אפ', 'מא'];
  const gemelChartData = gemelMonths.map((m, i) => ({ month: m, יתרה: Math.round(totalGemel * (0.88 + i * 0.02)) }));

  function openGemelEdit(g: GemelFund) {
    setGemelEditId(g.id);
    setGemelForm({ name: g.name, company: g.company, balance: String(g.balance), track: g.track, managementFee: String(g.managementFee), annualReturn: String(g.annualReturn), depositFee: String(g.depositFee || 0), employeeContribution: String(g.employeeContribution || 0), employerContribution: String(g.employerContribution || 0), salary: String(g.salary || 0) });
  }
  function saveGemelEdit() {
    if (!gemelEditId) return;
    updateGemel(gemelEditId, { name: gemelForm.name, company: gemelForm.company, balance: +gemelForm.balance, track: gemelForm.track, managementFee: +gemelForm.managementFee, annualReturn: +gemelForm.annualReturn, depositFee: +gemelForm.depositFee, employeeContribution: +gemelForm.employeeContribution, employerContribution: +gemelForm.employerContribution, salary: +gemelForm.salary });
    setGemelEditId(null);
  }
  function addGemelFund() {
    addGemel({ name: gemelForm.name, company: gemelForm.company, balance: +gemelForm.balance, track: gemelForm.track, managementFee: +gemelForm.managementFee, annualReturn: +gemelForm.annualReturn, depositFee: +gemelForm.depositFee, employeeContribution: +gemelForm.employeeContribution, employerContribution: +gemelForm.employerContribution, salary: +gemelForm.salary });
    setGemelAddModal(false);
    setGemelForm(GEMEL_BLANK);
  }

  // ── Pension helpers ──────────────────────────────────────────────────────
  function openPensionEdit() {
    if (!pensionFund) return;
    setPensionEditForm({
      name: pensionFund.name, company: pensionFund.company, balance: String(pensionFund.balance),
      track: pensionFund.track, salary: String(pensionFund.salary ?? 0),
      employeeContribution: String(pensionFund.employeeContribution),
      employerContribution: String(pensionFund.employerContribution),
      compensationContribution: String(pensionFund.compensationContribution),
      managementFee: String(pensionFund.managementFee),
      expectedReturn: String(pensionFund.expectedReturn ?? 6),
      retirementAge: String(pensionFund.retirementAge),
      birthYear: String(pensionFund.birthYear),
    });
    setPensionEditModal(true);
  }
  function savePensionEdit() {
    if (!pensionFund) return;
    updatePension(pensionFund.id, {
      name: pensionEditForm.name, company: pensionEditForm.company, balance: +pensionEditForm.balance,
      track: pensionEditForm.track, salary: +pensionEditForm.salary,
      employeeContribution: +pensionEditForm.employeeContribution,
      employerContribution: +pensionEditForm.employerContribution,
      compensationContribution: +pensionEditForm.compensationContribution,
      managementFee: +pensionEditForm.managementFee,
      expectedReturn: +pensionEditForm.expectedReturn,
      retirementAge: +pensionEditForm.retirementAge,
      birthYear: +pensionEditForm.birthYear,
    });
    setPensionEditModal(false);
  }

  // Pension calculations
  const pf = pensionFund;
  const currentYear = new Date().getFullYear();
  const age = pf ? currentYear - pf.birthYear : 0;
  const yearsLeft = pf ? Math.max(0, pf.retirementAge - age) : 0;
  const salary = pf?.salary ?? 0;
  const monthlyEmployee = pf ? salary * (pf.employeeContribution / 100) : 0;
  const monthlyEmployer = pf ? salary * (pf.employerContribution / 100) : 0;
  const monthlyCompensation = pf ? salary * (pf.compensationContribution / 100) : 0;
  const monthlyTotal = monthlyEmployee + monthlyEmployer + monthlyCompensation;
  const netRate = pf ? Math.max(0, (pf.expectedReturn ?? 6) - (pf.managementFee ?? 0)) / 100 : 0;
  const { finalBalance: pensionFinal, data: pensionChartData } = pf
    ? projectPension(pf.balance, monthlyTotal, yearsLeft, netRate)
    : { finalBalance: 0, data: [] };
  const monthlyPension = pensionFinal / (25 * 12);
  const simExtra = +pensionSimAdd || 0;
  const { finalBalance: simBalance } = pf
    ? projectPension(pf.balance, monthlyTotal + simExtra, yearsLeft, netRate)
    : { finalBalance: 0 };
  const simMonthlyPension = simBalance / (25 * 12);

  // ── Top-level KPIs ───────────────────────────────────────────────────────
  const totalAll = totalSavings + totalGemel + (pf?.balance ?? 0);

  // ── Tab button ───────────────────────────────────────────────────────────
  const tabs: { id: Tab; label: string; count?: string }[] = [
    { id: 'savings', label: 'פיקדונות', count: fmtCurrency(totalSavings) },
    { id: 'gemel',   label: 'קופות גמל', count: fmtCurrency(totalGemel) },
    { id: 'pension', label: 'פנסיה',     count: pf ? fmtCurrency(pf.balance) : undefined },
  ];

  // ── Shared form fields helper ─────────────────────────────────────────────
  function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
    return (
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-0.5">{label}</label>
        {note && <p className="text-xs text-slate-400 mb-1">{note}</p>}
        {children}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">חסכונות ארוך טווח</h1>
        <p className="text-slate-500 text-sm">סה"כ צבירה: <strong>{fmtCurrency(totalAll)}</strong></p>
      </div>

      {/* Summary KPI row */}
      <div className="grid grid-cols-3 gap-4">
        <Card className={`cursor-pointer transition-all ${tab === 'savings' ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`} onClick={() => setTab('savings')}>
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">פיקדונות</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{fmtCurrency(totalSavings)}</div>
          <div className="text-xs text-slate-400">{openSavings.length} פעילים • {fmt(avgRate, 1)}% ריבית ממוצעת</div>
        </Card>
        <Card className={`cursor-pointer transition-all ${tab === 'gemel' ? 'ring-2 ring-purple-400 ring-offset-1' : ''}`} onClick={() => setTab('gemel')}>
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">קופות גמל</div>
          <div className="text-2xl font-bold text-purple-600 mt-1">{fmtCurrency(totalGemel)}</div>
          <div className="text-xs text-slate-400">{gemel.length} קרנות • {fmt(avgGemelReturn, 1)}% תשואה ממוצעת</div>
        </Card>
        <Card className={`cursor-pointer transition-all ${tab === 'pension' ? 'ring-2 ring-green-400 ring-offset-1' : ''}`} onClick={() => setTab('pension')}>
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">פנסיה</div>
          <div className="text-2xl font-bold text-green-600 mt-1">{pf ? fmtCurrency(pf.balance) : '—'}</div>
          <div className="text-xs text-slate-400">{pf ? `${yearsLeft} שנים לפרישה` : 'לא הוגדר'}</div>
        </Card>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-slate-200 gap-1">
        {tabs.map(({ id, label, count }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
            {count && <span className="mr-1.5 text-xs opacity-60">{count}</span>}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          TAB: פיקדונות
      ══════════════════════════════════════════════════════════════════ */}
      {tab === 'savings' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-500">{fmtCurrency(openSavings.reduce((a, s) => a + calcAccruedInterest(s), 0))} ריבית שנצברה</p>
            <button onClick={() => setSavingsAddModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-xl text-sm text-white hover:bg-blue-700">
              <Plus size={16} /> הוסף פיקדון
            </button>
          </div>

          {savings.map((s) => {
            const dtm = daysToMaturity(s.maturityDate);
            const accrued = calcAccruedInterest(s);
            return (
              <Card key={s.id}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-slate-900">{s.name}</h3>
                      {dtm <= 30 && dtm > 0 && <Badge variant="amber"><AlertCircle size={10} className="ml-1" />פג בעוד {dtm} ימים</Badge>}
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
                  <div><div className="text-slate-400">תאריך פתיחה</div><div className="font-medium text-slate-700">{fmtDate(s.openDate)}</div></div>
                  <div><div className="text-slate-400">תאריך פירעון</div><div className="font-medium text-slate-700">{fmtDate(s.maturityDate)}</div></div>
                  <div><div className="text-slate-400">ריבית שנצברה</div><div className="font-medium text-green-600">{fmtCurrency(accrued)}</div></div>
                  <div className="flex gap-2 flex-wrap items-center">
                    {s.link && (
                      <a href={s.link} target="_blank" rel="noopener noreferrer"
                        className="text-xs px-3 py-1.5 border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 flex items-center gap-1">
                        <ExternalLink size={11} /> פירוט
                      </a>
                    )}
                    <button onClick={() => openSavingsEdit(s)} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1">
                      <Pencil size={11} /> ערוך
                    </button>
                    <button onClick={() => updateSavings(s.id, { open: !s.open })} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50">
                      {s.open ? 'סגור' : 'פתח'}
                    </button>
                    <button onClick={() => deleteSavings(s.id)} className="text-xs px-3 py-1.5 border border-red-100 text-red-500 rounded-lg hover:bg-red-50">מחק</button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: קופות גמל
      ══════════════════════════════════════════════════════════════════ */}
      {tab === 'gemel' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-500">דמי ניהול ממוצעים: {fmt(gemel.length > 0 ? gemel.reduce((a, g) => a + g.managementFee, 0) / gemel.length : 0, 2)}%</p>
            <button onClick={() => setGemelAddModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-xl text-sm text-white hover:bg-blue-700">
              <Plus size={16} /> הוסף קרן
            </button>
          </div>

          {totalGemel > 0 && (
            <Card>
              <h2 className="font-semibold text-slate-900 mb-4">יתרה לאורך זמן</h2>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={gemelChartData}>
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: unknown) => fmtCurrency(v as number)} />
                  <Area type="monotone" dataKey="יתרה" stroke="#8b5cf6" fill="#8b5cf620" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          )}

          {gemel.map((g) => (
            <Card key={g.id}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">{g.name}</h3>
                  <div className="text-sm text-slate-500">{g.company} • {g.track}</div>
                </div>
                <div className="flex items-center gap-3">
                  {COMPANY_LINKS[g.company] && (
                    <a href={COMPANY_LINKS[g.company]} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">
                      <ExternalLink size={16} />
                    </a>
                  )}
                  <div className="text-xl font-bold text-slate-900">{fmtCurrency(g.balance)}</div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-100 text-sm">
                <div><div className="text-slate-400">דמי ניהול</div><div className="font-medium">{fmt(g.managementFee, 2)}%</div></div>
                <div><div className="text-slate-400">תשואה שנתית</div><div className={`font-medium ${g.annualReturn >= 0 ? 'text-green-600' : 'text-red-500'}`}>{g.annualReturn >= 0 ? '+' : ''}{fmt(g.annualReturn, 1)}%</div></div>
                <div><div className="text-slate-400">תשואה מצטברת</div><div className={`font-medium ${g.annualReturn >= 0 ? 'text-green-600' : 'text-red-500'}`}>{g.annualReturn >= 0 ? '+' : ''}{fmt(g.annualReturn, 1)}%</div></div>
                <div className="flex gap-2 items-end">
                  <button onClick={() => openGemelEdit(g)} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1">
                    <Pencil size={11} /> ערוך
                  </button>
                  <button onClick={() => deleteGemel(g.id)} className="text-xs px-3 py-1.5 border border-red-100 text-red-500 rounded-lg hover:bg-red-50">מחק</button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: פנסיה
      ══════════════════════════════════════════════════════════════════ */}
      {tab === 'pension' && (
        <div className="space-y-5 animate-fade-in">
          {!pf ? (
            <div className="text-slate-500 text-center py-16">אין נתוני פנסיה</div>
          ) : (
            <>
              <div className="flex justify-end">
                <button onClick={openPensionEdit} className="flex items-center gap-1.5 text-sm px-4 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600">
                  <Pencil size={14} /> ערוך הגדרות
                </button>
              </div>

              <div className="text-sm text-slate-500">{pf.name} • {pf.company} • {pf.track}</div>

              {/* KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card><div className="text-sm text-slate-500">יתרה נוכחית</div><div className="text-2xl font-bold text-slate-900">{fmtCurrency(pf.balance)}</div><div className="text-xs text-slate-400">צבירה עד היום</div></Card>
                <Card><div className="text-sm text-slate-500">הפרשה חודשית</div><div className="text-2xl font-bold text-blue-600">{fmtCurrency(monthlyTotal)}</div><div className="text-xs text-slate-400">עובד + מעביד + פיצויים</div></Card>
                <Card><div className="text-sm text-slate-500">גיל / פרישה</div><div className="text-2xl font-bold text-slate-900">{age} / {pf.retirementAge}</div><div className="text-xs text-slate-400">{yearsLeft} שנים לפרישה</div></Card>
                <Card><div className="text-sm text-slate-500">קצבה חזויה</div><div className="text-2xl font-bold text-green-600">{fmtCurrency(monthlyPension)}/חודש</div><div className="text-xs text-slate-400">בתום {yearsLeft} שנים</div></Card>
              </div>

              {/* Chart */}
              <Card>
                <h2 className="font-semibold text-slate-900 mb-1">צבירה צפויה עד פרישה</h2>
                <p className="text-xs text-slate-400 mb-4">
                  תשואה {pf.expectedReturn ?? 6}% בניכוי דמי ניהול {pf.managementFee}% = תשואה נטו {fmt(netRate * 100, 2)}%
                </p>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={pensionChartData}>
                    <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: unknown) => fmtCurrency(v as number)} />
                    <Area type="monotone" dataKey="יתרה" stroke="#8b5cf6" fill="#8b5cf620" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>

              <div className="grid grid-cols-2 gap-6">
                {/* Contribution breakdown */}
                <Card>
                  <h2 className="font-semibold text-slate-900 mb-4">פירוט הפרשות חודשיות</h2>
                  {salary === 0 && (
                    <div className="mb-3 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      הגדר משכורת ברוטו כדי לראות סכומים בשקלים
                    </div>
                  )}
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between pb-2 border-b border-slate-100">
                      <span className="text-slate-500 flex items-center gap-1">משכורת ברוטו<Tip text="המשכורת שממנה מחושבים אחוזי ההפרשות" /></span>
                      <span className="font-semibold text-slate-900">{fmtCurrency(salary)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 flex items-center gap-1">הפרשת עובד<Tip text="האחוז שאתה מפריש ממשכורתך. מנוכה מהשכר נטו." /></span>
                      <span className="font-medium text-slate-900">{pf.employeeContribution}%{salary > 0 && <span className="text-blue-600 mr-2"> = {fmtCurrency(monthlyEmployee)}</span>}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 flex items-center gap-1">הפרשת מעביד<Tip text="האחוז שהמעסיק מוסיף עבורך." /></span>
                      <span className="font-medium text-slate-900">{pf.employerContribution}%{salary > 0 && <span className="text-green-600 mr-2"> = {fmtCurrency(monthlyEmployer)}</span>}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 flex items-center gap-1">פיצויים<Tip text="הפרשת פיצויים של המעסיק (בד״כ 8.33%)." /></span>
                      <span className="font-medium text-slate-900">{pf.compensationContribution}%{salary > 0 && <span className="text-purple-600 mr-2"> = {fmtCurrency(monthlyCompensation)}</span>}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-200 font-semibold">
                      <span className="text-slate-700">סה"כ חודשי</span>
                      <span>{fmtCurrency(monthlyTotal)}</span>
                    </div>
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      <div className="flex justify-between"><span className="text-slate-500 flex items-center gap-1">תשואה משוערת<Tip text="ממוצע היסטורי: 5-8%." /></span><span className="font-medium">{pf.expectedReturn ?? 6}%</span></div>
                      <div className="flex justify-between"><span className="text-slate-500 flex items-center gap-1">דמי ניהול<Tip text="עלות שנתית. ככל שנמוך יותר — עדיף." /></span><span className="font-medium text-red-500">-{pf.managementFee}%</span></div>
                      <div className="flex justify-between font-semibold"><span className="text-slate-700">תשואה נטו</span><span className="text-green-600">{fmt(netRate * 100, 2)}%</span></div>
                    </div>
                  </div>
                </Card>

                {/* Simulator */}
                <Card>
                  <h2 className="font-semibold text-slate-900 mb-4">סימולטור — מה אם אגדיל הפרשה?</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">תוספת חודשית (₪)</label>
                      <input type="number" value={pensionSimAdd} onChange={(e) => setPensionSimAdd(e.target.value)}
                        placeholder="לדוגמה: 500" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                      <p className="text-xs text-slate-400 mt-1">הגדלה על ידי הפרשה עצמאית נוספת</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
                      <p className="text-xs font-medium text-slate-500 mb-2">בסיס (ללא שינוי)</p>
                      <div className="flex justify-between"><span className="text-slate-600">יתרה בפרישה</span><span className="font-bold text-slate-900">{fmtCurrency(pensionFinal)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-600">קצבה חודשית</span><span className="font-bold text-slate-900">{fmtCurrency(monthlyPension)}</span></div>
                    </div>
                    {simExtra > 0 && (
                      <div className="bg-green-50 rounded-xl p-4 space-y-2 text-sm border border-green-100">
                        <p className="text-xs font-medium text-green-700 mb-2">עם תוספת {fmtCurrency(simExtra)}/חודש</p>
                        <div className="flex justify-between"><span className="text-slate-600">יתרה בפרישה</span><span className="font-bold text-green-700">{fmtCurrency(simBalance)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-600">קצבה חודשית</span><span className="font-bold text-green-700">{fmtCurrency(simMonthlyPension)}</span></div>
                        <div className="flex justify-between border-t border-green-200 pt-2"><span className="text-slate-600">שיפור בצבירה</span><span className="font-bold text-blue-600">+{fmtCurrency(simBalance - pensionFinal)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-600">שיפור בקצבה</span><span className="font-bold text-blue-600">+{fmtCurrency(simMonthlyPension - monthlyPension)}/חודש</span></div>
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODALS — Savings
      ══════════════════════════════════════════════════════════════════ */}
      <Modal open={savingsAddModal} onClose={() => setSavingsAddModal(false)} title="הוסף פיקדון">
        <SavingsForm form={savingsForm} setForm={setSavingsForm} banks={BANKS} />
        <button onClick={addSavingsAccount} disabled={!savingsForm.amount || !savingsForm.maturityDate}
          className="w-full mt-4 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
          הוסף פיקדון
        </button>
      </Modal>

      <Modal open={!!savingsEditItem} onClose={() => setSavingsEditItem(null)} title={`ערוך — ${savingsEditItem?.name ?? ''}`}>
        <SavingsForm form={savingsForm} setForm={setSavingsForm} banks={BANKS} />
        <button onClick={saveSavingsEdit}
          className="w-full mt-4 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700">
          שמור שינויים
        </button>
      </Modal>

      {/* MODALS — Gemel */}
      <Modal open={gemelAddModal} onClose={() => setGemelAddModal(false)} title="הוסף קופת גמל">
        <GemelForm form={gemelForm} setForm={setGemelForm} companies={GEMEL_COMPANIES} tracks={GEMEL_TRACKS} />
        <button onClick={addGemelFund} disabled={!gemelForm.name || !gemelForm.balance}
          className="w-full mt-4 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
          הוסף קרן
        </button>
      </Modal>

      <Modal open={!!gemelEditId} onClose={() => setGemelEditId(null)} title="ערוך קופת גמל">
        <GemelForm form={gemelForm} setForm={setGemelForm} companies={GEMEL_COMPANIES} tracks={GEMEL_TRACKS} />
        <button onClick={saveGemelEdit}
          className="w-full mt-4 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700">
          שמור שינויים
        </button>
      </Modal>

      {/* MODAL — Pension edit */}
      <Modal open={pensionEditModal} onClose={() => setPensionEditModal(false)} title="ערוך הגדרות פנסיה">
        <div className="grid grid-cols-2 gap-4">
          <SectionLabel>פרטי הקרן</SectionLabel>
          {([{ key: 'name', label: 'שם הקרן' }, { key: 'company', label: 'חברה מנהלת' }, { key: 'balance', label: 'יתרה נוכחית (₪)', type: 'number', note: 'הסכום שצבור בקרן כרגע' }] as {key:string;label:string;type?:string;note?:string}[]).map(({ key, label, type = 'text', note }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-slate-700 mb-0.5">{label}</label>
              {note && <p className="text-xs text-slate-400 mb-1">{note}</p>}
              <input type={type} value={(pensionEditForm as Record<string, string>)[key]}
                onChange={(e) => setPensionEditForm({ ...pensionEditForm, [key]: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-0.5">מסלול השקעה</label>
            <select value={pensionEditForm.track} onChange={(e) => setPensionEditForm({ ...pensionEditForm, track: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              {PENSION_TRACKS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <SectionLabel>משכורת והפרשות</SectionLabel>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-0.5">משכורת ברוטו (₪)</label>
            <p className="text-xs text-slate-400 mb-1">המשכורת ממנה מחושבים אחוזי ההפרשות</p>
            <input type="number" value={pensionEditForm.salary} onChange={(e) => setPensionEditForm({ ...pensionEditForm, salary: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          {([{ key: 'employeeContribution', label: 'הפרשת עובד (%)', note: 'בד״כ 6%' }, { key: 'employerContribution', label: 'הפרשת מעביד (%)', note: 'בד״כ 6.5%' }, { key: 'compensationContribution', label: 'פיצויים (%)', note: 'בד״כ 8.33%' }] as {key:string;label:string;note:string}[]).map(({ key, label, note }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-slate-700 mb-0.5">{label}</label>
              <p className="text-xs text-slate-400 mb-1">{note}</p>
              <input type="number" value={(pensionEditForm as Record<string, string>)[key]}
                onChange={(e) => setPensionEditForm({ ...pensionEditForm, [key]: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          ))}

          <SectionLabel>תשואה ועלויות</SectionLabel>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-0.5">תשואה שנתית משוערת (%)</label>
            <p className="text-xs text-slate-400 mb-1">ממוצע: 5-8%. ברירת מחדל: 6%</p>
            <input type="number" step="0.1" value={pensionEditForm.expectedReturn}
              onChange={(e) => setPensionEditForm({ ...pensionEditForm, expectedReturn: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-0.5">דמי ניהול (%)</label>
            <p className="text-xs text-slate-400 mb-1">מנוכה מהתשואה השנתית</p>
            <input type="number" step="0.01" value={pensionEditForm.managementFee}
              onChange={(e) => setPensionEditForm({ ...pensionEditForm, managementFee: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>

          <SectionLabel>גיל פרישה</SectionLabel>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-0.5">שנת לידה</label>
            <input type="number" value={pensionEditForm.birthYear}
              onChange={(e) => setPensionEditForm({ ...pensionEditForm, birthYear: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-0.5">גיל פרישה</label>
            <p className="text-xs text-slate-400 mb-1">גברים: 67, נשים: 62</p>
            <input type="number" value={pensionEditForm.retirementAge}
              onChange={(e) => setPensionEditForm({ ...pensionEditForm, retirementAge: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <button onClick={savePensionEdit}
          className="w-full mt-5 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700">
          שמור שינויים
        </button>
      </Modal>
    </div>
  );
}

// ── Sub-forms (extracted to avoid re-renders) ─────────────────────────────────
function SavingsForm({ form, setForm, banks }: { form: any; setForm: (f: any) => void; banks: string[] }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">בנק</label>
        <select value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
          {banks.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>
      {([{ key: 'name', label: 'שם הפיקדון' }, { key: 'amount', label: 'סכום (₪)', type: 'number' }, { key: 'interestRate', label: 'ריבית שנתית (%)', type: 'number' }, { key: 'openDate', label: 'תאריך פתיחה', type: 'date' }, { key: 'maturityDate', label: 'תאריך פירעון', type: 'date' }] as {key:string;label:string;type?:string}[]).map(({ key, label, type = 'text' }) => (
        <div key={key}>
          <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
          <input type={type} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
      ))}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">קישור לפירוט חיצוני</label>
        <input type="url" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })}
          placeholder="https://..."
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" dir="ltr" />
      </div>
    </div>
  );
}

function GemelForm({ form, setForm, companies, tracks }: { form: any; setForm: (f: any) => void; companies: string[]; tracks: string[] }) {
  return (
    <div className="space-y-4">
      {([{ key: 'name', label: 'שם הקרן' }, { key: 'balance', label: 'יתרה נוכחית (₪)', type: 'number' }, { key: 'managementFee', label: 'דמי ניהול (%)', type: 'number' }, { key: 'annualReturn', label: 'תשואה שנתית (%)', type: 'number' }] as {key:string;label:string;type?:string}[]).map(({ key, label, type = 'text' }) => (
      <div key={key}>
        <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
        <input type={type} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
      </div>
    ))}
      {[{ key: 'company', label: 'חברה מנהלת', opts: companies }, { key: 'track', label: 'מסלול', opts: tracks }].map(({ key, label, opts }) => (
        <div key={key}>
          <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
          <select value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            {opts.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}
