'use client'

import { useEffect, useRef } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { DEFAULT_LOCATION } from '@/lib/arxcian/weather'

type Props = {
  radarTileUrl: string
}

/**
 * Leaflet + OpenStreetMap-taustakartta + RainViewer-sadetutka.
 * Ei API-avaimia, ei maksullisia palveluita. Ladataan vain selaimessa,
 * koska Leaflet tarvitsee window/document-objektit.
 */
export function WeatherMap({ radarTileUrl }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    let cancelled = false

    import('leaflet').then(L => {
      if (cancelled || !containerRef.current || mapRef.current) return

      const map = L.map(containerRef.current, {
        center: [DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon],
        zoom: 6,
        zoomControl: true,
        attributionControl: true,
      })

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap, &copy; CARTO',
        maxZoom: 19,
      }).addTo(map)

      L.tileLayer(radarTileUrl, {
        opacity: 0.55,
        attribution: 'Tutka &copy; RainViewer',
      }).addTo(map)

      // Leaflet olettaa oletusmarkkerin kuvat suhteellisella polulla, joka ei
      // toimi bundlerin kanssa — korvataan CDN-URLeilla.
      const icon = L.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
      })

      L.marker([DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon], { icon })
        .addTo(map)
        .bindPopup(DEFAULT_LOCATION.name)

      mapRef.current = map
    })

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [radarTileUrl])

  return (
    <div
      ref={containerRef}
      className="h-72 w-full overflow-hidden rounded-lg border border-ax-line"
    />
  )
}
