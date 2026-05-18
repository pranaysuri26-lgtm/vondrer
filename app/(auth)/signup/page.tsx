'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSupabaseClient } from '@/lib/supabase'
import { detectCurrency, buildBudgetOptions, type CurrencyInfo } from '@/lib/currency'

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'account' | 'location' | 'budget' | 'duration' | 'group' | 'interests' | 'dietary' | 'offbeat' | 'timing' | 'past_trips'

interface FormData {
  email:                string
  password:             string
  home_city:            string
  home_country:         string
  travel_scope:         'anywhere' | 'closer'
  domestic_scope:       'same_state' | 'any_state'
  budget:               string
  duration:             string
  group_type:           string
  interests:            string[]
  dietary_preferences:  string[]
  offbeat_score:        number
  trip_timing:          string
  date_from:            string
  date_to:              string
  past_trips:           string[]
  past_trip_input:      string
}

// ─── Step config ──────────────────────────────────────────────────────────────

const ONBOARDING_STEPS: Step[] = ['location', 'budget', 'duration', 'group', 'interests', 'offbeat', 'past_trips']

// ─── Dynamic timing options ───────────────────────────────────────────────────

function getTimingOptions() {
  const now   = new Date()
  const next1 = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const next2 = new Date(now.getFullYear(), now.getMonth() + 2, 1)
  const next3 = new Date(now.getFullYear(), now.getMonth() + 3, 1)
  const fmt   = (d: Date) => d.toLocaleString('default', { month: 'short', year: 'numeric' })
  return [
    { value: 'next_month',  label: 'Next month',           sub: fmt(next1),                      icon: '📅' },
    { value: '2_3_months',  label: 'In 2–3 months',        sub: `${fmt(next2)} – ${fmt(next3)}`,  icon: '🗓️' },
    { value: 'exploring',   label: 'Just exploring',        sub: 'No fixed date',                 icon: '🌍' },
    { value: 'specific',    label: 'I have specific dates', sub: 'Pick your exact window',        icon: '✏️' },
  ]
}

function calcDays(from: string, to: string): number | null {
  if (!from || !to) return null
  const diff = new Date(to).getTime() - new Date(from).getTime()
  return diff > 0 ? Math.round(diff / 86400000) : null
}

const DURATION_OPTIONS = [
  { value: 'weekend',  label: 'Weekend',    sub: '2–3 days'  },
  { value: '1-week',   label: 'One week',   sub: '5–8 days'  },
  { value: '2-weeks',  label: 'Two weeks',  sub: '9–15 days' },
  { value: 'month+',   label: 'Month+',     sub: '16+ days'  },
]

const GROUP_OPTIONS = [
  { value: 'solo',         label: 'Solo',        icon: '🧍', sub: 'Just me'           },
  { value: 'couple',       label: 'Couple',      icon: '👫', sub: 'Me and a partner'   },
  { value: 'small-group',  label: 'Small group', icon: '👯', sub: 'Friends or family'  },
]

const INTEREST_OPTIONS = [
  { value: 'hidden-gems',  label: 'Hidden gems',  icon: '💎' },
  { value: 'local-food',   label: 'Local food',   icon: '🍜' },
  { value: 'adventure',    label: 'Adventure',    icon: '🧗' },
  { value: 'culture',      label: 'Culture',      icon: '🏛️' },
  { value: 'slow-travel',  label: 'Slow travel',  icon: '🌿' },
  { value: 'photography',  label: 'Photography',  icon: '📸' },
]

const OFFBEAT_LABELS: Record<number, { label: string; sub: string }> = {
  1: { label: 'The icons',                      sub: 'Santorini, New York, Tokyo'        },
  2: { label: 'Popular done right',             sub: 'Lisbon, Bali, Queenstown'          },
  3: { label: 'Off the tourist trail',          sub: 'Porto, Chiang Rai, Medellín'       },
  4: { label: 'Most people haven\'t heard of it', sub: 'Kotor, Oaxaca, Tbilisi'          },
  5: { label: 'A village with no English signs', sub: 'You\'ll figure it out'            },
}

const POPULAR_COUNTRIES = [
  'Australia', 'United States', 'United Kingdom', 'India',
  'Canada', 'Germany', 'France', 'Brazil', 'New Zealand', 'Singapore',
]

