'use client'

import { useState, useEffect, useCallback } from 'react'
import { getSupabaseClient } from '@/lib/supabase'
import type { DayPlan, DayWeather } from '@/app/api/plan/day/route'
import type {
  SmartDayPlan, SmartDayContext, SmartWeather, SmartStop,
  SmartDayResponse,
} from '@/app/api/plan/day/smart/route'

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
    case 'transport': return '🚌'
    default:          return '📍'
  }
}

/** Parse "9:51 AM" → total minutes since midnight */
function toMin(t: string): number {
  const [time, period] = t.trim().split(' ')
  let [h, m] = time.split(':').map(Number)
  if (period === 'PM' && h !== 12) h += 12
  if (period === 'AM' && h === 12) h = 0
  return h * 60 + m
}

/** "9:51 AM" → "2:30 PM" => "4h 39min" */
function timeDiff(from: string, to: string): string {
  try {
    const diff = toMin(to) - toMin(from)
    if (diff <= 0) return ''
    const h = Math.floor(diff / 60)
    const m = diff % 60
    if (h === 0) return `${m}min`
    if (m === 0) return `${h}h`
    return `${h}h ${m}min`
  } catch { return '' }
}

// ─── Weather strips ───────────────────────────────────────────────────────────

function SmartWeatherStrip({ weather, location }: { weather: SmartWeather; location: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/4 px-5 py-4 mb-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">{weather.emoji}</span>
          <div>
            <p className="text-white text-sm font-medium">{weather.label}</p>
            <p className="text-white/40 text-xs truncate max-w-[180px]">{location.split(',').slice(0, 2).join(',')}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-white text-sm font-medium">{weather.temp_high}° / {weather.temp_low}°{weather.unit}</p>
          <p className="text-white/40 text-xs">{weather.rain_pct}% rain</p>
        </div>
      </div>
    </div>
  )
}

