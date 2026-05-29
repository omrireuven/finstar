import * as XLSX from 'xlsx';
import type { Transaction } from '../types';
import { categorize } from './categorizer';
import { nanoid } from '../utils/nanoid';

function toDateStr(raw: unknown): string {
  // JavaScript Date object (some xlsx environments return these)
  if (raw instanceof Date) {
    return `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, '0')}-${String(raw.getDate()).padStart(2, '0')}`;
  }
  // Excel serial date number
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw);
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(raw).trim();
  // DD/MM/YYYY or DD/MM/YY  (slash — Cal Visa)
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m1) return `${m1[3].length === 2 ? '20' + m1[3] : m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`;
  // DD.MM.YYYY or DD.MM.YY  (dot — Isracard)
  const m2 = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (m2) return `${m2[3].length === 2 ? '20' + m2[3] : m2[3]}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`;
  // DD-MM-YYYY or DD-MM-YY  (dash — Max)
  // Note: first group is 1-2 digits so it won't accidentally match YYYY-MM-DD
  const m3 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (m3) return `${m3[3].length === 2 ? '20' + m3[3] : m3[3]}-${m3[2].padStart(2, '0')}-${m3[1].padStart(2, '0')}`;
  return s;
}

/**
 * Cal Visa / Bank XLSX export parser.
 *
 * Format:
 *   Row 0: title   ("פירוט עסקאות ל…")
 *   Row 1: headers ("תאריך\nעסקה", "שם בית עסק", "סכום\nבש\"ח", "סכום\nבדולר", …)
 *   Row 2+: data rows
 *
 * The header row is identified as the first row whose FIRST cell starts with "תאריך".
 * ILS amount is the first "סכום" column that does NOT mention "דולר".
 * USD-only rows (no ILS amount) are imported with currency USD.
 */
export function parseCalVisa(file: File, card: string): Promise<Transaction[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        const txns: Transaction[] = [];

        // Find header row: first row whose first cell starts with "תאריך"
        let headerRow = -1;
        for (let i = 0; i < rows.length; i++) {
          const first = String(rows[i][0] ?? '').trim();
          if (first.startsWith('תאריך')) { headerRow = i; break; }
        }
        if (headerRow < 0) { resolve([]); return; }

        const headers = rows[headerRow].map((c) => String(c).trim());
        const dateIdx   = 0; // always first column
        // Business: first column whose header contains "שם"
        const bizIdx    = headers.findIndex((h) => h.includes('שם'));
        // ILS amount: first "סכום" column that isn't the dollar column
        const amtILSIdx = headers.findIndex((h) => h.includes('סכום') && !h.includes('דולר') && !h.includes('USD'));
        // USD amount: first column mentioning "דולר" or "$"
        const amtUSDIdx = headers.findIndex((h) => h.includes('דולר') || h.includes('USD') || h.includes('$'));

        for (let i = headerRow + 1; i < rows.length; i++) {
          const row = rows[i] as unknown[];
          const dateRaw = row[dateIdx];
          if (!dateRaw && dateRaw !== 0) continue;

          const business = String(row[bizIdx] ?? '').trim();
          if (!business) continue;

          let amount = 0;
          let currency = 'ILS';

          if (amtILSIdx >= 0) {
            const raw = row[amtILSIdx];
            if (raw !== '' && raw !== null) {
              amount = parseFloat(String(raw).replace(/[₪,\s]/g, '')) || 0;
            }
          }
          // Fall back to USD if no ILS amount
          if (amount === 0 && amtUSDIdx >= 0) {
            const raw = row[amtUSDIdx];
            if (raw !== '' && raw !== null) {
              amount = parseFloat(String(raw).replace(/[$,\s]/g, '')) || 0;
              if (amount !== 0) currency = 'USD';
            }
          }
          if (amount === 0) continue;

          const dateStr = toDateStr(dateRaw);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;

          const { category, isAI } = categorize(business);
          txns.push({
            id: nanoid(),
            date: dateStr,
            business,
            amount: Math.abs(amount),
            currency,
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
        const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        const txns: Transaction[] = [];

        // Identify every header row (each section starts with "תאריך רכישה")
        const headerRowIndexes: number[] = [];
        for (let i = 0; i < rows.length; i++) {
          if (String(rows[i][0]).trim() === 'תאריך רכישה') {
            headerRowIndexes.push(i);
          }
        }

        for (const hIdx of headerRowIndexes) {
          const headers = rows[hIdx].map((c) => String(c).trim());

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

/**
 * Max credit card XLSX parser.
 *
 * The file has metadata rows, then:
 *   Row 3 (0-indexed): headers ("תאריך עסקה", "שם בית העסק", …)
 *   Row 4+: data
 *
 * Column layout:
 *   0: תאריך עסקה      (DD-MM-YYYY string)
 *   1: שם בית העסק
 *   2: קטגוריה (Max's own)
 *   3: 4 digits card
 *   4: סוג עסקה
 *   5: סכום חיוב       (ILS amount charged — always ₪)
 *   6: מטבע חיוב
 *   7: סכום עסקה מקורי
 *   8: מטבע עסקה מקורי
 *   9: תאריך חיוב
 *  10: הערות
 *
 * Negative amounts are credits/refunds → skipped.
 * Both sheets ("עסקאות במועד החיוב" and "עסקאות חו\"ל ומט\"ח") are parsed.
 */
export function parseMax(file: File, card: string): Promise<Transaction[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const txns: Transaction[] = [];

        for (const sheetName of wb.SheetNames) {
          const ws = wb.Sheets[sheetName];
          const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

          // Find header row: first row whose first cell is exactly "תאריך עסקה"
          let headerRow = -1;
          for (let i = 0; i < rows.length; i++) {
            if (String(rows[i][0]).trim() === 'תאריך עסקה') { headerRow = i; break; }
          }
          if (headerRow < 0) continue;

          for (let i = headerRow + 1; i < rows.length; i++) {
            const row = rows[i];
            const dateRaw = String(row[0] ?? '').trim();
            const business = String(row[1] ?? '').trim();
            const amtRaw  = row[5]; // סכום חיוב — ILS charge amount

            if (!dateRaw || !business) continue;

            const amount = parseFloat(String(amtRaw).replace(/[₪,\s]/g, '')) || 0;
            // Skip credits (negative) and zero rows
            if (amount <= 0) continue;

            const dateStr = toDateStr(dateRaw);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;

            const notes    = String(row[10] ?? '').trim();
            const txnType  = String(row[4]  ?? '').trim();
            const isRecurring = notes.includes('הוראת קבע') || txnType.includes('הוראת קבע');

            const { category, isAI } = categorize(business);
            txns.push({
              id: nanoid(),
              date: dateStr,
              business,
              amount,
              currency: 'ILS',
              category,
              isRecurring,
              source: card,
              notes,
              pending: false,
              aiCategorized: isAI,
            });
          }
        }

        // De-duplicate within the file (same date + business + amount)
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
