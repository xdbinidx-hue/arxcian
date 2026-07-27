import type { AssetClass } from './types'

export type WatchSymbol = {
  /** Yahoo Financen chart-APIn symboli, esim. "AAPL", "EURUSD=X", "BTC-USD". */
  quoteSymbol: string
  /** TradingView-symboli kaaviowidgetille, muotoa PALVELU:TICKER */
  tvSymbol: string
  label: string
  assetClass: AssetClass
}

// Kaikki quoteSymbol-arvot testattu käsin toimiviksi Yahoo Financen
// dokumentoimattomasta chart-APIsta 2026-07-27. Yksi lähde riittää — Yahoo
// kattaa kaikki omaisuusluokat (osakkeet, forex, krypto, indeksit,
// hyödykkeet), toisin kuin Twelve Datan ilmaistaso joka ei kata indeksejä
// eikä hyödykkeitä. Kultaa haetaan futuurimuodolla (GC=F) — spot-muoto
// (XAUUSD=X) ei löydy Yahoolta.
//
// TradingView-symbolit ovat vakiintuneita julkisia merkintätapoja, eivät
// riipu datalähteestä.
export const WATCHLIST: readonly WatchSymbol[] = [
  { quoteSymbol: 'CL=F', tvSymbol: 'TVC:USOIL', label: 'Öljy (WTI)', assetClass: 'commodity' },
  { quoteSymbol: 'BTC-USD', tvSymbol: 'BINANCE:BTCUSDT', label: 'BTC', assetClass: 'crypto' },
  { quoteSymbol: 'ETH-USD', tvSymbol: 'BINANCE:ETHUSDT', label: 'ETH', assetClass: 'crypto' },
  { quoteSymbol: '^GSPC', tvSymbol: 'TVC:SPX', label: 'US500', assetClass: 'index' },
  { quoteSymbol: '^NDX', tvSymbol: 'TVC:NDX', label: 'NAS100', assetClass: 'index' },
  { quoteSymbol: 'GC=F', tvSymbol: 'OANDA:XAUUSD', label: 'XAUUSD', assetClass: 'commodity' },
  { quoteSymbol: 'DX-Y.NYB', tvSymbol: 'TVC:DXY', label: 'DXY', assetClass: 'index' },
  { quoteSymbol: 'EURUSD=X', tvSymbol: 'FX:EURUSD', label: 'EURUSD', assetClass: 'forex' },
  { quoteSymbol: 'GBPUSD=X', tvSymbol: 'FX:GBPUSD', label: 'GBPUSD', assetClass: 'forex' },
  { quoteSymbol: 'USDJPY=X', tvSymbol: 'FX:USDJPY', label: 'USDJPY', assetClass: 'forex' },

  // Top 10 osaketta — oma valintani markkina-arvon mukaan, helppo vaihtaa.
  { quoteSymbol: 'AAPL', tvSymbol: 'NASDAQ:AAPL', label: 'AAPL', assetClass: 'stock' },
  { quoteSymbol: 'MSFT', tvSymbol: 'NASDAQ:MSFT', label: 'MSFT', assetClass: 'stock' },
  { quoteSymbol: 'NVDA', tvSymbol: 'NASDAQ:NVDA', label: 'NVDA', assetClass: 'stock' },
  { quoteSymbol: 'GOOGL', tvSymbol: 'NASDAQ:GOOGL', label: 'GOOGL', assetClass: 'stock' },
  { quoteSymbol: 'AMZN', tvSymbol: 'NASDAQ:AMZN', label: 'AMZN', assetClass: 'stock' },
  { quoteSymbol: 'META', tvSymbol: 'NASDAQ:META', label: 'META', assetClass: 'stock' },
  { quoteSymbol: 'TSLA', tvSymbol: 'NASDAQ:TSLA', label: 'TSLA', assetClass: 'stock' },
  { quoteSymbol: 'BRK-B', tvSymbol: 'NYSE:BRK.B', label: 'BRK.B', assetClass: 'stock' },
  { quoteSymbol: 'AVGO', tvSymbol: 'NASDAQ:AVGO', label: 'AVGO', assetClass: 'stock' },
  { quoteSymbol: 'JPM', tvSymbol: 'NYSE:JPM', label: 'JPM', assetClass: 'stock' },

  // 5–10 ajankohtaista kryptoa — oma valintani, helppo vaihtaa.
  { quoteSymbol: 'SOL-USD', tvSymbol: 'BINANCE:SOLUSDT', label: 'SOL', assetClass: 'crypto' },
  { quoteSymbol: 'XRP-USD', tvSymbol: 'BINANCE:XRPUSDT', label: 'XRP', assetClass: 'crypto' },
  { quoteSymbol: 'BNB-USD', tvSymbol: 'BINANCE:BNBUSDT', label: 'BNB', assetClass: 'crypto' },
  { quoteSymbol: 'DOGE-USD', tvSymbol: 'BINANCE:DOGEUSDT', label: 'DOGE', assetClass: 'crypto' },
  { quoteSymbol: 'ADA-USD', tvSymbol: 'BINANCE:ADAUSDT', label: 'ADA', assetClass: 'crypto' },
  { quoteSymbol: 'AVAX-USD', tvSymbol: 'BINANCE:AVAXUSDT', label: 'AVAX', assetClass: 'crypto' },
]

/**
 * Hubin etusivun tiivis markkinanäkymä — kuusi makrosymbolia koko
 * watchlistin sijaan. Poimitaan WATCHLISTista, jotta nimet ja symbolit
 * pysyvät yhdessä paikassa.
 */
const HUB_QUOTE_SYMBOLS = ['^GSPC', '^NDX', 'BTC-USD', 'GC=F', 'DX-Y.NYB', 'EURUSD=X']

export const HUB_SYMBOLS: readonly WatchSymbol[] = HUB_QUOTE_SYMBOLS.map(symbol => {
  const found = WATCHLIST.find(w => w.quoteSymbol === symbol)
  if (!found) throw new Error(`HUB_SYMBOLS: symbolia ${symbol} ei ole WATCHLISTissa`)
  return found
})
