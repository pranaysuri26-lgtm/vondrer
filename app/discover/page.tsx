'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'
import { detectCurrency, displayBudget, type CurrencyInfo } from '@/lib/currency'
import type { RecommendedDestination } from '@/lib/recommendations'

// ─── Types ────────────────────────────────────────────────────────────────────

type LoadState = 'loading' | 'ready' | 'error'

interface ApiResponse {
  destinations?:  RecommendedDestination[]
  home_country?:  string
  cached?:        boolean
  stale?:         boolean
  needs_refresh?: boolean
  fallback?:      boolean
  error?:         string
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
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}

// ─── Gem score dots ───────────────────────────────────────────────────────────

function GemDots({ score }: { score?: number }) {
  if (!score) return null
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className={`w-1.5 h-1.5 rounded-full ${
          i < Math.round(score / 2) ? 'bg-[#C97552]' : 'bg-white/15'
        }`} />
      ))}
    </div>
  )
}

// ─── Destination card (expandable) ───────────────────────────────────────────

// Gradient palettes — one per card index, cycles if > 8 destinations
const GRAD_PALETTES = [
  'from-[#1a3a5c] to-[#0d1f35]',
  'from-[#2d1f3d] to-[#0d1f35]',
  'from-[#1a3828] to-[#0d1f35]',
  'from-[#3a2010] to-[#0d1f35]',
  'from-[#1a2840] to-[#0d1f35]',
  'from-[#2a1a30] to-[#0d1f35]',
  'from-[#1e3530] to-[#0d1f35]',
  'from-[#302010] to-[#0d1f35]',
]

