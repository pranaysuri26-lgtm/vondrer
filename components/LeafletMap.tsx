'use client'

import { useEffect, useRef } from 'react'
import type { LocalPlace } from '@/app/api/trip/ask/route'

interface LeafletMapProps {
  places:        LocalPlace[]
  center:        { lat: number; lng: number; zoom: number }
  selectedIndex: number | null
  onSelect:      (index: number) => void
}

// Load Leaflet from CDN once, return when ready
function loadLeaflet(): Promise<unknown> {
  return new Promise((resolve) => {
    const w = window as Window & { L?: unknown }
    if (w.L) { resolve(w.L); return }

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id   = 'leaflet-css'
      link.rel  = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }

    const existing = document.getElementById('leaflet-js')
    if (existing) {
      existing.addEventListener('load', () => resolve(w.L))
      return
    }

    const script   = document.createElement('script')
    script.id      = 'leaflet-js'
    script.src     = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload  = () => resolve(w.L)
    document.head.appendChild(script)
  })
}

function markerHtml(num: number, selected: boolean): string {
  const size   = selected ? 34 : 26
  const bg     = selected ? '#C97552' : '#1a1410'
  const border = selected ? '#fff'    : '#C97552'
  const color  = selected ? '#fff'    : '#C97552'
  const shadow = selected ? '0 3px 12px rgba(201,117,82,0.45)' : '0 2px 6px rgba(0,0,0,0.35)'
  return `<div style="
    width:${size}px;height:${size}px;border-radius:50%;
    background:${bg};border:2px solid ${border};
    display:flex;align-items:center;justify-content:center;
    color:${color};font-size:11px;font-weight:700;font-family:system-ui;
    box-shadow:${shadow};cursor:pointer;transition:all 0.15s;
  ">${num}</div>`
}

export default function LeafletMap({ places, center, selectedIndex, onSelect }: LeafletMapProps) {
  const containerRef   = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef         = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef     = useRef<any[]>([])
  const selectedRef    = useRef<number | null>(selectedIndex)
  const onSelectRef    = useRef(onSelect)

  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])
  useEffect(() => { selectedRef.current = selectedIndex }, [selectedIndex])

  // ── Init map once ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false

    loadLeaflet().then((L: unknown) => {
      if (cancelled || !containerRef.current || mapRef.current) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Lmap = L as any

      const map = Lmap.map(containerRef.current, {
        zoomControl:      false,
        scrollWheelZoom:  false,
        attributionControl: false,
      }).setView([center.lat, center.lng], center.zoom)

      mapRef.current = map

      // Light CartoDB tiles for editorial look
      Lmap.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom:    20,
      }).addTo(map)

      Lmap.control.zoom({ position: 'bottomright' }).addTo(map)
      Lmap.control.attribution({ position: 'bottomleft', prefix: '© OSM © Carto' }).addTo(map)

      // Add markers
      places.forEach((place, i) => {
        if (place.lat == null || place.lng == null) return

        const selected = selectedRef.current === i
        const icon = Lmap.divIcon({
          html:       markerHtml(i + 1, selected),
          className:  '',
          iconSize:   [selected ? 34 : 26, selected ? 34 : 26],
          iconAnchor: [selected ? 17 : 13, selected ? 17 : 13],
        })

        const marker = Lmap.marker([place.lat, place.lng], { icon })
        marker.addTo(map)
        marker.on('click', () => onSelectRef.current(i))
        markersRef.current[i] = marker
      })
    })

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current   = null
        markersRef.current = []
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally run once

  // ── Update markers when selection changes ─────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return
    const w = window as Window & { L?: unknown }
    if (!w.L) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Lmap = w.L as any

    markersRef.current.forEach((marker, i) => {
      if (!marker) return
      const selected = i === selectedIndex
      const icon = Lmap.divIcon({
        html:       markerHtml(i + 1, selected),
        className:  '',
        iconSize:   [selected ? 34 : 26, selected ? 34 : 26],
        iconAnchor: [selected ? 17 : 13, selected ? 17 : 13],
      })
      marker.setIcon(icon)
    })

    if (selectedIndex != null && places[selectedIndex]?.lat != null) {
      mapRef.current.panTo(
        [places[selectedIndex].lat, places[selectedIndex].lng],
        { animate: true, duration: 0.4 }
      )
    }
  }, [selectedIndex, places])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%' }}
      className="rounded-2xl overflow-hidden"
    />
  )
}
