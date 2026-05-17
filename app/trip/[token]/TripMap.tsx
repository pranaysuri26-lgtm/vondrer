'use client'

import { useEffect, useRef, useState } from 'react'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface MapPin {
  id:          string
  name:        string
  day:         number    // global day number (1-based across all destinations)
  slot:        string    // 'Morning' | 'Afternoon' | 'Dinner' | 'Evening'
  destination: string   // city name for geocoding context
  country:     string
}

interface GeoPin extends MapPin {
  lat: number
  lng: number
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const DAY_COLORS = [
  '#C97552', // terracotta  — Day 1
  '#5B8DB8', // slate blue  — Day 2
  '#7BA05B', // sage green  — Day 3
  '#8B6BA8', // muted purple — Day 4
  '#3D9E8A', // teal        — Day 5
  '#D4845A', // burnt sienna — Day 6
  '#6B8EC4', // periwinkle  — Day 7
  '#88A86B', // olive       — Day 8
  '#B85C7A', // rose        — Day 9
  '#4A8B7A', // deep teal   — Day 10+
]

function dayColor(day: number) {
  return DAY_COLORS[(day - 1) % DAY_COLORS.length]
}

// Strip generic words that confuse geocoding
function cleanName(name: string): string {
  return name
    .replace(/\b(walking tour|day trip to|exploring|visiting|stroll|tour|walk)\b/gi, '')
    .replace(/[&–—]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// ─── Component ─────────────────────────────────────────────────────────────────

interface TripMapProps {
  pins: MapPin[]
}

export default function TripMap({ pins }: TripMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<any>(null)
  const markersRef   = useRef<any[]>([])
  const [geoPins, setGeoPins] = useState<GeoPin[]>([])
  const [status, setStatus]   = useState<'idle' | 'geocoding' | 'done'>('idle')

  // ── Geocode pins via Photon (free, no key, OSM-based) ────────────────────────
  useEffect(() => {
    if (pins.length === 0) { setStatus('done'); return }
    setStatus('geocoding')
    let cancelled = false

    async function geocodeAll() {
      const BATCH = 4          // parallel per round
      const DELAY = 120        // ms between batches

      for (let i = 0; i < pins.length; i += BATCH) {
        if (cancelled) return
        const batch = pins.slice(i, i + BATCH)

        const results = await Promise.all(batch.map(async (pin): Promise<GeoPin | null> => {
          try {
            const q = encodeURIComponent(
              `${cleanName(pin.name)}, ${pin.destination}, ${pin.country}`
            )
            const res  = await fetch(`https://photon.komoot.io/api/?q=${q}&limit=1&lang=en`)
            const data = await res.json()
            const feat = data.features?.[0]
            if (!feat) return null
            const [lng, lat] = feat.geometry.coordinates as [number, number]
            return { ...pin, lat, lng }
          } catch { return null }
        }))

        const valid = results.filter((r): r is GeoPin => r !== null)
        if (valid.length > 0 && !cancelled) {
          setGeoPins(prev => {
            // Deduplicate by id
            const existing = new Set(prev.map(p => p.id))
            const fresh    = valid.filter(p => !existing.has(p.id))
            return fresh.length ? [...prev, ...fresh] : prev
          })
        }

        if (i + BATCH < pins.length) await new Promise(r => setTimeout(r, DELAY))
      }

      if (!cancelled) setStatus('done')
    }

    geocodeAll()
    return () => { cancelled = true }
  }, [pins])

  // ── Initialise Leaflet map ───────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    // Inject Leaflet CSS once
    if (!document.getElementById('leaflet-css')) {
      const link    = document.createElement('link')
      link.id       = 'leaflet-css'
      link.rel      = 'stylesheet'
      link.href     = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }

    // Inject popup style override
    if (!document.getElementById('voya-map-css')) {
      const style = document.createElement('style')
      style.id    = 'voya-map-css'
      style.textContent = `
        .leaflet-popup-content-wrapper {
          border-radius: 12px !important;
          border: 1px solid #E8E0D6 !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.12) !important;
          padding: 0 !important;
        }
        .leaflet-popup-content { margin: 10px 14px !important; }
        .leaflet-popup-tip-container { display: none !important; }
        .leaflet-control-attribution {
          font-size: 9px !important;
          background: rgba(255,255,255,0.7) !important;
        }
      `
      document.head.appendChild(style)
    }

    import('leaflet').then(({ default: L }) => {
      if (!containerRef.current || mapRef.current) return

      const map = L.map(containerRef.current, {
        zoomControl: false,
        scrollWheelZoom: true,
        center: [20, 0],
        zoom: 2,
      })

      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        {
          attribution: '© <a href="https://openstreetmap.org">OSM</a> © <a href="https://carto.com">CARTO</a>',
          maxZoom: 19,
        }
      ).addTo(map)

      L.control.zoom({ position: 'topright' }).addTo(map)

      mapRef.current = map
    })

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  // ── Add / refresh markers whenever geoPins updates ────────────────────────────
  useEffect(() => {
    if (!mapRef.current || geoPins.length === 0) return

    import('leaflet').then(({ default: L }) => {
      const map = mapRef.current
      if (!map) return

      // Clear old markers
      markersRef.current.forEach(m => m.remove())
      markersRef.current = []

      const latLngs: [number, number][] = []

      geoPins.forEach(pin => {
        const col  = dayColor(pin.day)
        const icon = L.divIcon({
          html: `
            <div style="
              width:30px;height:30px;
              background:${col};
              border:2.5px solid white;
              border-radius:50%;
              box-shadow:0 2px 10px rgba(0,0,0,0.28);
              display:flex;align-items:center;justify-content:center;
            ">
              <span style="
                color:white;font-size:11px;font-weight:700;
                font-family:-apple-system,sans-serif;line-height:1;
              ">${pin.day}</span>
            </div>`,
          className:    '',
          iconSize:     [30, 30],
          iconAnchor:   [15, 15],
          popupAnchor:  [0, -18],
        })

        const marker = L.marker([pin.lat, pin.lng], { icon })
          .bindPopup(`
            <div>
              <div style="font-size:9px;color:#9A8E7E;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;font-family:-apple-system,sans-serif;">
                Day ${pin.day} &middot; ${pin.slot}
              </div>
              <div style="font-size:13px;font-weight:600;color:#1A1A1A;line-height:1.35;font-family:-apple-system,sans-serif;">
                ${pin.name}
              </div>
            </div>
          `, { closeButton: false })
          .addTo(map)

        markersRef.current.push(marker)
        latLngs.push([pin.lat, pin.lng])
      })

      if (latLngs.length > 0) {
        try {
          map.fitBounds(latLngs as any, { padding: [48, 48], maxZoom: 14, animate: true })
        } catch { /* bounds error — ignore */ }
      }
    })
  }, [geoPins])

  // ── Derive sorted unique days for legend ──────────────────────────────────────
  const uniqueDays = [...new Set(geoPins.map(p => p.day))].sort((a, b) => a - b)

  return (
    <div className="relative h-full w-full bg-[#EDE8E1]">
      {/* Map canvas */}
      <div ref={containerRef} className="h-full w-full" />

      {/* Loading shimmer */}
      {status !== 'done' && geoPins.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-2 bg-white/85 backdrop-blur-sm rounded-xl px-4 py-2.5 shadow-sm border border-[#E8E0D6]">
            <span className="text-xs text-[#9A8E7E]">Placing pins…</span>
          </div>
        </div>
      )}

      {/* Day legend */}
      {uniqueDays.length > 0 && (
        <div className="absolute bottom-4 left-3 bg-white/92 backdrop-blur-sm rounded-xl px-3 py-2.5 shadow-sm border border-[#E8E0D6] max-h-56 overflow-y-auto">
          <p className="text-[9px] text-[#9A8E7E] uppercase tracking-widest mb-2">Days</p>
          <div className="space-y-1.5">
            {uniqueDays.map(d => (
              <div key={d} className="flex items-center gap-2">
                <div
                  className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                  style={{ background: dayColor(d) }}
                />
                <span className="text-[11px] text-[#5A504A] font-medium">Day {d}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
