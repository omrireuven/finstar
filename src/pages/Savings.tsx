import { useState } from 'react';
import { Plus, AlertCircle, Pencil, ExternalLink, Info, ChevronDown, ChevronUp, BookOpen, GraduationCap, Eye, EyeOff } from 'lucide-react';
import { AreaChart, Area, LineChart, Line, ReferenceLine, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useStore } from '../store';
import Card from '../components/common/Card';
import Modal from '../components/common/Modal';
import Badge from '../components/common/Badge';
import { fmtCurrency, fmtDate, fmt } from '../utils/format';
import type { SavingsAccount, GemelFund, HishtalmutFund } from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────
const BANKS = ['בנק הפועלים', 'בנק לאומי', 'מזרחי-טפחות', 'בנק דיסקונט', 'הבנק הבינלאומי', 'בנק מרכנתיל', 'אחר'];
const FUND_COMPANIES = ['מיטב', 'הפניקס', 'מגדל', 'הראל', 'כלל', 'מנורה', 'פסגות', 'אלטשולר שחם', 'אינפיניטי', 'אחר'];
const GEMEL_COMPANIES = FUND_COMPANIES;
const GEMEL_TRACKS = ['מסלול כללי', 'אג"ח שקלי', 'מניות', 'מניות חו"ל', 'מסלול סולידי', 'מסלול הלכתי'];
const PENSION_TRACKS = ['מסלול כללי', 'מסלול אג"ח', 'מסלול מניות', 'מסלול הלכתי', 'מסלול סולידי', 'מסלול מניות חו"ל'];
const HISHTALMUT_TRACKS = ['מסלול כללי', 'מסלול מניות', 'מסלול אג"ח', 'מסלול מניות חו"ל', 'מסלול סולידי', 'מסלול הלכתי'];
const COMPANY_LINKS: Record<string, string> = {
  'מיטב': 'https://www.meitav.co.il', 'הפניקס': 'https://www.phoenix.co.il',
  'מגדל': 'https://www.migdal.co.il', 'הראל': 'https://www.harel.co.il',
  'כלל': 'https://www.clal-finance.co.il',
};

// ── Fund type explanations ─────────────────────────────────────────────────────
const FUND_EXPLAINERS = {
  savings: {
    title: 'פיקדון בנקאי',
    icon: '🏦',
    color: 'blue',
    what: 'הפקדת כסף בבנק לתקופה קצובה תמורת ריבית קבועה. הכסף "נעול" עד מועד הפירעון.',
    pros: ['ריבית קבועה ומובטחת', 'מוגן על ידי ביטוח פיקדונות עד ₪250,000', 'מכשיר הכי סולידי'],
    cons: ['ריבית נמוכה יחסית', 'קנס על פירעון מוקדם', 'אין גידול ריאלי לטווח ארוך'],
    where: 'אזור אישי באתר הבנק ← פיקדונות ← לצפייה בפירוט',
    fields: [
      { label: 'יתרה', where: 'הסכום הכולל שהופקד (לא כולל ריבית שטרם נצברה)' },
      { label: 'ריבית שנתית', where: 'מופיעה בתעודת הפיקדון. טיפ: חפש "ריבית נומינלית שנתית"' },
      { label: 'תאריך פתיחה/פירעון', where: 'מופיע בתעודת הפיקדון או בדף החשבון' },
    ],
  },
  gemel: {
    title: 'קופת גמל להשקעה',
    icon: '📈',
    color: 'purple',
    what: 'חיסכון גמיש לכל מטרה. הכסף מושקע בשוק ההון. ניתן למשוך בכל עת (עם מס) או לפרישה (פטור ממס).',
    pros: ['גמישות — ניתן למשוך בכל עת', 'מגוון מסלולי השקעה', 'פטור ממס בפרישה אם ממירים לקצבה'],
    cons: ['מס 25% על רווחים בפדיון מוקדם', 'תשואה תלויה בשוק', 'דמי ניהול שנתיים'],
    where: 'אתר החברה המנהלת ← אזור אישי ← "קופות גמל" ← "קופת גמל להשקעה"',
    fields: [
      { label: 'יתרה', where: '"יתרת חיסכון" או "שווי תיק" בדף הקרן' },
      { label: 'תשואה שנתית', where: '"תשואה שנתית" לשנה הנוכחית בדשבורד' },
      { label: 'תשואה מצטברת', where: '"תשואה כוללת" מתאריך פתיחה — לרוב בלשונית "תשואות"' },
      { label: 'דמי ניהול מצבירה', where: '"דמי ניהול על צבירה" — בדרך כלל 0.1%–1.1% (מקסימום חוקי 1.1%)' },
      { label: 'דמי ניהול מהפקדות', where: '"דמי ניהול על הפקדות" — בדרך כלל 0%–2% (מקסימום חוקי 4%)' },
    ],
  },
  hishtalmut: {
    title: 'קרן השתלמות',
    icon: '🎓',
    color: 'teal',
    what: 'כלי החיסכון המשתלם ביותר לשכירים. הפקדות פטורות ממס, הכסף נזיל אחרי 6 שנים. מעסיק מפריש 7.5% מהשכר ועובד 2.5%.',
    pros: ['הטבת מס מלאה על ההפקדות (עד תקרה)', 'תשואה פטורה ממס לחלוטין', 'נזיל אחרי 6 שנים לכל מטרה', 'ניתן להשתמש כ"קיר הגנה" מול מס הכנסה'],
    cons: ['נעול 6 שנים מהפקדה ראשונה', 'תקרת הפקדה להטבת מס (סביב ₪47,136 בשנה)', 'תלוי בשוק ההון'],
    where: 'אתר החברה המנהלת ← "קרן השתלמות" ← סקירת הקרן',
    fields: [
      { label: 'יתרה', where: '"יתרת חיסכון" בדף הקרן' },
      { label: 'הפרשת עובד', where: 'תלוש השכר ← "קרן השתלמות עובד" — לרוב 2.5%' },
      { label: 'הפרשת מעביד', where: 'תלוש השכר ← "קרן השתלמות מעביד" — לרוב 7.5%' },
      { label: 'דמי ניהול', where: '"דמי ניהול על צבירה" — מקסימום חוקי 1.5%' },
      { label: 'תאריך פתיחה', where: 'מועד הפתיחה הראשוני — קובע מתי הקרן נפתחת למשיכה' },
    ],
  },
  pension: {
    title: 'קרן פנסיה',
    icon: '🧓',
    color: 'green',
    what: 'קרן הפנסיה צוברת כסף לאורך חיי העבודה ומשלמת קצבה חודשית מגיל פרישה. כוללת גם כיסוי ביטוחי (נכות ושארים).',
    pros: ['קצבה חודשית לכל החיים', 'כיסוי נכות ושארים מובנה', 'הטבות מס משמעותיות', 'הפרשות מעסיק חובה'],
    cons: ['לא ניתן למשוך לפני גיל פרישה', 'קצבה (לא סכום חד-פעמי)', 'דמי ניהול וכיסוי ביטוחי מקטינים צבירה'],
    where: 'הראל: my.harel.co.il ← "הפנסיה שלי" ← "פירוט קרן פנסיה"',
    fields: [
      { label: 'יתרה נוכחית', where: '"יתרת חיסכון" בדשבורד הראשי של הקרן' },
      { label: 'משכורת ברוטו', where: 'תלוש השכר — "שכר ברוטו" (לפני ניכויים)' },
      { label: 'הפרשת עובד', where: 'תלוש השכר ← "עובד פנסיה" — לרוב 6% או 7%' },
      { label: 'הפרשת מעביד', where: 'תלוש השכר ← "מעביד פנסיה" — לרוב 6.5%–7.5%' },
      { label: 'פיצויים', where: 'תלוש השכר ← "פיצויים" — לרוב 8.33%' },
      { label: 'דמי ניהול', where: 'הראל: דשבורד ← "פירוט עמלות" ← "דמי ניהול מצבירה" (בד״כ 0.1%–0.5%)' },
      { label: 'מסלול השקעה', where: 'הראל: "מסלול" בכותרת דף הקרן. ברירת מחדל: "מסלול לפי גיל"' },
    ],
  },
};

