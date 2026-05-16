'use client'

import { useState, useEffect, useCallback } from 'react'
import { getSupabaseClient } from '@/lib/supabase'
import type { DayPlan, DayWeather } from '@/app/api/plan/day/route'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO()    { return new Date().toISOString().split('T')[0] }
function tomorrowISO() {
  const d = new Date(); d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}
function formatDateLabel(iso: string) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function stopTypeIcon(type: string) {
  switch (type) {
    case 'food':      return '🍽️'
    case 'viewpoint': return '👁️'
    case 'walk':      return '🚶'
    case 'drive':     return '🚗'
    case 'activity':  return '🎯'
    case 'rest':      return '☕'
    default:          return '📍'
  }
}

// ─── Weather Strip ────────────────────────────────────────────────────────────

function WeatherStrip({ weather, location }: { weather: DayWeather; location: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/4 px-5 py-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{weather.emoji}</span>
          <div>
            <p className="text-white text-sm font-medium">{weather.label}</p>
            <p className="text-white/40 text-xs truncate max-w-[180px]">{location.split(',').slice(0, 2).join(',')}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-white text-sm font-medium">{weather.temp_high}° / {weather.temp_low}°C</p>
          <p className="text-white/40 text-xs">{weather.rain_pct}% rain</p>
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs text-white/35">
        <span>🌅 {weather.sunrise}</span>
        <span>🌇 {weather.sunset}</span>
      </div>
    </div>
  )
}

// ─── Stop Card ────────────────────────────────────────────────────────────────

