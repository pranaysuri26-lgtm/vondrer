'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'
import type { ItineraryDay, ItineraryResult } from '@/app/api/itinerary/route'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TripDestination {
  id:          string   // local UUID
  name:        string
  country:     string
  days:        number
  start_date:  string
  end_date:    string   // auto-calculated
}

interface UserProfile {
  budget_per_day:       string
  group_type:           string
  interests:            string[]
  dietary_preferences:  string[]
  home_city:            string
  home_country:         string
}

interface GeneratedItinerary {
  destination_id: string
  result:         ItineraryResult
  loading:        boolean
  error:          string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  if (start === end) return s.toLocaleDateString('en-US', opts)
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${e.getDate()}, ${e.getFullYear()}`
  }
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', opts)}`
}

function makeSkyscannerLink(from: string, to: string, date: string): string {
  const d = date.replace(/-/g, '')
  const fromEnc = encodeURIComponent(from.replace(/\s/g, '-'))
  const toEnc   = encodeURIComponent(to.replace(/\s/g, '-'))
  return `https://www.skyscanner.com/transport/flights/${fromEnc}/${toEnc}/${d}/`
}

function localId(): string {
  return Math.random().toString(36).slice(2)
}

function calcEndDate(start: string, days: number): string {
  return addDays(start, days - 1)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ItineraryBlockView({ label, block }: { label: string; block: ItineraryDay['morning'] }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-white/35 uppercase tracking-widest font-label">{label}</p>
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
        <span className="text-xs text-white/30 flex-shrink-0">Day {day.day}</span>
      </div>
      <div className="space-y-4 divide-y divide-white/6">
        <ItineraryBlockView label="🌅 Morning"   block={day.morning}   />
        <div className="pt-4"><ItineraryBlockView label="☀️ Afternoon" block={day.afternoon} /></div>
        <div className="pt-4"><ItineraryBlockView label="🌙 Evening"   block={day.evening}   /></div>
      </div>
      <div className="pt-2 border-t border-white/8 flex justify-end">
        <span className="text-xs text-[#C97552]/80">Day total: ~{day.day_total_estimate}</span>
      </div>
    </div>
  )
}

function TransportConnector({ from, to, fromEndDate, homeCity }: {
  from: TripDestination
  to:   TripDestination
  fromEndDate: string
  homeCity: string
}) {
  const travelDate = addDays(fromEndDate, 1)
  const link = makeSkyscannerLink(from.name, to.name, travelDate)
  return (
    <div className="relative flex items-center gap-3 py-3 px-4 bg-white/3 border border-white/8 rounded-xl my-1">
      <span className="text-lg">✈️</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/60">
          <span className="text-white/80">{from.name}</span>
          {' → '}
          <span className="text-white/80">{to.name}</span>
        </p>
        <p className="text-xs text-white/30 mt-0.5">Travel day · {travelDate}</p>
      </div>
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-shrink-0 text-xs text-white/50 border border-white/15 rounded-full px-3 py-1.5 hover:border-white/30 hover:text-white/80 transition-all"
      >
        Search flights →
      </a>
    </div>
  )
}

// ─── Add destination form ──────────────────────────────────────────────────────

interface AddDestFormProps {
  nextStart:       string
  onAdd:           (dest: TripDestination) => void
  onCancel:        () => void
  prefillName?:    string
  prefillCountry?: string
}

