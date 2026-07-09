/**
 * Numbered summary image for pending recurring-charge confirmations.
 * Each row is numbered 1..N; the user replies with a number to act on that item.
 */
import { createCanvas } from 'canvas';
import { getTheme, roundRect } from './canvasTheme.js';

function drawBadge(ctx, cx, cy, r, num, theme) {
  ctx.fillStyle = theme.badgeBg;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = 'bold 15px NotoSansHebrew';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(String(num), cx, cy + 5);
}

function renderPendingCanvas(items, theme) {
  const DPR = 2;
  const W = 720;
  const PAD = 20;
  const ROW_H = 78;
  const GAP = 12;
  const TITLE_H = 60;
  const H = TITLE_H + items.length * ROW_H + (items.length - 1) * GAP + PAD;

  const canvas = createCanvas(W * DPR, H * DPR);
  const ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);

  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);

  ctx.font = 'bold 19px NotoSansHebrew';
  ctx.fillStyle = theme.text;
  ctx.textAlign = 'right';
  ctx.fillText(`עסקאות ממתינות (${items.length})`, W - PAD, 34);

  items.forEach((item, i) => {
    const y = TITLE_H + i * (ROW_H + GAP);
    const badgeR = 18;
    const badgeCx = W - PAD - badgeR;
    const badgeCy = y + ROW_H / 2;

    ctx.fillStyle = theme.cardBg.neutral;
    roundRect(ctx, PAD, y, W - PAD * 2, ROW_H, 14);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = theme.cardBorder.neutral;
    roundRect(ctx, PAD, y, W - PAD * 2, ROW_H, 14);
    ctx.stroke();

    drawBadge(ctx, badgeCx, badgeCy, badgeR, i + 1, theme);

    const textRight = badgeCx - badgeR - 16;
    ctx.textAlign = 'right';
    ctx.font = 'bold 17px NotoSansHebrew';
    ctx.fillStyle = theme.text;
    ctx.fillText(item.business, textRight, y + 32);

    ctx.font = 'bold 13px NotoSansHebrew';
    ctx.fillStyle = theme.subtext;
    ctx.fillText(`${item.category}  •  ${item.dateStr}`, textRight, y + 54);

    ctx.textAlign = 'left';
    ctx.font = 'bold 18px NotoSansHebrew';
    ctx.fillStyle = theme.text;
    ctx.fillText(`₪${Math.round(item.amount).toLocaleString('he-IL')}`, PAD + 14, y + ROW_H / 2 + 6);
  });

  return canvas;
}

/**
 * @param {Array<{business:string, category:string, amount:number, date:string}>} pending
 * @returns {Buffer|null} PNG buffer numbered 1..N in the same order as `pending`, or null if empty
 */
export function renderPendingSummaryPng(pending) {
  if (pending.length === 0) return null;
  const items = pending.map((t) => ({
    business: t.business,
    category: t.category,
    amount: t.amount,
    dateStr: new Date(t.date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }),
  }));
  const canvas = renderPendingCanvas(items, getTheme());
  return canvas.toBuffer('image/png');
}