function SimpleWeatherStrip({ weather, location }: { weather: DayWeather; location: string }) {
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

// ─── Live Stop Card ────────────────────────────────────────────────────────────

function LiveStopCard({
  stop, index, total, onMarkDone, onRemove,
}: {
  stop: SmartStop; index: number; total: number
  onMarkDone: (id: string) => void
  onRemove:   (id: string) => void
}) {
  const [open, setOpen] = useState(index === 0)

  return (
    <div className="relative flex gap-4">
      {/* Timeline spine */}
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-[#C97552]/15 border border-[#C97552]/30 flex items-center justify-center flex-shrink-0 z-10">
          <span className="text-sm">{stopTypeIcon(stop.type)}</span>
        </div>
        {index < total - 1 && (
          <div className="w-px flex-1 bg-white/8 mt-2 min-h-[24px]" />
        )}
      </div>

      {/* Card body */}
      <div className="flex-1 pb-5">
        <button onClick={() => setOpen(o => !o)} className="w-full text-left">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <p className="text-[#C97552]/80 text-[11px] font-label tracking-widest uppercase mb-0.5">
                {stop.time}{stop.time && stop.duration ? ' · ' : ''}{stop.duration}
              </p>
              <p className="text-white text-sm font-medium leading-snug">{stop.name}</p>
            </div>
            <span className={`text-white/30 text-xs mt-1 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
          </div>
        </button>

        {open && (
          <div className="mt-3 space-y-3">
            {stop.description && (
              <p className="text-white/60 text-sm leading-relaxed">{stop.description}</p>
            )}
            {stop.tip && (
              <div className="flex gap-2 rounded-xl bg-[#C97552]/8 border border-[#C97552]/20 px-3 py-2.5">
                <span className="text-xs mt-0.5">💡</span>
                <p className="text-[#C97552]/80 text-xs leading-relaxed">{stop.tip}</p>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => onMarkDone(stop.id)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400/80 hover:bg-emerald-500/20 transition-all"
              >
                ✅ Mark done
              </button>
              <button
                onClick={() => onRemove(stop.id)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-white/4 border border-white/10 text-white/35 hover:text-red-400/70 hover:border-red-400/20 transition-all"
              >
                🗑️ Remove
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Completed row ────────────────────────────────────────────────────────────

function CompletedRow({ name, time }: { name: string; time?: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="text-sm opacity-70">✅</span>
      <p className="flex-1 text-white/35 text-sm line-through truncate">{name}</p>
      {time && <p className="text-white/20 text-xs flex-shrink-0">{time}</p>}
    </div>
  )
}

// ─── Add stop inline ──────────────────────────────────────────────────────────

function AddStopRow({ onAdd }: { onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  function submit() {
    const n = name.trim()
    if (!n) return
    onAdd(n)
    setName('')
    setOpen(false)
  }

  if (!open) {
    return (
      <div className="flex items-center gap-3 py-0.5 pl-10">
        <button
          onClick={() => setOpen(true)}
          className="text-[11px] text-white/20 hover:text-[#C97552]/60 transition-colors flex items-center gap-1"
        >
          + Add stop
        </button>
      </div>
    )
  }

  return (
    <div className="pl-10 pb-3 flex gap-2">
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false) }}
        placeholder="Place name…"
        className="flex-1 bg-white/6 border border-white/15 rounded-xl px-3 py-2 text-white text-xs placeholder:text-white/25 focus:outline-none focus:border-[#C97552]/40 transition-colors"
      />
      <button
        onClick={submit}
        className="text-xs px-3 py-2 rounded-xl bg-[#C97552]/20 border border-[#C97552]/30 text-[#C97552] hover:bg-[#C97552]/30 transition-all"
      >
        Add
      </button>
      <button
        onClick={() => { setOpen(false); setName('') }}
        className="text-xs px-2 py-2 text-white/30 hover:text-white/50 transition-colors"
      >
        ✕
      </button>
    </div>
  )
}

// ─── Simple mode stop card (unchanged) ───────────────────────────────────────

function StopCard({ stop, index, total }: { stop: DayPlan['stops'][0]; index: number; total: number }) {
  const [open, setOpen] = useState(index === 0)
  return (
    <div className="relative flex gap-4">
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-[#C97552]/15 border border-[#C97552]/30 flex items-center justify-center flex-shrink-0 z-10">
          <span className="text-sm">{stopTypeIcon(stop.type)}</span>
        </div>
        {index < total - 1 && (
          <div className="w-px flex-1 bg-white/8 mt-2 mb-0 min-h-[24px]" />
        )}
      </div>
      <div className="flex-1 pb-6">
        <button onClick={() => setOpen(o => !o)} className="w-full text-left">
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

// ─── Page ─────────────────────────────────────────────────────────────────────

type Phase = 'input' | 'loading' | 'result'

export default function PlanDayPage() {
  const [phase,       setPhase]       = useState<Phase>('input')
  const [place,       setPlace]       = useState('')
  const [date,        setDate]        = useState(todayISO())
  const [customDate,  setCustomDate]  = useState('')
  const [dateMode,    setDateMode]    = useState<'today' | 'tomorrow' | 'custom'>('today')
  const [context,     setContext]     = useState('')
  const [showContext, setShowContext] = useState(false)
  const [error,       setError]       = useState('')
  const [homeCityData, setHomeCityData] = useState<{ home_city?: string; group_type?: string } | null>(null)

  // Simple-mode result state
  const [simplePlan,    setSimplePlan]    = useState<DayPlan | null>(null)
  const [simpleWeather, setSimpleWeather] = useState<DayWeather | null>(null)
  const [saved,   setSaved]   = useState(false)
  const [saving,  setSaving]  = useState(false)

  // Smart-mode result state
  const [isSmartMode,    setIsSmartMode]    = useState(false)
  const [smartWeather,   setSmartWeather]   = useState<SmartWeather | null>(null)
  const [smartCtx,       setSmartCtx]       = useState<SmartDayContext | null>(null)
  const [stops,          setStops]          = useState<SmartStop[]>([])
  const [completedStops, setCompletedStops] = useState<SmartStop[]>([])
  const [preCompletedNames, setPreCompletedNames] = useState<string[]>([]) // from original context
  const [showCompleted,  setShowCompleted]  = useState(false)
  const [planTitle,      setPlanTitle]      = useState('')
  const [planSummary,    setPlanSummary]    = useState('')
  const [timeBudget,     setTimeBudget]     = useState('')
  const [location,       setLocation]       = useState('')
  const [replanning,     setReplanning]     = useState(false)

  // Load home city
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

  // ── Generate ──────────────────────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!place.trim()) { setError('Enter a place first'); return }
    setError('')
    setPhase('loading')
    setSaved(false)
    const hasCtx = context.trim().length > 0

    try {
      if (hasCtx) {
        // ── Smart mode ────────────────────────────────────────────────────────
        const res = await fetch('/api/plan/day/smart', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ place: place.trim(), date, context: context.trim() }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error ?? 'Failed to generate plan')
        }
        const data = await res.json() as SmartDayResponse

        setIsSmartMode(true)
        setSmartWeather(data.weather)
        setSmartCtx(data.context)
        setLocation(data.location)
        setPlanTitle(data.plan.title)
        setPlanSummary(data.plan.summary)
        setTimeBudget(data.plan.time_budget)

        // Pre-completed names from context (already done BEFORE this session)
        const preNames = data.context.completed ?? []
        setPreCompletedNames(preNames)

        // Separate any stops GPT mistakenly included that are in completed list
        const preNamesLower = new Set(preNames.map(n => n.toLowerCase()))
        const remaining = data.plan.stops.filter(s => !preNamesLower.has(s.name.toLowerCase()))
        setStops(remaining)
        setCompletedStops([]) // reset live-session completed
        setShowCompleted(preNames.length > 0)
      } else {
        // ── Simple mode ───────────────────────────────────────────────────────
        const res = await fetch('/api/plan/day', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            place:      place.trim(),
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
        setIsSmartMode(false)
        setSimplePlan(data.plan)
        setSimpleWeather(data.weather)
        setLocation(data.location)
      }
      setPhase('result')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setPhase('input')
    }
  }, [place, date, context, homeCityData])

  // ── Live-edit actions ─────────────────────────────────────────────────────────

  const handleMarkDone = useCallback((id: string) => {
    setStops(prev => {
      const stop = prev.find(s => s.id === id)
      if (!stop) return prev
      setCompletedStops(c => [...c, { ...stop, done: true }])
      setShowCompleted(true)
      return prev.filter(s => s.id !== id)
    })
  }, [])

  const handleRemoveStop = useCallback((id: string) => {
    setStops(prev => prev.filter(s => s.id !== id))
  }, [])

  const handleAddStop = useCallback((afterIndex: number, name: string) => {
    const newStop: SmartStop = {
      id:          `stop-add-${Date.now()}`,
      time:        '',
      duration:    '',
      name,
      description: '',
      tip:         '',
      type:        'activity',
      done:        false,
    }
    setStops(prev => {
      const next = [...prev]
      next.splice(afterIndex + 1, 0, newStop)
      return next
    })
  }, [])

  const handleReplan = useCallback(async () => {
    if (replanning) return
    setReplanning(true)

    // Build a fresh context from live state
    const currentTime = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    const allDoneNames = [
      ...preCompletedNames,
      ...completedStops.map(s => s.name),
    ]
    const parts: string[] = []
    parts.push(`It is ${currentTime} now.`)
    if (allDoneNames.length > 0) parts.push(`Already done: ${allDoneNames.join(', ')}.`)
    if (smartCtx?.end_time && smartCtx?.end_place) {
      parts.push(`End by ${smartCtx.end_time} at ${smartCtx.end_place}.`)
    } else if (smartCtx?.end_time) {
      parts.push(`End by ${smartCtx.end_time}.`)
    }
    if (smartCtx?.group)              parts.push(`Group: ${smartCtx.group}.`)
    if (smartCtx?.must_dos?.length)   parts.push(`Must include: ${smartCtx.must_dos.join(', ')}.`)
    // Carry over any manually-added stops as must-dos
    const addedNames = stops.filter(s => s.id.startsWith('stop-add-')).map(s => s.name)
    if (addedNames.length)            parts.push(`Also include: ${addedNames.join(', ')}.`)

    const newCtx = parts.join(' ')

    try {
      const res = await fetch('/api/plan/day/smart', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ place: place.trim(), date, context: newCtx }),
      })
      if (!res.ok) throw new Error('Replan failed')
      const data = await res.json() as SmartDayResponse

      setSmartWeather(data.weather)
      setSmartCtx(prev => ({ ...prev, ...data.context }))
      setLocation(data.location)
      setPlanTitle(data.plan.title)
      setPlanSummary(data.plan.summary)
      setTimeBudget(data.plan.time_budget)

      const allDoneLower = new Set(allDoneNames.map(n => n.toLowerCase()))
      setStops(data.plan.stops.filter(s => !allDoneLower.has(s.name.toLowerCase())))
    } catch { /* silent — leave current stops intact */ }
    finally { setReplanning(false) }
  }, [replanning, place, date, preCompletedNames, completedStops, smartCtx, stops])

  // ── Save (simple mode) ────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!simplePlan || !simpleWeather || saving || saved) return
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
        plan:             simplePlan,
        weather:          simpleWeather,
      })
      setSaved(true)
    } catch (e) {
      console.error('[save day plan]', e)
    } finally {
      setSaving(false)
    }
  }, [simplePlan, simpleWeather, place, date, location, saving, saved])

  // ── Loading ───────────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-[#0d1f35] flex flex-col items-center justify-center px-6 pb-20">
        <div className="text-center">
          <div className="text-4xl mb-6 animate-pulse">☀️</div>
          <p className="text-white/60 text-sm mb-2">
            {context.trim() ? 'Reading your context…' : 'Checking the weather…'}
          </p>
          <p className="text-white/30 text-xs">Building your day plan</p>
        </div>
      </div>
    )
  }

  // ── Result — Smart Mode ───────────────────────────────────────────────────────

  if (phase === 'result' && isSmartMode) {
    const timeLeft = smartCtx?.current_time && smartCtx?.end_time
      ? timeDiff(smartCtx.current_time, smartCtx.end_time)
      : null
    const allCompletedNames = [...preCompletedNames, ...completedStops.map(s => s.name)]

    return (
      <div className="min-h-screen bg-[#0d1f35] pb-24">
        <div className="max-w-lg mx-auto px-4 pt-8">

          {/* Header */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setPhase('input')}
                className="text-white/35 text-xs hover:text-white/60 transition-colors"
              >
                ← New plan
              </button>
              <button
                onClick={handleReplan}
                disabled={replanning}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-[#C97552]/30 text-[#C97552]/70 hover:bg-[#C97552]/10 transition-all disabled:opacity-40"
              >
                {replanning ? '⏳ Replanning…' : '↺ Replan remaining'}
              </button>
            </div>
            <p className="text-[#C97552]/70 text-[11px] font-label tracking-widest uppercase mb-1">
              {formatDateLabel(date)}
            </p>
            <h1 className="font-serif italic text-3xl text-white leading-tight mb-2">
              {planTitle}
            </h1>
            <p className="text-white/50 text-sm leading-relaxed mb-3">{planSummary}</p>

            {/* Chips: time budget + time left */}
            <div className="flex flex-wrap items-center gap-2">
              {timeBudget && (
                <span className="text-xs text-white/40 bg-white/5 border border-white/8 rounded-full px-3 py-1">
                  ⏱ {timeBudget}
                </span>
              )}
              {timeLeft && (
                <span className="text-xs text-amber-300/60 bg-amber-400/8 border border-amber-400/15 rounded-full px-3 py-1">
                  🏁 {timeLeft} left{smartCtx?.end_place ? ` · ${smartCtx.end_place}` : ''}
                </span>
              )}
              {smartCtx?.group && (
                <span className="text-xs text-white/30 bg-white/4 border border-white/8 rounded-full px-3 py-1">
                  👥 {smartCtx.group}
                </span>
              )}
            </div>
          </div>

          {/* Weather */}
          {smartWeather && <SmartWeatherStrip weather={smartWeather} location={location} />}

          {/* Completed section */}
          {allCompletedNames.length > 0 && (
            <div className="mb-5">
              <button
                onClick={() => setShowCompleted(o => !o)}
                className="w-full flex items-center justify-between py-2 text-xs text-white/35 hover:text-white/55 transition-colors"
              >
                <span>✅ Completed ({allCompletedNames.length})</span>
                <span className={`transition-transform duration-200 ${showCompleted ? 'rotate-180' : ''}`}>▾</span>
              </button>
              {showCompleted && (
                <div className="rounded-2xl border border-white/8 bg-white/2 px-4 divide-y divide-white/5">
                  {preCompletedNames.map((n, i) => (
                    <CompletedRow key={`pre-${i}`} name={n} />
                  ))}
                  {completedStops.map(s => (
                    <CompletedRow key={s.id} name={s.name} time={s.time} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Live timeline */}
          {stops.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-4xl mb-4">🎉</p>
              <p className="text-white/50 text-sm mb-1">All stops complete!</p>
              <p className="text-white/25 text-xs mb-6">Great day at {place}</p>
              <button
                onClick={() => { setPhase('input'); setPlace('') }}
                className="text-xs text-[#C97552]/60 hover:text-[#C97552] transition-colors"
              >
                Plan another day →
              </button>
            </div>
          ) : (
            <div className="mb-6">
              {stops.map((stop, i) => (
                <div key={stop.id}>
                  <LiveStopCard
                    stop={stop}
                    index={i}
                    total={stops.length}
                    onMarkDone={handleMarkDone}
                    onRemove={handleRemoveStop}
                  />
                  <AddStopRow onAdd={name => handleAddStop(i, name)} />
                </div>
              ))}
              <button
                onClick={() => { setPhase('input'); setPlace('') }}
                className="w-full mt-4 py-3.5 rounded-full border border-white/15 text-white/50 text-sm hover:border-white/25 hover:text-white/70 transition-all"
              >
                Plan another day →
              </button>
            </div>
          )}

        </div>
      </div>
    )
  }

  // ── Result — Simple Mode ──────────────────────────────────────────────────────

  if (phase === 'result' && !isSmartMode && simplePlan && simpleWeather) {
    return (
      <div className="min-h-screen bg-[#0d1f35] pb-24">
        <div className="max-w-lg mx-auto px-4 pt-8">

          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setPhase('input')}
                className="text-white/35 text-xs hover:text-white/60 transition-colors"
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
              {simplePlan.title}
            </h1>
            <p className="text-white/50 text-sm leading-relaxed">{simplePlan.summary}</p>
          </div>

          <SimpleWeatherStrip weather={simpleWeather} location={location} />

          {simplePlan.weather_note && (
            <div className="flex gap-2 rounded-2xl border border-sky-400/20 bg-sky-400/6 px-4 py-3 mb-6">
              <span className="text-sm">🌤️</span>
              <p className="text-sky-300/80 text-sm leading-relaxed">{simplePlan.weather_note}</p>
            </div>
          )}

          <div className="mb-6">
            {simplePlan.stops.map((stop, i) => (
              <StopCard key={i} stop={stop} index={i} total={simplePlan.stops.length} />
            ))}
          </div>

          {simplePlan.practical && (
            <div className="rounded-2xl border border-white/8 bg-white/3 px-5 py-4 mb-6 space-y-2">
              <p className="text-white/35 text-[10px] font-label tracking-widest uppercase mb-3">Good to know</p>
              {simplePlan.practical.entry_fee && (
                <div className="flex gap-2 text-sm">
                  <span className="text-white/30 w-20 flex-shrink-0">Entry</span>
                  <span className="text-white/65">{simplePlan.practical.entry_fee}</span>
                </div>
              )}
              {simplePlan.practical.parking && (
                <div className="flex gap-2 text-sm">
                  <span className="text-white/30 w-20 flex-shrink-0">Parking</span>
                  <span className="text-white/65">{simplePlan.practical.parking}</span>
                </div>
              )}
              {simplePlan.practical.best_time_note && (
                <div className="flex gap-2 text-sm">
                  <span className="text-white/30 w-20 flex-shrink-0">Timing</span>
                  <span className="text-white/65">{simplePlan.practical.best_time_note}</span>
                </div>
              )}
            </div>
          )}

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

  // ── Input ─────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0d1f35] flex flex-col pb-24">

      {/* Atmospheric hero */}
      <div className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-12"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1473163928189-364b2c4e1135?w=1200&q=80&auto=format')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0d1f35]/50 to-[#0d1f35]" />
        <div className="relative max-w-lg mx-auto w-full px-4 pt-10 pb-6">
          <p className="text-xs text-white/30 uppercase tracking-widest font-label mb-3">Plan a Day</p>
          <h1 className="font-serif italic text-4xl text-white leading-tight mb-3">
            Where are you<br />heading today?
          </h1>
          <p className="text-white/40 text-sm">
            Type any place — a park, a drive, a neighbourhood, a beach. We'll build your day around the weather.
          </p>
        </div>
      </div>

      <div className="max-w-lg mx-auto w-full px-4 flex-1 flex flex-col">

        {/* Place input */}
        <div className="mb-6">
          <label className="text-[11px] text-white/35 font-label tracking-widest uppercase block mb-2">
            Place or attraction
          </label>
          <input
            type="text"
            value={place}
            onChange={e => setPlace(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !showContext && handleGenerate()}
            placeholder="e.g. Fisherman's Wharf, Golden Gate Park, Yosemite…"
            className="w-full bg-white/5 border border-white/12 rounded-2xl px-4 py-4 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-[#C97552]/50 transition-colors"
            autoFocus
          />
        </div>

        {/* Date selector */}
        <div className="mb-6">
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
          {dateMode === 'custom' ? (
            <input
              type="date"
              value={customDate}
              min={todayISO()}
              max={(() => { const d = new Date(); d.setDate(d.getDate() + 6); return d.toISOString().split('T')[0] })()}
              onChange={e => setCustomDate(e.target.value)}
              className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#C97552]/50 transition-colors"
            />
          ) : (
            <p className="text-white/25 text-xs mt-1 pl-1">{formatDateLabel(date)}</p>
          )}
        </div>

        {/* Context — collapsible */}
        <div className="mb-8">
          <button
            onClick={() => setShowContext(o => !o)}
            className="flex items-center gap-2 text-xs text-white/30 hover:text-white/55 transition-colors mb-3"
          >
            <span className={`transition-transform duration-200 ${showContext ? 'rotate-90' : ''}`}>▶</span>
            <span>{showContext ? 'Hide context' : 'Add context'}</span>
            {!showContext && (
              <span className="text-white/18 ml-1">— time, completed stops, group, end time…</span>
            )}
          </button>
          {showContext && (
            <div>
              <textarea
                value={context}
                onChange={e => setContext(e.target.value)}
                placeholder={`e.g. "It's 9:51 AM. Pier 39 and Ghirardelli Square are done. Need to end at Boudin Bakery by 2:30 PM. Travelling with 1 elderly person. Want to take the cable car and see Lombard Street."`}
                rows={4}
                className="w-full bg-white/5 border border-white/12 rounded-2xl px-4 py-3.5 text-white placeholder:text-white/20 text-sm leading-relaxed focus:outline-none focus:border-[#C97552]/50 transition-colors resize-none"
              />
              <p className="text-white/20 text-[11px] mt-2 pl-1">
                Describe your situation naturally — current time, completed stops, group needs, must-visit places.
              </p>
            </div>
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
          {context.trim() ? 'Build smart plan →' : 'Plan my day →'}
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
