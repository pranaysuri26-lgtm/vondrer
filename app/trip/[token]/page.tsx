import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import type { ItineraryDay, ItineraryBlock } from '@/app/api/itinerary/route'
import { geocodeLocation, fetchSunTimes } from '@/lib/sun'
import type { SunTimes } from '@/lib/sun'
import TripMap, { type MapPin } from './TripMap'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TripRow {
  id:         string
  trip_name:  string
  total_days: number
  start_date: string
  end_date:   string
  share_token: string
}

interface DestRow {
  id:             string
  destination_name: string
  country:        string
  days:           number
  start_date:     string
  end_date:       string
  position:       number
  itinerary_json: ItineraryDay[] | null
  notes:          string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateRange(start: string, end: string): string {
  if (!start) return ''
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end   + 'T12:00:00')
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  if (start === end) return s.toLocaleDateString('en-US', opts)
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${e.getDate()}, ${e.getFullYear()}`
  }
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', opts)}`
}

// ─── Golden hour strip ────────────────────────────────────────────────────────

function GoldenHourStrip({ sun }: { sun: SunTimes }) {
  return (
    <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 mb-4">
      <p className="text-[10px] text-amber-300/60 font-label tracking-widest uppercase mb-2.5">
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

// ─── Sub-components (server-renderable) ──────────────────────────────────────

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

      {/* Additional stops in the same time window */}
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

function DayCard({ day }: { day: ItineraryDay }) {
  return (
    <div className="bg-white border border-[#E8E0D6] rounded-2xl p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="font-serif italic text-base text-[#1A1A1A] leading-tight">{day.title}</h4>
        <span className="text-xs text-[#9A8E7E] flex-shrink-0">Day {day.day}</span>
      </div>
      <div className="space-y-4 divide-y divide-[#F0EBE3]">
        <BlockCard label="🌅 Morning"    block={day.morning}   />
        <div className="pt-4"><BlockCard label="☀️ Afternoon"  block={day.afternoon} /></div>
        {day.dinner && (
          <div className="pt-4"><BlockCard label="🍽️ Dinner"   block={day.dinner}    /></div>
        )}
        <div className="pt-4"><BlockCard label="🌙 Evening"    block={day.evening}   /></div>
      </div>
      <div className="pt-2 border-t border-[#E8E0D6] flex justify-end">
        <span className="text-xs text-[#C97552]/70">Day total: ~{day.day_total_estimate}</span>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function SharedTripPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // Server component — use service role key to bypass RLS for public share links.
  // Falls back to anon key if service role key not set (requires a public read policy then).
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Fetch trip by share_token
  const { data: trip, error: tripErr } = await supabase
    .from('trips')
    .select('id, trip_name, total_days, start_date, end_date, share_token')
    .eq('share_token', token)
    .single()

  if (tripErr || !trip) notFound()

  const { data: destinations } = await supabase
    .from('trip_destinations')
    .select('id, destination_name, country, days, start_date, end_date, position, itinerary_json, notes')
    .eq('trip_id', trip.id)
    .order('position', { ascending: true })

  const dests: DestRow[] = destinations ?? []

  // Fetch golden hour times for each destination in parallel (best-effort, non-blocking)
  const sunTimesMap: Record<string, SunTimes | null> = {}
  await Promise.all(
    dests.map(async (dest) => {
      try {
        const geo = await geocodeLocation(`${dest.destination_name}, ${dest.country}`)
        if (!geo) return
        sunTimesMap[dest.id] = await fetchSunTimes(geo.lat, geo.lng, dest.start_date || undefined)
      } catch { /* silent — golden hour is enhancement, not critical */ }
    })
  )

  // ─── Build map pins from all itinerary activities ──────────────────────────────
  const mapPins: MapPin[] = []
  dests.forEach((dest, idx) => {
    const dayOffset = dests.slice(0, idx).reduce((s, d) => s + d.days, 0)
    const days: ItineraryDay[] = Array.isArray(dest.itinerary_json) ? dest.itinerary_json : []
    days.forEach(day => {
      const globalDay = dayOffset + day.day
      const slots: Array<{ slot: string; block: ItineraryBlock | null | undefined }> = [
        { slot: 'Morning',   block: day.morning   },
        { slot: 'Afternoon', block: day.afternoon },
        { slot: 'Dinner',    block: day.dinner    },
        { slot: 'Evening',   block: day.evening   },
      ]
      slots.forEach(({ slot, block }) => {
        if (block?.activity) {
          mapPins.push({
            id:          `${dest.id}-${globalDay}-${slot}`,
            name:        block.activity,
            day:         globalDay,
            slot,
            destination: dest.destination_name,
            country:     dest.country,
          })
        }
      })
    })
  })

  const hasMap = mapPins.length > 0

  return (
    <div className={`bg-[#FAF8F5] ${hasMap ? 'lg:flex lg:h-screen lg:overflow-hidden' : 'min-h-screen'}`}>

      {/* ── LEFT: Sticky map panel (desktop) ───────────────────────────────────── */}
      {hasMap && (
        <div className="hidden lg:flex lg:w-[420px] lg:flex-shrink-0 lg:h-full border-r border-[#E8E0D6]">
          <TripMap pins={mapPins} />
        </div>
      )}

      {/* ── RIGHT: Scrollable content ───────────────────────────────────────────── */}
      <div className={`flex-1 min-w-0 min-h-screen lg:min-h-0 ${hasMap ? 'lg:overflow-y-auto' : ''}`}>

        {/* Header */}
        <div className="border-b border-[#E8E0D6]">
          <div className="max-w-2xl mx-auto px-4 py-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-[#9A8E7E] uppercase tracking-widest mb-2">Shared trip</p>
                <h1 className="font-serif italic text-3xl text-[#1A1A1A] leading-tight">
                  {trip.trip_name}
                </h1>
                {trip.start_date && trip.end_date && (
                  <p className="text-[#6b5f54] text-sm mt-2">
                    {formatDateRange(trip.start_date, trip.end_date)}
                    {trip.total_days > 0 && (
                      <span className="ml-2 text-[#9A8E7E]">· {trip.total_days} {trip.total_days === 1 ? 'day' : 'days'}</span>
                    )}
                  </p>
                )}
              </div>
              {/* Voya wordmark */}
              <a
                href="https://getvoya.net"
                className="flex-shrink-0 text-[#9A8E7E] text-xs hover:text-[#5A504A] transition-colors mt-1"
              >
                Made with Voya
              </a>
            </div>

            {/* Destination pills */}
            {dests.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {dests.map(d => (
                  <span key={d.id} className="text-xs text-[#5C564E] bg-[#EDE5D8] border border-[#D8D0C4] rounded-full px-3 py-1">
                    📍 {d.destination_name}, {d.country}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Mobile map strip (below header, above itinerary) */}
        {hasMap && (
          <div className="lg:hidden h-[220px] border-b border-[#E8E0D6]">
            <TripMap pins={mapPins} />
          </div>
        )}

        {/* Itinerary */}
        <main className="max-w-2xl mx-auto px-4 py-8 space-y-12">
          {dests.length === 0 && (
            <p className="text-[#9A8E7E] text-sm text-center py-12">No itinerary details saved for this trip.</p>
          )}

          {dests.map((dest, idx) => {
            const dayOffset = dests.slice(0, idx).reduce((s, d) => s + d.days, 0)
            const days: ItineraryDay[] = Array.isArray(dest.itinerary_json) ? dest.itinerary_json : []

            return (
              <section key={dest.id}>
                {/* Destination header */}
                <div className="border-t border-[#E8E0D6] pt-6 mb-5">
                  <p className="text-xs text-[#9A8E7E] uppercase tracking-widest mb-1">
                    📍 {dest.destination_name.toUpperCase()}, {dest.country.toUpperCase()}
                    {' · '}
                    {dest.days === 1
                      ? `Day ${dayOffset + 1}`
                      : `Days ${dayOffset + 1}–${dayOffset + dest.days}`
                    }
                  </p>
                  <h2 className="font-serif italic text-2xl text-[#1A1A1A]">{dest.destination_name}</h2>
                  {dest.start_date && dest.end_date && (
                    <p className="text-[#8A7E6E] text-xs mt-0.5">{formatDateRange(dest.start_date, dest.end_date)}</p>
                  )}
                </div>

                {days.length > 0 ? (
                  <div className="space-y-4">
                    {sunTimesMap[dest.id] && (
                      <GoldenHourStrip sun={sunTimesMap[dest.id]!} />
                    )}
                    {days.map(day => <DayCard key={day.day} day={day} />)}
                  </div>
                ) : (
                  <p className="text-[#9A8E7E] text-sm italic py-4">No itinerary generated for this destination.</p>
                )}

                {/* Inter-destination connector */}
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
        </main>
      </div>
    </div>
  )
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: trip } = await supabase
    .from('trips')
    .select('trip_name, start_date, end_date')
    .eq('share_token', token)
    .single()

  if (!trip) {
    return { title: 'Trip not found · Voya' }
  }

  return {
    title: `${trip.trip_name} · Voya`,
    description: trip.start_date
      ? `${formatDateRange(trip.start_date, trip.end_date)} — planned with Voya`
      : 'A trip planned with Voya',
    openGraph: {
      title: `${trip.trip_name} · Voya`,
      description: 'View this trip itinerary planned with Voya',
      siteName: 'Voya',
    },
  }
}
