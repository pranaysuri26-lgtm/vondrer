'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'
import type { PlanActivityCard, PlanAccommodation } from '@/app/api/plan/suggest/route'
import type { ItineraryResult } from '@/app/api/itinerary/route'

// ─── Types ────────────────────────────────────────────────────────────────────

interface OnboardingProfile {
  home_city?:            string
  home_country?:         string
  budget_per_day?:       string
  group_type?:           string
  interests?:            string[]
  dietary_preferences?:  string[]
}

const DIETARY_OPTIONS = [
  { id: 'none',        label: '🍽️ No restrictions' },
  { id: 'vegetarian',  label: '🌿 Vegetarian'       },
  { id: 'vegan',       label: '🌱 Vegan'            },
  { id: 'halal',       label: '🌙 Halal'            },
  { id: 'no_pork',     label: '🚫 No pork'          },
  { id: 'no_beef',     label: '🐄 No beef'          },
  { id: 'gluten_free', label: '🌾 Gluten-free'      },
]

// ─── Category config ──────────────────────────────────────────────────────────

function getCategoryMeta(category: string) {
  if (category.includes('Beach'))
    return { colour: 'text-sky-400',     border: 'border-t-sky-400/60',     gradFrom: 'rgba(56,189,248,0.10)'  }
  if (category.includes('Art'))
    return { colour: 'text-violet-400',  border: 'border-t-violet-400/60',  gradFrom: 'rgba(167,139,250,0.10)' }
  if (category.includes('Food'))
    return { colour: 'text-orange-400',  border: 'border-t-orange-400/60',  gradFrom: 'rgba(251,146,60,0.10)'  }
  if (category.includes('Nature'))
    return { colour: 'text-emerald-400', border: 'border-t-emerald-400/60', gradFrom: 'rgba(52,211,153,0.10)'  }
  if (category.includes('Night'))
    return { colour: 'text-indigo-400',  border: 'border-t-indigo-400/60',  gradFrom: 'rgba(129,140,248,0.10)' }
  if (category.includes('History'))
    return { colour: 'text-yellow-400',  border: 'border-t-yellow-400/60',  gradFrom: 'rgba(250,204,21,0.10)'  }
  if (category.includes('Shop'))
    return { colour: 'text-pink-400',    border: 'border-t-pink-400/60',    gradFrom: 'rgba(244,114,182,0.10)' }
  if (category.includes('Exp'))
    return { colour: 'text-teal-400',    border: 'border-t-teal-400/60',    gradFrom: 'rgba(45,212,191,0.10)'  }
  if (category.includes('Active'))
    return { colour: 'text-lime-400',    border: 'border-t-lime-400/60',    gradFrom: 'rgba(163,230,53,0.10)'  }
  if (category.includes('Cafe'))
    return { colour: 'text-amber-400',   border: 'border-t-amber-400/60',   gradFrom: 'rgba(251,191,36,0.10)'  }
  if (category.includes('Street') || category.includes('Walk'))
    return { colour: 'text-cyan-400',    border: 'border-t-cyan-400/60',    gradFrom: 'rgba(34,211,238,0.10)'  }
  if (category.includes('Day Trip') || category.includes('Day'))
    return { colour: 'text-rose-300',    border: 'border-t-rose-300/60',    gradFrom: 'rgba(253,164,175,0.10)' }
  return   { colour: 'text-[#5C564E]',   border: 'border-t-white/20',       gradFrom: 'rgba(255,255,255,0.05)' }
}

// ─── Price badge ──────────────────────────────────────────────────────────────

function PriceBadge({ price }: { price: string }) {
  if (price === 'Free') return <span className="text-xs font-semibold text-emerald-400">Free</span>
  return <span className="text-xs text-[#6b5f54] font-medium">{price}</span>
}

// ─── Animated checkmark ───────────────────────────────────────────────────────

function AnimatedCheck({ trigger }: { trigger: boolean }) {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="mx-auto">
      <circle cx="32" cy="32" r="22" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round"
        strokeDasharray="138" strokeDashoffset={trigger ? 0 : 138}
        style={{ transition: trigger ? 'stroke-dashoffset 0.5s ease-out' : 'none' }}
      />
      <path d="M20 32 L28 40 L44 22" stroke="#4ade80" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="32" strokeDashoffset={trigger ? 0 : 32}
        style={{ transition: trigger ? 'stroke-dashoffset 0.3s 0.3s ease-out' : 'none' }}
      />
    </svg>
  )
}

