'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { TripAskResponse, TripStop } from '@/app/api/trip/ask/route'

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
  if (fit.toLowerCase().includes('fully')) return 'text-emerald-700 bg-emerald-50 border-emerald-200'
  if (fit.toLowerCase().includes('strong')) return 'text-emerald-600 bg-emerald-50/70 border-emerald-200/70'
  if (fit.toLowerCase().includes('available') || fit.toLowerCase().includes('options')) {
    return 'text-amber-700 bg-amber-50 border-amber-200'
  }
  return 'text-[#6b5f54] bg-[#f2ede8] border-[#e8e0d6]'
}

const EXAMPLE_QUERIES = [
  "I'm in Tampa on Pine St, going to Miami by car. I want brunch spots — 3 vegans in the group.",
  "Driving NYC to Boston, want coffee + scenic stops, nothing too touristy.",
  "LA to San Francisco on PCH, looking for lunch and a hike. Just 2 of us.",
]

// ─── Stop Card ────────────────────────────────────────────────────────────────

function StopCard({ stop, index }: { stop: TripStop; index: number }) {
  const [open, setOpen] = useState(index < 2)

  return (
    <div className="rounded-2xl border border-[#e8e0d6] bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left px-5 py-4"
      >
        <div className="flex items-start gap-3">
          {/* Step number + icon */}
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
                <span className={`text-white/70 text-xs transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: '#6b5f54' }}>▾</span>
              </div>
            </div>
          </div>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-4 border-t border-[#f2ede8] space-y-3">
          {/* Why it fits */}
          <p className="text-[#6b5f54] text-sm leading-relaxed pt-3">{stop.why}</p>

          {/* Meta row */}
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

          {/* Map link */}
          {stop.lat && stop.lng && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.name + ', ' + stop.city + ', ' + stop.state)}`}
              target="_blank"
              rel="noopener noreferrer"
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

// ─── Voice button ─────────────────────────────────────────────────────────────

function MicButton({ onResult, disabled }: { onResult: (text: string) => void; disabled: boolean }) {
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const toggle = useCallback(() => {
    if (typeof window === 'undefined') return
    const SpeechRec = (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition
      ?? (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition
    if (!SpeechRec) { alert('Speech recognition not supported in this browser.'); return }

    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

    const rec = new SpeechRec()
    rec.continuous    = false
    rec.interimResults = false
    rec.lang          = 'en-US'
    rec.onresult = (e) => {
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

// ─── Loading states ───────────────────────────────────────────────────────────

const LOADING_STEPS = [
  'Parsing your trip…',
  'Scouting stops along the route…',
  'Checking real places…',
  'Pinning stops on the map…',
]

function LoadingView({ origin, destination }: { origin?: string; destination?: string }) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setStep(s => Math.min(s + 1, LOADING_STEPS.length - 1)), 2200)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="min-h-screen bg-[#faf8f5] flex flex-col items-center justify-center px-6 pb-24">
      <div className="text-center max-w-xs">
        <div className="text-4xl mb-6" style={{ animation: 'float 2s ease-in-out infinite' }}>🗺️</div>
        {origin && destination && (
          <p className="text-[#1a1410] text-base font-serif italic mb-4">
            {origin} → {destination}
          </p>
        )}
        <p className="text-[#6b5f54] text-sm transition-all duration-500 key={step}">{LOADING_STEPS[step]}</p>
        <div className="flex justify-center gap-1.5 mt-5">
          {LOADING_STEPS.map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                i <= step ? 'bg-[#C97552]' : 'bg-[#e8e0d6]'
              }`}
            />
          ))}
        </div>
      </div>
      <style>{`@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }`}</style>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

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
    if (!query.trim()) { setError('Describe your trip first'); return }
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

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <LoadingView
        origin={result?.parsed?.origin}
        destination={result?.parsed?.destination}
      />
    )
  }

  // ── Result ───────────────────────────────────────────────────────────────────
  if (phase === 'result' && result) {
    return (
      <div className="min-h-screen bg-[#faf8f5] pb-28">
        <div className="max-w-lg mx-auto px-4 pt-8">

          {/* Header */}
          <div className="mb-6">
            <button
              onClick={() => setPhase('input')}
              className="text-[#6b5f54] text-xs hover:text-[#1a1410] transition-colors flex items-center gap-1 mb-5"
            >
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
            <p className="text-[#6b5f54] text-sm">{result.route_summary}</p>
          </div>

          {/* Dietary callout */}
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

          {/* Stops */}
          <div className="space-y-3 mb-8">
            {result.stops.map((stop, i) => (
              <StopCard key={i} stop={stop} index={i} />
            ))}
          </div>

          {/* Footer note */}
          <div className="rounded-2xl border border-[#e8e0d6] bg-[#f2ede8] px-4 py-3 mb-6">
            <p className="text-[#6b5f54] text-xs leading-relaxed">
              <span className="font-medium text-[#1a1410]">Before you go —</span> verify opening hours and availability directly with each place. AI suggestions are based on known information and may not reflect recent changes.
            </p>
          </div>

          {/* Plan another */}
          <button
            onClick={() => { setPhase('input'); setQuery(''); setResult(null) }}
            className="w-full py-4 rounded-full border border-[#e8e0d6] bg-white text-[#6b5f54] text-sm hover:border-[#C97552]/50 hover:text-[#C97552] transition-all"
          >
            Plan another trip →
          </button>

        </div>
      </div>
    )
  }

  // ── Input ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#faf8f5] flex flex-col pb-24">
      <div className="max-w-lg mx-auto w-full px-4 pt-10 flex-1 flex flex-col">

        {/* Header */}
        <div className="mb-8">
          <p className="text-[10px] text-[#C97552] uppercase tracking-widest font-label mb-3">Trip Ask</p>
          <h1 className="font-serif italic text-4xl text-[#1a1410] leading-tight mb-3">
            Tell me about<br />your road trip.
          </h1>
          <p className="text-[#6b5f54] text-sm leading-relaxed">
            Say where you're going, how you're travelling, what stops you want, and any dietary needs. We'll find the best real places along your route.
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
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
                }}
                placeholder="I'm in Tampa, going to Miami by car. Want brunch stops — 3 vegans in the group…"
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

        {error && (
          <p className="text-red-600/80 text-sm mb-4">{error}</p>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!query.trim()}
          className="w-full py-4 rounded-full bg-[#C97552] text-white font-medium text-sm disabled:opacity-35 disabled:cursor-not-allowed hover:bg-[#b86642] transition-colors mb-8 shadow-sm"
        >
          Find stops along the route →
        </button>

        {/* Examples */}
        <div>
          <p className="text-[10px] text-[#6b5f54]/50 font-label tracking-widest uppercase mb-3">Try an example</p>
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
