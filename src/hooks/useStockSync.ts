/**
 * Auto-refreshes stock prices on a timer based on the free-plan interval.
 * Yahoo Finance free plan: we use 60s during market hours, 5 min outside.
 * Also handles scheduled portfolio summary image via Telegram.
 */
import { useEffect, useRef } from 'react';
import { useStore, usePortfolioSummary } from '../store';
import { useSettings } from '../store/settingsStore';
import { fetchQuotes, isMarketOpen } from '../lib/yahooFinance';
import { sendMessage, sendPhoto, alertPortfolioChange } from '../lib/telegram';
import { capturePortfolioChart } from '../utils/capturePortfolioChart';

export function useStockSync() {
  const { lots, prices: storedPrices, updatePrices, usdIls } = useStore();
  const { rows: portfolioRows } = usePortfolioSummary();
  const {
    corsProxy, stockRefreshSec,
    telegramBotToken, telegramChatId,
    notifyPortfolioChange,
    notifyPortfolioSummary, portfolioSummaryTime, portfolioSummaryDays,
  } = useSettings();
  const sentAlerts = useRef(new Set<string>());
  const lastSummarySent = useRef<string>('');

  const tickers = [...new Set(lots.filter((l) => !l.sellDate).map((l) => l.ticker))];

  async function refresh() {
    if (tickers.length === 0) return;
    const quotes = await fetchQuotes(tickers, corsProxy);

    const newPrices: Record<string, number> = {};
    for (const [ticker, q] of Object.entries(quotes)) {
      newPrices[ticker] = q.price;

      if (notifyPortfolioChange > 0 && telegramBotToken && telegramChatId) {
        const alertKey = `${ticker}-${new Date().toDateString()}`;
        if (Math.abs(q.changePct) >= notifyPortfolioChange && !sentAlerts.current.has(alertKey)) {
          sentAlerts.current.add(alertKey);
          sendMessage(telegramBotToken, telegramChatId, alertPortfolioChange(ticker, q.changePct, q.price));
        }
      }
    }

    if (Object.keys(newPrices).length > 0) {
      updatePrices({ ...storedPrices, ...newPrices });
    }
  }

  function checkSummarySchedule() {
    if (!notifyPortfolioSummary || !telegramBotToken || !telegramChatId || portfolioRows.length === 0) return;
    const now = new Date();
    const [hh, mm] = portfolioSummaryTime.split(':').map(Number);
    const dayMatch = portfolioSummaryDays.length === 0 || portfolioSummaryDays.includes(now.getDay());
    if (!dayMatch) return;

    const minuteKey = `${now.toDateString()}-${hh}:${mm}`;
    if (lastSummarySent.current === minuteKey) return;
    if (now.getHours() !== hh || now.getMinutes() !== mm) return;

    lastSummarySent.current = minuteKey;

    // Send portfolio chart image
    capturePortfolioChart(lots, usdIls, corsProxy, portfolioRows)
      .then((blob) => {
        const date = new Date().toLocaleDateString('he-IL');
        sendPhoto(telegramBotToken, telegramChatId, blob, `📊 סיכום תיק מניות — ${date}`);
      })
      .catch(() => {/* silent fail for scheduled sends */});
  }

  useEffect(() => {
    if (tickers.length === 0) return;
    refresh();
    const interval = isMarketOpen() ? stockRefreshSec * 1000 : stockRefreshSec * 5 * 1000;
    const timer = setInterval(refresh, interval);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers.join(','), corsProxy, stockRefreshSec]);

  // Check summary schedule every minute
  useEffect(() => {
    if (!notifyPortfolioSummary) return;
    const timer = setInterval(checkSummarySchedule, 60_000);
    checkSummarySchedule();
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifyPortfolioSummary, portfolioSummaryTime, portfolioSummaryDays.join(','), telegramBotToken, telegramChatId]);
}
