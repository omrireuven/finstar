import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SettingsState {
  // Stock API
  corsProxy: string;           // e.g. 'https://corsproxy.io/?'
  stockRefreshSec: number;     // seconds between refreshes (free plan: 60)

  // Telegram
  telegramBotToken: string;
  telegramChatId: string;
  notifyBudgetOverrun: boolean;
  notifySavingsExpiry: boolean;
  notifyRecurringCharge: boolean;
  notifyPortfolioChange: number; // % threshold, 0 = disabled

  // Portfolio summary
  notifyPortfolioSummary: boolean;
  portfolioSummaryTime: string;   // "HH:MM" local time
  portfolioSummaryDays: number[]; // 0=Sun…6=Sat; empty array = every day

  // Telegram incoming messages (polling)
  telegramPollingEnabled: boolean;
  lastTelegramUpdateId: number; // last processed update_id (for offset)

  // Automatic Telegram summaries
  dailySummaryEnabled: boolean;
  dailySummaryTime: string;       // "HH:MM"
  weeklySummaryEnabled: boolean;  // sent every Sunday at 09:00
  monthlySummaryEnabled: boolean; // sent on 1st of month at 09:00
  lastDailySummaryDate: string;   // "YYYY-MM-DD"
  lastWeeklySummaryKey: string;   // "YYYY-Www"
  lastMonthlySummaryKey: string;  // "YYYY-MM"

  // Actions
  update: (patch: Partial<Omit<SettingsState, 'update'>>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      corsProxy: '/api/yahoo/',
      stockRefreshSec: 60,

      telegramBotToken: '',
      telegramChatId: '',
      notifyBudgetOverrun: true,
      notifySavingsExpiry: true,
      notifyRecurringCharge: true,
      notifyPortfolioChange: 3,

      notifyPortfolioSummary: false,
      portfolioSummaryTime: '09:00',
      portfolioSummaryDays: [],

      telegramPollingEnabled: false,
      lastTelegramUpdateId: 0,

      dailySummaryEnabled: false,
      dailySummaryTime: '20:00',
      weeklySummaryEnabled: false,
      monthlySummaryEnabled: false,
      lastDailySummaryDate: '',
      lastWeeklySummaryKey: '',
      lastMonthlySummaryKey: '',

      update: (patch) => set((s) => ({ ...s, ...patch })),
    }),
    { name: 'finstar-settings' }
  )
);
