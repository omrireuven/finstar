/**
 * Off-screen chart component used to generate a portfolio screenshot for Telegram.
 * Rendered hidden in Settings, captured with html2canvas, then sent via sendPhoto.
 */
import { useEffect, useState, forwardRef } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useStore, usePortfolioSummary } from '../../store';
import { useSettings } from '../../store/settingsStore';
import { getCached } from '../../store/historyCache';
import { fetchHistory } from '../../lib/yahooFinance';
import { fmtCurrency } from '../../utils/format';
import type { HistoricalPoint } from '../../lib/yahooFinance';
import type { PortfolioLot } from '../../types';

function buildTimeline(
  allHistory: Map<string, HistoricalPoint[]>,
  lots: PortfolioLot[],
  usdIls: number,
): { date: string; value: number }[] {
  if (allHistory.size === 0) return [];
  const priceMaps = new Map<string, Map<string, number>>();
  for (const [ticker, history] of allHistory) {
    const m = new Map<string, number>();
    for (const pt of history) m.set(pt.date, pt.close);
    priceMaps.set(ticker, m);
  }
  const allDates = [
    ...new Set([...allHistory.values()].flatMap((h) => h.map((p) => p.date))),
  ].sort();
  const activeLots = lots.filter((l) => !l.sellDate);
  return allDates
    .map((date) => {
      let value = 0;
      for (const lot of activeLots) {
        if (lot.buyDate > date) continue;
        const pm = priceMaps.get(lot.ticker);
        if (!pm) continue;
        const price = pm.get(date);
        if (price === undefined) continue;
        value += lot.quantity * price * (lot.currency === 'USD' ? usdIls : 1);
      }
      return { date: date.slice(5), value: Math.round(value) };
    })
    .filter((d) => d.value > 0);
}

interface Props {
  onReady: () => void;
  onError: () => void;
}

const PortfolioChartCapture = forwardRef<HTMLDivElement, Props>(
  ({ onReady, onError }, ref) => {
    const { lots, usdIls } = useStore();
    const { rows } = usePortfolioSummary();
    const { corsProxy } = useSettings();
    const [timeline, setTimeline] = useState<{ date: string; value: number }[]>([]);
    const [ready, setReady] = useState(false);

    const tickers = [...new Set(lots.filter((l) => !l.sellDate).map((l) => l.ticker))];
    const totalCost = rows.reduce((a, r) => a + r.costNative * (r.currency === 'USD' ? usdIls : 1), 0);
    const totalValue = timeline.length > 0 ? timeline[timeline.length - 1].value : 0;
    const isAboveCost = totalValue >= totalCost;
    const pnlPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;
    const date = new Date().toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });

    useEffect(() => {
      if (tickers.length === 0) { onError(); return; }

      async function load() {
        const allHistory = new Map<string, HistoricalPoint[]>();
        await Promise.all(
          tickers.map(async (ticker) => {
            const cached = getCached(`${ticker}:3mo`);
            if (cached) {
              allHistory.set(ticker, cached);
            } else {
              try {
                const data = await fetchHistory(ticker, corsProxy, '3mo');
                if (data.length > 0) allHistory.set(ticker, data);
              } catch { /* skip */ }
            }
          })
        );
        const tl = buildTimeline(allHistory, lots, usdIls);
        if (tl.length < 2) { onError(); return; }
        setTimeline(tl);
        // Give recharts a tick to render
        setTimeout(() => setReady(true), 400);
      }
      load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      if (ready) onReady();
    }, [ready, onReady]);

    return (
      <div
        ref={ref}
        style={{
          position: 'fixed',
          top: -9999,
          left: -9999,
          width: 800,
          height: 400,
          background: '#ffffff',
          fontFamily: 'system-ui, sans-serif',
          direction: 'rtl',
          padding: '24px 24px 16px',
          boxSizing: 'border-box',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>ביצועי תיק מניות</div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{date} | 3 חודשים אחרונים</div>
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>{fmtCurrency(totalValue)}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: isAboveCost ? '#16a34a' : '#dc2626', marginTop: 2 }}>
              {isAboveCost ? '▲' : '▼'} {isAboveCost ? '+' : ''}{pnlPct.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Chart */}
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timeline} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="captureGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isAboveCost ? '#10b981' : '#ef4444'} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={isAboveCost ? '#10b981' : '#ef4444'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false}
                width={65} tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}k`} domain={['auto', 'auto']} />
              <Tooltip formatter={(v: unknown) => [fmtCurrency(v as number), 'שווי תיק']}
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
              <ReferenceLine y={totalCost} stroke="#94a3b8" strokeDasharray="6 3"
                label={{ value: `עלות ${fmtCurrency(totalCost)}`, position: 'insideTopRight', fontSize: 11, fill: '#94a3b8' }} />
              <Area type="monotone" dataKey="value"
                stroke={isAboveCost ? '#10b981' : '#ef4444'} strokeWidth={2}
                fill="url(#captureGrad)" dot={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Footer branding */}
        <div style={{ fontSize: 11, color: '#cbd5e1', textAlign: 'center', marginTop: 8 }}>
          Finstar • 1$ = ₪{usdIls.toFixed(2)}
        </div>
      </div>
    );
  }
);

PortfolioChartCapture.displayName = 'PortfolioChartCapture';
export default PortfolioChartCapture;
