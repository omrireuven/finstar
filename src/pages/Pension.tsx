import { useState } from 'react';
import { Pencil, Info } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useStore } from '../store';
import Card from '../components/common/Card';
import Modal from '../components/common/Modal';
import { fmtCurrency, fmt } from '../utils/format';

// ── Projection engine ─────────────────────────────────────────────────────────
/**
 * Projects pension balance over `yearsLeft` years.
 * Includes employee + employer + compensation contributions.
 * `rate` = net annual return after management fee (0.06 = 6%).
 */
function projectPension(
  balance: number,
  monthlyTotal: number,
  yearsLeft: number,
  rate: number,
) {
  const monthlyRate = rate / 12;
  let b = balance;
  const data = [{ year: 'היום', יתרה: Math.round(b) }];
  for (let y = 1; y <= yearsLeft; y++) {
    for (let m = 0; m < 12; m++) {
      b = b * (1 + monthlyRate) + monthlyTotal;
    }
    if (y % 5 === 0 || y === yearsLeft) {
      data.push({ year: `+${y}`, יתרה: Math.round(b) });
    }
  }
  return { finalBalance: b, data };
}

const PENSION_TRACKS = [
  'מסלול כללי', 'מסלול אג"ח', 'מסלול מניות',
  'מסלול הלכתי', 'מסלול סולידי', 'מסלול מניות חו"ל',
];

