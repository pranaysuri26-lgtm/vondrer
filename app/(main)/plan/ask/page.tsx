'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { TripAskResponse, TripStop, LocalPlace } from '@/app/api/trip/ask/route'

// LeafletMap only runs in browser — no SSR
const LeafletMap = dynamic(() => import('@/components/LeafletMap'), { ssr: false })

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stopTypeIcon(type: string) {
  switch (type) {
    case 'brunch':   return '🥞'
    case 'coffee':   return '☕'
    case 'scenic':   return '🌄'
    case 'food':     return '🍽️'
    case 'activity': return '🎯'
    case 'rest':     return '🛋️'
    default:         return '📍'
  }
}

function dietaryColor(fit: string) {
  if (!fit) return ''
  const f = fit.toLowerCase()
  if (f.includes('fully'))    return 'text-emerald-700 bg-emerald-50 border-emerald-200'
  if (f.includes('strong'))   return 'text-emerald-600 bg-emerald-50/70 border-emerald-200/70'
  if (f.includes('available') || f.includes('options')) return 'text-amber-700 bg-amber-50 border-amber-200'
  return 'text-[#6b5f54] bg-[#f2ede8] border-[#e8e0d6]'
}

const EXAMPLE_QUERIES = [
  "I'm in Tampa, going to Miami by car. Want brunch spots — 3 vegans in the group.",
  "Hidden street food spots within walking distance of the Medina in Fez",
  "Show me the quietest beaches on the Algarve coast",
  "Where would a solo traveller eat alone without feeling awkward in Tokyo",
]

// ─── Road trip stop card ───────────────────────────────────────────────────────

