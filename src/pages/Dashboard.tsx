import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Legend } from 'recharts';
import { useStore, usePortfolioSummary, useCategoryColorMap } from '../store';
import { useSettings } from '../store/settingsStore';
import { useHistoryCache, getCached } from '../store/historyCache';
import { fetchHistory } from '../lib/yahooFinance';
import Card from '../components/common/Card';
import { fmtCurrency, currentMonthKey, fmtMonthYear, fmtDate, fmt } from '../utils/format';
import { AlertCircle, Calendar, ArrowLeft, X } from 'lucide-react';

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
  const [openCat, setOpenCat] = useState<string | null>(null);
  const { transactions, savings, hishtalmut, gemel, pension, income, recurring, lots, prices, usdIls } = useStore();
  const { corsProxy } = useSettings();
  const colorMap = useCategoryColorMap();
  const { totalValue: portfolioValue, rows: portfolioRows, totalNativeUSD, totalNativeILS } = usePortfolioSummary();

  // ── Portfolio return calculations ──────────────────────────────────────────
  // Subscribe so we re-render when Stocks page (or below effect) loads history.
  const historyEntries = useHistoryCache((s) => s.entries);

  // Pre-fetch 6mo history for each unique ticker if not already cached.
  useEffect(() => {
    const tickers = [...new Set(lots.filter((l) => !l.sellDate).map((l) => l.ticker))];
    const { setEntry } = useHistoryCache.getState();
    for (const ticker of tickers) {
      const key = `${ticker}:6mo`;
      if (!getCached(key)) {
        fetchHistory(ticker, corsProxy, '6mo').then((data) => {
          if (data.length > 0) setEntry(key, data);
        }).catch(() => {});
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lots.length, corsProxy]);

  /**
   * Returns the portfolio's % change since `daysAgo` days ago.
   * Only considers lots that existed at the target date.
   * Returns null if history isn't cached yet for any ticker.
   */
  const portfolioReturnSince = useMemo(() => {
    return (daysAgo: number): number | null => {
      const target = new Date();
      target.setDate(target.getDate() - daysAgo);
      const targetStr = target.toISOString().slice(0, 10);

      const relevantLots = lots.filter((l) => !l.sellDate && l.buyDate <= targetStr);
      if (relevantLots.length === 0) return null;

      let pastValue = 0;
      let curValue  = 0;

      for (const lot of relevantLots) {
        const rate  = lot.currency === 'USD' ? usdIls : 1;
        const curPx = prices[lot.ticker];
        if (!curPx) return null;

        const history = getCached(`${lot.ticker}:6mo`) ?? getCached(`${lot.ticker}:1y`);
        if (!history || history.length === 0) return null;

        // Last close at or before target date
        const pastPt = [...history].sort((a, b) => a.date.localeCompare(b.date)).filter((p) => p.date <= targetStr).pop();
        if (!pastPt) return null;

        pastValue += lot.quantity * pastPt.close * rate;
        curValue  += lot.quantity * curPx * rate;
      }

      if (pastValue === 0) return null;
      return ((curValue - pastValue) / pastValue) * 100;
    };
  // Re-run when cache entries change (reactive to fetched history)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lots, prices, usdIls, historyEntries]);

  const weeklyReturn     = portfolioReturnSince(7);
  const monthlyReturn    = portfolioReturnSince(30);
  const semiAnnualReturn = portfolioReturnSince(180);

  const now = new Date();
  const month = currentMonthKey();
  const monthTxns = transactions.filter((t) => t.date.startsWith(month));
  const monthExpenses = monthTxns.reduce((a, t) => a + t.amount, 0);
  const monthIncome = income
    .filter((i) => i.date.startsWith(month))
    .reduce((a, i) => a + i.netAmount, 0);
  const cashFlow = monthIncome - monthExpenses;

  const totalSavings = savings.filter((s) => s.open).reduce((a, s) => a + s.amount, 0);
  const totalHishtalmut = hishtalmut.reduce((a, h) => a + h.balance, 0);
  const totalGemel = gemel.reduce((a, g) => a + g.balance, 0);
  const totalPension = pension.reduce((a, p) => a + p.balance, 0);
  const totalAssets = portfolioValue + totalSavings + totalHishtalmut + totalGemel + totalPension;

  const liquidPieData = [
    { name: 'מניות', value: Math.round(portfolioValue), color: '#3b82f6' },
    { name: 'פיקדונות', value: totalSavings, color: '#22c55e' },
    { name: 'השתלמות', value: totalHishtalmut, color: '#14b8a6' },
  ].filter((d) => d.value > 0);
  const totalLiquid = Math.round(portfolioValue) + totalSavings + totalHishtalmut;

  const pensionPieData = [
    { name: 'גמל', value: totalGemel, color: '#f97316' },
    { name: 'פנסיה', value: totalPension, color: '#8b5cf6' },
  ].filter((d) => d.value > 0);
  const totalPensionAssets = totalGemel + totalPension;

  // Category breakdown this month — all categories, sorted desc
  const byCat: Record<string, number> = {};
  for (const t of monthTxns) {
    byCat[t.category] = (byCat[t.category] || 0) + t.amount;
  }
  const allCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  // Portfolio timeline
  const portfolioTimeline = (() => {
    const openLots = lots.filter((l) => !l.sellDate).sort((a, b) => a.buyDate.localeCompare(b.buyDate));
    if (openLots.length === 0) return [];
    const firstMonth = openLots[0].buyDate.slice(0, 7);
    const todayMonth = new Date().toISOString().slice(0, 7);
    const allMonths: string[] = [];
    let d = new Date(firstMonth + '-01');
    const end = new Date(todayMonth + '-01');
    while (d <= end) {
      allMonths.push(d.toISOString().slice(0, 7));
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
    return allMonths.map((m) => {
      const bought = openLots.filter((l) => l.buyDate.slice(0, 7) <= m);
      const rate = (l: (typeof openLots)[0]) => l.currency === 'USD' ? usdIls : 1;
      const cost  = bought.reduce((s, l) => s + (l.quantity * l.buyPrice + l.commission) * rate(l), 0);
      const value = bought.reduce((s, l) => s + l.quantity * (prices[l.ticker] ?? l.buyPrice) * rate(l), 0);
      return { label: m.slice(2).replace('-', '/'), 'עלות': Math.round(cost), 'שווי': Math.round(value) };
    });
  })();

  // Per-stock returns sorted best → worst
  const stockReturns = [...portfolioRows]
    .filter((r) => r.currentValueILS > 0)
    .sort((a, b) => b.pnlPct - a.pnlPct)
    .map((r) => ({ ticker: r.ticker, pnlPct: +r.pnlPct.toFixed(1), pnlILS: Math.round(r.pnlILS) }));
  const totalPnl = portfolioRows.reduce((a, r) => a + r.pnlILS, 0);

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

  const getGreeting = () => {
    const hour = now.getHours();
    if (hour >= 5 && hour < 12) return 'בוקר טוב';
    if (hour >= 12 && hour < 17) return 'צהריים טובים';
    if (hour >= 17 && hour < 21) return 'ערב טוב';
    return 'לילה טוב';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{getGreeting()}, עומרי ראובן 👋</h1>
        <p className="text-slate-500 text-sm">סקירה פיננסית כוללת לחודש {fmtMonthYear(now.getFullYear(), now.getMonth() + 1)}</p>
      </div>

      {/* Alerts */}
      {(upcoming.length > 0 || soon.length > 0) && (
        <div className="flex flex-col gap-2 animate-slide-down">
          {soon.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-amber-800"
              style={{ background: 'linear-gradient(90deg,#fffbeb,#fef3c7)', border: '1px solid #fde68a' }}>
              <AlertCircle size={15} className="shrink-0 text-amber-500" />
              פיקדון <strong>{s.name}</strong> פג תוך פחות מ-30 יום ({s.bank})
            </div>
          ))}
          {upcoming.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-blue-800"
              style={{ background: 'linear-gradient(90deg,#eff6ff,#dbeafe)', border: '1px solid #bfdbfe' }}>
              <Calendar size={15} className="shrink-0 text-blue-500" />
              חיוב <strong>{r.name}</strong> — {fmtCurrency(r.amount)} ב-{r.dayOfMonth} לחודש
            </div>
          ))}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger">
        <KPICard label="סה״כ נכסים"  value={fmtCurrency(totalAssets)}              sub="לא כולל נדל״ן"           color="text-slate-900"                                           accent="#64748b" onClick={() => navigate('/stocks')} />
        <Card onClick={() => navigate('/stocks')} className="flex flex-col gap-1 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-1 h-full rounded-r-2xl bg-blue-500" />
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">תיק מניות</div>
          <div className="flex items-baseline gap-2 flex-wrap">
            {totalNativeUSD > 0 && <span className="text-2xl font-bold text-blue-600">${fmt(totalNativeUSD, 0)}</span>}
            {totalNativeILS > 0 && <span className={`font-bold text-blue-600 ${totalNativeUSD > 0 ? 'text-lg' : 'text-2xl'}`}>{fmtCurrency(totalNativeILS)}</span>}
            {totalNativeUSD === 0 && totalNativeILS === 0 && <span className="text-2xl font-bold text-blue-600">{fmtCurrency(portfolioValue)}</span>}
          </div>
          <div className="text-xs text-slate-400">
            {totalNativeUSD > 0 ? <>≈ {fmtCurrency(portfolioValue)} • 1$ = ₪{fmt(usdIls, 2)}</> : 'שווי שוק נוכחי'}
          </div>
        </Card>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Liquid */}
            <div>
              <div className="text-sm font-medium text-slate-500 mb-2 border-b pb-2">
                נכסים נזילים <span className="text-slate-900 font-semibold">{fmtCurrency(totalLiquid)}</span>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 items-center mt-4">
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie data={liquidPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                      {liquidPieData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: unknown) => fmtCurrency(v as number)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2 flex-1 w-full">
                  {liquidPieData.map((d) => (
                    <div key={d.name} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                      <span className="text-sm text-slate-600">{d.name}</span>
                      <span className="text-sm font-medium text-slate-900 mr-auto">{fmtCurrency(d.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Pension */}
            <div>
              <div className="text-sm font-medium text-slate-500 mb-2 border-b pb-2">
                כספים פנסיונים <span className="text-slate-900 font-semibold">{fmtCurrency(totalPensionAssets)}</span>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 items-center mt-4">
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie data={pensionPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                      {pensionPieData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: unknown) => fmtCurrency(v as number)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2 flex-1 w-full">
                  {pensionPieData.map((d) => (
                    <div key={d.name} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                      <span className="text-sm text-slate-600">{d.name}</span>
                      <span className="text-sm font-medium text-slate-900 mr-auto">{fmtCurrency(d.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
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
                <circle cx="50" cy="50" r="40" fill="none"
                  stroke={healthScore >= 75 ? '#22c55e' : healthScore >= 50 ? '#f59e0b' : '#ef4444'}
                  strokeWidth="12" strokeDasharray={`${healthScore * 2.51} 251`} strokeLinecap="round" />
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

      {/* Portfolio timeline + per-stock returns */}
      {(portfolioTimeline.length > 1 || stockReturns.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {portfolioTimeline.length > 1 && (
            <Card className="lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-slate-900">ביצועי תיק לאורך זמן</h2>
                <button onClick={() => navigate('/stocks')} className="text-sm text-blue-600 flex items-center gap-1 hover:underline">לתיק <ArrowLeft size={14} /></button>
              </div>

              <div className="flex gap-4 items-stretch">
                {/* Chart */}
                <div className="flex-1 min-w-0">
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={portfolioTimeline}>
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={Math.max(0, Math.floor(portfolioTimeline.length / 6) - 1)} />
                      <YAxis tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} width={48} />
                      <Tooltip formatter={(v: unknown) => fmtCurrency(v as number)} />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                      <Area type="monotone" dataKey="עלות" stroke="#94a3b8" fill="#f1f5f9" strokeWidth={1.5} />
                      <Area type="monotone" dataKey="שווי" stroke="#3b82f6" fill="#dbeafe50" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Return chips — stacked vertically */}
                <div className="flex flex-col gap-2 justify-center shrink-0 w-28">
                  {(
                    [
                      { label: 'שבועי',   value: weeklyReturn },
                      { label: 'חודשי',   value: monthlyReturn },
                      { label: 'חצי שנה', value: semiAnnualReturn },
                    ] as { label: string; value: number | null }[]
                  ).map(({ label, value }) => {
                    const positive = value !== null && value >= 0;
                    const color    = value === null ? 'text-slate-400' : positive ? 'text-green-600' : 'text-red-500';
                    const bg       = value === null ? 'bg-slate-50' : positive ? 'bg-green-50' : 'bg-red-50';
                    const border   = value === null ? 'border-slate-200' : positive ? 'border-green-200' : 'border-red-200';
                    const display  = value === null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
                    return (
                      <div key={label} className={`rounded-xl border px-3 py-2.5 ${bg} ${border} text-center`}>
                        <div className="text-xs text-slate-500 mb-0.5">{label}</div>
                        <div className={`text-sm font-bold ${color}`}>{display}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          )}

          {stockReturns.length > 0 && (
            <Card className={portfolioTimeline.length > 1 ? '' : 'lg:col-span-3'}>
              <h2 className="font-semibold text-slate-900 mb-4">תשואה לפי מניה</h2>
              <div className="space-y-3">
                {stockReturns.map((s) => {
                  const positive = s.pnlPct >= 0;
                  const barW = Math.min(100, Math.abs(s.pnlPct) * 2);
                  return (
                    <div key={s.ticker} className="flex items-center gap-3">
                      <span className="w-14 font-mono text-sm font-medium text-slate-700 shrink-0">{s.ticker}</span>
                      <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${positive ? 'bg-green-400' : 'bg-red-400'}`} style={{ width: `${barW}%` }} />
                      </div>
                      <span className={`w-12 text-sm font-semibold text-left shrink-0 ${positive ? 'text-green-600' : 'text-red-500'}`}>
                        {positive ? '+' : ''}{s.pnlPct}%
                      </span>
                      <span className={`w-20 text-sm text-left shrink-0 ${positive ? 'text-green-600' : 'text-red-400'}`}>
                        {positive ? '+' : ''}{fmtCurrency(s.pnlILS)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between text-sm">
                <span className="text-slate-500">סה"כ</span>
                <span className={`font-bold ${totalPnl >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {totalPnl >= 0 ? '+' : ''}{fmtCurrency(totalPnl)}
                </span>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Category breakdown */}
      <Card>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-slate-900">הוצאות לפי קטגוריה — {fmtMonthYear(now.getFullYear(), now.getMonth() + 1)}</h2>
          <button onClick={() => navigate('/expenses')} className="text-sm text-blue-600 flex items-center gap-1 hover:underline">
            כל ההוצאות <ArrowLeft size={14} />
          </button>
        </div>

        {allCats.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">אין הוצאות החודש</div>
        ) : (
          <>
            {/* Stacked bar */}
            <div className="flex w-full h-7 rounded-xl overflow-hidden mb-5 gap-px">
              {allCats.map(([cat, amount]) => {
                const pct = monthExpenses > 0 ? (amount / monthExpenses) * 100 : 0;
                return (
                  <div key={cat} title={`${cat}: ${fmtCurrency(amount)} (${Math.round(pct)}%)`}
                    className="h-full transition-all duration-700 cursor-default"
                    style={{ width: `${pct}%`, backgroundColor: colorMap[cat] ?? '#9ca3af', minWidth: pct > 1 ? undefined : 0 }} />
                );
              })}
            </div>

            {/* Category rows — clickable */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
              {allCats.map(([cat, amount]) => {
                const pct = monthExpenses > 0 ? (amount / monthExpenses) * 100 : 0;
                const color = colorMap[cat] ?? '#9ca3af';
                const isOpen = openCat === cat;
                return (
                  <button key={cat} onClick={() => setOpenCat(isOpen ? null : cat)}
                    className={`flex items-center gap-3 min-w-0 px-2 py-1.5 rounded-lg text-right transition-colors border ${
                      isOpen ? 'border-slate-200 bg-slate-50' : 'border-transparent hover:bg-slate-50'}`}>
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-sm text-slate-600 flex-1 truncate">{cat}</span>
                    <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden shrink-0">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                    <span className="text-xs text-slate-400 w-8 text-left shrink-0">{Math.round(pct)}%</span>
                    <span className="text-sm font-semibold text-slate-900 w-24 text-left shrink-0">{fmtCurrency(amount)}</span>
                  </button>
                );
              })}
            </div>

            {/* Drill-down panel */}
            {openCat && (() => {
              const catTxns = monthTxns.filter((t) => (t.categoryOverride || t.category) === openCat).sort((a, b) => b.date.localeCompare(a.date));
              const catTotal = catTxns.reduce((s, t) => s + t.amount, 0);
              const color = colorMap[openCat] ?? '#9ca3af';
              return (
                <div className="mt-4 rounded-xl border border-slate-200 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                      <span className="text-sm font-semibold text-slate-700">{openCat}</span>
                      <span className="text-xs text-slate-400">{catTxns.length} עסקאות</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-slate-900">{fmtCurrency(catTotal)}</span>
                      <button onClick={() => setOpenCat(null)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {catTxns.map((t) => (
                      <div key={t.id} className="flex items-center gap-4 px-4 py-2 text-sm hover:bg-slate-50">
                        <span className="text-slate-400 shrink-0 w-20">{fmtDate(t.date)}</span>
                        <span className="flex-1 text-slate-700 truncate">{t.business}</span>
                        {t.notes && <span className="text-slate-400 truncate max-w-32 hidden sm:block">{t.notes}</span>}
                        <span className="font-semibold text-slate-900 shrink-0">{fmtCurrency(t.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Total */}
            <div className="mt-5 pt-4 border-t border-slate-100 flex justify-between items-center">
              <span className="text-sm text-slate-500">{allCats.length} קטגוריות</span>
              <span className="text-base font-bold text-slate-900">סה"כ {fmtCurrency(monthExpenses)}</span>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
