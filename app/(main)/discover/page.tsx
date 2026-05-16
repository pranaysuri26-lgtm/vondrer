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
  let doneCalled = false
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
            case 'done':        doneCalled = true; handlers.onDone(); break
          }
        } catch { /* malformed event — ignore */ }
      }
    }
  } finally {
    reader.releaseLock()
    // Safety net: if the stream closed without a 'done' event (server crash,
    // unhandled exception, network drop), call onDone so the page never hangs
    // forever waiting for an event that will never arrive.
    if (!doneCalled) handlers.onDone()
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
        <div className="absolute inset-0 rounded-full border border-[#E8E0D6]" />
        <div className="absolute inset-0 rounded-full border border-[#C97552]/40"
          style={{ animation: 'spin 3s linear infinite' }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl" style={{ animation: 'spin 3s linear infinite reverse' }}>🧭</span>
        </div>
      </div>
      <span className="font-serif italic text-3xl text-[#1A1A1A] tracking-wide mb-8">Voya</span>
      <p key={lineIdx} className="text-[#5C564E] text-sm tracking-wide"
        style={{ animation: 'fadeIn 0.4s ease' }}>
        {LOADING_LINES[lineIdx]}
      </p>
      {slow && (
        <p className="text-[#9A8E7E] text-xs mt-4 max-w-xs text-center">
          Building your personalised shortlist — first-time results take a little longer.
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
        className="flex items-center gap-1.5 text-xs text-[#8A7E6E] hover:text-[#5C564E] transition-colors">
        <span>💎 Gem score — how undiscovered a place truly is</span>
        <span className={`w-4 h-4 rounded-full border border-[#CCC4B8] flex items-center justify-center text-[10px] flex-shrink-0 ${open ? 'bg-[#EDE5D8] border-white/35 text-[#4A4440]' : ''}`}>?</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 z-10 bg-[#FAF8F5] border border-[#E2D8CE] rounded-xl p-4 shadow-xl min-w-[220px]">
          <div className="space-y-2.5">
            {GEM_LEVELS.map(({ dots, label }) => (
              <div key={dots} className="flex items-center gap-3">
                <div className="flex gap-1 flex-shrink-0">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < dots ? 'bg-[#C97552]' : 'bg-[#E2D8CC]'}`} />
                  ))}
                </div>
                <span className="text-xs text-[#6b5f54]">{label}</span>
              </div>
            ))}
          </div>
          <button onClick={() => setOpen(false)}
            className="mt-3 text-[10px] text-[#A8A09A] hover:text-[#6b5f54] transition-colors w-full text-right">close</button>
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
        <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < Math.round(score / 2) ? 'bg-[#C97552]' : 'bg-[#E2D8CC]'}`} />
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
          className="flex items-center gap-1 text-[10px] text-[#5C564E] bg-white border border-[#E8E0D6] rounded-full px-2 py-0.5">
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

// ─── Multi-airport cities ─────────────────────────────────────────────────────
// When a destination has multiple usable airports, we show per-airport flight
// search rows so the user can compare MIA vs FLL, JFK vs EWR, etc. in-context.

interface AirportOption {
  iata:  string   // e.g. "FLL"
  label: string   // e.g. "Fort Lauderdale (FLL)"
  note:  string   // one-line trade-off
}

const MULTI_AIRPORT_CITIES: Record<string, AirportOption[]> = {
  // ── United States ──────────────────────────────────────────────────────────
  'miami': [
    { iata: 'MIA', label: 'Miami Intl (MIA)',        note: 'Main hub · 25 min to downtown · more direct routes' },
    { iata: 'FLL', label: 'Fort Lauderdale (FLL)',   note: '45 min to Miami · often 30–40% cheaper on Spirit/Southwest' },
  ],
  'new york': [
    { iata: 'JFK', label: 'JFK',                     note: 'International hub · 45–60 min to Manhattan' },
    { iata: 'LGA', label: 'LaGuardia (LGA)',         note: 'Domestic only · 20–30 min to Manhattan' },
    { iata: 'EWR', label: 'Newark (EWR)',             note: 'New Jersey · 45 min to Manhattan · often cheapest' },
  ],
  'new york city': [
    { iata: 'JFK', label: 'JFK',                     note: 'International hub · 45–60 min to Manhattan' },
    { iata: 'LGA', label: 'LaGuardia (LGA)',         note: 'Domestic only · 20–30 min to Manhattan' },
    { iata: 'EWR', label: 'Newark (EWR)',             note: 'New Jersey · 45 min to Manhattan · often cheapest' },
  ],
  'los angeles': [
    { iata: 'LAX', label: 'LAX',                     note: 'Main hub · all major carriers · most connections' },
    { iata: 'BUR', label: 'Burbank (BUR)',            note: '30 min to Hollywood · smaller, faster security' },
    { iata: 'LGB', label: 'Long Beach (LGB)',        note: 'JetBlue focus city · south of downtown' },
    { iata: 'SNA', label: 'Orange County (SNA)',     note: 'Best for Disneyland/Newport · 45 min from LA' },
  ],
  'chicago': [
    { iata: 'ORD', label: "O'Hare (ORD)",            note: 'International hub · more routes · farther out' },
    { iata: 'MDW', label: 'Midway (MDW)',             note: 'Closer to downtown · Southwest focus · often cheaper' },
  ],
  'dallas': [
    { iata: 'DFW', label: 'Dallas/Fort Worth (DFW)', note: 'AA hub · most routes · 30 min from Dallas' },
    { iata: 'DAL', label: 'Love Field (DAL)',        note: 'Southwest only · closer to downtown · limited routes' },
  ],
  'houston': [
    { iata: 'IAH', label: 'George Bush (IAH)',       note: 'United hub · international flights · north of city' },
    { iata: 'HOU', label: 'Hobby (HOU)',             note: 'Southwest + budget · closer to downtown' },
  ],
  'washington': [
    { iata: 'DCA', label: 'Reagan (DCA)',            note: 'Closest to DC · domestic only · Metro access' },
    { iata: 'IAD', label: 'Dulles (IAD)',            note: 'International flights · 45 min from DC' },
    { iata: 'BWI', label: 'Baltimore (BWI)',         note: 'Often cheapest · Southwest hub · 45 min from DC' },
  ],
  'san francisco': [
    { iata: 'SFO', label: 'SFO',                    note: 'Main hub · international routes · BART to city' },
    { iata: 'OAK', label: 'Oakland (OAK)',           note: 'Budget carriers · 30 min to SF by BART · often cheaper' },
    { iata: 'SJC', label: 'San Jose (SJC)',          note: 'South Bay focus · 1h to SF · good for Silicon Valley' },
  ],
  'boston': [
    { iata: 'BOS', label: 'Logan (BOS)',             note: 'Only major option · Silver Line to city free' },
  ],
  // ── Europe ────────────────────────────────────────────────────────────────
  'london': [
    { iata: 'LHR', label: 'Heathrow (LHR)',         note: 'Main hub · all major carriers · Tube + Elizabeth line' },
    { iata: 'LGW', label: 'Gatwick (LGW)',          note: 'Budget + charter flights · 30 min by train · cheaper' },
    { iata: 'STN', label: 'Stansted (STN)',         note: 'Ryanair/easyJet hub · 50 min to city · cheapest fares' },
    { iata: 'LTN', label: 'Luton (LTN)',            note: 'Wizz Air + easyJet · 40 min to city · check total cost' },
  ],
  'paris': [
    { iata: 'CDG', label: 'Charles de Gaulle (CDG)', note: 'Main hub · all carriers · RER B to city' },
    { iata: 'ORY', label: 'Orly (ORY)',              note: 'Mostly domestic/EU · closer to south Paris' },
  ],
  'rome': [
    { iata: 'FCO', label: 'Fiumicino (FCO)',         note: 'Main hub · direct trains to Termini · 30 min' },
    { iata: 'CIA', label: 'Ciampino (CIA)',          note: 'Ryanair/Wizzair · cheaper · 40 min · bus only' },
  ],
  'milan': [
    { iata: 'MXP', label: 'Malpensa (MXP)',         note: 'Long-haul hub · 50 min to city by train' },
    { iata: 'LIN', label: 'Linate (LIN)',           note: 'Short-haul · 7km from centre · often cheaper' },
    { iata: 'BGY', label: 'Bergamo (BGY)',          note: 'Ryanair hub · 50 min to Milan · cheapest fares' },
  ],
  'barcelona': [
    { iata: 'BCN', label: 'El Prat (BCN)',          note: 'Only main option · Aerobus or Metro to city' },
  ],
  // ── Asia ─────────────────────────────────────────────────────────────────
  'tokyo': [
    { iata: 'NRT', label: 'Narita (NRT)',           note: 'International hub · 60–80 min to city' },
    { iata: 'HND', label: 'Haneda (HND)',           note: 'Closer to city · 30 min · domestic + some intl' },
  ],
  'bangkok': [
    { iata: 'BKK', label: 'Suvarnabhumi (BKK)',     note: 'Main intl hub · 30 min to city by rail' },
    { iata: 'DMK', label: 'Don Mueang (DMK)',       note: 'Budget airlines (AirAsia, Nok) · cheaper fares' },
  ],
  'kuala lumpur': [
    { iata: 'KUL', label: 'KLIA (KUL)',             note: 'Main hub · KLIA Ekspres 28 min to city' },
    { iata: 'SZB', label: 'Subang (SZB)',           note: 'Firefly/Berjaya · domestic only · near PJ' },
  ],
  'jakarta': [
    { iata: 'CGK', label: 'Soekarno-Hatta (CGK)',  note: 'Only option for Jakarta · Railink to city' },
  ],
}

function getAirportOptions(destName: string): AirportOption[] {
  return MULTI_AIRPORT_CITIES[destName.toLowerCase().trim()] ?? []
}

function buildFlightSearchUrl(homeCity: string, iata: string, destName: string, country: string, engine: 'google' | 'skyscanner'): string {
  if (engine === 'skyscanner') {
    const orig = homeCity.toLowerCase().replace(/\s+/g, '-')
    return `https://www.skyscanner.com/transport/flights/${encodeURIComponent(orig)}/${iata.toLowerCase()}/`
  }
  return `https://www.google.com/travel/flights?q=flights+to+${iata}+from+${encodeURIComponent(homeCity)}`
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
      <p className="text-[10px] text-[#9A8E7E] uppercase tracking-widest mb-2.5 font-label">
        How to get there
      </p>

      {/* Primary — always visible */}
      <PrimaryTransportCard m={primary} homeCity={homeCity} destName={dest.name} country={dest.country} />

      {/* Alternates — collapsed by default */}
      {alternates.length > 0 && (
        <div className="mt-2">
          <button
            onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
            className="text-[11px] text-[#6b5f54] hover:text-[#3A3430] transition-colors flex items-center gap-1.5 py-1"
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

      <p className="text-[10px] text-[#A8A09A] mt-2 leading-snug">
        Carriers and prices are AI estimates — always compare live fares before booking.
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
  const isFlight     = m.mode === 'fly'
  const airports     = isFlight ? getAirportOptions(destName) : []
  const hasAirports  = airports.length > 1

  return (
    <div className="bg-[#C97552]/8 border border-[#C97552]/20 rounded-xl px-3 py-3">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">{icon}</span>
          <span className="text-xs font-semibold text-[#C97552]">
            {isFlight ? 'Flight' : (m.service_name || TRANSPORT_LABELS[m.mode])}
          </span>
          {isFlight && m.service_name && (
            <span className="text-[10px] text-[#8A7E6E]">via {m.service_name}</span>
          )}
        </div>
        <span className="text-[9px] text-[#C97552]/70 border border-[#C97552]/25 rounded-full px-2 py-0.5 uppercase tracking-wider font-label flex-shrink-0">
          ✓ Recommended route
        </span>
      </div>
      <div className="flex items-baseline gap-3 text-xs mb-1">
        <span className="text-[#3A3430] font-medium">{m.duration}</span>
        {m.cost && <span className="text-[#6b5f54]">est. {m.cost}</span>}
      </div>
      <p className="text-[11px] text-[#6b5f54] leading-snug mb-1.5">{m.note}</p>
      {m.booking_window && (
        <p className="text-[11px] text-[#8A7E6E] mb-2">📅 {m.booking_window}</p>
      )}

      {/* Flight with multiple airports — show per-airport rows */}
      {isFlight && hasAirports ? (
        <div className="mt-2 space-y-2">
          <p className="text-[10px] text-[#9A8E7E] uppercase tracking-widest font-label">Where to land</p>
          {airports.map((ap, i) => (
            <div key={ap.iata} className={`rounded-lg px-3 py-2.5 border ${
              i === 0 ? 'border-[#C97552]/25 bg-[#C97552]/5' : 'border-[#E8E0D6] bg-[#F5F2ED]'
            }`}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs text-[#3A3430] font-medium">{ap.label}</span>
                {i === 0 && <span className="text-[9px] text-[#C97552]/60 uppercase tracking-wider font-label">Main</span>}
              </div>
              <p className="text-[10px] text-[#7A6E64] leading-snug mb-1.5">{ap.note}</p>
              <div className="flex gap-3">
                <a
                  href={buildFlightSearchUrl(homeCity, ap.iata, destName, country, 'google')}
                  target="_blank" rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="text-[11px] text-[#C97552]/70 hover:text-[#C97552] transition-colors"
                >
                  Google Flights ↗
                </a>
                <a
                  href={buildFlightSearchUrl(homeCity, ap.iata, destName, country, 'skyscanner')}
                  target="_blank" rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="text-[11px] text-[#8A7E6E] hover:text-[#5A504A] transition-colors"
                >
                  Skyscanner ↗
                </a>
              </div>
            </div>
          ))}
        </div>
      ) : isFlight ? (
        /* Single airport or unknown city — generic compare links */
        <div className="flex flex-wrap gap-3 mt-1">
          <a
            href={`https://www.google.com/travel/flights?q=flights+from+${encodeURIComponent(homeCity)}+to+${encodeURIComponent(destName+', '+country)}`}
            target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-[11px] text-[#C97552]/80 hover:text-[#C97552] transition-colors font-medium"
          >
            Compare on Google Flights ↗
          </a>
          <a
            href={`https://www.skyscanner.com/transport/flights/${encodeURIComponent(homeCity.toLowerCase())}/${encodeURIComponent(destName.toLowerCase())}/`}
            target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-[11px] text-[#7A6E64] hover:text-[#4A4440] transition-colors"
          >
            Skyscanner ↗
          </a>
        </div>
      ) : (
        /* Non-flight transport */
        <a
          href={link}
          target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="text-[11px] text-[#C97552]/80 hover:text-[#C97552] transition-colors"
        >
          {m.booking ? `Book on ${m.booking}` : label} ↗
        </a>
      )}
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
    <div className="bg-[#F5F2ED] border border-[#E8E0D6] rounded-xl px-3 py-2.5 flex items-start gap-3">
      <span className="text-sm leading-none pt-0.5 flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xs text-[#5A504A] font-medium">
            {m.service_name || TRANSPORT_LABELS[m.mode]}
          </span>
          <span className="text-xs text-[#7A6E64]">{m.duration}</span>
          {m.cost && <span className="text-xs text-[#9A8E7E]">{m.cost}</span>}
        </div>
        <p className="text-[11px] text-[#7A6E64] leading-snug mt-0.5">{m.note}</p>
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="text-[11px] text-[#8A7E6E] hover:text-[#5C564E] transition-colors"
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
      isLimited ? 'border-[#D8D0C4] text-[#7A6E64] bg-[#F5F2ED]' :
                  'border-[#E8E0D6] text-[#A8A09A] bg-[#FAF8F5] line-through'
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
      <p className="text-[10px] text-[#9A8E7E] uppercase tracking-widest mb-2.5 font-label">
        Where to stay
      </p>

      {/* Primary recommendation */}
      <div className="bg-white border border-[#E8E0D6] rounded-xl px-3 py-3">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2">
            <span className="text-base leading-none">{icon}</span>
            <span className="text-xs font-semibold text-[#2A2420]">{rec.type}</span>
          </div>
          {rec.name && (
            <span className="text-[10px] text-[#6b5f54] text-right leading-tight flex-shrink-0 max-w-[120px]">{rec.name}</span>
          )}
        </div>
        <p className="text-sm text-[#3A3430] font-medium mb-1">{rec.price_range}</p>
        <p className="text-[11px] text-[#6b5f54] leading-snug mb-1.5">{rec.why}</p>
        {rec.book_ahead && (
          <p className="text-[11px] text-[#8A7E6E] mb-2">📅 {rec.book_ahead}</p>
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
        <div className="mt-2 bg-[#FAF8F5] border border-[#EDE5D8] rounded-xl px-3 py-2.5">
          <div className="flex items-baseline gap-2 flex-wrap mb-0.5">
            <span className="text-xs text-[#5C564E] font-medium">Alt: {acc.alternative.type}</span>
            <span className="text-xs text-[#8A7E6E]">{acc.alternative.price_range}</span>
          </div>
          <p className="text-[11px] text-[#7A6E64] leading-snug">{acc.alternative.note}</p>
          <span className="text-[10px] text-[#9A8E7E]">via {acc.alternative.book_via}</span>
        </div>
      )}

      {/* Neighbourhood advice */}
      {acc.neighbourhood_advice && (
        <p className="text-[11px] text-[#7A6E64] mt-2 leading-snug">
          <span className="text-[#A8A09A] uppercase tracking-wider text-[10px] font-label mr-1">Area</span>
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
      className="relative h-52 overflow-hidden"
      style={images.length === 0 ? { background: fallback } : undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Shimmer while fetching */}
      {images.length === 0 && (
        <>
          <div className="absolute inset-0 bg-white animate-pulse" />
          <div className="absolute inset-0 flex items-end p-4">
            <span className="font-serif italic text-[#A8A09A] text-2xl">{dest.name}</span>
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
                i === activeIdx ? 'w-3 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-[#F5F2ED]5 hover:bg-[#F5F0EA]0'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Destination card (dark grid card) ────────────────────────────────────────

function DestinationCard({
  dest, rank, locked, currency, gemEmphasis = false, dietaryPrefs = [], homeCity = '',
  isSaved = false, isSaving = false, onSave,
}: {
  dest:          RecommendedDestination
  rank:          number
  locked:        boolean
  currency:      CurrencyInfo
  gemEmphasis?:  boolean
  dietaryPrefs?: string[]
  homeCity?:     string
  isSaved?:      boolean
  isSaving?:     boolean
  onSave?:       (dest: RecommendedDestination) => void
}) {
  const displayScore  = effectiveScore(dest)
  const timingPenalty = dest.timing_warning ? dest.match_score - displayScore : 0
  const country       = dest.state_province ? `${dest.state_province}, ${dest.country}` : dest.country
  const primaryTransport = dest.transport?.[0]

  return (
    <div className="rounded-3xl overflow-hidden bg-[#1C1C1E] border border-[#2A2A2E] flex flex-col shadow-xl shadow-black/20">

      {/* ── Photo / carousel ── */}
      <div className="relative flex-shrink-0">
        {locked ? (
          <div className="relative h-52 overflow-hidden" style={{ background: 'linear-gradient(135deg,#252525,#1C1C1E)' }}>
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-10 h-10 text-white/8" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/>
              </svg>
            </div>
          </div>
        ) : (
          <ImageCarousel dest={dest} />
        )}

        {/* Rank badge — top left */}
        <div className="absolute top-3 left-3 bg-black/50 backdrop-blur-sm rounded-full px-2.5 py-1">
          <span className="text-[10px] text-white/70 font-label tracking-widest uppercase">#{rank}</span>
        </div>

        {/* Save button — top right (unlocked only) */}
        {onSave && !locked && (
          <button
            onClick={e => { e.stopPropagation(); onSave(dest) }}
            disabled={isSaving}
            title={isSaved ? 'Remove from saved' : 'Save this destination'}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center transition-all hover:bg-black/70 disabled:opacity-50"
          >
            {isSaving ? (
              <svg className="w-3.5 h-3.5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill={isSaved ? '#C97552' : 'none'} stroke={isSaved ? '#C97552' : 'white'} strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
              </svg>
            )}
          </button>
        )}
      </div>

      {/* ── Card body ── */}
      <div className="flex-1 flex flex-col px-5 pt-4 pb-5 gap-3">

        {/* Destination name + match% pill */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {locked ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-3.5 h-3.5 text-[#666] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/>
                  </svg>
                  <span className="text-[#777] text-sm font-medium">Locked destination</span>
                </div>
                <p className="text-[#555] text-xs">Upgrade to reveal full details</p>
              </>
            ) : (
              <>
                <h2 className="font-serif italic text-2xl text-white leading-tight mb-0.5 truncate">{dest.name}</h2>
                <p className="text-sm text-[#888]">{country}</p>
              </>
            )}
          </div>
          {/* Match % pill */}
          {locked && gemEmphasis ? (
            <div className="flex-shrink-0 flex items-center gap-2 bg-[#2A2A2E] border border-[#333] rounded-full px-3 py-1.5">
              <GemDots score={dest.hidden_gem_score} />
              <span className="text-xs text-[#888]">{gemLabel(dest.hidden_gem_score)}</span>
            </div>
          ) : (
            <div className={`flex-shrink-0 rounded-full px-3 py-1.5 ${
              locked
                ? 'bg-[#2A2A2E]'
                : timingPenalty > 0
                  ? 'bg-amber-500/20 border border-amber-500/30'
                  : 'bg-[#C97552]'
            }`}>
              <span className={`text-xs font-bold ${
                locked ? 'text-[#666]' : timingPenalty > 0 ? 'text-amber-400' : 'text-white'
              }`}>
                {displayScore}% match
              </span>
            </div>
          )}
        </div>

        {/* Gem dots (unlocked) */}
        {!locked && !(locked && gemEmphasis) && dest.hidden_gem_score && (
          <GemDots score={dest.hidden_gem_score} />
        )}

        {/* Timing + event badges */}
        {!locked && (dest.timing_warning || dest.upcoming_event) && (
          <div className="flex flex-wrap gap-1.5">
            {dest.timing_warning && (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-400/80 bg-amber-400/10 border border-amber-400/20 rounded-full px-2.5 py-1">
                {dest.timing_warning}
              </span>
            )}
            {dest.upcoming_event && (
              <span className="inline-flex items-center gap-1 text-[11px] text-[#C97552]/80 bg-[#C97552]/10 border border-[#C97552]/20 rounded-full px-2.5 py-1">
                🎪 {dest.upcoming_event.name} — {dest.upcoming_event.when}
              </span>
            )}
          </div>
        )}

        {/* Reason tags — up to 3 dark pills */}
        {!locked && dest.reasons?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {dest.reasons.slice(0, 3).map((r, i) => (
              <span key={i} className="text-xs text-[#AAA] bg-[#2A2A2E] border border-[#333] px-2.5 py-1 rounded-full leading-none">
                {r}
              </span>
            ))}
          </div>
        )}

        {/* Personalization note */}
        {!locked && dest.personalization_note && (
          <p className="text-xs text-[#777] italic leading-snug line-clamp-2">
            {dest.personalization_note}
          </p>
        )}

        {/* Dietary badges */}
        {!locked && <DietaryBadges dest={dest} userPrefs={dietaryPrefs} />}

        {/* Timing note */}
        {!locked && dest.timing_note && (
          <p className={`text-xs leading-snug ${dest.timing_note.startsWith('⚠️') ? 'text-amber-400/80' : 'text-[#777]'}`}>
            {dest.timing_note.startsWith('⚠️') ? '' : '📅 '}{dest.timing_note}
          </p>
        )}

        {/* HOW TO GET THERE — abbreviated (first mode only) */}
        {!locked && primaryTransport && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#555] font-label tracking-widest uppercase flex-shrink-0">Getting there</span>
            <span className="text-base leading-none">{TRANSPORT_ICONS[primaryTransport.mode] ?? '✈️'}</span>
            <span className="text-xs text-[#888] truncate">
              {primaryTransport.duration_note ?? primaryTransport.mode}
            </span>
          </div>
        )}

        {/* Budget + Best time */}
        {!locked && (dest.budget_per_day_usd || dest.best_time_to_visit) && (
          <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-[#2A2A2E] pt-3 mt-auto">
            {dest.budget_per_day_usd && (
              <div>
                <p className="text-[10px] text-[#555] font-label tracking-widest uppercase mb-0.5">Budget / day</p>
                <p className="text-sm text-white font-medium">{displayBudget(dest.budget_per_day_usd, currency)}</p>
                <p className="text-[10px] text-[#555] mt-0.5">excl. flights</p>
              </div>
            )}
            {dest.best_time_to_visit && (
              <div>
                <p className="text-[10px] text-[#555] font-label tracking-widest uppercase mb-0.5">Best time</p>
                <p className="text-sm text-[#AAA]">{dest.best_time_to_visit}</p>
              </div>
            )}
          </div>
        )}

        {/* CTAs */}
        {!locked && (
          <div className="space-y-2 mt-1">
            <a
              href={`/plan/ai/${encodeURIComponent(dest.name)}?country=${encodeURIComponent(dest.country)}${dest.state_province ? `&state=${encodeURIComponent(dest.state_province)}` : ''}&from=discover`}
              className="block w-full text-center bg-[#C97552] text-white font-semibold text-sm py-3 rounded-full hover:bg-[#b86644] transition-colors"
            >
              Plan this trip →
            </a>
            <a
              href={`/guide?q=${encodeURIComponent(dest.name)}&c=${encodeURIComponent(dest.country)}${dest.state_province ? `&s=${encodeURIComponent(dest.state_province)}` : ''}`}
              className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-full border border-[#333] text-[#888] text-sm hover:border-[#555] hover:text-white transition-all"
            >
              <span>🗺</span>
              <span>Local guide</span>
            </a>
          </div>
        )}

        {/* Locked CTA */}
        {locked && (
          <div className="mt-auto pt-2">
            <div className="w-full py-3 rounded-full border border-[#333] flex items-center justify-center gap-2">
              <svg className="w-3.5 h-3.5 text-[#555]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              <span className="text-[#555] text-sm">Unlock to reveal</span>
            </div>
          </div>
        )}
      </div>
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
        <p className="text-[#2A2420] text-sm font-medium">You're on the list.</p>
        <p className="text-[#6b5f54] text-xs mt-1">We'll email you the moment paid unlock goes live.</p>
      </div>
    )
  }

  if (phase === 'form') {
    return (
      <div className="rounded-2xl border border-[#C97552]/25 bg-[#C97552]/5 px-6 py-5">
        <p className="text-[#2A2420] text-sm font-medium mb-1">
          Your {lockedCount} best match{lockedCount !== 1 ? 'es' : ''} — up to{' '}
          <span className="text-[#C97552] font-semibold">{topScore}% match</span> — unlock soon.
        </p>
        <p className="text-[#6b5f54] text-xs mb-4">
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
            className="flex-1 bg-[#F0EBE3] border border-[#D8D0C4] rounded-full px-4 py-2.5 text-[#1A1A1A] text-sm placeholder-[#8A7E6E] focus:outline-none focus:border-[#C97552]/60"
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
          className="text-[#9A8E7E] text-xs mt-3 hover:text-[#6b5f54] transition-colors"
        >
          ← Back
        </button>
      </div>
    )
  }

  // CTA phase
  return (
    <div className="rounded-2xl border border-[#C97552]/25 bg-[#C97552]/5 px-6 py-5">
      <p className="text-[#2A2420] text-sm font-medium mb-1">
        Your {lockedCount} best match{lockedCount !== 1 ? 'es' : ''} are waiting
        {' '}— including destinations up to{' '}
        <span className="text-[#C97552] font-semibold">{topScore}% match</span> for your profile.
      </p>
      <p className="text-[#7A6E64] text-xs mb-4">Paid unlock launching soon · one-time · 30 days access</p>
      <button
        onClick={() => setPhase('form')}
        className="bg-[#C97552] text-white font-semibold text-sm px-6 py-2.5 rounded-full hover:bg-[#b86644] transition-colors"
      >
        Get early access — be first to unlock →
      </button>
      <p className="text-[#A8A09A] text-xs mt-3">No spam. One email when it's live.</p>
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
  const [previewAll, setPreviewAll]     = useState(false)  // kept for compat, not used in UI
  const [mode, setMode]                 = useState<Mode>('discover')
  const [searchQuery, setSearchQuery]   = useState('')

  // Saved / bookmarked destinations — persisted in Supabase `saved_destinations` table
  const [savedIds, setSavedIds]                     = useState<Set<string>>(new Set())
  const [savedDestinations, setSavedDestinations]   = useState<RecommendedDestination[]>([])
  const [savingId, setSavingId]                     = useState<string | null>(null)

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

  // ── Saved destinations ────────────────────────────────────────────────────
  const savedKey = (name: string, country: string) => `${name}||${country}`

  useEffect(() => {
    async function loadSaved() {
      const supabase = getSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data, error } = await supabase
        .from('saved_destinations')
        .select('name, country, destination')
        .eq('user_id', user.id)
        .order('saved_at', { ascending: false })
      if (error || !data) return   // table might not exist yet — fail silently
      const ids = new Set(data.map((r: { name: string; country: string }) => savedKey(r.name, r.country)))
      setSavedIds(ids)
      setSavedDestinations(data.map((r: { destination: RecommendedDestination }) => r.destination))
    }
    loadSaved()
  }, [])

  const toggleSave = useCallback(async (dest: RecommendedDestination) => {
    const key = savedKey(dest.name, dest.country)
    const supabase = getSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setSavingId(key)
    if (savedIds.has(key)) {
      // Unsave
      await supabase
        .from('saved_destinations')
        .delete()
        .eq('user_id', user.id)
        .eq('name', dest.name)
        .eq('country', dest.country)
      setSavedIds(prev => { const next = new Set(prev); next.delete(key); return next })
      setSavedDestinations(prev => prev.filter(d => savedKey(d.name, d.country) !== key))
    } else {
      // Save
      await supabase
        .from('saved_destinations')
        .upsert({
          user_id:     user.id,
          name:        dest.name,
          country:     dest.country,
          destination: dest,
          saved_at:    new Date().toISOString(),
        }, { onConflict: 'user_id,name,country' })
      setSavedIds(prev => new Set([...prev, key]))
      setSavedDestinations(prev => [dest, ...prev.filter(d => savedKey(d.name, d.country) !== key)])
    }
    setSavingId(null)
  }, [savedIds])

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
          body: JSON.stringify({ force_refresh: retryCount > 0 }),
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
              console.log(
                `[Recommendations meta] travel_scope="${event.travel_scope}" domestic_scope="${event.domestic_scope}" city="${event.home_city}" country="${event.home_country}"`
              )
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
        <h1 className="text-xl font-light text-[#1A1A1A] mb-2">Couldn't load your destinations</h1>
        <p className="text-[#6b5f54] text-sm mb-6 max-w-xs">{errorMsg}</p>
        <button onClick={retry}
          className="bg-[#1A1A1A] text-white font-semibold text-sm px-8 py-3 rounded-full hover:bg-white/90 transition-colors mb-3">
          Try again
        </button>
        <button onClick={handleLogout} className="text-[#8A7E6E] text-xs hover:text-[#5C564E] transition-colors">Sign out</button>
      </div>
    )
  }

  // Sort descending by effective score (raw match_score − 20 if timing_warning)
  const sorted = [...destinations].sort((a, b) => effectiveScore(b) - effectiveScore(a))

  // Split into free (fully visible) and locked (paywall stubs).
  // Server already stripped real name/country/reasons from locked destinations —
  // there is nothing to "preview", so the old previewAll toggle is removed.
  const freeCards      = sorted.filter(d => !d.locked)
  const lockedCards    = sorted.filter(d =>  d.locked)
  const topLockedScore = lockedCards.length > 0 ? effectiveScore(lockedCards[0]) : 0
  const topFreeScore   = freeCards.length   > 0 ? effectiveScore(freeCards[0])   : 0
  // When scores are bunched (gap < 10pts), lead with gem score on locked cards
  const gemEmphasis    = lockedCards.length > 0 && (topLockedScore - topFreeScore) < 10

  return (
    <div className="min-h-screen bg-[#FAF8F5]">

      {/* Atmospheric hero header */}
      <div className="relative overflow-hidden mb-2">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1400&q=80&auto=format')", opacity: 0.35 }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#FAF8F5]/30 via-[#FAF8F5]/60 to-[#FAF8F5]" />

        <div className="relative max-w-6xl mx-auto px-4 pt-12 pb-8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-[#6b5f54] uppercase tracking-widest font-label mb-3">Your results</p>
              <h1 className="font-serif italic text-5xl text-[#1A1A1A] leading-tight">
                {destinations.length} destinations
                <br />
                <span className="text-[#6b5f54]">matched your profile</span>
              </h1>
            </div>
            <a
              href="/plan/new"
              className="hidden md:flex items-center gap-2 flex-shrink-0 bg-[#C97552] text-white text-sm font-semibold px-5 py-3 rounded-full hover:bg-[#b86644] transition-colors mt-2 shadow-lg shadow-[#C97552]/25"
            >
              🗺️ Plan a trip
            </a>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 pb-10">
        {/* Sub-header */}
        <div className="mb-8">
          <p className="text-[#6b5f54] text-sm">
            Ranked by how well they fit your travel style.
            {' '}Your top {FREE_TIER_LIMIT} are free forever.
          </p>
          {dietaryPrefs.length > 0 && (
            <p className="text-[#8A7E6E] text-xs mt-2">
              {dietaryFilterLabel(dietaryPrefs)}
            </p>
          )}
          {/* Gem legend + locked count on the same row */}
          <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
            <GemLegend />
            {lockedCards.length > 0 && (
              <a
                href="#unlock"
                className="text-xs font-label tracking-widest uppercase transition-colors px-3 py-1 rounded-full border border-[#D8D0C4] text-[#7A6E64] hover:text-[#4A4440] hover:border-[#C0B8AC] flex-shrink-0"
              >
                🔒 {lockedCards.length} locked
              </a>
            )}
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
                : 'border-[#E8E0D6] bg-[#F5F2ED] hover:border-[#D0C8BC] hover:bg-white'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-base leading-none">🧭</span>
              <span className={`text-sm font-medium ${mode === 'discover' ? 'text-[#1A1A1A]' : 'text-[#5A504A]'}`}>
                Discover
              </span>
            </div>
            <p className={`text-[11px] leading-snug ${mode === 'discover' ? 'text-[#6b5f54]' : 'text-[#8A7E6E]'}`}>
              Find hidden gems matched to you
            </p>
          </button>

          {/* Search */}
          <button
            onClick={() => setMode('search')}
            className={`flex flex-col items-start gap-1 rounded-2xl border px-4 py-4 text-left transition-all duration-200 ${
              mode === 'search'
                ? 'border-[#C97552]/45 bg-[#C97552]/6'
                : 'border-[#E8E0D6] bg-[#F5F2ED] hover:border-[#D0C8BC] hover:bg-white'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-base leading-none">🔍</span>
              <span className={`text-sm font-medium ${mode === 'search' ? 'text-[#1A1A1A]' : 'text-[#5A504A]'}`}>
                I know where I&apos;m going
              </span>
            </div>
            <p className={`text-[11px] leading-snug ${mode === 'search' ? 'text-[#6b5f54]' : 'text-[#8A7E6E]'}`}>
              Get local intel for any destination
            </p>
          </button>
        </div>

        {/* ── Search panel ──────────────────────────────────────────────────── */}
        {mode === 'search' && (
          <div className="mb-8">
            <p className="text-[#4A4440] text-sm font-medium mb-4">Where are you going?</p>
            <div className="flex gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="City, country, or region..."
                autoFocus
                className="flex-1 bg-white border border-[#E2D8CE] rounded-xl px-4 py-3 text-sm text-[#1A1A1A] placeholder-[#9A8E7E] outline-none focus:border-[#C97552]/40 focus:bg-[#F5F0EA] transition-all"
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

        {/* ── Saved destinations (always visible) ───────────────────────────── */}
        {savedDestinations.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-3.5 h-3.5 text-[#C97552]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
              </svg>
              <p className="text-xs text-[#7A6E64] uppercase tracking-widest font-label">Saved</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {savedDestinations.map((dest, i) => {
                const key = savedKey(dest.name, dest.country)
                return (
                  <DestinationCard
                    key={`saved-${key}-${i}`}
                    dest={dest}
                    rank={i + 1}
                    locked={false}
                    currency={currency}
                    dietaryPrefs={dietaryPrefs}
                    homeCity={homeCity}
                    isSaved={true}
                    isSaving={savingId === key}
                    onSave={toggleSave}
                  />
                )
              })}
            </div>
            <div className="mt-4 border-t border-[#E8E0D6]" />
          </div>
        )}

        {/* ── Destination cards (discover mode only) ────────────────────────── */}
        {mode === 'discover' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {/* Free cards */}
          {freeCards.map((dest, i) => {
            const key = savedKey(dest.name, dest.country)
            return (
              <DestinationCard
                key={`${dest.name}-${i}`}
                dest={dest}
                rank={i + 1}
                locked={false}
                currency={currency}
                dietaryPrefs={dietaryPrefs}
                homeCity={homeCity}
                isSaved={savedIds.has(key)}
                isSaving={savingId === key}
                onSave={toggleSave}
              />
            )
          })}

          {/* Conversion hook + locked cards */}
          {lockedCards.length > 0 && (
            <>
              <div id="unlock" className="col-span-full">
                <ConversionHook lockedCount={lockedCards.length} topScore={topLockedScore} />
              </div>
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
        <div className="mt-12 pt-8 border-t border-[#E8E0D6] text-center">
          <p className="text-[#A8A09A] text-xs">Results refresh when your profile changes.</p>
        </div>
      </main>
    </div>
  )
}
