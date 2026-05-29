/**
 * Auto-refreshes stock prices on a timer based on the free-plan interval.
 * Yahoo Finance free plan: we use 60s during market hours, 5 min outside.
 */
import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { useSettings } from '../store/settingsStore';
import { fetchQuotes, isMarketOpen } from '../lib/yahooFinance';
import { sendMessage, alertPortfolioChange } from '../lib/telegram';

export function useStockSync() {
  const { lots, prices: storedPrices, updatePrices } = useStore();
  const { corsProxy, stockRefreshSec, telegramBotToken, telegramChatId, notifyPortfolioChange } = useSettings();
  const sentAlerts = useRef(new Set<string>());

  const tickers = [...new Set(lots.filter((l) => !l.sellDate).map((l) => l.ticker))];

  async function refresh() {
    if (tickers.length === 0) return;
    const quotes = await fetchQuotes(tickers, corsProxy);

    const newPrices: Record<string, number> = {};
    for (const [ticker, q] of Object.entries(quotes)) {
      newPrices[ticker] = q.price;

      // Telegram alert: significant daily change
      if (notifyPortfolioChange > 0 && telegramBotToken && telegramChatId) {
        const alertKey = `${ticker}-${new Date().toDateString()}`;
        if (Math.abs(q.changePct) >= notifyPortfolioChange && !sentAlerts.current.has(alertKey)) {
          sentAlerts.current.add(alertKey);
          sendMessage(
            telegramBotToken,
            telegramChatId,
            alertPortfolioChange(ticker, q.changePct, q.price)
          );
        }
      }
    }

    if (Object.keys(newPrices).length > 0) {
      updatePrices({ ...storedPrices, ...newPrices });
    }
  }

  useEffect(() => {
    if (tickers.length === 0) return;
    refresh();
    const interval = isMarketOpen() ? stockRefreshSec * 1000 : stockRefreshSec * 5 * 1000;
    const timer = setInterval(refresh, interval);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers.join(','), corsProxy, stockRefreshSec]);
}
