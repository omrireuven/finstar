/**
 * Full-data JSON backup, mirroring the "ייצא JSON" export button in
 * Settings.tsx exactly (same keys, same bank-credential exclusion), so the
 * Telegram backup button produces an identical file without opening the app.
 */
import fs from 'fs';

const DB_FILE = process.env.DB_FILE || './finstar-db.json';
const SETTINGS_FILE = process.env.SETTINGS_FILE || '../finstar-settings.json';

// Keep in sync with DATA_KEYS in src/pages/Settings.tsx
const DATA_KEYS = [
  'transactions', 'recurring', 'lots', 'savings', 'gemel', 'hishtalmut',
  'pension', 'income', 'goals', 'journal', 'categories', 'categoryRules',
  'aiRecommendations', 'settings',
];

function readJson(file) {
  try {
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    return {};
  }
}

/** @returns {Buffer} UTF-8 JSON buffer, same shape as the website's export file */
export function buildBackupBuffer() {
  const dbState = readJson(DB_FILE).state || {};
  const settingsState = readJson(SETTINGS_FILE).state || {};

  const dataToExport = {};
  for (const key of DATA_KEYS) {
    if (key === 'settings') {
      const { bankAccounts, ...safeSettings } = settingsState; // never export bank credentials
      dataToExport.settings = safeSettings;
    } else if (key === 'categoryRules') {
      dataToExport.categoryRules = dbState.categoryRules || {};
      dataToExport.categoryRulesMeta = dbState.categoryRulesMeta || {};
    } else {
      dataToExport[key] = dbState[key];
    }
  }

  return Buffer.from(JSON.stringify(dataToExport, null, 2), 'utf-8');
}
