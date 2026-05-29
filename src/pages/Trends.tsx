import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { useStore, useCategoryList, useCategoryColorMap } from '../store';
import Card from '../components/common/Card';
import { fmtCurrency, fmtMonthYear } from '../utils/format';

const MONTHS_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const MONTHS_SHORT = ['ינו', 'פב', 'מר', 'אפ', 'מא', 'יוני', 'יולי', 'אוג', 'ספ', 'אוק', 'נוב', 'דצ'];

function scoreColor(score: number) {
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#f59e0b';
  return '#ef4444';
}

export default function Trends() {
  const { transactions, income, goals, journal } = useStore();
  const categoryList = useCategoryList();
  const catColors = useCategoryColorMap();

  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  // ── Journal helpers ──────────────────────────────────────────────────────
  const yearEntries = journal.filter((e) => e.year === year);
  const getEntry = (m: number) => yearEntries.find((e) => e.month === m);

  function liveMetrics(month: number) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const txns = transactions.filter((t) => t.date.startsWith(key));
    const inc = income.filter((e) => e.date.startsWith(key));
    const totalExpenses = txns.reduce((a, t) => a + t.amount, 0);
    const totalIncome = inc.reduce((a, e) => a + e.netAmount, 0);
    const saved = totalIncome - totalExpenses;
    const spentByCat: Record<string, number> = {};
    for (const t of txns) spentByCat[t.category] = (spentByCat[t.category] || 0) + t.amount;
    const totalGoals = goals.length;
    const goalsAchieved = goals.filter((g) => (spentByCat[g.category] ?? 0) <= g.targetAmount).length;
    return { totalExpenses, totalIncome, saved, totalGoals, goalsAchieved, spentByCat, txns };
  }

  function deleteEntry(month: number) {
    useStore.setState((s) => ({
      journal: s.journal.filter((e) => !(e.year === year && e.month === month)),
    }));
  }

  // ── Annual chart data ────────────────────────────────────────────────────
  const totalBudget = goals.reduce((a, g) => a + g.targetAmount, 0);

  const monthlyData = MONTHS_SHORT.map((label, i) => {
    const month = i + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const expenses = transactions.filter((t) => t.date.startsWith(key)).reduce((a, t) => a + t.amount, 0);
    const monthIncome = income.filter((e) => e.date.startsWith(key)).reduce((a, e) => a + e.netAmount, 0);
    return { month: label, הוצאות: expenses, הכנסות: monthIncome, יעד: totalBudget };
  });

  const catData = MONTHS_SHORT.map((label, i) => {
    const month = i + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const txns = transactions.filter((t) => t.date.startsWith(key));
    const entry: Record<string, number | string> = { month: label };
    for (const cat of categoryList) {
      entry[cat] = txns.filter((t) => t.category === cat).reduce((a, t) => a + t.amount, 0);
    }
    return entry;
  });

  const totalExpenses = transactions.filter((t) => t.date.startsWith(String(year))).reduce((a, t) => a + t.amount, 0);
  const totalIncome = income.filter((e) => e.date.startsWith(String(year))).reduce((a, e) => a + e.netAmount, 0);
  const annualNet = totalIncome - totalExpenses;
  const peakMonth = monthlyData.reduce((max, m) => m.הוצאות > max.הוצאות ? m : max, monthlyData[0]);

  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">ניתוח מגמות שנתי</h1>
          <p className="text-slate-500 text-sm">סקירה חודשית, יומן פיננסי וגרפים</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setYear(y => y - 1); setSelectedMonth(null); }}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50"
          >‹</button>
          <span className="font-medium text-slate-700 w-12 text-center">{year}</span>
          <button
            onClick={() => { setYear(y => y + 1); setSelectedMonth(null); }}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50"
          >›</button>
        </div>
      </div>

      {/* ── Annual KPI cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="text-sm text-slate-500">סה"כ הוצאות {year}</div>
          {totalExpenses === 0 ? (
            <div className="text-2xl font-bold text-slate-300">—</div>
          ) : (
            <div className="text-2xl font-bold text-red-500">{fmtCurrency(totalExpenses)}</div>
          )}
        </Card>
        <Card>
          <div className="text-sm text-slate-500">
            {annualNet < 0 ? 'גירעון שנתי' : 'חיסכון שנתי'}
          </div>
          {totalIncome === 0 && totalExpenses === 0 ? (
            <div className="text-2xl font-bold text-slate-300">—</div>
          ) : (
            <div className={`text-2xl font-bold ${annualNet >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {fmtCurrency(Math.abs(annualNet))}
            </div>
          )}
        </Card>
        <Card>
          <div className="text-sm text-slate-500">חודש שיא הוצאות</div>
          {totalExpenses === 0 ? (
            <div className="text-2xl font-bold text-slate-300">—</div>
          ) : (
            <>
              <div className="text-2xl font-bold text-slate-900">{peakMonth.month}</div>
              <div className="text-xs text-slate-400">{fmtCurrency(peakMonth.הוצאות)}</div>
            </>
          )}
        </Card>
      </div>

      {/* ── 12-month grid ───────────────────────────────────────────────── */}
      <div>
        <h2 className="font-semibold text-slate-700 text-sm mb-3">לחץ על חודש לפירוט</h2>
        <div className="grid grid-cols-4 lg:grid-cols-6 gap-3">
          {MONTHS_HE.map((label, i) => {
            const month = i + 1;
            const entry = getEntry(month);
            const key = `${year}-${String(month).padStart(2, '0')}`;
            const spent = transactions.filter((t) => t.date.startsWith(key)).reduce((a, t) => a + t.amount, 0);
            const isSelected = selectedMonth === month;
            const score = entry?.score ?? null;
            const hasData = spent > 0 || !!entry;
            const isFuture = new Date(year, month - 1) > new Date();

            return (
              <button
                key={month}
                onClick={() => setSelectedMonth(isSelected ? null : month)}
                className={`rounded-xl p-4 text-center transition-all border-2 ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-transparent bg-white hover:border-slate-200 shadow-sm'
                } ${isFuture ? 'opacity-40' : ''} ${!hasData && !isFuture ? 'opacity-30' : ''}`}
              >
                <div className="text-sm font-medium text-slate-700">{label}</div>
                {score !== null ? (
                  <>
                    <div className="text-2xl font-bold mt-1" style={{ color: scoreColor(score) }}>{score}</div>
                    <div className="text-xs text-slate-400 mt-1">{spent > 0 ? fmtCurrency(spent) : '—'}</div>
                  </>
                ) : spent > 0 ? (
                  <>
                    <div className="text-lg font-bold mt-1 text-slate-700">{fmtCurrency(spent)}</div>
                    <div className="text-xs text-slate-400 mt-1">הוצאות</div>
                  </>
                ) : (
                  <div className="text-slate-300 text-sm mt-2">—</div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Selected month detail ────────────────────────────────────────── */}
      {selectedMonth && (() => {
        const entry = getEntry(selectedMonth);
        const { totalExpenses: mExp, totalIncome: mInc, saved, totalGoals, goalsAchieved, spentByCat, txns } = liveMetrics(selectedMonth);
        const hasAnyData = mExp > 0 || mInc > 0;

        if (!hasAnyData && !entry) {
          return (
            <Card className="text-center py-12">
              <div className="text-slate-400 text-lg mb-2">אין נתונים ל{MONTHS_HE[selectedMonth - 1]}</div>
              <p className="text-sm text-slate-500">הוסף הכנסות והוצאות לחודש זה כדי לראות ניתוח</p>
            </Card>
          );
        }

        return (
          <div className="space-y-4">
            {/* Journal score + narrative card */}
            {entry && (
              <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white border-0">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="text-slate-400 text-sm">{fmtMonthYear(year, selectedMonth)}</div>
                    <div className="text-5xl font-bold mt-1" style={{ color: scoreColor(entry.score) }}>{entry.score}</div>
                    <div className="text-slate-400 text-sm mt-1">ציון בריאות פיננסית</div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex gap-1.5 flex-wrap justify-end max-w-32">
                      {Array.from({ length: goalsAchieved }).map((_, i) => (
                        <div key={`ok-${i}`} className="w-3 h-3 rounded-full bg-green-400" />
                      ))}
                      {Array.from({ length: Math.max(0, totalGoals - goalsAchieved) }).map((_, i) => (
                        <div key={`ko-${i}`} className="w-3 h-3 rounded-full bg-red-400" />
                      ))}
                    </div>
                    <button
                      onClick={() => deleteEntry(selectedMonth)}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-400 mt-2"
                    >
                      <Trash2 size={12} /> מחק רשומה
                    </button>
                  </div>
                </div>
                <p className="text-slate-300 leading-relaxed">{entry.narrative}</p>
              </Card>
            )}

            {/* Month KPI cards */}
            <div className="grid grid-cols-4 gap-4">
              <Card>
                <div className="text-sm text-slate-500">סה"כ הוצאות</div>
                <div className="text-xl font-bold text-red-500">{fmtCurrency(mExp)}</div>
              </Card>
              <Card>
                <div className="text-sm text-slate-500">סה"כ הכנסות</div>
                <div className="text-xl font-bold text-green-600">{fmtCurrency(mInc)}</div>
              </Card>
              <Card>
                <div className="text-sm text-slate-500">נחסך</div>
                <div className={`text-xl font-bold ${saved >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                  {saved >= 0 ? '' : '-'}{fmtCurrency(Math.abs(saved))}
                </div>
              </Card>
              <Card>
                <div className="text-sm text-slate-500">יעדים שהושגו</div>
                <div className="text-xl font-bold text-amber-500">
                  {totalGoals > 0 ? `${goalsAchieved}/${totalGoals}` : '—'}
                </div>
              </Card>
            </div>

            {/* Category breakdown */}
            {txns.length > 0 && (() => {
              const total = Object.values(spentByCat).reduce((a, b) => a + b, 0);
              return (
                <Card>
                  <h3 className="font-semibold text-slate-900 mb-4">
                    הוצאות לפי קטגוריה — {MONTHS_HE[selectedMonth - 1]} {year}
                  </h3>
                  <div className="space-y-2">
                    {Object.entries(spentByCat).sort((a, b) => b[1] - a[1]).map(([cat, amount]) => {
                      const goal = goals.find((g) => g.category === cat);
                      const pct = total > 0 ? (amount / total) * 100 : 0;
                      const color = catColors[cat] ?? '#9ca3af';
                      const isOver = goal && amount > goal.targetAmount;
                      return (
                        <div key={cat}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                              <span className="text-slate-700">{cat}</span>
                              {isOver && <span className="text-xs text-red-500">חריגה</span>}
                            </span>
                            <span className="font-medium text-slate-900">
                              {fmtCurrency(amount)}
                              {goal && (
                                <span className="text-slate-400 font-normal mr-1">
                                  / {fmtCurrency(goal.targetAmount)}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, backgroundColor: isOver ? '#ef4444' : color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })()}
          </div>
        );
      })()}

      {/* ── Annual charts ────────────────────────────────────────────────── */}
      <Card>
        <h2 className="font-semibold text-slate-900 mb-4">הוצאות vs הכנסות לאורך השנה</h2>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v: unknown) => fmtCurrency(v as number)} />
            <Legend />
            <Line type="monotone" dataKey="הכנסות" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="הוצאות" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="יעד" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <h2 className="font-semibold text-slate-900 mb-4">פירוט קטגוריות לפי חודש</h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={catData}>
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v: unknown) => fmtCurrency(v as number)} />
            <Legend />
            {categoryList
              .filter((c) => catData.some((d) => (d[c] as number) > 0))
              .map((cat) => (
                <Bar key={cat} dataKey={cat} stackId="a" fill={catColors[cat] ?? '#9ca3af'} />
              ))}
          </BarChart>
        </ResponsiveContainer>
      </Card>

    </div>
  );
}
