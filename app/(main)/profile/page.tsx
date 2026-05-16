'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'
import { detectCurrency, buildBudgetOptions } from '@/lib/currency'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Profile {
  home_city:            string
  home_country:         string
  travel_scope:         string
  domestic_scope:       string   // 'same_state' | 'any_state'
  budget_per_day:       string
  trip_duration:        string
  group_type:           string
  interests:            string[]
  dietary_preferences:  string[]
  offbeat_score:        number
  trip_timing:          string   // 'next_month' | '2_3_months' | 'exploring' | 'specific' | ''
  trip_start_date:      string
  trip_end_date:        string
  trip_duration_days:   number | null
  past_trips:           string[]
  past_trip_input:      string
}

function calcDays(from: string, to: string): number | null {
  if (!from || !to) return null
  const diff = new Date(to).getTime() - new Date(from).getTime()
  return diff > 0 ? Math.round(diff / 86400000) : null
}

// ─── Static config ────────────────────────────────────────────────────────────

const DURATION_OPTIONS = [
  { value: 'weekend', label: 'Weekend',   sub: '2–3 days'  },
  { value: '1-week',  label: 'One week',  sub: '5–8 days'  },
  { value: '2-weeks', label: 'Two weeks', sub: '9–15 days' },
  { value: 'month+',  label: 'Month+',    sub: '16+ days'  },
]

const GROUP_OPTIONS = [
  { value: 'solo',        label: 'Solo',        icon: '🧍', sub: 'Just me'          },
  { value: 'couple',      label: 'Couple',       icon: '👫', sub: 'Me and a partner' },
  { value: 'small-group', label: 'Small group',  icon: '👯', sub: 'Friends or family'},
]

const INTEREST_OPTIONS = [
  { value: 'hidden-gems',  label: 'Hidden gems',  icon: '💎' },
  { value: 'local-food',   label: 'Local food',   icon: '🍜' },
  { value: 'adventure',    label: 'Adventure',    icon: '🧗' },
  { value: 'culture',      label: 'Culture',      icon: '🏛️' },
  { value: 'slow-travel',  label: 'Slow travel',  icon: '🌿' },
  { value: 'photography',  label: 'Photography',  icon: '📸' },
]

const DIETARY_OPTIONS = [
  { value: 'vegetarian',  label: 'Vegetarian',                   icon: '🥗' },
  { value: 'vegan',       label: 'Vegan',                        icon: '🌱' },
  { value: 'halal',       label: 'Halal',                        icon: '☪️' },
  { value: 'kosher',      label: 'Kosher',                       icon: '✡️' },
  { value: 'gluten-free', label: 'Gluten free',                  icon: '🌾' },
  { value: 'no-pork',     label: 'No pork',                      icon: '🚫' },
  { value: 'no-beef',     label: 'No beef',                      icon: '🐄' },
  { value: 'pescatarian', label: 'Pescatarian',                  icon: '🐟' },
  { value: 'none',        label: 'No restrictions — I eat everything', icon: '🍽️' },
]

const OFFBEAT_LABELS: Record<number, { label: string; sub: string; icon: string }> = {
  1: { label: 'The icons',                       sub: 'Santorini, New York, Tokyo',        icon: '🏖️' },
  2: { label: 'Popular done right',              sub: 'Lisbon, Bali, Queenstown',          icon: '🗺️' },
  3: { label: 'Off the tourist trail',           sub: 'Porto, Chiang Rai, Medellín',       icon: '🧭' },
  4: { label: 'Most people haven\'t heard of it', sub: 'Kotor, Oaxaca, Tbilisi',           icon: '🌲' },
  5: { label: 'A village with no English signs', sub: 'You\'ll figure it out',             icon: '🌑' },
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/4 border border-white/8 rounded-2xl p-6">
      <h2 className="text-xs text-white/35 uppercase tracking-widest font-label mb-5">{title}</h2>
      {children}
    </div>
  )
}

// ─── Chip button ──────────────────────────────────────────────────────────────

