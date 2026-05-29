import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

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

  // Firebase
  firebaseConfig: FirebaseConfig | null;
  firebaseEnabled: boolean;

  // Actions
  update: (patch: Partial<Omit<SettingsState, 'update'>>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      corsProxy: 'https://corsproxy.io/?',
      stockRefreshSec: 60,

      telegramBotToken: '',
      telegramChatId: '',
      notifyBudgetOverrun: true,
      notifySavingsExpiry: true,
      notifyRecurringCharge: true,
      notifyPortfolioChange: 3,

      firebaseConfig: null,
      firebaseEnabled: false,

      update: (patch) => set((s) => ({ ...s, ...patch })),
    }),
    { name: 'finstar-settings' }
  )
);
