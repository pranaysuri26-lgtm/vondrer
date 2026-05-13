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

// ─── Dietary options ──────────────────────────────────────────────────────────

const DIETARY_OPTIONS = [
  { id: 'none',         label: '🍽️ No restrictions' },
  { id: 'vegetarian',   label: '🌿 Vegetarian'       },
  { id: 'vegan',        label: '🌱 Vegan'            },
  { id: 'halal',        label: '🌙 Halal'            },
  { id: 'no_pork',      label: '🚫 No pork'          },
  { id: 'no_beef',      label: '🐄 No beef'          },
  { id: 'gluten_free',  label: '🌾 Gluten-free'      },
]

// ─── Category colour map ──────────────────────────────────────────────────────

function categoryColour(category: string): string {
  if (category.includes('Beach'))    return 'text-sky-400'
  if (category.includes('Art'))      return 'text-purple-400'
  if (category.includes('Food'))     return 'text-orange-400'
  if (category.includes('Nature'))   return 'text-green-400'
  if (category.includes('Night'))    return 'text-indigo-400'
  if (category.includes('History'))  return 'text-yellow-500'
  if (category.includes('Shop'))     return 'text-pink-400'
  if (category.includes('Active'))   return 'text-lime-400'
  if (category.includes('Cafe'))     return 'text-amber-400'
  if (category.includes('Walk'))     return 'text-teal-400'
  if (category.includes('Street'))   return 'text-teal-400'
  return 'text-white/60'
}

// ─── Price badge ──────────────────────────────────────────────────────────────

function PriceBadge({ price }: { price: string }) {
  const base = 'text-xs font-medium px-2 py-0.5 rounded-full'
  if (price === 'Free') return <span className={`${base} bg-green-900/60 text-green-300`}>Free</span>
  if (price === '$')    return <span className={`${base} bg-white/10 text-white/60`}>$</span>
  if (price === '$$')   return <span className={`${base} bg-white/10 text-white/60`}>$$</span>
  return                       <span className={`${base} bg-white/10 text-white/60`}>$$$</span>
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
  return (
    <button
      onClick={() => onToggle(card)}
      className={`
        relative w-full text-left rounded-2xl p-4 transition-all duration-200 border
        ${picked
          ? 'bg-[#C97552]/20 border-[#C97552] shadow-[0_0_0_1px_#C97552]'
          : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
        }
      `}
    >
      {/* Pick checkmark */}
      {picked && (
        <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[#C97552] flex items-center justify-center">
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
          </svg>
        </div>
      )}

      {/* Category */}
      <div className={`text-xs font-medium mb-2 ${categoryColour(card.category)}`}>
        {card.category}
      </div>

      {/* Name */}
      <div className="font-semibold text-white text-sm leading-tight mb-1 pr-6">
        {card.name}
      </div>

      {/* Tagline */}
      <div className="text-white/50 text-xs mb-2.5">{card.tagline}</div>

      {/* Why */}
      <p className="text-white/70 text-xs leading-relaxed mb-3 line-clamp-3">{card.why}</p>

      {/* Meta row */}
      <div className="flex items-center gap-2 flex-wrap">
        <PriceBadge price={card.price} />
        <span className="text-white/40 text-xs">·</span>
        <span className="text-white/50 text-xs">{card.duration}</span>
        {card.related_to && (
          <>
            <span className="text-white/40 text-xs">·</span>
            <span className="text-[#C97552] text-xs">{card.related_to}</span>
          </>
        )}
      </div>

      {/* Neighbourhood */}
      <div className="mt-2 flex items-center gap-1">
        <svg className="w-3 h-3 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
        </svg>
        <span className="text-white/35 text-xs">{card.neighbourhood}</span>
      </div>
    </button>
  )
}

// ─── Accommodation suggestion card ────────────────────────────────────────────

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
    <div className="col-span-full rounded-2xl p-4 bg-[#1a2744] border border-blue-500/20">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-xl">🏨</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-blue-400 font-medium mb-0.5">
            Best area to stay — based on your picks & {budgetLabel} budget
          </div>
          <div className="text-white font-semibold text-sm mb-1">{acc.neighbourhood}</div>
          <p className="text-white/60 text-xs leading-relaxed">{acc.why}</p>
          <div className="mt-2 text-white/50 text-xs">{acc.price_range} / night</div>
        </div>
      </div>
    </div>
  )
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-2xl p-4 bg-white/5 border border-white/10 animate-pulse">
      <div className="h-3 w-16 bg-white/10 rounded mb-3"/>
      <div className="h-4 w-3/4 bg-white/10 rounded mb-2"/>
      <div className="h-3 w-1/2 bg-white/10 rounded mb-3"/>
      <div className="h-3 w-full bg-white/10 rounded mb-1"/>
      <div className="h-3 w-4/5 bg-white/10 rounded mb-4"/>
      <div className="flex gap-2">
        <div className="h-4 w-10 bg-white/10 rounded-full"/>
        <div className="h-4 w-16 bg-white/10 rounded-full"/>
      </div>
    </div>
  )
}

