import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import Card from '../components/common/Card';
import { fmtCurrency, fmt } from '../utils/format';

type Tab = 'mortgage' | 'savings' | 'investment';

function MortgageSim() {
  const [balance, setBalance] = useState('800000');
  const [rate, setRate] = useState('4.5');
  const [extra, setExtra] = useState('');
  const [years, setYears] = useState('25');

  const bal = +balance;
  const r = +rate / 100 / 12;
  const n = +years * 12;
  const monthlyBase = r > 0 ? (bal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : bal / n;
  const extraAmt = +extra || 0;

  function calcPayoff(monthly: number) {
    let b = bal;
    let months = 0;
    let totalInterest = 0;
    while (b > 0 && months < n) {
      const interest = b * r;
      totalInterest += interest;
      b = b - (monthly - interest);
      months++;
      if (b < 0) b = 0;
    }
    return { months, totalInterest };
  }

  const base = calcPayoff(monthlyBase);
  const withExtra = calcPayoff(monthlyBase + extraAmt);
  const savedMonths = base.months - withExtra.months;
  const savedInterest = base.totalInterest - withExtra.totalInterest;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'יתרת משכנתא (₪)', key: balance, setter: setBalance },
          { label: 'ריבית שנתית (%)', key: rate, setter: setRate },
          { label: 'שנות החזר', key: years, setter: setYears },
          { label: 'תוספת חודשית (₪)', key: extra, setter: setExtra },
        ].map(({ label, key, setter }) => (
          <div key={label}>
            <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
            <input type="number" value={key} onChange={(e) => setter(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-slate-50">
          <div className="text-sm font-medium text-slate-600 mb-3">ללא תוספת</div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">תשלום חודשי</span><span className="font-bold text-slate-900">{fmtCurrency(monthlyBase)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">סיום</span><span className="font-bold">{Math.round(base.months / 12)} שנים</span></div>
            <div className="flex justify-between"><span className="text-slate-500">סה"כ ריבית</span><span className="font-bold text-red-500">{fmtCurrency(base.totalInterest)}</span></div>
          </div>
        </Card>
        {extraAmt > 0 && (
          <Card className="bg-green-50 border-green-200">
            <div className="text-sm font-medium text-green-700 mb-3">עם תוספת של {fmtCurrency(extraAmt)}/חודש</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">סיום</span><span className="font-bold text-green-700">{Math.round(withExtra.months / 12)} שנים</span></div>
              <div className="flex justify-between"><span className="text-slate-500">קיצור</span><span className="font-bold text-green-700">{Math.round(savedMonths / 12)} שנים</span></div>
              <div className="flex justify-between"><span className="text-slate-500">חיסכון בריבית</span><span className="font-bold text-green-700">{fmtCurrency(savedInterest)}</span></div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function SavingsSim() {
  const [target, setTarget] = useState('100000');
  const [monthly, setMonthly] = useState('2000');
  const [rate, setRate] = useState('4');

  const t = +target;
  const m = +monthly;
  const r = +rate / 100 / 12;

  const months = r > 0
    ? Math.log(1 + (t * r) / m) / Math.log(1 + r)
    : t / m;
  const years = months / 12;
  const totalDeposited = m * months;
  const interest = t - totalDeposited;

  const date = new Date();
  date.setMonth(date.getMonth() + Math.round(months));

  const chartData = Array.from({ length: Math.min(Math.ceil(years), 30) }, (_, y) => {
    const n = (y + 1) * 12;
    const val = r > 0 ? m * ((Math.pow(1 + r, n) - 1) / r) : m * n;
    return { year: `שנה ${y + 1}`, חיסכון: Math.round(val), יעד: t };
  });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'יעד חיסכון (₪)', val: target, set: setTarget },
          { label: 'חיסכון חודשי (₪)', val: monthly, set: setMonthly },
          { label: 'תשואה שנתית (%)', val: rate, set: setRate },
        ].map(({ label, val, set }) => (
          <div key={label}>
            <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
            <input type="number" value={val} onChange={(e) => set(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="text-sm text-slate-500">זמן להגיע ליעד</div>
          <div className="text-2xl font-bold text-blue-600">{fmt(years, 1)} שנים</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">תאריך צפוי</div>
          <div className="text-xl font-bold text-slate-900">{date.toLocaleDateString('he-IL', { year: 'numeric', month: 'short' })}</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">סה"כ הפקדות</div>
          <div className="text-xl font-bold text-slate-900">{fmtCurrency(totalDeposited)}</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">רווח ריבית</div>
          <div className="text-xl font-bold text-green-600">{fmtCurrency(Math.max(0, interest))}</div>
        </Card>
      </div>

      {chartData.length > 0 && (
        <Card>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: unknown) => fmtCurrency(v as number)} />
              <Line type="monotone" dataKey="חיסכון" stroke="#22c55e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="יעד" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}

function InvestmentSim() {
  const [monthly, setMonthly] = useState('3000');
  const [rate, setRate] = useState('8');
  const [years, setYears] = useState('20');

  const m = +monthly;
  const r = +rate / 100 / 12;
  const n = +years * 12;
  const finalValue = r > 0 ? m * ((Math.pow(1 + r, n) - 1) / r) : m * n;
  const totalDeposited = m * n;
  const totalInterest = finalValue - totalDeposited;

  const chartData = Array.from({ length: +years }, (_, y) => {
    const mn = (y + 1) * 12;
    const val = r > 0 ? m * ((Math.pow(1 + r, mn) - 1) / r) : m * mn;
    const dep = m * mn;
    return { year: `שנה ${y + 1}`, 'שווי תיק': Math.round(val), 'הפקדות': dep };
  });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'השקעה חודשית (₪)', val: monthly, set: setMonthly },
          { label: 'תשואה שנתית (%)', val: rate, set: setRate },
          { label: 'שנים', val: years, set: setYears },
        ].map(({ label, val, set }) => (
          <div key={label}>
            <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
            <input type="number" value={val} onChange={(e) => set(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="text-sm text-slate-500">שווי עתידי</div>
          <div className="text-2xl font-bold text-blue-600">{fmtCurrency(finalValue)}</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">סה"כ הפקדות</div>
          <div className="text-2xl font-bold text-slate-900">{fmtCurrency(totalDeposited)}</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">רווח ריבית-דריבית</div>
          <div className="text-2xl font-bold text-green-600">{fmtCurrency(totalInterest)}</div>
        </Card>
      </div>

      <Card>
        <h2 className="font-semibold text-slate-900 mb-4">צמיחת ההשקעה לאורך זמן</h2>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} interval={Math.floor(+years / 5)} />
            <YAxis tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: unknown) => fmtCurrency(v as number)} />
            <Line type="monotone" dataKey="שווי תיק" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="הפקדות" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

export default function Simulator() {
  const [tab, setTab] = useState<Tab>('investment');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'investment', label: 'השקעה לאורך זמן' },
    { key: 'savings', label: 'יעד חיסכון' },
    { key: 'mortgage', label: 'משכנתא' },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">סימולטור מה אם</h1>
        <p className="text-slate-500 text-sm">חישובים פיננסיים לתכנון העתיד</p>
      </div>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'mortgage' && <MortgageSim />}
      {tab === 'savings' && <SavingsSim />}
      {tab === 'investment' && <InvestmentSim />}
    </div>
  );
}