// ── Tooltip helper ────────────────────────────────────────────────────────────
function Tip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-block">
      <Info
        size={13}
        className="text-slate-400 hover:text-blue-500 cursor-help"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      />
      {show && (
        <span className="absolute z-50 bottom-5 right-0 w-56 text-xs bg-slate-800 text-white rounded-lg px-3 py-2 shadow-lg leading-relaxed">
          {text}
        </span>
      )}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Pension() {
  const { pension, updatePension } = useStore();
  const fund = pension[0];

  const [simMonthlyAdd, setSimMonthlyAdd] = useState('');
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '', company: '', balance: '', track: '', salary: '',
    employeeContribution: '', employerContribution: '',
    compensationContribution: '', managementFee: '',
    expectedReturn: '', retirementAge: '', birthYear: '',
  });

  function openEdit() {
    if (!fund) return;
    setEditForm({
      name: fund.name, company: fund.company, balance: String(fund.balance),
      track: fund.track, salary: String(fund.salary ?? 0),
      employeeContribution: String(fund.employeeContribution),
      employerContribution: String(fund.employerContribution),
      compensationContribution: String(fund.compensationContribution),
      managementFee: String(fund.managementFee),
      expectedReturn: String(fund.expectedReturn ?? 6),
      retirementAge: String(fund.retirementAge), birthYear: String(fund.birthYear),
    });
    setEditModal(true);
  }

  function saveEdit() {
    updatePension(fund.id, {
      name: editForm.name, company: editForm.company, balance: +editForm.balance,
      track: editForm.track, salary: +editForm.salary,
      employeeContribution: +editForm.employeeContribution,
      employerContribution: +editForm.employerContribution,
      compensationContribution: +editForm.compensationContribution,
      managementFee: +editForm.managementFee,
      expectedReturn: +editForm.expectedReturn,
      retirementAge: +editForm.retirementAge, birthYear: +editForm.birthYear,
    });
    setEditModal(false);
  }

  if (!fund) return <div className="text-slate-500 p-8 text-center">אין נתוני פנסיה</div>;

  // ── Calculations ─────────────────────────────────────────────────────────────
  const currentYear = new Date().getFullYear();
  const age = currentYear - fund.birthYear;
  const yearsLeft = Math.max(0, fund.retirementAge - age);

  const salary = fund.salary ?? 0;
  const monthlyEmployee = salary * (fund.employeeContribution / 100);
  const monthlyEmployer = salary * (fund.employerContribution / 100);
  const monthlyCompensation = salary * (fund.compensationContribution / 100);
  const monthlyTotal = monthlyEmployee + monthlyEmployer + monthlyCompensation;

  // Net rate = expected return - management fee
  const netRate = Math.max(0, (fund.expectedReturn ?? 6) - (fund.managementFee ?? 0)) / 100;

  const { finalBalance, data: chartData } = projectPension(fund.balance, monthlyTotal, yearsLeft, netRate);
  const monthlyPension = finalBalance / (25 * 12); // 25-year payout assumption

  // Simulator
  const simExtra = +simMonthlyAdd || 0;
  const { finalBalance: simBalance } = projectPension(fund.balance, monthlyTotal + simExtra, yearsLeft, netRate);
  const simMonthlyPension = simBalance / (25 * 12);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">פנסיה</h1>
          <p className="text-slate-500 text-sm">{fund.name} • {fund.company} • {fund.track}</p>
        </div>
        <button
          onClick={openEdit}
          className="flex items-center gap-1.5 text-sm px-4 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600"
        >
          <Pencil size={14} /> ערוך הגדרות
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="text-sm text-slate-500">יתרה נוכחית</div>
          <div className="text-2xl font-bold text-slate-900">{fmtCurrency(fund.balance)}</div>
          <div className="text-xs text-slate-400">צבירה עד היום</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">הפרשה חודשית</div>
          <div className="text-2xl font-bold text-blue-600">{fmtCurrency(monthlyTotal)}</div>
          <div className="text-xs text-slate-400">עובד + מעביד + פיצויים</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">גיל / פרישה</div>
          <div className="text-2xl font-bold text-slate-900">{age} / {fund.retirementAge}</div>
          <div className="text-xs text-slate-400">{yearsLeft} שנים לפרישה</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">קצבה חזויה</div>
          <div className="text-2xl font-bold text-green-600">{fmtCurrency(monthlyPension)}/חודש</div>
          <div className="text-xs text-slate-400">בתום {yearsLeft} שנים</div>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <h2 className="font-semibold text-slate-900 mb-1">צבירה צפויה עד פרישה</h2>
        <p className="text-xs text-slate-400 mb-4">
          מבוסס על תשואה שנתית {fund.expectedReturn ?? 6}% בניכוי דמי ניהול {fund.managementFee}% = תשואה נטו {fmt(netRate * 100, 2)}%
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData}>
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
            {/* Salary basis */}
            <div className="flex justify-between pb-2 border-b border-slate-100">
              <span className="text-slate-500 flex items-center gap-1">
                משכורת ברוטו (בסיס)
                <Tip text="זוהי המשכורת שממנה מחושבים אחוזי ההפרשות שלך" />
              </span>
              <span className="font-semibold text-slate-900">{fmtCurrency(salary)}</span>
            </div>
            {/* Employee */}
            <div className="flex justify-between">
              <span className="text-slate-500 flex items-center gap-1">
                הפרשת עובד
                <Tip text="האחוז שאתה מפריש ממשכורתך לפנסיה. מנוכה מהשכר נטו שלך." />
              </span>
              <span className="font-medium text-slate-900">
                {fund.employeeContribution}%
                {salary > 0 && <span className="text-blue-600 mr-2">= {fmtCurrency(monthlyEmployee)}/חודש</span>}
              </span>
            </div>
            {/* Employer */}
            <div className="flex justify-between">
              <span className="text-slate-500 flex items-center gap-1">
                הפרשת מעביד
                <Tip text="האחוז שהמעסיק מוסיף עבורך מעבר למשכורת. לא מנוכה ממשכורתך." />
              </span>
              <span className="font-medium text-slate-900">
                {fund.employerContribution}%
                {salary > 0 && <span className="text-green-600 mr-2">= {fmtCurrency(monthlyEmployer)}/חודש</span>}
              </span>
            </div>
            {/* Compensation */}
            <div className="flex justify-between">
              <span className="text-slate-500 flex items-center gap-1">
                פיצויים
                <Tip text="הפרשת פיצויים של המעסיק (בדרך כלל 8.33%). מאפשרת פדיון בפרישה או עזיבה." />
              </span>
              <span className="font-medium text-slate-900">
                {fund.compensationContribution}%
                {salary > 0 && <span className="text-purple-600 mr-2">= {fmtCurrency(monthlyCompensation)}/חודש</span>}
              </span>
            </div>
            {/* Total */}
            <div className="flex justify-between pt-2 border-t border-slate-200 font-semibold">
              <span className="text-slate-700">סה"כ חודשי לצבירה</span>
              <span className="text-slate-900">{fmtCurrency(monthlyTotal)}</span>
            </div>
            {/* Return & fees */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500 flex items-center gap-1">
                  תשואה שנתית משוערת
                  <Tip text="הריבית השנתית הצפויה על הכסף בקרן (לפני דמי ניהול). תשואה ממוצעת היסטורית של קרנות כלליות היא 5-8%." />
                </span>
                <span className="font-medium text-slate-900">{fund.expectedReturn ?? 6}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 flex items-center gap-1">
                  דמי ניהול
                  <Tip text="עלות שנתית שגובה חברת הביטוח מהצבירה. ככל שנמוך יותר — עדיף." />
                </span>
                <span className="font-medium text-red-500">-{fund.managementFee}%</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span className="text-slate-700">תשואה נטו</span>
                <span className="text-green-600">{fmt(netRate * 100, 2)}%</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Simulator */}
        <Card>
          <h2 className="font-semibold text-slate-900 mb-4">סימולטור — מה אם אגדיל הפרשה?</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                תוספת חודשית (₪)
              </label>
              <input
                type="number"
                value={simMonthlyAdd}
                onChange={(e) => setSimMonthlyAdd(e.target.value)}
                placeholder="לדוגמה: 500"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
              <p className="text-xs text-slate-400 mt-1">
                הגדלה על ידי הפרשה עצמאית נוספת לקרן
              </p>
            </div>

            {/* Baseline */}
            <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
              <p className="text-xs font-medium text-slate-500 mb-2">בסיס (ללא שינוי)</p>
              <div className="flex justify-between">
                <span className="text-slate-600">יתרה בפרישה</span>
                <span className="font-bold text-slate-900">{fmtCurrency(finalBalance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">קצבה חודשית</span>
                <span className="font-bold text-slate-900">{fmtCurrency(monthlyPension)}</span>
              </div>
            </div>

            {simExtra > 0 && (
              <div className="bg-green-50 rounded-xl p-4 space-y-2 text-sm border border-green-100">
                <p className="text-xs font-medium text-green-700 mb-2">עם תוספת של {fmtCurrency(simExtra)}/חודש</p>
                <div className="flex justify-between">
                  <span className="text-slate-600">יתרה בפרישה</span>
                  <span className="font-bold text-green-700">{fmtCurrency(simBalance)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">קצבה חודשית</span>
                  <span className="font-bold text-green-700">{fmtCurrency(simMonthlyPension)}</span>
                </div>
                <div className="flex justify-between border-t border-green-200 pt-2">
                  <span className="text-slate-600">שיפור בצבירה</span>
                  <span className="font-bold text-blue-600">+{fmtCurrency(simBalance - finalBalance)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">שיפור בקצבה</span>
                  <span className="font-bold text-blue-600">+{fmtCurrency(simMonthlyPension - monthlyPension)}/חודש</span>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Edit Modal */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title="ערוך הגדרות פנסיה">
        <div className="grid grid-cols-2 gap-4">
          {/* Basic info */}
          <div className="col-span-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">פרטי הקרן</p>
          </div>
          {([
            { key: 'name', label: 'שם הקרן' },
            { key: 'company', label: 'חברה מנהלת' },
            { key: 'balance', label: 'יתרה נוכחית (₪)', type: 'number', note: 'הסכום שצבור בקרן כרגע' },
          ] as { key: string; label: string; type?: string; note?: string }[]).map(({ key, label, type = 'text', note }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
              {note && <p className="text-xs text-slate-400 mb-1">{note}</p>}
              <input type={type} value={(editForm as Record<string, string>)[key]}
                onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">מסלול השקעה</label>
            <p className="text-xs text-slate-400 mb-1">אסטרטגיית ההשקעה של הקרן</p>
            <select value={editForm.track} onChange={(e) => setEditForm({ ...editForm, track: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              {PENSION_TRACKS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Salary & contributions */}
          <div className="col-span-2 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">משכורת והפרשות</p>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">משכורת ברוטו (₪)</label>
            <p className="text-xs text-slate-400 mb-1">המשכורת ממנה מחושבים אחוזי ההפרשות</p>
            <input type="number" value={editForm.salary}
              onChange={(e) => setEditForm({ ...editForm, salary: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          {([
            { key: 'employeeContribution', label: 'הפרשת עובד (%)', note: 'בדרך כלל 6% — מנוכה ממשכורתך' },
            { key: 'employerContribution', label: 'הפרשת מעביד (%)', note: 'בדרך כלל 6.5% — תוספת של המעסיק' },
            { key: 'compensationContribution', label: 'פיצויים (%)', note: 'בדרך כלל 8.33% — שנכלל בקרן' },
          ] as { key: string; label: string; note: string }[]).map(({ key, label, note }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
              <p className="text-xs text-slate-400 mb-1">{note}</p>
              <input type="number" value={(editForm as Record<string, string>)[key]}
                onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          ))}

          {/* Return & fees */}
          <div className="col-span-2 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">תשואה ועלויות</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">תשואה שנתית משוערת (%)</label>
            <p className="text-xs text-slate-400 mb-1">ממוצע היסטורי: 5-8%. ברירת מחדל: 6%</p>
            <input type="number" step="0.1" value={editForm.expectedReturn}
              onChange={(e) => setEditForm({ ...editForm, expectedReturn: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">דמי ניהול (%)</label>
            <p className="text-xs text-slate-400 mb-1">עלות שנתית. מנוכה מהתשואה</p>
            <input type="number" step="0.01" value={editForm.managementFee}
              onChange={(e) => setEditForm({ ...editForm, managementFee: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>

          {/* Retirement */}
          <div className="col-span-2 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">גיל פרישה</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">שנת לידה</label>
            <input type="number" value={editForm.birthYear}
              onChange={(e) => setEditForm({ ...editForm, birthYear: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">גיל פרישה</label>
            <p className="text-xs text-slate-400 mb-1">גברים: 67, נשים: 62</p>
            <input type="number" value={editForm.retirementAge}
              onChange={(e) => setEditForm({ ...editForm, retirementAge: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        <button onClick={saveEdit}
          className="w-full mt-5 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700">
          שמור שינויים
        </button>
      </Modal>
    </div>
  );
}