// ─── Animated cross ───────────────────────────────────────────────────────────

function AnimatedCross({ trigger }: { trigger: boolean }) {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="mx-auto">
      <circle cx="32" cy="32" r="22" stroke="#fb7185" strokeWidth="2.5" strokeLinecap="round"
        strokeDasharray="138" strokeDashoffset={trigger ? 0 : 138}
        style={{ transition: trigger ? 'stroke-dashoffset 0.45s ease-out' : 'none' }}
      />
      <path d="M22 22 L42 42" stroke="#fb7185" strokeWidth="2.5" strokeLinecap="round"
        strokeDasharray="28" strokeDashoffset={trigger ? 0 : 28}
        style={{ transition: trigger ? 'stroke-dashoffset 0.25s 0.2s ease-out' : 'none' }}
      />
      <path d="M42 22 L22 42" stroke="#fb7185" strokeWidth="2.5" strokeLinecap="round"
        strokeDasharray="28" strokeDashoffset={trigger ? 0 : 28}
        style={{ transition: trigger ? 'stroke-dashoffset 0.25s 0.34s ease-out' : 'none' }}
      />
    </svg>
  )
}

// ─── Lazy destination image ───────────────────────────────────────────────────
// Fetches one image from the destination-image API on mount.
// Shows a shimmer placeholder while loading, then crossfades in.

function DestImage({
  query, className, style,
}: {
  query:     string
  className?: string
  style?:    React.CSSProperties
}) {
  const [url,     setUrl]     = useState<string | null>(null)
  const [loaded,  setLoaded]  = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/destination-image?q=${encodeURIComponent(query)}&count=1`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setUrl(d.url ?? null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [query])

  return (
    <div className={`relative overflow-hidden bg-[#E8E0D6] ${className ?? ''}`} style={style}>
      {/* shimmer */}
      {!loaded && (
        <div className="absolute inset-0 animate-pulse"
          style={{ background: 'linear-gradient(135deg,#D8D0C4,#EDE5D8)' }} />
      )}
      {url && (
        <img
          src={url}
          alt=""
          className="w-full h-full object-cover transition-opacity duration-500"
          style={{ opacity: loaded ? 1 : 0 }}
          onLoad={() => setLoaded(true)}
        />
      )}
    </div>
  )
}

// ─── Card detail sheet ────────────────────────────────────────────────────────