// ─── Build Itinerary modal ─────────────────────────────────────────────────────

function BuildModal({
  destination,
  country,
  picked,
  accommodation,
  onboarding,
  onClose,
  onDone,
}: {
  destination:    string
  country:        string
  picked:         PlanActivityCard[]
  accommodation?: PlanAccommodation
  onboarding:     OnboardingProfile | null
  onClose:        () => void
  onDone:         (tripId: string) => void
}) {
  const today    = new Date().toISOString().split('T')[0]
  const [startDate, setStartDate]   = useState(today)
  const [days,      setDays]        = useState(5)
  const [pace,      setPace]        = useState<'relaxed'|'balanced'|'packed'>('balanced')
  const [dietary,   setDietary]     = useState<string[]>(() => {
    // Pre-fill from onboarding profile
    return onboarding?.dietary_preferences ?? []
  })
  const [loading,   setLoading]     = useState(false)
  const [error,     setError]       = useState('')

  function toggleDietary(id: string) {
    if (id === 'none') {
      setDietary(['none'])
      return
    }
    setDietary(prev => {
      const without = prev.filter(d => d !== 'none')
      return without.includes(id) ? without.filter(d => d !== id) : [...without, id]
    })
  }

  async function handleBuild() {
    if (!startDate) { setError('Please pick a start date'); return }
    setLoading(true)
    setError('')

    try {
      const pickedNames  = picked.map(p => p.name).join(', ')
      const clusterAreas = [...new Set(picked.map(p => p.neighbourhood))].join(', ')
      const dietaryStr   = dietary.filter(d => d !== 'none').join(', ')

      // Build dietary instructions for itinerary
      const dietaryNote = dietaryStr
        ? `Dietary requirements: ${dietaryStr}. Every restaurant suggestion MUST satisfy these requirements — no exceptions.`
        : ''

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
          `The traveler selected these activities through an AI planning session: ${pickedNames}.`,
          `Build the itinerary around these selections — they are non-negotiable.`,
          `Fill remaining time slots with complementary activities near ${clusterAreas}.`,
          accommodation
            ? `Accommodation is in ${accommodation.neighbourhood} — keep activities reachable from there.`
            : '',
          dietaryNote,
          onboarding?.home_country
            ? `The traveler is from ${onboarding.home_country}${onboarding.home_city ? ` (${onboarding.home_city})` : ''} — factor this into cuisine and restaurant choices. Do not suggest food they would find unfamiliar or uncomfortable.`
            : '',
        ].filter(Boolean).join(' '),
        trip_pace:       pace,
        searching_hotel: !accommodation,
      }

      const itinRes = await fetch('/api/itinerary', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(itinBody),
      })
      if (!itinRes.ok) throw new Error('Itinerary generation failed')
      const result: ItineraryResult = await itinRes.json()

      // ── Save to Supabase ──────────────────────────────────────────────────────
      const supabase = getSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: trip, error: tripErr } = await supabase
        .from('trips')
        .insert({
          user_id:    user.id,
          trip_name:  `${destination} — AI Planned`,
          status:     'planning',
          total_days: days,
          start_date: startDate,
          end_date:   result.end_date,
          trip_pace:  pace,
        })
        .select()
        .single()

      if (tripErr || !trip) throw new Error('Failed to save trip')

      const itinerary_json = result.itinerary.map(
        ({ day, title, morning, afternoon, evening, day_total_estimate }) =>
          ({ day, title, morning, afternoon, evening, day_total_estimate })
      )

      await supabase.from('trip_destinations').insert({
        trip_id:          trip.id,
        destination_name: destination,
        country,
        position:         1,
        days,
        start_date:       startDate,
        end_date:         result.end_date,
        itinerary_json,
        notes: JSON.stringify({
          must_do:       pickedNames,
          ai_picks:      picked.map(p => ({ name: p.name, neighbourhood: p.neighbourhood })),
          accommodation: accommodation ?? null,
        }),
      })

      onDone(trip.id)
    } catch (err) {
      console.error('[Build]', err)
      setError('Something went wrong — please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-0 sm:pb-0">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose}/>

      {/* Sheet */}
      <div className="relative w-full max-w-md bg-[#1C1C1E] rounded-t-3xl sm:rounded-3xl border border-white/10 p-6 shadow-2xl max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-white font-bold text-lg">Build your itinerary</h2>
            <p className="text-white/50 text-sm mt-0.5">{picked.length} activities · {destination}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:bg-white/20 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Picks summary */}
        <div className="flex flex-wrap gap-1.5 mb-5">
          {picked.slice(0, 5).map(p => (
            <span key={p.id} className="text-xs px-2.5 py-1 rounded-full bg-[#C97552]/20 text-[#C97552] border border-[#C97552]/30">
              {p.name}
            </span>
          ))}
          {picked.length > 5 && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-white/50">
              +{picked.length - 5} more
            </span>
          )}
        </div>

        {/* Date */}
        <div className="mb-4">
          <label className="block text-white/60 text-xs font-medium mb-2 uppercase tracking-wide">When are you going?</label>
          <input
            type="date"
            value={startDate}
            min={today}
            onChange={e => setStartDate(e.target.value)}
            className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#C97552]/60 transition-colors"
          />
        </div>

        {/* Days */}
        <div className="mb-4">
          <label className="block text-white/60 text-xs font-medium mb-2 uppercase tracking-wide">How many nights?</label>
          <div className="flex items-center gap-4 bg-white/5 rounded-xl px-4 py-3 border border-white/10">
            <button
              onClick={() => setDays(d => Math.max(1, d - 1))}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white text-base hover:bg-white/20 transition-colors"
            >−</button>
            <span className="text-white font-bold text-lg flex-1 text-center">{days} night{days !== 1 ? 's' : ''}</span>
            <button
              onClick={() => setDays(d => Math.min(14, d + 1))}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white text-base hover:bg-white/20 transition-colors"
            >+</button>
          </div>
        </div>

        {/* Food preferences — key differentiator */}
        <div className="mb-4">
          <label className="block text-white/60 text-xs font-medium mb-1 uppercase tracking-wide">
            Food preferences
          </label>
          <p className="text-white/35 text-xs mb-2.5">
            We'll only suggest restaurants that work for you
          </p>
          <div className="flex flex-wrap gap-2">
            {DIETARY_OPTIONS.map(opt => {
              const active = dietary.includes(opt.id) || (opt.id === 'none' && dietary.length === 0)
              return (
                <button
                  key={opt.id}
                  onClick={() => toggleDietary(opt.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                    active
                      ? 'bg-[#C97552]/20 border-[#C97552]/60 text-[#C97552]'
                      : 'bg-white/5 border-white/15 text-white/50 hover:border-white/30'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Pace */}
        <div className="mb-5">
          <label className="block text-white/60 text-xs font-medium mb-2 uppercase tracking-wide">Trip pace</label>
          <div className="flex gap-2">
            {([
              { id: 'relaxed',  label: '😌 Relaxed' },
              { id: 'balanced', label: '⚖️ Balanced' },
              { id: 'packed',   label: '⚡ Packed' },
            ] as const).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setPace(id)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                  pace === id
                    ? 'bg-[#C97552] text-white'
                    : 'bg-white/5 text-white/50 hover:bg-white/10'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-red-400 text-sm mb-4">{error}</p>
        )}

        <button
          onClick={handleBuild}
          disabled={loading}
          className="w-full py-4 rounded-full bg-[#C97552] text-white font-bold text-sm disabled:opacity-60 disabled:cursor-not-allowed hover:bg-[#b86644] transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Generating your itinerary…
            </>
          ) : (
            'Generate my itinerary →'
          )}
        </button>

        <p className="text-white/30 text-xs text-center mt-3">
          Takes ~15 seconds · Saved to your trips automatically
        </p>
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
  const [doneMsg,      setDoneMsg]     = useState('')

  // Use refs so fetchRound never has stale closure over rounds/picked/onboarding
  const roundsRef    = useRef<RoundGroup[]>([])
  const pickedRef    = useRef<PlanActivityCard[]>([])
  const onboardingRef= useRef<OnboardingProfile | null>(null)
  const bottomRef    = useRef<HTMLDivElement>(null)

  // Keep refs in sync
  useEffect(() => { roundsRef.current  = rounds  }, [rounds])
  useEffect(() => { pickedRef.current  = picked  }, [picked])
  useEffect(() => { onboardingRef.current = onboarding }, [onboarding])

  // ── Load onboarding profile ──────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const supabase = getSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('onboarding_responses')
        .select('home_city, home_country, budget_per_day, group_type, interests, dietary_preferences')
        .eq('user_id', user.id)
        .single()
      if (data) setOnboarding(data)
    }
    load()
  }, [])

  // ── Fetch round — reads from refs to avoid stale closures ───────────────────
  const fetchRound = useCallback(async (roundNum: number) => {
    setLoading(true)
    try {
      const currentRounds   = roundsRef.current
      const currentPicked   = pickedRef.current
      const currentOnboarding = onboardingRef.current
      const seenNames       = currentRounds.flatMap(r => r.cards.map(c => c.name))

      const res = await fetch('/api/plan/suggest', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination,
          country,
          state_province: stateProvince,
          picked:         currentPicked,
          seen_names:     seenNames,
          round:          roundNum,
          onboarding:     currentOnboarding,
        }),
      })
      if (!res.ok) throw new Error('Suggest failed')
      const data = await res.json()

      setRounds(prev => {
        const updated = [...prev, { round: roundNum, cards: data.cards ?? [], accommodation: data.accommodation }]
        roundsRef.current = updated
        return updated
      })
      if (data.accommodation) setLatestAccomm(data.accommodation)

      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
      }, 150)
    } catch (err) {
      console.error('[AIPlan fetch]', err)
    } finally {
      setLoading(false)
    }
  }, [destination, country, stateProvince])

  // ── Fire first round on mount ────────────────────────────────────────────────
  const roundFired = useRef(false)
  useEffect(() => {
    if (roundFired.current || !destination || !country) return
    roundFired.current = true
    fetchRound(1)
  }, [destination, country, fetchRound])

  // ── Toggle pick ──────────────────────────────────────────────────────────────
  function togglePick(card: PlanActivityCard) {
    setPicked(prev => {
      const updated = prev.find(p => p.id === card.id)
        ? prev.filter(p => p.id !== card.id)
        : [...prev, card]
      pickedRef.current = updated
      return updated
    })
  }

  // ── After trip built ─────────────────────────────────────────────────────────
  function handleTripDone(_tripId: string) {
    setBuildOpen(false)
    setDoneMsg('Trip saved!')
    setTimeout(() => router.push('/trips'), 1200)
  }

  const nextRound = rounds.length + 1

  return (
    <div className="min-h-screen bg-[#111111] pb-36">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-[#111111]/90 backdrop-blur border-b border-white/8">
        <div className="px-4 sm:px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center text-white/70 hover:bg-white/15 transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-bold text-base leading-tight">
              Planning {destination}
            </h1>
            <p className="text-white/40 text-xs mt-0.5">
              {picked.length > 0
                ? `${picked.length} activit${picked.length === 1 ? 'y' : 'ies'} selected — tap Build when ready`
                : 'Tap cards to build your trip'}
            </p>
          </div>
          {picked.length >= 2 && (
            <button
              onClick={() => setBuildOpen(true)}
              className="shrink-0 px-4 py-2 bg-[#C97552] text-white text-sm font-semibold rounded-full hover:bg-[#b86644] transition-colors"
            >
              Build →
            </button>
          )}
        </div>
      </div>

      {/* ── Picked chips bar ────────────────────────────────────────────────── */}
      {picked.length > 0 && (
        <div className="border-b border-white/8 bg-[#111111]">
          <div className="px-4 sm:px-6 py-3">
            <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
              {picked.map(p => (
                <button
                  key={p.id}
                  onClick={() => togglePick(p)}
                  className="flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-full bg-[#C97552]/20 border border-[#C97552]/40 text-[#C97552] text-xs font-medium hover:bg-[#C97552]/30 transition-colors"
                >
                  {p.name}
                  <svg className="w-3 h-3 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Cards area — full width responsive grid ──────────────────────────── */}
      <div className="px-4 sm:px-6 lg:px-8 pt-5 space-y-8">

        {rounds.map((group, gi) => (
          <div key={group.round}>
            {/* Round divider */}
            {gi > 0 && (
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-white/10"/>
                <span className="text-white/30 text-xs">More suggestions</span>
                <div className="h-px flex-1 bg-white/10"/>
              </div>
            )}

            {/* Responsive card grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {group.cards.map(card => (
                <ActivityCard
                  key={card.id}
                  card={card}
                  picked={!!picked.find(p => p.id === card.id)}
                  onToggle={togglePick}
                />
              ))}

              {/* Accommodation card — spans full row */}
              {group.accommodation && (
                <AccommodationCard
                  acc={group.accommodation}
                  budget={onboarding?.budget_per_day}
                />
              )}
            </div>
          </div>
        ))}

        {/* Loading skeleton */}
        {loading && (
          <div>
            {rounds.length > 0 && (
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-white/10"/>
                <span className="text-white/30 text-xs animate-pulse">Finding more…</span>
                <div className="h-px flex-1 bg-white/10"/>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i}/>)}
            </div>
          </div>
        )}

        {/* First load empty */}
        {rounds.length === 0 && !loading && (
          <div className="text-center py-24 text-white/30">
            <div className="text-5xl mb-4">✈️</div>
            <p className="text-sm">Loading suggestions for {destination}…</p>
          </div>
        )}

        <div ref={bottomRef}/>
      </div>

      {/* ── Bottom CTA bar ───────────────────────────────────────────────────── */}
      {(rounds.length > 0 || loading) && (
        <div className="fixed bottom-0 inset-x-0 z-20">
          <div className="bg-[#111111]/95 backdrop-blur border-t border-white/10">
            <div className="px-4 sm:px-6 py-4 flex gap-3 max-w-lg mx-auto">
              {/* Suggest more */}
              <button
                onClick={() => !loading && fetchRound(nextRound)}
                disabled={loading}
                className="flex-1 py-3.5 rounded-full border border-white/20 text-white/70 text-sm font-medium hover:border-white/40 hover:text-white transition-all disabled:opacity-40"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    Finding picks…
                  </span>
                ) : 'Suggest more ↺'}
              </button>

              {/* Build itinerary — unlocks at 2 picks */}
              {picked.length >= 2 && (
                <button
                  onClick={() => setBuildOpen(true)}
                  className="flex-1 py-3.5 rounded-full bg-[#C97552] text-white text-sm font-bold hover:bg-[#b86644] transition-colors"
                >
                  Build itinerary →
                </button>
              )}
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
          onDone={handleTripDone}
        />
      )}

      {/* ── Success toast ────────────────────────────────────────────────────── */}
      {doneMsg && (
        <div className="fixed top-20 inset-x-0 z-50 flex justify-center pointer-events-none">
          <div className="bg-green-500 text-white text-sm font-semibold px-6 py-3 rounded-full shadow-xl">
            ✓ {doneMsg} — Redirecting to your trips…
          </div>
        </div>
      )}
    </div>
  )
}
