import express from 'express';
import cors from 'cors';
import { createScraper, CompanyTypes, SCRAPERS } from 'israeli-bank-scrapers';

const app = express();
const PORT = process.env.SCRAPER_PORT || 3003;

app.use(cors());
app.use(express.json());

// ── Company metadata (which banks/CCs are supported + their login fields) ────

/** Hebrew display names for each company */
const COMPANY_DISPLAY_NAMES = {
  hapoalim: 'בנק הפועלים',
  leumi: 'בנק לאומי',
  discount: 'בנק דיסקונט',
  mercantile: 'בנק מרכנתיל',
  mizrahi: 'בנק מזרחי טפחות',
  otsarHahayal: 'בנק אוצר החייל',
  union: 'בנק איגוד',
  beinleumi: 'בנק הבינלאומי',
  massad: 'בנק מסד',
  yahav: 'בנק יהב',
  visaCal: 'ויזה כאל',
  max: 'מקס (לאומי קארד)',
  isracard: 'ישראכרט',
  amex: 'אמריקן אקספרס',
  beyahadBishvilha: 'ביחד בשבילך',
  behatsdaa: 'בהצדעה',
  oneZero: 'OneZero (ניסיוני)',
  pagi: 'פאגי',
};

/** Hebrew labels for login field names */
const FIELD_LABELS = {
  userCode: 'קוד משתמש',
  username: 'שם משתמש',
  password: 'סיסמה',
  id: 'תעודת זהות',
  num: 'מספר נוסף',
  card6Digits: '6 ספרות כרטיס',
  nationalID: 'מספר זהות',
  email: 'אימייל',
  phoneNumber: 'מספר טלפון',
  otpLongTermToken: 'OTP Token',
};

/**
 * GET /api/scrape/companies
 * Returns list of supported companies with their login fields.
 */
app.get('/api/scrape/companies', (_req, res) => {
  const companies = Object.entries(SCRAPERS).map(([id, meta]) => ({
    id,
    name: COMPANY_DISPLAY_NAMES[id] || meta.name,
    originalName: meta.name,
    loginFields: meta.loginFields.map((field) => ({
      name: field,
      label: FIELD_LABELS[field] || field,
      type: field === 'password' ? 'password' : 'text',
    })),
  }));

  res.json({ companies });
});

/**
 * POST /api/scrape
 * Body: { companyId: string, credentials: Record<string, string>, startDate?: string }
 * Runs the scraper and returns the transaction results.
 */
app.post('/api/scrape', async (req, res) => {
  const { companyId, credentials, startDate } = req.body;

  if (!companyId || !credentials) {
    return res.status(400).json({
      success: false,
      errorType: 'MISSING_PARAMS',
      errorMessage: 'companyId and credentials are required',
    });
  }

  // Validate companyId exists
  if (!CompanyTypes[companyId]) {
    return res.status(400).json({
      success: false,
      errorType: 'INVALID_COMPANY',
      errorMessage: `Unknown company: ${companyId}`,
    });
  }

  console.log(`[scrape] Starting scrape for ${companyId}...`);
  const scrapeStart = Date.now();

  try {
    const options = {
      companyId: CompanyTypes[companyId],
      startDate: startDate ? new Date(startDate) : (() => {
        // Default: 3 months back
        const d = new Date();
        d.setMonth(d.getMonth() - 3);
        return d;
      })(),
      combineInstallments: false,
      showBrowser: false,
      timeout: 120000, // 2 minutes
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    };

    const scraper = createScraper(options);
    const result = await scraper.scrape(credentials);

    const elapsed = ((Date.now() - scrapeStart) / 1000).toFixed(1);

    if (result.success) {
      const totalTxns = result.accounts.reduce((sum, acc) => sum + acc.txns.length, 0);
      console.log(`[scrape] ✅ ${companyId} — ${totalTxns} transactions in ${elapsed}s`);
      
      res.json({
        success: true,
        accounts: result.accounts.map((account) => ({
          accountNumber: account.accountNumber,
          balance: account.balance,
          txns: account.txns.map((txn) => ({
            type: txn.type,
            identifier: txn.identifier,
            date: txn.date,
            processedDate: txn.processedDate,
            originalAmount: txn.originalAmount,
            originalCurrency: txn.originalCurrency,
            chargedAmount: txn.chargedAmount,
            description: txn.description,
            memo: txn.memo,
            installments: txn.installments,
            status: txn.status,
          })),
        })),
      });
    } else {
      console.log(`[scrape] ❌ ${companyId} — ${result.errorType} (${elapsed}s)`);
      res.json({
        success: false,
        errorType: result.errorType,
        errorMessage: result.errorMessage || 'Unknown error',
      });
    }
  } catch (err) {
    const elapsed = ((Date.now() - scrapeStart) / 1000).toFixed(1);
    console.error(`[scrape] 💥 ${companyId} — exception (${elapsed}s):`, err.message);
    res.status(500).json({
      success: false,
      errorType: 'SERVER_ERROR',
      errorMessage: err.message,
    });
  }
});

// ── Health check ─────────────────────────────────────────────────────────────

app.get('/api/scrape/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🏦 Finstar Scraper Server running on port ${PORT}`);
  console.log(`   Companies: ${Object.keys(SCRAPERS).length} supported`);
});
