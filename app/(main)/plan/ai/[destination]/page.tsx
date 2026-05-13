'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'
import type { PlanActivityCard, PlanAccommodation } from '@/app/api/plan/suggest/route'
import type { ItineraryResult } from '@/app/api/itinerary/route'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoundGroup {
  round:          number
  cards:          PlanActivityCard[]
  accommodation?: PlanAccommodation
}

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

function getCategoryMeta(category: string): { colour: string; border: string; bg: string } {
  if (category.includes('Beach'))   return { colour: 'text-sky-400',    border: 'border-t-sky-400/60',    bg: 'bg-sky-400/5'    }
  if (category.includes('Art'))     return { colour: 'text-violet-400', border: 'border-t-violet-400/60', bg: 'bg-violet-400/5' }
  if (category.includes('Food'))    return { colour: 'text-orange-400', border: 'border-t-orange-400/60', bg: 'bg-orange-400/5' }
  if (category.includes('Nature'))  return { colour: 'text-emerald-400',border: 'border-t-emerald-400/60',bg: 'bg-emerald-400/5'}
  if (category.includes('Night'))   return { colour: 'text-indigo-400', border: 'border-t-indigo-400/60', bg: 'bg-indigo-400/5' }
  if (category.includes('History')) return { colour: 'text-yellow-400', border: 'border-t-yellow-400/60', bg: 'bg-yellow-400/5' }
  if (category.includes('Shop'))    return { colour: 'text-pink-400',   border: 'border-t-pink-400/60',   bg: 'bg-pink-400/5'   }
  if (category.includes('Exp'))     return { colour: 'text-teal-400',   border: 'border-t-teal-400/60',   bg: 'bg-teal-400/5'   }
  if (category.includes('Active'))  return { colour: 'text-lime-400',   border: 'border-t-lime-400/60',   bg: 'bg-lime-400/5'   }
  if (category.includes('Cafe'))    return { colour: 'text-amber-400',  border: 'border-t-amber-400/60',  bg: 'bg-amber-400/5'  }
  if (category.includes('Street') || category.includes('Walk'))
                                    return { colour: 'text-cyan-400',   border: 'border-t-cyan-400/60',   bg: 'bg-cyan-400/5'   }
  return                                   { colour: 'text-white/50',   border: 'border-t-white/20',      bg: 'bg-white/3'      }
}

// ─── Price badge ──────────────────────────────────────────────────────────────

function PriceBadge({ price }: { price: string }) {
  if (price === 'Free') return <span className="text-xs font-medium text-emerald-400">Free</span>
  return <span className="text-xs text-white/40 font-medium">{price}</span>
}

// ─── Activity card ────────────────────────────────────────────────────────────

function ActivityCard({
  card,
  picked,
  onToggle,
}: {
  card:     PlanActivityCard
  picked:   boolean
  onToggle: (card: PlanActivityCard) => void
}) {
  const meta = getCategoryMeta(card.category)

  return (
    <button
      onClick={() => onToggle(card)}
      className={`
        group relative w-full text-left rounded-2xl border-t-2 transition-all duration-200 overflow-hidden
        ${picked
          ? `border-t-[#C97552] bg-[#C97552]/8 border border-[#C97552]/30 border-t-2`
          : `${meta.border} bg-white/[0.04] border border-white/10 hover:bg-white/[0.07] hover:border-white/18`
        }
      `}
    >
      {/* Picked overlay tick */}
      {picked && (
        <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[#C97552] flex items-center justify-center shadow-md">
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
          </svg>
        </div>
      )}

      <div className="p-4">
        {/* Category chip */}
        <div className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider mb-2.5 ${picked ? 'text-[#C97552]' : meta.colour}`}>
          {card.category}
        </div>

        {/* Name */}
        <h3 className={`font-semibold text-sm leading-snug mb-1 pr-5 transition-colors ${picked ? 'text-white' : 'text-white/90 group-hover:text-white'}`}>
          {card.name}
        </h3>

        {/* Tagline */}
        <p className="text-white/40 text-xs mb-2.5 leading-relaxed">{card.tagline}</p>

        {/* Why */}
        <p className="text-white/65 text-xs leading-relaxed mb-3 line-clamp-3">{card.why}</p>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2.5 border-t border-white/8">
          <div className="flex items-center gap-2">
            <PriceBadge price={card.price} />
            <span className="text-white/20 text-xs">·</span>
            <span className="text-white/40 text-xs">{card.duration}</span>
          </div>
          <div className="flex items-center gap-1">
            <svg className="w-2.5 h-2.5 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
            </svg>
            <span className="text-white/30 text-[10px]">{card.neighbourhood}</span>
          </div>
        </div>

        {card.related_to && (
          <div className="mt-2 flex items-center gap-1">
            <span className="text-[#C97552]/70 text-[10px]">↳ {card.related_to}</span>
          </div>
        )}
      </div>
    </button>
  )
}

