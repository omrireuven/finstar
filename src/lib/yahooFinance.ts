/**
 * Yahoo Finance API wrapper.
 * Uses a configurable CORS proxy (default: corsproxy.io) since Yahoo Finance
 * doesn't send CORS headers. Free plan: no hard rate limit — we use 60s polling.
 */

const YF_BASE = 'https://query2.finance.yahoo.com';

// Cache to prevent duplicate requests across mounts
const quoteCache: Record<string, { data: QuoteResult; timestamp: number }> = {};
const CACHE_TTL = 30000; // 30 seconds

function proxied(proxy: string, url: string): string {
  if (proxy === '/api/yahoo/') {
    return url.replace(/^https:\/\/query[12]\.finance\.yahoo\.com\//, '/api/yahoo/');
  }
  if (!proxy) return url;
  return proxy + encodeURIComponent(url);
}

export interface QuoteResult {
  ticker: string;
  price: number;
  prevClose: number;
  change: number;
  changePct: number;
  currency: string;
  marketState: 'REGULAR' | 'PRE' | 'POST' | 'CLOSED';
  timestamp: number;
}

export interface HistoricalPoint {
  date: string;  // ISO
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
}

/**
 * Fetch current quotes for multiple tickers.
 * One request per ticker using v8/finance/chart (most reliable endpoint).
 */
export async function fetchQuotes(
  tickers: string[],
  proxy: string
): Promise<Record<string, QuoteResult>> {
  const results: Record<string, QuoteResult> = {};
  const now = Date.now();

  for (const ticker of tickers) {
    // Check cache first
    if (quoteCache[ticker] && now - quoteCache[ticker].timestamp < CACHE_TTL) {
      results[ticker] = quoteCache[ticker].data;
      continue;
    }

    try {
      const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1m&range=1d&includePrePost=false`;
      const res = await fetch(proxied(proxy, url), {
        headers: { Accept: 'application/json' },
      });
      
      if (res.status === 429) {
        console.warn(`Yahoo Finance rate limited on ${ticker}, waiting 1s...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue; // Skip this one for now, we'll get it next poll
      }
      
      if (!res.ok) continue;
      
      const json = await res.json();
      const meta = json?.chart?.result?.[0]?.meta;
      if (!meta) continue;

      const price: number = meta.regularMarketPrice ?? meta.chartPreviousClose ?? 0;
      const prevClose: number = meta.chartPreviousClose ?? meta.previousClose ?? price;
      const change = price - prevClose;
      const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

      const quoteData = {
        ticker,
        price: +price.toFixed(4),
        prevClose: +prevClose.toFixed(4),
        change: +change.toFixed(4),
        changePct: +changePct.toFixed(2),
        currency: meta.currency ?? 'USD',
        marketState: meta.marketState ?? 'CLOSED',
        timestamp: Date.now(),
      };

      results[ticker] = quoteData;
      quoteCache[ticker] = { data: quoteData, timestamp: Date.now() };

      // Add a small delay to avoid hitting the rate limit
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (err) {
      // swallow — caller keeps stale price
    }
  }

  return results;
}

/**
 * Fetch historical daily closing prices for a single ticker.
 * range: 1mo | 3mo | 6mo | 1y | 2y | 5y
 */
export async function fetchHistory(
  ticker: string,
  proxy: string,
  range: '1mo' | '3mo' | '6mo' | '1y' | '2y' = '3mo'
): Promise<HistoricalPoint[]> {
  try {
    const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${range}`;
    const res = await fetch(proxied(proxy, url), {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return [];

    const timestamps: number[] = result.timestamp ?? [];
    const q = result.indicators?.quote?.[0] ?? {};
    const closes: number[] = q.close ?? [];
    const opens: number[] = q.open ?? [];
    const highs: number[] = q.high ?? [];
    const lows: number[] = q.low ?? [];
    const volumes: number[] = q.volume ?? [];

    return timestamps
      .map((ts, i) => ({
        date: new Date(ts * 1000).toISOString().slice(0, 10),
        close: closes[i] ?? 0,
        open: opens[i] ?? 0,
        high: highs[i] ?? 0,
        low: lows[i] ?? 0,
        volume: volumes[i] ?? 0,
      }))
      .filter((p) => p.close > 0);
  } catch (e) {
    return [];
  }
}

/** Returns true if US market is currently open (ET rough check). */
export function isMarketOpen(): boolean {
  const now = new Date();
  // Convert to ET (UTC-4 summer / UTC-5 winter; rough: UTC-4)
  const etHour = (now.getUTCHours() - 4 + 24) % 24;
  const etMin = now.getUTCMinutes();
  const etTime = etHour * 60 + etMin;
  const day = now.getUTCDay(); // 0=Sun 6=Sat
  if (day === 0 || day === 6) return false;
  // 9:30am–4:00pm ET
  return etTime >= 570 && etTime < 960;
}