function Chip({
  selected, onClick, children,
}: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-full border text-sm transition-all
        ${selected
          ? 'border-[#C97552] bg-[#C97552]/15 text-white'
          : 'border-white/12 bg-white/5 text-white/50 hover:border-white/25 hover:text-white/80'
        }`}
    >
      {children}
    </button>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const router = useRouter()
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState('')

  const [profile, setProfile] = useState<Profile>({
    home_city:            '',
    home_country:         '',
    travel_scope:         'anywhere',
    domestic_scope:       'any_state',
    budget_per_day:       '',
    trip_duration:        '',
    group_type:           '',
    interests:            [],
    dietary_preferences:  [],
    offbeat_score:        3,
    trip_timing:          '',
    trip_start_date:      '',
    trip_end_date:        '',
    trip_duration_days:   null,
    past_trips:           [],
    past_trip_input:      '',
  })

  // Derived currency from home_country
  const currency     = detectCurrency(profile.home_country)
  const BUDGET_OPTIONS = buildBudgetOptions(currency)

  // ── Load existing profile ──────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const supabase = getSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/signup'); return }

      const [onboardingRes, tripsRes] = await Promise.all([
        supabase.from('onboarding_responses').select('*').eq('user_id', user.id).single(),
        supabase.from('past_trips').select('destination_name').eq('user_id', user.id),
      ])

      if (onboardingRes.data) {
        const d = onboardingRes.data
        setProfile(prev => ({
          ...prev,
          home_city:            d.home_city            ?? '',
          home_country:         d.home_country         ?? '',
          travel_scope:         d.travel_scope         ?? 'anywhere',
          domestic_scope:       d.domestic_scope       ?? 'any_state',
          budget_per_day:       d.budget_per_day       ?? '',
          trip_duration:        d.trip_duration        ?? '',
          group_type:           d.group_type           ?? '',
          interests:            d.interests            ?? [],
          dietary_preferences:  d.dietary_preferences  ?? [],
          offbeat_score:        d.offbeat_score        ?? 3,
          trip_timing:          d.trip_timing          ?? '',
          trip_start_date:      d.trip_start_date      ?? '',
          trip_end_date:        d.trip_end_date        ?? '',
          trip_duration_days:   d.trip_duration_days   ?? null,
          past_trips:           (tripsRes.data ?? []).map((t: { destination_name: string }) => t.destination_name),
        }))
      }
      setLoading(false)
    }
    load()
  }, [router])

  // ── Helpers ────────────────────────────────────────────────────────────────

  function set<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile(prev => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  function toggleInterest(val: string) {
    setProfile(prev => ({
      ...prev,
      interests: prev.interests.includes(val)
        ? prev.interests.filter(i => i !== val)
        : [...prev.interests, val],
    }))
    setSaved(false)
  }

  function toggleDietary(val: string) {
    setProfile(prev => {
      const current = prev.dietary_preferences
      if (val === 'none') {
        return { ...prev, dietary_preferences: current.includes('none') ? [] : ['none'] }
      }
      const without = current.filter(v => v !== 'none')
      return {
        ...prev,
        dietary_preferences: without.includes(val)
          ? without.filter(v => v !== val)
          : [...without, val],
      }
    })
    setSaved(false)
  }

  function addTrip() {
    const name = profile.past_trip_input.trim()
    if (!name || profile.past_trips.includes(name)) return
    set('past_trips', [...profile.past_trips, name])
    set('past_trip_input', '')
  }

  function removeTrip(name: string) {
    set('past_trips', profile.past_trips.filter(t => t !== name))
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError('')

    const supabase = getSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/signup'); return }

    // Update onboarding_responses — domestic_scope excluded to avoid failing if DB column doesn't exist.
    // If the column is missing, including it would cause the entire upsert to fail and
    // travel_scope would never save (root cause of the "AI showing wrong destinations" bug).
    const { error: onboardingError } = await supabase
      .from('onboarding_responses')
      .upsert({
        user_id:              user.id,
        home_city:            profile.home_city.trim() || null,
        home_country:         profile.home_country,
        travel_scope:         profile.travel_scope,
        budget_per_day:       profile.budget_per_day,
        trip_duration:        profile.trip_duration,
        group_type:           profile.group_type,
        interests:            profile.interests,
        dietary_preferences:  profile.dietary_preferences,
        offbeat_score:        profile.offbeat_score,
        trip_timing:          profile.trip_timing || null,
        trip_start_date:      profile.trip_timing === 'specific' && profile.trip_start_date ? profile.trip_start_date : null,
        trip_end_date:        profile.trip_timing === 'specific' && profile.trip_end_date   ? profile.trip_end_date   : null,
        trip_duration_days:   profile.trip_timing === 'specific'
                                ? calcDays(profile.trip_start_date, profile.trip_end_date)
                                : null,
      }, { onConflict: 'user_id' })

    if (onboardingError) { setError(onboardingError.message); setSaving(false); return }

    // Main profile saved — log so we can confirm travel_scope persisted
    if (process.env.NODE_ENV === 'development') {
      console.log('[Profile saved] travel_scope:', profile.travel_scope, '| home:', profile.home_city, profile.home_country)
    }

    // Separate domestic_scope save — silently ignored if the column doesn't exist yet.
    // The 400 shown in browser console for this call is harmless — main profile above succeeded.
    // To eliminate the 400: run in Supabase SQL editor:
    //   ALTER TABLE onboarding_responses ADD COLUMN IF NOT EXISTS domestic_scope TEXT DEFAULT NULL;
    supabase
      .from('onboarding_responses')
      .update({ domestic_scope: profile.travel_scope === 'closer' ? profile.domestic_scope : null })
      .eq('user_id', user.id)
      .then(() => { /* ignore — column may not exist */ })

    // Replace past trips: delete all then re-insert
    await supabase.from('past_trips').delete().eq('user_id', user.id)
    if (profile.past_trips.length > 0) {
      await supabase.from('past_trips').insert(
        profile.past_trips.map(name => ({ user_id: user.id, destination_name: name }))
      )
    }

    // Invalidate recommendations cache so next /discover triggers fresh AI call
    await supabase
      .from('recommendations')
      .delete()
      .eq('user_id', user.id)

    setSaving(false)
    setSaved(true)
    router.push('/discover')
  }, [profile, router])

  const handleSignOut = useCallback(async () => {
    const supabase = getSupabaseClient()
    await supabase.auth.signOut()
    router.push('/')
  }, [router])

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-[#C97552]"
          style={{ animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0d1f35]">
      <main className="max-w-2xl mx-auto px-4 py-10 space-y-6">

        {/* Header */}
        <div className="mb-2">
          <p className="text-xs text-white/35 uppercase tracking-widest font-label mb-2">Settings</p>
          <h1 className="font-serif italic text-4xl text-white">Your profile</h1>
          <p className="text-white/40 text-sm mt-2">
            Changes here will refresh your destination recommendations.
          </p>
        </div>

        {/* ── Home location ─────────────────────────────────────────────── */}
        <Section title="Where are you based?">
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-white/35 uppercase tracking-widest mb-1.5">City</label>
              <input
                type="text"
                value={profile.home_city}
                onChange={e => set('home_city', e.target.value)}
                placeholder="e.g. Sydney, Delhi, London…"
                className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-[#C97552]/60 transition-colors text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-white/35 uppercase tracking-widest mb-1.5">Country</label>
              <input
                type="text"
                value={profile.home_country}
                onChange={e => set('home_country', e.target.value)}
                placeholder="e.g. Australia, India, United States…"
                className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-[#C97552]/60 transition-colors text-sm"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {['Australia', 'United States', 'United Kingdom', 'India', 'Canada', 'Germany', 'France', 'Brazil', 'New Zealand', 'Singapore'].map(c => (
              <button key={c} type="button" onClick={() => set('home_country', c)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all
                  ${profile.home_country === c
                    ? 'border-[#C97552] bg-[#C97552]/15 text-white'
                    : 'border-white/12 bg-white/5 text-white/50 hover:border-white/25 hover:text-white/80'
                  }`}
              >
                {c}
              </button>
            ))}
          </div>
        </Section>

        {/* ── Travel scope ──────────────────────────────────────────────── */}
        <Section title="How far do you want to go?">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'anywhere', icon: '🌍', label: 'Anywhere', sub: 'Global recommendations' },
                { value: 'closer',   icon: '🏠', label: 'Domestic only', sub: 'Stay within your country' },
              ].map(opt => (
                <button key={opt.value} type="button" onClick={() => set('travel_scope', opt.value)}
                  className={`text-left px-4 py-4 rounded-xl border transition-all
                    ${profile.travel_scope === opt.value
                      ? 'border-[#C97552] bg-[#C97552]/10 text-white'
                      : 'border-white/10 bg-white/5 text-white/70 hover:border-white/25 hover:text-white'
                    }`}
                >
                  <div className="text-xl mb-1">{opt.icon}</div>
                  <div className="font-medium text-sm">{opt.label}</div>
                  <div className="text-xs opacity-60 mt-0.5">{opt.sub}</div>
                </button>
              ))}
            </div>

            {/* Domestic sub-selector */}
            {profile.travel_scope === 'closer' && (
              <div className="border border-white/10 bg-white/3 rounded-xl p-4 space-y-2">
                <p className="text-xs text-white/40 uppercase tracking-widest mb-3">How far within your country?</p>
                {[
                  { value: 'any_state',  icon: '🗺️', label: 'Any state / region',   sub: 'Explore your whole country' },
                  { value: 'same_state', icon: '📍', label: 'My state / region only', sub: `Stay close to ${profile.home_city || 'home'}` },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set('domestic_scope', opt.value)}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition-all flex items-center gap-3
                      ${profile.domestic_scope === opt.value
                        ? 'border-[#C97552]/60 bg-[#C97552]/8 text-white'
                        : 'border-white/8 bg-white/3 text-white/60 hover:border-white/20 hover:text-white/80'
                      }`}
                  >
                    <span className="text-lg leading-none flex-shrink-0">{opt.icon}</span>
                    <div className="flex-1">
                      <div className="font-medium text-sm">{opt.label}</div>
                      <div className="text-xs opacity-60 mt-0.5">{opt.sub}</div>
                    </div>
                    {profile.domestic_scope === opt.value && (
                      <span className="text-[#C97552] text-sm">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Section>

        {/* ── Trip timing ───────────────────────────────────────────────── */}
        <Section title="When are you thinking of going?">
          <div className="space-y-2">
            {[
              { value: 'next_month',  icon: '📅', label: 'Next month',           sub: 'Planning very soon'        },
              { value: '2_3_months',  icon: '🗓️', label: 'In 2–3 months',        sub: 'Got time to plan'          },
              { value: 'exploring',   icon: '🌍', label: 'Just exploring',        sub: 'No fixed date'             },
              { value: 'specific',    icon: '✏️', label: 'I have specific dates', sub: 'Pick your exact window'   },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => set('trip_timing', profile.trip_timing === opt.value ? '' : opt.value)}
                className={`w-full text-left px-5 py-4 rounded-xl border transition-all
                  ${profile.trip_timing === opt.value
                    ? 'border-[#C97552] bg-[#C97552]/10 text-white'
                    : 'border-white/10 bg-white/5 text-white/70 hover:border-white/25 hover:text-white'
                  }`}
              >
                <div className="flex items-center gap-4">
                  <span className="text-xl">{opt.icon}</span>
                  <div>
                    <div className="font-medium text-sm">{opt.label}</div>
                    <div className="text-xs opacity-60 mt-0.5">{opt.sub}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Date pickers — shown when 'specific' is selected */}
          {profile.trip_timing === 'specific' && (() => {
            const days = calcDays(profile.trip_start_date, profile.trip_end_date)
            return (
              <div className="space-y-3 mt-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-white/40 uppercase tracking-widest mb-2">Departure</label>
                    <input
                      type="date"
                      value={profile.trip_start_date}
                      onChange={e => set('trip_start_date', e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#C97552]/60 transition-colors text-sm [color-scheme:dark]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-white/40 uppercase tracking-widest mb-2">Return</label>
                    <input
                      type="date"
                      value={profile.trip_end_date}
                      onChange={e => set('trip_end_date', e.target.value)}
                      min={profile.trip_start_date || new Date().toISOString().split('T')[0]}
                      className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#C97552]/60 transition-colors text-sm [color-scheme:dark]"
                    />
                  </div>
                </div>
                {days !== null && (
                  <p className="text-center text-sm text-[#C97552] font-medium">{days} {days === 1 ? 'day' : 'days'}</p>
                )}
              </div>
            )
          })()}

          {!profile.trip_timing && (
            <p className="text-xs text-white/25 mt-3">Not set — timing won&apos;t affect your recommendations.</p>
          )}
        </Section>

        {/* ── Budget ────────────────────────────────────────────────────── */}
        <Section title="Daily travel budget">
          <div className="space-y-2">
            {BUDGET_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => set('budget_per_day', opt.value)}
                className={`w-full text-left px-5 py-4 rounded-xl border transition-all
                  ${profile.budget_per_day === opt.value
                    ? 'border-[#C97552] bg-[#C97552]/10 text-white'
                    : 'border-white/10 bg-white/5 text-white/70 hover:border-white/25 hover:text-white'
                  }`}
              >
                <div className="flex items-center gap-4">
                  <span className="text-xl">{opt.flag}</span>
                  <div>
                    <div className="font-medium text-sm">{opt.label}</div>
                    <div className="text-xs opacity-60 mt-0.5">{opt.sub}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Section>

        {/* ── Duration ──────────────────────────────────────────────────── */}
        <Section title="How long do you usually travel?">
          <div className="grid grid-cols-2 gap-2">
            {DURATION_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => set('trip_duration', opt.value)}
                className={`text-left px-4 py-4 rounded-xl border transition-all
                  ${profile.trip_duration === opt.value
                    ? 'border-[#C97552] bg-[#C97552]/10 text-white'
                    : 'border-white/10 bg-white/5 text-white/70 hover:border-white/25 hover:text-white'
                  }`}
              >
                <div className="font-medium text-sm">{opt.label}</div>
                <div className="text-xs opacity-60 mt-0.5">{opt.sub}</div>
              </button>
            ))}
          </div>
        </Section>

        {/* ── Group ─────────────────────────────────────────────────────── */}
        <Section title="How do you travel?">
          <div className="space-y-2">
            {GROUP_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => set('group_type', opt.value)}
                className={`w-full text-left px-5 py-4 rounded-xl border transition-all
                  ${profile.group_type === opt.value
                    ? 'border-[#C97552] bg-[#C97552]/10 text-white'
                    : 'border-white/10 bg-white/5 text-white/70 hover:border-white/25 hover:text-white'
                  }`}
              >
                <div className="flex items-center gap-4">
                  <span className="text-xl">{opt.icon}</span>
                  <div>
                    <div className="font-medium text-sm">{opt.label}</div>
                    <div className="text-xs opacity-60 mt-0.5">{opt.sub}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Section>

        {/* ── Interests ─────────────────────────────────────────────────── */}
        <Section title="What matters most to you?">
          <div className="grid grid-cols-2 gap-2">
            {INTEREST_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleInterest(opt.value)}
                className={`text-left px-4 py-4 rounded-xl border transition-all
                  ${profile.interests.includes(opt.value)
                    ? 'border-[#C97552] bg-[#C97552]/10 text-white'
                    : 'border-white/10 bg-white/5 text-white/70 hover:border-white/25 hover:text-white'
                  }`}
              >
                <div className="text-xl mb-1">{opt.icon}</div>
                <div className="font-medium text-sm">{opt.label}</div>
              </button>
            ))}
          </div>
        </Section>

        {/* ── Dietary preferences ───────────────────────────────────────── */}
        <Section title="Food preferences">
          <div className="grid grid-cols-2 gap-2">
            {DIETARY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleDietary(opt.value)}
                className={`text-left px-4 py-4 rounded-xl border transition-all
                  ${profile.dietary_preferences.includes(opt.value)
                    ? 'border-[#C97552] bg-[#C97552]/10 text-white'
                    : 'border-white/10 bg-white/5 text-white/70 hover:border-white/25 hover:text-white'
                  }`}
              >
                <div className="text-xl mb-1">{opt.icon}</div>
                <div className="font-medium text-sm">{opt.label}</div>
              </button>
            ))}
          </div>
          {profile.dietary_preferences.length === 0 && (
            <p className="text-xs text-white/25 mt-3">Nothing selected — no dietary filters applied.</p>
          )}
        </Section>

        {/* ── Offbeat slider ────────────────────────────────────────────── */}
        <Section title="How far off the beaten path?">
          <div className="text-center mb-5">
            <div className="text-3xl mb-1">{OFFBEAT_LABELS[profile.offbeat_score].icon}</div>
            <div className="text-white font-medium">{OFFBEAT_LABELS[profile.offbeat_score].label}</div>
            <div className="text-white/45 text-sm mt-1">{OFFBEAT_LABELS[profile.offbeat_score].sub}</div>
          </div>
          <input
            type="range" min={1} max={5} step={1}
            value={profile.offbeat_score}
            onChange={e => set('offbeat_score', Number(e.target.value))}
            className="w-full accent-[#C97552] cursor-pointer"
          />
          <div className="flex justify-between mt-1">
            <span className="text-xs text-white/25">Tourist-friendly</span>
            <span className="text-xs text-white/25">Truly unknown</span>
          </div>
        </Section>

        {/* ── Past trips ────────────────────────────────────────────────── */}
        <Section title="Places you've already been">
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={profile.past_trip_input}
              onChange={e => set('past_trip_input', e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTrip() } }}
              placeholder="e.g. Thailand, Morocco, Iceland…"
              className="flex-1 bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-[#C97552]/60 transition-colors text-sm"
            />
            <button
              type="button"
              onClick={addTrip}
              className="px-4 py-3 bg-white/10 border border-white/15 rounded-lg text-white hover:bg-white/15 transition-colors text-sm"
            >
              Add
            </button>
          </div>
          {profile.past_trips.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {profile.past_trips.map(name => (
                <span key={name} className="flex items-center gap-1.5 bg-[#C97552]/15 border border-[#C97552]/30 text-white/80 text-sm px-3 py-1.5 rounded-full">
                  {name}
                  <button
                    type="button"
                    onClick={() => removeTrip(name)}
                    className="text-white/40 hover:text-white/80 leading-none text-base"
                  >×</button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-white/25 text-sm">No trips added yet.</p>
          )}
        </Section>

        {/* ── Save + error ──────────────────────────────────────────────── */}
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className={`w-full py-4 rounded-full font-semibold text-sm transition-all
            ${saved
              ? 'bg-green-500/20 border border-green-500/40 text-green-400'
              : 'bg-white text-[#0d1f35] hover:bg-white/90 disabled:opacity-50'
            }`}
        >
          {saving ? 'Saving…' : saved ? '✓ Saved — recommendations will refresh' : 'Save changes'}
        </button>

        <div className="pb-8 flex flex-col items-center gap-4">
          <a
            href="/passport"
            className="flex items-center gap-2 text-white/35 text-sm hover:text-white/60 transition-colors"
          >
            <span>📔</span>
            <span>View your passport</span>
            <span className="text-white/20">→</span>
          </a>
          <button
            onClick={handleSignOut}
            className="text-white/25 text-xs hover:text-white/45 transition-colors"
          >
            Sign out
          </button>
        </div>

      </main>
    </div>
  )
}
