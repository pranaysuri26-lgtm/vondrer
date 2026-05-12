'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'
import { detectCurrency, displayBudget, type CurrencyInfo } from '@/lib/currency'
import type { RecommendedDestination, TransportMode, Accommodation } from '@/lib/recommendations'

// ─── Types ────────────────────────────────────────────────────────────────────

type LoadState = 'loading' | 'ready' | 'error'

// ─── SSE stream reader ────────────────────────────────────────────────────────
// Reads the text/event-stream from /api/recommendations and calls handlers
// as each event arrives. Works for both initial load and background refresh.

interface SSEHandlers {
  onMeta:        (event: Record<string, unknown>) => void
  onDestination: (dest: RecommendedDestination)   => void
  onRetry:       ()                               => void
  onError:       (msg: string)                    => void
  onDone:        ()                               => void
}

async function readSSE(res: Response, handlers: SSEHandlers): Promise<void> {
  if (!res.body) { handlers.onError('No response body'); return }
  const reader  = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer    = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // SSE events are separated by \n\n
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''
      for (const part of parts) {
        const dataLine = part.split('\n').find(l => l.startsWith('data: '))
        if (!dataLine) continue
        try {
          const event = JSON.parse(dataLine.slice(6))
          switch (event.type) {
            case 'meta':        handlers.onMeta(event); break
            case 'destination': handlers.onDestination(event as RecommendedDestination); break
            case 'retry':       handlers.onRetry(); break
            case 'error':       handlers.onError(event.message ?? 'Unknown error'); break
            case 'done':        handlers.onDone(); break
          }
        } catch { /* malformed event — ignore */ }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// ─── Loading screen ───────────────────────────────────────────────────────────

const LOADING_LINES = [
  'Mapping hidden corners of the world…',
  'Weighing your offbeat instincts…',
  'Cross-referencing thousands of destinations…',
  'Filtering the ones everyone already knows…',
  'Curating your shortlist…',
]

function LoadingScreen({ slow }: { slow: boolean }) {
  const [lineIdx, setLineIdx] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setLineIdx(i => (i + 1) % LOADING_LINES.length), 1800)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="relative w-16 h-16 mb-10">
        <div className="absolute inset-0 rounded-full border border-white/10" />
        <div className="absolute inset-0 rounded-full border border-[#C97552]/40"
          style={{ animation: 'spin 3s linear infinite' }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl" style={{ animation: 'spin 3s linear infinite reverse' }}>🧭</span>
        </div>
      </div>
      <span className="font-serif italic text-3xl text-white/90 tracking-wide mb-8">Voya</span>
      <p key={lineIdx} className="text-white/50 text-sm tracking-wide"
        style={{ animation: 'fadeIn 0.4s ease' }}>
        {LOADING_LINES[lineIdx]}
      </p>
      {slow && (
        <p className="text-white/25 text-xs mt-4 max-w-xs text-center">
          Claude is working hard on your profile — first-time results take a little longer.
        </p>
      )}
      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes fadeIn  { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
      `}</style>
    </div>
  )
}

// ─── Gem score legend ─────────────────────────────────────────────────────────

const GEM_LEVELS = [
  { dots: 1, label: 'Known to some travellers' },
  { dots: 2, label: 'Off the beaten path' },
  { dots: 3, label: 'Genuinely local' },
  { dots: 4, label: 'Rarely visited' },
  { dots: 5, label: 'Truly undiscovered' },
]

function GemLegend() {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/50 transition-colors">
        <span>💎 Gem score — how undiscovered a place truly is</span>
        <span className={`w-4 h-4 rounded-full border border-white/20 flex items-center justify-center text-[10px] flex-shrink-0 ${open ? 'bg-white/10 border-white/35 text-white/60' : ''}`}>?</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 z-10 bg-[#0d1f35] border border-white/12 rounded-xl p-4 shadow-xl min-w-[220px]">
          <div className="space-y-2.5">
            {GEM_LEVELS.map(({ dots, label }) => (
              <div key={dots} className="flex items-center gap-3">
                <div className="flex gap-1 flex-shrink-0">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < dots ? 'bg-[#C97552]' : 'bg-white/15'}`} />
                  ))}
                </div>
                <span className="text-xs text-white/45">{label}</span>
              </div>
            ))}
          </div>
          <button onClick={() => setOpen(false)}
            className="mt-3 text-[10px] text-white/20 hover:text-white/40 transition-colors w-full text-right">close</button>
        </div>
      )}
    </div>
  )
}

// ─── Gem label for low-spread fallback ───────────────────────────────────────

function gemLabel(score: number | undefined): string {
  if (!score) return 'Hidden gem'
  if (score >= 9) return 'Rare gem'
  if (score >= 7) return 'Hidden gem'
  if (score >= 5) return 'Local find'
  if (score >= 3) return 'Off the map'
  return 'Known spot'
}

// ─── Gem score dots ───────────────────────────────────────────────────────────

