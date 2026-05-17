'use client'

import { useEffect, useState, useRef } from 'react'
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
  if (status === 'planning')  return 'bg-amber-500/15 text-amber-600'
  if (status === 'confirmed') return 'bg-green-500/15 text-green-600'
  if (status === 'completed') return 'bg-[#EDE5D8] text-[#6b5f54]'
  return 'bg-[#EDE5D8] text-[#6b5f54]'
}

function statusLabel(status: string) {
  if (status === 'planning')  return 'Planning'
  if (status === 'confirmed') return 'Confirmed'
  if (status === 'completed') return '✓ Complete'
  return status
}

// ─── Trip card ────────────────────────────────────────────────────────────────

function TripCard({
  trip,
  onOpen,
  onMarkComplete,
  onMarkPlanning,
  onDelete,
  actionLoading,
}: {
  trip:            Trip
  onOpen:          () => void
  onMarkComplete:  () => void
  onMarkPlanning:  () => void
  onDelete:        () => void
  actionLoading:   boolean
}) {
  const sorted   = [...trip.destinations].sort((a, b) => a.position - b.position)
  const mainDest = sorted[0]?.destination_name ?? trip.trip_name
  const extras   = sorted.slice(1).map(d => d.destination_name)

  const [menuOpen,     setMenuOpen]     = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
        setConfirmDelete(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  return (
    <div className="relative bg-white border border-[#E8E0D6] hover:border-[#CCC4B8] rounded-2xl transition-all duration-200 group">

      {/* Main clickable area */}
      <button
        onClick={onOpen}
        className="w-full text-left p-5 pr-14"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-[#1A1A1A] font-semibold text-sm leading-snug truncate group-hover:text-[#C97552] transition-colors">
              {trip.trip_name}
            </h3>
            {trip.start_date && trip.end_date && (
              <p className="text-[#6b5f54] text-xs mt-0.5">
                {formatDateRange(trip.start_date, trip.end_date)}
              </p>
            )}
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize shrink-0 ${statusPill(trip.status)}`}>
            {statusLabel(trip.status)}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-[#C97552]/15 text-[#C97552]">
            📍 {mainDest}
          </span>
          {extras.map(d => (
            <span key={d} className="text-xs px-2.5 py-1 rounded-full bg-[#F0EBE3] text-[#5C564E]">{d}</span>
          ))}
        </div>

        <div className="flex items-center gap-4 text-[#7A6E64] text-xs">
          <span>🌙 {trip.total_days} night{trip.total_days !== 1 ? 's' : ''}</span>
          {trip.destinations.length > 1 && (
            <span>🗺 {trip.destinations.length} destinations</span>
          )}
          {!trip.share_token && (
            <span className="text-red-400/60">· No itinerary yet</span>
          )}
        </div>
      </button>

      {/* ⋮ menu button */}
      <div ref={menuRef} className="absolute top-4 right-4">
        <button
          onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); setConfirmDelete(false) }}
          className="w-8 h-8 rounded-full flex items-center justify-center text-[#9A8E7E] hover:bg-[#F0EBE3] hover:text-[#4A4440] transition-colors"
          title="Trip options"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="5"  r="1.5"/>
            <circle cx="12" cy="12" r="1.5"/>
            <circle cx="12" cy="19" r="1.5"/>
          </svg>
        </button>

        {/* Dropdown */}
        {menuOpen && (
          <div className="absolute right-0 top-10 z-20 w-48 bg-white border border-[#E8E0D6] rounded-xl shadow-xl overflow-hidden">
            {/* Open */}
            <button
              onClick={() => { setMenuOpen(false); onOpen() }}
              className="w-full text-left px-4 py-2.5 text-sm text-[#1A1A1A] hover:bg-[#F5F2ED] flex items-center gap-2.5 transition-colors"
            >
              <svg className="w-3.5 h-3.5 text-[#9A8E7E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
              </svg>
              Open trip
            </button>

            <div className="h-px bg-[#F0EBE3]"/>

            {/* Mark complete / planning */}
            {trip.status !== 'completed' ? (
              <button
                disabled={actionLoading}
                onClick={() => { setMenuOpen(false); onMarkComplete() }}
                className="w-full text-left px-4 py-2.5 text-sm text-[#1A1A1A] hover:bg-[#F5F2ED] flex items-center gap-2.5 transition-colors disabled:opacity-50"
              >
                <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                </svg>
                Mark as complete
              </button>
            ) : (
              <button
                disabled={actionLoading}
                onClick={() => { setMenuOpen(false); onMarkPlanning() }}
                className="w-full text-left px-4 py-2.5 text-sm text-[#1A1A1A] hover:bg-[#F5F2ED] flex items-center gap-2.5 transition-colors disabled:opacity-50"
              >
                <svg className="w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                Move back to planning
              </button>
            )}

            <div className="h-px bg-[#F0EBE3]"/>

            {/* Delete */}
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2.5 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
                Delete trip
              </button>
            ) : (
              <div className="px-4 py-2.5">
                <p className="text-xs text-[#4A4440] mb-2 font-medium">Delete forever?</p>
                <div className="flex gap-2">
                  <button
                    disabled={actionLoading}
                    onClick={() => { setMenuOpen(false); setConfirmDelete(false); onDelete() }}
                    className="flex-1 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-colors disabled:opacity-50"
                  >
                    {actionLoading ? '…' : 'Yes, delete'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 py-1.5 rounded-lg bg-[#F0EBE3] text-[#4A4440] text-xs font-semibold hover:bg-[#E8E0D6] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function TripSkeleton() {
  return (
    <div className="bg-white border border-[#E8E0D6] rounded-2xl p-5 animate-pulse">
      <div className="h-4 w-2/3 bg-[#EDE5D8] rounded mb-2"/>
      <div className="h-3 w-1/3 bg-[#F0EBE3] rounded mb-4"/>
      <div className="flex gap-2 mb-3"><div className="h-6 w-24 bg-[#F0EBE3] rounded-full"/></div>
      <div className="h-3 w-20 bg-[#F0EBE3] rounded"/>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TripsPage() {
  const router = useRouter()

  const [trips,         setTrips]         = useState<Trip[]>([])
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

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

  async function handleMarkComplete(tripId: string) {
    setActionLoading(tripId)
    // Optimistic update
    setTrips(prev => prev.map(t => t.id === tripId ? { ...t, status: 'completed' } : t))
    const supabase = getSupabaseClient()
    await supabase.from('trips').update({ status: 'completed' }).eq('id', tripId)
    setActionLoading(null)
  }

  async function handleMarkPlanning(tripId: string) {
    setActionLoading(tripId)
    setTrips(prev => prev.map(t => t.id === tripId ? { ...t, status: 'planning' } : t))
    const supabase = getSupabaseClient()
    await supabase.from('trips').update({ status: 'planning' }).eq('id', tripId)
    setActionLoading(null)
  }

  async function handleDelete(tripId: string) {
    setActionLoading(tripId)
    // Optimistic remove
    setTrips(prev => prev.filter(t => t.id !== tripId))
    const supabase = getSupabaseClient()
    // Cascade delete destinations first (in case FK constraint exists)
    await supabase.from('trip_destinations').delete().eq('trip_id', tripId)
    await supabase.from('trips').delete().eq('id', tripId)
    setActionLoading(null)
  }

  // Group trips by status for the UI
  const planning   = trips.filter(t => t.status === 'planning' || t.status === 'confirmed')
  const completed  = trips.filter(t => t.status === 'completed')

  return (
    <div className="min-h-screen bg-[#FAF8F5]">

      {/* Hero header */}
      <div className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1488085061387-422e29b40080?w=1200&q=80&auto=format')", opacity: 0.22 }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#FAF8F5]/60 via-[#FAF8F5]/80 to-[#FAF8F5]" />

        <div className="relative z-10 max-w-2xl mx-auto px-4 pt-8 pb-10">
          <p className="text-xs text-[#7A6E64] uppercase tracking-widest font-label mb-3">Your journeys</p>
          <div className="flex items-end justify-between gap-3">
            <div>
              <h1 className="font-serif italic text-4xl text-[#1A1A1A] leading-tight">My Trips</h1>
              {!loading && trips.length > 0 && (
                <p className="text-[#6b5f54] text-sm mt-1">
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
      <div className="max-w-2xl mx-auto px-4 pt-2 pb-24 space-y-3">

        {loading && [1,2,3].map(i => <TripSkeleton key={i}/>)}

        {!loading && error && (
          <div className="text-center py-16">
            <p className="text-[#6b5f54] text-sm">{error}</p>
            <button onClick={() => window.location.reload()} className="mt-4 text-[#C97552] text-sm">Retry</button>
          </div>
        )}

        {/* Active / planning trips */}
        {!loading && !error && planning.length > 0 && (
          <div className="space-y-3">
            {planning.map(trip => (
              <TripCard
                key={trip.id}
                trip={trip}
                actionLoading={actionLoading === trip.id}
                onOpen={() => {
                  if (!trip.share_token) return
                  if (trip.status === 'planning') {
                    router.push(`/trip/${trip.share_token}/collaborate`)
                  } else {
                    router.push(`/trip/${trip.share_token}`)
                  }
                }}
                onMarkComplete={() => handleMarkComplete(trip.id)}
                onMarkPlanning={() => handleMarkPlanning(trip.id)}
                onDelete={() => handleDelete(trip.id)}
              />
            ))}
          </div>
        )}

        {/* Completed trips section */}
        {!loading && !error && completed.length > 0 && (
          <div className="pt-4">
            <p className="text-[#9A8E7E] text-xs uppercase tracking-widest font-semibold mb-3 px-1">
              ✓ Completed trips
            </p>
            <div className="space-y-3">
              {completed.map(trip => (
                <TripCard
                  key={trip.id}
                  trip={trip}
                  actionLoading={actionLoading === trip.id}
                  onOpen={() => {
                    if (!trip.share_token) return
                    router.push(`/trip/${trip.share_token}`)
                  }}
                  onMarkComplete={() => handleMarkComplete(trip.id)}
                  onMarkPlanning={() => handleMarkPlanning(trip.id)}
                  onDelete={() => handleDelete(trip.id)}
                />
              ))}
            </div>
          </div>
        )}

        {!loading && !error && trips.length === 0 && (
          <div className="text-center py-16">
            <div className="relative w-full max-w-xs mx-auto mb-8 rounded-2xl overflow-hidden">
              <img
                src="https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=600&q=80&auto=format"
                alt="Travel"
                className="w-full h-40 object-cover opacity-40"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#FAF8F5] to-transparent" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-5xl">🗺️</span>
              </div>
            </div>
            <h2 className="font-serif italic text-2xl text-[#1A1A1A] mb-2">No trips yet</h2>
            <p className="text-[#6b5f54] text-sm max-w-xs mx-auto leading-relaxed mb-8">
              Pick your destinations and we&apos;ll build a day-by-day itinerary — flights, hotels, everything.
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
                className="text-[#7A6E64] text-sm hover:text-[#5A504A] transition-colors"
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