// ── Hishtalmut ceiling (2024) ─────────────────────────────────────────────────
/** Max salary for full tax exemption ~₪15,712/month; employer 7.5% + employee 2.5% = 10% */
const HISH_CEILING_MONTHLY = 15_712 * 0.10; // ≈ ₪1,571/month

/** Compound total return % given annualReturn % and years elapsed */
function calcCompoundReturn(annualReturn: number, years: number): number {
  return (Math.pow(1 + annualReturn / 100, years) - 1) * 100;
}

/** Project hishtalmut balance over the remaining part of the 6-year cycle.
 *  yearsElapsed = how many years have already passed since openDate (can be fractional).
 *  Labels reflect actual cycle-year numbers (שנה 1…6). */
function projectHishtalmut(
  balance: number,
  monthlyDeposit: number,
  annualRate: number,
  yearsElapsed = 0,
) {
  const yearsDone = Math.floor(yearsElapsed);          // complete years already in
  const yearsLeft = Math.max(1, 6 - yearsDone);        // remaining years to show
  const months = yearsLeft * 12;
  const r = (annualRate / 100) / 12;
  let b = balance;
  let cb = HISH_CEILING_MONTHLY * 12;
  let p = balance;
  const data: { label: string; יתרה: number; תקרה: number; הפרשה: number }[] = [];
  for (let m = 0; m <= months; m++) {
    if (m % 12 === 0) {
      const cycleYear = yearsDone + m / 12;
      const isToday = m === 0;
      const label = isToday
        ? (yearsDone === 0 ? 'היום' : `היום (שנה ${cycleYear})`)
        : `שנה ${cycleYear}`;
      data.push({ label, יתרה: Math.round(b), תקרה: Math.round(cb), הפרשה: Math.round(p) });
    }
    if (m < months) {
      b  = b  * (1 + r) + monthlyDeposit;
      cb += HISH_CEILING_MONTHLY;
      p += monthlyDeposit;
    }
  }
  return data;
}

