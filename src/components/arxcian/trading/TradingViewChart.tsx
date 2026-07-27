'use client'

import { useEffect, useRef } from 'react'

type Props = {
  symbol: string
}

/**
 * TradingViewn ilmainen upotettava kaaviowidget. Ei vaadi tiliä eikä
 * API-avainta — TradingView itsessään ei tarjoa julkista data-APIa,
 * vain tämän widgetin kaltaisia upotuksia. Watchlistin kurssiluvut
 * (hälytyksiä varten) tulevat erikseen Yahoo Financesta.
 */
export function TradingViewChart({ symbol }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    containerRef.current.innerHTML = ''

    const widgetDiv = document.createElement('div')
    widgetDiv.className = 'tradingview-widget-container__widget'
    widgetDiv.style.height = '100%'
    widgetDiv.style.width = '100%'
    containerRef.current.appendChild(widgetDiv)

    const script = document.createElement('script')
    script.type = 'text/javascript'
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.async = true
    script.text = JSON.stringify({
      allow_symbol_change: false,
      calendar: false,
      details: false,
      hide_side_toolbar: true,
      hide_top_toolbar: false,
      hide_legend: true,
      hide_volume: false,
      hotlist: false,
      interval: '60',
      locale: 'fi',
      save_image: false,
      style: '1',
      symbol,
      theme: 'dark',
      timezone: 'Europe/Helsinki',
      backgroundColor: '#05070a',
      gridColor: 'rgba(148, 180, 210, 0.06)',
      watchlist: [],
      withdateranges: false,
      compareSymbols: [],
      studies: [],
      autosize: true,
    })
    containerRef.current.appendChild(script)
  }, [symbol])

  return (
    <div className="tradingview-widget-container h-full w-full" ref={containerRef} />
  )
}
