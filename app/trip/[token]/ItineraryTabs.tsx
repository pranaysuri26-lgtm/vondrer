'use client'

import { useState } from 'react'
import type { ItineraryDay, ItineraryBlock } from '@/app/api/itinerary/route'
import type { SunTimes } from '@/lib/sun'

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

// ─── Block card ────────────────────────────────────────────────────────────────

function BlockCard({ label, block }: { label: string; block: ItineraryBlock }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-[#8A7E6E] uppercase tracking-widest">{label}</p>
      <p className="text-[#1A1A1A] font-medium text-sm">{block.activity}</p>
      <p className="text-[#5A504A] text-sm leading-relaxed">{block.description}</p>
      {block.insider_tip && (
        <p className="text-[#C97552]/80 text-xs italic">💡 {block.insider_tip}</p>
      )}
      <p className="text-[#8A7E6E] text-xs">{block.estimated_cost}</p>
      {block.also_visit && block.also_visit.length > 0 && (
        <div className="mt-2 space-y-2 border-l-2 border-[#E8E0D6] pl-3">
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

// ─── Day card ──────────────────────────────────────────────────────────────────

function DayCard({ day }: { day: ItineraryDay }) {
  return (
    <div className="bg-white border border-[#E8E0D6] rounded-2xl p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="font-serif italic text-base text-[#1A1A1A] leading-tight">{day.title}</h4>
        <span className="text-xs text-[#9A8E7E] flex-shrink-0">Day {day.day}</span>
      </div>
      <div className="space-y-4 divide-y divide-[#F0EBE3]">
        <BlockCard label="🌅 Morning"   block={day.morning}   />
        <div className="pt-4"><BlockCard label="☀️ Afternoon" block={day.afternoon} /></div>
        {day.dinner && (
          <div className="pt-4"><BlockCard label="🍽️ Dinner"  block={day.dinner}    /></div>
        )}
        <div className="pt-4"><BlockCard label="🌙 Evening"   block={day.evening}   /></div>
      </div>
      <div className="pt-2 border-t border-[#E8E0D6] flex justify-end">
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

function BookingLink({ href, title, subtitle }: { href: string; title: string; subtitle: string }) {
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

// ─── Main component ────────────────────────────────────────────────────────────

export default function ItineraryTabs({ dests, sunTimesMap, totalDays, startDate, endDate }: Props) {

  // Build a flat ordered list of every (globalDay, day, dest) across all destinations
  const allEntries = dests.flatMap((dest, idx) => {
    const offset: number = dests.slice(0, idx).reduce((s, d) => s + d.days, 0)
    const days: ItineraryDay[] = Array.isArray(dest.itinerary_json) ? dest.itinerary_json : []
    return days.map(day => ({
      globalDay: offset + day.day,
      dayIndex:  day.day - 1,   // 0-based index within this destination
      day,
      dest,
    }))
  })

  const [activeTab, setActiveTab] = useState<string>('overview')

  // ── Booking URLs (constructed server-free from prop data) ──────────────────
  const primaryDest   = dests[0]?.destination_name ?? ''
  const lastDest      = dests[dests.length - 1]
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
      <div className="sticky top-0 z-10 bg-[#FAF8F5]/96 backdrop-blur-sm border-b border-[#E8E0D6]">
        <div
          className="flex overflow-x-auto max-w-2xl mx-auto px-4"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
        >
          <TabBtn id="overview" label="Overview" />
          {allEntries.map(({ globalDay }) => (
            <TabBtn key={globalDay} id={`day-${globalDay}`} label={`Day ${globalDay}`} />
          ))}
          <TabBtn id="deals" label="✈️ Deals" />
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────────── */}
      <main className="max-w-2xl mx-auto px-4 py-8">

        {/* ─ Overview ──────────────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-12">
            {dests.length === 0 && (
              <p className="text-[#9A8E7E] text-sm text-center py-12">No itinerary details saved for this trip.</p>
            )}

            {dests.map((dest, idx) => {
              const dayOffset  = dests.slice(0, idx).reduce((s, d) => s + d.days, 0)
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
                          <DayCard day={day} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[#9A8E7E] text-sm italic py-4">No itinerary generated for this destination.</p>
                  )}

                  {idx < dests.length - 1 && (
                    <div className="mt-6 flex items-center gap-3 py-3 px-4 bg-white border border-[#E8E0D6] rounded-xl">
                      <span className="text-base">✈️</span>
                      <p className="text-sm text-[#6b5f54]">
                        <span className="text-[#1A1A1A]">{dest.destination_name}</span>
                        {' → '}
                        <span className="text-[#1A1A1A]">{dests[idx + 1].destination_name}</span>
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
                href="https://getvoya.net"
                className="inline-block bg-[#C97552] text-white text-sm font-semibold px-6 py-3 rounded-full hover:bg-[#b86644] transition-colors"
              >
                Plan with Voya →
              </a>
            </div>
          </div>
        )}

        {/* ─ Individual day tabs ────────────────────────────────────────────────── */}
        {allEntries.map(({ globalDay, dayIndex, day, dest }) => {
          if (activeTab !== `day-${globalDay}`) return null
          const sun = sunTimesMap[dest.id]

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
              <DayCard day={day} />

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

            {/* Flights */}
            <div className="space-y-2">
              <p className="text-xs text-[#9A8E7E] uppercase tracking-widest">✈️ Flights to {primaryDest}</p>
              <BookingLink
                href={skyscannerUrl}
                title="Search on Skyscanner"
                subtitle="Best price comparison across all airlines"
              />
              <BookingLink
                href={googleFlightsUrl}
                title="Search on Google Flights"
                subtitle="Track prices and set fare alerts"
              />
            </div>

            {/* Hotels */}
            <div className="space-y-2">
              <p className="text-xs text-[#9A8E7E] uppercase tracking-widest">🏨 Hotels in {primaryDest}</p>
              <BookingLink
                href={bookingUrl}
                title="Search on Booking.com"
                subtitle="Free cancellation options available"
              />
              <BookingLink
                href={googleHotelsUrl}
                title="Search on Google Hotels"
                subtitle="Compare prices across booking sites"
              />
            </div>

            {/* Voya CTA */}
            <div className="p-5 rounded-2xl border border-[#C97552]/20 bg-[#C97552]/5">
              <p className="text-xs text-[#C97552] uppercase tracking-widest mb-2">Voya Deals</p>
              <p className="text-[#1A1A1A] font-medium text-sm mb-1">Daily curated travel offers</p>
              <p className="text-[#6b5f54] text-xs mb-4">
                Flight promotions, hotel deals, card bonuses and travel tips — AI-curated daily for your home country.
              </p>
              <a
                href="https://getvoya.net"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-xs bg-[#C97552] text-white px-4 py-2 rounded-full hover:bg-[#b86644] transition-colors"
              >
                Explore Voya Deals →
              </a>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
