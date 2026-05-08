import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import type { ItineraryDay, ItineraryBlock } from '@/app/api/itinerary/route'

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

// ─── Sub-components (server-renderable) ──────────────────────────────────────

function BlockCard({ label, block }: { label: string; block: ItineraryBlock }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-white/30 uppercase tracking-widest">{label}</p>
      <p className="text-white/90 font-medium text-sm">{block.activity}</p>
      <p className="text-white/55 text-sm leading-relaxed">{block.description}</p>
      {block.insider_tip && (
        <p className="text-[#C97552]/80 text-xs italic">💡 {block.insider_tip}</p>
      )}
      <p className="text-white/30 text-xs">{block.estimated_cost}</p>
    </div>
  )
}

function DayCard({ day }: { day: ItineraryDay }) {
  return (
    <div className="bg-white/4 border border-white/8 rounded-2xl p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="font-serif italic text-base text-white leading-tight">{day.title}</h4>
        <span className="text-xs text-white/25 flex-shrink-0">Day {day.day}</span>
      </div>
      <div className="space-y-4 divide-y divide-white/6">
        <BlockCard label="🌅 Morning"   block={day.morning}   />
        <div className="pt-4"><BlockCard label="☀️ Afternoon" block={day.afternoon} /></div>
        <div className="pt-4"><BlockCard label="🌙 Evening"   block={day.evening}   /></div>
      </div>
      <div className="pt-2 border-t border-white/8 flex justify-end">
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

  return (
    <div className="min-h-screen bg-[#0d1f35]">
      {/* Header */}
      <div className="border-b border-white/8">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-white/35 uppercase tracking-widest mb-2">Shared trip</p>
              <h1 className="font-serif italic text-3xl text-white leading-tight">
                {trip.trip_name}
              </h1>
              {trip.start_date && trip.end_date && (
                <p className="text-white/40 text-sm mt-2">
                  {formatDateRange(trip.start_date, trip.end_date)}
                  {trip.total_days > 0 && (
                    <span className="ml-2 text-white/25">· {trip.total_days} {trip.total_days === 1 ? 'day' : 'days'}</span>
                  )}
                </p>
              )}
            </div>
            {/* Voya wordmark */}
            <a
              href="https://getvoya.net"
              className="flex-shrink-0 text-white/20 text-xs hover:text-white/40 transition-colors mt-1"
            >
              Made with Voya
            </a>
          </div>

          {/* Destination pills */}
          {dests.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {dests.map(d => (
                <span key={d.id} className="text-xs text-white/50 bg-white/6 border border-white/10 rounded-full px-3 py-1">
                  📍 {d.destination_name}, {d.country}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Itinerary */}
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-12">
        {dests.length === 0 && (
          <p className="text-white/40 text-sm text-center py-12">No itinerary details saved for this trip.</p>
        )}

        {dests.map((dest, idx) => {
          const dayOffset = dests.slice(0, idx).reduce((s, d) => s + d.days, 0)
          const days: ItineraryDay[] = Array.isArray(dest.itinerary_json) ? dest.itinerary_json : []

          return (
            <section key={dest.id}>
              {/* Destination header */}
              <div className="border-t border-white/10 pt-6 mb-5">
                <p className="text-xs text-white/35 uppercase tracking-widest mb-1">
                  📍 {dest.destination_name.toUpperCase()}, {dest.country.toUpperCase()}
                  {' · '}
                  {dest.days === 1
                    ? `Day ${dayOffset + 1}`
                    : `Days ${dayOffset + 1}–${dayOffset + dest.days}`
                  }
                </p>
                <h2 className="font-serif italic text-2xl text-white">{dest.destination_name}</h2>
                {dest.start_date && dest.end_date && (
                  <p className="text-white/35 text-xs mt-0.5">{formatDateRange(dest.start_date, dest.end_date)}</p>
                )}
              </div>

              {days.length > 0 ? (
                <div className="space-y-4">
                  {days.map(day => <DayCard key={day.day} day={day} />)}
                </div>
              ) : (
                <p className="text-white/30 text-sm italic py-4">No itinerary generated for this destination.</p>
              )}

              {/* Inter-destination connector */}
              {idx < dests.length - 1 && (
                <div className="mt-6 flex items-center gap-3 py-3 px-4 bg-white/3 border border-white/8 rounded-xl">
                  <span className="text-base">✈️</span>
                  <p className="text-sm text-white/50">
                    <span className="text-white/70">{dest.destination_name}</span>
                    {' → '}
                    <span className="text-white/70">{dests[idx + 1].destination_name}</span>
                  </p>
                </div>
              )}
            </section>
          )
        })}

        {/* Footer CTA */}
        <div className="border-t border-white/8 pt-8 text-center space-y-3">
          <p className="text-white/30 text-sm">Want to plan your own trip?</p>
          <a
            href="https://getvoya.net"
            className="inline-block bg-[#C97552] text-white text-sm font-semibold px-6 py-3 rounded-full hover:bg-[#b86644] transition-colors"
          >
            Plan with Voya →
          </a>
        </div>
      </main>
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
