/**
 * Renders a portfolio performance chart onto an HTML Canvas and returns a PNG Blob.
 * Pure canvas drawing — no html2canvas, no SVG serialization issues.
 */
import { getCached } from '../store/historyCache';
import { fetchHistory } from '../lib/yahooFinance';
import type { HistoricalPoint } from '../lib/yahooFinance';
import type { PortfolioLot } from '../types';

interface TimelinePoint { date: string; value: number; }

function buildTimeline(
  allHistory: Map<string, HistoricalPoint[]>,
  lots: PortfolioLot[],
  usdIls: number,
): TimelinePoint[] {
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
    .map((d) => {
      let value = 0;
      for (const lot of activeLots) {
        if (lot.buyDate > d) continue;
        const pm = priceMaps.get(lot.ticker);
        if (!pm) continue;
        const price = pm.get(d);
        if (price === undefined) continue;
        value += lot.quantity * price * (lot.currency === 'USD' ? usdIls : 1);
      }
      return { date: d.slice(5), value: Math.round(value) };
    })
    .filter((pt) => pt.value > 0);
}

interface StockSummary { ticker: string; valueILS: number; pnlILS: number; pnlPct: number; }

function renderCanvas(
  timeline: TimelinePoint[],
  totalCost: number,
  usdIls: number,
  stocks: StockSummary[],
): HTMLCanvasElement {
  const DPR = 2;
  const W = 800, H = 460;
  const canvas = document.createElement('canvas');
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(DPR, DPR);

  const isAboveCost = timeline.length > 0 && timeline[timeline.length - 1].value >= totalCost;
  const totalValue = timeline.length > 0 ? timeline[timeline.length - 1].value : 0;
  const pnlPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;
  const lineColor = isAboveCost ? '#10b981' : '#ef4444';
  const pnlColor  = isAboveCost ? '#16a34a' : '#dc2626';
  const date = new Date().toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // ── Background ──────────────────────────────────────────────────
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // ── Header ──────────────────────────────────────────────────────
  // Title (RTL — draw right-aligned from right edge)
  ctx.font = 'bold 18px Arial, sans-serif';
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'right';
  ctx.fillText('ביצועי תיק מניות', W - 24, 34);

  ctx.font = '12px Arial, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText(`${date}  |  3 חודשים אחרונים`, W - 24, 54);

  // Value (left side)
  const valueStr = `₪${Math.round(totalValue).toLocaleString('he-IL')}`;
  ctx.font = 'bold 22px Arial, sans-serif';
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'left';
  ctx.fillText(valueStr, 24, 34);

  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.fillStyle = pnlColor;
  ctx.fillText(`${isAboveCost ? '▲ +' : '▼ '}${pnlPct.toFixed(1)}%`, 24, 54);

  // ── Chart area ──────────────────────────────────────────────────
  const CL = 70, CT = 72, CW = W - CL - 20, CH = 255;

  if (timeline.length >= 2) {
    const vals = timeline.map((p) => p.value);
    const minVal = Math.min(...vals, totalCost) * 0.975;
    const maxVal = Math.max(...vals, totalCost) * 1.025;
    const range  = maxVal - minVal || 1;

    const toX = (i: number) => CL + (i / (timeline.length - 1)) * CW;
    const toY = (v: number)  => CT + CH - ((v - minVal) / range) * CH;

    // Grid lines + Y labels
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y   = CT + (i / 4) * CH;
      const val = maxVal - (i / 4) * range;
      ctx.strokeStyle = '#f1f5f9';
      ctx.beginPath(); ctx.moveTo(CL, y); ctx.lineTo(CL + CW, y); ctx.stroke();
      ctx.font = '10px Arial, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'right';
      ctx.fillText(`₪${(val / 1000).toFixed(0)}k`, CL - 5, y + 4);
    }

    // Cost reference line
    const costY = toY(totalCost);
    if (costY >= CT && costY <= CT + CH) {
      ctx.save();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 3]);
      ctx.beginPath(); ctx.moveTo(CL, costY); ctx.lineTo(CL + CW, costY); ctx.stroke();
      ctx.restore();
      ctx.font = '10px Arial, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'left';
      ctx.fillText(`עלות ₪${(totalCost / 1000).toFixed(0)}k`, CL + 5, costY - 4);
    }

    // Filled area
    const grad = ctx.createLinearGradient(0, CT, 0, CT + CH);
    grad.addColorStop(0, isAboveCost ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.18)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(timeline[0].value));
    for (let i = 1; i < timeline.length; i++) ctx.lineTo(toX(i), toY(timeline[i].value));
    ctx.lineTo(toX(timeline.length - 1), CT + CH);
    ctx.lineTo(toX(0), CT + CH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Chart line
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(timeline[0].value));
    for (let i = 1; i < timeline.length; i++) ctx.lineTo(toX(i), toY(timeline[i].value));
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // X-axis dates
    const xStep = Math.max(1, Math.floor(timeline.length / 6));
    ctx.font = '10px Arial, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    for (let i = 0; i < timeline.length - 1; i += xStep) {
      ctx.fillText(timeline[i].date, toX(i), CT + CH + 16);
    }
    ctx.fillText(timeline[timeline.length - 1].date, toX(timeline.length - 1), CT + CH + 16);
  }

  // ── Stock row cards ─────────────────────────────────────────────
  const STOCKS_TOP = CT + CH + 38;
  const sorted = [...stocks].sort((a, b) => b.valueILS - a.valueILS).slice(0, 5);
  const COL_W = (W - 48) / sorted.length;

  sorted.forEach((row, i) => {
    const x = 24 + i * COL_W;
    const isPos = row.pnlILS >= 0;

    // Card background
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.roundRect(x, STOCKS_TOP - 4, COL_W - 8, 52, 8);
    ctx.fill();

    ctx.font = 'bold 13px Arial, sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.fillText(row.ticker, x + (COL_W - 8) / 2, STOCKS_TOP + 14);

    ctx.font = '11px Arial, sans-serif';
    ctx.fillStyle = isPos ? '#16a34a' : '#dc2626';
    ctx.fillText(`${isPos ? '+' : ''}${row.pnlPct.toFixed(1)}%`, x + (COL_W - 8) / 2, STOCKS_TOP + 30);

    ctx.fillStyle = '#64748b';
    ctx.font = '10px Arial, sans-serif';
    ctx.fillText(`₪${Math.round(row.valueILS).toLocaleString('he-IL')}`, x + (COL_W - 8) / 2, STOCKS_TOP + 44);
  });

  // ── Footer ──────────────────────────────────────────────────────
  ctx.font = '10px Arial, sans-serif';
  ctx.fillStyle = '#cbd5e1';
  ctx.textAlign = 'center';
  ctx.fillText(`Finstar  •  1$ = ₪${usdIls.toFixed(2)}`, W / 2, H - 8);

  return canvas;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function capturePortfolioChart(
  lots: PortfolioLot[],
  usdIls: number,
  corsProxy: string,
  portfolioRows: { ticker: string; costNative: number; currency: string; currentValueILS: number; pnlILS: number; pnlPct: number }[],
): Promise<Blob> {
  const tickers = [...new Set(lots.filter((l) => !l.sellDate).map((l) => l.ticker))];
  if (tickers.length === 0) throw new Error('no open positions');

  // Load history (cache first)
  const allHistory = new Map<string, HistoricalPoint[]>();
  for (const ticker of tickers) {
    const cached = getCached(`${ticker}:3mo`);
    if (cached) { 
      allHistory.set(ticker, cached); 
      continue; 
    }
    try {
      const data = await fetchHistory(ticker, corsProxy, '3mo');
      if (data.length > 0) allHistory.set(ticker, data);
      await new Promise(r => setTimeout(r, 300));
    } catch { 
      /* skip missing ticker */ 
    }
  }

  const timeline = buildTimeline(allHistory, lots, usdIls);
  if (timeline.length < 2) throw new Error('insufficient data');

  const totalCost = portfolioRows.reduce(
    (a, r) => a + r.costNative * (r.currency === 'USD' ? usdIls : 1), 0
  );

  const stocks: StockSummary[] = portfolioRows
    .filter((r) => r.currentValueILS > 0)
    .map((r) => ({
      ticker: r.ticker,
      valueILS: r.currentValueILS,
      pnlILS: r.pnlILS,
      pnlPct: r.pnlPct,
    }));

  const canvas = renderCanvas(timeline, totalCost, usdIls, stocks);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png')
  );
}
