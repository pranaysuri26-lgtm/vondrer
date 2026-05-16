'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { TripAskResponse, TripStop, LocalPlace, PhotoSpot, PhotoSunTimes } from '@/app/api/trip/ask/route'

const LeafletMap = dynamic(() => import('@/components/LeafletMap'), { ssr: false })

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stopTypeIcon(type: string) {
  const t = type?.toLowerCase()
  if (t === 'brunch')   return '🥞'
  if (t === 'coffee')   return '☕'
  if (t === 'scenic')   return '🌄'
  if (t === 'activity') return '🎯'
  if (t === 'rest')     return '🛋️'
  return '🍽️'
}

function dietaryBadge(fit: string) {
  if (!fit) return null
  const f = fit.toLowerCase()
  const cls = f.includes('fully')
    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    : f.includes('strong')
      ? 'text-emerald-400/80 bg-emerald-500/10 border-emerald-500/20'
      : 'text-amber-400 bg-amber-400/10 border-amber-400/20'
  return <span className={`text-[11px] font-label px-2.5 py-1 rounded-full border ${cls}`}>🌱 {fit}</span>
}

function sessionLabel(s: string) {
  switch (s) {
    case 'golden_sunrise': return { label: 'Golden · sunrise', color: 'text-amber-400 bg-amber-400/10 border-amber-400/20',   icon: '🌅' }
    case 'golden_sunset':  return { label: 'Golden · sunset',  color: 'text-amber-400 bg-amber-400/10 border-amber-400/20',   icon: '🌅' }
    case 'blue_sunrise':   return { label: 'Blue · sunrise',   color: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20', icon: '🌌' }
    case 'blue_sunset':    return { label: 'Blue · sunset',    color: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20', icon: '🌌' }
    case 'midday':         return { label: 'Midday',           color: 'text-sky-400 bg-sky-400/10 border-sky-400/20',         icon: '☀️' }
    case 'night':          return { label: 'Night',            color: 'text-white/50 bg-white/5 border-white/10',             icon: '🌙' }
    default:               return { label: s,                  color: 'text-white/50 bg-white/5 border-white/10',             icon: '📷' }
  }
}

const MODES = [
  {
    key:         'photo_spots' as const,
    icon:        '📷',
    label:       'Photo spots',
    placeholder: 'Best photo spots for golden hour in Santorini…',
    hint:        'Golden hour to the minute',
  },
  {
    key:         'road_trip' as const,
    icon:        '🚗',
    label:       'Road trip',
    placeholder: "I'm in Tampa, going to Miami by car. Want brunch — 3 vegans…",
    hint:        'Stops along the route',
  },
  {
    key:         'local_discovery' as const,
    icon:        '🗺️',
    label:       'Discover',
    placeholder: 'Hidden street food near the Medina in Fez…',
    hint:        'Local gems in one area',
  },
]

const EXAMPLE_QUERIES = [
  "Best photo spots for golden hour in Santorini — I shoot with a Sony and 35mm",
  "I'm in Tampa, going to Miami by car. Want brunch stops — 3 vegans in the group.",
  "Hidden street food within walking distance of the Medina in Fez",
  "Where would a solo traveller eat alone without feeling awkward in Tokyo",
]

// ─── Sun timing card ───────────────────────────────────────────────────────────

function SunTimingCard({ sun }: { sun: PhotoSunTimes }) {
  const sessions = [
    { emoji: '🌌', label: 'Blue',   period: 'AM', start: sun.blue_am_start,   end: sun.blue_am_end,   color: 'border-l-indigo-400' },
    { emoji: '🌅', label: 'Golden', period: 'AM', start: sun.golden_am_start, end: sun.golden_am_end, color: 'border-l-amber-400' },
    { emoji: '🌅', label: 'Golden', period: 'PM', start: sun.golden_pm_start, end: sun.golden_pm_end, color: 'border-l-amber-400' },
    { emoji: '🌌', label: 'Blue',   period: 'PM', start: sun.blue_pm_start,   end: sun.blue_pm_end,   color: 'border-l-indigo-400' },
  ]

  return (
    <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 overflow-hidden mb-5">
      <div className="px-4 pt-4 pb-3 border-b border-white/6">
        <p className="text-[10px] text-[#C97552] font-label tracking-widest uppercase">Today's light windows</p>
        <p className="text-white/40 text-xs mt-0.5">Approximate local time · {sun.date}</p>
      </div>
      <div className="grid grid-cols-2 divide-x divide-white/6">
        {/* Morning */}
        <div className="px-4 py-3 space-y-2">
          <p className="text-[10px] text-white/30 font-label tracking-widest uppercase">Morning</p>
          {sessions.filter(s => s.period === 'AM').map((s, i) => (
            <div key={i} className={`border-l-2 pl-2.5 ${s.color}`}>
              <p className="text-white/70 text-xs font-medium">{s.emoji} {s.label} hour</p>
              <p className="text-[#C97552] text-sm font-semibold tabular-nums">{s.start} – {s.end}</p>
            </div>
          ))}
        </div>
        {/* Evening */}
        <div className="px-4 py-3 space-y-2">
          <p className="text-[10px] text-white/30 font-label tracking-widest uppercase">Evening</p>
          {sessions.filter(s => s.period === 'PM').map((s, i) => (
            <div key={i} className={`border-l-2 pl-2.5 ${s.color}`}>
              <p className="text-white/70 text-xs font-medium">{s.emoji} {s.label} hour</p>
              <p className="text-[#C97552] text-sm font-semibold tabular-nums">{s.start} – {s.end}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Photo spot card ───────────────────────────────────────────────────────────

function PhotoSpotCard({
  spot, index, selected, onSelect,
}: {
  spot: PhotoSpot; index: number; selected: boolean; onSelect: () => void
}) {
  const sess = sessionLabel(spot.best_session)
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-2xl border transition-all duration-200 overflow-hidden ${
        selected
          ? 'border-[#C97552]/50 bg-[#C97552]/5'
          : 'border-white/10 bg-white/4 hover:border-[#C97552]/30 hover:bg-white/6'
      }`}
    >
      <div className="px-4 py-4">
        <div className="flex items-start gap-3">
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
            selected ? 'bg-[#C97552] text-white' : 'bg-[#C97552]/15 text-[#C97552]'
          }`}>
            {index + 1}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] text-[#C97552] font-label tracking-widest uppercase mb-0.5">{spot.area}</p>
                <p className="text-white/90 text-sm font-semibold leading-snug">{spot.name}</p>
              </div>
              <span className={`flex-shrink-0 text-[10px] font-label px-2 py-0.5 rounded-full border mt-0.5 ${sess.color}`}>
                {sess.icon} {sess.label}
              </span>
            </div>
          </div>
        </div>

        {selected && (
          <div className="mt-4 space-y-4">
            {/* Composition */}
            <div>
              <p className="text-[10px] text-white/30 font-label tracking-widest uppercase mb-1.5">Composition</p>
              <p className="text-white/80 text-sm leading-relaxed">{spot.composition}</p>
            </div>

            {/* Locals tip */}
            <div className="rounded-xl bg-white/5 border border-white/10 px-3.5 py-3">
              <p className="text-[10px] text-white/30 font-label tracking-widest uppercase mb-1">Where locals stand</p>
              <p className="text-white/70 text-sm leading-relaxed">{spot.locals_tip}</p>
            </div>

            {/* Light + lens row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-white/30 font-label tracking-widest uppercase mb-1">The light</p>
                <p className="text-white/50 text-xs leading-relaxed">{spot.light_note}</p>
              </div>
              <div>
                <p className="text-[10px] text-white/30 font-label tracking-widest uppercase mb-1">Lens</p>
                <p className="text-[#C97552] text-xs font-medium leading-relaxed">📷 {spot.lens}</p>
              </div>
            </div>

            {/* Avoid */}
            {spot.avoid && (
              <div className="flex gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-3.5 py-2.5">
                <span className="text-xs mt-0.5 flex-shrink-0">🚫</span>
                <div>
                  <p className="text-[10px] text-red-400/60 font-label tracking-wider uppercase mb-0.5">Tourist mistake</p>
                  <p className="text-red-400/80 text-xs leading-relaxed">{spot.avoid}</p>
                </div>
              </div>
            )}

            {spot.lat && spot.lng && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.name + ', ' + spot.area)}`}
                target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 text-xs text-[#C97552] hover:text-[#b86642] transition-colors"
              >
                View on maps →
              </a>
            )}
          </div>
        )}
      </div>
    </button>
  )
}

// ─── Road trip stop card ───────────────────────────────────────────────────────

function StopCard({ stop, index }: { stop: TripStop; index: number }) {
  const [open, setOpen] = useState(index < 2)
  return (
    <div className="rounded-2xl border border-white/10 bg-white/4 overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full text-left px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-9 h-9 rounded-full bg-[#C97552]/15 border border-[#C97552]/25 flex items-center justify-center text-base">
            {stopTypeIcon(stop.type)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] text-[#C97552] font-label tracking-widest uppercase mb-0.5">Stop {index + 1} · {stop.type}</p>
                <p className="text-white/90 text-sm font-semibold leading-snug">{stop.name}</p>
                <p className="text-white/50 text-xs mt-0.5">{stop.city}, {stop.state}</p>
              </div>
              <span className="text-[11px] text-white/40">{stop.price_range}</span>
            </div>
          </div>
        </div>
      </button>
      {open && (
        <div className="px-5 pb-4 border-t border-white/6 pt-3 space-y-3">
          <p className="text-white/60 text-sm leading-relaxed">{stop.why}</p>
          <div className="flex flex-wrap gap-2">
            {stop.dietary_fit && dietaryBadge(stop.dietary_fit)}
            {stop.distance_note && <span className="text-[11px] font-label px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-white/50">📍 {stop.distance_note}</span>}
            {stop.open_note && <span className="text-[11px] font-label px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-white/50">🕐 {stop.open_note}</span>}
          </div>
          {stop.lat && stop.lng && (
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.name + ', ' + stop.city)}`} target="_blank" rel="noopener noreferrer" className="text-xs text-[#C97552] hover:text-[#b86642] transition-colors">View on maps →</a>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Local place card ──────────────────────────────────────────────────────────

function PlaceCard({ place, index, selected, onSelect }: { place: LocalPlace; index: number; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-2xl border transition-all duration-200 overflow-hidden ${
        selected ? 'border-[#C97552]/50 bg-[#C97552]/5' : 'border-white/10 bg-white/4 hover:border-[#C97552]/30 hover:bg-white/6'
      }`}
    >
      <div className="px-4 py-4">
        <div className="flex items-start gap-3">
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${selected ? 'bg-[#C97552] text-white' : 'bg-[#C97552]/15 text-[#C97552]'}`}>
            {index + 1}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-[#C97552] font-label tracking-widest uppercase mb-0.5">{place.type}</p>
            <p className="text-white/90 text-sm font-semibold leading-snug">{place.name}</p>
            <p className="text-white/50 text-xs mt-0.5">{place.area}</p>
            {selected && <p className="text-white/40 text-xs italic mt-1">"{place.tagline}"</p>}
          </div>
          <span className="text-[11px] text-white/40 flex-shrink-0 mt-1">{place.price_range}</span>
        </div>
        {selected && (
          <div className="mt-3 pt-3 border-t border-white/8 space-y-3">
            <p className="text-white/60 text-sm leading-relaxed">{place.story}</p>
            <div className="flex flex-wrap gap-2">
              {place.best_time && <span className="text-[11px] font-label px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-white/50">🕐 {place.best_time}</span>}
            </div>
            {place.insider_tip && (
              <div className="flex gap-2 rounded-xl bg-[#C97552]/8 border border-[#C97552]/15 px-3 py-2.5">
                <span className="text-xs mt-0.5">💡</span>
                <p className="text-[#C97552]/80 text-xs leading-relaxed">{place.insider_tip}</p>
              </div>
            )}
            {place.lat && place.lng && (
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + ', ' + place.area)}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-xs text-[#C97552] hover:text-[#b86642] transition-colors">View on maps →</a>
            )}
          </div>
        )}
      </div>
    </button>
  )
}

// ─── Mic button ────────────────────────────────────────────────────────────────

function MicButton({ onResult, disabled }: { onResult: (text: string) => void; disabled: boolean }) {
  const [listening, setListening] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  const toggle = useCallback(() => {
    if (typeof window === 'undefined') return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SpeechRec = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!SpeechRec) { alert('Speech recognition not supported in this browser.'); return }
    if (listening) { recognitionRef.current?.stop(); setListening(false); return }
    const rec = new SpeechRec()
    rec.continuous = false; rec.interimResults = false; rec.lang = 'en-US'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => { const t = e.results[0]?.[0]?.transcript ?? ''; if (t) onResult(t); setListening(false) }
    rec.onerror = () => setListening(false)
    rec.onend   = () => setListening(false)
    recognitionRef.current = rec; rec.start(); setListening(true)
  }, [listening, onResult])

  return (
    <button onClick={toggle} disabled={disabled} title={listening ? 'Stop' : 'Speak'}
      className={`flex-shrink-0 w-12 h-12 rounded-full border flex items-center justify-center transition-all ${
        listening ? 'bg-[#C97552] border-[#C97552] shadow-lg shadow-[#C97552]/25 animate-pulse' : 'bg-white/5 border-white/15 hover:border-[#C97552]/50 hover:bg-white/8'
      } disabled:opacity-40 disabled:cursor-not-allowed`}>
      <span className={`text-lg ${listening ? 'text-white' : 'text-white/60'}`}>🎤</span>
    </button>
  )
}

// ─── Loading view ──────────────────────────────────────────────────────────────

function LoadingView({ query }: { query: string }) {
  const isPhoto    = /photo|shoot|golden|sunrise|sunset|lens|light|viewpoint/i.test(query)
  const isRoadTrip = /going to|heading to|driving|road trip/i.test(query)
  const steps = isPhoto
    ? ['Reading your brief…', 'Finding real viewpoints…', 'Calculating golden hour…', 'Pinning spots on the map…']
    : isRoadTrip
      ? ['Parsing your trip…', 'Scouting stops along the route…', 'Verifying real places…', 'Pinning on the map…']
      : ['Reading your request…', 'Finding local gems…', 'Verifying real places…', 'Pinning on the map…']
  const [step, setStep] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setStep(s => Math.min(s + 1, steps.length - 1)), 2400)
    return () => clearInterval(id)
  }, [steps.length])
  return (
    <div className="min-h-screen bg-[#0d1f35] flex flex-col items-center justify-center px-6 pb-24">
      <div className="text-center max-w-xs">
        <div className="text-4xl mb-6" style={{ animation: 'float 2s ease-in-out infinite' }}>
          {isPhoto ? '📷' : isRoadTrip ? '🚗' : '🗺️'}
        </div>
        <p className="text-white/50 text-sm">{steps[step]}</p>
        <div className="flex justify-center gap-1.5 mt-5">
          {steps.map((_, i) => <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i <= step ? 'bg-[#C97552]' : 'bg-white/15'}`} />)}
        </div>
      </div>
      <style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}`}</style>
    </div>
  )
}

// ─── Disclaimer footer ─────────────────────────────────────────────────────────

function Disclaimer({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3 mb-6">
      <p className="text-white/45 text-xs leading-relaxed">
        <span className="font-medium text-white/70">Before you go —</span> {label}
      </p>
    </div>
  )
}

// ─── Photo spots result ────────────────────────────────────────────────────────

function PhotoSpotsResult({ result, onReset }: {
  result: Extract<TripAskResponse, { mode: 'photo_spots' }>
  onReset: () => void
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(0)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  useEffect(() => {
    if (selectedIndex == null) return
    cardRefs.current[selectedIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedIndex])

  const hasMap = result.spots.some(p => p.lat != null)

  return (
    <div className="min-h-screen bg-[#0d1f35] pb-28">
      <div className="max-w-lg mx-auto px-4 pt-8">
        <button onClick={onReset} className="text-white/40 text-xs hover:text-white/70 transition-colors mb-5">← New search</button>

        <p className="text-[10px] text-[#C97552] font-label tracking-widest uppercase mb-2">
          Photo spots · {result.parsed.location}{result.parsed.country ? `, ${result.parsed.country}` : ''}
        </p>
        <h1 className="font-serif italic text-2xl text-white leading-tight mb-5">
          {result.spots.length} places to shoot.<br />
          <span className="text-white/50">Golden hour to the minute.</span>
        </h1>

        {/* Sun timing */}
        <SunTimingCard sun={result.sun} />

        {/* Map */}
        {hasMap && (
          <>
            <div className="rounded-2xl overflow-hidden border border-white/10 mb-2" style={{ height: '280px' }}>
              <LeafletMap
                places={result.spots}
                center={result.map_center}
                selectedIndex={selectedIndex}
                onSelect={i => setSelectedIndex(i)}
              />
            </div>
            <p className="text-white/25 text-[11px] text-center mb-5 font-label tracking-wider">TAP A PIN TO SELECT · SCROLL FOR DETAILS</p>
          </>
        )}

        {/* Spot cards */}
        <div className="space-y-2 mb-8">
          {result.spots.map((spot, i) => (
            <div key={i} ref={el => { cardRefs.current[i] = el }}>
              <PhotoSpotCard
                spot={spot} index={i}
                selected={selectedIndex === i}
                onSelect={() => setSelectedIndex(selectedIndex === i ? null : i)}
              />
            </div>
          ))}
        </div>

        <Disclaimer label="verify access, permissions, and any entry fees before visiting photo spots. Light times are approximate local estimates." />
        <button onClick={onReset} className="w-full py-4 rounded-full border border-white/15 bg-white/4 text-white/55 text-sm hover:border-[#C97552]/50 hover:text-[#C97552] transition-all">
          Search somewhere else →
        </button>
      </div>
    </div>
  )
}

// ─── Road trip result ──────────────────────────────────────────────────────────

function RoadTripResult({ result, onReset }: { result: Extract<TripAskResponse, { mode: 'road_trip' }>; onReset: () => void }) {
  return (
    <div className="min-h-screen bg-[#0d1f35] pb-28">
      <div className="max-w-lg mx-auto px-4 pt-8">
        <button onClick={onReset} className="text-white/40 text-xs hover:text-white/70 transition-colors mb-5">← New trip</button>
        <p className="text-[10px] text-[#C97552] font-label tracking-widest uppercase mb-2">Road trip · {result.stops.length} stops</p>
        <h1 className="font-serif italic text-3xl text-white leading-tight mb-2">
          {result.parsed.origin}<span className="text-white/40"> → </span>{result.parsed.destination}
        </h1>
        <p className="text-white/50 text-sm mb-6">{result.route_summary}</p>
        {result.parsed.dietary.length > 0 && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3 mb-6 flex items-start gap-2.5">
            <span className="text-base mt-0.5">🌱</span>
            <p className="text-emerald-400 text-sm">Filtered for: {result.parsed.dietary.join(', ')}{result.parsed.travelers ? ` · ${result.parsed.travelers} travellers` : ''}</p>
          </div>
        )}
        <div className="space-y-3 mb-8">
          {result.stops.map((s, i) => <StopCard key={i} stop={s} index={i} />)}
        </div>
        <Disclaimer label="verify opening hours and availability directly with each place." />
        <button onClick={onReset} className="w-full py-4 rounded-full border border-white/15 bg-white/4 text-white/55 text-sm hover:border-[#C97552]/50 hover:text-[#C97552] transition-all">Plan another trip →</button>
      </div>
    </div>
  )
}

// ─── Local discovery result ────────────────────────────────────────────────────

function LocalDiscoveryResult({ result, onReset }: { result: Extract<TripAskResponse, { mode: 'local_discovery' }>; onReset: () => void }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(0)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  useEffect(() => {
    if (selectedIndex == null) return
    cardRefs.current[selectedIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedIndex])
  const hasMap = result.places.some(p => p.lat != null)
  return (
    <div className="min-h-screen bg-[#0d1f35] pb-28">
      <div className="max-w-lg mx-auto px-4 pt-8">
        <button onClick={onReset} className="text-white/40 text-xs hover:text-white/70 transition-colors mb-5">← New search</button>
        <p className="text-[10px] text-[#C97552] font-label tracking-widest uppercase mb-2">
          {result.parsed.location}{result.parsed.country ? `, ${result.parsed.country}` : ''} · {result.places.length} places
        </p>
        <h1 className="font-serif italic text-2xl text-white leading-tight mb-5">
          {result.parsed.intent.length > 60 ? result.parsed.intent.slice(0, 60) + '…' : result.parsed.intent}
        </h1>
        {hasMap && (
          <>
            <div className="rounded-2xl overflow-hidden border border-white/10 mb-2" style={{ height: '300px' }}>
              <LeafletMap places={result.places} center={result.map_center} selectedIndex={selectedIndex} onSelect={i => setSelectedIndex(i)} />
            </div>
            <p className="text-white/25 text-[11px] text-center mb-5 font-label tracking-wider">TAP A PIN OR CARD TO EXPLORE</p>
          </>
        )}
        <div className="space-y-2 mb-8">
          {result.places.map((p, i) => (
            <div key={i} ref={el => { cardRefs.current[i] = el }}>
              <PlaceCard place={p} index={i} selected={selectedIndex === i} onSelect={() => setSelectedIndex(selectedIndex === i ? null : i)} />
            </div>
          ))}
        </div>
        <Disclaimer label="verify opening hours and availability directly with each place." />
        <button onClick={onReset} className="w-full py-4 rounded-full border border-white/15 bg-white/4 text-white/55 text-sm hover:border-[#C97552]/50 hover:text-[#C97552] transition-all">Search somewhere else →</button>
      </div>
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────────

type Phase = 'input' | 'loading' | 'result'

export default function TripAskPage() {
  const router  = useRouter()
  const [phase,     setPhase]     = useState<Phase>('input')
  const [query,     setQuery]     = useState('')
  const [error,     setError]     = useState('')
  const [result,    setResult]    = useState<TripAskResponse | null>(null)
  const [activeMode, setActiveMode] = useState<typeof MODES[number]['key'] | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const currentMode = MODES.find(m => m.key === activeMode)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [query])

  const handleSubmit = useCallback(async () => {
    if (!query.trim()) { setError('Describe what you\'re looking for first'); return }
    setError('')
    setPhase('loading')
    try {
      const res = await fetch('/api/trip/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), forced_mode: activeMode ?? undefined }),
      })
      if (res.status === 401) { router.push('/login'); return }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setResult(data as TripAskResponse)
      setPhase('result')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setPhase('input')
    }
  }, [query, router, activeMode])

  if (phase === 'loading') return <LoadingView query={query} />

  if (phase === 'result' && result) {
    const reset = () => { setPhase('input'); setQuery(''); setResult(null); setActiveMode(null) }
    if (result.mode === 'photo_spots')     return <PhotoSpotsResult     result={result} onReset={reset} />
    if (result.mode === 'local_discovery') return <LocalDiscoveryResult result={result} onReset={reset} />
    return <RoadTripResult result={result} onReset={reset} />
  }

  return (
    <div className="min-h-screen bg-[#0d1f35] flex flex-col pb-24">

      {/* Atmospheric header */}
      <div className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-10"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=1200&q=80&auto=format')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0d1f35]" />
        <div className="relative max-w-lg mx-auto w-full px-4 pt-10 pb-8">
          <p className="text-[10px] text-[#C97552] uppercase tracking-widest font-label mb-3">Trip Ask</p>
          <h1 className="font-serif italic text-4xl text-white leading-tight mb-3">
            Where do you<br />want to go?
          </h1>
          <p className="text-white/45 text-sm leading-relaxed">
            Road trips, photo spots with golden hour timing, or local gems in any city.
          </p>
        </div>
      </div>

      <div className="max-w-lg mx-auto w-full px-4 flex-1 flex flex-col">

        {/* Mode chips */}
        <div className="flex gap-2 mb-5">
          {MODES.map(mode => (
            <button
              key={mode.key}
              onClick={() => setActiveMode(prev => prev === mode.key ? null : mode.key)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-xs font-label transition-all ${
                activeMode === mode.key
                  ? 'bg-[#C97552] border-[#C97552] text-white'
                  : 'bg-white/5 border-white/12 text-white/55 hover:border-[#C97552]/40 hover:text-white/80'
              }`}
            >
              <span>{mode.icon}</span>
              <span>{mode.label}</span>
            </button>
          ))}
        </div>

        {/* Active mode hint */}
        {currentMode && (
          <p className="text-[11px] text-[#C97552]/70 font-label tracking-wider mb-3">
            {currentMode.hint}
          </p>
        )}

        {/* Input row */}
        <div className="mb-5">
          <div className="flex gap-3 items-end">
            <textarea
              ref={textareaRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
              placeholder={currentMode?.placeholder ?? 'Ask about any destination…'}
              rows={3}
              className="flex-1 bg-white/5 border border-white/12 rounded-2xl px-4 py-3.5 text-white placeholder:text-white/30 text-sm resize-none focus:outline-none focus:border-[#C97552]/50 focus:bg-white/7 transition-all leading-relaxed"
            />
            <MicButton onResult={text => setQuery(q => q ? q + ' ' + text : text)} disabled={false} />
          </div>
        </div>

        {error && <p className="text-red-400/80 text-sm mb-4">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={!query.trim()}
          className="w-full py-4 rounded-full bg-[#C97552] text-white font-medium text-sm disabled:opacity-35 disabled:cursor-not-allowed hover:bg-[#b86642] transition-colors mb-8 shadow-lg shadow-[#C97552]/20"
        >
          {currentMode ? `${currentMode.icon} Find ${currentMode.label.toLowerCase()} →` : 'Find places →'}
        </button>

        {/* Examples */}
        <div>
          <p className="text-[10px] text-white/25 font-label tracking-widest uppercase mb-3">Try asking</p>
          <div className="space-y-2">
            {EXAMPLE_QUERIES.map((ex, i) => (
              <button key={i} onClick={() => setQuery(ex)}
                className="w-full text-left px-4 py-3.5 rounded-xl border border-white/8 bg-white/4 hover:border-[#C97552]/35 hover:bg-white/6 transition-all text-sm text-white/50 leading-relaxed">
                "{ex}"
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
