'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Deal } from '@/app/api/deals/route'

type Category = 'all' | 'flight' | 'hotel' | 'card' | 'alert'

const CATEGORY_LABELS: Record<Category, string> = {
  all:    'All deals',
  flight: '✈️ Flights',
  hotel:  '🏨 Hotels',
  card:   '💳 Cards',
  alert:  '📡 Alerts',
}

const CATEGORY_COLORS: Record<Deal['category'], string> = {
  flight: 'text-blue-300/80   bg-blue-400/10   border-blue-400/20',
  hotel:  'text-emerald-300/80 bg-emerald-400/10 border-emerald-400/20',
  card:   'text-violet-300/80  bg-violet-400/10  border-violet-400/20',
  alert:  'text-amber-300/80   bg-amber-400/10   border-amber-400/20',
}

const CATEGORY_ICONS: Record<Deal['category'], string> = {
  flight: '✈️',
  hotel:  '🏨',
  card:   '💳',
  alert:  '📡',
}

// ─── Deal card ────────────────────────────────────────────────────────────────

function DealCard({ deal }: { deal: Deal }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/4 hover:bg-white/6 hover:border-white/18 transition-all duration-200 p-5 flex flex-col gap-3">
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <span className={`text-xs font-label tracking-widest uppercase px-2.5 py-1 rounded-full border ${CATEGORY_COLORS[deal.category]}`}>
          {CATEGORY_ICONS[deal.category]} {deal.category}
        </span>
        {deal.expires && (
          <span className="text-xs text-white/25 flex-shrink-0">Ends {deal.expires}</span>
        )}
      </div>

      {/* Title + description */}
      <div>
        <h3 className="font-serif italic text-lg text-white leading-snug mb-1">{deal.title}</h3>
        <p className="text-sm text-white/50 leading-relaxed">{deal.description}</p>
      </div>

      {/* Value + CTA */}
      <div className="flex items-center justify-between mt-auto pt-1 border-t border-white/6">
        <span className="text-sm font-semibold text-[#C97552]">{deal.value}</span>
        <a
          href={deal.action_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-white/50 border border-white/15 rounded-full px-4 py-1.5 hover:border-white/35 hover:text-white/80 transition-all"
        >
          {deal.action_label} →
        </a>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DealsPage() {
  const router   = useRouter()
  const [deals,     setDeals]     = useState<Deal[]>([])
  const [country,   setCountry]   = useState('')
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [filter,    setFilter]    = useState<Category>('all')
  const [cached,    setCached]    = useState(false)

  useEffect(() => {
    fetch('/api/deals')
      .then(r => {
        if (r.status === 401) { router.push('/login'); return null }
        return r.json()
      })
      .then(d => {
        if (!d) return
        if (d.error) { setError(d.error); setLoading(false); return }
        setDeals(d.deals ?? [])
        setCountry(d.country ?? '')
        setCached(!!d.cached)
        setLoading(false)
      })
      .catch(() => { setError('Connection error — try again.'); setLoading(false) })
  }, [router])

  const visible = filter === 'all' ? deals : deals.filter(d => d.category === filter)

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d1f35] flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 rounded-full border border-[#C97552]/40"
          style={{ animation: 'spin 2s linear infinite' }} />
        <p className="text-white/40 text-sm">Loading today's tips…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-[#0d1f35] flex flex-col items-center justify-center gap-4 px-4 text-center">
        <span className="text-3xl">📡</span>
        <p className="text-white/60 text-sm">{error}</p>
        <button onClick={() => router.refresh()}
          className="text-xs text-white/40 border border-white/15 rounded-full px-6 py-2 hover:border-white/35 transition-all">
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0d1f35]">

      {/* Atmospheric hero */}
      <div className="relative overflow-hidden mb-2">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1400&q=80&auto=format')", opacity: 0.2 }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0d1f35]/40 to-[#0d1f35]" />
        <div className="relative max-w-2xl mx-auto px-4 pt-8 pb-6">
          <p className="text-xs text-white/35 uppercase tracking-widest font-label mb-2">
            Travel tips
            {cached
              ? <span className="ml-2 text-[#C97552]/50">· updated today</span>
              : <span className="ml-2 text-white/25">· fresh now</span>
            }
            {country && <span className="ml-2 text-white/20">· {country}</span>}
          </p>
          <h1 className="font-serif italic text-4xl text-white leading-tight">
            Offers &amp; tips
            <br />
            <span className="text-white/50">for right now.</span>
          </h1>
          <p className="text-white/35 text-sm mt-3">
            Flight promotions, hotel offers, card bonuses, and travel news — curated daily for your country.
          </p>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 pb-10">
        {/* Sub-header note */}
        <div className="mb-6">
          <p className="text-white/20 text-xs">
            AI-curated and updated daily. Always verify details directly with the provider before booking.
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap mb-6">
          {(Object.keys(CATEGORY_LABELS) as Category[]).map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`text-xs font-label tracking-wider uppercase px-4 py-1.5 rounded-full border transition-all ${
                filter === cat
                  ? 'bg-[#C97552]/15 border-[#C97552]/50 text-[#C97552]'
                  : 'border-white/12 text-white/35 hover:border-white/25 hover:text-white/55'
              }`}
            >
              {CATEGORY_LABELS[cat]}
              {cat !== 'all' && (
                <span className="ml-1.5 opacity-50">
                  {deals.filter(d => d.category === cat).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Deal cards */}
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map(deal => (
            <DealCard key={deal.id} deal={deal} />
          ))}
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-white/8 text-center">
          <p className="text-white/20 text-xs">
            Deals curated by Voya's AI for {country} travellers · Updated daily
          </p>
        </div>
      </main>
    </div>
  )
}
