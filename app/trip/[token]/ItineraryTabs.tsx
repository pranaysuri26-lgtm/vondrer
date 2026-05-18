'use client'

import { useState, useEffect, useRef } from 'react'
import type { ItineraryDay, ItineraryBlock } from '@/app/api/itinerary/route'
import type { SunTimes } from '@/lib/sun'
import type { DealsResult, DealTip, HotelPick } from '@/app/api/trip/[tripId]/deals/route'
import EditableBlock from './EditableBlock'
import BudgetPanel from './BudgetPanel'
import DestSpotlights from './DestSpotlights'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SerializableDest {
  id:               string
  destination_name: string
  country:          string
  days:             number
  start_date:       string
  end_date:         string
  itinerary_json:   ItineraryDay[] | null
  notes:            string | null
}

interface Props {
  dests:       SerializableDest[]
  sunTimesMap: Record<string, SunTimes | null>
  totalDays:   number
  startDate:   string
  endDate:     string
  isOwner?:    boolean
  tripId?:     string
}

// ─── Pure date helpers ─────────────────────────────────────────────────────────

function formatDateRange(start: string, end: string): string {
  if (!start) return ''
  const s    = new Date(start + 'T12:00:00')
  const e    = new Date(end   + 'T12:00:00')
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  if (start === end) return s.toLocaleDateString('en-US', opts)
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear())
    return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${e.getDate()}, ${e.getFullYear()}`
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', opts)}`
}

