/**
 * Persistent local cache for Yahoo Finance historical OHLCV data.
 * Keyed by "TICKER:range" (e.g. "AAPL:3mo").
 * TTL: 1 hour — daily candles don't change during the day.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { HistoricalPoint } from '../lib/yahooFinance';

export const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface CacheEntry {
  data: HistoricalPoint[];
  fetchedAt: number;
}

interface HistoryCacheStore {
  entries: Record<string, CacheEntry>;
  setEntry: (key: string, data: HistoricalPoint[]) => void;
  clearAll: () => void;
}

export const useHistoryCache = create<HistoryCacheStore>()(
  persist(
    (set) => ({
      entries: {},
      setEntry: (key, data) =>
        set((s) => ({
          entries: { ...s.entries, [key]: { data, fetchedAt: Date.now() } },
        })),
      clearAll: () => set({ entries: {} }),
    }),
    { name: 'finstar-history-cache' }
  )
);

/** Read from cache without triggering a React subscription. */
export function getCached(key: string): HistoricalPoint[] | null {
  const e = useHistoryCache.getState().entries[key];
  if (!e) return null;
  if (Date.now() - e.fetchedAt > CACHE_TTL_MS) return null;
  return e.data;
}
