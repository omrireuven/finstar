export const fmt = (n: number, decimals = 0) =>
  new Intl.NumberFormat('he-IL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);

export const fmtCurrency = (n: number, decimals = 0) => `₪${fmt(n, decimals)}`;

export const fmtDate = (d: string) => {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

export const fmtMonthYear = (y: number, m: number) => {
  const months = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
  return `${months[m - 1]} ${y}`;
};

export const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;

export const currentMonthKey = () => {
  const now = new Date();
  return monthKey(now.getFullYear(), now.getMonth() + 1);
};

export const pct = (value: number, total: number) =>
  total === 0 ? 0 : Math.round((value / total) * 100);