function formatDayDate(destStartDate: string, dayIndex: number): string {
  const d = new Date(destStartDate + 'T12:00:00')
  d.setDate(d.getDate() + dayIndex)
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** "09:00" → "9:00 AM" */
function fmt12(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12    = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

function fmtWindow(start?: string, end?: string): string {
  if (!start) return ''
  return end ? `${fmt12(start)} – ${fmt12(end)}` : fmt12(start)
}

import { useWikiPhoto } from '@/hooks/useWikiPhoto'

// ─── Slot color / gradient fallback ───────────────────────────────────────────

const SLOT_BG: Record<string, string> = {
  '🌅 Morning':   'from-amber-100  to-orange-50',
  '☀️ Afternoon': 'from-sky-100    to-blue-50',
  '🍽️ Dinner':    'from-rose-100   to-red-50',
  '🌙 Evening':   'from-indigo-100 to-purple-50',
}

// ─── Block card ────────────────────────────────────────────────────────────────

function BlockCard({
  label, block, stopNum, destination,
}: {
  label:       string
  block:       ItineraryBlock
  stopNum:     number
  destination: string
}) {
  const photo = useWikiPhoto(block.activity, destination, block.photo_url)
  const time  = fmtWindow(block.start_time, block.end_time)

  return (
    <div className="space-y-0">
      {/* Photo */}
      {photo ? (
        <div className="relative h-40 -mx-5 mb-3 overflow-hidden first:rounded-t-2xl">
          <img
            src={photo} alt={block.activity}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
        </div>
      ) : (
        <div className={`relative h-20 -mx-5 mb-3 bg-gradient-to-br ${SLOT_BG[label] ?? 'from-stone-100 to-stone-50'} first:rounded-t-2xl`} />
      )}

      {/* Stop badge + label + time */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-[#C97552] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
            {stopNum}
          </span>
          <p className="text-xs text-[#8A7E6E] uppercase tracking-widest">{label}</p>
        </div>
        {time && (
          <span className="text-xs text-[#C97552] font-medium tabular-nums flex-shrink-0">{time}</span>
        )}
      </div>

      {/* Activity + details */}
      <p className="text-[#1A1A1A] font-semibold text-sm mb-1">{block.activity}</p>
      <p className="text-[#5A504A] text-sm leading-relaxed">{block.description}</p>
      {block.insider_tip && (
        <p className="text-[#C97552]/80 text-xs italic mt-1">💡 {block.insider_tip}</p>
      )}
      <p className="text-[#8A7E6E] text-xs mt-1">{block.estimated_cost}</p>

      {/* Also-visit sub-stops */}
      {block.also_visit && block.also_visit.length > 0 && (
        <div className="mt-2.5 space-y-2 border-l-2 border-[#E8E0D6] pl-3">
          {block.also_visit.map((stop, i) => (
            <div key={i} className="space-y-0.5">
              <p className="text-[#1A1A1A] font-medium text-xs">↳ {stop.activity}</p>
              <p className="text-[#5A504A] text-xs leading-relaxed">{stop.description}</p>
              <p className="text-[#8A7E6E] text-[11px]">{stop.estimated_cost}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Travel connector between stops ───────────────────────────────────────────

function TravelConnector({ from, to }: { from?: string; to?: string }) {
  // Simple visual gap with dotted line — real distances would need Maps API
  const gap = (from && to)
    ? (() => {
        const [fh] = from.split(':').map(Number)
        const [th] = to.split(':').map(Number)
        const diff = th - fh
        if (diff <= 0) return null
        return diff <= 1 ? '~45 min gap' : `~${diff}h gap`
      })()
    : null

  return (
    <div className="flex items-center gap-3 py-2 px-5">
      <div className="flex flex-col items-center gap-0.5">
        <div className="w-px h-2 bg-[#D8D0C4]" />
        <div className="w-1 h-1 rounded-full bg-[#B8B0A4]" />
        <div className="w-px h-2 bg-[#D8D0C4]" />
      </div>
      <p className="text-[11px] text-[#B8B0A4] italic">
        {gap ? `${gap} · travel to next stop` : 'Travel to next stop'}
      </p>
    </div>
  )
}

// ─── Day card (sequential numbered timeline) ───────────────────────────────────

function DayCard({ day, destination }: { day: ItineraryDay; destination: string }) {
  const slots: Array<{ label: string; block: ItineraryBlock }> = [
    { label: '🌅 Morning',   block: day.morning   },
    { label: '☀️ Afternoon', block: day.afternoon },
    ...(day.dinner  ? [{ label: '🍽️ Dinner',   block: day.dinner   }] : []),
    { label: '🌙 Evening',   block: day.evening   },
  ]

  return (
    <div className="bg-white border border-[#E8E0D6] rounded-2xl overflow-hidden">
      {/* Day header */}
      <div className="px-5 py-3.5 border-b border-[#F0EBE3] flex items-baseline justify-between">
        <h4 className="font-serif italic text-base text-[#1A1A1A] leading-tight pr-4">{day.title}</h4>
        <span className="text-xs text-[#9A8E7E] flex-shrink-0">Day {day.day}</span>
      </div>

      {/* Stops */}
      {slots.map(({ label, block }, i) => (
        <div key={i}>
          <div className="px-5 pt-4 pb-4">
            <BlockCard label={label} block={block} stopNum={i + 1} destination={destination} />
          </div>
          {i < slots.length - 1 && (
            <TravelConnector from={block.end_time} to={slots[i + 1].block.start_time} />
          )}
          {i < slots.length - 1 && (
            <div className="border-t border-[#F8F4F0]" />
          )}
        </div>
      ))}

      {/* Day total */}
      <div className="px-5 py-3 border-t border-[#E8E0D6] flex justify-end bg-[#FAF8F5]">
        <span className="text-xs text-[#C97552]/70">Day total: ~{day.day_total_estimate}</span>
      </div>
    </div>
  )
}

// ─── Golden hour strip ─────────────────────────────────────────────────────────

function GoldenHourStrip({ sun }: { sun: SunTimes }) {
  return (
    <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 mb-4">
      <p className="text-[10px] text-amber-300/60 tracking-widest uppercase mb-2.5">
        📷 Photo windows · {sun.date}
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-indigo-400/70">🌌</span>
          <span className="text-[#8A7E6E]">Blue AM</span>
          <span className="text-[#5A504A] tabular-nums ml-auto">{sun.blue_am_start}–{sun.blue_am_end}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-amber-500/70">🌅</span>
          <span className="text-[#8A7E6E]">Golden PM</span>
          <span className="text-[#C97552] tabular-nums ml-auto font-medium">{sun.golden_pm_start}–{sun.golden_pm_end}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-amber-500/70">🌅</span>
          <span className="text-[#8A7E6E]">Golden AM</span>
          <span className="text-[#C97552] tabular-nums ml-auto font-medium">{sun.golden_am_start}–{sun.golden_am_end}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-indigo-400/70">🌌</span>
          <span className="text-[#8A7E6E]">Blue PM</span>
          <span className="text-[#5A504A] tabular-nums ml-auto">{sun.blue_pm_start}–{sun.blue_pm_end}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Booking link card ─────────────────────────────────────────────────────────

function BookingLink({ href, title, subtitle, compact }: { href: string; title: string; subtitle: string; compact?: boolean }) {
  if (compact) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 flex items-center justify-between px-3 py-2.5 bg-white border border-[#E8E0D6] rounded-xl hover:border-[#C97552]/30 hover:bg-[#FFF8F5] transition-all group"
      >
        <div>
          <p className="font-medium text-xs text-[#1A1A1A]">{title}</p>
          <p className="text-[10px] text-[#8A7E6E]">{subtitle}</p>
        </div>
        <span className="text-[#C97552] text-xs group-hover:translate-x-0.5 transition-transform ml-1">→</span>
      </a>
    )
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between p-4 bg-white border border-[#E8E0D6] rounded-2xl hover:border-[#C97552]/30 hover:bg-[#FFF8F5] transition-all group"
    >
      <div>
        <p className="font-medium text-sm text-[#1A1A1A]">{title}</p>
        <p className="text-xs text-[#8A7E6E] mt-0.5">{subtitle}</p>
      </div>
      <span className="text-[#C97552] text-sm group-hover:translate-x-0.5 transition-transform flex-shrink-0">→</span>
    </a>
  )
}

function DealCard({ tip }: { tip: DealTip }) {
  return (
    <div className="flex gap-3 p-4 bg-white border border-[#E8E0D6] rounded-2xl">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-sm text-[#1A1A1A]">{tip.title}</p>
          {tip.badge && (
            <span className="text-[10px] bg-[#EAF4EF] text-[#3D7A5A] border border-[#C0DFD0] px-2 py-0.5 rounded-full font-medium flex-shrink-0">
              {tip.badge}
            </span>
          )}
        </div>
        <p className="text-xs text-[#6b5f54] mt-1 leading-relaxed">{tip.detail}</p>
      </div>
    </div>
  )
}

function HotelCard({ hotel }: { hotel: HotelPick }) {
  return (
    <a
      href={hotel.booking_url}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-4 bg-white border border-[#E8E0D6] rounded-2xl hover:border-[#C97552]/30 hover:bg-[#FFF8F5] transition-all group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm text-[#1A1A1A]">{hotel.name}</p>
            <span className="text-[10px] text-[#9A8E7E] bg-[#F0EBE3] px-2 py-0.5 rounded-full flex-shrink-0">
              {hotel.area}
            </span>
          </div>
          <p className="text-xs text-[#6b5f54] mt-1 leading-relaxed">{hotel.why}</p>
          <p className="text-xs text-[#C97552] font-medium mt-1.5">{hotel.price_range}</p>
        </div>
        <span className="text-[#C97552] text-sm group-hover:translate-x-0.5 transition-transform flex-shrink-0 mt-0.5">→</span>
      </div>
    </a>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function ItineraryTabs({ dests, sunTimesMap, totalDays, startDate, endDate, isOwner, tripId }: Props) {

  // ── Mutable local copy of destinations (optimistic update on block save) ──────
  const [localDests, setLocalDests] = useState<SerializableDest[]>(dests)

  function handleBlockUpdate(destId: string, day: number, slot: string, block: ItineraryBlock) {
    console.log('[handleBlockUpdate] destId:', destId, 'day:', day, 'slot:', slot, '| activity:', block.activity, '| desc:', block.description?.slice(0, 80))
    setLocalDests(prev => {
      const next = prev.map(dest => {
        if (dest.id !== destId) return dest
        const itinerary = (dest.itinerary_json ?? []).map(d =>
          d.day === day ? { ...d, [slot]: block } : d
        )
        return { ...dest, itinerary_json: itinerary }
      })
      // Look in the specific dest, not across all dests (avoids same day# in multiple dests)
      const updatedDest = next.find(d => d.id === destId)
      const updatedDay  = updatedDest?.itinerary_json?.find(d => d.day === day)
      console.log('[handleBlockUpdate] patched desc:', (updatedDay as any)?.[slot]?.description?.slice(0, 80))
      return next
    })
  }

  // Build a flat ordered list of every (globalDay, day, dest) across all destinations
  const allEntries = localDests.flatMap((dest, idx) => {
    const offset: number = localDests.slice(0, idx).reduce((s, d) => s + d.days, 0)
    const days: ItineraryDay[] = Array.isArray(dest.itinerary_json) ? dest.itinerary_json : []
    return days.map(day => ({
      globalDay: offset + day.day,
      dayIndex:  day.day - 1,   // 0-based index within this destination
      day,
      dest,
    }))
  })

  const [activeTab,    setActiveTab]    = useState<string>('overview')
  const [replanningDay, setReplanningDay] = useState<number | null>(null)

  // ── Jump to day tab when a map pin is clicked ──────────────────────────────
  useEffect(() => {
    function handlePinClick(e: Event) {
      const day = (e as CustomEvent<{ day: number }>).detail?.day
      if (!day) return
      const tabId = `day-${day}`
      setActiveTab(tabId)
      // Scroll the tab button into view (horizontal) + scroll page to top of tabs
      requestAnimationFrame(() => {
        document.getElementById(`tab-btn-${tabId}`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
        document.getElementById('itinerary-tabs-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
    window.addEventListener('vondrer-pin-click', handlePinClick)
    return () => window.removeEventListener('vondrer-pin-click', handlePinClick)
  }, [])

  // ── Notify map when active tab changes so it can filter pins ───────────────
  useEffect(() => {
    const dayMatch = activeTab.match(/^day-(\d+)$/)
    const day = dayMatch ? parseInt(dayMatch[1], 10) : null
    window.dispatchEvent(new CustomEvent('vondrer-tab-change', { detail: { day } }))
  }, [activeTab])

  // ── Deals: fetch once when the deals tab is first opened ──────────────────
  const [deals,        setDeals]        = useState<DealsResult | null>(null)
  const [dealsLoading, setDealsLoading] = useState(false)
  const [dealsError,   setDealsError]   = useState('')
  const dealsFetched = useRef(false)

  useEffect(() => {
    if (activeTab !== 'deals' || dealsFetched.current || !tripId) return
    dealsFetched.current = true
    setDealsLoading(true)
    fetch(`/api/trip/${tripId}/deals`)
      .then(r => r.json())
      .then((data: DealsResult & { error?: string }) => {
        if (data.error) setDealsError(data.error)
        else setDeals(data)
      })
      .catch(() => setDealsError('Could not load deals.'))
      .finally(() => setDealsLoading(false))
  }, [activeTab, tripId])
  const [replanReason,  setReplanReason]  = useState('')
  const [showReplanFor, setShowReplanFor] = useState<number | null>(null)
  const [addStopFor,    setAddStopFor]    = useState<{ destId: string; day: number } | null>(null)
  const [addStopForm,   setAddStopForm]   = useState({ activity: '', start_time: '', end_time: '', description: '', estimated_cost: '' })
  const [addStopSaving, setAddStopSaving] = useState(false)

  async function saveExtraStop() {
    if (!addStopFor || !addStopForm.activity.trim()) return
    setAddStopSaving(true)
    const block: import('@/app/api/itinerary/route').ItineraryBlock = {
      activity:       addStopForm.activity.trim(),
      description:    addStopForm.description.trim(),
      insider_tip:    '',
      estimated_cost: addStopForm.estimated_cost.trim(),
      start_time:     addStopForm.start_time || undefined,
      end_time:       addStopForm.end_time   || undefined,
    }
    // Optimistic update
    setLocalDests(prev => prev.map(d => {
      if (d.id !== addStopFor.destId) return d
      const itinerary = (d.itinerary_json ?? []).map(dy =>
        dy.day === addStopFor.day
          ? { ...dy, extra_stops: [...(dy.extra_stops ?? []), block] }
          : dy
      )
      return { ...d, itinerary_json: itinerary }
    }))
    await fetch(`/api/trip/${tripId}/extra-stop`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ destination_id: addStopFor.destId, day: addStopFor.day, block }),
    })
    setAddStopFor(null)
    setAddStopForm({ activity: '', start_time: '', end_time: '', description: '', estimated_cost: '' })
    setAddStopSaving(false)
  }

  async function replanDay(destId: string, dayNumber: number, destName: string, country: string, existingDay: ItineraryDay) {
    setReplanningDay(dayNumber)
    setShowReplanFor(null)
    try {
      const res = await fetch(`/api/trip/${tripId}/replan-day`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          destination_id:   destId,
          day_number:       dayNumber,
          destination_name: destName,
          country,
          reason:           replanReason.trim() || undefined,
          existing_day:     existingDay,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.day) return
      // Patch the day into localDests
      setLocalDests(prev => prev.map(dest => {
        if (dest.id !== destId) return dest
        const itinerary = (dest.itinerary_json ?? []).map(d => d.day === dayNumber ? data.day : d)
        return { ...dest, itinerary_json: itinerary }
      }))
      setReplanReason('')
    } finally {
      setReplanningDay(null)
    }
  }

  // ── Booking URLs (constructed server-free from prop data) ──────────────────
  const primaryDest   = localDests[0]?.destination_name ?? ''
  const lastDest      = localDests[localDests.length - 1]
  const checkIn       = startDate
  const checkOut      = lastDest?.end_date ?? endDate
  const destSlug      = primaryDest.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z-]/g, '')
  const dateSlug      = checkIn.replace(/-/g, '').slice(2)   // YYMMDD

  const skyscannerUrl    = `https://www.skyscanner.com/transport/flights/anywhere/${destSlug}/${dateSlug}/`
  const googleFlightsUrl = `https://www.google.com/travel/flights?q=flights+to+${encodeURIComponent(primaryDest)}`
  const bookingUrl       = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(primaryDest)}&checkin=${checkIn}&checkout=${checkOut}&group_adults=2`
  const googleHotelsUrl  = `https://www.google.com/travel/hotels?q=hotels+in+${encodeURIComponent(primaryDest)}&checkin=${checkIn}&checkout=${checkOut}`

  // ── Tab button ─────────────────────────────────────────────────────────────
  function TabBtn({ id, label }: { id: string; label: string }) {
    const active = activeTab === id
    return (
      <button
        id={`tab-btn-${id}`}
        onClick={() => setActiveTab(id)}
        className={`whitespace-nowrap px-4 py-3 text-xs font-medium border-b-2 transition-colors flex-shrink-0 ${
          active
            ? 'border-[#C97552] text-[#C97552]'
            : 'border-transparent text-[#8A7E6E] hover:text-[#5A504A] hover:border-[#D8D0C4]'
        }`}
      >
        {label}
      </button>
    )
  }

  return (
    <>
      {/* ── Sticky tab bar ─────────────────────────────────────────────────────── */}
      <div id="itinerary-tabs-top" className="sticky top-0 z-10 bg-[#FAF8F5]/96 backdrop-blur-sm border-b border-[#E8E0D6]">
        <div
          className="flex overflow-x-auto max-w-2xl mx-auto px-4"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
        >
          <TabBtn id="overview" label="Overview" />
          {allEntries.map(({ globalDay }) => (
            <TabBtn key={globalDay} id={`day-${globalDay}`} label={`Day ${globalDay}`} />
          ))}
          <TabBtn id="deals" label="✈️ Deals" />
          {isOwner && tripId && <TabBtn id="budget" label="💰 Budget" />}
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────────── */}
      <main className="max-w-2xl mx-auto px-4 py-8">

        {/* ─ Overview ──────────────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-12">
            {localDests.length === 0 && (
              <p className="text-[#9A8E7E] text-sm text-center py-12">No itinerary details saved for this trip.</p>
            )}

            {localDests.map((dest, idx) => {
              const dayOffset  = localDests.slice(0, idx).reduce((s, d) => s + d.days, 0)
              const days: ItineraryDay[] = Array.isArray(dest.itinerary_json) ? dest.itinerary_json : []
              const sun        = sunTimesMap[dest.id]

              return (
                <section key={dest.id}>
                  <div className="border-t border-[#E8E0D6] pt-6 mb-5">
                    <p className="text-xs text-[#9A8E7E] uppercase tracking-widest mb-1">
                      📍 {dest.destination_name.toUpperCase()}, {dest.country.toUpperCase()}
                      {' · '}
                      {dest.days === 1 ? `Day ${dayOffset + 1}` : `Days ${dayOffset + 1}–${dayOffset + dest.days}`}
                    </p>
                    <h2 className="font-serif italic text-2xl text-[#1A1A1A]">{dest.destination_name}</h2>
                    {dest.start_date && dest.end_date && (
                      <p className="text-[#8A7E6E] text-xs mt-0.5">{formatDateRange(dest.start_date, dest.end_date)}</p>
                    )}
                  </div>

                  {days.length > 0 ? (
                    <div className="space-y-4">
                      {sun && <GoldenHourStrip sun={sun} />}
                      {days.map(day => (
                        /* Clicking a day card jumps to that day tab */
                        <div key={day.day} onClick={() => setActiveTab(`day-${dayOffset + day.day}`)} className="cursor-pointer">
                          <DayCard day={day} destination={dest.destination_name} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[#9A8E7E] text-sm italic py-4">No itinerary generated for this destination.</p>
                  )}

                  <DestSpotlights dest={dest.destination_name} country={dest.country} />

                  {idx < localDests.length - 1 && (
                    <div className="mt-6 flex items-center gap-3 py-3 px-4 bg-white border border-[#E8E0D6] rounded-xl">
                      <span className="text-base">✈️</span>
                      <p className="text-sm text-[#6b5f54]">
                        <span className="text-[#1A1A1A]">{dest.destination_name}</span>
                        {' → '}
                        <span className="text-[#1A1A1A]">{localDests[idx + 1].destination_name}</span>
                      </p>
                    </div>
                  )}
                </section>
              )
            })}

            {/* Footer CTA */}
            <div className="border-t border-[#E8E0D6] pt-8 text-center space-y-3">
              <p className="text-[#6b5f54] text-sm">Want to plan your own trip?</p>
              <a
                href="https://getvondrer.com"
                className="inline-block bg-[#C97552] text-white text-sm font-semibold px-6 py-3 rounded-full hover:bg-[#b86644] transition-colors"
              >
                Plan with Vondrer →
              </a>
            </div>
          </div>
        )}

        {/* ─ Individual day tabs ────────────────────────────────────────────────── */}
        {allEntries.map(({ globalDay, dayIndex, day, dest }) => {
          if (activeTab !== `day-${globalDay}`) return null
          const sun      = sunTimesMap[dest.id]
          const canEdit  = !!(isOwner && tripId)

          // Context object so AI alternatives know what else is on this day
          const dayContext: Record<string, string | undefined> = {
            morning:   day.morning?.activity,
            afternoon: day.afternoon?.activity,
            dinner:    day.dinner?.activity,
            evening:   day.evening?.activity,
          }

          return (
            <div key={globalDay} className="space-y-4">
              {/* Destination + date context */}
              <div className="mb-1">
                <p className="text-xs text-[#9A8E7E] uppercase tracking-widest mb-0.5">
                  📍 {dest.destination_name}, {dest.country}
                </p>
                {dest.start_date && (
                  <p className="text-[#8A7E6E] text-xs">{formatDayDate(dest.start_date, dayIndex)}</p>
                )}
              </div>

              {sun && <GoldenHourStrip sun={sun} />}

              {/* Day card — sequential numbered timeline */}
              <div className="bg-white border border-[#E8E0D6] rounded-2xl overflow-hidden">
                {/* Header */}
                <div className="px-5 py-3.5 border-b border-[#F0EBE3] flex items-center justify-between gap-2">
                  <h4 className="font-serif italic text-base text-[#1A1A1A] leading-tight">{day.title}</h4>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-[#9A8E7E]">Day {day.day}</span>
                    {canEdit && (
                      <button
                        onClick={() => setShowReplanFor(showReplanFor === globalDay ? null : globalDay)}
                        disabled={replanningDay !== null}
                        className="text-[11px] text-[#C97552] border border-[#C97552]/30 rounded-full px-2.5 py-0.5 hover:bg-[#C97552]/5 disabled:opacity-40 transition-colors"
                      >
                        {replanningDay === globalDay ? '…regenerating' : '✨ Re-plan'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Re-plan panel */}
                {canEdit && showReplanFor === globalDay && (
                  <div className="px-5 py-3 bg-[#FFF8F5] border-b border-[#F0EBE3] flex gap-2">
                    <input
                      value={replanReason}
                      onChange={e => setReplanReason(e.target.value)}
                      placeholder="Optional: any constraints or vibe? (e.g. rainy day, more budget)"
                      className="flex-1 text-xs border border-[#E0D8CF] rounded-lg px-3 py-2 focus:outline-none focus:border-[#C97552]/60 bg-white"
                      onKeyDown={e => { if (e.key === 'Enter') replanDay(dest.id, day.day, dest.destination_name, dest.country, day) }}
                    />
                    <button
                      onClick={() => replanDay(dest.id, day.day, dest.destination_name, dest.country, day)}
                      className="text-xs bg-[#C97552] text-white px-4 py-2 rounded-lg hover:bg-[#b86644] transition-colors"
                    >
                      Go
                    </button>
                  </div>
                )}

                {/* Stops */}
                {(() => {
                  const slots: Array<{ label: string; slotKey: 'morning'|'afternoon'|'dinner'|'evening'; block: ItineraryBlock; stopNum: number }> = [
                    { label: '🌅 Morning',   slotKey: 'morning',   block: day.morning,   stopNum: 1 },
                    { label: '☀️ Afternoon', slotKey: 'afternoon', block: day.afternoon, stopNum: 2 },
                    ...(day.dinner ? [{ label: '🍽️ Dinner', slotKey: 'dinner' as const, block: day.dinner, stopNum: 3 }] : []),
                    { label: '🌙 Evening',   slotKey: 'evening',   block: day.evening,   stopNum: day.dinner ? 4 : 3 },
                  ]
                  return slots.map(({ label, slotKey, block, stopNum }, i) => (
                    <div key={slotKey}>
                      <div className="px-5 pt-4 pb-4">
                        {canEdit ? (
                          <EditableBlock
                            label={label} block={block}
                            tripId={tripId!} destId={dest.id} day={day.day} slot={slotKey}
                            destination={dest.destination_name} country={dest.country}
                            dayContext={dayContext}
                            stopNum={stopNum}
                            onSaved={b => handleBlockUpdate(dest.id, day.day, slotKey, b)}
                          />
                        ) : (
                          <BlockCard label={label} block={block} stopNum={stopNum} destination={dest.destination_name} />
                        )}
                      </div>
                      {i < slots.length - 1 && (
                        <>
                          <TravelConnector from={block.end_time} to={slots[i + 1].block.start_time} />
                          <div className="border-t border-[#F8F4F0]" />
                        </>
                      )}
                    </div>
                  ))
                })()}

                {/* Extra (user-added) stops */}
                {(day.extra_stops ?? []).length > 0 && (
                  <>
                    <div className="border-t border-[#F8F4F0]" />
                    {(day.extra_stops ?? []).map((stop, idx) => (
                      <div key={idx} className="px-5 pt-4 pb-4">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] text-[#9A8E7E] uppercase tracking-widest">
                                {stop.start_time ? `${stop.start_time}${stop.end_time ? ` – ${stop.end_time}` : ''}` : '+ Extra'}
                              </span>
                            </div>
                            <p className="font-semibold text-[#1A1A1A] text-sm">{stop.activity}</p>
                            {stop.description && <p className="text-[#5A504A] text-xs leading-relaxed mt-1">{stop.description}</p>}
                            {stop.insider_tip && <p className="text-[#C97552]/80 text-xs italic mt-1">💡 {stop.insider_tip}</p>}
                            {stop.estimated_cost && <p className="text-[#8A7E6E] text-xs mt-1">{stop.estimated_cost}</p>}
                          </div>
                          {canEdit && (
                            <button
                              onClick={() => {
                                setLocalDests(prev => prev.map(d => {
                                  if (d.id !== dest.id) return d
                                  const itinerary = (d.itinerary_json ?? []).map(dy =>
                                    dy.day === day.day
                                      ? { ...dy, extra_stops: (dy.extra_stops ?? []).filter((_, i) => i !== idx) }
                                      : dy
                                  )
                                  return { ...d, itinerary_json: itinerary }
                                }))
                                fetch(`/api/trip/${tripId}/extra-stop`, {
                                  method:  'DELETE',
                                  headers: { 'Content-Type': 'application/json' },
                                  body:    JSON.stringify({ destination_id: dest.id, day: day.day, index: idx }),
                                })
                              }}
                              className="flex-shrink-0 text-[#B8B0A4] hover:text-red-400 transition-colors p-1 mt-0.5"
                              title="Remove"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* Day total + Add stop */}
                <div className="px-5 py-3 border-t border-[#E8E0D6] flex items-center justify-between bg-[#FAF8F5]">
                  <span className="text-xs text-[#C97552]/70">Day total: ~{day.day_total_estimate}</span>
                  {canEdit && (
                    <button
                      onClick={() => setAddStopFor({ destId: dest.id, day: day.day })}
                      className="text-[11px] text-[#6b5f54] border border-[#D8D0C4] rounded-full px-3 py-1 hover:border-[#C97552]/40 hover:text-[#C97552] transition-colors"
                    >
                      + Add stop
                    </button>
                  )}
                </div>
              </div>

              {/* Prev / Next navigation */}
              <div className="flex gap-3 pt-2">
                {globalDay > 1 && (
                  <button
                    onClick={() => setActiveTab(`day-${globalDay - 1}`)}
                    className="flex-1 py-3 border border-[#E8E0D6] rounded-xl text-xs text-[#6b5f54] hover:border-[#D0C8BC] hover:text-[#1A1A1A] transition-colors text-left px-4"
                  >
                    ← Day {globalDay - 1}
                  </button>
                )}
                {globalDay < totalDays && (
                  <button
                    onClick={() => setActiveTab(`day-${globalDay + 1}`)}
                    className="flex-1 py-3 border border-[#E8E0D6] rounded-xl text-xs text-[#6b5f54] hover:border-[#D0C8BC] hover:text-[#1A1A1A] transition-colors text-right px-4"
                  >
                    Day {globalDay + 1} →
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {/* ─ Deals tab ──────────────────────────────────────────────────────────── */}
        {activeTab === 'deals' && (
          <div className="space-y-8">
            <div>
              <p className="text-xs text-[#9A8E7E] uppercase tracking-widest mb-1">Travel deals</p>
              <h2 className="font-serif italic text-2xl text-[#1A1A1A]">Flights &amp; Hotels</h2>
              {checkIn && (
                <p className="text-[#8A7E6E] text-sm mt-1">
                  {formatDateRange(checkIn, checkOut)} · {totalDays} {totalDays === 1 ? 'night' : 'nights'}
                </p>
              )}
            </div>

            {/* AI-generated deals */}
            {dealsLoading && (
              <div className="space-y-3">
                {[1,2,3,4].map(i => (
                  <div key={i} className="h-16 bg-[#F0EBE3] rounded-2xl animate-pulse" />
                ))}
                <p className="text-xs text-[#9A8E7E] text-center pt-1">Finding the best options for {primaryDest}…</p>
              </div>
            )}

            {dealsError && (
              <p className="text-sm text-red-400 text-center py-4">{dealsError}</p>
            )}

            {deals && !dealsLoading && (
              <>
                {/* Flight tips */}
                {deals.flight_tips?.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs text-[#9A8E7E] uppercase tracking-widest">✈️ Flights to {primaryDest}</p>
                    {deals.flight_tips.map((tip, i) => (
                      <DealCard key={i} tip={tip} />
                    ))}
                    <div className="flex gap-2 pt-1">
                      <BookingLink href={skyscannerUrl}    title="Skyscanner"     subtitle="All airlines" compact />
                      <BookingLink href={googleFlightsUrl} title="Google Flights" subtitle="Fare alerts"  compact />
                    </div>
                  </div>
                )}

                {/* Hotel picks */}
                {deals.hotel_picks?.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs text-[#9A8E7E] uppercase tracking-widest">🏨 Where to stay in {primaryDest}</p>
                    {deals.hotel_picks.map((hotel, i) => (
                      <HotelCard key={i} hotel={hotel} />
                    ))}
                    <div className="flex gap-2 pt-1">
                      <BookingLink href={bookingUrl}      title="Booking.com"   subtitle="Free cancellation" compact />
                      <BookingLink href={googleHotelsUrl} title="Google Hotels" subtitle="Compare prices"    compact />
                    </div>
                  </div>
                )}

                {/* Money tips */}
                {deals.money_tips?.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs text-[#9A8E7E] uppercase tracking-widest">💳 Money &amp; payments</p>
                    {deals.money_tips.map((tip, i) => (
                      <DealCard key={i} tip={tip} />
                    ))}
                  </div>
                )}

                {/* Local hacks */}
                {deals.local_hacks?.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs text-[#9A8E7E] uppercase tracking-widest">🗺️ Local hacks</p>
                    {deals.local_hacks.map((tip, i) => (
                      <DealCard key={i} tip={tip} />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Static search links shown before deals load */}
            {!deals && !dealsLoading && (
              <>
                <div className="space-y-2">
                  <p className="text-xs text-[#9A8E7E] uppercase tracking-widest">✈️ Flights to {primaryDest}</p>
                  <BookingLink href={skyscannerUrl}    title="Search on Skyscanner"    subtitle="Best price comparison across all airlines" />
                  <BookingLink href={googleFlightsUrl} title="Search on Google Flights" subtitle="Track prices and set fare alerts" />
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-[#9A8E7E] uppercase tracking-widest">🏨 Hotels in {primaryDest}</p>
                  <BookingLink href={bookingUrl}      title="Search on Booking.com" subtitle="Free cancellation options available" />
                  <BookingLink href={googleHotelsUrl} title="Search on Google Hotels" subtitle="Compare prices across booking sites" />
                </div>
              </>
            )}
          </div>
        )}
        {/* ─ Budget tab (owner only) ─────────────────────────────────────────── */}
        {activeTab === 'budget' && isOwner && tripId && (
          <BudgetPanel tripId={tripId} totalDays={totalDays} />
        )}
      </main>

      {/* ── Add extra stop modal ──────────────────────────────────────────────── */}
      {addStopFor && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-[#1A1A1A]">Add to this day</h3>
              <button onClick={() => setAddStopFor(null)} className="text-[#9A8E7E] hover:text-[#1A1A1A]">✕</button>
            </div>

            <input
              autoFocus
              value={addStopForm.activity}
              onChange={e => setAddStopForm(f => ({ ...f, activity: e.target.value }))}
              placeholder="What are you adding? (e.g. Alcatraz tour)"
              className="w-full text-sm border border-[#D8D0C4] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#C97552]/60"
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#9A8E7E] mb-1 block">Start time</label>
                <input
                  type="time"
                  value={addStopForm.start_time}
                  onChange={e => setAddStopForm(f => ({ ...f, start_time: e.target.value }))}
                  className="w-full text-sm border border-[#D8D0C4] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#C97552]/60"
                />
              </div>
              <div>
                <label className="text-xs text-[#9A8E7E] mb-1 block">End time</label>
                <input
                  type="time"
                  value={addStopForm.end_time}
                  onChange={e => setAddStopForm(f => ({ ...f, end_time: e.target.value }))}
                  className="w-full text-sm border border-[#D8D0C4] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#C97552]/60"
                />
              </div>
            </div>

            <textarea
              value={addStopForm.description}
              onChange={e => setAddStopForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Notes (optional)"
              rows={2}
              className="w-full text-sm border border-[#D8D0C4] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#C97552]/60 resize-none"
            />

            <input
              value={addStopForm.estimated_cost}
              onChange={e => setAddStopForm(f => ({ ...f, estimated_cost: e.target.value }))}
              placeholder="Estimated cost (e.g. $45/person)"
              className="w-full text-sm border border-[#D8D0C4] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#C97552]/60"
            />

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setAddStopFor(null)}
                className="flex-1 py-2.5 text-sm border border-[#E0D8CF] rounded-full text-[#6b5f54] hover:border-[#C8C0B4] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveExtraStop}
                disabled={!addStopForm.activity.trim() || addStopSaving}
                className="flex-1 py-2.5 text-sm bg-[#C97552] text-white rounded-full hover:bg-[#b86644] disabled:opacity-40 transition-colors font-semibold"
              >
                {addStopSaving ? 'Saving…' : 'Add stop'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
