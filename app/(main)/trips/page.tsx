'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TripDestination {
  trip_id:          string
  destination_name: string
  country:          string
  days:             number
  position:         number
  start_date:       string
  end_date:         string
}

interface Trip {
  id:          string
  trip_name:   string
  status:      string
  total_days:  number
  start_date:  string
  end_date:    string
  share_token: string | null
  created_at:  string
  destinations: TripDestination[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateRange(start: string, end: string): string {
  if (!start) return ''
  try {
    const s = new Date(start + 'T12:00:00')
    const e = new Date(end   + 'T12:00:00')
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
    if (start === end) return s.toLocaleDateString('en-US', opts)
    if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
      return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${e.getDate()}, ${e.getFullYear()}`
    }
    return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', opts)}`
  } catch { return start }
}

function statusPill(status: string) {
  if (status === 'planning')  return 'bg-yellow-500/15 text-yellow-400'
  if (status === 'confirmed') return 'bg-green-500/15 text-green-400'
  if (status === 'completed') return 'bg-white/10 text-white/40'
  return 'bg-white/10 text-white/40'
}

// ─── Trip card ────────────────────────────────────────────────────────────────

function TripCard({ trip, onClick }: { trip: Trip; onClick: () => void }) {
  const sorted    = [...trip.destinations].sort((a, b) => a.position - b.position)
  const mainDest  = sorted[0]?.destination_name ?? trip.trip_name
  const extras    = sorted.slice(1).map(d => d.destination_name)

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white/4 hover:bg-white/8 border border-white/10 hover:border-white/20 rounded-2xl p-5 transition-all duration-200 group"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-sm leading-snug truncate group-hover:text-[#C97552] transition-colors">
            {trip.trip_name}
          </h3>
          {trip.start_date && trip.end_date && (
            <p className="text-white/40 text-xs mt-0.5">
              {formatDateRange(trip.start_date, trip.end_date)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusPill(trip.status)}`}>
            {trip.status}
          </span>
          <svg className="w-4 h-4 text-white/25 group-hover:text-[#C97552] transition-colors"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
          </svg>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-[#C97552]/15 text-[#C97552]">
          📍 {mainDest}
        </span>
        {extras.map(d => (
          <span key={d} className="text-xs px-2.5 py-1 rounded-full bg-white/8 text-white/50">{d}</span>
        ))}
      </div>

      <div className="flex items-center gap-4 text-white/35 text-xs">
        <span>🌙 {trip.total_days} night{trip.total_days !== 1 ? 's' : ''}</span>
        {trip.destinations.length > 1 && (
          <span>🗺 {trip.destinations.length} destinations</span>
        )}
        {!trip.share_token && (
          <span className="text-red-400/60">· No itinerary yet</span>
        )}
      </div>
    </button>
  )
}

function TripSkeleton() {
  return (
    <div className="bg-white/4 border border-white/10 rounded-2xl p-5 animate-pulse">
      <div className="h-4 w-2/3 bg-white/10 rounded mb-2"/>
      <div className="h-3 w-1/3 bg-white/8 rounded mb-4"/>
      <div className="flex gap-2 mb-3"><div className="h-6 w-24 bg-white/8 rounded-full"/></div>
      <div className="h-3 w-20 bg-white/8 rounded"/>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TripsPage() {
  const router = useRouter()

  const [trips,   setTrips]   = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    async function load() {
      try {
        const supabase = getSupabaseClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }

        const { data: tripRows, error: tripErr } = await supabase
          .from('trips')
          .select('id, trip_name, status, total_days, start_date, end_date, share_token, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })

        if (tripErr) throw tripErr
        if (!tripRows?.length) { setLoading(false); return }

        const tripIds = tripRows.map(t => t.id)
        const { data: destRows } = await supabase
          .from('trip_destinations')
          .select('trip_id, destination_name, country, days, start_date, end_date, position')
          .in('trip_id', tripIds)
          .order('position', { ascending: true })

        const byTrip = (destRows ?? []).reduce<Record<string, TripDestination[]>>((acc, d) => {
          const r = d as TripDestination
          ;(acc[r.trip_id] ??= []).push(r)
          return acc
        }, {})

        setTrips(tripRows.map(t => ({ ...t, destinations: byTrip[t.id] ?? [] })))
      } catch (err) {
        console.error('[Trips page]', err)
        setError('Couldn\'t load your trips — try refreshing.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [router])

  return (
    <div className="min-h-screen bg-[#0d1f35]">

      {/* Hero header */}
      <div className="relative overflow-hidden">
        {/* Atmospheric background */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1488085061387-422e29b40080?w=1200&q=80&auto=format')", opacity: 0.22 }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0d1f35]/60 via-[#0d1f35]/80 to-[#0d1f35]" />

        {/* Sticky top bar */}
        <div className="relative z-10 max-w-2xl mx-auto px-4 pt-8 pb-10">
          <p className="text-xs text-white/35 uppercase tracking-widest font-label mb-3">Your journeys</p>
          <div className="flex items-end justify-between gap-3">
            <div>
              <h1 className="font-serif italic text-4xl text-white leading-tight">
                My Trips
              </h1>
              {!loading && trips.length > 0 && (
                <p className="text-white/40 text-sm mt-1">
                  {trips.length} trip{trips.length !== 1 ? 's' : ''} planned
                </p>
              )}
            </div>
            <button
              onClick={() => router.push('/plan/new')}
              className="flex-shrink-0 flex items-center gap-2 bg-[#C97552] text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-[#b86644] transition-colors shadow-lg shadow-[#C97552]/20 mb-1"
            >
              + Plan trip
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 pt-5 pb-24 space-y-3">

        {loading && [1,2,3].map(i => <TripSkeleton key={i}/>)}

        {!loading && error && (
          <div className="text-center py-16">
            <p className="text-white/40 text-sm">{error}</p>
            <button onClick={() => window.location.reload()} className="mt-4 text-[#C97552] text-sm">
              Retry
            </button>
          </div>
        )}

        {!loading && !error && trips.map(trip => (
          <TripCard
            key={trip.id}
            trip={trip}
            onClick={() => trip.share_token ? router.push(`/trip/${trip.share_token}`) : null}
          />
        ))}

        {!loading && !error && trips.length === 0 && (
          <div className="text-center py-16">
            {/* Atmospheric empty state */}
            <div className="relative w-full max-w-xs mx-auto mb-8 rounded-2xl overflow-hidden">
              <img
                src="https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=600&q=80&auto=format"
                alt="Travel"
                className="w-full h-40 object-cover opacity-40"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0d1f35] to-transparent" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-5xl">🗺️</span>
              </div>
            </div>
            <h2 className="font-serif italic text-2xl text-white mb-2">No trips yet</h2>
            <p className="text-white/40 text-sm max-w-xs mx-auto leading-relaxed mb-8">
              Pick your destinations and we'll build a day-by-day itinerary — flights, hotels, everything.
            </p>
            <button
              onClick={() => router.push('/plan/new')}
              className="bg-[#C97552] text-white text-sm font-semibold px-6 py-3.5 rounded-full hover:bg-[#b86644] transition-colors shadow-lg shadow-[#C97552]/20 mb-4"
            >
              Plan your first trip →
            </button>
            <div>
              <button
                onClick={() => router.push('/discover')}
                className="text-white/35 text-sm hover:text-white/55 transition-colors"
              >
                Browse destinations first →
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
