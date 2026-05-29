import { Bell, AlertCircle, ExternalLink, CreditCard, Landmark } from 'lucide-react';
import { useStore } from '../store';
import Card from '../components/common/Card';
import { fmtCurrency, fmtDate } from '../utils/format';

// ─── Calendar ────────────────────────────────────────────────────────────────

const WEEKDAY_LABELS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']; // Sun–Sat (shown RTL → right=Sun, left=Sat)

interface CalEvent {
  label: string;
  amount?: number;
  color: 'blue' | 'amber' | 'red';
  icon: 'charge' | 'savings' | 'alert';
}

function CalendarGrid({ cells, events }: {
  cells: (Date | null)[];
  events: Map<string, CalEvent[]>;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDay = new Date(today.getTime() + 30 * 86400000);

  const colorCls: Record<CalEvent['color'], string> = {
    blue: 'bg-blue-100 text-blue-700 border-blue-200',
    amber: 'bg-amber-100 text-amber-700 border-amber-200',
    red: 'bg-red-100 text-red-700 border-red-200',
  };

  const rows: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <div>
      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1" dir="ltr">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-slate-400 py-1">{d}</div>
        ))}
      </div>
      {/* Rows */}
      <div className="space-y-1" dir="ltr">
        {rows.map((row, ri) => (
          <div key={ri} className="grid grid-cols-7 gap-1">
            {row.map((cell, ci) => {
              if (!cell) return <div key={ci} className="h-20 rounded-lg" />;
              const isToday = cell.getTime() === today.getTime();
              const isPast = cell < today;
              const isFuture = cell > endDay;
              const key = cell.toISOString().slice(0, 10);
              const dayEvents = events.get(key) ?? [];

              return (
                <div key={ci} className={`min-h-20 rounded-lg p-1.5 border transition-colors ${
                  isToday ? 'border-blue-400 bg-blue-50' :
                  isPast ? 'border-slate-100 bg-slate-50/50' :
                  isFuture ? 'border-slate-100 bg-white opacity-40' :
                  'border-slate-100 bg-white hover:bg-slate-50'
                }`}>
                  {/* Day number */}
                  <div className={`text-xs font-medium mb-1 ${
                    isToday ? 'text-blue-600 font-bold' :
                    isPast ? 'text-slate-300' :
                    'text-slate-600'
                  }`}>
                    {cell.getDate()}
                  </div>
                  {/* Event chips */}
                  <div className="space-y-0.5">
                    {dayEvents.map((ev, ei) => (
                      <div key={ei} className={`text-[10px] px-1 py-0.5 rounded border truncate leading-tight ${colorCls[ev.color]}`}>
                        {ev.label}
                        {ev.amount !== undefined && (
                          <span className="font-semibold"> ₪{Math.round(ev.amount).toLocaleString()}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Reminders() {
  const { savings, recurring, goals, transactions } = useStore();
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const today = now.getDate();
  const endDay = new Date(now.getTime() + 30 * 86400000);

  // ── Build calendar cells ──────────────────────────────────────────────────
  // Start from the Sunday of this week
  const startDay = new Date(now);
  startDay.setDate(now.getDate() - now.getDay());

  const cells: (Date | null)[] = [];
  const cur = new Date(startDay);
  while (cur <= endDay || cells.length % 7 !== 0) {
    cells.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }

  // ── Build events map ──────────────────────────────────────────────────────
  const events = new Map<string, CalEvent[]>();

  function addEvent(date: Date, ev: CalEvent) {
    const key = date.toISOString().slice(0, 10);
    const arr = events.get(key) ?? [];
    arr.push(ev);
    events.set(key, arr);
  }

  // Recurring charges — repeat each month
  for (const r of recurring.filter((r) => r.active)) {
    // Find all occurrences in the calendar window
    let m = new Date(startDay.getFullYear(), startDay.getMonth(), r.dayOfMonth);
    for (let i = 0; i < 3; i++) { // scan 3 months
      if (m >= startDay && m <= endDay) {
        addEvent(m, { label: r.name, amount: r.amount, color: 'blue', icon: 'charge' });
      }
      m = new Date(m.getFullYear(), m.getMonth() + 1, r.dayOfMonth);
    }
  }

  // Savings maturities
  for (const s of savings.filter((s) => s.open)) {
    const mat = new Date(s.maturityDate);
    mat.setHours(0, 0, 0, 0);
    if (mat >= startDay && mat <= endDay) {
      addEvent(mat, { label: `פירעון: ${s.name}`, amount: s.amount, color: 'amber', icon: 'savings' });
    }
  }

  // Budget overruns (mark as ongoing today)
  const month = now.toISOString().slice(0, 7);
  const monthTxns = transactions.filter((t) => t.date.startsWith(month));
  const spentByCat: Record<string, number> = {};
  for (const t of monthTxns) spentByCat[t.category] = (spentByCat[t.category] || 0) + t.amount;
  let overrunCount = 0;
  for (const g of goals) {
    if ((spentByCat[g.category] || 0) > g.targetAmount) overrunCount++;
  }

  // ── Non-calendar reminders ────────────────────────────────────────────────
  const alerts: { id: string; type: 'warning' | 'info' | 'danger'; title: string; body: string; link?: string }[] = [];

  for (const s of savings.filter((s) => s.open)) {
    const diff = (new Date(s.maturityDate).getTime() - now.getTime()) / (1000 * 86400);
    if (diff > 0 && diff <= 30)
      alerts.push({ id: `sav-${s.id}`, type: 'warning', title: `פיקדון פג בעוד ${Math.round(diff)} ימים — ${s.name}`, body: `הפיקדון ב${s.bank} (${fmtCurrency(s.amount)}) פג ב-${fmtDate(s.maturityDate)}` });
  }

  for (const r of recurring.filter((r) => r.active)) {
    if (r.dayOfMonth >= today && r.dayOfMonth <= today + 3)
      alerts.push({ id: `rec-${r.id}`, type: 'info', title: `חיוב קרוב ב-${r.dayOfMonth} — ${r.name}`, body: `${fmtCurrency(r.amount)} • ${r.card}` });
  }

  for (const g of goals) {
    const spent = spentByCat[g.category] || 0;
    if (spent > g.targetAmount)
      alerts.push({ id: `goal-${g.id}`, type: 'danger', title: `חריגה מיעד — ${g.category}`, body: `הוצאת ${fmtCurrency(spent)} מתוך יעד ${fmtCurrency(g.targetAmount)} (+${fmtCurrency(spent - g.targetAmount)})` });
  }

  const colorMap = { warning: 'bg-amber-50 border-amber-200', info: 'bg-blue-50 border-blue-200', danger: 'bg-red-50 border-red-200' };
  const textMap = { warning: 'text-amber-700', info: 'text-blue-700', danger: 'text-red-700' };
  const iconMap = { warning: AlertCircle, info: Bell, danger: AlertCircle };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">תזכורות ולוח שנה</h1>
          <p className="text-slate-500 text-sm">
            {alerts.filter((a) => a.type === 'danger').length} חריגות •{' '}
            {alerts.filter((a) => a.type === 'warning').length} אזהרות •{' '}
            {[...events.values()].flat().length} אירועים ב-30 ימים הבאים
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="text-sm text-slate-500">חריגות תקציב</div>
          <div className="text-2xl font-bold text-red-500">{overrunCount}</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">חיובים ב-30 יום</div>
          <div className="text-2xl font-bold text-blue-600">
            {fmtCurrency(
              recurring
                .filter((r) => r.active && r.dayOfMonth >= today && r.dayOfMonth <= today + 30)
                .reduce((a, r) => a + r.amount, 0)
            )}
          </div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">פיקדונות שפוגים</div>
          <div className="text-2xl font-bold text-amber-500">
            {savings.filter((s) => {
              const diff = (new Date(s.maturityDate).getTime() - now.getTime()) / (1000 * 86400);
              return s.open && diff > 0 && diff <= 30;
            }).length}
          </div>
        </Card>
      </div>

      {/* Alerts list */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a) => {
            const Icon = iconMap[a.type];
            return (
              <div key={a.id} className={`flex items-start gap-3 p-4 border rounded-xl ${colorMap[a.type]}`}>
                <Icon size={18} className={`shrink-0 mt-0.5 ${textMap[a.type]}`} />
                <div className="flex-1">
                  <div className={`font-semibold text-sm ${textMap[a.type]}`}>{a.title}</div>
                  <div className="text-sm text-slate-600 mt-0.5">{a.body}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 30-day calendar */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="font-semibold text-slate-900">לוח שנה — 30 ימים הבאים</div>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-blue-100 border border-blue-200 inline-block" />
              <CreditCard size={11} className="text-blue-600" /> חיוב קבוע
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-200 inline-block" />
              <Landmark size={11} className="text-amber-600" /> פירעון פיקדון
            </span>
          </div>
        </div>
        <CalendarGrid cells={cells} events={events} />
      </Card>

      {/* Periodic reminders */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">תזכורות קבועות</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { title: 'יבוא הוצאות חודשי', body: 'ייבא חיובי אשראי — ויזה כאל ומסטרקארד', link: '/expenses' },
            { title: 'עדכון הכנסות', body: 'עדכן הכנסות החודש כולל שכר ושכ"ד', link: '/income' },
            { title: 'הורד דוח גמל רבעוני', body: 'הורד דוח מקופות הגמל ועדכן יתרות', link: '/gemel' },
            { title: 'בדיקת מסלול פנסיה', body: 'בדיקה שנתית של מסלול ודמי ניהול', link: '/pension' },
          ].map((r) => (
            <a key={r.title} href={r.link}
              className="flex items-start gap-3 p-3.5 bg-slate-50 border border-slate-100 rounded-xl hover:bg-slate-100 transition-colors">
              <Bell size={16} className="text-slate-400 mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-medium text-slate-700">{r.title}</div>
                <div className="text-xs text-slate-400 mt-0.5">{r.body}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