function AddDestForm({ nextStart, onAdd, onCancel, prefillName = '', prefillCountry = '' }: AddDestFormProps) {
  const [name,    setName]    = useState(prefillName)
  const [country, setCountry] = useState(prefillCountry)
  const [days,    setDays]    = useState(3)
  const [start,   setStart]   = useState(nextStart)

  const endDate = calcEndDate(start, days)

  function submit() {
    if (!name.trim() || !country.trim() || days < 1 || !start) return
    onAdd({
      id:         localId(),
      name:       name.trim(),
      country:    country.trim(),
      days,
      start_date: start,
      end_date:   endDate,
    })
  }

  return (
    <div className="bg-white/5 border border-white/12 rounded-2xl p-5 space-y-4">
      <p className="text-xs text-white/40 uppercase tracking-widest font-label">Add destination</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-white/35 mb-1.5">City / Destination</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Miami"
            autoFocus
            className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-[#C97552]/60 transition-colors text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-white/35 mb-1.5">Country</label>
          <input
            type="text"
            value={country}
            onChange={e => setCountry(e.target.value)}
            placeholder="e.g. United States"
            className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-[#C97552]/60 transition-colors text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-white/35 mb-1.5">Start date</label>
          <input
            type="date"
            value={start}
            onChange={e => setStart(e.target.value)}
            className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#C97552]/60 transition-colors text-sm [color-scheme:dark]"
          />
        </div>
        <div>
          <label className="block text-xs text-white/35 mb-1.5">Days</label>
          <input
            type="number"
            value={days}
            min={1}
            max={30}
            onChange={e => setDays(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#C97552]/60 transition-colors text-sm"
          />
        </div>
      </div>

      {start && days > 0 && (
        <p className="text-xs text-white/35">
          {formatDateRange(start, endDate)} · {days} {days === 1 ? 'day' : 'days'}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={submit}
          disabled={!name.trim() || !country.trim()}
          className="flex-1 bg-[#C97552] text-white text-sm font-medium py-3 rounded-full disabled:opacity-40 hover:bg-[#b86644] transition-colors"
        >
          Add to trip
        </button>
        <button
          onClick={onCancel}
          className="px-5 py-3 text-sm text-white/40 border border-white/12 rounded-full hover:border-white/25 hover:text-white/60 transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Main page inner ──────────────────────────────────────────────────────────

function PlanNewInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const prefillDest    = searchParams.get('dest')    ?? ''
  const prefillCountry = searchParams.get('country') ?? ''

  const [tripName,      setTripName]      = useState('')
  const [destinations,  setDestinations]  = useState<TripDestination[]>([])
  const [showAddForm,   setShowAddForm]   = useState(false)
  const [itineraries,   setItineraries]   = useState<GeneratedItinerary[]>([])
  const [generating,    setGenerating]    = useState(false)
  const [profile,       setProfile]       = useState<UserProfile | null>(null)
  const [saving,        setSaving]        = useState(false)
  const [savedTripId,   setSavedTripId]   = useState<string | null>(null)
  const [shareToken,    setShareToken]    = useState<string | null>(null)

  // Pre-open add form if dest is pre-filled from discover page
  const [formPrefillUsed, setFormPrefillUsed] = useState(false)
  useEffect(() => {
    if ((prefillDest || prefillCountry) && !formPrefillUsed) {
      setShowAddForm(true)
      setFormPrefillUsed(true)
    }
  }, [prefillDest, prefillCountry, formPrefillUsed])

  // Load user profile
  useEffect(() => {
    async function load() {
      const supabase = getSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('onboarding_responses').select('*').eq('user_id', user.id).single()
      if (data) {
        setProfile({
          budget_per_day:       data.budget_per_day      ?? '50-150',
          group_type:           data.group_type          ?? 'couple',
          interests:            data.interests           ?? [],
          dietary_preferences:  data.dietary_preferences ?? [],
          home_city:            data.home_city           ?? '',
          home_country:         data.home_country        ?? '',
        })
      }
    }
    load()
  }, [router])

  // Compute next start date (day after last destination ends)
  const nextStartDate = destinations.length > 0
    ? addDays(destinations[destinations.length - 1].end_date, 1)
    : new Date().toISOString().split('T')[0]

  // Total trip stats
  const totalDays = destinations.reduce((s, d) => s + d.days, 0)
  const tripStart = destinations[0]?.start_date ?? ''
  const tripEnd   = destinations[destinations.length - 1]?.end_date ?? ''

  function addDestination(dest: TripDestination) {
    setDestinations(prev => [...prev, dest])
    setShowAddForm(false)
  }

  function removeDestination(id: string) {
    setDestinations(prev => prev.filter(d => d.id !== id))
    setItineraries(prev => prev.filter(i => i.destination_id !== id))
  }

  // ── Generate itineraries ────────────────────────────────────────────────────
  const buildItinerary = useCallback(async () => {
    if (destinations.length === 0) return
    setGenerating(true)
    setItineraries([])

    // Initialise loading states
    const initial: GeneratedItinerary[] = destinations.map(d => ({
      destination_id: d.id,
      result:         { destination: d.name, country: d.country, days: d.days, start_date: d.start_date, end_date: d.end_date, itinerary: [] },
      loading:        true,
      error:          '',
    }))
    setItineraries(initial)

    // Fire requests in parallel
    const requests = destinations.map(async (dest) => {
      try {
        const res = await fetch('/api/itinerary', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            destination:  dest.name,
            country:      dest.country,
            days:         dest.days,
            start_date:   dest.start_date,
            user_profile: profile ?? undefined,
          }),
        })
        const data = await res.json()
        if (!res.ok || data.error) throw new Error(data.error ?? 'Generation failed')
        return { id: dest.id, result: data as ItineraryResult, error: '' }
      } catch (err) {
        return { id: dest.id, result: null, error: (err as Error).message }
      }
    })

    const results = await Promise.all(requests)

    setItineraries(prev => prev.map(item => {
      const r = results.find(x => x.id === item.destination_id)
      if (!r) return item
      if (r.error) return { ...item, loading: false, error: r.error }
      return { ...item, loading: false, result: r.result!, error: '' }
    }))

    setGenerating(false)
  }, [destinations, profile])

  // ── Save trip ────────────────────────────────────────────────────────────────
  const saveTrip = useCallback(async () => {
    if (destinations.length === 0) return
    setSaving(true)

    const supabase = getSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    // Create trip record
    const { data: trip, error: tripErr } = await supabase
      .from('trips')
      .insert({
        user_id:    user.id,
        trip_name:  tripName.trim() || `${destinations.map(d => d.name).join(' + ')} — ${tripStart}`,
        status:     'planning',
        total_days: totalDays,
        start_date: tripStart,
        end_date:   tripEnd,
      })
      .select()
      .single()

    if (tripErr || !trip) {
      console.error('[Save trip]', tripErr)
      setSaving(false)
      return
    }

    // Insert trip_destinations
    const itin = itineraries
    await supabase.from('trip_destinations').insert(
      destinations.map((dest, idx) => ({
        trip_id:          trip.id,
        destination_name: dest.name,
        country:          dest.country,
        position:         idx + 1,
        days:             dest.days,
        start_date:       dest.start_date,
        end_date:         dest.end_date,
        itinerary_json:   itin.find(i => i.destination_id === dest.id)?.result?.itinerary ?? null,
      }))
    )

    setSavedTripId(trip.id)
    setShareToken(trip.share_token ?? null)
    setSaving(false)
  }, [destinations, itineraries, tripName, totalDays, tripStart, tripEnd, router])

  const hasItineraries = itineraries.length > 0 && itineraries.some(i => !i.loading && !i.error && i.result.itinerary.length > 0)

  return (
    <div className="min-h-screen bg-[#0d1f35]">
      <main className="max-w-2xl mx-auto px-4 py-10 space-y-6">

        {/* Header */}
        <div>
          <p className="text-xs text-white/35 uppercase tracking-widest font-label mb-2">Trip planner</p>
          <h1 className="font-serif italic text-4xl text-white leading-tight">Plan your trip</h1>
        </div>

        {/* Trip name */}
        <input
          type="text"
          value={tripName}
          onChange={e => setTripName(e.target.value)}
          placeholder="e.g. Miami + San Francisco May 2026 (optional)"
          className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-[#C97552]/40 transition-colors text-sm"
        />

        {/* Destinations */}
        <div className="space-y-2">
          {destinations.length === 0 && !showAddForm && (
            <div className="text-center py-10 border border-dashed border-white/12 rounded-2xl">
              <p className="text-white/40 text-sm">No destinations yet.</p>
              <p className="text-white/25 text-xs mt-1">Add your first stop below.</p>
            </div>
          )}

          {destinations.map((dest, idx) => (
            <div key={dest.id}>
              {/* Transport connector between destinations */}
              {idx > 0 && (
                <TransportConnector
                  from={destinations[idx - 1]}
                  to={dest}
                  fromEndDate={destinations[idx - 1].end_date}
                  homeCity={profile?.home_city ?? ''}
                />
              )}

              {/* Destination card */}
              <div className="rounded-2xl border border-white/10 bg-white/4 p-4 flex items-center justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="text-lg mt-0.5">📍</span>
                  <div className="min-w-0">
                    <p className="text-white font-medium text-sm">
                      {dest.name}, {dest.country}
                      <span className="text-white/40 font-normal ml-2">{dest.days} {dest.days === 1 ? 'day' : 'days'}</span>
                    </p>
                    <p className="text-white/35 text-xs mt-0.5">{formatDateRange(dest.start_date, dest.end_date)}</p>
                  </div>
                </div>
                <button
                  onClick={() => removeDestination(dest.id)}
                  className="text-white/25 hover:text-white/60 transition-colors text-xl leading-none flex-shrink-0"
                  aria-label="Remove destination"
                >
                  ×
                </button>
              </div>
            </div>
          ))}

          {/* Add form */}
          {showAddForm && (
            <AddDestForm
              nextStart={nextStartDate}
              onAdd={addDestination}
              onCancel={() => setShowAddForm(false)}
              prefillName={destinations.length === 0 ? prefillDest : ''}
              prefillCountry={destinations.length === 0 ? prefillCountry : ''}
            />
          )}

          {/* + Add destination button */}
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full py-3 rounded-xl border border-dashed border-white/15 text-white/40 text-sm hover:border-white/30 hover:text-white/60 transition-all"
            >
              + Add destination
            </button>
          )}
        </div>

        {/* Trip summary + CTA */}
        {destinations.length > 0 && (
          <div className="sticky bottom-20 md:bottom-4 z-10">
            <div className="bg-[#0d1f35]/95 backdrop-blur border border-white/12 rounded-2xl p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-white/50 text-xs">
                  Total: <span className="text-white">{totalDays} {totalDays === 1 ? 'day' : 'days'}</span>
                  {tripStart && tripEnd && (
                    <span className="ml-2 text-white/35">· {formatDateRange(tripStart, tripEnd)}</span>
                  )}
                </p>
                <p className="text-white/25 text-xs mt-0.5">{destinations.length} {destinations.length === 1 ? 'destination' : 'destinations'}</p>
              </div>
              <button
                onClick={buildItinerary}
                disabled={generating || destinations.length === 0}
                className="bg-[#C97552] text-white text-sm font-semibold px-6 py-3 rounded-full disabled:opacity-40 hover:bg-[#b86644] transition-colors flex-shrink-0"
              >
                {generating ? 'Building…' : 'Build itinerary →'}
              </button>
            </div>
          </div>
        )}

        {/* ── Generated itineraries ──────────────────────────────────────── */}
        {itineraries.length > 0 && (
          <div className="space-y-8 pt-4">
            {itineraries.map((itin, idx) => {
              const dest = destinations.find(d => d.id === itin.destination_id)
              if (!dest) return null

              return (
                <div key={itin.destination_id}>
                  {/* Section header */}
                  <div className="border-t border-white/10 pt-6 mb-4">
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                      <div>
                        <p className="text-xs text-white/35 uppercase tracking-widest font-label mb-1">
                          📍 {dest.name.toUpperCase()}, {dest.country.toUpperCase()}
                          {idx > 0 && <span className="ml-2">· Days {
                            destinations.slice(0, idx).reduce((s, d) => s + d.days, 0) + 1
                          }–{destinations.slice(0, idx + 1).reduce((s, d) => s + d.days, 0)}</span>}
                          {idx === 0 && dest.days > 1 && <span className="ml-2">· Days 1–{dest.days}</span>}
                          {idx === 0 && dest.days === 1 && <span className="ml-2">· Day 1</span>}
                        </p>
                        <h2 className="font-serif italic text-2xl text-white">{dest.name}</h2>
                        <p className="text-white/35 text-xs mt-0.5">{formatDateRange(dest.start_date, dest.end_date)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Loading skeleton */}
                  {itin.loading && (
                    <div className="flex items-center gap-3 py-6 text-white/40 text-sm">
                      <div className="w-4 h-4 rounded-full border border-white/30 border-t-[#C97552]"
                        style={{ animation: 'spin 0.8s linear infinite' }} />
                      Building {dest.days}-day itinerary for {dest.name}…
                      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                  )}

                  {/* Error */}
                  {!itin.loading && itin.error && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
                      Failed to generate itinerary for {dest.name}: {itin.error}
                    </div>
                  )}

                  {/* Day cards */}
                  {!itin.loading && !itin.error && itin.result.itinerary.length > 0 && (
                    <div className="space-y-4">
                      {itin.result.itinerary.map(day => (
                        <DayCard key={day.day} day={day} />
                      ))}
                    </div>
                  )}

                  {/* Transport connector to next destination */}
                  {idx < destinations.length - 1 && !itin.loading && !itin.error && (
                    <div className="mt-4">
                      <TransportConnector
                        from={dest}
                        to={destinations[idx + 1]}
                        fromEndDate={dest.end_date}
                        homeCity={profile?.home_city ?? ''}
                      />
                    </div>
                  )}
                </div>
              )
            })}

            {/* Save & Share */}
            {hasItineraries && (
              <div className="border-t border-white/10 pt-6 space-y-3">
                {savedTripId ? (
                  <div className="space-y-3">
                    <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
                      <p className="text-green-400 text-sm font-medium">✓ Trip saved</p>
                      <p className="text-white/40 text-xs mt-1">You can find it in My Trips</p>
                    </div>
                    {shareToken && (
                      <div className="bg-white/4 border border-white/10 rounded-xl p-4 space-y-2">
                        <p className="text-white/50 text-xs">Share this trip</p>
                        <div className="flex items-center gap-2">
                          <input
                            readOnly
                            value={`${typeof window !== 'undefined' ? window.location.origin : ''}/trip/${shareToken}`}
                            className="flex-1 bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-white/60 text-xs focus:outline-none"
                          />
                          <button
                            onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/trip/${shareToken}`)}
                            className="text-xs text-white/40 border border-white/12 rounded-lg px-3 py-2 hover:border-white/25 hover:text-white/60 transition-all"
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <button
                      onClick={saveTrip}
                      disabled={saving}
                      className="flex-1 bg-white text-[#0d1f35] text-sm font-semibold py-3.5 rounded-full disabled:opacity-50 hover:bg-white/90 transition-all"
                    >
                      {saving ? 'Saving…' : 'Save trip'}
                    </button>
                    <button
                      onClick={saveTrip}
                      disabled={saving}
                      className="flex-1 border border-white/15 text-white/60 text-sm py-3.5 rounded-full hover:border-white/30 hover:text-white/80 transition-all"
                    >
                      Share trip →
                    </button>
                  </div>
                )}
                <button
                  onClick={() => router.push('/trips')}
                  className="w-full text-white/25 text-xs py-2 hover:text-white/45 transition-colors"
                >
                  View all trips →
                </button>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  )
}

// ─── Page (Suspense wrapper for useSearchParams) ──────────────────────────────

export default function PlanNewPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0d1f35] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-[#C97552]"
          style={{ animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <PlanNewInner />
    </Suspense>
  )
}
