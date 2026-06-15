import { useState, useEffect, useMemo, useCallback, type ReactElement } from 'react';
import {
  Plus, TrendingUp, TrendingDown, RefreshCw, Loader2, Database,
  ShoppingBag, BadgeDollarSign, Pencil,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useStore, usePortfolioSummary } from '../store';
import { useSettings } from '../store/settingsStore';
import { useHistoryCache, getCached } from '../store/historyCache';
import { fetchQuotes, fetchHistory } from '../lib/yahooFinance';
import type { HistoricalPoint } from '../lib/yahooFinance';
import { useStockSync } from '../hooks/useStockSync';
import Card from '../components/common/Card';
import Modal from '../components/common/Modal';
import { fmtCurrency, fmt } from '../utils/format';
import type { PortfolioLot } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTORS = ['טכנולוגיה', 'ETF', 'ETF מקומי', 'פיננסים', 'בריאות', 'אנרגיה', 'תחבורה', 'אחר'];
type Range = '1mo' | '3mo' | '6mo' | '1y';
const RANGES: { key: Range; label: string }[] = [
  { key: '1mo', label: 'חודש' },
  { key: '3mo', label: '3 חד׳' },
  { key: '6mo', label: '6 חד׳' },
  { key: '1y', label: 'שנה' },
];

// ─── Sparkline SVG ────────────────────────────────────────────────────────────

