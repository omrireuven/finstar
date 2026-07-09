/**
 * Shared canvas helpers (font registration, day/night theme, rounded rects)
 * used by every server-rendered Telegram image (portfolio chart, pending list, ...).
 */
import { registerFont } from 'canvas';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

registerFont(path.join(__dirname, 'fonts/NotoSansHebrew.ttf'), { family: 'NotoSansHebrew', weight: '400' });
registerFont(path.join(__dirname, 'fonts/NotoSansHebrew.ttf'), { family: 'NotoSansHebrew', weight: '700' });

/** Dark background at night (matches Telegram's own dark theme), light during the day. */
export function getTheme() {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { hour: '2-digit', hour12: false, timeZone: 'Asia/Jerusalem' }).format(new Date())
  );
  const isNight = hour >= 19 || hour < 7;
  return isNight
    ? {
        bg: '#111827',
        text: '#f8fafc',
        subtext: '#e2e8f0',
        grid: '#1f2937',
        costLine: '#64748b',
        footer: '#94a3b8',
        cardBg: { pos: 'rgba(34,197,94,0.16)', neg: 'rgba(248,113,113,0.16)', neutral: '#1e293b' },
        cardBorder: { pos: '#4ade80', neg: '#f87171', neutral: '#334155' },
        lineColor: { pos: '#34d399', neg: '#f87171' },
        pnlColor: { pos: '#4ade80', neg: '#f87171' },
        badgeBg: '#334155',
      }
    : {
        bg: '#ffffff',
        text: '#0f172a',
        subtext: '#1e293b',
        grid: '#e2e8f0',
        costLine: '#94a3b8',
        footer: '#475569',
        cardBg: { pos: '#ecfdf5', neg: '#fef2f2', neutral: '#f8fafc' },
        cardBorder: { pos: '#16a34a', neg: '#dc2626', neutral: '#cbd5e1' },
        lineColor: { pos: '#10b981', neg: '#ef4444' },
        pnlColor: { pos: '#16a34a', neg: '#dc2626' },
        badgeBg: '#334155',
      };
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
