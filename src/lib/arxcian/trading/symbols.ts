import type { AssetClass } from './types'

export type WatchSymbol = {
  /** Twelve Data -symboli watchlistin kursseille (vahvistetaan kun API-avain on käytössä) */
  quoteSymbol: string
  /** TradingView-symboli kaaviowidgetille, muotoa PALVELU:TICKER */
  tvSymbol: string
  label: string
  assetClass: AssetClass
}

// TradingView-symbolit ovat vakiintuneita julkisia merkintätapoja (OANDA/FX
// forexille, TVC indekseille ja DXY:lle, BINANCE kryptolle, pörssilyhenteet
// osakkeille) — nämä toimivat suoraan kaaviowidgetissä.
//
// quoteSymbol on alustava arvaus Twelve Datan symbolimuodosta. Vahvistetaan
// ja korjataan tarvittaessa kun API-avain on käytössä ja voidaan testata
// oikeasti — ks. CLAUDE.md.
export const WATCHLIST: readonly WatchSymbol[] = [
  { quoteSymbol: 'WTI/USD', tvSymbol: 'TVC:USOIL', label: 'Öljy (WTI)', assetClass: 'commodity' },
  { quoteSymbol: 'BTC/USD', tvSymbol: 'BINANCE:BTCUSDT', label: 'BTC', assetClass: 'crypto' },
  { quoteSymbol: 'ETH/USD', tvSymbol: 'BINANCE:ETHUSDT', label: 'ETH', assetClass: 'crypto' },
  { quoteSymbol: 'SPX', tvSymbol: 'TVC:SPX', label: 'US500', assetClass: 'index' },
  { quoteSymbol: 'NDX', tvSymbol: 'TVC:NDX', label: 'NAS100', assetClass: 'index' },
  { quoteSymbol: 'XAU/USD', tvSymbol: 'OANDA:XAUUSD', label: 'XAUUSD', assetClass: 'commodity' },
  { quoteSymbol: 'DXY', tvSymbol: 'TVC:DXY', label: 'DXY', assetClass: 'index' },
  { quoteSymbol: 'EUR/USD', tvSymbol: 'FX:EURUSD', label: 'EURUSD', assetClass: 'forex' },
  { quoteSymbol: 'GBP/USD', tvSymbol: 'FX:GBPUSD', label: 'GBPUSD', assetClass: 'forex' },
  { quoteSymbol: 'USD/JPY', tvSymbol: 'FX:USDJPY', label: 'USDJPY', assetClass: 'forex' },

  // Top 10 osaketta — oma valintani markkina-arvon mukaan, helppo vaihtaa.
  { quoteSymbol: 'AAPL', tvSymbol: 'NASDAQ:AAPL', label: 'AAPL', assetClass: 'stock' },
  { quoteSymbol: 'MSFT', tvSymbol: 'NASDAQ:MSFT', label: 'MSFT', assetClass: 'stock' },
  { quoteSymbol: 'NVDA', tvSymbol: 'NASDAQ:NVDA', label: 'NVDA', assetClass: 'stock' },
  { quoteSymbol: 'GOOGL', tvSymbol: 'NASDAQ:GOOGL', label: 'GOOGL', assetClass: 'stock' },
  { quoteSymbol: 'AMZN', tvSymbol: 'NASDAQ:AMZN', label: 'AMZN', assetClass: 'stock' },
  { quoteSymbol: 'META', tvSymbol: 'NASDAQ:META', label: 'META', assetClass: 'stock' },
  { quoteSymbol: 'TSLA', tvSymbol: 'NASDAQ:TSLA', label: 'TSLA', assetClass: 'stock' },
  { quoteSymbol: 'BRK.B', tvSymbol: 'NYSE:BRK.B', label: 'BRK.B', assetClass: 'stock' },
  { quoteSymbol: 'AVGO', tvSymbol: 'NASDAQ:AVGO', label: 'AVGO', assetClass: 'stock' },
  { quoteSymbol: 'JPM', tvSymbol: 'NYSE:JPM', label: 'JPM', assetClass: 'stock' },

  // 5–10 ajankohtaista kryptoa — oma valintani, helppo vaihtaa.
  { quoteSymbol: 'SOL/USD', tvSymbol: 'BINANCE:SOLUSDT', label: 'SOL', assetClass: 'crypto' },
  { quoteSymbol: 'XRP/USD', tvSymbol: 'BINANCE:XRPUSDT', label: 'XRP', assetClass: 'crypto' },
  { quoteSymbol: 'BNB/USD', tvSymbol: 'BINANCE:BNBUSDT', label: 'BNB', assetClass: 'crypto' },
  { quoteSymbol: 'DOGE/USD', tvSymbol: 'BINANCE:DOGEUSDT', label: 'DOGE', assetClass: 'crypto' },
  { quoteSymbol: 'ADA/USD', tvSymbol: 'BINANCE:ADAUSDT', label: 'ADA', assetClass: 'crypto' },
  { quoteSymbol: 'AVAX/USD', tvSymbol: 'BINANCE:AVAXUSDT', label: 'AVAX', assetClass: 'crypto' },
]