function Sparkline({ points, positive }: { points: number[]; positive: boolean }) {
  if (points.length < 2) return <div className="w-20 h-8" />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const W = 80, H = 32;
  const pts = points
    .map((v, i) => `${(i / (points.length - 1)) * W},${H - ((v - min) / span) * (H - 4) - 2}`)
    .join(' ');
  return (
    <svg width={W} height={H} className="overflow-visible">
      <polyline points={pts} fill="none"
        stroke={positive ? '#10b981' : '#ef4444'}
        strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ─── Range tab bar ────────────────────────────────────────────────────────────

function RangeTabs({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
      {RANGES.map(({ key, label }) => (
        <button key={key} onClick={() => onChange(key)}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            value === key ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}>
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Pin label – injected into Recharts <ReferenceLine label={…}> ────────────
// Recharts clones the element and injects viewBox at render time.

interface PinLabelProps {
  // injected by Recharts
  viewBox?: { x: number; y: number; width: number; height: number };
  // our own props
  pinType: 'buy' | 'sell';
  price?: number;
}

function PinLabel({ viewBox, pinType, price }: PinLabelProps) {
  if (!viewBox) return null;
  const { x, y, height } = viewBox;
  const bottom = y + height;
  const isBuy = pinType === 'buy';
  const color = isBuy ? '#3b82f6' : '#f59e0b';
  const letter = isBuy ? 'ק' : 'מ'; // קנייה / מכירה

  return (
    <g>
      {/* Dashed vertical line */}
      <line x1={x} y1={y + 2} x2={x} y2={bottom - 18}
        stroke={color} strokeWidth={1} strokeDasharray="3 2" opacity={0.65} />
      {/* Circle pin at bottom */}
      <circle cx={x} cy={bottom - 10} r={9} fill={color} stroke="white" strokeWidth={1.5} />
      <text x={x} y={bottom - 10} textAnchor="middle" dominantBaseline="middle"
        fontSize={9} fill="white" fontWeight="bold">
        {letter}
      </text>
      {/* Price tag near top */}
      {price !== undefined && (
        <text x={x + 5} y={y + 10} textAnchor="start" fontSize={9} fill={color} fontWeight="600">
          ${price.toFixed(0)}
        </text>
      )}
    </g>
  );
}

// ─── Build combined portfolio timeline ───────────────────────────────────────

function buildTimeline(
  allHistory: Map<string, HistoricalPoint[]>,
  lots: PortfolioLot[],
  usdIls: number,
): { date: string; value: number; cost: number }[] {
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
      let cost = 0;
      for (const lot of activeLots) {
        if (lot.buyDate > date) continue;
        const pm = priceMaps.get(lot.ticker);
        if (!pm) continue;
        const price = pm.get(date);
        if (price === undefined) continue;
        const fx = lot.currency === 'USD' ? usdIls : 1;
        value += lot.quantity * price * fx;
        cost += (lot.quantity * lot.buyPrice + lot.commission) * fx;
      }
      return { date: date.slice(5), value: Math.round(value), cost: Math.round(cost) };
    })
    .filter((d) => d.value > 0);
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function Stocks() {
  useStockSync();

  const { lots, prices, usdIls, addLot, updateLot, deleteLot, updatePrices } = useStore();
  const { corsProxy } = useSettings();
  const { rows, totalValue, totalNativeUSD, totalNativeILS } = usePortfolioSummary();
  const setEntry = useHistoryCache((s) => s.setEntry);
  const clearAll = useHistoryCache((s) => s.clearAll);

  // Range state
  const [portfolioRange, setPortfolioRange] = useState<Range>('3mo');
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<Range>('3mo');

  // History data
  const [allHistory, setAllHistory] = useState<Map<string, HistoricalPoint[]>>(new Map());
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const [tickerHistory, setTickerHistory] = useState<HistoricalPoint[]>([]);
  const [loadingTicker, setLoadingTicker] = useState(false);

  // UI
  const [refreshing, setRefreshing] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [form, setForm] = useState({
    ticker: '', name: '', sector: 'טכנולוגיה',
    buyDate: new Date().toISOString().slice(0, 10),
    quantity: '', buyPrice: '', commission: '8', currency: 'USD',
  });

  // Sell modal
  const [sellModal, setSellModal] = useState<PortfolioLot | null>(null);
  const [sellForm, setSellForm] = useState({
    sellDate: new Date().toISOString().slice(0, 10),
    sellPrice: '',
    sellCommission: '8',
  });

  // Edit lot modal
  const [editLot, setEditLot] = useState<PortfolioLot | null>(null);
  const [editForm, setEditForm] = useState({
    name: '', sector: 'טכנולוגיה', buyDate: '', quantity: '', buyPrice: '', commission: '', currency: 'USD',
    sellDate: '', sellPrice: '',
  });

  // All-lots flat view toggle
  const [showAllLots, setShowAllLots] = useState(false);
  const [showDynamicCost, setShowDynamicCost] = useState(false);
  const [showPortfolioPins, setShowPortfolioPins] = useState(false);

  // Locked ticker for "add from expanded view"
  const [lockedTicker, setLockedTicker] = useState<string | null>(null);

  // Active tickers
  const activeTickers = useMemo(
    () => [...new Set(lots.filter((l) => !l.sellDate).map((l) => l.ticker))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lots.map((l) => l.ticker + (l.sellDate ?? '')).join(',')]
  );

  // ── Fetch all tickers' history for portfolio chart + sparklines ─────────────
  useEffect(() => {
    if (activeTickers.length === 0) return;

    const missing: string[] = [];
    const immediate = new Map<string, HistoricalPoint[]>();

    for (const ticker of activeTickers) {
      const key = `${ticker}:${portfolioRange}`;
      const cached = getCached(key);
      if (cached) immediate.set(ticker, cached);
      else missing.push(ticker);
    }

    if (immediate.size > 0) setAllHistory(new Map(immediate));
    if (missing.length === 0) return;

    setLoadingPortfolio(true);
    Promise.allSettled(
      missing.map((ticker) =>
        fetchHistory(ticker, corsProxy, portfolioRange).then((data) => {
          setEntry(`${ticker}:${portfolioRange}`, data);
          return { ticker, data };
        })
      )
    ).then((results) => {
      setAllHistory((prev) => {
        const next = new Map(prev);
        for (const r of results)
          if (r.status === 'fulfilled') next.set(r.value.ticker, r.value.data);
        return next;
      });
    }).finally(() => setLoadingPortfolio(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTickers.join(','), portfolioRange, corsProxy]);

  // ── Auto-select first ticker by default ──────────────────────────────────
  useEffect(() => {
    if (!selectedTicker && activeTickers.length > 0) {
      setSelectedTicker(activeTickers[0]);
    }
  }, [selectedTicker, activeTickers]);

  // ── Fetch selected ticker history ─────────────────────────────────────────
  useEffect(() => {
    if (!selectedTicker) return;
    const key = `${selectedTicker}:${selectedRange}`;
    const cached = getCached(key);
    if (cached) { setTickerHistory(cached); return; }

    setLoadingTicker(true);
    setTickerHistory([]);
    fetchHistory(selectedTicker, corsProxy, selectedRange).then((data) => {
      setEntry(key, data);
      setTickerHistory(data);
    }).finally(() => setLoadingTicker(false));
  }, [selectedTicker, selectedRange, corsProxy, setEntry]);

  // ── Derived chart data ─────────────────────────────────────────────────────
  const timeline = useMemo(
    () => buildTimeline(allHistory, lots, usdIls),
    [allHistory, lots, usdIls]
  );

  // ── Pin markers for the portfolio chart ────────────────────────────────────
  const portfolioPins = useMemo(() => {
    if (timeline.length === 0) return { buys: [], sells: [] };
    const chartDates = new Set(timeline.map((d) => d.date));

    const buySet = new Set<string>();
    const sellSet = new Set<string>();

    for (const lot of lots) {
      const bd = lot.buyDate.slice(5);
      if (chartDates.has(bd)) buySet.add(bd);
      
      if (lot.sellDate) {
        const sd = lot.sellDate.slice(5);
        if (chartDates.has(sd)) sellSet.add(sd);
      }
    }

    return {
      buys: Array.from(buySet).map(date => ({ date })),
      sells: Array.from(sellSet).map(date => ({ date }))
    };
  }, [timeline, lots]);

  // ILS-equivalent total cost (used for portfolio chart reference line)
  const totalCost = useMemo(
    () => rows.reduce((a, r) => a + r.costNative * (r.currency === 'USD' ? usdIls : 1), 0),
    [rows, usdIls]
  );
  // Native per-currency costs
  const totalCostNativeUSD = useMemo(() => rows.filter((r) => r.currency === 'USD').reduce((a, r) => a + r.costNative, 0), [rows]);
  const totalCostNativeILS = useMemo(() => rows.filter((r) => r.currency === 'ILS').reduce((a, r) => a + r.costNative, 0), [rows]);
  // Native per-currency P&L
  const totalPnlNativeUSD = useMemo(() => rows.filter((r) => r.currency === 'USD').reduce((a, r) => a + r.pnlNative, 0), [rows]);
  const totalPnlNativeILS = useMemo(() => rows.filter((r) => r.currency === 'ILS').reduce((a, r) => a + r.pnlNative, 0), [rows]);

  const sparklines = useMemo(() => {
    const out: Record<string, number[]> = {};
    for (const [ticker, history] of allHistory)
      out[ticker] = history.map((p) => p.close);
    return out;
  }, [allHistory]);

  const detailData = useMemo(
    () => tickerHistory.map((p) => ({ date: p.date.slice(5), מחיר: +p.close.toFixed(2) })),
    [tickerHistory]
  );

  // ── Pin markers for the per-stock chart ────────────────────────────────────
  // Returns buy and sell events that fall within the chart's date range.
  const chartPins = useMemo(() => {
    if (!selectedTicker || detailData.length === 0) return { buys: [], sells: [] };
    const chartDates = new Set(detailData.map((d) => d.date)); // MM-DD

    const allLots = lots.filter((l) => l.ticker === selectedTicker);

    const buys: { date: string; price: number; qty: number }[] = [];
    const sells: { date: string; price: number; qty: number }[] = [];

    // Aggregate multiple lots on the same date
    const buyMap = new Map<string, { price: number; qty: number }>();
    const sellMap = new Map<string, { price: number; qty: number }>();

    for (const lot of allLots) {
      const bd = lot.buyDate.slice(5);
      if (chartDates.has(bd)) {
        const prev = buyMap.get(bd) ?? { price: 0, qty: 0 };
        // weighted average price
        const totalQty = prev.qty + lot.quantity;
        buyMap.set(bd, {
          qty: totalQty,
          price: (prev.price * prev.qty + lot.buyPrice * lot.quantity) / totalQty,
        });
      }
      if (lot.sellDate && lot.sellPrice) {
        const sd = lot.sellDate.slice(5);
        if (chartDates.has(sd)) {
          const prev = sellMap.get(sd) ?? { price: 0, qty: 0 };
          const totalQty = prev.qty + lot.quantity;
          sellMap.set(sd, {
            qty: totalQty,
            price: (prev.price * prev.qty + lot.sellPrice * lot.quantity) / totalQty,
          });
        }
      }
    }

    for (const [date, v] of buyMap) buys.push({ date, ...v });
    for (const [date, v] of sellMap) sells.push({ date, ...v });

    return { buys, sells };
  }, [selectedTicker, lots, detailData]);

  const totalPnl = rows.reduce((a, r) => a + r.pnlILS, 0);  // ILS for chart/color
  const isAboveCost = totalValue >= totalCost;
  const portfolioPnlPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;
  const hasBoth = totalNativeUSD > 0 && totalNativeILS > 0;

  // ── Actions ────────────────────────────────────────────────────────────────
  async function refreshPrices() {
    if (activeTickers.length === 0) return;
    setRefreshing(true);
    try {
      const quotes = await fetchQuotes(activeTickers, corsProxy);
      const updated = { ...prices };
      for (const [t, q] of Object.entries(quotes)) updated[t] = q.price;
      updatePrices(updated);
    } finally { setRefreshing(false); }
  }

  function addNewLot() {
    addLot({
      ticker: form.ticker.toUpperCase(), name: form.name, sector: form.sector,
      buyDate: form.buyDate, quantity: +form.quantity, buyPrice: +form.buyPrice,
      commission: +form.commission, currency: form.currency as 'USD' | 'ILS',
    });
    setAddModal(false);
    setForm({
      ticker: '', name: '', sector: 'טכנולוגיה',
      buyDate: new Date().toISOString().slice(0, 10),
      quantity: '', buyPrice: '', commission: '8', currency: 'USD',
    });
  }

  function openSellModal(lot: PortfolioLot) {
    setSellModal(lot);
    setSellForm({
      sellDate: new Date().toISOString().slice(0, 10),
      sellPrice: String(prices[lot.ticker]?.toFixed(2) ?? ''),
      sellCommission: '8',
    });
  }

  function confirmSell() {
    if (!sellModal || !sellForm.sellPrice) return;
    updateLot(sellModal.id, {
      sellDate: sellForm.sellDate,
      sellPrice: +sellForm.sellPrice,
      commission: sellModal.commission + +sellForm.sellCommission,
    });
    setSellModal(null);
  }

  function openEditLot(lot: PortfolioLot) {
    setEditLot(lot);
    setEditForm({
      name: lot.name, sector: lot.sector, buyDate: lot.buyDate,
      quantity: String(lot.quantity), buyPrice: String(lot.buyPrice),
      commission: String(lot.commission), currency: lot.currency,
      sellDate: lot.sellDate ?? '', sellPrice: String(lot.sellPrice ?? ''),
    });
  }

  function confirmEditLot() {
    if (!editLot) return;
    updateLot(editLot.id, {
      name: editForm.name, sector: editForm.sector, buyDate: editForm.buyDate,
      quantity: +editForm.quantity, buyPrice: +editForm.buyPrice,
      commission: +editForm.commission, currency: editForm.currency as 'USD' | 'ILS',
      sellDate: editForm.sellDate || undefined,
      sellPrice: editForm.sellPrice ? +editForm.sellPrice : undefined,
    });
    setEditLot(null);
  }

  function openAddForTicker(ticker: string) {
    const existing = lots.find((l) => l.ticker === ticker);
    setLockedTicker(ticker);
    setForm({
      ticker,
      name: existing?.name ?? '',
      sector: existing?.sector ?? 'טכנולוגיה',
      buyDate: new Date().toISOString().slice(0, 10),
      quantity: '', buyPrice: '', commission: '8',
      currency: existing?.currency ?? 'USD',
    });
    setAddModal(true);
  }

  function closeAddModal() {
    setAddModal(false);
    setLockedTicker(null);
    setForm({ ticker: '', name: '', sector: 'טכנולוגיה', buyDate: new Date().toISOString().slice(0, 10), quantity: '', buyPrice: '', commission: '8', currency: 'USD' });
  }

  const handleRowClick = useCallback((ticker: string) => {
    setSelectedTicker((prev) => (prev === ticker ? null : ticker));
    setTickerHistory([]);
  }, []);

  // All lots for selected ticker (open + sold) sorted by buy date desc
  const allTickerLots = useMemo(
    () => lots
      .filter((l) => l.ticker === selectedTicker)
      .sort((a, b) => b.buyDate.localeCompare(a.buyDate)),
    [lots, selectedTicker]
  );

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">מניות וניירות ערך</h1>
          <p className="text-slate-500 text-sm">
            {rows.length} ניירות
            {totalNativeUSD > 0 && <> • <span className="font-medium text-slate-700">${fmt(totalNativeUSD, 0)}</span></>}
            {totalNativeILS > 0 && <> • <span className="font-medium text-slate-700">{fmtCurrency(totalNativeILS)}</span></>}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { clearAll(); setAllHistory(new Map()); setTickerHistory([]); }}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-500 hover:bg-slate-50"
            title="נקה קאש היסטוריה">
            <Database size={13} /> נקה קאש
          </button>
          <button onClick={refreshPrices} disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            עדכן מחירים
          </button>
          <button onClick={() => setAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-xl text-sm text-white hover:bg-blue-700">
            <Plus size={16} /> הוסף קנייה
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* שווי תיק נוכחי */}
        <Card>
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">שווי תיק נוכחי</div>
          <div className="space-y-0.5">
            {totalNativeUSD > 0 && (
              <div className={hasBoth ? 'text-xl font-bold text-slate-900' : 'text-2xl font-bold text-slate-900'}>
                ${fmt(totalNativeUSD, 0)}
              </div>
            )}
            {totalNativeILS > 0 && (
              <div className={hasBoth ? 'text-xl font-bold text-slate-900' : 'text-2xl font-bold text-slate-900'}>
                {fmtCurrency(totalNativeILS)}
              </div>
            )}
          </div>
          {totalNativeUSD > 0 && (
            <div className="text-xs text-slate-400 mt-1">≈ {fmtCurrency(totalValue)} כולל המרה</div>
          )}
        </Card>

        {/* עלות רכישה */}
        <Card>
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">עלות רכישה</div>
          <div className="space-y-0.5">
            {totalCostNativeUSD > 0 && (
              <div className={hasBoth ? 'text-xl font-bold text-slate-900' : 'text-2xl font-bold text-slate-900'}>
                ${fmt(totalCostNativeUSD, 0)}
              </div>
            )}
            {totalCostNativeILS > 0 && (
              <div className={hasBoth ? 'text-xl font-bold text-slate-900' : 'text-2xl font-bold text-slate-900'}>
                {fmtCurrency(totalCostNativeILS)}
              </div>
            )}
          </div>
          {totalCostNativeUSD > 0 && (
            <div className="text-xs text-slate-400 mt-1">≈ {fmtCurrency(totalCost)} כולל המרה</div>
          )}
        </Card>

        {/* רווח/הפסד כולל */}
        <Card>
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">רווח/הפסד כולל</div>
          <div className="space-y-0.5">
            {totalNativeUSD > 0 && (() => {
              const up = totalPnlNativeUSD >= 0;
              return (
                <div className={hasBoth ? 'text-xl font-bold' : 'text-2xl font-bold'} style={{ color: up ? '#16a34a' : '#ef4444' }}>
                  {up ? '+' : ''}${fmt(totalPnlNativeUSD, 0)}
                  {!hasBoth && (
                    <span className="text-sm font-normal mr-1">
                      ({portfolioPnlPct >= 0 ? '+' : ''}{portfolioPnlPct.toFixed(1)}%)
                    </span>
                  )}
                </div>
              );
            })()}
            {totalNativeILS > 0 && (() => {
              const up = totalPnlNativeILS >= 0;
              const pct = totalCostNativeILS > 0 ? (totalPnlNativeILS / totalCostNativeILS) * 100 : 0;
              return (
                <div className={hasBoth ? 'text-xl font-bold' : 'text-2xl font-bold'} style={{ color: up ? '#16a34a' : '#ef4444' }}>
                  {up ? '+' : ''}{fmtCurrency(totalPnlNativeILS)}
                  {!hasBoth && (
                    <span className="text-sm font-normal mr-1">
                      ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)
                    </span>
                  )}
                </div>
              );
            })()}
          </div>
          {hasBoth && (
            <div className="text-xs text-slate-400 mt-1">≈ {totalPnl >= 0 ? '+' : ''}{fmtCurrency(totalPnl)} כולל המרה</div>
          )}
        </Card>

      </div>

      {/* ── Combined Portfolio Chart ── */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="font-semibold text-slate-900">ביצועי תיק לאורך זמן</div>
            <div className={`text-xs mt-0.5 font-medium ${isAboveCost ? 'text-green-600' : 'text-red-500'}`}>
              {isAboveCost ? '▲ מעל עלות הרכישה' : '▼ מתחת לעלות הרכישה'}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3 mt-2 sm:mt-0">
            <button onClick={() => setShowDynamicCost(!showDynamicCost)}
              className={`text-xs px-2 py-1 rounded-md transition-colors ${showDynamicCost ? 'bg-blue-100 text-blue-700 font-medium' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
              {showDynamicCost ? 'מציג עלות דינאמית' : 'הצג עלות דינאמית'}
            </button>
            <button onClick={() => setShowPortfolioPins(!showPortfolioPins)}
              className={`text-xs px-2 py-1 rounded-md transition-colors ${showPortfolioPins ? 'bg-purple-100 text-purple-700 font-medium' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
              {showPortfolioPins ? 'מציג פעולות' : 'הצג פעולות'}
            </button>
            {loadingPortfolio && <Loader2 size={14} className="animate-spin text-slate-400" />}
            <RangeTabs value={portfolioRange} onChange={setPortfolioRange} />
          </div>
        </div>

        {timeline.length > 1 ? (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={timeline} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isAboveCost ? '#10b981' : '#ef4444'} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={isAboveCost ? '#10b981' : '#ef4444'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false}
                width={65} tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}k`} domain={['auto', 'auto']} />
              <Tooltip
                formatter={(v: unknown, name: string) => [fmtCurrency(v as number), name === 'value' ? 'שווי תיק' : 'עלות רכישה']}
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
              {showDynamicCost ? (
                <Area type="stepAfter" dataKey="cost" stroke="#94a3b8" fill="none" strokeWidth={2} strokeDasharray="4 4" />
              ) : (
                <ReferenceLine y={totalCost} stroke="#94a3b8" strokeDasharray="6 3"
                  label={{ value: `עלות ${fmtCurrency(totalCost)}`, position: 'insideTopRight', fontSize: 11, fill: '#94a3b8' }} />
              )}
              {showPortfolioPins && portfolioPins.buys.map(({ date }) => (
                <ReferenceLine key={`pbuy-${date}`} x={date} stroke="transparent"
                  label={<PinLabel pinType="buy" /> as unknown as ReactElement<SVGElement>} />
              ))}
              {showPortfolioPins && portfolioPins.sells.map(({ date }) => (
                <ReferenceLine key={`psell-${date}`} x={date} stroke="transparent"
                  label={<PinLabel pinType="sell" /> as unknown as ReactElement<SVGElement>} />
              ))}
              <Area type="monotone" dataKey="value"
                stroke={isAboveCost ? '#10b981' : '#ef4444'} strokeWidth={2}
                fill="url(#portfolioGrad)" dot={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center h-44 text-slate-400 gap-2">
            {loadingPortfolio
              ? <><Loader2 size={22} className="animate-spin" /><span className="text-sm">טוען מ-Yahoo Finance...</span></>
              : <><span className="text-sm">לא ניתן לטעון נתונים</span><span className="text-xs">בדוק הגדרות CORS Proxy</span></>}
          </div>
        )}
        <p className="text-xs text-slate-400 mt-2 text-center">
          הקו המקווקו = עלות רכישה • שטח מעל/מתחת = רווח/הפסד לא ממומש
        </p>
      </Card>

      {/* ── Split panel: stock list (right) + expanded chart (left) ── */}
      <div className="flex flex-col-reverse lg:flex-row gap-5 items-start">

        {/* Right column: full width when no chart open, fixed width when split */}
        <div className={`flex flex-col gap-5 transition-all w-full ${selectedTicker ? 'lg:w-[490px] shrink-0' : 'flex-1'}`}>

          {/* Stock list with sparklines */}
          <Card className="p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <span className="font-semibold text-slate-900">
                פורטפוליו
                <span className="text-xs font-normal text-slate-400 mr-2">לחץ לגרף מורחב</span>
              </span>
              <button onClick={() => setShowAllLots((v) => !v)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${showAllLots ? 'bg-blue-50 border-blue-200 text-blue-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                {showAllLots ? '▲ הסתר כל הלוטים' : '▼ כל הלוטים'}
              </button>
            </div>
            <div className="divide-y divide-slate-50">
              {rows.map((r) => {
                const spark = sparklines[r.ticker] ?? [];
                const positive = r.pnl >= 0;
                const isSelected = r.ticker === selectedTicker;
                return (
                  <div key={r.ticker} onClick={() => handleRowClick(r.ticker)}
                    className={`flex items-center gap-4 px-5 py-3.5 cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50 border-r-2 border-blue-500' : 'hover:bg-slate-50'
                    }`}>
                    <div className="w-28 shrink-0">
                      <div className="font-bold text-slate-900 text-sm">{r.ticker}</div>
                      <div className="text-xs text-slate-400 truncate">{r.name}</div>
                    </div>
                    {/* Hide sparklines when in split mode to save space */}
                    {!selectedTicker && (
                      <div className="flex-1 flex justify-center">
                        <Sparkline points={spark} positive={positive} />
                      </div>
                    )}
                    <div className={`${selectedTicker ? 'flex-1' : 'w-24'} text-right shrink-0`}>
                      <div className="text-sm font-medium text-slate-900">
                        {r.currency === 'USD' ? '$' : '₪'}{fmt(r.price, 2)}
                      </div>
                      <div className={`text-xs font-medium ${positive ? 'text-green-600' : 'text-red-500'}`}>
                        {r.pnlPct >= 0 ? '+' : ''}{fmt(r.pnlPct, 2)}%
                      </div>
                    </div>
                    <div className="w-32 text-right shrink-0">
                      {/* Value in native currency — primary display */}
                      <div className="text-sm font-semibold text-slate-900">
                        {r.currency === 'USD'
                          ? `$${fmt(r.currentValueNative, 0)}`
                          : fmtCurrency(r.currentValueNative)}
                      </div>
                      {/* P&L in native currency */}
                      <div className={`text-xs font-medium ${positive ? 'text-green-600' : 'text-red-500'}`}>
                        {positive ? '+' : ''}{r.currency === 'USD'
                          ? `$${fmt(r.pnlNative, 0)}`
                          : fmtCurrency(r.pnlNative)}
                      </div>
                      {/* ≈ ILS estimate (only for USD holdings) */}
                      {r.currency === 'USD' && (
                        <div className="text-[10px] text-slate-400 mt-0.5">≈ {fmtCurrency(r.currentValueILS)}</div>
                      )}
                    </div>
                    <div className="w-8 flex justify-end shrink-0">
                      {positive ? <TrendingUp size={16} className="text-green-500" />
                        : <TrendingDown size={16} className="text-red-400" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* All Lots flat view (when toggled) */}
          {showAllLots && (
            <Card className="p-0 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 font-semibold text-slate-900">
                כל הלוטים ({lots.length})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      {['טיקר', 'תאריך קנייה', 'כמות', 'מחיר קנייה', 'מחיר נוכחי', 'שווי / מכירה', 'רווח/הפסד', 'סטטוס', ''].map((h) => (
                        <th key={h} className="text-right px-3 py-2.5 text-slate-500 font-medium text-xs">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...lots].sort((a, b) => b.buyDate.localeCompare(a.buyDate)).map((lot) => {
                      const isSold = !!lot.sellDate;
                      const rate = lot.currency === 'USD' ? usdIls : 1;
                      const currentPrice = prices[lot.ticker] ?? 0;
                      const currentVal = lot.quantity * currentPrice * rate;
                      const cost = (lot.quantity * lot.buyPrice + lot.commission) * rate;
                      const proceeds = lot.quantity * (lot.sellPrice ?? 0) * rate;
                      const pnl = isSold ? proceeds - cost : currentVal - cost;
                      return (
                        <tr key={lot.id} className={`border-b border-slate-50 hover:bg-slate-50 ${isSold ? 'opacity-60' : ''}`}>
                          <td className="px-3 py-2.5 font-bold text-slate-900">{lot.ticker}</td>
                          <td className="px-3 py-2.5 text-slate-500">{lot.buyDate}</td>
                          <td className="px-3 py-2.5">{lot.quantity}</td>
                          <td className="px-3 py-2.5">{lot.currency === 'USD' ? '$' : '₪'}{fmt(lot.buyPrice, 2)}</td>
                          <td className="px-3 py-2.5">{lot.currency === 'USD' ? '$' : '₪'}{fmt(currentPrice, 2)}</td>
                          <td className="px-3 py-2.5">
                            {isSold
                              ? <span className="text-amber-600">{lot.currency === 'USD' ? '$' : '₪'}{fmt(lot.sellPrice ?? 0, 2)} ↳ {lot.sellDate}</span>
                              : fmtCurrency(currentVal)}
                          </td>
                          <td className={`px-3 py-2.5 font-medium ${pnl >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {pnl >= 0 ? '+' : ''}{fmtCurrency(pnl)}
                            {isSold && <span className="text-xs block text-slate-400">ממומש</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${isSold ? 'bg-slate-100 text-slate-500' : 'bg-green-100 text-green-700'}`}>
                              {isSold ? 'נמכר' : 'פתוח'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex gap-1">
                              <button onClick={() => openEditLot(lot)}
                                className="p-1 text-slate-300 hover:text-blue-500" title="ערוך">
                                <Pencil size={13} />
                              </button>
                              <button onClick={() => deleteLot(lot.id)}
                                className="p-1 text-slate-300 hover:text-red-400" title="מחק">✕</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

        </div>{/* end right column */}

        {/* Left column: expanded ticker chart — appears only when a ticker is selected */}
        {selectedTicker && (
          <Card className="flex-1 min-w-0">
            {/* Chart header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-slate-900 text-lg">{selectedTicker}</h2>
                <p className="text-sm text-slate-500">{rows.find((r) => r.ticker === selectedTicker)?.name}</p>
              </div>
              <div className="flex items-center gap-3">
                {loadingTicker && <Loader2 size={14} className="animate-spin text-slate-400" />}
                <RangeTabs value={selectedRange} onChange={setSelectedRange} />
              </div>
            </div>

            {/* Legend for pins */}
            <div className="flex items-center gap-5 mb-3 text-xs text-slate-500">
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-[8px]">ק</span>
                <span>תאריך קנייה</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center text-white font-bold text-[8px]">מ</span>
                <span>תאריך מכירה</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-8 border-t border-dashed border-amber-400" />
                <span>מחיר קנייה ממוצע</span>
              </div>
            </div>

            {/* Chart */}
            {loadingTicker ? (
              <div className="flex items-center justify-center h-52 text-slate-400 gap-2">
                <Loader2 size={20} className="animate-spin" />
                <span className="text-sm">טוען מ-Yahoo Finance...</span>
              </div>
            ) : detailData.length > 1 ? (
              (() => {
                const first = detailData[0].מחיר;
                const last = detailData[detailData.length - 1].מחיר;
                const up = last >= first;
                const avgBuy = rows.find((r) => r.ticker === selectedTicker)?.avgCost ?? 0;
                return (
                  <>
                    <div className="flex gap-4 mb-3 text-sm">
                      <span className="text-slate-500">
                        פתיחת תקופה: <b className="text-slate-800">${first.toFixed(2)}</b>
                      </span>
                      <span className="text-slate-500">
                        נוכחי: <b className="text-slate-800">${last.toFixed(2)}</b>
                      </span>
                      <span className={up ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
                        {up ? '▲' : '▼'} {Math.abs(((last - first) / first) * 100).toFixed(2)}%
                      </span>
                    </div>
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart data={detailData} margin={{ top: 20, right: 10, left: 0, bottom: 20 }}>
                        <defs>
                          <linearGradient id="tickerGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={up ? '#3b82f6' : '#ef4444'} stopOpacity={0.15} />
                            <stop offset="95%" stopColor={up ? '#3b82f6' : '#ef4444'} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }}
                          axisLine={false} tickLine={false} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} domain={['auto', 'auto']}
                          width={62} axisLine={false} tickLine={false}
                          tickFormatter={(v) => `$${v.toFixed(0)}`} />
                        <Tooltip
                          formatter={(v: unknown) => [`$${(v as number).toFixed(2)}`, 'מחיר סגירה']}
                          contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />

                        {/* Average buy price horizontal line */}
                        {avgBuy > 0 && (
                          <ReferenceLine y={avgBuy} stroke="#f59e0b" strokeDasharray="5 3"
                            label={{ value: `ממוצע $${avgBuy.toFixed(2)}`, position: 'insideTopLeft', fontSize: 10, fill: '#d97706' }} />
                        )}

                        {/* Buy pin markers */}
                        {chartPins.buys.map(({ date, price }) => (
                          <ReferenceLine key={`buy-${date}`} x={date} stroke="transparent"
                            label={<PinLabel pinType="buy" price={price} /> as unknown as ReactElement<SVGElement>} />
                        ))}

                        {/* Sell pin markers */}
                        {chartPins.sells.map(({ date, price }) => (
                          <ReferenceLine key={`sell-${date}`} x={date} stroke="transparent"
                            label={<PinLabel pinType="sell" price={price} /> as unknown as ReactElement<SVGElement>} />
                        ))}

                        <Area type="monotone" dataKey="מחיר"
                          stroke={up ? '#3b82f6' : '#ef4444'} strokeWidth={2}
                          fill="url(#tickerGrad)" dot={false} activeDot={{ r: 4 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </>
                );
              })()
            ) : !loadingTicker ? (
              <div className="flex flex-col items-center justify-center h-52 text-slate-400 gap-2">
                <span className="text-sm">לא ניתן לטעון נתונים</span>
                <span className="text-xs">בדוק הגדרות CORS Proxy בעמוד ההגדרות</span>
              </div>
            ) : null}

            {/* ── Lots table (open + closed) ── */}
            <div className="mt-5 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <div className="font-medium text-slate-700 text-sm">
                  לוטים — {selectedTicker}
                  <span className="text-xs text-slate-400 mr-2">
                    ({allTickerLots.filter((l) => !l.sellDate).length} פתוחים,{' '}
                    {allTickerLots.filter((l) => l.sellDate).length} סגורים)
                  </span>
                </div>
                <button onClick={() => openAddForTicker(selectedTicker!)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  <Plus size={12} /> הוסף קנייה ל-{selectedTicker}
                </button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-100">
                    {['תאריך קנייה', 'כמות', 'מחיר קנייה', 'שווי / מכירה', 'רווח/הפסד', ''].map((h) => (
                      <th key={h} className="text-right py-2 px-3 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allTickerLots.map((lot) => {
                    const isSold = !!lot.sellDate;
                    const currentPrice = prices[lot.ticker] ?? 0;
                    const rate = lot.currency === 'USD' ? usdIls : 1;

                    if (isSold) {
                      // Realized P&L
                      const proceeds = lot.quantity * (lot.sellPrice ?? 0) * rate;
                      const cost = (lot.quantity * lot.buyPrice + lot.commission) * rate;
                      const realizedPnl = proceeds - cost;
                      return (
                        <tr key={lot.id} className="border-b border-slate-50 bg-slate-50/50 opacity-75">
                          <td className="py-2.5 px-3 text-slate-400">
                            <div>{lot.buyDate}</div>
                            <div className="text-xs text-amber-500">↳ נמכר {lot.sellDate}</div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-400">{lot.quantity}</td>
                          <td className="py-2.5 px-3 text-slate-400">
                            {lot.currency === 'USD' ? '$' : '₪'}{fmt(lot.buyPrice, 2)}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500">
                            <div className="text-xs text-slate-400">מכירה</div>
                            {lot.currency === 'USD' ? '$' : '₪'}{fmt(lot.sellPrice ?? 0, 2)}
                          </td>
                          <td className={`py-2.5 px-3 font-medium text-sm ${realizedPnl >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {realizedPnl >= 0 ? '+' : ''}{fmtCurrency(realizedPnl)}
                            <div className="text-xs opacity-70">ממומש</div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex gap-1.5">
                              <button onClick={() => openEditLot(lot)}
                                className="p-1 text-slate-300 hover:text-blue-500"><Pencil size={13} /></button>
                              <button onClick={() => deleteLot(lot.id)}
                                className="text-xs text-slate-300 hover:text-red-400 transition-colors">✕</button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    // Open lot
                    const currentVal = lot.quantity * currentPrice * rate;
                    const cost = (lot.quantity * lot.buyPrice + lot.commission) * rate;
                    const pnl = currentVal - cost;
                    return (
                      <tr key={lot.id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2.5 px-3 text-slate-600">{lot.buyDate}</td>
                        <td className="py-2.5 px-3">{lot.quantity}</td>
                        <td className="py-2.5 px-3">
                          {lot.currency === 'USD' ? '$' : '₪'}{fmt(lot.buyPrice, 2)}
                        </td>
                        <td className="py-2.5 px-3 font-medium">{fmtCurrency(currentVal)}</td>
                        <td className={`py-2.5 px-3 font-medium ${pnl >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {pnl >= 0 ? '+' : ''}{fmtCurrency(pnl)}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => openEditLot(lot)}
                              className="p-1 text-slate-300 hover:text-blue-500"><Pencil size={13} /></button>
                            <button onClick={() => openSellModal(lot)}
                              className="flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-100">
                              <BadgeDollarSign size={12} /> מכור
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}{/* end left column */}

      </div>{/* end split panel */}

      {/* ── Edit Lot Modal ── */}
      <Modal open={!!editLot} onClose={() => setEditLot(null)} title={`ערוך לוט — ${editLot?.ticker ?? ''}`}>
        <div className="grid grid-cols-2 gap-4">
          {([
            { key: 'name', label: 'שם החברה' },
            { key: 'quantity', label: 'כמות', type: 'number' },
            { key: 'buyPrice', label: 'מחיר קנייה', type: 'number' },
            { key: 'buyDate', label: 'תאריך קנייה', type: 'date' },
            { key: 'commission', label: 'עמלה', type: 'number' },
          ] as { key: string; label: string; type?: string }[]).map(({ key, label, type = 'text' }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
              <input type={type} value={(editForm as Record<string, string>)[key]}
                onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">מטבע</label>
            <select value={editForm.currency} onChange={(e) => setEditForm({ ...editForm, currency: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="USD">USD ($)</option>
              <option value="ILS">ILS (₪)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">סקטור</label>
            <select value={editForm.sector} onChange={(e) => setEditForm({ ...editForm, sector: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {editLot?.sellDate && <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">תאריך מכירה</label>
              <input type="date" value={editForm.sellDate}
                onChange={(e) => setEditForm({ ...editForm, sellDate: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">מחיר מכירה</label>
              <input type="number" value={editForm.sellPrice}
                onChange={(e) => setEditForm({ ...editForm, sellPrice: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </>}
        </div>
        <button onClick={confirmEditLot}
          className="w-full mt-5 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700">
          שמור שינויים
        </button>
      </Modal>

      {/* ── Add lot modal ── */}
      <Modal open={addModal} onClose={() => closeAddModal()} title={lockedTicker ? `הוסף קנייה ל-${lockedTicker}` : 'הוסף קנייה'}>
        <div className="grid grid-cols-2 gap-4">
          {[
            { key: 'ticker', label: 'טיקר (לדוג. AAPL)' },
            { key: 'name', label: 'שם החברה' },
            { key: 'quantity', label: 'כמות', type: 'number' },
            { key: 'buyPrice', label: 'מחיר קנייה', type: 'number' },
            { key: 'buyDate', label: 'תאריך קנייה', type: 'date' },
            { key: 'commission', label: 'עמלה', type: 'number' },
          ].map(({ key, label, type = 'text' }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
              <input type={type} value={(form as Record<string, string>)[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                disabled={key === 'ticker' && !!lockedTicker}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500" />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">מטבע</label>
            <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="USD">USD ($)</option>
              <option value="ILS">ILS (₪)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">סקטור</label>
            <select value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <button onClick={addNewLot} disabled={!form.ticker || !form.quantity || !form.buyPrice}
          className="w-full mt-5 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
          הוסף קנייה
        </button>
      </Modal>

      {/* ── Sell modal ── */}
      <Modal open={!!sellModal} onClose={() => setSellModal(null)} title="תיעוד מכירה">
        {sellModal && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="bg-slate-50 rounded-xl p-4 text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">נייר</span>
                <span className="font-bold text-slate-900">{sellModal.ticker}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">כמות</span>
                <span className="font-medium">{sellModal.quantity}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">מחיר קנייה</span>
                <span>{sellModal.currency === 'USD' ? '$' : '₪'}{fmt(sellModal.buyPrice, 2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">מחיר שוק נוכחי</span>
                <span className="font-medium text-blue-600">
                  {sellModal.currency === 'USD' ? '$' : '₪'}
                  {fmt(prices[sellModal.ticker] ?? 0, 2)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">תאריך מכירה</label>
                <input type="date" value={sellForm.sellDate}
                  onChange={(e) => setSellForm({ ...sellForm, sellDate: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">מחיר מכירה</label>
                <input type="number" step="0.01" value={sellForm.sellPrice}
                  onChange={(e) => setSellForm({ ...sellForm, sellPrice: e.target.value })}
                  placeholder={`$${fmt(prices[sellModal.ticker] ?? 0, 2)}`}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">עמלת מכירה</label>
                <input type="number" value={sellForm.sellCommission}
                  onChange={(e) => setSellForm({ ...sellForm, sellCommission: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none" />
              </div>
            </div>

            {/* Projected P&L preview */}
            {sellForm.sellPrice && (
              (() => {
                const sp = +sellForm.sellPrice;
                const rate = sellModal.currency === 'USD' ? usdIls : 1;
                const proceeds = sellModal.quantity * sp * rate;
                const cost = (sellModal.quantity * sellModal.buyPrice + sellModal.commission + +sellForm.sellCommission) * rate;
                const pnl = proceeds - cost;
                const pnlPct = ((sp - sellModal.buyPrice) / sellModal.buyPrice) * 100;
                return (
                  <div className={`rounded-xl p-4 ${pnl >= 0 ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}`}>
                    <div className="text-xs text-slate-500 mb-1">רווח/הפסד ממומש משוער</div>
                    <div className={`text-xl font-bold ${pnl >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {pnl >= 0 ? '+' : ''}{fmtCurrency(pnl)}
                      <span className="text-sm font-normal mr-1">
                        ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                );
              })()
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={() => setSellModal(null)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">
                ביטול
              </button>
              <button onClick={confirmSell} disabled={!sellForm.sellPrice || !sellForm.sellDate}
                className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 disabled:opacity-40 flex items-center justify-center gap-2">
                <ShoppingBag size={15} /> אשר מכירה
              </button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