function DestinationCard({
  dest, rank, locked, currency,
}: {
  dest:     RecommendedDestination
  rank:     number
  locked:   boolean
  currency: CurrencyInfo
}) {
  const [expanded,  setExpanded]  = useState(false)
  const [imgUrl,    setImgUrl]    = useState<string | null>(null)
  const [imgLoaded, setImgLoaded] = useState(false)

  // Lazy-fetch the image only when the card is first expanded
  useEffect(() => {
    if (!expanded || locked || imgUrl !== null) return
    const q = `${dest.name} ${dest.country} travel landscape`
    fetch(`/api/destination-image?q=${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then(d => setImgUrl(d.url ?? ''))   // empty string = confirmed no image
      .catch(() => setImgUrl(''))
  }, [expanded, locked, dest.name, dest.country, imgUrl])

  const gradClass = GRAD_PALETTES[(rank - 1) % GRAD_PALETTES.length]

  const skyscannerUrl = dest.name
    ? `https://www.skyscanner.com/transport/flights/to/${encodeURIComponent(dest.name.toLowerCase().replace(/\s+/g, '-'))}/`
    : 'https://www.skyscanner.com'

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
                {locked ? '████████' : dest.country}
              </p>
            </div>
          </div>

          {/* Right: match pill + gem dots */}
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            {locked ? (
              <div className="flex items-center gap-1.5 bg-white/8 border border-white/10 rounded-full px-3 py-1">
                <svg className="w-3 h-3 text-white/30" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                <span className="text-xs text-white/30 font-label tracking-wider">Locked</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 bg-[#C97552]/15 border border-[#C97552]/30 rounded-full px-3 py-1">
                <span className="text-xs text-[#C97552] font-semibold">{dest.match_score}%</span>
                <span className="text-xs text-[#C97552]/70">match</span>
              </div>
            )}
            {!locked && <GemDots score={dest.hidden_gem_score} />}
          </div>
        </div>

        {/* First reason tag (collapsed preview) */}
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
        <div onClick={e => e.stopPropagation()}
          className={locked ? 'relative overflow-hidden' : ''}>
          {/* Hero image */}
          {!locked && (
            <div className={`relative h-44 overflow-hidden bg-gradient-to-br ${gradClass}`}>
              {/* Shimmer while waiting for URL */}
              {imgUrl === null && (
                <div className="absolute inset-0 bg-white/5 animate-pulse" />
              )}
              {/* Actual photo once URL resolves */}
              {imgUrl && (
                <img
                  src={imgUrl}
                  alt={dest.name}
                  className={`w-full h-full object-cover transition-opacity duration-500 ${imgLoaded ? 'opacity-80' : 'opacity-0'}`}
                  loading="lazy"
                  onLoad={() => setImgLoaded(true)}
                  onError={() => setImgUrl('')}
                />
              )}
              {/* Destination name watermark over gradient (shows when no photo) */}
              {(!imgUrl || !imgLoaded) && (
                <div className="absolute inset-0 flex items-end p-4">
                  <span className="font-serif italic text-white/20 text-2xl">{dest.name}</span>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            </div>
          )}

          <div className={`px-5 pb-5 pt-4 ${locked ? 'blur-sm select-none pointer-events-none' : ''}`}>
            {/* All 3 reason tags */}
            <div className="flex flex-wrap gap-2 mb-4">
              {dest.reasons.map((r, i) => (
                <span key={i} className="text-xs text-white/60 bg-white/6 border border-white/10 px-2.5 py-1 rounded-full">
                  {r}
                </span>
              ))}
            </div>

            {/* Meta row */}
            <div className="flex items-end justify-between border-t border-white/8 pt-4">
              <div className="space-y-3">
                {dest.budget_per_day_usd && (
                  <div>
                    <p className="text-xs text-white/30 uppercase tracking-widest mb-0.5">Budget</p>
                    <p className="text-sm text-white/80 font-medium">
                      {displayBudget(dest.budget_per_day_usd, currency)}
                    </p>
                    <p className="text-xs text-white/30 mt-0.5">on the ground · excl. flights</p>
                    <a
                      href={skyscannerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-xs text-[#C97552]/70 hover:text-[#C97552] transition-colors mt-1 inline-block"
                    >
                      Search flights →
                    </a>
                  </div>
                )}
                {dest.best_time_to_visit && (
                  <div>
                    <p className="text-xs text-white/30 uppercase tracking-widest mb-0.5">Best time</p>
                    <p className="text-sm text-white/70">{dest.best_time_to_visit}</p>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 items-end">
                <button
                  onClick={e => e.stopPropagation()}
                  className="text-xs text-white/50 border border-white/15 rounded-full px-4 py-2 hover:border-white/35 hover:text-white/70 transition-all"
                >
                  Save
                </button>
                <button
                  onClick={e => e.stopPropagation()}
                  className="text-xs text-white bg-[#C97552] rounded-full px-4 py-2 hover:bg-[#b86644] transition-colors font-medium"
                >
                  Plan this trip →
                </button>
              </div>
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

// ─── Unlock CTA ───────────────────────────────────────────────────────────────

function UnlockBanner({ count }: { count: number }) {
  return (
    <div className="rounded-2xl border border-[#C97552]/25 bg-[#C97552]/5 p-6 text-center">
      <div className="text-2xl mb-3">🔮</div>
      <h3 className="font-serif italic text-xl text-white mb-1.5">
        {count} more destination{count !== 1 ? 's' : ''} matched your profile
      </h3>
      <p className="text-white/45 text-sm mb-2 max-w-xs mx-auto">
        Unlock all destinations, full details, and flight search for this trip.
      </p>
      <p className="text-white/25 text-xs mb-5">One-time · no subscription</p>
      <button className="bg-[#C97552] text-white font-semibold text-sm px-8 py-3 rounded-full hover:bg-[#b86644] transition-colors">
        Unlock all destinations — $4.99
      </button>
      <p className="text-white/20 text-xs mt-4">
        Or get unlimited trips + Voya Pro for $29.99/year
      </p>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const FREE_TIER_LIMIT   = 3
const SLOW_THRESHOLD_MS = 10000
const TIMEOUT_MS        = 58000

export default function DiscoverPage() {
  const router = useRouter()
  const [state, setState]               = useState<LoadState>('loading')
  const [destinations, setDestinations] = useState<RecommendedDestination[]>([])
  const [currency, setCurrency]         = useState<CurrencyInfo>({ symbol: '$', code: 'USD', rate: 1 })
  const [isCached, setIsCached]         = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [errorMsg, setErrorMsg]         = useState('')
  const [retryCount, setRetryCount]     = useState(0)
  const [slow, setSlow]                 = useState(false)

  const retry = useCallback(() => {
    setState('loading')
    setSlow(false)
    setRetryCount(n => n + 1)
  }, [])

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
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ force_refresh: false }),
        })

        if (res.status === 401) { router.push('/login'); return }

        const data: ApiResponse = await res.json()
        if (cancelled) return

        if (data.error) { setErrorMsg(data.error); setState('error'); return }

        if (data.destinations && data.destinations.length > 0) {
          setDestinations(data.destinations)
          setIsCached(!!data.cached)
          if (data.home_country) setCurrency(detectCurrency(data.home_country))
          setState('ready')
          clearTimeout(slowTimer)
          clearTimeout(hardTimer)

          // Background refresh if stale
          if (data.needs_refresh) {
            setIsRefreshing(true)
            try {
              const refreshRes = await fetch('/api/recommendations', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ force_refresh: true }),
              })
              if (!cancelled && refreshRes.ok) {
                const refreshData: ApiResponse = await refreshRes.json()
                if (!cancelled && refreshData.destinations && refreshData.destinations.length > 0) {
                  setDestinations(refreshData.destinations)
                  setIsCached(false)
                  if (refreshData.home_country) setCurrency(detectCurrency(refreshData.home_country))
                }
              }
            } catch { /* silently ignore */ }
            finally { if (!cancelled) setIsRefreshing(false) }
          }
        } else {
          setErrorMsg('No destinations returned. Please try again.')
          setState('error')
        }
      } catch {
        if (!cancelled) {
          setErrorMsg('Connection error — check your internet and try again.')
          setState('error')
        }
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
        <button onClick={handleLogout} className="text-white/30 text-xs hover:text-white/50 transition-colors">
          Sign out
        </button>
      </div>
    )
  }

  const unlocked = destinations.slice(0, FREE_TIER_LIMIT)
  const locked   = destinations.slice(FREE_TIER_LIMIT)

  return (
    <div className="min-h-screen bg-[#0d1f35]">
      {/* Nav */}
      <nav className="sticky top-0 z-20 bg-[#0d1f35]/90 backdrop-blur-md border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <span className="font-serif italic text-xl text-white/90">Voya</span>
        <button onClick={() => router.push('/profile')}
          className="text-xs text-white/35 hover:text-white/60 transition-colors font-label tracking-widest uppercase">
          Profile
        </button>
      </nav>

      <main className="max-w-2xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <p className="text-xs text-white/35 uppercase tracking-widest font-label mb-2">
            Your results
            {isCached && <span className="ml-2 text-[#C97552]/60">· cached</span>}
            {isRefreshing && <span className="ml-2 text-white/25 animate-pulse">· updating…</span>}
          </p>
          <h1 className="font-serif italic text-4xl text-white leading-tight">
            {destinations.length} destinations
            <br />
            <span className="text-white/50">matched your profile</span>
          </h1>
          <p className="text-white/40 text-sm mt-3">
            Ranked by how well they fit your travel style.
            {' '}Your top {FREE_TIER_LIMIT} are free forever.
          </p>
        </div>

        {/* Cards */}
        <div className="space-y-3">
          {unlocked.map((dest, i) => (
            <DestinationCard key={dest.name} dest={dest} rank={i + 1} locked={false} currency={currency} />
          ))}

          {locked.length > 0 && (
            <>
              {locked.map((dest, i) => (
                <DestinationCard key={dest.name + i} dest={dest} rank={FREE_TIER_LIMIT + i + 1} locked currency={currency} />
              ))}
              <UnlockBanner count={locked.length} />
            </>
          )}
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-white/8 text-center space-y-2">
          <p className="text-white/20 text-xs">Results refresh when your profile changes.</p>
          <button onClick={handleLogout}
            className="text-white/20 text-xs hover:text-white/40 transition-colors">
            Sign out
          </button>
        </div>
      </main>
    </div>
  )
}
