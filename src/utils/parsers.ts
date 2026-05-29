import * as XLSX from 'xlsx';
import type { Transaction } from '../types';
import { categorize } from './categorizer';
import { nanoid } from '../utils/nanoid';

function toDateStr(raw: string | number): string {
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw);
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(raw).trim();
  // DD/MM/YYYY or DD/MM/YY (slash separator — Cal Visa style)
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m1) return `${m1[3].length === 2 ? '20' + m1[3] : m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`;
  // DD.MM.YYYY or DD.MM.YY (dot separator — Isracard style e.g. 29.05.26)
  const m2 = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (m2) return `${m2[3].length === 2 ? '20' + m2[3] : m2[3]}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`;
  return s;
}

export function parseCalVisa(file: File, card: string): Promise<Transaction[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        const txns: Transaction[] = [];
        let headerRow = -1;
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i].map((c: any) => String(c).trim());
          if (row.some((c: string) => c.includes('תאריך') || c.includes('עסק') || c.includes('סכום'))) {
            headerRow = i;
            break;
          }
        }

        const headers = headerRow >= 0 ? rows[headerRow].map((c: any) => String(c).trim()) : [];
        const dateIdx = headers.findIndex((h: string) => h.includes('תאריך'));
        const bizIdx = headers.findIndex((h: string) => h.includes('שם') || h.includes('עסק'));
        const amtIdx = headers.findIndex((h: string) => h.includes('סכום') || h.includes('חיוב'));

        for (let i = headerRow + 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row[dateIdx] || !row[amtIdx]) continue;
          const business = String(row[bizIdx] ?? '').trim();
          const amount = parseFloat(String(row[amtIdx]).replace(/[₪,]/g, '')) || 0;
          if (amount === 0) continue;

          const { category, isAI } = categorize(business);
          txns.push({
            id: nanoid(),
            date: toDateStr(row[dateIdx]),
            business,
            amount: Math.abs(amount),
            currency: 'ILS',
            category,
            isRecurring: false,
            source: card,
            notes: '',
            pending: false,
            aiCategorized: isAI,
          });
        }
        resolve(txns);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Dedicated Isracard / Mastercard XLSX parser.
 *
 * The file has up to two transaction sections:
 *   1. "עסקאות שטרם נקלטו"  — 4 columns (pending, may not be final)
 *   2. "עסקאות למועד חיוב"  — 8 columns (charged; column "סכום חיוב" = ILS amount)
 *
 * Dates are in DD.MM.YY format (handled by toDateStr).
 * For charged foreign-currency rows we use "סכום חיוב" (actual ILS charged).
 */
export function parseIsracard(file: File, card: string): Promise<Transaction[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        const txns: Transaction[] = [];

        // Identify every header row (each section starts with "תאריך רכישה")
        const headerRowIndexes: number[] = [];
        for (let i = 0; i < rows.length; i++) {
          if (String(rows[i][0]).trim() === 'תאריך רכישה') {
            headerRowIndexes.push(i);
          }
        }

        for (const hIdx of headerRowIndexes) {
          const headers = rows[hIdx].map((c: any) => String(c).trim());

          const dateIdx   = headers.findIndex((h) => h.includes('תאריך'));
          const bizIdx    = headers.findIndex((h) => h.includes('שם'));
          // Use "סכום חיוב" (ILS charge) when present; else "סכום עסקה"
          const chargeIdx = headers.indexOf('סכום חיוב');
          const amtIdx    = chargeIdx >= 0 ? chargeIdx : headers.findIndex((h) => h.includes('סכום'));
          const detailIdx = headers.findIndex((h) => h.includes('פירוט'));
          const isPending = chargeIdx < 0; // pending section has no "סכום חיוב"

          for (let i = hIdx + 1; i < rows.length; i++) {
            const row = rows[i];
            const dateRaw = row[dateIdx];
            const amtRaw  = row[amtIdx];

            // An empty date AND empty amount → end of this section
            if (!dateRaw && !amtRaw) break;
            // Summary / section-separator rows have no valid date
            if (!dateRaw) continue;

            const dateStr = toDateStr(dateRaw);
            // Skip rows whose date didn't parse to YYYY-MM-DD
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;

            const business = String(row[bizIdx] ?? '').trim();
            const amount   = parseFloat(String(amtRaw).replace(/[₪,\s]/g, '')) || 0;
            if (amount === 0 || !business) continue;

            const notes = detailIdx >= 0
              ? String(row[detailIdx] ?? '').replace(/\n/g, ' ').trim()
              : '';

            const { category, isAI } = categorize(business);
            txns.push({
              id: nanoid(),
              date: dateStr,
              business,
              amount: Math.abs(amount),
              currency: 'ILS',
              category,
              isRecurring: notes.includes('הוראת קבע'),
              source: card,
              notes,
              pending: isPending,
              aiCategorized: isAI,
            });
          }
        }

        // De-duplicate across sections (same date + business + amount)
        const seen = new Set<string>();
        const unique = txns.filter((t) => {
          const key = `${t.date}|${t.business}|${t.amount}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        resolve(unique);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

export function parseGenericCSV(file: File, card: string): Promise<Transaction[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target!.result as string;
        const lines = text.split('\n').filter(l => l.trim());
        const txns: Transaction[] = [];

        for (const line of lines.slice(1)) {
          const parts = line.split(',');
          if (parts.length < 3) continue;
          const [date, business, amountRaw] = parts;
          const amount = parseFloat(amountRaw.replace(/[₪,\s"]/g, ''));
          if (!amount || isNaN(amount)) continue;
          const { category, isAI } = categorize(business.trim());
          txns.push({
            id: nanoid(),
            date: toDateStr(date.trim()),
            business: business.trim(),
            amount: Math.abs(amount),
            currency: 'ILS',
            category,
            isRecurring: false,
            source: card,
            notes: '',
            pending: false,
            aiCategorized: isAI,
          });
        }
        resolve(txns);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsText(file, 'utf-8');
  });
}
