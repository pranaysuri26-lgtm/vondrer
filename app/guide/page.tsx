'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import type { LocalGuide } from '@/app/api/guide/route'

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`rounded bg-white/6 animate-pulse ${className ?? ''}`}
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
          <div key={i} className="border border-white/8 rounded-2xl p-5 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
      <p className="text-center text-white/25 text-xs">
        Researching {destination}…
      </p>
    </div>
  )
}

// ─── Price badge ──────────────────────────────────────────────────────────────

function PriceBadge({ price }: { price: string }) {
  const active = 'text-[#C97552]'
  const dim    = 'text-white/15'
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
    <p className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-label mb-4">
      {children}
    </p>
  )
}

// ─── Main guide content ───────────────────────────────────────────────────────

function GuideContent() {
  const params         = useSearchParams()
  const router         = useRouter()
  const destination    = params.get('q')?.trim()    ?? ''
  const country        = params.get('c')?.trim()    ?? ''
  const stateProv      = params.get('s')?.trim()    ?? ''

  const [guide,  setGuide]  = useState<LocalGuide | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,  setError]  = useState('')

  useEffect(() => {
    if (!destination) { setLoading(false); return }

    setLoading(true)
    setError('')

    fetch('/api/guide', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ destination, country, state_province: stateProv || undefined }),
    })
      .then(r => r.json())
      .then((data: LocalGuide & { error?: string }) => {
        if (data.error) throw new Error(data.error)
        setGuide(data)
        setLoading(false)
      })
      .catch(e => {
        setError((e as Error).message || 'Failed to load guide')
        setLoading(false)
      })
  }, [destination, country, stateProv])

  const locationLabel = stateProv
    ? `${destination}, ${stateProv}, ${country}`
    : country
      ? `${destination}, ${country}`
      : destination

  return (
    <div className="min-h-screen bg-[#0d1f35]">
      {/* Nav */}
      <nav className="sticky top-0 z-20 bg-[#0d1f35]/90 backdrop-blur-md border-b border-white/8 px-5 py-4 flex items-center justify-between">
        <span className="font-serif italic text-xl text-white/90">Voya</span>
        <button
          onClick={() => router.back()}
          className="text-[10px] text-white/30 hover:text-white/60 transition-colors font-label tracking-widest uppercase"
        >
          ← Back
        </button>
      </nav>

      {/* Header */}
      <div className="max-w-2xl mx-auto px-5 pt-10 pb-6">
        <p className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-label mb-3">
          Local Intel
        </p>
        <h1 className="font-serif italic text-4xl text-white leading-tight mb-1">
          {destination || 'Your destination'}
        </h1>
        {(stateProv || country) && (
          <p className="text-white/35 text-sm">
            {stateProv ? `${stateProv}, ${country}` : country}
          </p>
        )}
        <div className="w-8 h-px bg-white/12 mt-5" />
      </div>

      {loading && <LoadingState destination={destination} />}

      {error && (
        <div className="max-w-2xl mx-auto px-5 py-10 text-center space-y-4">
          <p className="text-white/40 text-sm">{error}</p>
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

          {/* Intro */}
          <p className="text-white/65 text-base leading-relaxed font-light">
            {guide.intro}
          </p>

          {/* Neighbourhoods */}
          {guide.neighbourhoods?.length > 0 && (
            <section>
              <SectionLabel>Neighbourhoods</SectionLabel>
              <div className="space-y-3">
                {guide.neighbourhoods.map((n, i) => (
                  <div key={i} className="bg-white/4 border border-white/8 rounded-2xl p-5 space-y-3">
                    <div>
                      <h3 className="text-white font-medium text-base">{n.name}</h3>
                      <p className="text-white/50 text-sm leading-relaxed mt-1">{n.vibe}</p>
                    </div>
                    <div className="grid grid-cols-1 gap-2 pt-1 border-t border-white/6">
                      {n.best_for && (
                        <p className="text-xs text-white/40">
                          <span className="text-white/25 uppercase tracking-wider text-[10px] font-label mr-2">Best for</span>
                          {n.best_for}
                        </p>
                      )}
                      {n.dont_miss && (
                        <p className="text-xs text-white/40">
                          <span className="text-white/25 uppercase tracking-wider text-[10px] font-label mr-2">Don't miss</span>
                          {n.dont_miss}
                        </p>
                      )}
                      {n.local_eat && (
                        <p className="text-xs text-[#C97552]/70">
                          <span className="text-white/25 uppercase tracking-wider text-[10px] font-label mr-2">Eat here</span>
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
                  <div key={i} className="bg-white/4 border border-white/8 rounded-xl px-4 py-3.5 flex gap-4 items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <h4 className="text-white font-medium text-sm">{f.name}</h4>
                        <span className="text-white/25 text-xs">{f.neighbourhood}</span>
                      </div>
                      <p className="text-white/40 text-xs mt-0.5">{f.type}</p>
                      <p className="text-white/55 text-xs mt-1.5 leading-relaxed">{f.why}</p>
                      {f.order_this && (
                        <p className="text-[#C97552]/70 text-xs mt-1">
                          <span className="text-white/20 font-label uppercase tracking-wider text-[10px] mr-1.5">Order</span>
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
                  <div key={i} className="flex gap-4 items-start py-3 border-b border-white/6 last:border-0">
                    <span className="text-[#C97552]/50 text-xs font-label tracking-widest uppercase flex-shrink-0 w-5 pt-0.5">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <p className="text-white/70 text-sm font-medium">{t.tip}</p>
                      <p className="text-white/40 text-xs mt-0.5 leading-relaxed">{t.detail}</p>
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
                  <div key={i} className="flex gap-3 items-start py-2.5 border-b border-white/6 last:border-0">
                    <span className="text-white/20 text-sm flex-shrink-0 mt-0.5">✕</span>
                    <p className="text-white/40 text-xs leading-relaxed">{s}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Footer CTA */}
          <div className="border-t border-white/8 pt-8 flex flex-col items-center gap-4">
            <p className="text-white/25 text-xs text-center">
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
              className="text-white/20 text-xs hover:text-white/40 transition-colors"
            >
              ← Back to recommendations
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50%       { opacity: 0.7; }
        }
      `}</style>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GuidePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0d1f35]" />}>
      <GuideContent />
    </Suspense>
  )
}
