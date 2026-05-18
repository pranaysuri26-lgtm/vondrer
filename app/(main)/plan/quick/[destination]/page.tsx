'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'
import type { ItineraryResult } from '@/app/api/itinerary/route'

const LOADING_STEPS = [
  { icon: '🔍', text: 'Researching the best neighborhoods…'       },
  { icon: '🗺️', text: 'Mapping out your days…'                   },
  { icon: '🌅', text: 'Finding the perfect morning spots…'        },
  { icon: '🍜', text: 'Picking restaurants you\'ll actually love…'},
  { icon: '🏛️', text: 'Adding cultural highlights…'               },
  { icon: '🌙', text: 'Planning your evenings…'                   },
  { icon: '💡', text: 'Adding insider tips…'                      },
  { icon: '✨', text: 'Putting it all together…'                  },
]

function GeneratingScreen({ destination }: { destination: string }) {
  const [stepIdx,   setStepIdx]   = useState(0)
  const [visible,   setVisible]   = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setStepIdx(i => (i + 1) % LOADING_STEPS.length)
        setVisible(true)
      }, 300)
    }, 2200)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  const step = LOADING_STEPS[stepIdx]

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col items-center justify-center px-4">
      {/* Animated map dots */}
      <div className="relative w-20 h-20 mb-8">
        <div className="absolute inset-0 rounded-full border-2 border-[#E8E0D6] animate-ping opacity-30" />
        <div className="absolute inset-2 rounded-full border-2 border-[#C97552]/30 animate-ping opacity-40" style={{ animationDelay: '0.4s' }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-3xl" style={{
            opacity:    visible ? 1 : 0,
            transform:  visible ? 'scale(1)' : 'scale(0.7)',
            transition: 'opacity 0.3s ease, transform 0.3s ease',
          }}>
            {step.icon}
          </span>
        </div>
      </div>

      <h2 className="font-serif italic text-2xl text-[#1A1A1A] mb-2">
        Building your {destination} trip
      </h2>

      <p
        className="text-[#6b5f54] text-sm text-center mb-10"
        style={{
          opacity:    visible ? 1 : 0,
          transform:  visible ? 'translateY(0)' : 'translateY(6px)',
          transition: 'opacity 0.3s ease, transform 0.3s ease',
        }}
      >
        {step.text}
      </p>

      {/* Progress dots */}
      <div className="flex gap-1.5">
        {LOADING_STEPS.map((_, i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-300"
            style={{
              width:      i === stepIdx ? '20px' : '6px',
              height:     '6px',
              background: i === stepIdx ? '#C97552' : '#E8E0D6',
            }}
          />
        ))}
      </div>

      <p className="text-[#B8B0A4] text-xs mt-8">Usually takes about 15 seconds</p>
    </div>
  )
}

interface Profile {
  home_city?:           string
  home_country?:        string
  budget_per_day?:      string
  group_type?:          string
  interests?:           string[]
  dietary_preferences?: string[]
}

const BUDGET_LABELS: Record<string, string> = {
  'under-20': 'Under $20/day', '20-50': '$20–50/day',
  '50-150': '$50–150/day', '150-300': '$150–300/day', '300+': '$300+/day',
}

const GROUP_LABELS: Record<string, string> = {
  solo: 'Solo', couple: 'Couple', family: 'Family', friends: 'With friends',
}


