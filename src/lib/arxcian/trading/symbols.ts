import type { AssetClass } from './types'

export type QuoteProvider = 'twelvedata' | 'yahoo'

export type WatchSymbol = {
  /** Datalähteen oma symboli. Twelve Data: "EUR/USD", "AAPL". Yahoo: "CL=F", "^GSPC". */
  quoteSymbol: string
  quoteProvider: QuoteProvider
  /** TradingView-symboli kaaviowidgetille, muotoa PALVELU:TICKER */
  tvSymbol: string
  label: string
  assetClass: AssetClass
}

// Kaikki quoteSymbol/quoteProvider-parit on testattu käsin toimiviksi
// 2026-07-27 ennen lisäystä. Twelve Datan ilmaistaso ei sisällä indeksejä
// eikä hyödykkeitä (öljy, US500, NAS100 palauttavat 403), ja DXY:lle ei
// löytynyt toimivaa Twelve Data -symbolia lainkaan ("USDX" palauttaa väärän
// instrumentin, arvo ei vastaa oikeaa dollari-indeksiä). Nämä neljä haetaan
// Yahoo Financen dokumentoimattomasta chart-APIsta sen sijaan — ilmainen ja
// toimii, mutta epävirallinen, ei SLA:ta. Merkitty UI:ssa erikseen.
//
// TradingView-symbolit ovat vakiintuneita julkisia merkintätapoja, eivät
// riipu kummastakaan datalähteestä.
export const WATCHLIST: readonly WatchSymbol[] = [
  { quoteSymbol: 'CL=F', quoteProvider: 'yahoo', tvSymbol: 'TVC:USOIL', label: 'Öljy (WTI)', assetClass: 'commodity' },
  { quoteSymbol: 'BTC/USD', quoteProvider: 'twelvedata', tvSymbol: 'BINANCE:BTCUSDT', label: 'BTC', assetClass: 'crypto' },
  { quoteSymbol: 'ETH/USD', quoteProvider: 'twelvedata', tvSymbol: 'BINANCE:ETHUSDT', label: 'ETH', assetClass: 'crypto' },
  { quoteSymbol: '^GSPC', quoteProvider: 'yahoo', tvSymbol: 'TVC:SPX', label: 'US500', assetClass: 'index' },
  { quoteSymbol: '^NDX', quoteProvider: 'yahoo', tvSymbol: 'TVC:NDX', label: 'NAS100', assetClass: 'index' },
  { quoteSymbol: 'XAU/USD', quoteProvider: 'twelvedata', tvSymbol: 'OANDA:XAUUSD', label: 'XAUUSD', assetClass: 'commodity' },
  { quoteSymbol: 'DX-Y.NYB', quoteProvider: 'yahoo', tvSymbol: 'TVC:DXY', label: 'DXY', assetClass: 'index' },
  { quoteSymbol: 'EUR/USD', quoteProvider: 'twelvedata', tvSymbol: 'FX:EURUSD', label: 'EURUSD', assetClass: 'forex' },
  { quoteSymbol: 'GBP/USD', quoteProvider: 'twelvedata', tvSymbol: 'FX:GBPUSD', label: 'GBPUSD', assetClass: 'forex' },
  { quoteSymbol: 'USD/JPY', quoteProvider: 'twelvedata', tvSymbol: 'FX:USDJPY', label: 'USDJPY', assetClass: 'forex' },

  // Top 10 osaketta — oma valintani markkina-arvon mukaan, helppo vaihtaa.
  { quoteSymbol: 'AAPL', quoteProvider: 'twelvedata', tvSymbol: 'NASDAQ:AAPL', label: 'AAPL', assetClass: 'stock' },
  { quoteSymbol: 'MSFT', quoteProvider: 'twelvedata', tvSymbol: 'NASDAQ:MSFT', label: 'MSFT', assetClass: 'stock' },
  { quoteSymbol: 'NVDA', quoteProvider: 'twelvedata', tvSymbol: 'NASDAQ:NVDA', label: 'NVDA', assetClass: 'stock' },
  { quoteSymbol: 'GOOGL', quoteProvider: 'twelvedata', tvSymbol: 'NASDAQ:GOOGL', label: 'GOOGL', assetClass: 'stock' },
  { quoteSymbol: 'AMZN', quoteProvider: 'twelvedata', tvSymbol: 'NASDAQ:AMZN', label: 'AMZN', assetClass: 'stock' },
  { quoteSymbol: 'META', quoteProvider: 'twelvedata', tvSymbol: 'NASDAQ:META', label: 'META', assetClass: 'stock' },
  { quoteSymbol: 'TSLA', quoteProvider: 'twelvedata', tvSymbol: 'NASDAQ:TSLA', label: 'TSLA', assetClass: 'stock' },
  { quoteSymbol: 'BRK.B', quoteProvider: 'twelvedata', tvSymbol: 'NYSE:BRK.B', label: 'BRK.B', assetClass: 'stock' },
  { quoteSymbol: 'AVGO', quoteProvider: 'twelvedata', tvSymbol: 'NASDAQ:AVGO', label: 'AVGO', assetClass: 'stock' },
  { quoteSymbol: 'JPM', quoteProvider: 'twelvedata', tvSymbol: 'NYSE:JPM', label: 'JPM', assetClass: 'stock' },

  // 5–10 ajankohtaista kryptoa — oma valintani, helppo vaihtaa.
  { quoteSymbol: 'SOL/USD', quoteProvider: 'twelvedata', tvSymbol: 'BINANCE:SOLUSDT', label: 'SOL', assetClass: 'crypto' },
  { quoteSymbol: 'XRP/USD', quoteProvider: 'twelvedata', tvSymbol: 'BINANCE:XRPUSDT', label: 'XRP', assetClass: 'crypto' },
  { quoteSymbol: 'BNB/USD', quoteProvider: 'twelvedata', tvSymbol: 'BINANCE:BNBUSDT', label: 'BNB', assetClass: 'crypto' },
  { quoteSymbol: 'DOGE/USD', quoteProvider: 'twelvedata', tvSymbol: 'BINANCE:DOGEUSDT', label: 'DOGE', assetClass: 'crypto' },
  { quoteSymbol: 'ADA/USD', quoteProvider: 'twelvedata', tvSymbol: 'BINANCE:ADAUSDT', label: 'ADA', assetClass: 'crypto' },
  { quoteSymbol: 'AVAX/USD', quoteProvider: 'twelvedata', tvSymbol: 'BINANCE:AVAXUSDT', label: 'AVAX', assetClass: 'crypto' },
]
