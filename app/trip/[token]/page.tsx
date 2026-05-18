import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { ItineraryDay, ItineraryBlock } from '@/app/api/itinerary/route'
import { geocodeLocation, fetchSunTimes } from '@/lib/sun'
import type { SunTimes } from '@/lib/sun'
import TripMap, { type MapPin } from './TripMap'
import ItineraryTabs from './ItineraryTabs'
import TripChat from './TripChat'
import VisaStrip from './VisaStrip'
import CollabPresence from './CollabPresence'
import LiveModeStrip from './LiveModeStrip'
import BackButton from './BackButton'
import PublishTemplateButton from './PublishTemplateButton'

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function SharedTripPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // Service-role client: bypass RLS so public share links always load.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // SSR auth client: read the logged-in user (if any) from cookies.
  const cookieStore = await cookies()
  const supabaseSsr = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => { /* read-only in server components */ },
      },
    }
  )
  const { data: { user } } = await supabaseSsr.auth.getUser()

  // Fetch trip by share_token (include user_id for ownership check)
  const { data: trip, error: tripErr } = await supabase
    .from('trips')
    .select('id, trip_name, total_days, start_date, end_date, share_token, user_id')
    .eq('share_token', token)
    .single()

  if (tripErr || !trip) notFound()

  // True only when the authenticated user owns this trip — enables inline editing.
  const isOwner = !!(user && user.id === trip.user_id)

  // Fetch home country for visa intel — try onboarding_responses first, fall back to user_profiles
  let homeCountry = ''
  if (user) {
    const { data: onboarding } = await supabase
      .from('onboarding_responses')
      .select('home_country')
      .eq('user_id', user.id)
      .single()
    homeCountry = onboarding?.home_country ?? ''

    if (!homeCountry) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('home_country')
        .eq('user_id', user.id)
        .single()
      homeCountry = profile?.home_country ?? ''
    }
  }

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
          <div className="max-w-2xl mx-auto px-4 pt-6 pb-8">
            <BackButton />
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
              {/* Owner actions */}
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                {isOwner && trip.id && (
                  <PublishTemplateButton tripId={trip.id} />
                )}
                <a
                  href="https://vondrer.com"
                  className="text-[#9A8E7E] text-xs hover:text-[#5A504A] transition-colors"
                >
                  Made with Vondrer
                </a>
              </div>
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

        {/* Live trip mode — shown only when today falls within trip dates */}
        {trip.start_date && trip.end_date && dests.length > 0 && (
          <LiveModeStrip
            startDate={trip.start_date}
            endDate={trip.end_date}
            dests={dests}
          />
        )}

        {/* Collab presence — real-time viewer avatars (owner only, no SSR needed) */}
        {isOwner && trip.id && (
          <div className="max-w-2xl mx-auto px-4 pt-3">
            <CollabPresence tripId={trip.id} />
          </div>
        )}

        {/* Visa intel strip — only shown when we know home country */}
        {dests.length > 0 && homeCountry && (
          <div className="max-w-2xl mx-auto px-4 pt-3">
            <VisaStrip
              homeCountry={homeCountry}
              destCountry={dests[0].country}
            />
          </div>
        )}

        {/* Tab bar + itinerary content (client component) */}
        <ItineraryTabs
          dests={dests}
          sunTimesMap={sunTimesMap}
          totalDays={trip.total_days}
          startDate={trip.start_date ?? ''}
          endDate={trip.end_date ?? ''}
          isOwner={isOwner}
          tripId={trip.id}
        />

        {/* AI trip chat — floating button, owner only */}
        {isOwner && trip.id && (
          <TripChat
            tripId={trip.id}
            tripName={trip.trip_name}
            dests={dests}
          />
        )}
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
    return { title: 'Trip not found · Vondrer' }
  }

  return {
    title: `${trip.trip_name} · Vondrer`,
    description: trip.start_date
      ? `${formatDateRange(trip.start_date, trip.end_date)} — planned with Vondrer`
      : 'A trip planned with Vondrer',
    openGraph: {
      title: `${trip.trip_name} · Vondrer`,
      description: 'View this trip itinerary planned with Vondrer',
      siteName: 'Vondrer',
    },
  }
}