function GemDots({ score }: { score?: number }) {
  if (!score) return null
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < Math.round(score / 2) ? 'bg-[#C97552]' : 'bg-white/15'}`} />
      ))}
    </div>
  )
}

// ─── Dietary helpers ──────────────────────────────────────────────────────────

const DIETARY_BADGE_MAP: Record<string, { icon: string; label: string; matchTag: string }> = {
  vegetarian:  { icon: '🥗', label: 'Vegetarian friendly',  matchTag: 'vegetarian-friendly' },
  vegan:       { icon: '🌱', label: 'Vegan friendly',       matchTag: 'vegan-friendly' },
  halal:       { icon: '☪️', label: 'Halal options',        matchTag: 'halal-available' },
  kosher:      { icon: '✡️', label: 'Kosher available',     matchTag: 'kosher-available' },
  'gluten-free': { icon: '🌾', label: 'Gluten-free options', matchTag: 'gluten-free-options' },
  'no-pork':   { icon: '🚫', label: 'Pork-free friendly',  matchTag: 'pork-free-easy' },
  'no-beef':   { icon: '🐄', label: 'Beef-free friendly',  matchTag: 'beef-free-easy' },
  pescatarian: { icon: '🐟', label: 'Great for pescatarians', matchTag: 'pescatarian-friendly' },
}

function dietaryFilterLabel(prefs: string[]): string {
  if (prefs.length === 0) return ''
  if (prefs.includes('vegetarian') && !prefs.includes('vegan')) return 'Vegetarian dining prioritised'
  if (prefs.includes('vegan')) return 'Vegan dining prioritised'
  if (prefs.includes('halal')) return 'Halal options prioritised'
  if (prefs.length === 1) {
    const pref = prefs[0]
    if (pref === 'no-pork') return 'Filtered for no pork'
    if (pref === 'no-beef') return 'Filtered for no beef'
    if (pref === 'pescatarian') return 'Pescatarian dining prioritised'
    if (pref === 'kosher') return 'Kosher options prioritised'
    if (pref === 'gluten-free') return 'Gluten-free options prioritised'
  }
  return `Filtered for your dietary preferences`
}

function DietaryBadges({
  dest, userPrefs,
}: { dest: RecommendedDestination; userPrefs: string[] }) {
  if (userPrefs.length === 0 || !dest.dietary_tags || dest.dietary_tags.length === 0) return null
  const badges = userPrefs
    .filter(p => p !== 'none')
    .map(pref => DIETARY_BADGE_MAP[pref])
    .filter(b => b && dest.dietary_tags!.includes(b.matchTag))
  if (badges.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {badges.map(b => (
        <span key={b.matchTag}
          className="flex items-center gap-1 text-[10px] text-white/50 bg-white/5 border border-white/10 rounded-full px-2 py-0.5">
          <span>{b.icon}</span>
          <span>{b.label}</span>
        </span>
      ))}
    </div>
  )
}

// ─── Transport block ──────────────────────────────────────────────────────────

const TRANSPORT_ICONS: Record<string, string> = {
  fly:   '✈️',
  train: '🚂',
  bus:   '🚌',
  drive: '🚗',
  ferry: '⛴️',
}

const TRANSPORT_LABELS: Record<string, string> = {
  fly:   'Search flights',
  train: 'Find trains',
  bus:   'Find buses',
  drive: 'Get directions',
  ferry: 'Find ferries',
}

function buildTransportLink(
  mode: string,
  homeCity: string,
  destName: string,
  country: string,
  booking?: string,
): string {
  // If booking looks like a URL (contains a dot and no spaces), use it directly
  if (booking) {
    const trimmed = booking.trim().toLowerCase()
    // Canonicalise common named platforms to their URLs
    const BOOKING_URLS: Record<string, string> = {
      'eurostar.com':       'https://www.eurostar.com',
      'irctc app':          'https://www.irctc.co.in',
      'irctc':              'https://www.irctc.co.in',
      'amtrak.com':         'https://www.amtrak.com',
      'book.amtrak.com':    'https://www.amtrak.com',
      'google flights':     `https://www.google.com/travel/flights`,
      'skyscanner':         'https://www.skyscanner.com',
      'rome2rio':           `https://www.rome2rio.com`,
      '12go.asia':          'https://12go.asia',
      'bahn.de':            'https://www.bahn.de/en',
      'sncf-connect.com':   'https://www.sncf-connect.com',
      'nationalrail.co.uk': 'https://www.nationalrail.co.uk',
      'trainline.com':      'https://www.thetrainline.com',
      'trenitalia.com':     'https://www.trenitalia.com',
      'renfe.com':          'https://www.renfe.com',
      'ns.nl':              'https://www.ns.nl/en',
      'viarail.ca':         'https://www.viarail.ca',
      'nswticketing.com.au':'https://transportnsw.info',
      'smart ex app':       'https://smart-ex.jp/en',
      'smart ex':           'https://smart-ex.jp/en',
      'omio':               'https://www.omio.com',
      'b-europe.com':       'https://www.b-europe.com',
      'nightjet.com':       'https://www.nightjet.com',
      'goibibo':            'https://www.goibibo.com/trains',
    }
    const matched = BOOKING_URLS[trimmed]
    if (matched) return matched
    // If it already looks like a URL
    if (trimmed.includes('.') && !trimmed.includes(' '))
      return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
  }

  const from = encodeURIComponent(homeCity || 'your city')
  const to   = encodeURIComponent(`${destName}, ${country}`)
  if (mode === 'fly')
    return `https://www.google.com/travel/flights?q=flights+from+${from}+to+${to}`
  if (mode === 'drive')
    return `https://www.google.com/maps/dir/${from}/${to}`
  // train / bus / ferry → Rome2rio handles all
  return `https://www.rome2rio.com/s/${from}/${to}`
}