function StopCard({ stop, index, total }: { stop: DayPlan['stops'][0]; index: number; total: number }) {
  const [open, setOpen] = useState(index === 0)

  return (
    <div className="relative flex gap-4">
      {/* Timeline line */}
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-[#C97552]/15 border border-[#C97552]/30 flex items-center justify-center flex-shrink-0 z-10">
          <span className="text-sm">{stopTypeIcon(stop.type)}</span>
        </div>
        {index < total - 1 && (
          <div className="w-px flex-1 bg-white/8 mt-2 mb-0 min-h-[24px]" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 pb-6">
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full text-left"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <p className="text-[#C97552]/80 text-[11px] font-label tracking-widest uppercase mb-0.5">
                {stop.time} · {stop.duration}
              </p>
              <p className="text-white text-sm font-medium leading-snug">{stop.name}</p>
            </div>
            <span className={`text-white/30 text-xs mt-1 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
          </div>
        </button>

        {open && (
          <div className="mt-3 space-y-2">
            <p className="text-white/60 text-sm leading-relaxed">{stop.description}</p>
            {stop.tip && (
              <div className="flex gap-2 rounded-xl bg-[#C97552]/8 border border-[#C97552]/20 px-3 py-2.5">
                <span className="text-xs mt-0.5">💡</span>
                <p className="text-[#C97552]/80 text-xs leading-relaxed">{stop.tip}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Phase = 'input' | 'loading' | 'result'

export default function PlanDayPage() {
  const [phase,     setPhase]     = useState<Phase>('input')
  const [place,     setPlace]     = useState('')
  const [date,      setDate]      = useState(todayISO())
  const [customDate, setCustomDate] = useState('')
  const [dateMode,  setDateMode]  = useState<'today' | 'tomorrow' | 'custom'>('today')
  const [error,     setError]     = useState('')
  const [plan,      setPlan]      = useState<DayPlan | null>(null)
  const [weather,   setWeather]   = useState<DayWeather | null>(null)
  const [location,  setLocation]  = useState('')
  const [homeCityData, setHomeCityData] = useState<{ home_city?: string; group_type?: string } | null>(null)
  const [saved,     setSaved]     = useState(false)
  const [saving,    setSaving]    = useState(false)

  // Load home city from onboarding
  useEffect(() => {
    async function load() {
      try {
        const supabase = getSupabaseClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data } = await supabase
          .from('onboarding_responses')
          .select('home_city, group_type')
          .eq('user_id', user.id)
          .single()
        if (data) setHomeCityData(data)
      } catch { /* silent */ }
    }
    load()
  }, [])

  // Sync date from mode
  useEffect(() => {
    if (dateMode === 'today')    setDate(todayISO())
    if (dateMode === 'tomorrow') setDate(tomorrowISO())
    if (dateMode === 'custom' && customDate) setDate(customDate)
  }, [dateMode, customDate])

  const handleGenerate = useCallback(async () => {
    if (!place.trim()) { setError('Enter a place first'); return }
    setError('')
    setPhase('loading')

    try {
      const res = await fetch('/api/plan/day', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          place: place.trim(),
          date,
          home_city:  homeCityData?.home_city,
          group_type: homeCityData?.group_type,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Failed to generate plan')
      }

      const data = await res.json()
      setPlan(data.plan)
      setWeather(data.weather)
      setLocation(data.location)
      setSaved(false)
      setPhase('result')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setPhase('input')
    }
  }, [place, date, homeCityData])

  const handleSave = useCallback(async () => {
    if (!plan || !weather || saving || saved) return
    setSaving(true)
    try {
      const supabase = getSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase.from('saved_day_plans').insert({
        user_id:          user.id,
        place:            place.trim(),
        date,
        location_display: location,
        plan:             plan,
        weather:          weather,
      })
      setSaved(true)
    } catch (e) {
      console.error('[save day plan]', e)
    } finally {
      setSaving(false)
    }
  }, [plan, weather, place, date, location, saving, saved])

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-[#0d1f35] flex flex-col items-center justify-center px-6 pb-20">
        <div className="text-center">
          <div className="text-4xl mb-6 animate-pulse">☀️</div>
          <p className="text-white/60 text-sm mb-2">Checking the weather…</p>
          <p className="text-white/30 text-xs">Building your day plan</p>
        </div>
      </div>
    )
  }

  // ── Result ───────────────────────────────────────────────────────────────────
  if (phase === 'result' && plan && weather) {
    return (
      <div className="min-h-screen bg-[#0d1f35] pb-24">
        <div className="max-w-lg mx-auto px-4 pt-8">

          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setPhase('input')}
                className="text-white/35 text-xs hover:text-white/60 transition-colors flex items-center gap-1"
              >
                ← New plan
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all ${
                  saved
                    ? 'border-[#C97552]/40 bg-[#C97552]/15 text-[#C97552]'
                    : 'border-white/15 text-white/45 hover:border-white/30 hover:text-white/70'
                }`}
              >
                <span>{saved ? '✓' : '🔖'}</span>
                <span>{saving ? 'Saving…' : saved ? 'Saved' : 'Save plan'}</span>
              </button>
            </div>
            <p className="text-[#C97552]/70 text-[11px] font-label tracking-widest uppercase mb-1">
              {formatDateLabel(date)}
            </p>
            <h1 className="font-serif italic text-3xl text-white leading-tight mb-2">
              {plan.title}
            </h1>
            <p className="text-white/50 text-sm leading-relaxed">{plan.summary}</p>
          </div>

          {/* Weather */}
          <WeatherStrip weather={weather} location={location} />

          {/* Weather note */}
          {plan.weather_note && (
            <div className="flex gap-2 rounded-2xl border border-sky-400/20 bg-sky-400/6 px-4 py-3 mb-6">
              <span className="text-sm">🌤️</span>
              <p className="text-sky-300/80 text-sm leading-relaxed">{plan.weather_note}</p>
            </div>
          )}

          {/* Timeline */}
          <div className="mb-6">
            {plan.stops.map((stop, i) => (
              <StopCard key={i} stop={stop} index={i} total={plan.stops.length} />
            ))}
          </div>

          {/* Practical info */}
          {plan.practical && (
            <div className="rounded-2xl border border-white/8 bg-white/3 px-5 py-4 mb-6 space-y-2">
              <p className="text-white/35 text-[10px] font-label tracking-widest uppercase mb-3">Good to know</p>
              {plan.practical.entry_fee && (
                <div className="flex gap-2 text-sm">
                  <span className="text-white/30 w-20 flex-shrink-0">Entry</span>
                  <span className="text-white/65">{plan.practical.entry_fee}</span>
                </div>
              )}
              {plan.practical.parking && (
                <div className="flex gap-2 text-sm">
                  <span className="text-white/30 w-20 flex-shrink-0">Parking</span>
                  <span className="text-white/65">{plan.practical.parking}</span>
                </div>
              )}
              {plan.practical.best_time_note && (
                <div className="flex gap-2 text-sm">
                  <span className="text-white/30 w-20 flex-shrink-0">Timing</span>
                  <span className="text-white/65">{plan.practical.best_time_note}</span>
                </div>
              )}
            </div>
          )}

          {/* Plan another */}
          <button
            onClick={() => { setPhase('input'); setPlace('') }}
            className="w-full py-3.5 rounded-full border border-white/15 text-white/50 text-sm hover:border-white/25 hover:text-white/70 transition-all"
          >
            Plan another day →
          </button>

        </div>
      </div>
    )
  }

  // ── Input ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0d1f35] flex flex-col pb-24">
      <div className="max-w-lg mx-auto w-full px-4 pt-10 flex-1 flex flex-col">

        {/* Title */}
        <div className="mb-10">
          <p className="text-xs text-white/30 uppercase tracking-widest font-label mb-3">Plan a Day</p>
          <h1 className="font-serif italic text-4xl text-white leading-tight mb-3">
            Where are you<br />heading today?
          </h1>
          <p className="text-white/40 text-sm">
            Type any place — a park, a drive, a neighbourhood, a beach. We'll build your day around the weather.
          </p>
        </div>

        {/* Place input */}
        <div className="mb-6">
          <label className="text-[11px] text-white/35 font-label tracking-widest uppercase block mb-2">
            Place or attraction
          </label>
          <input
            type="text"
            value={place}
            onChange={e => setPlace(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleGenerate()}
            placeholder="e.g. 17-Mile Drive, Yosemite, Golden Gate Park…"
            className="w-full bg-white/5 border border-white/12 rounded-2xl px-4 py-4 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-[#C97552]/50 transition-colors"
            autoFocus
          />
        </div>

        {/* Date selector */}
        <div className="mb-8">
          <label className="text-[11px] text-white/35 font-label tracking-widest uppercase block mb-2">
            When
          </label>
          <div className="flex gap-2 mb-3">
            {(['today', 'tomorrow', 'custom'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setDateMode(mode)}
                className={`flex-1 py-2.5 rounded-xl text-sm transition-all capitalize ${
                  dateMode === mode
                    ? 'bg-[#C97552]/20 border border-[#C97552]/40 text-[#C97552]'
                    : 'bg-white/4 border border-white/10 text-white/45 hover:text-white/65'
                }`}
              >
                {mode === 'custom' ? 'Pick date' : mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          {dateMode === 'custom' && (
            <input
              type="date"
              value={customDate}
              min={todayISO()}
              max={(() => { const d = new Date(); d.setDate(d.getDate() + 6); return d.toISOString().split('T')[0] })()}
              onChange={e => setCustomDate(e.target.value)}
              className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#C97552]/50 transition-colors"
            />
          )}
          {dateMode !== 'custom' && (
            <p className="text-white/25 text-xs mt-1 pl-1">{formatDateLabel(date)}</p>
          )}
        </div>

        {error && (
          <p className="text-red-400/80 text-sm mb-4">{error}</p>
        )}

        {/* CTA */}
        <button
          onClick={handleGenerate}
          disabled={!place.trim()}
          className="w-full py-4 rounded-full bg-[#C97552] text-white font-medium text-sm disabled:opacity-35 disabled:cursor-not-allowed hover:bg-[#b86642] transition-colors"
        >
          Plan my day →
        </button>

        {homeCityData?.home_city && (
          <p className="text-center text-white/20 text-xs mt-4">
            Starting from {homeCityData.home_city}
          </p>
        )}

      </div>
    </div>
  )
}