export default function QuickPlanPage() {
  const router       = useRouter()
  const params       = useParams()
  const searchParams = useSearchParams()

  const destination = decodeURIComponent(params.destination as string)
  const country     = searchParams.get('country') ?? ''
  const state       = searchParams.get('state')   ?? undefined

  const today = new Date().toISOString().split('T')[0]

  const [profile,    setProfile]    = useState<Profile | null>(null)
  const [startDate,  setStartDate]  = useState(today)
  const [days,       setDays]       = useState(5)
  const [generating, setGenerating] = useState(false)
  const [error,      setError]      = useState('')

  useEffect(() => {
    async function load() {
      const supabase = getSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase
        .from('onboarding_responses')
        .select('home_city, home_country, budget_per_day, group_type, interests, dietary_preferences')
        .eq('user_id', user.id)
        .single()
      if (data) setProfile(data)
    }
    load()
  }, [router])

  async function generate() {
    setGenerating(true)
    setError('')
    try {
      const supabase = getSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')

      const dietary = (profile?.dietary_preferences ?? []).filter(d => d !== 'none')

      const body = {
        destination,
        country,
        state_province: state,
        days,
        start_date: startDate,
        user_profile: {
          budget_per_day:      profile?.budget_per_day      ?? '50-150',
          group_type:          profile?.group_type          ?? 'solo',
          interests:           profile?.interests           ?? [],
          dietary_preferences: dietary,
          home_city:           profile?.home_city           ?? '',
          home_country:        profile?.home_country        ?? '',
        },
        trip_pace:    'balanced',
        trip_context: [
          'The AI should choose all activities — no must-do list. Pick the best mix of experiences for this traveler profile.',
          dietary.length > 0 ? `Dietary requirements: ${dietary.join(', ')}. Every restaurant must satisfy these.` : '',
          profile?.home_country ? `Traveler is from ${profile.home_country}${profile.home_city ? ` (${profile.home_city})` : ''}.` : '',
        ].filter(Boolean).join(' '),
      }

      const res = await fetch('/api/itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Generation failed')
      const result: ItineraryResult = await res.json()

      const { data: trip, error: tripErr } = await supabase
        .from('trips')
        .insert({
          user_id:    user.id,
          trip_name:  `${destination} — AI Planned`,
          status:     'planning',
          total_days: days,
          start_date: startDate,
          end_date:   result.end_date,
          trip_pace:  'balanced',
        })
        .select()
        .single()
      if (tripErr || !trip) throw new Error('Save failed')

      await supabase.from('trip_destinations').insert({
        trip_id:          trip.id,
        destination_name: destination,
        country,
        position:         1,
        days,
        start_date:       startDate,
        end_date:         result.end_date,
        itinerary_json:   result.itinerary.map(({ day, title, morning, afternoon, dinner, evening, day_total_estimate }) =>
          ({ day, title, morning, afternoon, dinner, evening, day_total_estimate })),
      })

      router.push(`/trip/${trip.share_token ?? trip.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setGenerating(false)
    }
  }

  const interests = profile?.interests ?? []

  if (generating) return <GeneratingScreen destination={destination} />

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        {/* Header */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-[#9A8E7E] text-sm mb-8 hover:text-[#5A504A] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
          Back
        </button>

        <p className="text-xs text-[#C97552] uppercase tracking-widest mb-2">Quick generate</p>
        <h1 className="font-serif italic text-3xl text-[#1A1A1A] mb-1">{destination}</h1>
        {country && <p className="text-[#9A8E7E] text-sm mb-8">{country}</p>}

        {/* Profile summary */}
        {profile && (
          <div className="bg-white border border-[#E8E0D6] rounded-2xl p-4 mb-6">
            <p className="text-[10px] text-[#9A8E7E] uppercase tracking-widest mb-3">Building around your profile</p>
            <div className="flex flex-wrap gap-2">
              {profile.budget_per_day && (
                <span className="text-xs bg-[#F0EBE3] text-[#5C564E] px-3 py-1 rounded-full">
                  {BUDGET_LABELS[profile.budget_per_day] ?? profile.budget_per_day}
                </span>
              )}
              {profile.group_type && (
                <span className="text-xs bg-[#F0EBE3] text-[#5C564E] px-3 py-1 rounded-full">
                  {GROUP_LABELS[profile.group_type] ?? profile.group_type}
                </span>
              )}
              {interests.slice(0, 3).map(i => (
                <span key={i} className="text-xs bg-[#F0EBE3] text-[#5C564E] px-3 py-1 rounded-full capitalize">{i}</span>
              ))}
              {interests.length > 3 && (
                <span className="text-xs text-[#9A8E7E] px-1 py-1">+{interests.length - 3} more</span>
              )}
            </div>
          </div>
        )}

        {/* Date */}
        <div className="mb-4">
          <label className="text-xs text-[#9A8E7E] uppercase tracking-widest block mb-1.5">When are you going?</label>
          <input
            type="date"
            value={startDate}
            min={today}
            onChange={e => setStartDate(e.target.value)}
            className="w-full bg-white border border-[#E0D8CF] rounded-xl px-4 py-3 text-[#1A1A1A] text-sm focus:outline-none focus:border-[#C97552]/60 transition-colors"
          />
        </div>

        {/* Days */}
        <div className="mb-8">
          <label className="text-xs text-[#9A8E7E] uppercase tracking-widest block mb-1.5">How many nights?</label>
          <div className="flex items-center gap-4 bg-white border border-[#E0D8CF] rounded-xl px-4 py-3">
            <button
              type="button"
              onClick={() => setDays(d => Math.max(1, d - 1))}
              className="w-8 h-8 rounded-full bg-[#EDE5D8] flex items-center justify-center text-[#1A1A1A] hover:bg-[#E0D8CC] transition-colors font-medium"
            >−</button>
            <span className="text-[#1A1A1A] font-bold text-lg flex-1 text-center">{days} night{days !== 1 ? 's' : ''}</span>
            <button
              type="button"
              onClick={() => setDays(d => Math.min(14, d + 1))}
              className="w-8 h-8 rounded-full bg-[#EDE5D8] flex items-center justify-center text-[#1A1A1A] hover:bg-[#E0D8CC] transition-colors font-medium"
            >+</button>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        <button
          onClick={generate}
          disabled={generating}
          className="w-full py-4 rounded-full bg-[#C97552] text-white font-bold text-sm hover:bg-[#b86644] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          Build my trip →
        </button>
        <p className="text-[#B8B0A4] text-xs text-center mt-3">~15 seconds · fully editable after</p>

        {/* Opt out */}
        <div className="mt-6 text-center">
          <a
            href={`/plan/ai/${encodeURIComponent(destination)}?country=${encodeURIComponent(country)}${state ? `&state=${encodeURIComponent(state)}` : ''}`}
            className="text-xs text-[#9A8E7E] hover:text-[#5A504A] underline underline-offset-2 transition-colors"
          >
            I'd rather pick activities myself →
          </a>
        </div>
      </div>
    </div>
  )
}