// ─── Accommodation card ────────────────────────────────────────────────────────

function AccommodationCard({ acc, budget }: { acc: PlanAccommodation; budget?: string }) {
  const BUDGET_LABELS: Record<string, string> = {
    'under-20': 'budget',
    '20-50':    'budget-friendly',
    '50-150':   'mid-range',
    '150-300':  'comfortable',
    '300+':     'luxury',
  }
  const budgetLabel = BUDGET_LABELS[budget ?? ''] ?? 'mid-range'

  return (
    <div className="col-span-full rounded-2xl border-t-2 border-t-blue-400/50 bg-blue-500/5 border border-blue-500/15 p-5">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center shrink-0">
          <span className="text-lg">🏨</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-400 mb-1">
            Where to stay · {budgetLabel} budget
          </p>
          <p className="text-white font-semibold text-sm mb-1">{acc.neighbourhood}</p>
          <p className="text-white/55 text-xs leading-relaxed">{acc.why}</p>
          <p className="text-white/35 text-xs mt-2">{acc.price_range} / night</p>
        </div>
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-2xl border-t-2 border-t-white/10 bg-white/[0.04] border border-white/10 p-4 animate-pulse">
      <div className="h-2.5 w-20 bg-white/10 rounded-full mb-3"/>
      <div className="h-4 w-3/4 bg-white/10 rounded mb-2"/>
      <div className="h-2.5 w-1/2 bg-white/8 rounded mb-3"/>
      <div className="space-y-1.5 mb-3">
        <div className="h-2.5 w-full bg-white/8 rounded"/>
        <div className="h-2.5 w-5/6 bg-white/8 rounded"/>
        <div className="h-2.5 w-4/6 bg-white/8 rounded"/>
      </div>
      <div className="flex justify-between pt-2.5 border-t border-white/8">
        <div className="h-2.5 w-16 bg-white/8 rounded"/>
        <div className="h-2.5 w-20 bg-white/8 rounded"/>
      </div>
    </div>
  )
}

// ─── Build modal ──────────────────────────────────────────────────────────────