function StopCard({ stop, index }: { stop: TripStop; index: number }) {
  const [open, setOpen] = useState(index < 2)
  return (
    <div className="rounded-2xl border border-[#e8e0d6] bg-white shadow-sm overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full text-left px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-9 h-9 rounded-full bg-[#f2ede8] border border-[#e8e0d6] flex items-center justify-center text-base">
            {stopTypeIcon(stop.type)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] text-[#C97552] font-label tracking-widest uppercase mb-0.5">
                  Stop {index + 1} · {stop.type}
                </p>
                <p className="text-[#1a1410] text-sm font-semibold leading-snug">{stop.name}</p>
                <p className="text-[#6b5f54] text-xs mt-0.5">{stop.city}, {stop.state}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                <span className="text-[11px] text-[#6b5f54]">{stop.price_range}</span>
                <span className="text-[#6b5f54] text-xs" style={{ transform: open ? 'rotate(180deg)' : 'none', display: 'inline-block' }}>▾</span>
              </div>
            </div>
          </div>
        </div>
      </button>
      {open && (
        <div className="px-5 pb-4 border-t border-[#f2ede8] space-y-3">
          <p className="text-[#6b5f54] text-sm leading-relaxed pt-3">{stop.why}</p>
          <div className="flex flex-wrap gap-2">
            {stop.dietary_fit && (
              <span className={`text-[11px] font-label px-2.5 py-1 rounded-full border ${dietaryColor(stop.dietary_fit)}`}>
                🌱 {stop.dietary_fit}
              </span>
            )}
            {stop.distance_note && (
              <span className="text-[11px] font-label px-2.5 py-1 rounded-full border border-[#e8e0d6] bg-[#f2ede8] text-[#6b5f54]">
                📍 {stop.distance_note}
              </span>
            )}
            {stop.open_note && (
              <span className="text-[11px] font-label px-2.5 py-1 rounded-full border border-[#e8e0d6] bg-[#f2ede8] text-[#6b5f54]">
                🕐 {stop.open_note}
              </span>
            )}
          </div>
          {stop.lat && stop.lng && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.name + ', ' + stop.city + ', ' + stop.state)}`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-[#C97552] hover:text-[#b86642] transition-colors"
            >
              View on maps →
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Local discovery place card ───────────────────────────────────────────────

function PlaceCard({
  place, index, selected, onSelect,
}: {
  place: LocalPlace; index: number; selected: boolean; onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-2xl border transition-all duration-200 overflow-hidden ${
        selected
          ? 'border-[#C97552]/50 bg-white shadow-md ring-1 ring-[#C97552]/20'
          : 'border-[#e8e0d6] bg-white shadow-sm hover:border-[#C97552]/30'
      }`}
    >
      <div className="px-4 py-4">
        <div className="flex items-start gap-3">
          {/* Number badge */}
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
            selected ? 'bg-[#C97552] text-white' : 'bg-[#f2ede8] text-[#C97552]'
          }`}>
            {index + 1}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-[#C97552] font-label tracking-widest uppercase mb-0.5">
              {place.type}
            </p>
            <p className="text-[#1a1410] text-sm font-semibold leading-snug">{place.name}</p>
            <p className="text-[#6b5f54] text-xs mt-0.5">{place.area}</p>
            {selected && (
              <p className="text-[#6b5f54]/80 text-xs italic mt-1 leading-relaxed">"{place.tagline}"</p>
            )}
          </div>
          <span className="text-[11px] text-[#6b5f54] flex-shrink-0 mt-1">{place.price_range}</span>
        </div>

        {selected && (
          <div className="mt-3 pt-3 border-t border-[#f2ede8] space-y-3">
            <p className="text-[#6b5f54] text-sm leading-relaxed">{place.story}</p>
            <div className="flex flex-wrap gap-2">
              {place.best_time && (
                <span className="text-[11px] font-label px-2.5 py-1 rounded-full border border-[#e8e0d6] bg-[#f2ede8] text-[#6b5f54]">
                  🕐 {place.best_time}
                </span>
              )}
            </div>
            {place.insider_tip && (
              <div className="flex gap-2 rounded-xl bg-[#C97552]/6 border border-[#C97552]/15 px-3 py-2.5">
                <span className="text-xs mt-0.5">💡</span>
                <p className="text-[#C97552]/80 text-xs leading-relaxed">{place.insider_tip}</p>
              </div>
            )}
            {place.lat && place.lng && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + ', ' + place.area)}`}
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

// ─── Mic button ────────────────────────────────────────────────────────────────

function MicButton({ onResult, disabled }: { onResult: (text: string) => void; disabled: boolean }) {
  const [listening, setListening] = useState(false)
  // Use `any` — SpeechRecognition is not in all TS lib targets
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  const toggle = useCallback(() => {
    if (typeof window === 'undefined') return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SpeechRec = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!SpeechRec) { alert('Speech recognition not supported in this browser.'); return }

    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

    const rec = new SpeechRec()
    rec.continuous     = false
    rec.interimResults = false
    rec.lang           = 'en-US'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const transcript = e.results[0]?.[0]?.transcript ?? ''
      if (transcript) onResult(transcript)
      setListening(false)
    }
    rec.onerror = () => setListening(false)
    rec.onend   = () => setListening(false)
    recognitionRef.current = rec
    rec.start()
    setListening(true)
  }, [listening, onResult])

  return (
    <button
      onClick={toggle}
      disabled={disabled}
      title={listening ? 'Stop listening' : 'Speak your trip'}
      className={`flex-shrink-0 w-12 h-12 rounded-full border flex items-center justify-center transition-all ${
        listening
          ? 'bg-[#C97552] border-[#C97552] shadow-lg shadow-[#C97552]/25 animate-pulse'
          : 'bg-white border-[#e8e0d6] hover:border-[#C97552]/50 hover:bg-[#f2ede8]'
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      <span className={`text-lg ${listening ? 'text-white' : 'text-[#6b5f54]'}`}>🎤</span>
    </button>
  )
}

// ─── Loading view ──────────────────────────────────────────────────────────────

const ROAD_TRIP_STEPS    = ['Parsing your trip…', 'Scouting stops along the route…', 'Verifying real places…', 'Pinning stops on the map…']
const DISCOVERY_STEPS    = ['Reading your request…', 'Finding local gems…', 'Verifying real places…', 'Pinning them on the map…']

function LoadingView({ query }: { query: string }) {
  const [step, setStep] = useState(0)
  const isRoadTrip = /going to|heading to|driving|road trip/i.test(query)
  const steps = isRoadTrip ? ROAD_TRIP_STEPS : DISCOVERY_STEPS

  useEffect(() => {
    const id = setInterval(() => setStep(s => Math.min(s + 1, steps.length - 1)), 2400)
    return () => clearInterval(id)
  }, [steps.length])

  return (
    <div className="min-h-screen bg-[#faf8f5] flex flex-col items-center justify-center px-6 pb-24">
      <div className="text-center max-w-xs">
        <div className="text-4xl mb-6" style={{ animation: 'float 2s ease-in-out infinite' }}>
          {isRoadTrip ? '🚗' : '🗺️'}
        </div>
        <p className="text-[#6b5f54] text-sm min-h-[1.5rem] transition-all">{steps[step]}</p>
        <div className="flex justify-center gap-1.5 mt-5">
          {steps.map((_, i) => (
            <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${i <= step ? 'bg-[#C97552]' : 'bg-[#e8e0d6]'}`} />
          ))}
        </div>
      </div>
      <style>{`@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }`}</style>
    </div>
  )
}

