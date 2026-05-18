'use client'

import { useState, useEffect } from 'react'
import type { ItineraryDay, ItineraryBlock } from '@/app/api/itinerary/route'

interface Dest {
  destination_name: string
  country:          string
  start_date:       string
  end_date:         string
  days:             number
  itinerary_json:   ItineraryDay[] | null
}

interface Props {
  startDate: string   // YYYY-MM-DD trip start
  endDate:   string   // YYYY-MM-DD trip end
  dests:     Dest[]
}

/** Returns YYYY-MM-DD in local time */
function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Days between two YYYY-MM-DD strings (end − start) */
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000)
}

/** 24h "HH:MM" → display "9:00 AM" */
function fmt12(t: string): string {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

export default function LiveModeStrip({ startDate, endDate, dests }: Props) {
  const [today,       setToday]       = useState('')
  const [done,        setDone]        = useState<Set<string>>(new Set())
  const [collapsed,   setCollapsed]   = useState(false)

  // Hydrate today on client — avoids SSR/client mismatch
  useEffect(() => { setToday(todayLocal()) }, [])

  // Persist checked-off activities in localStorage
  useEffect(() => {
    if (!today) return
    const saved = localStorage.getItem(`vondrer-live-done-${today}`)
    if (saved) setDone(new Set(JSON.parse(saved) as string[]))
  }, [today])

  function toggle(key: string) {
    setDone(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      localStorage.setItem(`vondrer-live-done-${today}`, JSON.stringify([...next]))
      return next
    })
  }

  // Only render once today is known (avoids hydration flash)
  if (!today) return null

  const tripStart = startDate
  const tripEnd   = endDate

  // Not on trip yet
  if (today < tripStart) {
    const daysUntil = daysBetween(today, tripStart)
    return (
      <div className="mx-4 mt-4 mb-0 bg-[#C97552]/10 border border-[#C97552]/20 rounded-2xl px-4 py-3 flex items-center gap-3">
        <span className="text-xl">🧳</span>
        <div>
          <p className="text-sm font-semibold text-[#1A1A1A]">
            {daysUntil === 1 ? 'Your trip starts tomorrow!' : `${daysUntil} days until your trip`}
          </p>
          <p className="text-xs text-[#6b5f54]">Get ready — your itinerary is below.</p>
        </div>
      </div>
    )
  }

  // Trip is over
  if (today > tripEnd) {
    return (
      <div className="mx-4 mt-4 mb-0 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-center gap-3">
        <span className="text-xl">✅</span>
        <div>
          <p className="text-sm font-semibold text-[#1A1A1A]">Hope you had an amazing trip!</p>
          <p className="text-xs text-[#6b5f54]">Share a review or plan your next adventure with Vondrer.</p>
        </div>
      </div>
    )
  }

  // ── Active trip day ──────────────────────────────────────────────────────────
  const globalDay = daysBetween(tripStart, today) + 1   // 1-based

  // Find which destination today belongs to and what the day looks like
  let todayDayData: ItineraryDay | null = null
  let todayDest: Dest | null = null

  let runningDay = 0
  for (const dest of dests) {
    const destStart = daysBetween(tripStart, dest.start_date)  // offset in global days
    const localDay  = globalDay - (destStart + 1) + 1         // 1-based within this dest
    if (localDay >= 1 && localDay <= dest.days) {
      todayDest = dest
      const days: ItineraryDay[] = Array.isArray(dest.itinerary_json) ? dest.itinerary_json : []
      todayDayData = days.find(d => d.day === localDay) ?? null
      break
    }
    runningDay += dest.days
  }

  const slots: Array<{ key: string; label: string; block: ItineraryBlock }> = []
  if (todayDayData) {
    if (todayDayData.morning)   slots.push({ key: `${globalDay}-morning`,   label: '🌅 Morning',   block: todayDayData.morning   })
    if (todayDayData.afternoon) slots.push({ key: `${globalDay}-afternoon`, label: '☀️ Afternoon', block: todayDayData.afternoon })
    if (todayDayData.dinner)    slots.push({ key: `${globalDay}-dinner`,    label: '🍽️ Dinner',    block: todayDayData.dinner    })
    if (todayDayData.evening)   slots.push({ key: `${globalDay}-evening`,   label: '🌙 Evening',   block: todayDayData.evening   })
  }

  const totalDone = slots.filter(s => done.has(s.key)).length

  return (
    <div className="mx-4 mt-4 mb-0 bg-white border border-[#C97552]/30 rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#C97552] text-white"
      >
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
          </span>
          <span className="text-sm font-semibold">You&apos;re on your trip! — Day {globalDay}</span>
        </div>
        <div className="flex items-center gap-3">
          {slots.length > 0 && (
            <span className="text-xs bg-white/20 rounded-full px-2.5 py-0.5 font-medium">
              {totalDone}/{slots.length} done
            </span>
          )}
          <span className="text-white/80 text-xs">{collapsed ? '▼' : '▲'}</span>
        </div>
      </button>

      {!collapsed && (
        <div className="divide-y divide-[#F0EBE3]">
          {/* Destination context */}
          {todayDest && (
            <div className="px-4 py-2 bg-[#FAF8F5]">
              <p className="text-xs text-[#9A8E7E]">
                📍 {todayDest.destination_name}, {todayDest.country}
                {todayDayData && <span className="ml-2 text-[#C97552]/70">· {todayDayData.title}</span>}
              </p>
            </div>
          )}

          {/* Today's activities checklist */}
          {slots.length === 0 ? (
            <div className="px-4 py-4 text-sm text-[#9A8E7E] italic text-center">
              No activities found for today.
            </div>
          ) : (
            slots.map(({ key, label, block }) => {
              const isDone = done.has(key)
              return (
                <div key={key} className={`flex items-start gap-3 px-4 py-3 transition-colors ${isDone ? 'bg-emerald-50/60' : 'bg-white'}`}>
                  {/* Checkbox */}
                  <button
                    onClick={() => toggle(key)}
                    className={`mt-0.5 w-5 h-5 flex-shrink-0 rounded-full border-2 flex items-center justify-center transition-all ${
                      isDone
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : 'border-[#D8D0C4] hover:border-[#C97552]'
                    }`}
                  >
                    {isDone && (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-[11px] text-[#9A8E7E] uppercase tracking-widest`}>{label}</p>
                      {(block.start_time || block.end_time) && (
                        <span className="text-[11px] text-[#C97552] font-medium tabular-nums flex-shrink-0">
                          {block.start_time ? fmt12(block.start_time) : ''}
                          {block.start_time && block.end_time ? ' – ' : ''}
                          {block.end_time ? fmt12(block.end_time) : ''}
                        </span>
                      )}
                    </div>
                    <p className={`text-sm font-medium mt-0.5 ${isDone ? 'line-through text-[#9A8E7E]' : 'text-[#1A1A1A]'}`}>
                      {block.activity}
                    </p>
                    {!isDone && block.insider_tip && (
                      <p className="text-xs text-[#C97552]/70 italic mt-0.5">💡 {block.insider_tip}</p>
                    )}
                  </div>
                </div>
              )
            })
          )}

          {/* Progress bar when activities exist */}
          {slots.length > 0 && (
            <div className="px-4 py-3 bg-[#FAF8F5] flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-[#E8E0D6] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#C97552] rounded-full transition-all duration-500"
                  style={{ width: `${(totalDone / slots.length) * 100}%` }}
                />
              </div>
              <p className="text-xs text-[#9A8E7E] flex-shrink-0">
                {totalDone === slots.length
                  ? '🎉 Day complete!'
                  : `${slots.length - totalDone} left`}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