function CardDetailSheet({
  card,
  destination,
  isPicked,
  onPick,
  onClose,
}: {
  card:        PlanActivityCard
  destination: string
  isPicked:    boolean
  onPick:      () => void
  onClose:     () => void
}) {
  const meta = getCategoryMeta(card.category)
  const [visible,   setVisible]   = useState(false)
  const [action,    setAction]    = useState<'pick' | 'remove' | null>(null)
  const [animating, setAnimating] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
    return () => cancelAnimationFrame(id)
  }, [])

  function close() {
    setVisible(false)
    setTimeout(onClose, 300)
  }

  function handlePick() {
    if (animating) return
    setAction('pick')
    setAnimating(true)
    setTimeout(() => { onPick(); close() }, 680)
  }

  function handleRemove() {
    if (animating) return
    setAction('remove')
    setAnimating(true)
    setTimeout(() => { onPick(); close() }, 520)
  }

  const imgQuery = `${card.name} ${destination}`

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.28s ease' }}
        onClick={() => !animating && close()}
      />

      {/* Sheet */}
      <div
        className="relative w-full max-w-lg rounded-t-[28px] sm:rounded-3xl border-t sm:border border-x border-[#E8E0D6] shadow-2xl overflow-hidden sm:max-h-[90vh] sm:overflow-y-auto bg-[#FAF8F5]"
        style={{
          transform:  visible ? 'translateY(0) scale(1)' : 'translateY(100%) scale(0.97)',
          transition: 'transform 0.32s cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-0">
          <div className="w-9 h-[3px] rounded-full bg-[#D8D0C4]"/>
        </div>

        {animating ? (
          <div className="flex flex-col items-center justify-center py-14 px-6">
            {action === 'pick' ? (
              <>
                <AnimatedCheck trigger />
                <p className="text-emerald-600 font-semibold mt-4 text-sm tracking-wide">Added to your trip</p>
              </>
            ) : (
              <>
                <AnimatedCross trigger />
                <p className="text-rose-500/80 font-semibold mt-4 text-sm tracking-wide">Removed</p>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Hero image */}
            <DestImage
              query={imgQuery}
              className="w-full h-44 sm:h-52"
            />

            <div className="px-6 pb-8 pt-5">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <span className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${meta.colour}`}>
                  {card.category}
                </span>
                <button onClick={close}
                  className="w-7 h-7 rounded-full bg-[#F0EBE3] border border-[#E0D8D0] flex items-center justify-center text-[#6b5f54] hover:bg-[#E2D8CC] transition-colors flex-shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>

              {/* Name */}
              <h2 className="text-[#1A1A1A] font-bold text-[22px] leading-tight tracking-tight mb-1">
                {card.name}
              </h2>
              <p className="text-[#6b5f54] text-sm mb-4 leading-relaxed">{card.tagline}</p>

              <div className="h-px bg-[#E8E0D6] mb-4"/>

              {/* Why */}
              <p className="text-[#3A3430] text-[13px] leading-relaxed mb-5">{card.why}</p>

              {/* Metadata pills */}
              <div className="flex flex-wrap gap-2 mb-5">
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#E8E0D6] text-xs">
                  <PriceBadge price={card.price} />
                </span>
                <span className="px-3 py-1.5 rounded-full bg-white border border-[#E8E0D6] text-xs text-[#6b5f54]">
                  {card.duration}
                </span>
                <span className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white border border-[#E8E0D6] text-xs text-[#6b5f54]">
                  <svg className="w-3 h-3 text-[#9A8E7E] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                  </svg>
                  {card.neighbourhood}
                </span>
              </div>

              {card.related_to && (
                <p className="text-[#C97552]/70 text-xs mb-5">↳ {card.related_to}</p>
              )}

              {/* Actions */}
              {isPicked ? (
                <div className="flex gap-3">
                  <button onClick={handleRemove}
                    className="flex-1 py-3.5 rounded-2xl border border-rose-500/25 bg-rose-500/8 text-rose-500 text-sm font-semibold hover:bg-rose-500/15 transition-colors">
                    Remove ✗
                  </button>
                  <button onClick={close}
                    className="flex-1 py-3.5 rounded-2xl bg-[#F5F0EA] border border-[#E2D8CE] text-[#5A504A] text-sm font-semibold hover:bg-[#E8E0D4] transition-colors">
                    Keep ✓
                  </button>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button onClick={close}
                    className="py-3.5 px-5 rounded-2xl border border-[#E2D8CE] text-[#7A6E64] text-sm font-semibold hover:bg-white transition-colors">
                    Skip ✗
                  </button>
                  <button onClick={handlePick}
                    className="flex-1 py-3.5 rounded-2xl bg-[#C97552] text-white text-sm font-bold hover:bg-[#b86644] transition-colors flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                    </svg>
                    Pick it
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── New card entrance wrapper ────────────────────────────────────────────────
// New cards slide in from the right with a staggered delay.
// Existing cards (isNew=false) render immediately with no animation.

function NewCardWrapper({
  children, isNew, staggerMs,
}: {
  children:  React.ReactNode
  isNew:     boolean
  staggerMs: number
}) {
  const [entered, setEntered] = useState(!isNew)

  useEffect(() => {
    if (!isNew) return
    const t = setTimeout(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)))
    }, staggerMs)
    return () => clearTimeout(t)
  }, [isNew, staggerMs])

  return (
    <div
      className="w-[calc(50%-6px)] sm:w-[calc(33.333%-8px)] lg:w-[calc(25%-9px)]"
      style={{
        opacity:    entered ? 1 : 0,
        transform:  entered ? 'translateX(0)' : 'translateX(32px)',
        transition: isNew ? 'opacity 0.32s ease, transform 0.32s ease' : 'none',
      }}
    >
      {children}
    </div>
  )
}

// ─── Compact activity card ────────────────────────────────────────────────────

function ActivityCard({
  card,
  destination,
  picked,
  onExpand,
}: {
  card:        PlanActivityCard
  destination: string
  picked:      boolean
  onExpand:    (card: PlanActivityCard) => void
}) {
  const meta = getCategoryMeta(card.category)

  return (
    <button
      onClick={() => onExpand(card)}
      className={`
        group relative w-full text-left rounded-2xl overflow-hidden transition-all duration-200
        ${picked
          ? 'border-2 border-[#C97552]/60 shadow-[0_0_20px_rgba(201,117,82,0.12)]'
          : 'border border-[#E8E0D6] hover:border-[#C8C0B4] hover:shadow-md'
        }
        bg-white
      `}
    >
      {/* Photo strip */}
      <DestImage
        query={`${card.name} ${destination}`}
        className="w-full h-28 rounded-none"
      />

      {/* Category colour accent bar */}
      <div className={`h-[2px] w-full border-t-2 ${meta.border}`} />

      {/* Picked badge */}
      {picked && (
        <div className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-[#C97552] flex items-center justify-center z-10 shadow-md">
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
          </svg>
        </div>
      )}

      <div className="p-3.5">
        {/* Category */}
        <div className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${picked ? 'text-[#C97552]' : meta.colour}`}>
          {card.category}
        </div>

        {/* Name */}
        <h3 className="font-bold text-[14px] leading-snug mb-1.5 text-[#1A1A1A] pr-6 group-hover:text-[#C97552] transition-colors line-clamp-2">
          {card.name}
        </h3>

        {/* Tagline */}
        <p className="text-[#6b5f54] text-[11px] leading-relaxed mb-3 line-clamp-2">
          {card.tagline}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2.5 border-t border-[#F0EBE3]">
          <div className="flex items-center gap-1.5">
            <PriceBadge price={card.price} />
            <span className="text-[#C8C0B4] text-[10px]">·</span>
            <span className="text-[#8A7E6E] text-[10px]">{card.duration}</span>
          </div>
          <span className="text-[#A8A09A] text-[9px] truncate max-w-[80px]">{card.neighbourhood}</span>
        </div>
      </div>
    </button>
  )
}

// ─── Accommodation card ───────────────────────────────────────────────────────

function AccommodationCard({ acc, budget }: { acc: PlanAccommodation; budget?: string }) {
  const BUDGET_LABELS: Record<string, string> = {
    'under-20': 'budget', '20-50': 'budget-friendly',
    '50-150': 'mid-range', '150-300': 'comfortable', '300+': 'luxury',
  }
  return (
    <div className="rounded-2xl border-t-2 border-t-blue-400/50 bg-blue-500/5 border border-blue-500/15 p-5">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center shrink-0">
          <span className="text-lg">🏨</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mb-1">
            Where to stay · {BUDGET_LABELS[budget ?? ''] ?? 'mid-range'} budget
          </p>
          <p className="text-[#1A1A1A] font-semibold text-sm mb-1">{acc.neighbourhood}</p>
          <p className="text-[#5A504A] text-xs leading-relaxed">{acc.why}</p>
          <p className="text-[#8A7E6E] text-xs mt-2">{acc.price_range} / night</p>
        </div>
      </div>
    </div>
  )
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-2xl border-t-2 border-t-white/10 bg-white/[0.04] border border-[#E8E0D6] p-4 animate-pulse">
      <div className="h-2.5 w-20 bg-[#EDE5D8] rounded-full mb-3"/>
      <div className="h-[15px] w-3/4 bg-[#EDE5D8] rounded mb-2"/>
      <div className="h-2.5 w-1/2 bg-[#F0EBE3] rounded mb-3"/>
      <div className="flex justify-between pt-2.5 border-t border-[#E8E0D6]">
        <div className="h-2.5 w-16 bg-[#F0EBE3] rounded"/>
        <div className="h-2.5 w-20 bg-[#F0EBE3] rounded"/>
      </div>
    </div>
  )
}

// ─── Build modal ──────────────────────────────────────────────────────────────

function BuildModal({
  destination, country, picked, accommodation, onboarding, onClose, router,
}: {
  destination:    string
  country:        string
  picked:         PlanActivityCard[]
  accommodation?: PlanAccommodation
  onboarding:     OnboardingProfile | null
  onClose:        () => void
  router:         ReturnType<typeof import('next/navigation').useRouter>
}) {
  const today = new Date().toISOString().split('T')[0]
  const [startDate, setStartDate] = useState(today)
  const [days,      setDays]      = useState(5)
  const [pace,      setPace]      = useState<'relaxed'|'balanced'|'packed'>('balanced')
  const [dietary,   setDietary]   = useState<string[]>(onboarding?.dietary_preferences ?? [])
  const [loading,   setLoading]   = useState(false)
  const [done,      setDone]      = useState<string | null>(null)
  const [error,     setError]     = useState('')

  function toggleDietary(id: string) {
    if (id === 'none') { setDietary(['none']); return }
    setDietary(prev => {
      const without = prev.filter(d => d !== 'none')
      return without.includes(id) ? without.filter(d => d !== id) : [...without, id]
    })
  }

  async function handleBuild() {
    if (!startDate) { setError('Please pick a start date'); return }
    setLoading(true); setError('')
    try {
      const pickedNames  = picked.map(p => p.name).join(', ')
      const clusterAreas = [...new Set(picked.map(p => p.neighbourhood))].join(', ')
      const dietaryStr   = dietary.filter(d => d !== 'none').join(', ')

      const itinBody = {
        destination, country, days, start_date: startDate,
        user_profile: {
          budget_per_day:      onboarding?.budget_per_day ?? '50-150',
          group_type:          onboarding?.group_type ?? 'couple',
          interests:           onboarding?.interests ?? [],
          dietary_preferences: dietary.filter(d => d !== 'none'),
          home_city:           onboarding?.home_city ?? '',
          home_country:        onboarding?.home_country ?? '',
        },
        must_do:      pickedNames,
        trip_context: [
          `The traveler selected these specific activities: ${pickedNames}. Build the entire itinerary around these — they are non-negotiable.`,
          `Fill remaining slots with complementary activities near ${clusterAreas}.`,
          accommodation ? `Accommodation is in ${accommodation.neighbourhood}.` : '',
          dietaryStr ? `Dietary requirements: ${dietaryStr}. Every restaurant must satisfy these.` : '',
          onboarding?.home_country
            ? `Traveler is from ${onboarding.home_country}${onboarding.home_city ? ` (${onboarding.home_city})` : ''} — tailor cuisine choices accordingly.`
            : '',
        ].filter(Boolean).join(' '),
        trip_pace:       pace,
        searching_hotel: !accommodation,
      }

      const itinRes = await fetch('/api/itinerary', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(itinBody),
      })
      if (!itinRes.ok) throw new Error('Failed')
      const result: ItineraryResult = await itinRes.json()

      const supabase = getSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: trip, error: tripErr } = await supabase.from('trips').insert({
        user_id: user.id, trip_name: `${destination} — AI Planned`, status: 'planning',
        total_days: days, start_date: startDate, end_date: result.end_date, trip_pace: pace,
      }).select().single()
      if (tripErr || !trip) throw new Error('Save failed')

      await supabase.from('trip_destinations').insert({
        trip_id: trip.id, destination_name: destination, country, position: 1,
        days, start_date: startDate, end_date: result.end_date,
        itinerary_json: result.itinerary.map(({ day, title, morning, afternoon, evening, day_total_estimate }) =>
          ({ day, title, morning, afternoon, evening, day_total_estimate })),
        notes: JSON.stringify({ must_do: pickedNames, ai_picks: picked, accommodation: accommodation ?? null }),
      })

      setDone(trip.share_token ?? trip.id)
    } catch (err) {
      console.error('[Build]', err)
      setError('Something went wrong — please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4">
      <div className="absolute inset-0 bg-[#FAF8F5]/80 backdrop-blur-sm" onClick={!done ? onClose : undefined}/>
      <div className="relative w-full max-w-md bg-[#FAF8F5] rounded-t-3xl sm:rounded-3xl border border-[#E2D8CE] p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        {done ? (
          <div className="text-center py-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <h3 className="text-[#1A1A1A] font-semibold text-xl mb-1">Itinerary ready</h3>
            <p className="text-[#6b5f54] text-sm mb-8">Your {destination} trip has been saved.</p>
            <button onClick={() => router.push(`/trip/${done}`)}
              className="w-full py-4 rounded-full bg-[#C97552] text-white font-bold text-sm hover:bg-[#b86644] transition-colors mb-3">
              View my itinerary →
            </button>
            <button onClick={() => router.push('/trips')}
              className="w-full py-3 rounded-full border border-[#E2D8CE] text-[#5C564E] text-sm hover:border-white/25 hover:text-[#3A3430] transition-all">
              All my trips
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-[#1A1A1A] font-bold text-lg">Build itinerary</h2>
                <p className="text-[#6b5f54] text-sm mt-0.5">{picked.length} activities · {destination}</p>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#F0EBE3] flex items-center justify-center text-[#5C564E] hover:bg-[#E2D8CC] transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-5 p-3 bg-[#F5F2ED] border border-[#E8E0D6] rounded-xl">
              {picked.slice(0, 5).map(p => (
                <span key={p.id} className="text-xs px-2.5 py-1 rounded-full bg-[#C97552]/15 text-[#C97552] border border-[#C97552]/25">{p.name}</span>
              ))}
              {picked.length > 5 && <span className="text-xs px-2.5 py-1 rounded-full bg-[#F0EBE3] text-[#6b5f54]">+{picked.length - 5} more</span>}
            </div>

            <div className="mb-4">
              <label className="block text-[#5C564E] text-xs font-medium mb-1.5 uppercase tracking-wide">When are you going?</label>
              <input type="date" value={startDate} min={today} onChange={e => setStartDate(e.target.value)}
                className="w-full bg-white border border-[#E2D8CE] rounded-xl px-4 py-3 text-[#1A1A1A] text-sm focus:outline-none focus:border-[#C97552]/50 transition-colors"/>
            </div>

            <div className="mb-4">
              <label className="block text-[#5C564E] text-xs font-medium mb-1.5 uppercase tracking-wide">How many nights?</label>
              <div className="flex items-center gap-4 bg-white border border-[#E8E0D6] rounded-xl px-4 py-3">
                <button onClick={() => setDays(d => Math.max(1, d - 1))} className="w-8 h-8 rounded-full bg-[#EDE5D8] flex items-center justify-center text-[#1A1A1A] hover:bg-white/20 transition-colors">−</button>
                <span className="text-[#1A1A1A] font-bold text-lg flex-1 text-center">{days} night{days !== 1 ? 's' : ''}</span>
                <button onClick={() => setDays(d => Math.min(14, d + 1))} className="w-8 h-8 rounded-full bg-[#EDE5D8] flex items-center justify-center text-[#1A1A1A] hover:bg-white/20 transition-colors">+</button>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-[#5C564E] text-xs font-medium mb-1 uppercase tracking-wide">Food preferences</label>
              <p className="text-[#8A7E6E] text-xs mb-2.5">We'll only suggest restaurants that work for you</p>
              <div className="flex flex-wrap gap-2">
                {DIETARY_OPTIONS.map(opt => {
                  const active = dietary.includes(opt.id) || (opt.id === 'none' && dietary.length === 0)
                  return (
                    <button key={opt.id} onClick={() => toggleDietary(opt.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${active ? 'bg-[#C97552]/15 border-[#C97552]/40 text-[#C97552]' : 'bg-white border-[#E2D8CE] text-[#6b5f54] hover:border-white/25'}`}>
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-[#5C564E] text-xs font-medium mb-1.5 uppercase tracking-wide">Trip pace</label>
              <div className="flex gap-2">
                {([{ id: 'relaxed', label: '😌 Relaxed' }, { id: 'balanced', label: '⚖️ Balanced' }, { id: 'packed', label: '⚡ Packed' }] as const).map(({ id, label }) => (
                  <button key={id} onClick={() => setPace(id)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-colors ${pace === id ? 'bg-[#C97552] text-white' : 'bg-white text-[#6b5f54] hover:bg-[#EDE5D8] border border-[#E8E0D6]'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

            <button onClick={handleBuild} disabled={loading}
              className="w-full py-4 rounded-full bg-[#C97552] text-white font-bold text-sm disabled:opacity-50 hover:bg-[#b86644] transition-colors flex items-center justify-center gap-2">
              {loading ? (
                <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Generating your itinerary…</>
              ) : 'Generate my itinerary →'}
            </button>
            <p className="text-[#9A8E7E] text-xs text-center mt-3">Takes ~15 seconds · Saved to your trips</p>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AIPlanPage() {
  const router       = useRouter()
  const params       = useParams()
  const searchParams = useSearchParams()

  const destination   = decodeURIComponent(params.destination as string)
  const country       = searchParams.get('country')  ?? ''
  const stateProvince = searchParams.get('state')    ?? undefined

  // ── Flat accumulating card list ───────────────────────────────────────────
  const [allCards,     setAllCards]     = useState<PlanActivityCard[]>([])
  const [newCardIds,   setNewCardIds]   = useState<Set<string>>(new Set())
  const [latestAccomm, setLatestAccomm] = useState<PlanAccommodation | undefined>()
  const [roundNum,     setRoundNum]     = useState(1)

  const [picked,       setPicked]       = useState<PlanActivityCard[]>([])
  const [loading,      setLoading]      = useState(false)
  const [buildOpen,    setBuildOpen]    = useState(false)
  const [onboarding,   setOnboarding]   = useState<OnboardingProfile | null>(null)
  const [expandedCard, setExpandedCard] = useState<PlanActivityCard | null>(null)

  // Refs to avoid stale closures
  const pickedRef     = useRef<PlanActivityCard[]>([])
  const onboardingRef = useRef<OnboardingProfile | null>(null)
  const allCardsRef   = useRef<PlanActivityCard[]>([])
  const roundNumRef   = useRef(1)

  useEffect(() => { pickedRef.current     = picked     }, [picked])
  useEffect(() => { onboardingRef.current = onboarding }, [onboarding])
  useEffect(() => { allCardsRef.current   = allCards   }, [allCards])
  useEffect(() => { roundNumRef.current   = roundNum   }, [roundNum])

  // ── Load onboarding ──────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const supabase = getSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('onboarding_responses')
        .select('home_city, home_country, budget_per_day, group_type, interests, dietary_preferences')
        .eq('user_id', user.id).single()
      if (data) setOnboarding(data)
    }
    load()
  }, [])

  // ── Fetch a batch and append it to the flat list ────────────────────────
  const loadCards = useCallback(async (rn: number) => {
    setLoading(true)

    // seen_names = every card name shown so far (allCardsRef is the single source of truth)
    // Do NOT combine with seenNamesRef — that causes exponential duplication across rounds
    const seenNames = allCardsRef.current.map(c => c.name)

    try {
      const data = await fetch('/api/plan/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination, country, state_province: stateProvince,
          picked: pickedRef.current,
          seen_names: seenNames,
          round: rn,
          onboarding: onboardingRef.current,
        }),
      }).then(r => { if (!r.ok) throw new Error('Suggest failed'); return r.json() })

      const incoming: PlanActivityCard[] = data.cards ?? []

      // Client-side dedup — filter any card whose name already exists (AI sometimes ignores the list)
      const existingNames = new Set(allCardsRef.current.map(c => c.name.toLowerCase()))
      const deduped = incoming.filter(c => !existingNames.has(c.name.toLowerCase()))

      const incomingIds = new Set(deduped.map(c => c.id))

      // Mark incoming cards as "new" for entrance animation
      setNewCardIds(incomingIds)
      setAllCards(prev => {
        const updated = [...prev, ...deduped]
        allCardsRef.current = updated
        return updated
      })

      setRoundNum(rn)
      roundNumRef.current = rn

      if (data.accommodation) setLatestAccomm(data.accommodation)

      // Clear "new" markers after animation completes
      setTimeout(() => setNewCardIds(new Set()), 600)
    } catch (err) {
      console.error('[AIPlan]', err)
    } finally {
      setLoading(false)
    }
  }, [destination, country, stateProvince])

  // First load
  const firedRef = useRef(false)
  useEffect(() => {
    if (firedRef.current || !destination || !country) return
    firedRef.current = true
    loadCards(1)
  }, [destination, country, loadCards])

  function handleSuggestMore() {
    if (loading) return
    loadCards(roundNumRef.current + 1)
  }

  function togglePick(card: PlanActivityCard) {
    setPicked(prev => {
      const updated = prev.find(p => p.id === card.id)
        ? prev.filter(p => p.id !== card.id)
        : [...prev, card]
      pickedRef.current = updated
      return updated
    })
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] pb-36">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-[#FAF8F5]/95 backdrop-blur border-b border-[#E8E0D6]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <button onClick={() => router.back()}
            className="w-9 h-9 rounded-full bg-[#F5F0EA] flex items-center justify-center text-[#4A4440] hover:bg-[#E8E0D4] transition-colors shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[#1A1A1A]/28 text-[9px] uppercase tracking-widest font-semibold mb-0.5">AI Trip Planner</p>
            <h1 className="text-[#1A1A1A] font-semibold text-base leading-tight truncate">
              {destination}
              {country && <span className="text-[#1A1A1A]/38 font-normal">, {country}</span>}
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {picked.length > 0 && (
              <span className="text-xs text-[#6b5f54] hidden sm:block">{picked.length} selected</span>
            )}
            {picked.length >= 2 && (
              <button onClick={() => setBuildOpen(true)}
                className="px-4 py-2 bg-[#C97552] text-white text-sm font-semibold rounded-full hover:bg-[#b86644] transition-colors">
                Build →
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Picked chips ─────────────────────────────────────────────────────── */}
      {picked.length > 0 && (
        <div className="border-b border-[#E8E0D6] bg-[#FAF8F5]">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2.5">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
              {picked.map(p => (
                <button key={p.id} onClick={() => setExpandedCard(p)}
                  className="flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-full bg-[#C97552]/12 border border-[#C97552]/28 text-[#C97552] text-xs font-medium hover:bg-[#C97552]/20 transition-colors">
                  {p.name}
                  <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 pb-4">

        {/* Section label */}
        {(allCards.length > 0 || loading) && (
          <div className="flex items-center gap-3 mb-5">
            <p className="text-[#1A1A1A]/28 text-[10px] uppercase tracking-widest font-semibold shrink-0">
              Suggestions for {destination}
            </p>
            <div className="h-px flex-1 bg-white/[0.07]"/>
            {allCards.length > 0 && (
              <p className="text-[#1A1A1A]/18 text-[10px] shrink-0">{allCards.length} suggestions</p>
            )}
          </div>
        )}

        {/* Flat accumulating card grid — new cards animate in from right */}
        {loading && allCards.length === 0 ? (
          /* First-load skeleton */
          <div className="flex flex-wrap justify-center gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="w-[calc(50%-6px)] sm:w-[calc(33.333%-8px)] lg:w-[calc(25%-9px)]">
                <SkeletonCard/>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-3">
            {allCards.map((card) => {
              const isNew = newCardIds.has(card.id)
              // Stagger new cards by their position within the incoming batch
              const batchIndex = isNew
                ? Array.from(newCardIds).indexOf(card.id)
                : -1
              return (
                <NewCardWrapper
                  key={card.id}
                  isNew={isNew}
                  staggerMs={batchIndex >= 0 ? batchIndex * 45 : 0}
                >
                  <ActivityCard
                    card={card}
                    destination={destination}
                    picked={!!picked.find(p => p.id === card.id)}
                    onExpand={setExpandedCard}
                  />
                </NewCardWrapper>
              )
            })}
            {latestAccomm && (
              <div className="w-full mt-1">
                <AccommodationCard acc={latestAccomm} budget={onboarding?.budget_per_day}/>
              </div>
            )}
          </div>
        )}

        {/* Skeleton row appended below existing cards while fetching more */}
        {loading && allCards.length > 0 && (
          <div className="flex flex-wrap justify-center gap-3 mt-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="w-[calc(50%-6px)] sm:w-[calc(33.333%-8px)] lg:w-[calc(25%-9px)]">
                <SkeletonCard/>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Bottom bar ───────────────────────────────────────────────────────── */}
      {(allCards.length > 0 || loading) && (
        <div className="fixed bottom-0 inset-x-0 z-20">
          <div className="bg-[#FAF8F5]/95 backdrop-blur border-t border-[#E8E0D6]">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
              <p className="text-[#1A1A1A]/28 text-xs hidden sm:block flex-1">
                {picked.length === 0
                  ? 'Tap a card to see details and add it to your trip'
                  : picked.length === 1
                  ? '1 activity — pick at least one more to build'
                  : `${picked.length} activities selected`}
              </p>
              <div className="flex gap-3 flex-1 sm:flex-none sm:ml-auto">
                <button
                  onClick={handleSuggestMore}
                  disabled={loading}
                  className="flex-1 sm:flex-none sm:px-6 py-3 rounded-full border border-white/14 text-[#6b5f54] text-sm font-medium hover:border-white/28 hover:text-[#3A3430] transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {loading
                    ? <><svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Loading…</>
                    : 'Suggest more ↺'
                  }
                </button>
                {picked.length >= 2 && (
                  <button onClick={() => setBuildOpen(true)}
                    className="flex-1 sm:flex-none sm:px-6 py-3 rounded-full bg-[#C97552] text-white text-sm font-bold hover:bg-[#b86644] transition-colors">
                    Build itinerary →
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Card detail sheet ─────────────────────────────────────────────── */}
      {expandedCard && (
        <CardDetailSheet
          card={expandedCard}
          destination={destination}
          isPicked={!!picked.find(p => p.id === expandedCard.id)}
          onPick={() => togglePick(expandedCard)}
          onClose={() => setExpandedCard(null)}
        />
      )}

      {/* ── Build modal ───────────────────────────────────────────────────── */}
      {buildOpen && (
        <BuildModal
          destination={destination}
          country={country}
          picked={picked}
          accommodation={latestAccomm}
          onboarding={onboarding}
          onClose={() => setBuildOpen(false)}
          router={router}
        />
      )}
    </div>
  )
}
