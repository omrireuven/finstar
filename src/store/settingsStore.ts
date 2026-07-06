import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

const apiUrl = typeof window === 'undefined' ? 'http://localhost:3002/api/settings' : '/api/settings';

const serverStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const res = await fetch(apiUrl);
      if (res.ok) {
        const data = await res.json();
        if (!data || Object.keys(data).length === 0 || data.state === null) {
          console.log('Server returned empty data, falling back to local storage');
          if (typeof window !== 'undefined' && window.localStorage) return window.localStorage.getItem(name);
          return null;
        }
        return JSON.stringify(data);
      }
    } catch (e) {
      console.warn('Failed to fetch settings from server, falling back to local storage', e);
      if (typeof window !== 'undefined' && window.localStorage) return window.localStorage.getItem(name);
    }
    return null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: value,
      });
      if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(name, value);
    } catch (e) {
      console.warn('Failed to save settings to server, saving locally', e);
      if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(name, value);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.removeItem(name);
  },
};

import type { BankAccountConfig } from '../types';

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

  // Bank scraper
  bankAccounts: BankAccountConfig[];
  autoSyncIntervalMinutes: number;
  autoSyncDaysBack: number; // how far back to scrape during sync

  // AI Categorization
  llmApiKey: string;
  llmApiKey2?: string;
  llmApiKey3?: string;
  llmProvider: 'gemini' | 'openai';
  llmModel: string;
  aiConfidenceThreshold: number; // 0-100% confidence threshold for AI auto-assignment
  activeAiModel?: string;
  failedAiModels?: string[];
  aiDebugHistory?: { model: string; prompt: string; response: string; status: 'loading' | 'success' | 'failed' }[];

  // Actions
  update: (patch: Partial<Omit<SettingsState, 'update' | 'addBankAccount' | 'updateBankAccount' | 'removeBankAccount'>>) => void;
  addBankAccount: (account: BankAccountConfig) => void;
  updateBankAccount: (id: string, patch: Partial<BankAccountConfig>) => void;
  removeBankAccount: (id: string) => void;
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

      bankAccounts: [],
      autoSyncIntervalMinutes: 60,
      autoSyncDaysBack: 30,

      llmApiKey: '',
      llmApiKey2: '',
      llmApiKey3: '',
      llmProvider: 'gemini',
      llmModel: 'gemini-flash-lite-latest',
      aiConfidenceThreshold: 80,
      activeAiModel: '',
      aiDebugHistory: [],

      update: (patch) => set((s) => ({ ...s, ...patch })),
      addBankAccount: (account) => set((s) => ({ bankAccounts: [...s.bankAccounts, account] })),
      updateBankAccount: (id, patch) => set((s) => ({
        bankAccounts: s.bankAccounts.map((a) => a.id === id ? { ...a, ...patch } : a),
      })),
      removeBankAccount: (id) => set((s) => ({
        bankAccounts: s.bankAccounts.filter((a) => a.id !== id),
      })),
    }),
    { 
      name: 'finstar-settings',
      storage: createJSONStorage(() => serverStorage)
    }
  )
);
