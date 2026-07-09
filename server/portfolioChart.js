/**
 * Server-side render of the portfolio performance chart (line + per-stock cards),
 * ported from src/utils/capturePortfolioChart.ts so the Telegram bot can send the
 * exact same modern design without needing a browser tab open.
 */
import { createCanvas } from 'canvas';
import { getTheme, roundRect } from './canvasTheme.js';

const YF_BASE = 'https://query2.finance.yahoo.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

async function fetchHistory(ticker, range = '3mo') {
  try {
    const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${range}`;
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } });
    if (!res.ok) return [];
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return [];
    const timestamps = result.timestamp ?? [];
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    return timestamps
      .map((ts, i) => ({ date: new Date(ts * 1000).toISOString().slice(0, 10), close: closes[i] ?? 0 }))
      .filter((p) => p.close > 0);
  } catch (e) {
    return [];
  }
}

function buildTimeline(allHistory, lots, usdIls) {
  if (allHistory.size === 0) return [];
  const priceMaps = new Map();
  for (const [ticker, history] of allHistory) {
    const m = new Map();
    for (const pt of history) m.set(pt.date, pt.close);
    priceMaps.set(ticker, m);
  }
  const allDates = [...new Set([...allHistory.values()].flatMap((h) => h.map((p) => p.date)))].sort();
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

/** Draws a filled triangle pointer (▲/▼) — the Hebrew font has no glyph for these symbols. */
function drawTriangle(ctx, cx, cy, size, up, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  if (up) {
    ctx.moveTo(cx, cy - size / 2);
    ctx.lineTo(cx - size / 2, cy + size / 2);
    ctx.lineTo(cx + size / 2, cy + size / 2);
  } else {
    ctx.moveTo(cx, cy + size / 2);
    ctx.lineTo(cx - size / 2, cy - size / 2);
    ctx.lineTo(cx + size / 2, cy - size / 2);
  }
  ctx.closePath();
  ctx.fill();
}

function renderCanvas(timeline, totalCost, usdIls, theme) {
  const DPR = 2;
  const W = 800, H = 380;
  const canvas = createCanvas(W * DPR, H * DPR);
  const ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);

  const isAboveCost = timeline.length > 0 && timeline[timeline.length - 1].value >= totalCost;
  const totalValue = timeline.length > 0 ? timeline[timeline.length - 1].value : 0;
  const pnlPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;
  const lineColor = isAboveCost ? theme.lineColor.pos : theme.lineColor.neg;
  const pnlColor = isAboveCost ? theme.pnlColor.pos : theme.pnlColor.neg;
  const date = new Date().toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });

  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);

  ctx.font = 'bold 19px NotoSansHebrew';
  ctx.fillStyle = theme.text;
  ctx.textAlign = 'right';
  ctx.fillText('ביצועי תיק מניות', W - 24, 34);

  ctx.font = 'bold 13px NotoSansHebrew';
  ctx.fillStyle = theme.subtext;
  ctx.fillText(`${date}  |  3 חודשים אחרונים`, W - 24, 54);

  const valueStr = `₪${Math.round(totalValue).toLocaleString('he-IL')}`;
  ctx.font = 'bold 24px NotoSansHebrew';
  ctx.fillStyle = theme.text;
  ctx.textAlign = 'left';
  ctx.fillText(valueStr, 24, 34);

  ctx.font = 'bold 15px NotoSansHebrew';
  ctx.fillStyle = pnlColor;
  drawTriangle(ctx, 28, 50, 9, isAboveCost, pnlColor);
  ctx.fillText(`${isAboveCost ? '+' : ''}${pnlPct.toFixed(1)}%`, 37, 54);

  const CL = 70, CT = 72, CW = W - CL - 20, CH = 255;

  if (timeline.length >= 2) {
    const vals = timeline.map((p) => p.value);
    const minVal = Math.min(...vals, totalCost) * 0.975;
    const maxVal = Math.max(...vals, totalCost) * 1.025;
    const range = maxVal - minVal || 1;

    const toX = (i) => CL + (i / (timeline.length - 1)) * CW;
    const toY = (v) => CT + CH - ((v - minVal) / range) * CH;

    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = CT + (i / 4) * CH;
      const val = maxVal - (i / 4) * range;
      ctx.strokeStyle = theme.grid;
      ctx.beginPath(); ctx.moveTo(CL, y); ctx.lineTo(CL + CW, y); ctx.stroke();
      ctx.font = 'bold 11px NotoSansHebrew';
      ctx.fillStyle = theme.subtext;
      ctx.textAlign = 'right';
      ctx.fillText(`₪${(val / 1000).toFixed(0)}k`, CL - 5, y + 4);
    }

    const costY = toY(totalCost);
    if (costY >= CT && costY <= CT + CH) {
      ctx.save();
      ctx.strokeStyle = theme.costLine;
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 3]);
      ctx.beginPath(); ctx.moveTo(CL, costY); ctx.lineTo(CL + CW, costY); ctx.stroke();
      ctx.restore();
      ctx.font = 'bold 11px NotoSansHebrew';
      ctx.fillStyle = theme.subtext;
      ctx.textAlign = 'left';
      ctx.fillText(`עלות ₪${(totalCost / 1000).toFixed(0)}k`, CL + 5, costY - 4);
    }

    const grad = ctx.createLinearGradient(0, CT, 0, CT + CH);
    grad.addColorStop(0, isAboveCost ? 'rgba(16,185,129,0.22)' : 'rgba(239,68,68,0.22)');
    grad.addColorStop(1, isAboveCost ? 'rgba(16,185,129,0)' : 'rgba(239,68,68,0)');
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(timeline[0].value));
    for (let i = 1; i < timeline.length; i++) ctx.lineTo(toX(i), toY(timeline[i].value));
    ctx.lineTo(toX(timeline.length - 1), CT + CH);
    ctx.lineTo(toX(0), CT + CH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(toX(0), toY(timeline[0].value));
    for (let i = 1; i < timeline.length; i++) ctx.lineTo(toX(i), toY(timeline[i].value));
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    const xStep = Math.max(1, Math.floor(timeline.length / 6));
    ctx.font = 'bold 11px NotoSansHebrew';
    ctx.fillStyle = theme.subtext;
    ctx.textAlign = 'center';
    for (let i = 0; i < timeline.length - 1; i += xStep) {
      ctx.fillText(timeline[i].date, toX(i), CT + CH + 16);
    }
    ctx.fillText(timeline[timeline.length - 1].date, toX(timeline.length - 1), CT + CH + 16);
  }

  ctx.font = 'bold 11px NotoSansHebrew';
  ctx.fillStyle = theme.footer;
  ctx.textAlign = 'center';
  ctx.fillText(`Finstar  •  1$ = ₪${usdIls.toFixed(2)}`, W / 2, H - 8);

  return canvas;
}

/** Grid of per-stock cards, colored by profit (green tint) or loss (red tint). Sized to be roughly square. */
function renderStockCardsCanvas(stocks, theme) {
  const DPR = 2;
  const sorted = [...stocks].sort((a, b) => b.valueILS - a.valueILS);
  const n = sorted.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.ceil(n / cols);

  const CARD_W = 170, CARD_H = 100, GAP = 14, PAD = 24, TITLE_H = 50;
  const W = PAD * 2 + cols * CARD_W + (cols - 1) * GAP;
  const H = TITLE_H + PAD + rows * CARD_H + (rows - 1) * GAP + PAD;

  const canvas = createCanvas(W * DPR, H * DPR);
  const ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);

  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);

  ctx.font = 'bold 19px NotoSansHebrew';
  ctx.fillStyle = theme.text;
  ctx.textAlign = 'right';
  ctx.fillText('פירוט מניות', W - PAD, 34);

  sorted.forEach((s, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = PAD + col * (CARD_W + GAP);
    const y = TITLE_H + row * (CARD_H + GAP);
    const isPos = s.pnlILS >= 0;
    const bg = isPos ? theme.cardBg.pos : theme.cardBg.neg;
    const border = isPos ? theme.cardBorder.pos : theme.cardBorder.neg;

    ctx.fillStyle = bg;
    roundRect(ctx, x, y, CARD_W, CARD_H, 12);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = border;
    roundRect(ctx, x, y, CARD_W, CARD_H, 12);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.font = 'bold 19px NotoSansHebrew';
    ctx.fillStyle = theme.text;
    ctx.fillText(s.ticker, x + CARD_W / 2, y + 36);

    ctx.font = 'bold 17px NotoSansHebrew';
    ctx.fillStyle = border;
    ctx.fillText(`${isPos ? '+' : ''}${s.pnlPct.toFixed(1)}%`, x + CARD_W / 2, y + 60);

    ctx.font = 'bold 14px NotoSansHebrew';
    ctx.fillStyle = theme.subtext;
    ctx.fillText(`₪${Math.round(s.valueILS).toLocaleString('he-IL')}`, x + CARD_W / 2, y + 82);
  });

  return canvas;
}

/**
 * @param {Array} lots - dbState.lots
 * @param {number} usdIls
 * @param {Array<{ticker:string, currentValueILS:number, costILS:number, pnlILS:number, pnlPct:number}>} portfolioRows
 * @returns {Promise<Buffer|null>} PNG buffer, or null if there isn't enough data to chart
 */
export async function renderPortfolioChartPng(lots, usdIls, portfolioRows) {
  const tickers = [...new Set(lots.filter((l) => !l.sellDate).map((l) => l.ticker))];
  if (tickers.length === 0) return null;

  const allHistory = new Map();
  for (const ticker of tickers) {
    const data = await fetchHistory(ticker, '3mo');
    if (data.length > 0) allHistory.set(ticker, data);
    await new Promise((r) => setTimeout(r, 250));
  }

  const timeline = buildTimeline(allHistory, lots, usdIls);
  if (timeline.length < 2) return null;

  const totalCost = portfolioRows.reduce((a, r) => a + r.costILS, 0);
  const canvas = renderCanvas(timeline, totalCost, usdIls, getTheme());
  return canvas.toBuffer('image/png');
}

/**
 * Grid of per-stock cards (ticker, P&L %, value), colored green/red by profit or loss.
 * @param {Array<{ticker:string, currentValueILS:number, pnlILS:number, pnlPct:number}>} portfolioRows
 * @returns {Buffer|null} PNG buffer, or null if there are no priced holdings
 */
export function renderPortfolioCardsPng(portfolioRows) {
  const stocks = portfolioRows
    .filter((r) => r.currentValueILS > 0)
    .map((r) => ({ ticker: r.ticker, valueILS: r.currentValueILS, pnlILS: r.pnlILS, pnlPct: r.pnlPct }));
  if (stocks.length === 0) return null;

  const canvas = renderStockCardsCanvas(stocks, getTheme());
  return canvas.toBuffer('image/png');
}
