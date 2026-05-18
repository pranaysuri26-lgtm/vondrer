'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import type { LocalGuide, GuideAirport } from '@/app/api/guide/route'

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`rounded bg-[#E8E0D6] animate-pulse ${className ?? ''}`}
      style={{ animation: 'pulse 1.8s ease-in-out infinite' }}
    />
  )
}

function LoadingState({ destination }: { destination: string }) {
  return (
    <div className="max-w-2xl mx-auto px-5 py-10 space-y-10">
      <div className="space-y-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        {[1,2,3,4].map(i => (
          <div key={i} className="border border-[#E8E0D6] rounded-2xl p-5 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
      <p className="text-center text-[#A8A09A] text-xs">
        Researching {destination}… this takes about 15 seconds
      </p>
    </div>
  )
}

// ─── Price badge ──────────────────────────────────────────────────────────────

function PriceBadge({ price }: { price: string }) {
  const active = 'text-[#C97552]'
  const dim    = 'text-[#D8D0C4]'
  return (
    <span className="font-mono text-xs tracking-widest">
      <span className={price.length >= 1 ? active : dim}>$</span>
      <span className={price.length >= 2 ? active : dim}>$</span>
      <span className={price.length >= 3 ? active : dim}>$</span>
    </span>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] text-[#9A8E7E] uppercase tracking-[0.2em] font-label mb-4">
      {children}
    </p>
  )
}

// ─── Hero image carousel ──────────────────────────────────────────────────────