const DIETARY_OPTIONS = [
  { value: 'vegetarian',   label: 'Vegetarian',                  icon: '🥗' },
  { value: 'vegan',        label: 'Vegan',                       icon: '🌱' },
  { value: 'halal',        label: 'Halal',                       icon: '☪️' },
  { value: 'kosher',       label: 'Kosher',                      icon: '✡️' },
  { value: 'gluten-free',  label: 'Gluten free',                 icon: '🌾' },
  { value: 'no-pork',      label: 'No pork',                     icon: '🚫' },
  { value: 'no-beef',      label: 'No beef',                     icon: '🐄' },
  { value: 'pescatarian',  label: 'Pescatarian',                 icon: '🐟' },
  { value: 'none',         label: 'No restrictions — I eat everything', icon: '🍽️' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: Step }) {
  const idx   = ONBOARDING_STEPS.indexOf(step)
  const total = ONBOARDING_STEPS.length
  const pct   = idx === -1 ? 0 : Math.round(((idx + 1) / total) * 100)
  if (step === 'account') return null
  return (
    <div className="w-full mb-8">
      <div className="flex justify-between mb-1.5">
        <span className="text-xs text-white/40 tracking-widest uppercase">Setting up your Vondrer profile</span>
        <span className="text-xs text-white/40">{idx + 1} / {total}</span>
      </div>
      <div className="h-0.5 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full bg-[#C97552] rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function OptionCard({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`w-full text-left px-5 py-4 rounded-xl border transition-all duration-150
        ${selected
          ? 'border-[#C97552] bg-[#C97552]/10 text-white'
          : 'border-white/10 bg-white/5 text-white/70 hover:border-white/25 hover:bg-white/8 hover:text-white'
        }`}
    >
      {children}
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SignupPage() {
  const router = useRouter()
  const [step, setStep]       = useState<Step>('account')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [countrySearch, setCountrySearch] = useState('')

  const [form, setForm] = useState<FormData>({
    email:                '',
    password:             '',
    home_city:            '',
    home_country:         '',
    travel_scope:         'anywhere',
    domestic_scope:       'any_state',
    budget:               '',
    duration:             '',
    group_type:           '',
    interests:            [],
    dietary_preferences:  [],
    offbeat_score:        3,
    trip_timing:          '',
    date_from:            '',
    date_to:              '',
    past_trips:           [],
    past_trip_input:      '',
  })

  const currency     = detectCurrency(form.home_country)
  const BUDGET_OPTIONS = buildBudgetOptions(currency)

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    setError('')
  }

  function toggleInterest(val: string) {
    setForm(prev => ({
      ...prev,
      interests: prev.interests.includes(val)
        ? prev.interests.filter(i => i !== val)
        : [...prev.interests, val],
    }))
    setError('')
  }

  function toggleDietary(val: string) {
    setForm(prev => {
      const current = prev.dietary_preferences
      if (val === 'none') {
        // 'none' is exclusive — selecting it clears all others
        return { ...prev, dietary_preferences: current.includes('none') ? [] : ['none'] }
      }
      // Selecting any other value removes 'none'
      const without = current.filter(v => v !== 'none')
      return {
        ...prev,
        dietary_preferences: without.includes(val)
          ? without.filter(v => v !== val)
          : [...without, val],
      }
    })
    setError('')
  }

  function addPastTrip() {
    const name = form.past_trip_input.trim()
    if (!name || form.past_trips.includes(name)) return
    set('past_trips', [...form.past_trips, name])
    set('past_trip_input', '')
  }

  function removePastTrip(name: string) {
    set('past_trips', form.past_trips.filter(t => t !== name))
  }

  function canAdvance(): boolean {
    switch (step) {
      case 'account':    return form.email.includes('@') && form.password.length >= 8
      case 'location':   return form.home_country.trim().length >= 2
      case 'budget':     return !!form.budget
      case 'duration':   return !!form.duration
      case 'group':      return !!form.group_type
      case 'interests':  return form.interests.length >= 1
      case 'dietary':    return true  // kept for profile editing
      case 'offbeat':    return true
      case 'timing':     return true  // kept for profile editing
      case 'past_trips': return true
      default:           return false
    }
  }

  function nextStep() {
    const order: Step[] = ['account', ...ONBOARDING_STEPS]
    const idx = order.indexOf(step)
    if (idx < order.length - 1) setStep(order[idx + 1])
  }

  async function handleAccountSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canAdvance()) return
    setLoading(true)
    setError('')
    const supabase = getSupabaseClient()
    const { error: signupError } = await supabase.auth.signUp({ email: form.email, password: form.password })
    if (signupError) { setError(signupError.message); setLoading(false); return }
    const { error: signinError } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password })
    setLoading(false)
    if (signinError) { setError('Account created — check your email to confirm before continuing.'); return }
    nextStep()
  }

  async function handleFinish() {
    setLoading(true)
    setError('')
    const supabase = getSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Session expired — please sign in again.'); setLoading(false); return }

    // Main upsert — domestic_scope excluded to avoid failing if DB column doesn't exist yet.
    // If the column is missing, the whole upsert would fail and travel_scope would never save.
    const { error: onboardingError } = await supabase
      .from('onboarding_responses')
      .upsert({
        user_id:              user.id,
        home_city:            form.home_city.trim() || null,
        home_country:         form.home_country,
        travel_scope:         form.travel_scope,
        budget_per_day:       form.budget,
        trip_duration:        form.duration,
        group_type:           form.group_type,
        interests:            form.interests,
        dietary_preferences:  form.dietary_preferences,
        offbeat_score:        form.offbeat_score,
        trip_timing:          form.trip_timing || null,
        trip_start_date:      form.trip_timing === 'specific' && form.date_from ? form.date_from : null,
        trip_end_date:        form.trip_timing === 'specific' && form.date_to   ? form.date_to   : null,
        trip_duration_days:   form.trip_timing === 'specific'
                                ? calcDays(form.date_from, form.date_to)
                                : null,
      }, { onConflict: 'user_id' })

    if (onboardingError) { setError(onboardingError.message); setLoading(false); return }

    // Separate domestic_scope save — silently ignored if the column doesn't exist yet.
    // To enable: run in Supabase SQL editor:
    //   ALTER TABLE onboarding_responses ADD COLUMN IF NOT EXISTS domestic_scope TEXT DEFAULT NULL;
    try {
      await supabase
        .from('onboarding_responses')
        .update({ domestic_scope: form.travel_scope === 'closer' ? form.domestic_scope : null })
        .eq('user_id', user.id)
    } catch { /* column may not exist yet — main profile saved successfully above */ }

    if (form.past_trips.length > 0) {
      const rows = form.past_trips.map(name => ({ user_id: user.id, destination_name: name }))
      await supabase.from('past_trips').insert(rows)
    }

    await supabase.from('profiles').upsert({ id: user.id, onboarding_done: true }, { onConflict: 'id' })
    router.push('/discover')
  }

  const filteredCountries = countrySearch.trim().length > 0
    ? POPULAR_COUNTRIES.filter(c => c.toLowerCase().includes(countrySearch.toLowerCase()))
    : POPULAR_COUNTRIES

  return (
    <div className="min-h-screen bg-[#0d1f35] relative flex flex-col items-center justify-center px-4 py-12">

      {/* Atmospheric background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1488085061387-422e29b40080?w=1400&q=80&auto=format')", opacity: 0.18 }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0d1f35]/60 to-[#0d1f35]" />

      <div className="relative w-full max-w-md">

        <div className="text-center mb-10">
          <span className="font-serif italic text-3xl text-white/90 tracking-wide">Vondrer</span>
          <p className="text-white/25 text-xs mt-1 font-label tracking-widest uppercase">Your travel intelligence</p>
        </div>

        <ProgressBar step={step} />

        {/* ── ACCOUNT ─────────────────────────────────────────────────────── */}
        {step === 'account' && (
          <form onSubmit={handleAccountSubmit} className="space-y-4">
            <div className="mb-8">
              <h1 className="font-serif italic text-3xl text-white leading-tight mb-2">Start your journey</h1>
              <p className="text-white/45 text-sm">We'll personalise your recommendations in under 2 minutes.</p>
            </div>
            <div>
              <label className="block text-xs text-white/45 uppercase tracking-widest mb-2">Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                placeholder="you@example.com" autoComplete="email"
                className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-[#C97552]/60 transition-colors" />
            </div>
            <div>
              <label className="block text-xs text-white/45 uppercase tracking-widest mb-2">Password</label>
              <input type="password" value={form.password} onChange={e => set('password', e.target.value)}
                placeholder="At least 8 characters" autoComplete="new-password"
                className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-[#C97552]/60 transition-colors" />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button type="submit" disabled={!canAdvance() || loading}
              className="w-full bg-white text-[#0d1f35] font-semibold py-3.5 rounded-full mt-2 disabled:opacity-40 hover:bg-white/90 transition-all">
              {loading ? 'Creating account…' : 'Continue →'}
            </button>
            <p className="text-center text-sm text-white/35 pt-2">
              Already have an account?{' '}
              <Link href="/login" className="text-white/60 hover:text-white underline">Sign in</Link>
            </p>
          </form>
        )}

        {/* ── LOCATION ────────────────────────────────────────────────────── */}
        {step === 'location' && (
          <div className="space-y-5">
            <div className="mb-6">
              <h1 className="font-serif italic text-3xl text-white leading-tight mb-2">Where are you based?</h1>
              <p className="text-white/45 text-sm">
                We use this to match nearby hidden gems, realistic flight times, and on-the-ground budgets.
              </p>
            </div>

            {/* City input */}
            <div>
              <label className="block text-xs text-white/45 uppercase tracking-widest mb-2">City</label>
              <input
                type="text"
                value={form.home_city}
                onChange={e => set('home_city', e.target.value)}
                placeholder="e.g. Sydney, Delhi, London, New York…"
                autoComplete="address-level2"
                className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-[#C97552]/60 transition-colors"
              />
            </div>

            {/* Country input */}
            <div>
              <label className="block text-xs text-white/45 uppercase tracking-widest mb-2">Country</label>
              <input
                type="text"
                value={form.home_country}
                onChange={e => { set('home_country', e.target.value); setCountrySearch(e.target.value) }}
                onKeyDown={e => { if (e.key === 'Enter' && canAdvance()) nextStep() }}
                placeholder="e.g. Australia, India, United States…"
                autoComplete="country-name"
                className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-[#C97552]/60 transition-colors"
              />
            </div>

            {/* Quick-select country chips */}
            <div className="flex flex-wrap gap-2">
              {POPULAR_COUNTRIES.map(c => (
                <button key={c} type="button" onClick={() => { set('home_country', c); setCountrySearch('') }}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all
                    ${form.home_country === c
                      ? 'border-[#C97552] bg-[#C97552]/15 text-white'
                      : 'border-white/12 bg-white/5 text-white/50 hover:border-white/25 hover:text-white/80'
                    }`}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* Travel scope toggle */}
            <div className="pt-1 space-y-3">
              <label className="block text-xs text-white/45 uppercase tracking-widest">
                How far do you want to go?
              </label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'anywhere', icon: '🌍', label: 'Anywhere', sub: 'Global recommendations' },
                  { value: 'closer',   icon: '🏠', label: 'Domestic only', sub: 'Stay within your country' },
                ].map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => set('travel_scope', opt.value as 'anywhere' | 'closer')}
                    className={`text-left px-4 py-4 rounded-xl border transition-all
                      ${form.travel_scope === opt.value
                        ? 'border-[#C97552] bg-[#C97552]/10 text-white'
                        : 'border-white/10 bg-white/5 text-white/70 hover:border-white/25 hover:text-white'
                      }`}
                  >
                    <div className="text-xl mb-1.5">{opt.icon}</div>
                    <div className="font-medium text-sm">{opt.label}</div>
                    <div className="text-xs opacity-60 mt-0.5">{opt.sub}</div>
                  </button>
                ))}
              </div>

              {/* Domestic sub-selector — only when 'closer' is chosen */}
              {form.travel_scope === 'closer' && (
                <div className="border border-white/10 bg-white/3 rounded-xl p-4 space-y-2">
                  <p className="text-xs text-white/40 uppercase tracking-widest mb-3">How far within your country?</p>
                  {[
                    {
                      value: 'any_state',
                      icon:  '🗺️',
                      label: 'Any state / region',
                      sub:   'Explore your whole country',
                    },
                    {
                      value: 'same_state',
                      icon:  '📍',
                      label: 'My state / region only',
                      sub:   `Stay close to ${form.home_city || 'home'}`,
                    },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => set('domestic_scope', opt.value as 'any_state' | 'same_state')}
                      className={`w-full text-left px-4 py-3 rounded-lg border transition-all flex items-center gap-3
                        ${form.domestic_scope === opt.value
                          ? 'border-[#C97552]/60 bg-[#C97552]/8 text-white'
                          : 'border-white/8 bg-white/3 text-white/60 hover:border-white/20 hover:text-white/80'
                        }`}
                    >
                      <span className="text-lg leading-none flex-shrink-0">{opt.icon}</span>
                      <div>
                        <div className="font-medium text-sm">{opt.label}</div>
                        <div className="text-xs opacity-60 mt-0.5">{opt.sub}</div>
                      </div>
                      {form.domestic_scope === opt.value && (
                        <span className="ml-auto text-[#C97552] text-sm">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={nextStep} disabled={!canAdvance()}
              className="w-full bg-white text-[#0d1f35] font-semibold py-3.5 rounded-full mt-2 disabled:opacity-40 hover:bg-white/90 transition-all">
              Continue →
            </button>
          </div>
        )}

        {/* ── BUDGET ──────────────────────────────────────────────────────── */}
        {step === 'budget' && (
          <div className="space-y-4">
            <div className="mb-8">
              <h1 className="font-serif italic text-3xl text-white leading-tight mb-2">What's your daily travel budget?</h1>
              <p className="text-white/45 text-sm">
                On-the-ground costs — accommodation, food, local transport. Flights are separate.
                {currency.code !== 'USD' && (
                  <span className="ml-1 text-[#C97552]/70">Showing in {currency.code} ({currency.symbol}).</span>
                )}
              </p>
            </div>
            <div className="space-y-3">
              {BUDGET_OPTIONS.map(opt => (
                <OptionCard key={opt.value} selected={form.budget === opt.value} onClick={() => set('budget', opt.value)}>
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">{opt.flag}</span>
                    <div>
                      <div className="font-medium">{opt.label}</div>
                      <div className="text-sm opacity-60 mt-0.5">{opt.sub}</div>
                    </div>
                  </div>
                </OptionCard>
              ))}
            </div>
            <button onClick={nextStep} disabled={!canAdvance()}
              className="w-full bg-white text-[#0d1f35] font-semibold py-3.5 rounded-full mt-4 disabled:opacity-40 hover:bg-white/90 transition-all">
              Continue →
            </button>
          </div>
        )}

        {/* ── DURATION ────────────────────────────────────────────────────── */}
        {step === 'duration' && (
          <div className="space-y-4">
            <div className="mb-8">
              <h1 className="font-serif italic text-3xl text-white leading-tight mb-2">How long do you usually travel?</h1>
              <p className="text-white/45 text-sm">We'll match destinations to the time you have.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {DURATION_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => set('duration', opt.value)}
                  className={`text-left px-5 py-4 rounded-xl border transition-all duration-150
                    ${form.duration === opt.value
                      ? 'border-[#C97552] bg-[#C97552]/10 text-white'
                      : 'border-white/10 bg-white/5 text-white/70 hover:border-white/25 hover:text-white'
                    }`}
                >
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-sm opacity-60 mt-0.5">{opt.sub}</div>
                </button>
              ))}
            </div>
            <button onClick={nextStep} disabled={!canAdvance()}
              className="w-full bg-white text-[#0d1f35] font-semibold py-3.5 rounded-full mt-4 disabled:opacity-40 hover:bg-white/90 transition-all">
              Continue →
            </button>
          </div>
        )}

        {/* ── GROUP TYPE ──────────────────────────────────────────────────── */}
        {step === 'group' && (
          <div className="space-y-4">
            <div className="mb-8">
              <h1 className="font-serif italic text-3xl text-white leading-tight mb-2">How do you travel?</h1>
              <p className="text-white/45 text-sm">Solo adventures need different destinations than couple getaways.</p>
            </div>
            <div className="space-y-3">
              {GROUP_OPTIONS.map(opt => (
                <OptionCard key={opt.value} selected={form.group_type === opt.value} onClick={() => set('group_type', opt.value)}>
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">{opt.icon}</span>
                    <div>
                      <div className="font-medium">{opt.label}</div>
                      <div className="text-sm opacity-60 mt-0.5">{opt.sub}</div>
                    </div>
                  </div>
                </OptionCard>
              ))}
            </div>
            <button onClick={nextStep} disabled={!canAdvance()}
              className="w-full bg-white text-[#0d1f35] font-semibold py-3.5 rounded-full mt-4 disabled:opacity-40 hover:bg-white/90 transition-all">
              Continue →
            </button>
          </div>
        )}

        {/* ── INTERESTS ───────────────────────────────────────────────────── */}
        {step === 'interests' && (
          <div className="space-y-4">
            <div className="mb-8">
              <h1 className="font-serif italic text-3xl text-white leading-tight mb-2">What matters most to you?</h1>
              <p className="text-white/45 text-sm">Select everything that applies. The more you pick, the better the match.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {INTEREST_OPTIONS.map(opt => {
                const selected = form.interests.includes(opt.value)
                return (
                  <button key={opt.value} type="button" onClick={() => toggleInterest(opt.value)}
                    className={`text-left px-4 py-4 rounded-xl border transition-all duration-150
                      ${selected
                        ? 'border-[#C97552] bg-[#C97552]/10 text-white'
                        : 'border-white/10 bg-white/5 text-white/70 hover:border-white/25 hover:text-white'
                      }`}
                  >
                    <div className="text-2xl mb-1.5">{opt.icon}</div>
                    <div className="font-medium text-sm">{opt.label}</div>
                  </button>
                )
              })}
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button onClick={() => { if (form.interests.length === 0) { setError('Pick at least one'); return } nextStep() }}
              className="w-full bg-white text-[#0d1f35] font-semibold py-3.5 rounded-full mt-4 disabled:opacity-40 hover:bg-white/90 transition-all">
              Continue →
            </button>
          </div>
        )}

        {/* ── DIETARY PREFERENCES ─────────────────────────────────────────── */}
        {step === 'dietary' && (
          <div className="space-y-4">
            <div className="mb-8">
              <h1 className="font-serif italic text-3xl text-white leading-tight mb-2">Any food preferences?</h1>
              <p className="text-white/45 text-sm">We'll tailor every food recommendation to what works for you.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {DIETARY_OPTIONS.map(opt => {
                const selected = form.dietary_preferences.includes(opt.value)
                return (
                  <button key={opt.value} type="button" onClick={() => toggleDietary(opt.value)}
                    className={`text-left px-4 py-4 rounded-xl border transition-all duration-150
                      ${selected
                        ? 'border-[#C97552] bg-[#C97552]/10 text-white'
                        : 'border-white/10 bg-white/5 text-white/70 hover:border-white/25 hover:text-white'
                      }`}
                  >
                    <div className="text-2xl mb-1.5">{opt.icon}</div>
                    <div className="font-medium text-sm">{opt.label}</div>
                  </button>
                )
              })}
            </div>
            <button onClick={nextStep}
              className="w-full bg-white text-[#0d1f35] font-semibold py-3.5 rounded-full mt-2 hover:bg-white/90 transition-all">
              {form.dietary_preferences.length > 0 ? 'Continue →' : 'Continue →'}
            </button>
            <button type="button" onClick={nextStep}
              className="w-full text-white/35 text-sm py-2 hover:text-white/55 transition-colors">
              Skip — no preferences
            </button>
          </div>
        )}

        {/* ── OFFBEAT SLIDER ──────────────────────────────────────────────── */}
        {step === 'offbeat' && (
          <div className="space-y-4">
            <div className="mb-8">
              <h1 className="font-serif italic text-3xl text-white leading-tight mb-2">How far off the beaten path?</h1>
              <p className="text-white/45 text-sm">This is the most important question. Be honest.</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <div className="text-center mb-6">
                <div className="text-4xl mb-1">
                  {['', '🏖️', '🗺️', '🧭', '🌲', '🌑'][form.offbeat_score]}
                </div>
                <div className="text-white font-semibold text-lg">{OFFBEAT_LABELS[form.offbeat_score].label}</div>
                <div className="text-white/45 text-sm mt-1">{OFFBEAT_LABELS[form.offbeat_score].sub}</div>
              </div>
              <input type="range" min={1} max={5} step={1} value={form.offbeat_score}
                onChange={e => set('offbeat_score', Number(e.target.value))}
                className="w-full accent-[#C97552] cursor-pointer" />
              <div className="flex justify-between mt-2">
                <span className="text-xs text-white/30">Tourist-friendly</span>
                <span className="text-xs text-white/30">Truly unknown</span>
              </div>
            </div>
            <button onClick={nextStep}
              className="w-full bg-white text-[#0d1f35] font-semibold py-3.5 rounded-full mt-4 hover:bg-white/90 transition-all">
              Continue →
            </button>
          </div>
        )}

        {/* ── TIMING ──────────────────────────────────────────────────────── */}
        {step === 'timing' && (
          <div className="space-y-4">
            <div className="mb-8">
              <h1 className="font-serif italic text-3xl text-white leading-tight mb-2">When are you planning to travel?</h1>
              <p className="text-white/45 text-sm">We'll factor in seasonal conditions, festivals, and crowds.</p>
            </div>

            <div className="space-y-3">
              {getTimingOptions().map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set('trip_timing', opt.value)}
                  className={`w-full text-left px-5 py-4 rounded-xl border transition-all duration-150
                    ${form.trip_timing === opt.value
                      ? 'border-[#C97552] bg-[#C97552]/10 text-white'
                      : 'border-white/10 bg-white/5 text-white/70 hover:border-white/25 hover:bg-white/8 hover:text-white'
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{opt.icon}</span>
                      <div>
                        <div className="font-medium">{opt.label}</div>
                        <div className="text-sm opacity-55 mt-0.5">{opt.sub}</div>
                      </div>
                    </div>
                    {form.trip_timing === opt.value && (
                      <span className="text-[#C97552] text-lg">✓</span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Date pickers — only shown when 'specific' is selected */}
            {form.trip_timing === 'specific' && (() => {
              const days = calcDays(form.date_from, form.date_to)
              return (
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-white/40 uppercase tracking-widest mb-2">Departure</label>
                      <input
                        type="date"
                        value={form.date_from}
                        onChange={e => set('date_from', e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#C97552]/60 transition-colors [color-scheme:dark]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-white/40 uppercase tracking-widest mb-2">Return</label>
                      <input
                        type="date"
                        value={form.date_to}
                        onChange={e => set('date_to', e.target.value)}
                        min={form.date_from || new Date().toISOString().split('T')[0]}
                        className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#C97552]/60 transition-colors [color-scheme:dark]"
                      />
                    </div>
                  </div>
                  {days !== null && (
                    <p className="text-center text-sm text-[#C97552] font-medium">{days} {days === 1 ? 'day' : 'days'}</p>
                  )}
                </div>
              )
            })()}

            <button
              onClick={nextStep}
              disabled={!canAdvance()}
              className="w-full bg-white text-[#0d1f35] font-semibold py-3.5 rounded-full mt-2 disabled:opacity-40 hover:bg-white/90 transition-all"
            >
              Continue →
            </button>
            <button type="button" onClick={nextStep}
              className="w-full text-white/35 text-sm py-2 hover:text-white/55 transition-colors">
              Skip — I'll decide later
            </button>
          </div>
        )}

        {/* ── PAST TRIPS ──────────────────────────────────────────────────── */}
        {step === 'past_trips' && (
          <div className="space-y-4">
            <div className="mb-8">
              <h1 className="font-serif italic text-3xl text-white leading-tight mb-2">Where have you been?</h1>
              <p className="text-white/45 text-sm">We'll never suggest somewhere you've already explored.</p>
            </div>
            <div className="flex gap-2">
              <input type="text" value={form.past_trip_input}
                onChange={e => set('past_trip_input', e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPastTrip() } }}
                placeholder="e.g. Thailand, Morocco, Iceland…"
                className="flex-1 bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-[#C97552]/60 transition-colors" />
              <button type="button" onClick={addPastTrip}
                className="px-4 py-3 bg-white/10 border border-white/15 rounded-lg text-white hover:bg-white/15 transition-colors">
                Add
              </button>
            </div>
            {form.past_trips.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.past_trips.map(name => (
                  <span key={name} className="flex items-center gap-1.5 bg-[#C97552]/15 border border-[#C97552]/30 text-white/80 text-sm px-3 py-1.5 rounded-full">
                    {name}
                    <button type="button" onClick={() => removePastTrip(name)}
                      className="text-white/40 hover:text-white/80 leading-none">×</button>
                  </span>
                ))}
              </div>
            )}
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button onClick={handleFinish} disabled={loading}
              className="w-full bg-white text-[#0d1f35] font-semibold py-3.5 rounded-full mt-4 disabled:opacity-40 hover:bg-white/90 transition-all">
              {loading ? 'Setting up your profile…' : 'Find my destinations →'}
            </button>
            <button type="button" onClick={handleFinish} disabled={loading}
              className="w-full text-white/35 text-sm py-2 hover:text-white/55 transition-colors">
              Skip — I'm a new traveller
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
