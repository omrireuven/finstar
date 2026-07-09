/**
 * Monthly budget image — rounded progress bars per category, colored by
 * usage (green/amber/red), matching the portfolio chart's modern look and
 * day/night theme.
 */
import { createCanvas } from 'canvas';
import { getTheme, roundRect } from './canvasTheme.js';

function renderBudgetCanvas(items, monthName, theme) {
  const DPR = 2;
  const W = 720;
  const PAD = 24;
  const ROW_H = 76;
  const GAP = 14;
  const TITLE_H = 60;
  const BAR_H = 18;
  const H = TITLE_H + items.length * ROW_H + (items.length - 1) * GAP + PAD;

  const canvas = createCanvas(W * DPR, H * DPR);
  const ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);

  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);

  ctx.font = 'bold 19px NotoSansHebrew';
  ctx.fillStyle = theme.text;
  ctx.textAlign = 'right';
  ctx.fillText(`תקציב חודשי — ${monthName}`, W - PAD, 32);

  ctx.font = 'bold 12px NotoSansHebrew';
  ctx.fillStyle = theme.subtext;
  ctx.fillText('% מהתקציב שנוצל', W - PAD, 50);

  items.forEach((item, i) => {
    const y = TITLE_H + i * (ROW_H + GAP);
    const color = item.pct >= 100 ? theme.cardBorder.neg : item.pct >= 80 ? '#f59e0b' : theme.cardBorder.pos;

    ctx.textAlign = 'right';
    ctx.font = 'bold 16px NotoSansHebrew';
    ctx.fillStyle = theme.text;
    ctx.fillText(item.category, W - PAD, y + 16);

    ctx.textAlign = 'left';
    ctx.font = 'bold 16px NotoSansHebrew';
    ctx.fillStyle = color;
    ctx.fillText(`${Math.round(item.pct)}%`, PAD, y + 16);

    ctx.textAlign = 'right';
    ctx.font = 'bold 12px NotoSansHebrew';
    ctx.fillStyle = theme.subtext;
    ctx.fillText(`₪${Math.round(item.spent).toLocaleString('he-IL')} / ₪${item.target.toLocaleString('he-IL')}`, W - PAD, y + 34);

    const barY = y + 44;
    const barW = W - PAD * 2;
    ctx.fillStyle = theme.cardBg.neutral;
    roundRect(ctx, PAD, barY, barW, BAR_H, BAR_H / 2);
    ctx.fill();

    const fillW = Math.max(BAR_H, barW * (Math.min(item.pct, 100) / 100));
    ctx.fillStyle = color;
    roundRect(ctx, PAD, barY, fillW, BAR_H, BAR_H / 2);
    ctx.fill();
  });

  return canvas;
}

/**
 * @param {Array<{category:string, spent:number, target:number, pct:number}>} withBudget
 * @param {string} monthName
 * @returns {Buffer|null} PNG buffer, or null if no category has spending yet
 */
export function renderBudgetChartPng(withBudget, monthName) {
  const items = withBudget.filter((g) => g.spent > 0);
  if (items.length === 0) return null;

  const canvas = renderBudgetCanvas(items, monthName, getTheme());
  return canvas.toBuffer('image/png');
}
