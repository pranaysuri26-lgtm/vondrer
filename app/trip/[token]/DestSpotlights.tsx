'use client'

import { useEffect, useState } from 'react'

interface Spot {
  name: string
  why:  string
  type: string
}

interface SpotData {
  must_see:    Spot[]
  hidden_gems: Spot[]
}

const TYPE_EMOJI: Record<string, string> = {
  landmark:     '🏛️',
  museum:       '🖼️',
  nature:       '🌿',
  market:       '🛒',
  temple:       '⛩️',
  beach:        '🏖️',
  viewpoint:    '🔭',
  cafe:         '☕',
  neighbourhood:'🏘️',
  street:       '🚶',
  park:         '🌳',
  default:      '📍',
}

export default function DestSpotlights({ dest, country }: { dest: string; country: string }) {
  const [data,    setData]    = useState<SpotData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/spots?dest=${encodeURIComponent(dest)}&country=${encodeURIComponent(country)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [dest, country])

  if (loading) return (
    <div className="space-y-3 mt-4">
      {[1,2].map(i => (
        <div key={i} className="h-24 bg-[#F0EBE3] rounded-xl animate-pulse" />
      ))}
    </div>
  )

  if (!data?.must_see?.length) return null

  function SpotCard({ spot, accent }: { spot: Spot; accent: string }) {
    const emoji = TYPE_EMOJI[spot.type] ?? TYPE_EMOJI.default
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${spot.name}, ${dest}, ${country}`)}`
    return (
      <div className="flex items-start gap-3 p-3.5 bg-white border border-[#E8E0D6] rounded-xl hover:border-[#C97552]/30 transition-colors">
        <span className="text-xl flex-shrink-0 mt-0.5">{emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-[#1A1A1A] leading-snug">{spot.name}</p>
          <p className="text-xs text-[#6b5f54] mt-0.5 leading-relaxed">{spot.why}</p>
        </div>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex-shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full border ${accent} transition-colors`}
        >
          Maps →
        </a>
      </div>
    )
  }

  return (
    <div className="mt-6 space-y-5">
      {/* Must See */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm">📸</span>
          <p className="text-xs text-[#9A8E7E] uppercase tracking-widest font-medium">Must See</p>
        </div>
        <div className="space-y-2">
          {data.must_see.map((s, i) => (
            <SpotCard key={i} spot={s} accent="text-[#C97552] border-[#C97552]/30 hover:bg-[#FFF8F5]" />
          ))}
        </div>
      </div>

      {/* Hidden Gems */}
      {data.hidden_gems?.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">💎</span>
            <p className="text-xs text-[#9A8E7E] uppercase tracking-widest font-medium">Hidden Gems</p>
          </div>
          <div className="space-y-2">
            {data.hidden_gems.map((s, i) => (
              <SpotCard key={i} spot={s} accent="text-[#5B8DB8] border-[#5B8DB8]/30 hover:bg-[#F5F9FF]" />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