function TransportBlock({
  dest, homeCity,
}: { dest: RecommendedDestination; homeCity: string }) {
  const [expanded, setExpanded] = useState(false)
  const modes = dest.transport
  if (!modes || modes.length === 0) return null

  const primary    = modes.find(m => m.recommended) ?? modes[0]
  const alternates = modes.filter(m => m !== primary)

  return (
    <div className="mt-4 mb-1">
      <p className="text-[10px] text-white/25 uppercase tracking-widest mb-2.5 font-label">
        How to get there
      </p>

      {/* Primary — always visible */}
      <PrimaryTransportCard m={primary} homeCity={homeCity} destName={dest.name} country={dest.country} />

      {/* Alternates — collapsed by default */}
      {alternates.length > 0 && (
        <div className="mt-2">
          <button
            onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
            className="text-[11px] text-white/45 hover:text-white/70 transition-colors flex items-center gap-1.5 py-1"
          >
            <span className="text-[10px]">{expanded ? '▾' : '▸'}</span>
            <span>{expanded ? 'Hide alternatives' : `${alternates.length} other way${alternates.length > 1 ? 's' : ''} to get there`}</span>
          </button>
          {expanded && (
            <div className="mt-2 space-y-2">
              {alternates.map((m, i) => (
                <AlternateTransportCard key={i} m={m} homeCity={homeCity} destName={dest.name} country={dest.country} />
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-white/20 mt-2 leading-snug">
        Times are approximate. Prices in local currency. Check providers for live schedules.
      </p>
    </div>
  )
}

function PrimaryTransportCard({ m, homeCity, destName, country }: {
  m: TransportMode; homeCity: string; destName: string; country: string
}) {
  const link  = buildTransportLink(m.mode, homeCity, destName, country, m.booking)
  const icon  = TRANSPORT_ICONS[m.mode] ?? '🗺️'
  const label = TRANSPORT_LABELS[m.mode] ?? 'Find options'
  return (
    <div className="bg-[#C97552]/8 border border-[#C97552]/20 rounded-xl px-3 py-3">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">{icon}</span>
          <span className="text-xs font-semibold text-[#C97552]">
            {m.service_name || TRANSPORT_LABELS[m.mode]}
          </span>
        </div>
        <span className="text-[9px] text-[#C97552]/70 border border-[#C97552]/25 rounded-full px-2 py-0.5 uppercase tracking-wider font-label flex-shrink-0">
          ✓ Best for you
        </span>
      </div>
      <div className="flex items-baseline gap-3 text-xs mb-1">
        <span className="text-white/70 font-medium">{m.duration}</span>
        {m.cost && <span className="text-white/45">{m.cost}</span>}
      </div>
      <p className="text-[11px] text-white/45 leading-snug mb-1.5">{m.note}</p>
      {m.booking_window && (
        <p className="text-[11px] text-white/30 mb-2">📅 {m.booking_window}</p>
      )}
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className="text-[11px] text-[#C97552]/80 hover:text-[#C97552] transition-colors"
      >
        {m.booking ? `Book on ${m.booking}` : label} ↗
      </a>
    </div>
  )
}

function AlternateTransportCard({ m, homeCity, destName, country }: {
  m: TransportMode; homeCity: string; destName: string; country: string
}) {
  const link  = buildTransportLink(m.mode, homeCity, destName, country, m.booking)
  const icon  = TRANSPORT_ICONS[m.mode] ?? '🗺️'
  const label = TRANSPORT_LABELS[m.mode] ?? 'Find options'
  return (
    <div className="bg-white/3 border border-white/8 rounded-xl px-3 py-2.5 flex items-start gap-3">
      <span className="text-sm leading-none pt-0.5 flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xs text-white/55 font-medium">
            {m.service_name || TRANSPORT_LABELS[m.mode]}
          </span>
          <span className="text-xs text-white/35">{m.duration}</span>
          {m.cost && <span className="text-xs text-white/25">{m.cost}</span>}
        </div>
        <p className="text-[11px] text-white/35 leading-snug mt-0.5">{m.note}</p>
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="text-[11px] text-white/30 hover:text-white/50 transition-colors"
        >
          {m.booking ? `${m.booking}` : label} ↗
        </a>
      </div>
    </div>
  )
}

// ─── Accommodation block ─────────────────────────────────────────────────────

const ACCOMMODATION_ICONS: Record<string, string> = {
  government_property: '🏛️',
  homestay:            '🏡',
  guesthouse:          '🏠',
  airbnb:              '🏠',
  hotel:               '🏨',
  hostel:              '🛏️',
  resort:              '🌴',
  camp:                '⛺',
}

const PLATFORM_URLS: Record<string, (dest: string) => string> = {
  'booking.com':   (d) => `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(d)}`,
  'airbnb':        (d) => `https://www.airbnb.com/s/${encodeURIComponent(d)}/homes`,
  'airbnb.com':    (d) => `https://www.airbnb.com/s/${encodeURIComponent(d)}/homes`,
}

function buildBookingUrl(bookVia: string, bookingUrl: string | null | undefined, destName: string): string {
  if (bookingUrl) return bookingUrl
  const key = bookVia.toLowerCase().replace(/\s+/g, '')
  if (key.includes('booking.com') || key === 'bookingcom') return PLATFORM_URLS['booking.com'](destName)
  if (key.includes('airbnb')) return PLATFORM_URLS['airbnb'](destName)
  if (key.includes('agoda')) return `https://www.agoda.com/search?city=${encodeURIComponent(destName)}`
  if (key.includes('google')) return `https://www.google.com/travel/hotels/${encodeURIComponent(destName)}`
  return `https://www.google.com/travel/hotels/${encodeURIComponent(destName)}`
}

function PlatformBadge({ label, status }: { label: string; status: string }) {
  const isStrong  = status === 'strong' || status === 'recommended'
  const isLimited = status === 'limited' || status === 'optional'
  const isWeak    = status === 'not_recommended' || status === 'not_available'
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${
      isStrong  ? 'border-emerald-500/30 text-emerald-400/70 bg-emerald-500/5' :
      isLimited ? 'border-white/15 text-white/35 bg-white/3' :
                  'border-white/8 text-white/20 bg-white/2 line-through'
    }`}>
      {label}
      {isStrong && <span className="text-emerald-400/60">✓</span>}
    </span>
  )
}

function AccommodationBlock({ acc, destName }: { acc: Accommodation; destName: string }) {
  const icon = ACCOMMODATION_ICONS[acc.primary_type] ?? '🏨'
  const rec  = acc.primary_recommendation
  const bookUrl = buildBookingUrl(rec.book_via, rec.booking_url, destName)

  return (
    <div className="mt-4 mb-1">
      <p className="text-[10px] text-white/25 uppercase tracking-widest mb-2.5 font-label">
        Where to stay
      </p>

      {/* Primary recommendation */}
      <div className="bg-white/4 border border-white/8 rounded-xl px-3 py-3">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2">
            <span className="text-base leading-none">{icon}</span>
            <span className="text-xs font-semibold text-white/80">{rec.type}</span>
          </div>
          {rec.name && (
            <span className="text-[10px] text-white/40 text-right leading-tight flex-shrink-0 max-w-[120px]">{rec.name}</span>
          )}
        </div>
        <p className="text-sm text-white/70 font-medium mb-1">{rec.price_range}</p>
        <p className="text-[11px] text-white/45 leading-snug mb-1.5">{rec.why}</p>
        {rec.book_ahead && (
          <p className="text-[11px] text-white/30 mb-2">📅 {rec.book_ahead}</p>
        )}
        <a
          href={bookUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="text-[11px] text-[#C97552]/80 hover:text-[#C97552] transition-colors"
        >
          Book on {rec.book_via} ↗
        </a>
      </div>

      {/* Platform availability badges */}
      <div className="flex flex-wrap gap-1.5 mt-2">
        <PlatformBadge label="Booking.com" status={acc.platforms.booking_com} />
        <PlatformBadge label="Airbnb"      status={acc.platforms.airbnb} />
        <PlatformBadge label="Book direct" status={acc.platforms.direct} />
      </div>

      {/* Alternative */}
      {acc.alternative && (
        <div className="mt-2 bg-white/2 border border-white/6 rounded-xl px-3 py-2.5">
          <div className="flex items-baseline gap-2 flex-wrap mb-0.5">
            <span className="text-xs text-white/50 font-medium">Alt: {acc.alternative.type}</span>
            <span className="text-xs text-white/30">{acc.alternative.price_range}</span>
          </div>
          <p className="text-[11px] text-white/35 leading-snug">{acc.alternative.note}</p>
          <span className="text-[10px] text-white/25">via {acc.alternative.book_via}</span>
        </div>
      )}

      {/* Neighbourhood advice */}
      {acc.neighbourhood_advice && (
        <p className="text-[11px] text-white/35 mt-2 leading-snug">
          <span className="text-white/20 uppercase tracking-wider text-[10px] font-label mr-1">Area</span>
          {acc.neighbourhood_advice}
        </p>
      )}

      {/* Avoid */}
      {acc.avoid && (
        <p className="text-[11px] text-amber-400/50 mt-1.5 leading-snug">
          <span className="mr-1">⚠️</span>{acc.avoid}
        </p>
      )}
    </div>
  )
}

// ─── Timing helpers ──────────────────────────────────────────────────────────

function crowdLabel(level: string): string {
  if (level === 'local')  return 'Mostly locals'
  if (level === 'mixed')  return 'Mixed crowd'
  return 'Peak tourist season'
}

/**
 * Deterministic −20 penalty for any destination with a timing_warning.
 * Applied universally: monsoon, road closures, heat, cold, hurricanes,
 * overcrowding — all conflict types reduce by the same fixed amount.
 * Claude gives the raw profile-fit score; this function produces the
 * display/sort score.
 */
function effectiveScore(dest: RecommendedDestination): number {
  return Math.max(0, dest.match_score - (dest.timing_warning ? 20 : 0))
}

// ─── Fallback gradient per destination type ───────────────────────────────────

function getFallbackGradient(dest: RecommendedDestination): string {
  const t = `${dest.name} ${dest.country}`.toLowerCase()
  if (/desert|outback|sahara|gobi|arid|dune|wadi/.test(t))   return 'linear-gradient(135deg,#c4622d,#8B4513)'
  if (/island|ocean|sea|beach|coast|bay|maldive|caribbean|pacific|atoll/.test(t)) return 'linear-gradient(135deg,#1a4a5c,#0d7377)'
  if (/mountain|himalaya|alpine|andes|alps|peak|summit|tibet|highland/.test(t))   return 'linear-gradient(135deg,#2c3e50,#4a6741)'
  if (/forest|jungle|rainforest|amazon|borneo|congo/.test(t)) return 'linear-gradient(135deg,#2d5a27,#1a3a1a)'
  if (/city|urban|tokyo|london|paris|new york|chicago|dubai|seoul|bangkok/.test(t)) return 'linear-gradient(135deg,#1a1a2e,#16213e)'
  return 'linear-gradient(135deg,#1a2a3a,#2d4a5a)'
}

// ─── Image carousel ───────────────────────────────────────────────────────────

// Session-level URL cache — persists across card expand/collapse within the session
const imgSessionCache = new Map<string, string[]>()

function ImageCarousel({ dest }: { dest: RecommendedDestination }) {
  const [images,    setImages]    = useState<string[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [loaded,    setLoaded]    = useState<boolean[]>([])
  const [paused,    setPaused]    = useState(false)
  const abortRef       = useRef<AbortController | null>(null)
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchStartX    = useRef(0)

  // Fetch 4 images on mount, cancel if unmounted
  useEffect(() => {
    const cacheKey = `${dest.name}::${dest.country}`

    if (imgSessionCache.has(cacheKey)) {
      const cached = imgSessionCache.get(cacheKey)!
      setImages(cached)
      setLoaded(cached.map(() => false))
      return
    }

    const controller = new AbortController()
    abortRef.current = controller

    const q = `${dest.name} ${dest.country} travel`
    fetch(`/api/destination-image?q=${encodeURIComponent(q)}&count=4`, { signal: controller.signal })
      .then(r => r.json())
      .then(d => {
        const urls: string[] = (d.urls ?? (d.url ? [d.url] : [])).filter(Boolean)
        imgSessionCache.set(cacheKey, urls)
        setImages(urls)
        setLoaded(urls.map(() => false))
      })
      .catch(() => { /* aborted or failed — gradient fallback shows */ })

    return () => {
      controller.abort()
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
    }
  }, [dest.name, dest.country])

  // Auto-cycle every 3 s, paused on hover / touch
  useEffect(() => {
    if (images.length <= 1 || paused) return
    const id = setInterval(() => setActiveIdx(i => (i + 1) % images.length), 3000)
    return () => clearInterval(id)
  }, [images.length, paused])

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    setPaused(true)
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 50) {
      setActiveIdx(i => diff > 0 ? (i + 1) % images.length : (i - 1 + images.length) % images.length)
    }
    resumeTimerRef.current = setTimeout(() => setPaused(false), 5000)
  }

  const fallback = getFallbackGradient(dest)

  return (
    <div
      className="relative h-44 overflow-hidden"
      style={images.length === 0 ? { background: fallback } : undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Shimmer while fetching */}
      {images.length === 0 && (
        <>
          <div className="absolute inset-0 bg-white/5 animate-pulse" />
          <div className="absolute inset-0 flex items-end p-4">
            <span className="font-serif italic text-white/20 text-2xl">{dest.name}</span>
          </div>
        </>
      )}

      {/* Images — crossfade via opacity */}
      {images.map((url, i) => (
        <img
          key={url}
          src={url}
          alt={`${dest.name} ${i + 1}`}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-[800ms] ${
            i === activeIdx && loaded[i] ? 'opacity-80' : 'opacity-0'
          }`}
          loading="lazy"
          onLoad={() => setLoaded(prev => { const next = [...prev]; next[i] = true; return next })}
          onError={() => setImages(prev => prev.filter((_, j) => j !== i))}
        />
      ))}

      {/* Gradient scrim */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

      {/* Dot indicators */}
      {images.length > 1 && (
        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5 z-10">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={e => { e.stopPropagation(); setActiveIdx(i) }}
              className={`rounded-full transition-all duration-300 ${
                i === activeIdx ? 'w-3 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/35 hover:bg-white/60'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Destination card (expandable) ───────────────────────────────────────────

function DestinationCard({
  dest, rank, locked, currency, gemEmphasis = false, dietaryPrefs = [], homeCity = '',
}: {
  dest:          RecommendedDestination
  rank:          number
  locked:        boolean
  currency:      CurrencyInfo
  gemEmphasis?:  boolean
  dietaryPrefs?: string[]
  homeCity?:     string
}) {
  const [expanded, setExpanded] = useState(false)
  const displayScore  = effectiveScore(dest)
  const timingPenalty = dest.timing_warning ? dest.match_score - displayScore : 0

  return (
    <div
      onClick={() => setExpanded(e => !e)}
      className={`relative rounded-2xl border transition-all duration-200 overflow-hidden cursor-pointer
        ${locked
          ? 'border-white/8 bg-white/3'
          : expanded
            ? 'border-[#C97552]/50 bg-white/7'
            : 'border-white/12 bg-white/5 hover:border-[#C97552]/40 hover:bg-white/7'
        }`}
    >
      {/* ── Collapsed view ── */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          {/* Left: rank + name */}
          <div className="flex items-start gap-3 min-w-0">
            <span className="text-xs text-white/25 font-label tracking-widest uppercase pt-0.5 flex-shrink-0">
              #{rank}
            </span>
            <div className="min-w-0">
              <h2 className={`font-serif italic text-xl leading-tight mb-0.5 truncate
                ${locked ? 'blur-[6px] text-white/40 select-none' : 'text-white'}`}>
                {locked ? '██████████' : dest.name}
              </h2>
              <p className={`text-sm ${locked ? 'blur-[4px] text-white/20 select-none' : 'text-white/50'}`}>
                {locked ? '████████' : (
                  dest.state_province
                    ? `${dest.state_province}, ${dest.country}`
                    : dest.country
                )}
              </p>
            </div>
          </div>

          {/* Right: value signal — always visible, even locked */}
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            {locked && gemEmphasis ? (
              // Low spread — lead with gem score, not match %
              <div className="flex items-center gap-2 bg-white/8 border border-white/15 rounded-full px-3 py-1">
                <GemDots score={dest.hidden_gem_score} />
                <span className="text-xs text-white/50">{gemLabel(dest.hidden_gem_score)}</span>
              </div>
            ) : (
              // Normal — show effective (timing-adjusted) match %
              <div className={`flex items-center gap-1 rounded-full px-3 py-1 border ${
                locked
                  ? 'bg-white/8 border-white/15'
                  : timingPenalty > 0
                    ? 'bg-amber-400/10 border-amber-400/30'
                    : 'bg-[#C97552]/15 border-[#C97552]/30'
              }`}>
                <span className={`text-xs font-semibold ${
                  locked ? 'text-white/50' : timingPenalty > 0 ? 'text-amber-400' : 'text-[#C97552]'
                }`}>
                  {displayScore}%
                </span>
                <span className={`text-xs ${
                  locked ? 'text-white/30' : timingPenalty > 0 ? 'text-amber-400/70' : 'text-[#C97552]/70'
                }`}>match</span>
              </div>
            )}
            {/* Gem dots shown separately when not in gemEmphasis pill */}
            {!(locked && gemEmphasis) && <GemDots score={dest.hidden_gem_score} />}
          </div>
        </div>

        {/* Timing + event badges — visible without expanding */}
        {(dest.timing_warning || dest.upcoming_event) && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {dest.timing_warning && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-400/80 bg-amber-400/8 border border-amber-400/20 rounded-full px-2.5 py-1">
                {dest.timing_warning}
              </span>
            )}
            {dest.upcoming_event && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-[#C97552]/80 bg-[#C97552]/8 border border-[#C97552]/20 rounded-full px-2.5 py-1">
                🎪 {dest.upcoming_event.name} — {dest.upcoming_event.when}
              </span>
            )}
          </div>
        )}

        {/* First reason tag (unlocked collapsed preview only) */}
        {!locked && dest.reasons?.[0] && !expanded && (
          <div className="mt-3">
            <span className="text-xs text-white/55 bg-white/6 border border-white/10 px-2.5 py-1 rounded-full">
              {dest.reasons[0]}
            </span>
          </div>
        )}

        {/* Expand hint */}
        {!locked && (
          <div className="mt-3 flex justify-end">
            <span className="text-xs text-white/20">{expanded ? '▲ collapse' : '▼ details'}</span>
          </div>
        )}
      </div>

      {/* ── Expanded view ── */}
      {expanded && (
        <div onClick={e => e.stopPropagation()} className={locked ? 'relative overflow-hidden' : ''}>

          {/* Carousel (unlocked only) */}
          {!locked && <ImageCarousel dest={dest} />}

          <div className={`px-5 pb-5 pt-4 ${locked ? 'blur-sm select-none pointer-events-none' : ''}`}>
            {/* All reason tags */}
            <div className="flex flex-wrap gap-2 mb-3">
              {dest.reasons.map((r, i) => (
                <span key={i} className="text-xs text-white/60 bg-white/6 border border-white/10 px-2.5 py-1 rounded-full">
                  {r}
                </span>
              ))}
            </div>

            {/* FIX 2 — Personalization note */}
            {!locked && dest.personalization_note && (
              <p className="text-xs text-white/35 italic mt-2 mb-3 leading-snug">
                {dest.personalization_note}
              </p>
            )}

            {/* Dietary badges — only unlocked, only if destination genuinely supports the preference */}
            {!locked && <DietaryBadges dest={dest} userPrefs={dietaryPrefs} />}

            {/* FIX 5 — Timing note: amber when it's a shoulder season or starts with ⚠️ */}
            {!locked && dest.timing_note && (
              <div className={`flex items-start gap-2 mt-3 text-xs leading-relaxed ${
                dest.timing_note.startsWith('⚠️') ? 'text-amber-400/80' : 'text-white/40'
              }`}>
                <span className="flex-shrink-0">{dest.timing_note.startsWith('⚠️') ? '' : '📅'}</span>
                <span>{dest.timing_note}</span>
              </div>
            )}

            {/* Upcoming event box */}
            {!locked && dest.upcoming_event && (
              <div className="mt-3 rounded-xl border border-[#C97552]/20 bg-[#C97552]/5 px-4 py-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-base leading-none">🎪</span>
                  <span className="text-sm text-white/85 font-medium">{dest.upcoming_event.name}</span>
                </div>
                <p className="text-[11px] text-white/40 mb-1">
                  {dest.upcoming_event.when} · {crowdLabel(dest.upcoming_event.crowd_level)}
                </p>
                <p className="text-xs text-white/55 leading-snug">{dest.upcoming_event.what}</p>
              </div>
            )}

            {/* Transport block — HOW TO GET THERE */}
            {!locked && <TransportBlock dest={dest} homeCity={homeCity} />}

            {/* Accommodation block — WHERE TO STAY */}
            {!locked && dest.accommodation && (
              <AccommodationBlock acc={dest.accommodation} destName={dest.name} />
            )}

            {/* Meta row */}
            <div className="flex items-start justify-between border-t border-white/8 pt-4 mt-4 mb-4">
              <div className="space-y-3">
                {dest.budget_per_day_usd && (
                  <div>
                    <p className="text-xs text-white/30 uppercase tracking-widest mb-0.5">Budget</p>
                    <p className="text-sm text-white/80 font-medium">{displayBudget(dest.budget_per_day_usd, currency)}</p>
                    <p className="text-xs text-white/30 mt-0.5">on the ground · excl. flights</p>
                    {(!dest.transport || dest.transport.length === 0) && (
                      <a
                        href={`https://www.google.com/travel/flights?q=flights+to+${encodeURIComponent(dest.name + ', ' + dest.country)}`}
                        target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-xs text-[#C97552]/70 hover:text-[#C97552] transition-colors mt-1 inline-block">
                        Search flights →
                      </a>
                    )}
                  </div>
                )}
                {dest.best_time_to_visit && (
                  <div>
                    <p className="text-xs text-white/30 uppercase tracking-widest mb-0.5">Best time</p>
                    <p className="text-sm text-white/70">{dest.best_time_to_visit}</p>
                  </div>
                )}
              </div>
              <button onClick={e => e.stopPropagation()}
                className="text-xs text-white/40 border border-white/12 rounded-full px-4 py-2 hover:border-white/25 hover:text-white/60 transition-all flex-shrink-0">
                Save
              </button>
            </div>

            {/* CTAs row */}
            <div className="space-y-2">
              <a
                href={`/plan/new?dest=${encodeURIComponent(dest.name)}&country=${encodeURIComponent(dest.country)}`}
                onClick={e => e.stopPropagation()}
                className="block w-full text-center bg-[#C97552] text-white font-semibold text-sm py-3.5 rounded-full hover:bg-[#b86644] transition-colors"
              >
                Plan this trip →
              </a>
              <a
                href={`/guide?q=${encodeURIComponent(dest.name)}&c=${encodeURIComponent(dest.country)}${dest.state_province ? `&s=${encodeURIComponent(dest.state_province)}` : ''}`}
                onClick={e => e.stopPropagation()}
                className="flex items-center justify-center gap-1.5 w-full py-3 rounded-full border border-white/15 text-white/55 text-sm hover:border-white/30 hover:text-white/80 transition-all"
              >
                <span>🗺</span>
                <span>Local guide</span>
              </a>
            </div>
          </div>

          {/* Frosted overlay for locked expanded */}
          {locked && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm">
              <div className="text-center px-6">
                <svg className="w-5 h-5 text-white/40 mx-auto mb-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                <p className="text-white/50 text-xs">Unlock to see full details</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Conversion hook — email waitlist capture (pre-Stripe) ────────────────────

function ConversionHook({ lockedCount, topScore }: { lockedCount: number; topScore: number }) {
  const [phase,   setPhase]   = useState<'cta' | 'form' | 'done'>('cta')
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [err,     setErr]     = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setErr('')
    try {
      const res = await fetch('/api/waitlist', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim() }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Something went wrong')
      }
      setPhase('done')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (phase === 'done') {
    return (
      <div className="rounded-2xl border border-[#C97552]/25 bg-[#C97552]/5 px-6 py-5 text-center">
        <p className="text-2xl mb-2">✓</p>
        <p className="text-white/80 text-sm font-medium">You're on the list.</p>
        <p className="text-white/40 text-xs mt-1">We'll email you the moment paid unlock goes live.</p>
      </div>
    )
  }

  if (phase === 'form') {
    return (
      <div className="rounded-2xl border border-[#C97552]/25 bg-[#C97552]/5 px-6 py-5">
        <p className="text-white/80 text-sm font-medium mb-1">
          Your {lockedCount} best match{lockedCount !== 1 ? 'es' : ''} — up to{' '}
          <span className="text-[#C97552] font-semibold">{topScore}% match</span> — unlock soon.
        </p>
        <p className="text-white/40 text-xs mb-4">
          Paid unlock is launching shortly. Join the list — be first to access.
        </p>
        <form onSubmit={submit} className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="your@email.com"
            autoFocus
            required
            className="flex-1 bg-white/8 border border-white/15 rounded-full px-4 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#C97552]/60"
          />
          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="bg-[#C97552] text-white font-semibold text-sm px-5 py-2.5 rounded-full hover:bg-[#b86644] disabled:opacity-50 transition-colors flex-shrink-0"
          >
            {loading ? '…' : 'Notify me →'}
          </button>
        </form>
        {err && <p className="text-red-400/80 text-xs mt-2">{err}</p>}
        <button
          onClick={() => setPhase('cta')}
          className="text-white/25 text-xs mt-3 hover:text-white/45 transition-colors"
        >
          ← Back
        </button>
      </div>
    )
  }

  // CTA phase
  return (
    <div className="rounded-2xl border border-[#C97552]/25 bg-[#C97552]/5 px-6 py-5">
      <p className="text-white/80 text-sm font-medium mb-1">
        Your {lockedCount} best match{lockedCount !== 1 ? 'es' : ''} are waiting
        {' '}— including destinations up to{' '}
        <span className="text-[#C97552] font-semibold">{topScore}% match</span> for your profile.
      </p>
      <p className="text-white/35 text-xs mb-4">Paid unlock launching soon · one-time · 30 days access</p>
      <button
        onClick={() => setPhase('form')}
        className="bg-[#C97552] text-white font-semibold text-sm px-6 py-2.5 rounded-full hover:bg-[#b86644] transition-colors"
      >
        Get early access — be first to unlock →
      </button>
      <p className="text-white/20 text-xs mt-3">No spam. One email when it's live.</p>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const FREE_TIER_LIMIT   = 3
const SLOW_THRESHOLD_MS = 10000
const TIMEOUT_MS        = 58000

type Mode = 'discover' | 'search'

export default function DiscoverPage() {
  const router = useRouter()
  const [state, setState]               = useState<LoadState>('loading')
  const [destinations, setDestinations] = useState<RecommendedDestination[]>([])
  const [currency, setCurrency]         = useState<CurrencyInfo>({ symbol: '$', code: 'USD', rate: 1 })
  const [dietaryPrefs, setDietaryPrefs] = useState<string[]>([])
  const [homeCity, setHomeCity]         = useState<string>('')
  const [errorMsg, setErrorMsg]         = useState('')
  const [retryCount, setRetryCount]     = useState(0)
  const [slow, setSlow]                 = useState(false)
  const [previewAll, setPreviewAll]     = useState(false)
  const [mode, setMode]                 = useState<Mode>('discover')
  const [searchQuery, setSearchQuery]   = useState('')

  // Read ?search=1 from URL after hydration (useState lazy init runs on server without window)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('search') === '1') {
      setMode('search')
    }
  }, [])

  // Keep URL in sync so AppNav can read ?search=1 for active-tab highlight
  useEffect(() => {
    window.history.replaceState({}, '', mode === 'search' ? '/discover?search=1' : '/discover')
  }, [mode])

  const handleSearch = useCallback(() => {
    const q = searchQuery.trim()
    if (!q) return
    router.push(`/guide?q=${encodeURIComponent(q)}`)
  }, [searchQuery, router])

  const retry       = useCallback(() => { setState('loading'); setSlow(false); setRetryCount(n => n + 1) }, [])
  const handleLogout = useCallback(async () => {
    const supabase = getSupabaseClient()
    await supabase.auth.signOut()
    router.push('/')
  }, [router])

  useEffect(() => {
    let cancelled = false
    const slowTimer = setTimeout(() => { if (!cancelled) setSlow(true) }, SLOW_THRESHOLD_MS)
    const hardTimer = setTimeout(() => {
      if (!cancelled) { setErrorMsg('This is taking too long. Please try again.'); setState('error') }
    }, TIMEOUT_MS)

    async function fetchRecommendations() {
      try {
        const res = await fetch('/api/recommendations', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force_refresh: false }),
        })

        if (res.status === 401) { router.push('/login'); return }
        if (!res.ok) {
          if (!cancelled) { setErrorMsg('Connection error — check your internet and try again.'); setState('error') }
          return
        }

        let needsRefresh  = false
        let gotAny        = false
        // Buffer destinations — only render once all have arrived so paywall
        // boundaries are stable and cards never flash unblurred then re-blur.
        const buffer: RecommendedDestination[] = []
        let metaCurrency = ''
        let metaCity     = ''
        let metaDietary: string[] = []

        await readSSE(res, {
          onMeta: (event) => {
            if (cancelled) return
            if (event.home_country)        metaCurrency = event.home_country as string
            if (event.home_city)           metaCity     = event.home_city    as string
            if (event.dietary_preferences) metaDietary  = (event.dietary_preferences as string[]).filter(p => p !== 'none')
            if (event.needs_refresh)       needsRefresh = true
            // Debug: log what scope the server is actually reading from the DB
            if (process.env.NODE_ENV === 'development') {
              console.log('[Recommendations meta]', {
                travel_scope:   event.travel_scope,
                domestic_scope: event.domestic_scope,
                home_country:   event.home_country,
                home_city:      event.home_city,
              })
            }
          },
          onDestination: (dest) => {
            if (cancelled) return
            gotAny = true
            buffer.push(dest)
          },
          onRetry: () => {
            // Server is retrying — wipe buffer so we start fresh
            buffer.length = 0
            gotAny = false
          },
          onError: (msg) => {
            if (!cancelled) { setErrorMsg(msg); setState('error') }
          },
          onDone: () => {
            if (cancelled) return
            clearTimeout(slowTimer)
            clearTimeout(hardTimer)
            if (!gotAny) {
              setErrorMsg('No destinations returned. Please try again.')
              setState('error')
            } else {
              // Commit everything at once — paywall boundaries are now stable
              if (metaCurrency) setCurrency(detectCurrency(metaCurrency))
              if (metaCity)     setHomeCity(metaCity)
              if (metaDietary.length > 0) setDietaryPrefs(metaDietary)
              setDestinations(buffer)
              setState('ready')
            }
          },
        })

        if (cancelled) return

        // Background refresh: collect full fresh set, then swap in one shot
        if (needsRefresh) {
          try {
            const refreshRes = await fetch('/api/recommendations', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ force_refresh: true }),
            })
            if (!refreshRes.ok || cancelled) return

            const refreshed: RecommendedDestination[] = []
            let refreshCountry = ''
            let refreshCity    = ''
            let refreshDietary: string[] = []

            await readSSE(refreshRes, {
              onMeta:        (e) => {
                if (e.home_country)        refreshCountry = e.home_country as string
                if (e.home_city)           refreshCity    = e.home_city    as string
                if (e.dietary_preferences) refreshDietary = (e.dietary_preferences as string[]).filter(p => p !== 'none')
              },
              onDestination: (d) => refreshed.push(d),
              onRetry:       ()  => { refreshed.length = 0 },
              onError:       ()  => { /* silently ignore background refresh errors */ },
              onDone:        ()  => { /* handled below */ },
            })

            if (!cancelled && refreshed.length > 0) {
              setDestinations(refreshed)
              if (refreshCountry) setCurrency(detectCurrency(refreshCountry))
              if (refreshCity)    setHomeCity(refreshCity)
              if (refreshDietary.length > 0) setDietaryPrefs(refreshDietary)
            }
          } catch { /* silently ignore */ }
        }
      } catch {
        if (!cancelled) { setErrorMsg('Connection error — check your internet and try again.'); setState('error') }
      }
    }

    fetchRecommendations()
    return () => { cancelled = true; clearTimeout(slowTimer); clearTimeout(hardTimer) }
  }, [router, retryCount])

  if (state === 'loading') return <LoadingScreen slow={slow} />

  if (state === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <span className="text-3xl mb-4">🌐</span>
        <h1 className="text-xl font-light text-white mb-2">Couldn't load your destinations</h1>
        <p className="text-white/45 text-sm mb-6 max-w-xs">{errorMsg}</p>
        <button onClick={retry}
          className="bg-white text-[#0d1f35] font-semibold text-sm px-8 py-3 rounded-full hover:bg-white/90 transition-colors mb-3">
          Try again
        </button>
        <button onClick={handleLogout} className="text-white/30 text-xs hover:text-white/50 transition-colors">Sign out</button>
      </div>
    )
  }

  // Sort descending by effective score (raw match_score − 20 if timing_warning)
  const sorted = [...destinations].sort((a, b) => effectiveScore(b) - effectiveScore(a))

  // Use server-supplied locked field (set by applyPaywall) — authoritative paywall state.
  // Server sorts by raw match_score; client sorts by effectiveScore. Both orderings agree on
  // which cards are locked, but client timing-penalty adjustments could diverge. Trusting the
  // server prevents the flash where a card briefly renders unlocked before the blur kicks in.
  const freeCards   = previewAll ? sorted : sorted.filter(d => !d.locked)
  const lockedCards = previewAll ? []     : sorted.filter(d =>  d.locked)
  const topLockedScore = lockedCards.length > 0 ? effectiveScore(lockedCards[0]) : 0
  const topFreeScore   = freeCards.length   > 0 ? effectiveScore(freeCards[0])   : 0
  // When scores are bunched (gap < 10pts), lead with gem score on locked cards
  const gemEmphasis    = lockedCards.length > 0 && (topLockedScore - topFreeScore) < 10

  return (
    <div className="min-h-screen bg-[#0d1f35]">
      <main className="max-w-2xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          {/* Title row — Plan a trip button desktop right */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-xs text-white/35 uppercase tracking-widest font-label mb-2">Your results</p>
              <h1 className="font-serif italic text-4xl text-white leading-tight">
                {destinations.length} destinations
                <br />
                <span className="text-white/50">matched your profile</span>
              </h1>
            </div>
            {/* Desktop Plan a trip button */}
            <a
              href="/plan/new"
              className="hidden md:flex items-center gap-2 flex-shrink-0 bg-[#C97552] text-white text-sm font-medium px-4 py-2.5 rounded-full hover:bg-[#b86644] transition-colors mt-2"
            >
              🗺️ Plan a trip
            </a>
          </div>
          <p className="text-white/40 text-sm">
            Ranked by how well they fit your travel style.
            {' '}Your top {FREE_TIER_LIMIT} are free forever.
          </p>
          {dietaryPrefs.length > 0 && (
            <p className="text-white/30 text-xs mt-2">
              {dietaryFilterLabel(dietaryPrefs)}
            </p>
          )}
          {/* Gem legend + PreviewAll toggle on the same row */}
          <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
            <GemLegend />
            <button
              onClick={() => setPreviewAll(p => !p)}
              className={`text-xs font-label tracking-widest uppercase transition-colors px-3 py-1 rounded-full border flex-shrink-0 ${
                previewAll
                  ? 'border-[#C97552]/60 text-[#C97552] bg-[#C97552]/10'
                  : 'border-white/15 text-white/35 hover:text-white/60 hover:border-white/30'
              }`}
            >
              {previewAll ? '🔓 All unlocked' : '👁 Preview all'}
            </button>
          </div>
        </div>

        {/* Mobile floating Plan a trip button — above bottom nav */}
        <a
          href="/plan/new"
          className="md:hidden fixed bottom-[70px] right-4 z-20 flex items-center gap-2 bg-[#C97552] text-white text-sm font-semibold px-5 py-3 rounded-full shadow-lg shadow-[#C97552]/20 hover:bg-[#b86644] transition-colors"
        >
          🗺️ Plan a trip
        </a>

        {/* ── Mode selector ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          {/* Discover */}
          <button
            onClick={() => setMode('discover')}
            className={`flex flex-col items-start gap-1 rounded-2xl border px-4 py-4 text-left transition-all duration-200 ${
              mode === 'discover'
                ? 'border-[#C97552]/45 bg-[#C97552]/6'
                : 'border-white/10 bg-white/3 hover:border-white/18 hover:bg-white/5'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-base leading-none">🧭</span>
              <span className={`text-sm font-medium ${mode === 'discover' ? 'text-white/90' : 'text-white/55'}`}>
                Discover
              </span>
            </div>
            <p className={`text-[11px] leading-snug ${mode === 'discover' ? 'text-white/45' : 'text-white/28'}`}>
              Find hidden gems matched to you
            </p>
          </button>

          {/* Search */}
          <button
            onClick={() => setMode('search')}
            className={`flex flex-col items-start gap-1 rounded-2xl border px-4 py-4 text-left transition-all duration-200 ${
              mode === 'search'
                ? 'border-[#C97552]/45 bg-[#C97552]/6'
                : 'border-white/10 bg-white/3 hover:border-white/18 hover:bg-white/5'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-base leading-none">🔍</span>
              <span className={`text-sm font-medium ${mode === 'search' ? 'text-white/90' : 'text-white/55'}`}>
                I know where I&apos;m going
              </span>
            </div>
            <p className={`text-[11px] leading-snug ${mode === 'search' ? 'text-white/45' : 'text-white/28'}`}>
              Get local intel for any destination
            </p>
          </button>
        </div>

        {/* ── Search panel ──────────────────────────────────────────────────── */}
        {mode === 'search' && (
          <div className="mb-8">
            <p className="text-white/60 text-sm font-medium mb-4">Where are you going?</p>
            <div className="flex gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="City, country, or region..."
                autoFocus
                className="flex-1 bg-white/5 border border-white/12 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 outline-none focus:border-[#C97552]/40 focus:bg-white/7 transition-all"
              />
              <button
                onClick={handleSearch}
                disabled={!searchQuery.trim()}
                className="flex-shrink-0 bg-[#C97552] text-white text-sm font-medium px-5 py-3 rounded-xl hover:bg-[#b86644] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Get local guide →
              </button>
            </div>
          </div>
        )}

        {/* ── Destination cards (discover mode only) ────────────────────────── */}
        {mode === 'discover' && (
        <div className="space-y-3">
          {/* Free cards (lowest scores shown first) */}
          {freeCards.map((dest, i) => (
            <DestinationCard
              key={dest.name}
              dest={dest}
              rank={i + 1}
              locked={false}
              currency={currency}
              dietaryPrefs={dietaryPrefs}
              homeCity={homeCity}
            />
          ))}

          {/* Conversion hook + locked cards */}
          {lockedCards.length > 0 && (
            <>
              <ConversionHook lockedCount={lockedCards.length} topScore={topLockedScore} />
              {lockedCards.map((dest, i) => (
                <DestinationCard
                  key={dest.name + i}
                  dest={dest}
                  rank={FREE_TIER_LIMIT + i + 1}
                  locked
                  currency={currency}
                  gemEmphasis={gemEmphasis}
                  dietaryPrefs={dietaryPrefs}
                  homeCity={homeCity}
                />
              ))}
            </>
          )}
        </div>
        )}

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-white/8 text-center">
          <p className="text-white/20 text-xs">Results refresh when your profile changes.</p>
        </div>
      </main>
    </div>
  )
}