// ── Pension projection ────────────────────────────────────────────────────────
function projectPension(balance: number, monthlyTotal: number, yearsLeft: number, rate: number) {
  const monthlyRate = rate / 12;
  let b = balance;
  let p = balance;
  const data = [{ year: 'היום', יתרה: Math.round(b), הפרשה: Math.round(p) }];
  for (let y = 1; y <= yearsLeft; y++) {
    for (let m = 0; m < 12; m++) {
      b = b * (1 + monthlyRate) + monthlyTotal;
      p += monthlyTotal;
    }
    if (y % 5 === 0 || y === yearsLeft) data.push({ year: `+${y}`, יתרה: Math.round(b), הפרשה: Math.round(p) });
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

// ── Explainer panel ────────────────────────────────────────────────────────────
function FundExplainer({ type }: { type: keyof typeof FUND_EXPLAINERS }) {
  const [open, setOpen] = useState(false);
  const e = FUND_EXPLAINERS[type];
  const colorMap: Record<string, string> = {
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
    purple: 'border-purple-200 bg-purple-50 text-purple-800',
    teal: 'border-teal-200 bg-teal-50 text-teal-800',
    green: 'border-green-200 bg-green-50 text-green-800',
  };
  const badgeColor = colorMap[e.color] ?? colorMap.blue;
  return (
    <div className={`rounded-xl border text-sm ${badgeColor} overflow-hidden`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2 font-semibold"
      >
        <span className="flex items-center gap-2">
          <span>{e.icon}</span>
          <span>מה זה {e.title}?</span>
        </span>
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-current border-opacity-20">
          <p className="mt-3 opacity-80">{e.what}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="font-semibold mb-1.5">✅ יתרונות</div>
              <ul className="space-y-1 opacity-80">
                {e.pros.map((p) => <li key={p} className="flex gap-1.5 text-xs"><span>•</span>{p}</li>)}
              </ul>
            </div>
            <div>
              <div className="font-semibold mb-1.5">⚠️ חסרונות</div>
              <ul className="space-y-1 opacity-80">
                {e.cons.map((c) => <li key={c} className="flex gap-1.5 text-xs"><span>•</span>{c}</li>)}
              </ul>
            </div>
          </div>
          {e.fields.length > 0 && (
            <div>
              <div className="font-semibold mb-1.5 flex items-center gap-1.5"><BookOpen size={13} /> איפה למצוא כל שדה?</div>
              <div className="bg-white bg-opacity-50 rounded-lg divide-y divide-current divide-opacity-10 text-xs">
                {e.fields.map((f) => (
                  <div key={f.label} className="flex gap-2 px-3 py-2">
                    <span className="font-semibold shrink-0 w-28">{f.label}</span>
                    <span className="opacity-70">{f.where}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="text-xs opacity-60 flex items-center gap-1.5"><ExternalLink size={11} /> מיקום: {e.where}</div>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
type Tab = 'savings' | 'gemel' | 'hishtalmut' | 'pension';

export default function Savings() {
  const { savings, addSavings, updateSavings, deleteSavings,
          gemel, addGemel, updateGemel, deleteGemel,
          hishtalmut, addHishtalmut, updateHishtalmut, deleteHishtalmut,
          pension, updatePension } = useStore();

  const [tab, setTab] = useState<Tab>('savings');

  // ── Savings state ────────────────────────────────────────────────────────
  const SAVINGS_BLANK = { bank: BANKS[0], name: '', amount: '', interestRate: '', maturityDate: '', openDate: new Date().toISOString().slice(0, 10), link: '', logoUrl: '' };
  const [savingsAddModal, setSavingsAddModal] = useState(false);
  const [savingsEditItem, setSavingsEditItem] = useState<SavingsAccount | null>(null);
  const [savingsForm, setSavingsForm] = useState(SAVINGS_BLANK);

  // ── Gemel state ──────────────────────────────────────────────────────────
  const GEMEL_BLANK = { name: '', company: GEMEL_COMPANIES[0], balance: '', track: GEMEL_TRACKS[0], managementFee: '', depositFee: '', annualReturn: '', employeeContribution: '', employerContribution: '', salary: '', link: '', logoUrl: '' };
  const [gemelAddModal, setGemelAddModal] = useState(false);
  const [gemelEditId, setGemelEditId] = useState<string | null>(null);
  const [gemelForm, setGemelForm] = useState(GEMEL_BLANK);
  const [gemelYears, setGemelYears] = useState(10);

  // ── Hishtalmut state ─────────────────────────────────────────────────────
  const HISH_BLANK = { name: '', company: FUND_COMPANIES[0], balance: '', track: HISHTALMUT_TRACKS[0], managementFee: '', annualReturn: '', employeeContribution: '2.5', employerContribution: '7.5', salary: '', openDate: '', link: '', logoUrl: '' };
  const [hishAddModal, setHishAddModal] = useState(false);
  const [hishEditId, setHishEditId] = useState<string | null>(null);
  const [hishForm, setHishForm] = useState(HISH_BLANK);
  const [showHishCeiling, setShowHishCeiling] = useState(true);

  // ── Pension state ────────────────────────────────────────────────────────
  const pensionFund = pension[0];
  const [pensionSimAdd, setPensionSimAdd] = useState('');
  const [pensionEditModal, setPensionEditModal] = useState(false);
  const [pensionEditForm, setPensionEditForm] = useState({
    name: '', company: '', balance: '', track: '', salary: '',
    employeeContribution: '', employerContribution: '',
    compensationContribution: '', managementFee: '',
    expectedReturn: '', retirementAge: '', birthYear: '', link: '', logoUrl: '',
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
    setSavingsForm({ bank: s.bank, name: s.name, amount: String(s.amount), interestRate: String(s.interestRate), maturityDate: s.maturityDate, openDate: s.openDate, link: s.link ?? '', logoUrl: s.logoUrl ?? '' });
  }
  function saveSavingsEdit() {
    if (!savingsEditItem) return;
    updateSavings(savingsEditItem.id, { bank: savingsForm.bank, name: savingsForm.name, amount: +savingsForm.amount, interestRate: +savingsForm.interestRate, maturityDate: savingsForm.maturityDate, openDate: savingsForm.openDate, link: savingsForm.link || undefined, logoUrl: savingsForm.logoUrl || undefined });
    setSavingsEditItem(null);
  }
  function addSavingsAccount() {
    addSavings({ bank: savingsForm.bank, name: savingsForm.name, amount: +savingsForm.amount, interestRate: +savingsForm.interestRate, maturityDate: savingsForm.maturityDate, openDate: savingsForm.openDate, open: true, link: savingsForm.link || undefined, logoUrl: savingsForm.logoUrl || undefined });
    setSavingsAddModal(false);
    setSavingsForm(SAVINGS_BLANK);
  }

  // ── Gemel helpers ────────────────────────────────────────────────────────
  const totalGemel = gemel.reduce((a, g) => a + g.balance, 0);
  const avgGemelReturn = gemel.length > 0 ? gemel.reduce((a, g) => a + g.annualReturn, 0) / gemel.length : 0;
  // Weighted-average net rate (return minus management fee), weighted by balance
  const avgGemelNetRate = totalGemel > 0
    ? gemel.reduce((a, g) => a + Math.max(0, g.annualReturn - g.managementFee) * g.balance, 0) / totalGemel
    : 0;
  // Total monthly deposit across all gemel funds
  const totalGemelMonthlyDep = gemel.reduce((a, g) =>
    a + (g.salary > 0 ? g.salary * ((g.employeeContribution + g.employerContribution) / 100) : 0), 0);
  // Projection, yearly data points
  const gemelChartData = (() => {
    const r = (avgGemelNetRate / 100) / 12;
    let b = totalGemel;
    let p = totalGemel;
    const pts: { year: string; יתרה: number; הפרשה: number }[] = [{ year: 'היום', יתרה: Math.round(b), הפרשה: Math.round(p) }];
    for (let y = 1; y <= gemelYears; y++) {
      for (let m = 0; m < 12; m++) {
        b = b * (1 + r) + totalGemelMonthlyDep;
        p += totalGemelMonthlyDep;
      }
      pts.push({ year: `+${y}`, יתרה: Math.round(b), הפרשה: Math.round(p) });
    }
    return pts;
  })();

  function openGemelEdit(g: GemelFund) {
    setGemelEditId(g.id);
    setGemelForm({ name: g.name, company: g.company, balance: String(g.balance), track: g.track, managementFee: String(g.managementFee), depositFee: String(g.depositFee ?? 0), annualReturn: String(g.annualReturn), employeeContribution: String(g.employeeContribution ?? ''), employerContribution: String(g.employerContribution ?? ''), salary: String(g.salary ?? ''), link: g.link ?? '', logoUrl: g.logoUrl ?? '' });
  }
  function saveGemelEdit() {
    if (!gemelEditId) return;
    updateGemel(gemelEditId, { name: gemelForm.name, company: gemelForm.company, balance: +gemelForm.balance, track: gemelForm.track, managementFee: +gemelForm.managementFee, depositFee: +gemelForm.depositFee, annualReturn: +gemelForm.annualReturn, employeeContribution: +gemelForm.employeeContribution || 0, employerContribution: +gemelForm.employerContribution || 0, salary: +gemelForm.salary || 0, link: gemelForm.link || undefined, logoUrl: gemelForm.logoUrl || undefined });
    setGemelEditId(null);
  }
  function addGemelFund() {
    addGemel({ name: gemelForm.name, company: gemelForm.company, balance: +gemelForm.balance, track: gemelForm.track, managementFee: +gemelForm.managementFee, depositFee: +gemelForm.depositFee, annualReturn: +gemelForm.annualReturn, employeeContribution: +gemelForm.employeeContribution || 0, employerContribution: +gemelForm.employerContribution || 0, salary: +gemelForm.salary || 0, link: gemelForm.link || undefined, logoUrl: gemelForm.logoUrl || undefined });
    setGemelAddModal(false);
    setGemelForm(GEMEL_BLANK);
  }

  // ── Hishtalmut helpers ────────────────────────────────────────────────────
  const totalHishtalmut = hishtalmut.reduce((a, h) => a + h.balance, 0);

  function openHishEdit(h: HishtalmutFund) {
    setHishEditId(h.id);
    setHishForm({ name: h.name, company: h.company, balance: String(h.balance), track: h.track, managementFee: String(h.managementFee), annualReturn: String(h.annualReturn), employeeContribution: String(h.employeeContribution), employerContribution: String(h.employerContribution), salary: String(h.salary ?? ''), openDate: h.openDate ?? '', link: h.link ?? '', logoUrl: h.logoUrl ?? '' });
  }
  function saveHishEdit() {
    if (!hishEditId) return;
    updateHishtalmut(hishEditId, { name: hishForm.name, company: hishForm.company, balance: +hishForm.balance, track: hishForm.track, managementFee: +hishForm.managementFee, annualReturn: +hishForm.annualReturn, employeeContribution: +hishForm.employeeContribution, employerContribution: +hishForm.employerContribution, salary: +hishForm.salary || 0, openDate: hishForm.openDate || undefined, link: hishForm.link || undefined, logoUrl: hishForm.logoUrl || undefined });
    setHishEditId(null);
  }
  function addHishFund() {
    addHishtalmut({ name: hishForm.name, company: hishForm.company, balance: +hishForm.balance, track: hishForm.track, managementFee: +hishForm.managementFee, annualReturn: +hishForm.annualReturn, employeeContribution: +hishForm.employeeContribution, employerContribution: +hishForm.employerContribution, salary: +hishForm.salary || 0, openDate: hishForm.openDate || undefined, link: hishForm.link || undefined, logoUrl: hishForm.logoUrl || undefined });
    setHishAddModal(false);
    setHishForm(HISH_BLANK);
  }

  // Hishtalmut derived
  function hishUnlockDate(h: HishtalmutFund): Date | null {
    if (!h.openDate) return null;
    const d = new Date(h.openDate);
    d.setFullYear(d.getFullYear() + 6);
    return d;
  }
  function hishMonthlyDeposit(h: HishtalmutFund) {
    if (!h.salary) return 0;
    return h.salary * ((h.employeeContribution + h.employerContribution) / 100);
  }

  // Hishtalmut chart data
  const totalHishMonthlyDep = hishtalmut.reduce((a, h) => a + hishMonthlyDeposit(h), 0);
  const avgHishRate = totalHishtalmut > 0
    ? hishtalmut.reduce((a, h) => a + h.annualReturn * h.balance, 0) / totalHishtalmut
    : 0;
  // Use the minimum elapsed years (newest fund) so the chart covers the full remaining cycle
  const hishYearsElapsed = (() => {
    const vals = hishtalmut
      .filter((h) => !!h.openDate)
      .map((h) => (Date.now() - new Date(h.openDate!).getTime()) / (365.25 * 24 * 3600 * 1000));
    return vals.length > 0 ? Math.min(...vals) : 0;
  })();
  const hishChartData = hishtalmut.length > 0
    ? projectHishtalmut(totalHishtalmut, totalHishMonthlyDep, avgHishRate, hishYearsElapsed)
    : [];

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
      link: pensionFund.link ?? '', logoUrl: pensionFund.logoUrl ?? '',
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
      link: pensionEditForm.link || undefined, logoUrl: pensionEditForm.logoUrl || undefined,
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
  const totalAll = totalSavings + totalGemel + totalHishtalmut + (pf?.balance ?? 0);

  // ── Tab button ───────────────────────────────────────────────────────────
  const tabs: { id: Tab; label: string; count?: string }[] = [
    { id: 'savings',     label: 'פיקדונות',       count: fmtCurrency(totalSavings) },
    { id: 'gemel',       label: 'קופות גמל',      count: fmtCurrency(totalGemel) },
    { id: 'hishtalmut',  label: 'קרן השתלמות',    count: fmtCurrency(totalHishtalmut) },
    { id: 'pension',     label: 'פנסיה',           count: pf ? fmtCurrency(pf.balance) : undefined },
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className={`cursor-pointer transition-all ${tab === 'savings' ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`} onClick={() => setTab('savings')}>
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">🏦 פיקדונות</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{fmtCurrency(totalSavings)}</div>
          <div className="text-xs text-slate-400">{openSavings.length} פעילים • {fmt(avgRate, 1)}% ריבית ממוצעת</div>
        </Card>
        <Card className={`cursor-pointer transition-all ${tab === 'gemel' ? 'ring-2 ring-purple-400 ring-offset-1' : ''}`} onClick={() => setTab('gemel')}>
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">📈 קופות גמל</div>
          <div className="text-2xl font-bold text-purple-600 mt-1">{fmtCurrency(totalGemel)}</div>
          <div className="text-xs text-slate-400">{gemel.length} קרנות • {fmt(avgGemelReturn, 1)}% תשואה ממוצעת</div>
        </Card>
        <Card className={`cursor-pointer transition-all ${tab === 'hishtalmut' ? 'ring-2 ring-teal-400 ring-offset-1' : ''}`} onClick={() => setTab('hishtalmut')}>
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">🎓 קרן השתלמות</div>
          <div className="text-2xl font-bold text-teal-600 mt-1">{fmtCurrency(totalHishtalmut)}</div>
          <div className="text-xs text-slate-400">{hishtalmut.length} קרנות</div>
        </Card>
        <Card className={`cursor-pointer transition-all ${tab === 'pension' ? 'ring-2 ring-green-400 ring-offset-1' : ''}`} onClick={() => setTab('pension')}>
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">🧓 פנסיה</div>
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
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <FundExplainer type="savings" />
            </div>
            <button onClick={() => setSavingsAddModal(true)} className="shrink-0 flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-xl text-sm text-white hover:bg-blue-700">
              <Plus size={16} /> הוסף פיקדון
            </button>
          </div>
          <p className="text-sm text-slate-500">{fmtCurrency(openSavings.reduce((a, s) => a + calcAccruedInterest(s), 0))} ריבית שנצברה</p>

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
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-100 text-sm">
                  <div><div className="text-slate-400">תאריך פתיחה</div><div className="font-medium text-slate-700">{fmtDate(s.openDate)}</div></div>
                  <div><div className="text-slate-400">תאריך פירעון</div><div className="font-medium text-slate-700">{fmtDate(s.maturityDate)}</div></div>
                  <div><div className="text-slate-400">ריבית שנצברה</div><div className="font-medium text-green-600">{fmtCurrency(accrued)}</div></div>
                  <div className="flex gap-2 flex-wrap items-center">
                    {s.logoUrl && s.link ? (
                      <a href={s.link} target="_blank" rel="noopener noreferrer" className="shrink-0 transition-transform hover:scale-105">
                        <img src={s.logoUrl} alt="Logo" className="h-10 object-contain rounded" />
                      </a>
                    ) : s.link ? (
                      <a href={s.link} target="_blank" rel="noopener noreferrer"
                        className="text-xs px-3 py-1.5 border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 flex items-center gap-1">
                        <ExternalLink size={11} /> פירוט
                      </a>
                    ) : null}
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
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <FundExplainer type="gemel" />
            </div>
            <button onClick={() => setGemelAddModal(true)} className="shrink-0 flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-xl text-sm text-white hover:bg-blue-700">
              <Plus size={16} /> הוסף קרן
            </button>
          </div>
          <p className="text-sm text-slate-500">דמי ניהול ממוצעים: {fmt(gemel.length > 0 ? gemel.reduce((a, g) => a + g.managementFee, 0) / gemel.length : 0, 2)}%</p>

          {totalGemel > 0 && (
            <Card>
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-semibold text-slate-900">תחזית {gemelYears} שנים</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">תקופה:</span>
                  <select 
                    value={gemelYears} 
                    onChange={(e) => setGemelYears(Number(e.target.value))}
                    className="text-xs border border-slate-200 rounded-lg py-1 px-2 bg-slate-50 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
                  >
                    <option value={5}>5 שנים</option>
                    <option value={10}>10 שנים</option>
                    <option value={15}>15 שנים</option>
                    <option value={20}>20 שנים</option>
                    <option value={30}>30 שנים</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                תשואה נטו {fmt(avgGemelNetRate, 1)}%
                {totalGemelMonthlyDep > 0 && ` • הפרשה חודשית ${fmtCurrency(totalGemelMonthlyDep)}`}
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={gemelChartData}>
                  <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: unknown) => fmtCurrency(v as number)} />
                  <Legend />
                  <Area type="monotone" dataKey="יתרה" name="צבירה כוללת" stroke="#8b5cf6" fill="#8b5cf620" strokeWidth={2} />
                  <Area type="monotone" dataKey="הפרשה" name="הפרשות מצטברות" stroke="#10b981" fill="#10b98120" strokeWidth={2} />
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
                  {g.logoUrl && g.link ? (
                    <a href={g.link} target="_blank" rel="noopener noreferrer" className="shrink-0 transition-transform hover:scale-105">
                      <img src={g.logoUrl} alt="Logo" className="h-10 object-contain rounded" />
                    </a>
                  ) : g.link ? (
                    <a href={g.link} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">
                      <ExternalLink size={16} />
                    </a>
                  ) : COMPANY_LINKS[g.company] && (
                    <a href={COMPANY_LINKS[g.company]} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">
                      <ExternalLink size={16} />
                    </a>
                  )}
                  <div className="text-xl font-bold text-slate-900">{fmtCurrency(g.balance)}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mt-4 pt-4 border-t border-slate-100 text-sm">
                <div>
                  <div className="text-slate-400">דמי ניהול מצבירה</div>
                  <div className="font-medium text-red-500">{fmt(g.managementFee, 2)}%</div>
                  <div className="text-xs text-slate-400">שנתי מהיתרה</div>
                </div>
                <div>
                  <div className="text-slate-400">דמי ניהול מהפקדות</div>
                  <div className="font-medium text-red-500">{fmt(g.depositFee ?? 0, 2)}%</div>
                  <div className="text-xs text-slate-400">מכל הפקדה</div>
                </div>
                <div>
                  <div className="text-slate-400">תשואה</div>
                  <div className={`font-medium ${g.annualReturn >= 0 ? 'text-green-600' : 'text-red-500'}`}>{g.annualReturn >= 0 ? '+' : ''}{fmt(g.annualReturn, 1)}%</div>
                </div>
                <div>
                  <div className="text-slate-400">הפרשה חודשית</div>
                  <div className="font-medium text-purple-700">
                    {g.salary > 0 ? fmtCurrency(g.salary * ((g.employeeContribution + g.employerContribution) / 100)) : '—'}
                  </div>
                  {g.salary > 0 && <div className="text-xs text-slate-400">{g.employeeContribution}%+{g.employerContribution}%</div>}
                </div>
                <div className="flex gap-2 items-end flex-wrap">
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
          TAB: קרן השתלמות
      ══════════════════════════════════════════════════════════════════ */}
      {tab === 'hishtalmut' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <FundExplainer type="hishtalmut" />
            </div>
            <button onClick={() => setHishAddModal(true)} className="shrink-0 flex items-center gap-2 px-4 py-2 bg-teal-600 rounded-xl text-sm text-white hover:bg-teal-700">
              <Plus size={16} /> הוסף קרן השתלמות
            </button>
          </div>
          <p className="text-sm text-slate-500">
            {hishtalmut.length > 0
              ? `${hishtalmut.length} קרנות • דמי ניהול ממוצעים ${fmt(hishtalmut.reduce((a, h) => a + h.managementFee, 0) / hishtalmut.length, 2)}%`
              : 'הוסף את קרן ההשתלמות שלך'}
          </p>

          {hishtalmut.length > 0 && (
            <Card>
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-semibold text-slate-900">תחזית 6 שנים</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">תקרת מס</span>
                  <button
                    onClick={() => setShowHishCeiling((v) => !v)}
                    className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors ${showHishCeiling ? 'bg-teal-50 text-teal-600 border-teal-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}
                  >
                    {showHishCeiling ? <Eye size={12} /> : <EyeOff size={12} />}
                    {showHishCeiling ? 'הסתר' : 'הצג'}
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                תשואה שנתית {fmt(avgHishRate, 1)}% • הפרשה חודשית {fmtCurrency(totalHishMonthlyDep)} • תקרת מס ≈{fmtCurrency(HISH_CEILING_MONTHLY)}/חודש
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={hishChartData}>
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: unknown) => fmtCurrency(v as number)} />
                  <Legend />
                  <Area type="monotone" dataKey="יתרה" name="צבירה כוללת" stroke="#0d9488" fill="#0d948820" strokeWidth={2} dot={{ r: 4 }} />
                  <Area type="monotone" dataKey="הפרשה" name="הפרשות מצטברות" stroke="#3b82f6" fill="#3b82f620" strokeWidth={2} dot={{ r: 4 }} />
                  {showHishCeiling && (
                    <Line type="monotone" dataKey="תקרה" name="תקרת מס" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          )}

          {hishtalmut.map((h) => {
            const unlock = hishUnlockDate(h);
            const now = new Date();
            const isUnlocked = unlock ? unlock <= now : null;
            const daysToUnlock = unlock && !isUnlocked ? Math.ceil((unlock.getTime() - now.getTime()) / 86400_000) : null;
            const monthlyDep = hishMonthlyDeposit(h);
            const yearsElapsed = h.openDate ? (now.getTime() - new Date(h.openDate).getTime()) / (365.25 * 24 * 3600 * 1000) : 0;
            const compoundReturn = h.openDate && yearsElapsed > 0 ? calcCompoundReturn(h.annualReturn, yearsElapsed) : null;

            return (
              <Card key={h.id}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold text-slate-900">{h.name}</h3>
                      {isUnlocked === true && <Badge variant="green"><GraduationCap size={10} className="ml-1" />נזיל</Badge>}
                      {isUnlocked === false && daysToUnlock !== null && (
                        <Badge variant={daysToUnlock <= 365 ? 'amber' : 'blue'}>
                          {daysToUnlock <= 365 ? `נפתח בעוד ${daysToUnlock} ימים` : `נפתח ${unlock!.toLocaleDateString('he-IL', { year: 'numeric', month: 'short' })}`}
                        </Badge>
                      )}
                      {isUnlocked === null && <Badge variant="gray">תאריך פתיחה לא הוגדר</Badge>}
                    </div>
                    <div className="text-sm text-slate-500">{h.company} • {h.track}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    {h.logoUrl && h.link ? (
                      <a href={h.link} target="_blank" rel="noopener noreferrer" className="shrink-0 transition-transform hover:scale-105">
                        <img src={h.logoUrl} alt="Logo" className="h-10 object-contain rounded" />
                      </a>
                    ) : (
                      <>
                        {COMPANY_LINKS[h.company] && (
                          <a href={COMPANY_LINKS[h.company]} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">
                            <ExternalLink size={16} />
                          </a>
                        )}
                        {h.link && (
                          <a href={h.link} target="_blank" rel="noopener noreferrer"
                            className="text-xs px-3 py-1.5 border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 flex items-center gap-1">
                            <ExternalLink size={11} /> פירוט
                          </a>
                        )}
                      </>
                    )}
                    <div className="text-xl font-bold text-teal-700">{fmtCurrency(h.balance)}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mt-4 pt-4 border-t border-slate-100 text-sm">
                  <div><div className="text-slate-400">דמי ניהול</div><div className="font-medium text-red-500">{fmt(h.managementFee, 2)}%</div></div>
                  <div><div className="text-slate-400">תשואה שנתית</div><div className={`font-medium ${h.annualReturn >= 0 ? 'text-green-600' : 'text-red-500'}`}>{h.annualReturn >= 0 ? '+' : ''}{fmt(h.annualReturn, 1)}%</div></div>
                  <div>
                    <div className="text-slate-400">תשואה מצטברת</div>
                    <div className={`font-medium ${compoundReturn !== null && compoundReturn >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {compoundReturn !== null ? `${compoundReturn >= 0 ? '+' : ''}${fmt(compoundReturn, 1)}%` : '—'}
                    </div>
                    {h.openDate && yearsElapsed > 0 && <div className="text-xs text-slate-400">{fmt(yearsElapsed, 1)} שנים</div>}
                  </div>
                  <div>
                    <div className="text-slate-400">הפרשה חודשית</div>
                    <div className="font-medium text-teal-700">
                      {monthlyDep > 0 ? fmtCurrency(monthlyDep) : '—'}
                    </div>
                    {h.salary > 0 && <div className="text-xs text-slate-400">{h.employeeContribution}%+{h.employerContribution}%</div>}
                  </div>
                  <div className="flex gap-2 items-end flex-wrap">
                    <button onClick={() => openHishEdit(h)} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1">
                      <Pencil size={11} /> ערוך
                    </button>
                    <button onClick={() => deleteHishtalmut(h.id)} className="text-xs px-3 py-1.5 border border-red-100 text-red-500 rounded-lg hover:bg-red-50">מחק</button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: פנסיה
      ══════════════════════════════════════════════════════════════════ */}
      {tab === 'pension' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <FundExplainer type="pension" />
            </div>
            {pf && (
              <button onClick={openPensionEdit} className="shrink-0 flex items-center gap-1.5 text-sm px-4 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600">
                <Pencil size={14} /> ערוך הגדרות
              </button>
            )}
          </div>
          {!pf ? (
            <div className="text-slate-500 text-center py-16">אין נתוני פנסיה</div>
          ) : (
            <>

              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-500">{pf.name} • {pf.company} • {pf.track}</div>
                {pf.logoUrl && pf.link ? (
                  <a href={pf.link} target="_blank" rel="noopener noreferrer" className="shrink-0 transition-transform hover:scale-105">
                    <img src={pf.logoUrl} alt="Logo" className="h-10 object-contain rounded" />
                  </a>
                ) : pf.link ? (
                  <a href={pf.link} target="_blank" rel="noopener noreferrer"
                    className="text-xs px-3 py-1.5 border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 flex items-center gap-1">
                    <ExternalLink size={11} /> פירוט
                  </a>
                ) : COMPANY_LINKS[pf.company] ? (
                  <a href={COMPANY_LINKS[pf.company]} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">
                    <ExternalLink size={16} />
                  </a>
                ) : null}
              </div>

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
                    <Legend />
                    <Area type="monotone" dataKey="יתרה" name="צבירה כוללת" stroke="#8b5cf6" fill="#8b5cf620" strokeWidth={2} />
                    <Area type="monotone" dataKey="הפרשה" name="הפרשות מצטברות" stroke="#f59e0b" fill="#f59e0b20" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

      {/* MODALS — Hishtalmut */}
      <Modal open={hishAddModal} onClose={() => setHishAddModal(false)} title="הוסף קרן השתלמות">
        <HishtalmutForm form={hishForm} setForm={setHishForm} companies={FUND_COMPANIES} tracks={HISHTALMUT_TRACKS} />
        <button onClick={addHishFund} disabled={!hishForm.name || !hishForm.balance}
          className="w-full mt-4 bg-teal-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-teal-700 disabled:opacity-40">
          הוסף קרן
        </button>
      </Modal>

      <Modal open={!!hishEditId} onClose={() => setHishEditId(null)} title="ערוך קרן השתלמות">
        <HishtalmutForm form={hishForm} setForm={setHishForm} companies={FUND_COMPANIES} tracks={HISHTALMUT_TRACKS} />
        <button onClick={saveHishEdit}
          className="w-full mt-4 bg-teal-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-teal-700">
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          <SectionLabel>קישורים</SectionLabel>
          <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-0.5">קישור לפירוט חיצוני</label>
              <input type="url" value={pensionEditForm.link} onChange={(e) => setPensionEditForm({ ...pensionEditForm, link: e.target.value })}
                placeholder="https://..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" dir="ltr" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-0.5">קישור ללוגו (תמונה)</label>
              <input type="url" value={pensionEditForm.logoUrl} onChange={(e) => setPensionEditForm({ ...pensionEditForm, logoUrl: e.target.value })}
                placeholder="https://..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" dir="ltr" />
            </div>
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
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">קישור ללוגו (תמונה)</label>
        <input type="url" value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
          placeholder="https://..."
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" dir="ltr" />
      </div>
    </div>
  );
}

function HishtalmutForm({ form, setForm, companies, tracks }: { form: any; setForm: (f: any) => void; companies: string[]; tracks: string[] }) {
  return (
    <div className="space-y-4">
      <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 text-sm text-teal-800">
        🎓 <strong>קרן השתלמות</strong> — כלי החיסכון המשתלם ביותר לשכירים. ניתן למשיכה לאחר 6 שנים.
      </div>
      {([{ key: 'name', label: 'שם הקרן', placeholder: 'לדוגמה: קרן השתלמות הראל 2020' }, { key: 'balance', label: 'יתרה נוכחית (₪)', type: 'number' }, { key: 'managementFee', label: 'דמי ניהול על צבירה (%)', type: 'number', note: 'מקסימום חוקי 1.5%. חפש בדשבורד של הקרן.' }, { key: 'annualReturn', label: 'תשואה שנתית (%)', type: 'number', note: 'תשואה מצטברת תחושב אוטומטית לפי ריבית דריבית' }] as {key:string;label:string;type?:string;note?:string;placeholder?:string}[]).map(({ key, label, type = 'text', note, placeholder }) => (
        <div key={key}>
          <label className="block text-sm font-medium text-slate-700 mb-0.5">{label}</label>
          {note && <p className="text-xs text-slate-400 mb-1">{note}</p>}
          <input type={type} value={form[key]} placeholder={placeholder} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
      ))}
      {[{ key: 'company', label: 'חברה מנהלת', opts: companies }, { key: 'track', label: 'מסלול השקעה', opts: tracks }].map(({ key, label, opts }) => (
        <div key={key}>
          <label className="block text-sm font-medium text-slate-700 mb-0.5">{label}</label>
          <select value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            {opts.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      ))}
      <div className="border-t border-slate-100 pt-4 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">הפרשות חודשיות (לחישוב)</p>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-0.5">משכורת ברוטו (₪)</label>
          <p className="text-xs text-slate-400 mb-1">לחישוב סכום ההפרשה החודשי — לא חובה</p>
          <input type="number" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-0.5">הפרשת עובד (%)</label>
            <p className="text-xs text-slate-400 mb-1">בד״כ 2.5%</p>
            <input type="number" step="0.1" value={form.employeeContribution} onChange={(e) => setForm({ ...form, employeeContribution: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-0.5">הפרשת מעביד (%)</label>
            <p className="text-xs text-slate-400 mb-1">בד״כ 7.5%</p>
            <input type="number" step="0.1" value={form.employerContribution} onChange={(e) => setForm({ ...form, employerContribution: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-0.5">תאריך פתיחת הקרן</label>
        <p className="text-xs text-slate-400 mb-1">קובע מתי הקרן תהיה זמינה למשיכה (6 שנים מתאריך זה)</p>
        <input type="date" value={form.openDate} onChange={(e) => setForm({ ...form, openDate: e.target.value })}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-0.5">קישור לפירוט חיצוני</label>
        <input type="url" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })}
          placeholder="https://..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" dir="ltr" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-0.5">קישור ללוגו (תמונה)</label>
        <input type="url" value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
          placeholder="https://..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" dir="ltr" />
      </div>
    </div>
  );
}

function GemelForm({ form, setForm, companies, tracks }: { form: any; setForm: (f: any) => void; companies: string[]; tracks: string[] }) {
  return (
    <div className="space-y-4">
      {([{ key: 'name', label: 'שם הקרן' }, { key: 'balance', label: 'יתרה נוכחית (₪)', type: 'number' }] as {key:string;label:string;type?:string}[]).map(({ key, label, type = 'text' }) => (
        <div key={key}>
          <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
          <input type={type} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
      ))}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-0.5">דמי ניהול מצבירה (%)</label>
          <p className="text-xs text-slate-400 mb-1">% שנתי מהיתרה הצבורה. מקס: 1.1%</p>
          <input type="number" step="0.01" value={form.managementFee} onChange={(e) => setForm({ ...form, managementFee: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-0.5">דמי ניהול מהפקדות (%)</label>
          <p className="text-xs text-slate-400 mb-1">% מכל הפקדה חדשה. מקס: 4%</p>
          <input type="number" step="0.01" value={form.depositFee} onChange={(e) => setForm({ ...form, depositFee: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-0.5">תשואה (%)</label>
        <p className="text-xs text-slate-400 mb-1">כפי שמופיעה בפורטל הקרן</p>
        <input type="number" step="0.1" value={form.annualReturn} onChange={(e) => setForm({ ...form, annualReturn: e.target.value })}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
      </div>
      {[{ key: 'company', label: 'חברה מנהלת', opts: companies }, { key: 'track', label: 'מסלול', opts: tracks }].map(({ key, label, opts }) => (
        <div key={key}>
          <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
          <select value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            {opts.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      ))}
      <div className="border-t border-slate-100 pt-4 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">הפרשות חודשיות (לחישוב)</p>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-0.5">משכורת ברוטו (₪)</label>
          <p className="text-xs text-slate-400 mb-1">לחישוב סכום ההפרשה החודשי — לא חובה</p>
          <input type="number" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-0.5">הפרשת עובד (%)</label>
            <input type="number" step="0.1" value={form.employeeContribution} onChange={(e) => setForm({ ...form, employeeContribution: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-0.5">הפרשת מעביד (%)</label>
            <input type="number" step="0.1" value={form.employerContribution} onChange={(e) => setForm({ ...form, employerContribution: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-0.5">קישור לפירוט חיצוני</label>
        <input type="url" value={form.link || ''} onChange={(e) => setForm({ ...form, link: e.target.value })}
          placeholder="https://..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" dir="ltr" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-0.5">קישור ללוגו (תמונה)</label>
        <input type="url" value={form.logoUrl || ''} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
          placeholder="https://..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" dir="ltr" />
      </div>
    </div>
  );
}
