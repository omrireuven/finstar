import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useStore, usePortfolioSummary } from '../store';
import Card from '../components/common/Card';
import { fmtCurrency, currentMonthKey, fmtMonthYear } from '../utils/format';
import { AlertCircle, Calendar, ArrowLeft } from 'lucide-react';

function KPICard({ label, value, sub, color, accent, onClick }: {
  label: string; value: string; sub?: string; color: string; accent?: string; onClick?: () => void;
}) {
  return (
    <Card onClick={onClick} className="flex flex-col gap-1 relative overflow-hidden">
      {accent && (
        <div
          className="absolute top-0 right-0 w-1 h-full rounded-r-2xl"
          style={{ background: accent }}
        />
      )}
      <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </Card>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { transactions, savings, gemel, pension, income, recurring } = useStore();
  const { totalValue: portfolioValue } = usePortfolioSummary();

  const now = new Date();
  const month = currentMonthKey();
  const monthTxns = transactions.filter((t) => t.date.startsWith(month));
  const monthExpenses = monthTxns.reduce((a, t) => a + t.amount, 0);
  const monthIncome = income
    .filter((i) => i.date.startsWith(month))
    .reduce((a, i) => a + i.netAmount, 0);
  const cashFlow = monthIncome - monthExpenses;

  const totalSavings = savings.filter((s) => s.open).reduce((a, s) => a + s.amount, 0);
  const totalGemel = gemel.reduce((a, g) => a + g.balance, 0);
  const totalPension = pension.reduce((a, p) => a + p.balance, 0);
  const totalAssets = portfolioValue + totalSavings + totalGemel + totalPension;

  // Pie data
  const pieData = [
    { name: 'מניות', value: Math.round(portfolioValue), color: '#3b82f6' },
    { name: 'חסכונות', value: totalSavings, color: '#22c55e' },
    { name: 'גמל', value: totalGemel, color: '#f97316' },
    { name: 'פנסיה', value: totalPension, color: '#8b5cf6' },
  ].filter((d) => d.value > 0);

  // Category breakdown this month
  const byCat: Record<string, number> = {};
  for (const t of monthTxns) {
    byCat[t.category] = (byCat[t.category] || 0) + t.amount;
  }
  const topCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Health score
  const savingsRate = monthIncome > 0 ? (cashFlow / monthIncome) * 100 : 0;
  const healthScore = Math.min(100, Math.max(0, Math.round(40 + savingsRate * 0.6)));

  // Upcoming recurring
  const today = now.getDate();
  const upcoming = recurring
    .filter((r) => r.active && r.dayOfMonth >= today && r.dayOfMonth <= today + 7)
    .sort((a, b) => a.dayOfMonth - b.dayOfMonth);

  // Expiring savings
  const soon = savings.filter((s) => {
    if (!s.open) return false;
    const diff = (new Date(s.maturityDate).getTime() - now.getTime()) / (1000 * 86400);
    return diff > 0 && diff <= 30;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">שלום, {fmtMonthYear(now.getFullYear(), now.getMonth() + 1)}</h1>
        <p className="text-slate-500 text-sm">סקירה פיננסית כוללת</p>
      </div>

      {/* Alerts */}
      {(upcoming.length > 0 || soon.length > 0) && (
        <div className="flex flex-col gap-2 animate-slide-down">
          {soon.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-amber-800"
              style={{ background: 'linear-gradient(90deg,#fffbeb,#fef3c7)', border: '1px solid #fde68a' }}
            >
              <AlertCircle size={15} className="shrink-0 text-amber-500" />
              פיקדון <strong>{s.name}</strong> פג תוך פחות מ-30 יום ({s.bank})
            </div>
          ))}
          {upcoming.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-blue-800"
              style={{ background: 'linear-gradient(90deg,#eff6ff,#dbeafe)', border: '1px solid #bfdbfe' }}
            >
              <Calendar size={15} className="shrink-0 text-blue-500" />
              חיוב <strong>{r.name}</strong> — {fmtCurrency(r.amount)} ב-{r.dayOfMonth} לחודש
            </div>
          ))}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger">
        <KPICard label="סה״כ נכסים"  value={fmtCurrency(totalAssets)}              sub="לא כולל נדל״ן"           color="text-slate-900"                                           accent="#64748b" onClick={() => navigate('/stocks')} />
        <KPICard label="תיק מניות"   value={fmtCurrency(portfolioValue)}            sub="שווי שוק נוכחי"          color="text-blue-600"                                            accent="#3b82f6" onClick={() => navigate('/stocks')} />
        <KPICard label="תזרים החודש" value={(cashFlow >= 0 ? '+' : '') + fmtCurrency(cashFlow)} sub="הכנסות פחות הוצאות" color={cashFlow >= 0 ? 'text-green-600' : 'text-red-500'} accent={cashFlow >= 0 ? '#22c55e' : '#ef4444'} onClick={() => navigate('/expenses')} />
        <KPICard label="פנסיה וגמל"  value={fmtCurrency(totalPension + totalGemel)} sub="חיסכון ארוך טווח"        color="text-purple-600"                                          accent="#8b5cf6" onClick={() => navigate('/pension')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Allocation chart */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">התפלגות נכסים</h2>
            <span className="text-2xl font-bold text-slate-900">{fmtCurrency(totalAssets)}</span>
          </div>
          <div className="flex gap-8 items-center">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                  {pieData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v: unknown) => fmtCurrency(v as number)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-3">
              {pieData.map((d) => (
                <div key={d.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-sm text-slate-600">{d.name}</span>
                  <span className="text-sm font-medium text-slate-900 mr-auto pr-4">{fmtCurrency(d.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Health score */}
        <Card>
          <h2 className="font-semibold text-slate-900 mb-4">בריאות פיננסית</h2>
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-28 h-28">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" stroke="#e2e8f0" strokeWidth="12" />
                <circle
                  cx="50" cy="50" r="40" fill="none"
                  stroke={healthScore >= 75 ? '#22c55e' : healthScore >= 50 ? '#f59e0b' : '#ef4444'}
                  strokeWidth="12"
                  strokeDasharray={`${healthScore * 2.51} 251`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-3xl font-bold text-slate-900">{healthScore}</span>
              </div>
            </div>
            <div className="w-full space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">שיעור חיסכון</span>
                <span className="font-medium">{Math.round(savingsRate)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">הוצאות החודש</span>
                <span className="font-medium">{fmtCurrency(monthExpenses)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">הכנסות החודש</span>
                <span className="font-medium text-green-600">{fmtCurrency(monthIncome)}</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Top categories */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900">הוצאות לפי קטגוריה — {fmtMonthYear(now.getFullYear(), now.getMonth() + 1)}</h2>
          <button onClick={() => navigate('/expenses')} className="text-sm text-blue-600 flex items-center gap-1 hover:underline">
            כל ההוצאות <ArrowLeft size={14} />
          </button>
        </div>
        <div className="space-y-3">
          {topCats.map(([cat, amount]) => {
            const pct = monthExpenses > 0 ? (amount / monthExpenses) * 100 : 0;
            return (
              <div key={cat}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-700">{cat}</span>
                  <span className="font-medium text-slate-900">{fmtCurrency(amount)}</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#3b82f6,#6366f1)' }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
