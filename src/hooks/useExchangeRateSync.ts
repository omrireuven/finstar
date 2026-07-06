import { useEffect } from 'react';
import { useStore } from '../store';
import { useSettings } from '../store/settingsStore';
import { fetchQuotes } from '../lib/yahooFinance';

export function useExchangeRateSync() {
  const lastUpdate = useStore((s) => s.usdIlsLastUpdate);
  const setUsdIls = useStore((s) => s.setUsdIls);
  const corsProxy = useSettings((s) => s.corsProxy);

  useEffect(() => {
    const checkAndSync = async () => {
      const todayStr = new Date().toDateString();
      const lastUpdateDateStr = lastUpdate ? new Date(lastUpdate).toDateString() : '';
      
      if (lastUpdateDateStr !== todayStr) {
        try {
          const quotes = await fetchQuotes(['ILS=X'], corsProxy);
          const rate = quotes['ILS=X']?.price;
          if (rate && rate > 0) {
            setUsdIls(rate);
            console.log(`Auto-synced USD/ILS rate: ₪${rate}`);
          }
        } catch (err) {
          console.error('Failed to auto-sync USD/ILS exchange rate:', err);
        }
      }
    };
    
    checkAndSync();
    
    // Check hourly for day change
    const timer = setInterval(checkAndSync, 3600000);
    return () => clearInterval(timer);
  }, [lastUpdate, setUsdIls, corsProxy]);
}

export async function manualSyncExchangeRate(corsProxy: string): Promise<number | null> {
  try {
    const quotes = await fetchQuotes(['ILS=X'], corsProxy);
    const rate = quotes['ILS=X']?.price;
    if (rate && rate > 0) {
      return rate;
    }
    return null;
  } catch (err) {
    console.error('Failed to sync USD/ILS exchange rate:', err);
    return null;
  }
}