function BuildModal({
  destination,
  country,
  picked,
  accommodation,
  onboarding,
  onClose,
  onDone,
  router,
}: {
  destination:    string
  country:        string
  picked:         PlanActivityCard[]
  accommodation?: PlanAccommodation
  onboarding:     OnboardingProfile | null
  onClose:        () => void
  onDone:         (shareToken: string | null) => void
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
        destination,
        country,
        days,
        start_date: startDate,
        user_profile: {
          budget_per_day:      onboarding?.budget_per_day      ?? '50-150',
          group_type:          onboarding?.group_type           ?? 'couple',
          interests:           onboarding?.interests            ?? [],
          dietary_preferences: dietary.filter(d => d !== 'none'),
          home_city:           onboarding?.home_city            ?? '',
          home_country:        onboarding?.home_country         ?? '',
        },
        must_do:      pickedNames,
        trip_context: [
          `The traveler selected these specific activities through AI planning: ${pickedNames}.`,
          `Build the entire itinerary around these — they are non-negotiable.`,
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

      const itinRes = await fetch('/api/itinerary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(itinBody) })
      if (!itinRes.ok) throw new Error('Failed')
      const result: ItineraryResult = await itinRes.json()

      const supabase = getSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: trip, error: tripErr } = await supabase.from('trips').insert({
        user_id:    user.id,
        trip_name:  `${destination} — AI Planned`,
        status:     'planning',
        total_days: days,
        start_date: startDate,
        end_date:   result.end_date,
        trip_pace:  pace,
      }).select().single()

      if (tripErr || !trip) throw new Error('Save failed')

      await supabase.from('trip_destinations').insert({
        trip_id:          trip.id,
        destination_name: destination,
        country,
        position:         1,
        days,
        start_date:       startDate,
        end_date:         result.end_date,
        itinerary_json:   result.itinerary.map(({ day, title, morning, afternoon, evening, day_total_estimate }) =>
                            ({ day, title, morning, afternoon, evening, day_total_estimate })),
        notes: JSON.stringify({ must_do: pickedNames, ai_picks: picked, accommodation: accommodation ?? null }),
      })

      setDone(trip.share_token ?? trip.id)
      onDone(trip.share_token ?? null)
    } catch (err) {
      console.error('[Build]', err)
      setError('Something went wrong — please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4">
      <div className="absolute inset-0 bg-[#0d1f35]/80 backdrop-blur-sm" onClick={!done ? onClose : undefined}/>
      <div className="relative w-full max-w-md bg-[#0d1f35] rounded-t-3xl sm:rounded-3xl border border-white/12 p-6 shadow-2xl max-h-[92vh] overflow-y-auto">

        {done ? (
          /* ── Success ── */
          <div className="text-center py-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <h3 className="text-white font-semibold text-xl mb-1">Itinerary ready</h3>
            <p className="text-white/40 text-sm mb-8">Your {destination} trip has been saved.</p>
            <button
              onClick={() => router.push(`/trip/${done}`)}
              className="w-full py-4 rounded-full bg-[#C97552] text-white font-bold text-sm hover:bg-[#b86644] transition-colors mb-3"
            >
              View my itinerary →
            </button>
            <button
              onClick={() => router.push('/trips')}
              className="w-full py-3 rounded-full border border-white/12 text-white/50 text-sm hover:border-white/25 hover:text-white/70 transition-all"
            >
              All my trips
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-white font-bold text-lg">Build itinerary</h2>
                <p className="text-white/40 text-sm mt-0.5">{picked.length} activities · {destination}</p>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-white/50 hover:bg-white/15 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Picks */}
            <div className="flex flex-wrap gap-1.5 mb-5 p-3 bg-white/3 border border-white/8 rounded-xl">
              {picked.slice(0, 5).map(p => (
                <span key={p.id} className="text-xs px-2.5 py-1 rounded-full bg-[#C97552]/15 text-[#C97552] border border-[#C97552]/25">{p.name}</span>
              ))}
              {picked.length > 5 && <span className="text-xs px-2.5 py-1 rounded-full bg-white/8 text-white/40">+{picked.length - 5} more</span>}
            </div>

            {/* Date */}
            <div className="mb-4">
              <label className="block text-white/50 text-xs font-medium mb-1.5 uppercase tracking-wide">When are you going?</label>
              <input type="date" value={startDate} min={today} onChange={e => setStartDate(e.target.value)}
                className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#C97552]/50 transition-colors"/>
            </div>

            {/* Nights */}
            <div className="mb-4">
              <label className="block text-white/50 text-xs font-medium mb-1.5 uppercase tracking-wide">How many nights?</label>
              <div className="flex items-center gap-4 bg-white/4 border border-white/10 rounded-xl px-4 py-3">
                <button onClick={() => setDays(d => Math.max(1, d - 1))} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors">−</button>
                <span className="text-white font-bold text-lg flex-1 text-center">{days} night{days !== 1 ? 's' : ''}</span>
                <button onClick={() => setDays(d => Math.min(14, d + 1))} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors">+</button>
              </div>
            </div>

            {/* Food preferences */}
            <div className="mb-4">
              <label className="block text-white/50 text-xs font-medium mb-1 uppercase tracking-wide">Food preferences</label>
              <p className="text-white/30 text-xs mb-2.5">We'll only suggest restaurants that work for you</p>
              <div className="flex flex-wrap gap-2">
                {DIETARY_OPTIONS.map(opt => {
                  const active = dietary.includes(opt.id) || (opt.id === 'none' && dietary.length === 0)
                  return (
                    <button key={opt.id} onClick={() => toggleDietary(opt.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${active ? 'bg-[#C97552]/15 border-[#C97552]/40 text-[#C97552]' : 'bg-white/4 border-white/12 text-white/45 hover:border-white/25'}`}>
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Pace */}
            <div className="mb-5">
              <label className="block text-white/50 text-xs font-medium mb-1.5 uppercase tracking-wide">Trip pace</label>
              <div className="flex gap-2">
                {([{ id: 'relaxed', label: '😌 Relaxed' }, { id: 'balanced', label: '⚖️ Balanced' }, { id: 'packed', label: '⚡ Packed' }] as const).map(({ id, label }) => (
                  <button key={id} onClick={() => setPace(id)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-colors ${pace === id ? 'bg-[#C97552] text-white' : 'bg-white/5 text-white/45 hover:bg-white/10 border border-white/10'}`}>
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
            <p className="text-white/25 text-xs text-center mt-3">Takes ~15 seconds · Saved to your trips</p>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Animated round group ─────────────────────────────────────────────────────
// Handles:
//   • Flex grid with justify-center so the last (incomplete) row is always centred
//   • Slide-out-left when isExiting = true
//   • Slide-in-from-right on first mount (entrance animation)

function RoundGroup({
  group, gi, destination, picked, onToggle, budget, isExiting, onEntered,
}: {
  group:       RoundGroup
  gi:          number
  destination: string
  picked:      PlanActivityCard[]
  onToggle:    (c: PlanActivityCard) => void
  budget?:     string
  isExiting:   boolean
  onEntered:   () => void
}) {
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    // Double-RAF ensures initial hidden state is painted before we start the transition
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setEntered(true)
        onEntered()
      })
    )
    return () => cancelAnimationFrame(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className={`transition-all duration-300 ease-in-out ${
        isExiting
          ? 'opacity-0 -translate-x-12 pointer-events-none'
          : entered
          ? 'opacity-100 translate-x-0'
          : 'opacity-0 translate-x-12'
      }`}
    >
      {/* Section label */}
      <div className="flex items-center gap-3 mb-4">
        <p className="text-white/30 text-xs uppercase tracking-widest font-medium shrink-0">
          {gi === 0 ? `Suggestions for ${destination}` : 'More picks'}
        </p>
        <div className="h-px flex-1 bg-white/8"/>
        <p className="text-white/20 text-xs shrink-0">{group.cards.length} activities</p>
      </div>

      {/* Flex grid — justify-center centres the last incomplete row */}
      <div className="flex flex-wrap justify-center gap-3">
        {group.cards.map(card => (
          <div
            key={card.id}
            className="w-[calc(50%-6px)] sm:w-[calc(33.333%-8px)] lg:w-[calc(25%-9px)]"
          >
            <ActivityCard
              card={card}
              picked={!!picked.find(p => p.id === card.id)}
              onToggle={onToggle}
            />
          </div>
        ))}
        {group.accommodation && (
          <div className="w-full">
            <AccommodationCard acc={group.accommodation} budget={budget}/>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function AIPlanPage() {
  const router       = useRouter()
  const params       = useParams()
  const searchParams = useSearchParams()

  const destination   = decodeURIComponent(params.destination as string)
  const country       = searchParams.get('country')  ?? ''
  const stateProvince = searchParams.get('state')    ?? undefined

  const [rounds,       setRounds]      = useState<RoundGroup[]>([])
  const [picked,       setPicked]      = useState<PlanActivityCard[]>([])
  const [loading,      setLoading]     = useState(false)
  const [buildOpen,    setBuildOpen]   = useState(false)
  const [onboarding,   setOnboarding]  = useState<OnboardingProfile | null>(null)
  const [latestAccomm, setLatestAccomm]= useState<PlanAccommodation | undefined>()
  // Animation: tracks which round is currently sliding out to the left
  const [exitingRound, setExitingRound]= useState<number | null>(null)
  // Animation: tracks which rounds have fully entered (for slide-in-from-right)
  const [enteredRounds,setEnteredRounds]= useState<Set<number>>(new Set())

  const roundsRef    = useRef<RoundGroup[]>([])
  const pickedRef    = useRef<PlanActivityCard[]>([])
  const onboardingRef= useRef<OnboardingProfile | null>(null)
  const bottomRef    = useRef<HTMLDivElement>(null)

  useEffect(() => { roundsRef.current    = rounds    }, [rounds])
  useEffect(() => { pickedRef.current    = picked    }, [picked])
  useEffect(() => { onboardingRef.current= onboarding}, [onboarding])

  // ── Load onboarding ──────────────────────────────────────────────────────────
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

  // ── Fetch round ──────────────────────────────────────────────────────────────
  const fetchRound = useCallback(async (roundNum: number) => {
    setLoading(true)
    try {
      const currentRounds    = roundsRef.current
      const currentPicked    = pickedRef.current
      const currentOnboarding= onboardingRef.current
      const seenNames        = currentRounds.flatMap(r => r.cards.map(c => c.name))

      const res = await fetch('/api/plan/suggest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination, country, state_province: stateProvince, picked: currentPicked, seen_names: seenNames, round: roundNum, onboarding: currentOnboarding }),
      })
      if (!res.ok) throw new Error('Suggest failed')
      const data = await res.json()

      setRounds(prev => {
        const updated = [...prev, { round: roundNum, cards: data.cards ?? [], accommodation: data.accommodation }]
        roundsRef.current = updated
        return updated
      })
      if (data.accommodation) setLatestAccomm(data.accommodation)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 150)
    } catch (err) {
      console.error('[AIPlan]', err)
    } finally {
      setLoading(false)
    }
  }, [destination, country, stateProvince])

  const roundFired = useRef(false)
  useEffect(() => {
    if (roundFired.current || !destination || !country) return
    roundFired.current = true
    fetchRound(1)
  }, [destination, country, fetchRound])

  // Trigger exit animation then fetch — called when user taps "Suggest more"
  function handleSuggestMore() {
    const lastRound = roundsRef.current[roundsRef.current.length - 1]?.round
    if (lastRound !== undefined) {
      setExitingRound(lastRound)
      // After exit animation completes, hide that round and fetch next
      setTimeout(() => {
        setExitingRound(null)
        fetchRound(roundsRef.current.length + 1)
      }, 320)
    } else {
      fetchRound(1)
    }
  }

  function togglePick(card: PlanActivityCard) {
    setPicked(prev => {
      const updated = prev.find(p => p.id === card.id) ? prev.filter(p => p.id !== card.id) : [...prev, card]
      pickedRef.current = updated
      return updated
    })
  }

  const nextRound = rounds.length + 1

  return (
    <div className="min-h-screen bg-[#0d1f35] pb-36">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-[#0d1f35]/95 backdrop-blur border-b border-white/8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <button onClick={() => router.back()}
            className="w-9 h-9 rounded-full bg-white/6 flex items-center justify-center text-white/60 hover:bg-white/12 transition-colors shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
          </button>

          <div className="flex-1 min-w-0">
            <p className="text-white/35 text-[10px] uppercase tracking-widest font-medium mb-0.5">AI Trip Planner</p>
            <h1 className="text-white font-semibold text-base leading-tight truncate">
              {destination}
              {country && <span className="text-white/40 font-normal">, {country}</span>}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {picked.length > 0 && (
              <span className="text-xs text-white/50 hidden sm:block">
                {picked.length} selected
              </span>
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

      {/* ── Picked chips ────────────────────────────────────────────────────── */}
      {picked.length > 0 && (
        <div className="border-b border-white/8 bg-[#0d1f35]">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2.5">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
              {picked.map(p => (
                <button key={p.id} onClick={() => togglePick(p)}
                  className="flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-full bg-[#C97552]/12 border border-[#C97552]/30 text-[#C97552] text-xs font-medium hover:bg-[#C97552]/20 transition-colors">
                  {p.name}
                  <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 space-y-8">

        {/* Intro line on first load */}
        {rounds.length === 0 && !loading && (
          <div className="text-center py-20">
            <p className="text-white/20 text-sm">Loading suggestions for {destination}…</p>
          </div>
        )}

        {rounds.map((group, gi) => {
          const isExiting = exitingRound === group.round
          const isEntered = enteredRounds.has(group.round)

          return (
            <RoundGroup
              key={group.round}
              group={group}
              gi={gi}
              destination={destination}
              picked={picked}
              onToggle={togglePick}
              budget={onboarding?.budget_per_day}
              isExiting={isExiting}
              onEntered={() => setEnteredRounds(prev => new Set(prev).add(group.round))}
            />
          )
        })}

        {/* Loading skeleton */}
        {loading && (
          <div className="animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <p className="text-white/20 text-xs uppercase tracking-widest font-medium shrink-0 animate-pulse">Finding more…</p>
              <div className="h-px flex-1 bg-white/8"/>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="w-[calc(50%-6px)] sm:w-[calc(33.333%-8px)] lg:w-[calc(25%-9px)]">
                  <SkeletonCard/>
                </div>
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef}/>
      </div>

      {/* ── Bottom bar ───────────────────────────────────────────────────────── */}
      {(rounds.length > 0 || loading) && (
        <div className="fixed bottom-0 inset-x-0 z-20">
          <div className="bg-[#0d1f35]/95 backdrop-blur border-t border-white/10">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">

              {/* Context text */}
              <p className="text-white/30 text-xs hidden sm:block flex-1">
                {picked.length === 0
                  ? 'Tap any card to add it to your trip'
                  : picked.length === 1
                  ? '1 activity selected — pick at least one more to build'
                  : `${picked.length} activities selected`}
              </p>

              <div className="flex gap-3 flex-1 sm:flex-none sm:ml-auto">
                <button
                  onClick={() => !loading && handleSuggestMore()}
                  disabled={loading}
                  className="flex-1 sm:flex-none sm:px-6 py-3 rounded-full border border-white/15 text-white/55 text-sm font-medium hover:border-white/30 hover:text-white/80 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {loading
                    ? <><svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Finding more…</>
                    : 'Suggest more ↺'}
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

      {/* ── Build modal ──────────────────────────────────────────────────────── */}
      {buildOpen && (
        <BuildModal
          destination={destination}
          country={country}
          picked={picked}
          accommodation={latestAccomm}
          onboarding={onboarding}
          onClose={() => setBuildOpen(false)}
          onDone={() => {}}
          router={router}
        />
      )}
    </div>
  )
}