// ─── Road trip result ──────────────────────────────────────────────────────────

function RoadTripResult({
  result, onReset,
}: {
  result: Extract<TripAskResponse, { mode: 'road_trip' }>
  onReset: () => void
}) {
  return (
    <div className="min-h-screen bg-[#faf8f5] pb-28">
      <div className="max-w-lg mx-auto px-4 pt-8">
        <button onClick={onReset} className="text-[#6b5f54] text-xs hover:text-[#1a1410] transition-colors flex items-center gap-1 mb-5">
          ← New trip
        </button>
        <p className="text-[10px] text-[#C97552] font-label tracking-widest uppercase mb-2">
          Road trip · {result.stops.length} stops
        </p>
        <h1 className="font-serif italic text-3xl text-[#1a1410] leading-tight mb-2">
          {result.parsed.origin}
          <span className="text-[#6b5f54]"> → </span>
          {result.parsed.destination}
        </h1>
        <p className="text-[#6b5f54] text-sm mb-6">{result.route_summary}</p>

        {result.parsed.dietary.length > 0 && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 mb-6 flex items-start gap-2.5">
            <span className="text-base mt-0.5">🌱</span>
            <div>
              <p className="text-emerald-800 text-sm font-medium">Dietary needs considered</p>
              <p className="text-emerald-700/70 text-xs mt-0.5">
                All stops filtered for: {result.parsed.dietary.join(', ')}
                {result.parsed.travelers ? ` · ${result.parsed.travelers} travellers` : ''}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-3 mb-8">
          {result.stops.map((stop, i) => <StopCard key={i} stop={stop} index={i} />)}
        </div>

        <div className="rounded-2xl border border-[#e8e0d6] bg-[#f2ede8] px-4 py-3 mb-6">
          <p className="text-[#6b5f54] text-xs leading-relaxed">
            <span className="font-medium text-[#1a1410]">Before you go —</span> verify hours and availability directly with each place.
          </p>
        </div>

        <button
          onClick={onReset}
          className="w-full py-4 rounded-full border border-[#e8e0d6] bg-white text-[#6b5f54] text-sm hover:border-[#C97552]/50 hover:text-[#C97552] transition-all"
        >
          Plan another trip →
        </button>
      </div>
    </div>
  )
}

// ─── Local discovery result ────────────────────────────────────────────────────

function LocalDiscoveryResult({
  result, onReset,
}: {
  result: Extract<TripAskResponse, { mode: 'local_discovery' }>
  onReset: () => void
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(0)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])

  // Scroll selected card into view
  useEffect(() => {
    if (selectedIndex == null) return
    cardRefs.current[selectedIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedIndex])

  const placesWithCoords = result.places.some(p => p.lat != null && p.lng != null)

  return (
    <div className="min-h-screen bg-[#faf8f5] pb-28">
      <div className="max-w-lg mx-auto px-4 pt-8">

        {/* Header */}
        <button onClick={onReset} className="text-[#6b5f54] text-xs hover:text-[#1a1410] transition-colors flex items-center gap-1 mb-5">
          ← New search
        </button>
        <p className="text-[10px] text-[#C97552] font-label tracking-widest uppercase mb-2">
          {result.parsed.location}{result.parsed.country ? `, ${result.parsed.country}` : ''} · {result.places.length} places
        </p>
        <h1 className="font-serif italic text-2xl text-[#1a1410] leading-tight mb-5">
          {result.parsed.intent.length > 60
            ? result.parsed.intent.slice(0, 60) + '…'
            : result.parsed.intent}
        </h1>

        {/* Map */}
        {placesWithCoords && (
          <div className="rounded-2xl overflow-hidden border border-[#e8e0d6] mb-5 shadow-sm"
               style={{ height: '300px' }}>
            <LeafletMap
              places={result.places}
              center={result.map_center}
              selectedIndex={selectedIndex}
              onSelect={(i) => setSelectedIndex(i)}
            />
          </div>
        )}

        {/* Map hint */}
        {placesWithCoords && (
          <p className="text-[#6b5f54]/50 text-[11px] text-center mb-5 font-label tracking-wider">
            TAP A PIN OR CARD TO EXPLORE
          </p>
        )}

        {/* Place cards */}
        <div className="space-y-2 mb-8">
          {result.places.map((place, i) => (
            <div key={i} ref={el => { cardRefs.current[i] = el }}>
              <PlaceCard
                place={place}
                index={i}
                selected={selectedIndex === i}
                onSelect={() => setSelectedIndex(selectedIndex === i ? null : i)}
              />
            </div>
          ))}
        </div>

        {/* Disclaimer */}
        <div className="rounded-2xl border border-[#e8e0d6] bg-[#f2ede8] px-4 py-3 mb-6">
          <p className="text-[#6b5f54] text-xs leading-relaxed">
            <span className="font-medium text-[#1a1410]">Before you go —</span> verify opening hours and availability directly with each place.
          </p>
        </div>

        <button
          onClick={onReset}
          className="w-full py-4 rounded-full border border-[#e8e0d6] bg-white text-[#6b5f54] text-sm hover:border-[#C97552]/50 hover:text-[#C97552] transition-all"
        >
          Search somewhere else →
        </button>
      </div>
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────────

type Phase = 'input' | 'loading' | 'result'

export default function TripAskPage() {
  const router  = useRouter()
  const [phase,  setPhase]  = useState<Phase>('input')
  const [query,  setQuery]  = useState('')
  const [error,  setError]  = useState('')
  const [result, setResult] = useState<TripAskResponse | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
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
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query: query.trim() }),
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
  }, [query, router])

  // ── Loading ──────────────────────────────────────────────────────────────
  if (phase === 'loading') return <LoadingView query={query} />

  // ── Result ───────────────────────────────────────────────────────────────
  if (phase === 'result' && result) {
    const reset = () => { setPhase('input'); setQuery(''); setResult(null) }
    if (result.mode === 'local_discovery') {
      return <LocalDiscoveryResult result={result} onReset={reset} />
    }
    return <RoadTripResult result={result} onReset={reset} />
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#faf8f5] flex flex-col pb-24">
      <div className="max-w-lg mx-auto w-full px-4 pt-10 flex-1 flex flex-col">

        <div className="mb-8">
          <p className="text-[10px] text-[#C97552] uppercase tracking-widest font-label mb-3">Ask</p>
          <h1 className="font-serif italic text-4xl text-[#1a1410] leading-tight mb-3">
            Where do you<br />want to go?
          </h1>
          <p className="text-[#6b5f54] text-sm leading-relaxed">
            Describe a road trip, or ask about a specific place — street food in Fez, quiet beaches in Portugal, where to eat solo in Tokyo. We'll find the real spots.
          </p>
        </div>

        {/* Input row */}
        <div className="mb-5">
          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
                placeholder="Hidden street food near the Medina in Fez…"
                rows={3}
                className="w-full bg-white border border-[#e8e0d6] rounded-2xl px-4 py-3.5 text-[#1a1410] placeholder:text-[#6b5f54]/40 text-sm resize-none focus:outline-none focus:border-[#C97552]/50 transition-colors leading-relaxed shadow-sm"
              />
            </div>
            <MicButton
              onResult={text => setQuery(q => q ? q + ' ' + text : text)}
              disabled={false}
            />
          </div>
        </div>

        {error && <p className="text-red-600/80 text-sm mb-4">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={!query.trim()}
          className="w-full py-4 rounded-full bg-[#C97552] text-white font-medium text-sm disabled:opacity-35 disabled:cursor-not-allowed hover:bg-[#b86642] transition-colors mb-8 shadow-sm"
        >
          Find places →
        </button>

        {/* Examples */}
        <div>
          <p className="text-[10px] text-[#6b5f54]/50 font-label tracking-widest uppercase mb-3">Try asking</p>
          <div className="space-y-2">
            {EXAMPLE_QUERIES.map((ex, i) => (
              <button
                key={i}
                onClick={() => setQuery(ex)}
                className="w-full text-left px-4 py-3.5 rounded-xl border border-[#e8e0d6] bg-white hover:border-[#C97552]/40 hover:bg-[#f2ede8] transition-all text-sm text-[#6b5f54] leading-relaxed shadow-sm"
              >
                "{ex}"
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