function HeroCarousel({ destination, country }: { destination: string; country: string }) {
  const [images,    setImages]    = useState<string[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [loaded,    setLoaded]    = useState<boolean[]>([])
  useEffect(() => {
    const q = `${destination} ${country} travel landscape`.trim()
    fetch(`/api/destination-image?q=${encodeURIComponent(q)}&count=4`)
      .then(r => r.json())
      .then(d => {
        const urls: string[] = (d.urls ?? (d.url ? [d.url] : [])).filter(Boolean)
        setImages(urls)
        setLoaded(urls.map(() => false))
      })
      .catch(() => {})
  }, [destination, country])

  // Auto-cycle every 4 s
  useEffect(() => {
    if (images.length <= 1) return
    const id = setInterval(() => setActiveIdx(i => (i + 1) % images.length), 4000)
    return () => clearInterval(id)
  }, [images.length])

  const isEmpty = images.length === 0

  return (
    <div
      className="relative w-full h-64 md:h-80 overflow-hidden rounded-2xl mb-8"
      style={isEmpty ? { background: 'linear-gradient(135deg,#D8D0C4,#EDE5D8)' } : undefined}
    >
      {/* Shimmer while loading */}
      {isEmpty && <div className="absolute inset-0 animate-pulse bg-[#E2D8CC]" />}

      {/* Images with crossfade */}
      {images.map((url, i) => (
        <img
          key={url}
          src={url}
          alt={`${destination} ${i + 1}`}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-[1200ms] ${
            i === activeIdx && loaded[i] ? 'opacity-100' : 'opacity-0'
          }`}
          loading="eager"
          onLoad={() => setLoaded(prev => { const next = [...prev]; next[i] = true; return next })}
          onError={() => setImages(prev => prev.filter((_, j) => j !== i))}
        />
      ))}

      {/* Bottom gradient so text below reads cleanly */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent pointer-events-none" />

      {/* Dot indicators */}
      {images.length > 1 && (
        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-10">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveIdx(i)}
              className={`rounded-full transition-all duration-300 ${
                i === activeIdx ? 'w-3 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/50 hover:bg-white/70'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Airport card ─────────────────────────────────────────────────────────────

function AirportCard({ airport }: { airport: GuideAirport }) {
  return (
    <div className={`relative bg-white border rounded-2xl p-5 space-y-3 ${
      airport.is_primary ? 'border-[#C97552]/40' : 'border-[#E8E0D6]'
    }`}>
      {airport.is_primary && (
        <span className="absolute top-4 right-4 text-[10px] font-label tracking-widest uppercase text-[#C97552] bg-[#C97552]/10 border border-[#C97552]/25 rounded-full px-2.5 py-1">
          Best choice
        </span>
      )}

      {/* Header row */}
      <div className="flex items-start gap-3 pr-24">
        <span className="font-mono text-xl font-bold text-[#1A1A1A] leading-none">{airport.iata}</span>
        <div className="min-w-0">
          <p className="text-[#2A2420] text-sm font-medium leading-tight">{airport.name}</p>
          <p className="text-[#9A8E7E] text-xs mt-0.5">{airport.distance_km} km from centre</p>
        </div>
      </div>

      {/* Transfer row */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
        <div>
          <span className="text-[#A8A09A] uppercase tracking-wider text-[10px] font-label mr-1.5">Time</span>
          <span className="text-[#5C564E]">{airport.transfer_time}</span>
        </div>
        <div>
          <span className="text-[#A8A09A] uppercase tracking-wider text-[10px] font-label mr-1.5">Cost</span>
          <span className="text-[#5C564E]">{airport.transfer_cost}</span>
        </div>
      </div>

      {/* Airlines */}
      {airport.airlines && (
        <p className="text-xs text-[#6b5f54]">
          <span className="text-[#A8A09A] uppercase tracking-wider text-[10px] font-label mr-1.5">Airlines</span>
          {airport.airlines}
        </p>
      )}

      {/* Best for */}
      {airport.best_for && (
        <p className="text-xs text-[#6b5f54]">
          <span className="text-[#A8A09A] uppercase tracking-wider text-[10px] font-label mr-1.5">Best for</span>
          {airport.best_for}
        </p>
      )}

      {/* Verdict */}
      <p className="text-xs text-[#7A6E64] leading-snug border-t border-[#E8E0D6] pt-3">
        {airport.verdict}
      </p>
    </div>
  )
}

// ─── Main guide content ───────────────────────────────────────────────────────

function GuideContent() {
  const params         = useSearchParams()
  const router         = useRouter()
  const rawQuery       = params.get('q')?.trim()    ?? ''
  const country        = params.get('c')?.trim()    ?? ''
  const stateProv      = params.get('s')?.trim()    ?? ''

  const destination    = rawQuery
  const displayCity    = !country && rawQuery.includes(',')
    ? rawQuery.split(',')[0].trim()
    : rawQuery

  const [guide,   setGuide]   = useState<LocalGuide | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    if (!destination) { setLoading(false); return }

    setLoading(true)
    setError('')

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 55_000)

    fetch('/api/guide', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ destination, country, state_province: stateProv || undefined }),
      signal:  controller.signal,
    })
      .then(r => r.json())
      .then((data: LocalGuide & { error?: string }) => {
        if (data.error) throw new Error(data.error)
        setGuide(data)
        setLoading(false)
      })
      .catch(e => {
        const msg = (e as Error).name === 'AbortError'
          ? 'Took too long — please try again'
          : (e as Error).message || 'Failed to load guide'
        setError(msg)
        setLoading(false)
      })
      .finally(() => clearTimeout(timer))
  }, [destination, country, stateProv])

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      {/* Nav */}
      <nav className="sticky top-0 z-20 bg-[#FAF8F5]/95 backdrop-blur-md border-b border-[#E8E0D6] px-5 py-4 flex items-center justify-between">
        <span className="font-serif italic text-xl text-[#1A1A1A] tracking-wide">Vondrer</span>
        <button
          onClick={() => router.back()}
          className="text-[10px] text-[#9A8E7E] hover:text-[#5C564E] transition-colors font-label tracking-widest uppercase"
        >
          ← Back
        </button>
      </nav>

      {/* Header */}
      <div className="max-w-2xl mx-auto px-5 pt-10 pb-6">
        <p className="text-[10px] text-[#9A8E7E] uppercase tracking-[0.2em] font-label mb-3">
          Local Intel
        </p>
        <h1 className="font-serif italic text-4xl text-[#1A1A1A] leading-tight mb-1">
          {displayCity || 'Your destination'}
        </h1>
        {(stateProv || country) ? (
          <p className="text-[#6b5f54] text-sm">
            {stateProv ? `${stateProv}, ${country}` : country}
          </p>
        ) : rawQuery.includes(',') ? (
          <p className="text-[#6b5f54] text-sm">
            {rawQuery.split(',').slice(1).join(',').trim()}
          </p>
        ) : null}
        <div className="w-8 h-px bg-[#E2D8CC] mt-5" />
      </div>

      {loading && <LoadingState destination={displayCity || destination} />}

      {error && (
        <div className="max-w-2xl mx-auto px-5 py-10 text-center space-y-4">
          <p className="text-[#8A7E6E] text-sm">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-xs text-[#C97552]/70 hover:text-[#C97552] transition-colors underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !error && guide && (
        <div className="max-w-2xl mx-auto px-5 pb-16 space-y-12">

          {/* Hero image carousel */}
          <HeroCarousel destination={displayCity || destination} country={country} />

          {/* Intro */}
          <p className="text-[#5C564E] text-base leading-relaxed font-light">
            {guide.intro}
          </p>

          {/* Airports — where to land */}
          {guide.airports?.length > 0 && (
            <section>
              <SectionLabel>Where to land</SectionLabel>
              <div className="space-y-3">
                {[...guide.airports]
                  .sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))
                  .map((airport, i) => (
                    <AirportCard key={i} airport={airport} />
                  ))}
              </div>
              {guide.airports.length > 1 && (
                <p className="text-[#A8A09A] text-xs mt-3 leading-snug">
                  Tip: check both airports when booking — fares can vary 30–50% for the same dates.
                </p>
              )}
            </section>
          )}

          {/* Neighbourhoods */}
          {guide.neighbourhoods?.length > 0 && (
            <section>
              <SectionLabel>Neighbourhoods</SectionLabel>
              <div className="space-y-3">
                {guide.neighbourhoods.map((n, i) => (
                  <div key={i} className="bg-white border border-[#E8E0D6] rounded-2xl p-5 space-y-3">
                    <div>
                      <h3 className="text-[#1A1A1A] font-medium text-base">{n.name}</h3>
                      <p className="text-[#5C564E] text-sm leading-relaxed mt-1">{n.vibe}</p>
                    </div>
                    <div className="grid grid-cols-1 gap-2 pt-1 border-t border-[#E8E0D6]">
                      {n.best_for && (
                        <p className="text-xs text-[#6b5f54]">
                          <span className="text-[#A8A09A] uppercase tracking-wider text-[10px] font-label mr-2">Best for</span>
                          {n.best_for}
                        </p>
                      )}
                      {n.dont_miss && (
                        <p className="text-xs text-[#6b5f54]">
                          <span className="text-[#A8A09A] uppercase tracking-wider text-[10px] font-label mr-2">Don&apos;t miss</span>
                          {n.dont_miss}
                        </p>
                      )}
                      {n.local_eat && (
                        <p className="text-xs text-[#C97552]/80">
                          <span className="text-[#A8A09A] uppercase tracking-wider text-[10px] font-label mr-2">Eat here</span>
                          {n.local_eat}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Food spots */}
          {guide.food_spots?.length > 0 && (
            <section>
              <SectionLabel>Where locals eat</SectionLabel>
              <div className="space-y-2">
                {guide.food_spots.map((f, i) => (
                  <div key={i} className="bg-white border border-[#E8E0D6] rounded-xl px-4 py-3.5 flex gap-4 items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <h4 className="text-[#1A1A1A] font-medium text-sm">{f.name}</h4>
                        <span className="text-[#9A8E7E] text-xs">{f.neighbourhood}</span>
                      </div>
                      <p className="text-[#8A7E6E] text-xs mt-0.5">{f.type}</p>
                      <p className="text-[#5C564E] text-xs mt-1.5 leading-relaxed">{f.why}</p>
                      {f.order_this && (
                        <p className="text-[#C97552]/80 text-xs mt-1">
                          <span className="text-[#A8A09A] font-label uppercase tracking-wider text-[10px] mr-1.5">Order</span>
                          {f.order_this}
                        </p>
                      )}
                    </div>
                    <PriceBadge price={f.price ?? '$'} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Insider tips */}
          {guide.insider_tips?.length > 0 && (
            <section>
              <SectionLabel>Insider tips</SectionLabel>
              <div className="space-y-2">
                {guide.insider_tips.map((t, i) => (
                  <div key={i} className="flex gap-4 items-start py-3 border-b border-[#E8E0D6] last:border-0">
                    <span className="text-[#C97552]/50 text-xs font-label tracking-widest uppercase flex-shrink-0 w-5 pt-0.5">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <p className="text-[#2A2420] text-sm font-medium">{t.tip}</p>
                      <p className="text-[#7A6E64] text-xs mt-0.5 leading-relaxed">{t.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Skip these */}
          {guide.skip_these?.length > 0 && (
            <section>
              <SectionLabel>Skip these</SectionLabel>
              <div className="space-y-2">
                {guide.skip_these.map((s, i) => (
                  <div key={i} className="flex gap-3 items-start py-2.5 border-b border-[#E8E0D6] last:border-0">
                    <span className="text-[#C0B8AC] text-sm flex-shrink-0 mt-0.5">✕</span>
                    <p className="text-[#7A6E64] text-xs leading-relaxed">{s}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Accommodation */}
          {guide.accommodation && (
            <section>
              <SectionLabel>Where to stay</SectionLabel>
              {(() => {
                const acc = guide.accommodation!
                const rec = acc.primary_recommendation
                const ICONS: Record<string, string> = { government_property:'🏛️', homestay:'🏡', guesthouse:'🏠', hotel:'🏨', hostel:'🛏️', resort:'🌴', camp:'⛺', airbnb:'🏠' }
                const icon = ICONS[acc.primary_type] ?? '🏨'
                return (
                  <div className="space-y-3">
                    {/* Primary card */}
                    <div className="bg-white border border-[#E8E0D6] rounded-2xl p-5">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{icon}</span>
                          <span className="text-[#1A1A1A] font-medium text-sm">{rec.type}</span>
                        </div>
                        {rec.name && <span className="text-xs text-[#8A7E6E] text-right leading-tight max-w-[140px]">{rec.name}</span>}
                      </div>
                      <p className="text-[#2A2420] font-medium text-sm mb-1">{rec.price_range}</p>
                      <p className="text-[#5C564E] text-xs leading-relaxed mb-2">{rec.why}</p>
                      {rec.book_ahead && <p className="text-[#8A7E6E] text-xs mb-3">📅 {rec.book_ahead}</p>}
                      <a
                        href={rec.booking_url ?? `https://www.google.com/travel/hotels/${encodeURIComponent(destination)}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-[#C97552]/80 hover:text-[#C97552] text-xs transition-colors"
                      >
                        Book on {rec.book_via} ↗
                      </a>
                    </div>

                    {/* Platform badges */}
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: 'Booking.com', status: acc.platforms.booking_com },
                        { label: 'Airbnb',      status: acc.platforms.airbnb },
                        { label: 'Book direct', status: acc.platforms.direct },
                      ].map(({ label, status }) => {
                        const isStrong = status === 'strong' || status === 'recommended'
                        const isWeak   = status === 'not_recommended' || status === 'not_available'
                        return (
                          <span key={label} className={`text-xs px-3 py-1 rounded-full border ${
                            isStrong ? 'border-emerald-500/30 text-emerald-600 bg-emerald-50' :
                            isWeak   ? 'border-[#E8E0D6] text-[#C0B8AC] line-through' :
                                       'border-[#D8D0C4] text-[#8A7E6E]'
                          }`}>
                            {label}{isStrong ? ' ✓' : ''}
                          </span>
                        )
                      })}
                    </div>

                    {/* Alternative */}
                    {acc.alternative && (
                      <div className="bg-[#F5F0EA] border border-[#E8E0D6] rounded-xl px-4 py-3">
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span className="text-[#5C564E] text-xs font-medium">Alt: {acc.alternative.type}</span>
                          <span className="text-[#8A7E6E] text-xs">{acc.alternative.price_range}</span>
                        </div>
                        <p className="text-[#7A6E64] text-xs leading-snug">{acc.alternative.note}</p>
                        <span className="text-[#9A8E7E] text-xs">via {acc.alternative.book_via}</span>
                      </div>
                    )}

                    {/* Neighbourhood advice */}
                    {acc.neighbourhood_advice && (
                      <p className="text-[#6b5f54] text-xs leading-snug">
                        <span className="text-[#A8A09A] uppercase tracking-wider text-[10px] mr-2">Best area</span>
                        {acc.neighbourhood_advice}
                      </p>
                    )}

                    {/* Avoid */}
                    {acc.avoid && (
                      <p className="text-amber-600/70 text-xs leading-snug">
                        <span className="mr-1">⚠️</span>{acc.avoid}
                      </p>
                    )}
                  </div>
                )
              })()}
            </section>
          )}

          {/* Footer CTA */}
          <div className="border-t border-[#E8E0D6] pt-8 flex flex-col items-center gap-4">
            <p className="text-[#9A8E7E] text-xs text-center">
              Ready to plan your trip to {destination}?
            </p>
            <a
              href={`/plan/new?dest=${encodeURIComponent(destination)}&country=${encodeURIComponent(country)}`}
              className="bg-[#C97552] text-white text-sm font-semibold px-8 py-3 rounded-full hover:bg-[#b86644] transition-colors"
            >
              Plan {destination} →
            </a>
            <button
              onClick={() => router.back()}
              className="text-[#A8A09A] text-xs hover:text-[#6b5f54] transition-colors"
            >
              ← Back to recommendations
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 1; }
        }
      `}</style>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GuidePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#FAF8F5]" />}>
      <GuideContent />
    </Suspense>
  )
}
