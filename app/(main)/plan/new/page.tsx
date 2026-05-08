'use client'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'
import type { ItineraryDay, ItineraryResult } from '@/app/api/itinerary/route'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FlightInfo {
  status:           'none' | 'booked'
  arrival_date:     string
  arrival_time:     string
  departure_date:   string
  departure_time:   string
  flight_number:    string
  pdf_parsing:      boolean
  pdf_extracted:    PdfFlight[] | null
  pdf_confirmed:    boolean
}

interface PdfFlight {
  from_city:        string | null
  to_city:          string | null
  departure_date:   string | null
  departure_time:   string | null
  arrival_date:     string | null
  arrival_time:     string | null
  flight_number:    string | null
  airline:          string | null
}

interface TripDestination {
  id:           string
  name:         string
  country:      string
  days:         number
  start_date:   string
  end_date:     string
  flights:      FlightInfo
  user_plans:   string
}

interface GroupComposition {
  traveler_count:       number
  includes_adults:      boolean
  includes_children:    boolean
  includes_teenagers:   boolean
  includes_elderly:     boolean
  dietary_some_veg:     boolean
  vegetarian_count:     number
  dietary_halal:        boolean
  dietary_gluten_free:  boolean
  dietary_none:         boolean
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

// ─── IATA city lookup ─────────────────────────────────────────────────────────

const CITY_IATA: Record<string, string> = {
  'atlanta': 'ATL', 'new york': 'JFK', 'new york city': 'JFK', 'nyc': 'JFK',
  'london': 'LHR', 'los angeles': 'LAX', 'la': 'LAX', 'sydney': 'SYD',
  'dubai': 'DXB', 'toronto': 'YYZ', 'chicago': 'ORD', 'miami': 'MIA',
  'san francisco': 'SFO', 'sf': 'SFO', 'durham': 'RDU', 'boston': 'BOS',
  'seattle': 'SEA', 'denver': 'DEN', 'dallas': 'DFW', 'houston': 'IAH',
  'phoenix': 'PHX', 'philadelphia': 'PHL', 'las vegas': 'LAS', 'orlando': 'MCO',
  'minneapolis': 'MSP', 'detroit': 'DTW', 'portland': 'PDX', 'salt lake city': 'SLC',
  'paris': 'CDG', 'amsterdam': 'AMS', 'frankfurt': 'FRA', 'madrid': 'MAD',
  'barcelona': 'BCN', 'rome': 'FCO', 'milan': 'MXP', 'zurich': 'ZRH',
  'vienna': 'VIE', 'brussels': 'BRU', 'lisbon': 'LIS', 'athens': 'ATH',
  'stockholm': 'ARN', 'copenhagen': 'CPH', 'oslo': 'OSL', 'helsinki': 'HEL',
  'tokyo': 'NRT', 'osaka': 'KIX', 'singapore': 'SIN', 'hong kong': 'HKG',
  'bangkok': 'BKK', 'mumbai': 'BOM', 'delhi': 'DEL', 'cairo': 'CAI',
  'johannesburg': 'JNB', 'nairobi': 'NBO', 'cancun': 'CUN', 'mexico city': 'MEX',
  'bogota': 'BOG', 'lima': 'LIM', 'buenos aires': 'EZE', 'sao paulo': 'GRU',
  'auckland': 'AKL', 'melbourne': 'MEL', 'brisbane': 'BNE', 'perth': 'PER',
  'kuala lumpur': 'KUL', 'bali': 'DPS', 'denpasar': 'DPS', 'jakarta': 'CGK',
  'seoul': 'ICN', 'beijing': 'PEK', 'shanghai': 'PVG', 'taipei': 'TPE',
  'istanbul': 'IST', 'tel aviv': 'TLV', 'doha': 'DOH', 'abu dhabi': 'AUH',
  'dublin': 'DUB', 'edinburgh': 'EDI', 'manchester': 'MAN',
}

function getIATA(city: string): string {
  return CITY_IATA[city.toLowerCase().trim()] ?? city.toUpperCase().slice(0, 3)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function formatDateRange(start: string, end: string): string {
  if (!start) return ''
  const s = new Date(start)
  const e = new Date(end)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  if (start === end) return s.toLocaleDateString('en-US', opts)
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${e.getDate()}, ${e.getFullYear()}`
  }
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', opts)}`
}

function makeSkyscannerLink(originCity: string, destName: string, outDate: string): string {
  const orig = getIATA(originCity)
  const dest = getIATA(destName)
  const d    = outDate.replace(/-/g, '')
  return `https://www.skyscanner.com/transport/flights/${orig}/${dest}/${d}/`
}

function localId(): string {
  return Math.random().toString(36).slice(2)
}

function calcEndDate(start: string, days: number): string {
  return addDays(start, days - 1)
}

function emptyFlight(): FlightInfo {
  return {
    status: 'none', arrival_date: '', arrival_time: '',
    departure_date: '', departure_time: '', flight_number: '',
    pdf_parsing: false, pdf_extracted: null, pdf_confirmed: false,
  }
}

// ─── Group composition section ────────────────────────────────────────────────

function GroupCompositionSection({
  group, onChange,
}: { group: GroupComposition; onChange: (g: GroupComposition) => void }) {
  function set<K extends keyof GroupComposition>(k: K, v: GroupComposition[K]) {
    onChange({ ...group, [k]: v })
  }

  const typeOptions = [
    { key: 'includes_adults',     label: 'Adults'           },
    { key: 'includes_children',   label: 'Children under 12'},
    { key: 'includes_teenagers',  label: 'Teenagers 12–17'  },
    { key: 'includes_elderly',    label: 'Elderly 65+'      },
  ] as const

  return (
    <div className="bg-white/4 border border-white/8 rounded-2xl p-5 space-y-5">
      <p className="text-xs text-white/35 uppercase tracking-widest font-label">Who&apos;s coming on this trip?</p>

      {/* Traveler count */}
      <div className="flex items-center gap-4">
        <span className="text-sm text-white/70 flex-1">Number of travelers</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => set('traveler_count', Math.max(1, group.traveler_count - 1))}
            className="w-8 h-8 rounded-full border border-white/15 text-white/60 hover:border-white/35 hover:text-white transition-all flex items-center justify-center text-lg leading-none"
          >−</button>
          <span className="text-white font-medium w-6 text-center">{group.traveler_count}</span>
          <button
            onClick={() => set('traveler_count', group.traveler_count + 1)}
            className="w-8 h-8 rounded-full border border-white/15 text-white/60 hover:border-white/35 hover:text-white transition-all flex items-center justify-center text-lg leading-none"
          >+</button>
        </div>
      </div>

      {/* Traveler types */}
      <div className="space-y-2">
        <p className="text-xs text-white/35">Traveler types</p>
        {typeOptions.map(opt => (
          <label key={opt.key} className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={group[opt.key]}
              onChange={e => set(opt.key, e.target.checked)}
              className="w-4 h-4 accent-[#C97552] rounded"
            />
            <span className="text-sm text-white/65 group-hover:text-white/85 transition-colors">{opt.label}</span>
          </label>
        ))}
      </div>

      {/* Dietary mix */}
      <div className="space-y-2 border-t border-white/8 pt-4">
        <p className="text-xs text-white/35">Any dietary requirements in the group?</p>
        <label className="flex items-center gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={group.dietary_some_veg}
            onChange={e => {
              set('dietary_some_veg', e.target.checked)
              if (!e.target.checked) set('vegetarian_count', 0)
              if (e.target.checked) set('dietary_none', false)
            }}
            className="w-4 h-4 accent-[#C97552]"
          />
          <span className="text-sm text-white/65 group-hover:text-white/85 transition-colors">Some are vegetarian / vegan</span>
        </label>
        {group.dietary_some_veg && (
          <div className="ml-7 flex items-center gap-3">
            <span className="text-xs text-white/40">How many?</span>
            <input
              type="number"
              min={1}
              max={group.traveler_count}
              value={group.vegetarian_count || ''}
              onChange={e => set('vegetarian_count', Math.min(group.traveler_count, parseInt(e.target.value) || 0))}
              placeholder="0"
              className="w-16 bg-white/5 border border-white/15 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-[#C97552]/60 transition-colors"
            />
            <span className="text-xs text-white/30">of {group.traveler_count}</span>
          </div>
        )}
        <label className="flex items-center gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={group.dietary_halal}
            onChange={e => { set('dietary_halal', e.target.checked); if (e.target.checked) set('dietary_none', false) }}
            className="w-4 h-4 accent-[#C97552]"
          />
          <span className="text-sm text-white/65 group-hover:text-white/85 transition-colors">Some are halal</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={group.dietary_gluten_free}
            onChange={e => { set('dietary_gluten_free', e.target.checked); if (e.target.checked) set('dietary_none', false) }}
            className="w-4 h-4 accent-[#C97552]"
          />
          <span className="text-sm text-white/65 group-hover:text-white/85 transition-colors">Some are gluten free</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={group.dietary_none}
            onChange={e => {
              set('dietary_none', e.target.checked)
              if (e.target.checked) {
                set('dietary_some_veg', false)
                set('dietary_halal', false)
                set('dietary_gluten_free', false)
                set('vegetarian_count', 0)
              }
            }}
            className="w-4 h-4 accent-[#C97552]"
          />
          <span className="text-sm text-white/65 group-hover:text-white/85 transition-colors">No restrictions — everyone eats everything</span>
        </label>
      </div>

      {/* Summary */}
      {group.includes_elderly && (
        <p className="text-xs text-amber-400/70 bg-amber-400/8 border border-amber-400/15 rounded-lg px-3 py-2">
          ⚠️ Elderly travelers detected — itinerary will include accessibility notes and alternatives for every activity.
        </p>
      )}
    </div>
  )
}

// ─── Flights section ──────────────────────────────────────────────────────────

function FlightsSection({
  dest, homeCity, flights, onChange,
}: {
  dest:     TripDestination
  homeCity: string
  flights:  FlightInfo
  onChange: (f: FlightInfo) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  function set<K extends keyof FlightInfo>(k: K, v: FlightInfo[K]) {
    onChange({ ...flights, [k]: v })
  }

  const skyscannerLink = makeSkyscannerLink(homeCity, dest.name, dest.start_date)

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    set('pdf_parsing', true)
    set('pdf_extracted', null)
    set('pdf_confirmed', false)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res  = await fetch('/api/parse-flight-pdf', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.flights && data.flights.length > 0) {
        set('pdf_extracted', data.flights)
        // Auto-fill with first matching inbound flight to dest
        const inbound = data.flights.find((f: PdfFlight) =>
          f.to_city?.toLowerCase().includes(dest.name.toLowerCase()) ||
          dest.name.toLowerCase().includes((f.to_city ?? '').toLowerCase())
        ) ?? data.flights[0]
        if (inbound) {
          onChange({
            ...flights,
            pdf_parsing:    false,
            pdf_extracted:  data.flights,
            arrival_date:   inbound.arrival_date   ?? '',
            arrival_time:   inbound.arrival_time   ?? '',
            flight_number:  inbound.flight_number  ?? '',
          })
        } else {
          set('pdf_parsing', false)
        }
      } else {
        set('pdf_parsing', false)
      }
    } catch {
      set('pdf_parsing', false)
    }
  }

  function confirmPdf() {
    onChange({ ...flights, pdf_confirmed: true, status: 'booked', pdf_extracted: null })
  }

  const hasArrival   = !!(flights.arrival_date && flights.arrival_time)
  const hasDeparture = !!(flights.departure_date && flights.departure_time)

  return (
    <div className="mt-2 bg-white/3 border border-white/8 rounded-xl p-4 space-y-4">
      <p className="text-xs text-white/35 uppercase tracking-widest font-label">Flights to {dest.name}</p>

      {/* Option selector */}
      <div className="space-y-2">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="radio"
            name={`flight-status-${dest.id}`}
            checked={flights.status === 'none'}
            onChange={() => onChange({ ...flights, status: 'none' })}
            className="accent-[#C97552]"
          />
          <span className="text-sm text-white/65">Search for flights</span>
        </label>

        {flights.status === 'none' && (
          <div className="ml-7">
            <a
              href={skyscannerLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs text-white/60 border border-white/15 rounded-full px-4 py-2 hover:border-white/30 hover:text-white/80 transition-all"
            >
              Search Skyscanner → {dest.name}
            </a>
          </div>
        )}

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="radio"
            name={`flight-status-${dest.id}`}
            checked={flights.status === 'booked'}
            onChange={() => onChange({ ...flights, status: 'booked' })}
            className="accent-[#C97552]"
          />
          <span className="text-sm text-white/65">Already booked</span>
        </label>
      </div>

      {/* Booked flow */}
      {flights.status === 'booked' && (
        <div className="space-y-4 border-t border-white/8 pt-3">
          {/* PDF upload */}
          {!flights.pdf_confirmed && (
            <div className="space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,image/*"
                onChange={handlePdfUpload}
                className="hidden"
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={flights.pdf_parsing}
                className="w-full flex items-center justify-center gap-2 border border-dashed border-white/20 rounded-xl py-3 text-sm text-white/50 hover:border-white/35 hover:text-white/70 transition-all disabled:opacity-50"
              >
                {flights.pdf_parsing ? (
                  <>
                    <div className="w-3 h-3 rounded-full border border-white/30 border-t-white/70"
                      style={{ animation: 'spin 0.7s linear infinite' }} />
                    Reading your booking confirmation…
                    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                  </>
                ) : (
                  <>📄 Upload booking confirmation</>
                )}
              </button>

              {/* PDF extracted flights — confirm or edit */}
              {flights.pdf_extracted && flights.pdf_extracted.length > 0 && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                  <p className="text-xs text-white/40">Is this correct?</p>
                  {flights.pdf_extracted.map((f, i) => (
                    <div key={i} className="text-xs text-white/65 space-y-0.5">
                      <p className="font-medium text-white/80">{f.from_city ?? '?'} → {f.to_city ?? '?'}</p>
                      {f.departure_date && <p>Departs: {f.departure_date} {f.departure_time ?? ''}</p>}
                      {f.arrival_date   && <p>Arrives: {f.arrival_date} {f.arrival_time ?? ''}</p>}
                      {f.flight_number  && <p>Flight: {f.flight_number}</p>}
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={confirmPdf}
                      className="flex-1 text-xs bg-[#C97552] text-white rounded-full py-2 hover:bg-[#b86644] transition-colors"
                    >
                      Yes, use these
                    </button>
                    <button
                      onClick={() => set('pdf_extracted', null)}
                      className="flex-1 text-xs border border-white/15 text-white/50 rounded-full py-2 hover:border-white/25 transition-all"
                    >
                      Edit manually
                    </button>
                  </div>
                </div>
              )}

              <p className="text-xs text-white/25 text-center">or enter manually below</p>
            </div>
          )}

          {/* Manual entry */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs text-white/35">Arriving date</label>
              <input type="date" value={flights.arrival_date}
                onChange={e => set('arrival_date', e.target.value)}
                className="w-full bg-white/5 border border-white/12 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#C97552]/60 [color-scheme:dark]" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-white/35">Arrival time</label>
              <input type="time" value={flights.arrival_time}
                onChange={e => set('arrival_time', e.target.value)}
                className="w-full bg-white/5 border border-white/12 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#C97552]/60 [color-scheme:dark]" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-white/35">Departing date</label>
              <input type="date" value={flights.departure_date}
                onChange={e => set('departure_date', e.target.value)}
                className="w-full bg-white/5 border border-white/12 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#C97552]/60 [color-scheme:dark]" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-white/35">Departure time</label>
              <input type="time" value={flights.departure_time}
                onChange={e => set('departure_time', e.target.value)}
                className="w-full bg-white/5 border border-white/12 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#C97552]/60 [color-scheme:dark]" />
            </div>
            <div className="space-y-1 col-span-2">
              <label className="block text-xs text-white/35">Flight number (optional)</label>
              <input type="text" value={flights.flight_number}
                onChange={e => set('flight_number', e.target.value)}
                placeholder="e.g. AA2547"
                className="w-full bg-white/5 border border-white/12 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#C97552]/60" />
            </div>
          </div>

          {/* Summary card */}
          {(hasArrival || hasDeparture) && (
            <div className="bg-[#C97552]/8 border border-[#C97552]/20 rounded-xl px-4 py-3 text-xs space-y-1.5">
              <div className="flex items-center gap-2">
                <span>✈️</span>
                <span className="text-white/80 font-medium">{dest.name} flights</span>
                {flights.flight_number && <span className="text-white/40">· {flights.flight_number}</span>}
              </div>
              {hasArrival && (
                <p className="text-white/55 ml-6">
                  {flights.arrival_date} · Arrives {flights.arrival_time}
                </p>
              )}
              {hasDeparture && (
                <p className="text-white/55 ml-6">
                  {flights.departure_date} · Departs {flights.departure_time}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── User plans section ───────────────────────────────────────────────────────

function UserPlansSection({
  destName, value, onChange,
}: { destName: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mt-2 bg-white/3 border border-white/8 rounded-xl p-4 space-y-3">
      <p className="text-xs text-white/35 uppercase tracking-widest font-label">Anything already planned for {destName}? <span className="normal-case text-white/20">(optional)</span></p>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={3}
        placeholder={`e.g. Landing at 1pm, have a rental car, want to do Pier 39 on arrival day, 17 Mile Drive sometime during the trip, staying in Mission District`}
        className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-3 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-[#C97552]/40 transition-colors resize-none leading-relaxed"
      />
      {value && (
        <button onClick={() => onChange('')} className="text-xs text-white/25 hover:text-white/45 transition-colors">Clear</button>
      )}
    </div>
  )
}

// ─── Itinerary block view ─────────────────────────────────────────────────────

function ItineraryBlockView({ label, block }: { label: string; block: ItineraryDay['morning'] }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-white/30 uppercase tracking-widest font-label">{label}</p>
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
        <ItineraryBlockView label="🌅 Morning"   block={day.morning}   />
        <div className="pt-4"><ItineraryBlockView label="☀️ Afternoon" block={day.afternoon} /></div>
        <div className="pt-4"><ItineraryBlockView label="🌙 Evening"   block={day.evening}   /></div>
      </div>
      <div className="pt-2 border-t border-white/8 flex justify-end">
        <span className="text-xs text-[#C97552]/70">Day total: ~{day.day_total_estimate}</span>
      </div>
    </div>
  )
}

// ─── Transport connector ──────────────────────────────────────────────────────

function TransportConnector({ from, to }: { from: TripDestination; to: TripDestination }) {
  const travelDate = addDays(from.end_date, 1)
  const link = `https://www.skyscanner.com/transport/flights/${getIATA(from.name)}/${getIATA(to.name)}/${travelDate.replace(/-/g, '')}/`
  return (
    <div className="flex items-center gap-3 py-3 px-4 bg-white/3 border border-white/8 rounded-xl my-1">
      <span className="text-lg">✈️</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/60">
          <span className="text-white/80">{from.name}</span>
          {' → '}
          <span className="text-white/80">{to.name}</span>
        </p>
        <p className="text-xs text-white/30 mt-0.5">Travel day · {travelDate}</p>
      </div>
      <a href={link} target="_blank" rel="noopener noreferrer"
        className="flex-shrink-0 text-xs text-white/50 border border-white/15 rounded-full px-3 py-1.5 hover:border-white/30 hover:text-white/80 transition-all">
        Search flights →
      </a>
    </div>
  )
}

// ─── Add destination form ─────────────────────────────────────────────────────

function AddDestForm({ nextStart, onAdd, onCancel, prefillName = '', prefillCountry = '' }: {
  nextStart:       string
  onAdd:           (dest: TripDestination) => void
  onCancel:        () => void
  prefillName?:    string
  prefillCountry?: string
}) {
  const [name,    setName]    = useState(prefillName)
  const [country, setCountry] = useState(prefillCountry)
  const [days,    setDays]    = useState(3)
  const [start,   setStart]   = useState(nextStart)
  const endDate = calcEndDate(start, days)

  function submit() {
    if (!name.trim() || !country.trim() || days < 1 || !start) return
    onAdd({
      id: localId(), name: name.trim(), country: country.trim(),
      days, start_date: start, end_date: endDate,
      flights: emptyFlight(), user_plans: '',
    })
  }

  return (
    <div className="bg-white/5 border border-white/12 rounded-2xl p-5 space-y-4">
      <p className="text-xs text-white/40 uppercase tracking-widest font-label">Add destination</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-white/35 mb-1.5">City / Destination</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Miami" autoFocus
            className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-[#C97552]/60 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-white/35 mb-1.5">Country</label>
          <input type="text" value={country} onChange={e => setCountry(e.target.value)}
            placeholder="e.g. United States"
            className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-[#C97552]/60 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-white/35 mb-1.5">Start date</label>
          <input type="date" value={start} onChange={e => setStart(e.target.value)}
            className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#C97552]/60 text-sm [color-scheme:dark]" />
        </div>
        <div>
          <label className="block text-xs text-white/35 mb-1.5">Days</label>
          <input type="number" value={days} min={1} max={30}
            onChange={e => setDays(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#C97552]/60 text-sm" />
        </div>
      </div>
      {start && days > 0 && (
        <p className="text-xs text-white/35">{formatDateRange(start, endDate)} · {days} {days === 1 ? 'day' : 'days'}</p>
      )}
      <div className="flex gap-2 pt-1">
        <button onClick={submit} disabled={!name.trim() || !country.trim()}
          className="flex-1 bg-[#C97552] text-white text-sm font-medium py-3 rounded-full disabled:opacity-40 hover:bg-[#b86644] transition-colors">
          Add to trip
        </button>
        <button onClick={onCancel}
          className="px-5 py-3 text-sm text-white/40 border border-white/12 rounded-full hover:border-white/25 hover:text-white/60 transition-all">
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

  const [tripName,     setTripName]     = useState('')
  const [destinations, setDestinations] = useState<TripDestination[]>([])
  const [showAddForm,  setShowAddForm]  = useState(false)
  const [itineraries,  setItineraries]  = useState<GeneratedItinerary[]>([])
  const [generating,   setGenerating]   = useState(false)
  const [profile,      setProfile]      = useState<UserProfile | null>(null)
  const [saving,       setSaving]       = useState(false)
  const [savedTripId,  setSavedTripId]  = useState<string | null>(null)
  const [shareToken,   setShareToken]   = useState<string | null>(null)
  const [formPrefillUsed, setFormPrefillUsed] = useState(false)

  const [group, setGroup] = useState<GroupComposition>({
    traveler_count:      2,
    includes_adults:     true,
    includes_children:   false,
    includes_teenagers:  false,
    includes_elderly:    false,
    dietary_some_veg:    false,
    vegetarian_count:    0,
    dietary_halal:       false,
    dietary_gluten_free: false,
    dietary_none:        true,
  })

  // Pre-open add form if dest pre-filled from discover
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
        // Sync group size from profile if set
        if (data.group_type === 'solo') setGroup(g => ({ ...g, traveler_count: 1 }))
      }
    }
    load()
  }, [router])

  const nextStartDate = destinations.length > 0
    ? addDays(destinations[destinations.length - 1].end_date, 1)
    : new Date().toISOString().split('T')[0]

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

  function updateDestination(id: string, updates: Partial<TripDestination>) {
    setDestinations(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d))
  }

  // ── Generate ──────────────────────────────────────────────────────────────────
  const buildItinerary = useCallback(async () => {
    if (destinations.length === 0) return
    setGenerating(true)
    setItineraries([])

    const initial: GeneratedItinerary[] = destinations.map(d => ({
      destination_id: d.id,
      result: { destination: d.name, country: d.country, days: d.days, start_date: d.start_date, end_date: d.end_date, itinerary: [] },
      loading: true, error: '',
    }))
    setItineraries(initial)

    const requests = destinations.map(async (dest) => {
      const f = dest.flights
      try {
        const res = await fetch('/api/itinerary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            destination:  dest.name,
            country:      dest.country,
            days:         dest.days,
            start_date:   dest.start_date,
            user_profile: profile ?? undefined,
            group:        { ...group },
            flights:      f.status === 'booked' ? {
              arrival_date:   f.arrival_date   || undefined,
              arrival_time:   f.arrival_time   || undefined,
              departure_date: f.departure_date || undefined,
              departure_time: f.departure_time || undefined,
              flight_number:  f.flight_number  || undefined,
            } : undefined,
            user_plans:  dest.user_plans || undefined,
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
  }, [destinations, profile, group])

  // ── Save ──────────────────────────────────────────────────────────────────────
  const saveTrip = useCallback(async () => {
    if (destinations.length === 0) return
    setSaving(true)
    const supabase = getSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: trip, error: tripErr } = await supabase
      .from('trips')
      .insert({
        user_id: user.id,
        trip_name: tripName.trim() || `${destinations.map(d => d.name).join(' + ')} — ${tripStart}`,
        status: 'planning', total_days: totalDays, start_date: tripStart, end_date: tripEnd,
      })
      .select().single()

    if (tripErr || !trip) { setSaving(false); return }

    const itin = itineraries
    await supabase.from('trip_destinations').insert(
      destinations.map((dest, idx) => ({
        trip_id: trip.id, destination_name: dest.name, country: dest.country,
        position: idx + 1, days: dest.days, start_date: dest.start_date, end_date: dest.end_date,
        itinerary_json: itin.find(i => i.destination_id === dest.id)?.result?.itinerary ?? null,
        notes: dest.user_plans || null,
      }))
    )

    setSavedTripId(trip.id)
    setShareToken(trip.share_token ?? null)
    setSaving(false)
  }, [destinations, itineraries, tripName, totalDays, tripStart, tripEnd, router])

  const hasItineraries = itineraries.some(i => !i.loading && !i.error && i.result.itinerary.length > 0)

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
          type="text" value={tripName} onChange={e => setTripName(e.target.value)}
          placeholder="e.g. Miami + San Francisco May 2026 (optional)"
          className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-[#C97552]/40 text-sm"
        />

        {/* Group composition */}
        <GroupCompositionSection group={group} onChange={setGroup} />

        {/* Destinations */}
        <div className="space-y-3">
          {destinations.length === 0 && !showAddForm && (
            <div className="text-center py-10 border border-dashed border-white/12 rounded-2xl">
              <p className="text-white/40 text-sm">No destinations yet.</p>
              <p className="text-white/25 text-xs mt-1">Add your first stop below.</p>
            </div>
          )}

          {destinations.map((dest, idx) => (
            <div key={dest.id} className="space-y-0">
              {idx > 0 && (
                <TransportConnector from={destinations[idx - 1]} to={dest} />
              )}

              {/* Destination header card */}
              <div className="rounded-2xl border border-white/10 bg-white/4">
                {/* Compact header */}
                <div className="flex items-center justify-between gap-3 px-4 py-3.5">
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
                  <button onClick={() => removeDestination(dest.id)}
                    className="text-white/25 hover:text-white/60 transition-colors text-xl leading-none flex-shrink-0"
                    aria-label="Remove">×</button>
                </div>

                {/* Flights section */}
                <div className="px-4 pb-3">
                  <FlightsSection
                    dest={dest}
                    homeCity={profile?.home_city ?? ''}
                    flights={dest.flights}
                    onChange={f => updateDestination(dest.id, { flights: f })}
                  />
                </div>

                {/* User plans section */}
                <div className="px-4 pb-4">
                  <UserPlansSection
                    destName={dest.name}
                    value={dest.user_plans}
                    onChange={v => updateDestination(dest.id, { user_plans: v })}
                  />
                </div>
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

          {!showAddForm && (
            <button onClick={() => setShowAddForm(true)}
              className="w-full py-3 rounded-xl border border-dashed border-white/15 text-white/40 text-sm hover:border-white/30 hover:text-white/60 transition-all">
              + Add destination
            </button>
          )}
        </div>

        {/* Summary + CTA */}
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
                <p className="text-white/25 text-xs mt-0.5">
                  {destinations.length} {destinations.length === 1 ? 'destination' : 'destinations'}
                  {' · '}{group.traveler_count} {group.traveler_count === 1 ? 'traveler' : 'travelers'}
                </p>
              </div>
              <button onClick={buildItinerary} disabled={generating || destinations.length === 0}
                className="bg-[#C97552] text-white text-sm font-semibold px-6 py-3 rounded-full disabled:opacity-40 hover:bg-[#b86644] transition-colors flex-shrink-0">
                {generating ? 'Building…' : 'Build itinerary →'}
              </button>
            </div>
          </div>
        )}

        {/* Generated itineraries */}
        {itineraries.length > 0 && (
          <div className="space-y-8 pt-4">
            {itineraries.map((itin, idx) => {
              const dest = destinations.find(d => d.id === itin.destination_id)
              if (!dest) return null
              const dayOffset = destinations.slice(0, idx).reduce((s, d) => s + d.days, 0)

              return (
                <div key={itin.destination_id}>
                  <div className="border-t border-white/10 pt-6 mb-4">
                    <p className="text-xs text-white/35 uppercase tracking-widest font-label mb-1">
                      📍 {dest.name.toUpperCase()}, {dest.country.toUpperCase()}
                      {' · '}
                      {dest.days === 1
                        ? `Day ${dayOffset + 1}`
                        : `Days ${dayOffset + 1}–${dayOffset + dest.days}`
                      }
                    </p>
                    <h2 className="font-serif italic text-2xl text-white">{dest.name}</h2>
                    <p className="text-white/35 text-xs mt-0.5">{formatDateRange(dest.start_date, dest.end_date)}</p>
                  </div>

                  {itin.loading && (
                    <div className="flex items-center gap-3 py-6 text-white/40 text-sm">
                      <div className="w-4 h-4 rounded-full border border-white/30 border-t-[#C97552]"
                        style={{ animation: 'spin 0.8s linear infinite' }} />
                      Building {dest.days}-day itinerary for {dest.name}…
                      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                  )}

                  {!itin.loading && itin.error && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
                      {itin.error}
                    </div>
                  )}

                  {!itin.loading && !itin.error && itin.result.itinerary.length > 0 && (
                    <div className="space-y-4">
                      {itin.result.itinerary.map(day => <DayCard key={day.day} day={day} />)}
                    </div>
                  )}

                  {idx < destinations.length - 1 && !itin.loading && !itin.error && (
                    <div className="mt-4">
                      <TransportConnector from={dest} to={destinations[idx + 1]} />
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
                    </div>
                    {shareToken && (
                      <div className="bg-white/4 border border-white/10 rounded-xl p-4 space-y-2">
                        <p className="text-white/50 text-xs">Share this trip</p>
                        <div className="flex items-center gap-2">
                          <input readOnly
                            value={`${typeof window !== 'undefined' ? window.location.origin : ''}/trip/${shareToken}`}
                            className="flex-1 bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-white/60 text-xs focus:outline-none"
                          />
                          <button onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/trip/${shareToken}`)}
                            className="text-xs text-white/40 border border-white/12 rounded-lg px-3 py-2 hover:border-white/25 hover:text-white/60 transition-all">
                            Copy
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <button onClick={saveTrip} disabled={saving}
                      className="flex-1 bg-white text-[#0d1f35] text-sm font-semibold py-3.5 rounded-full disabled:opacity-50 hover:bg-white/90 transition-all">
                      {saving ? 'Saving…' : 'Save trip'}
                    </button>
                    <button onClick={saveTrip} disabled={saving}
                      className="flex-1 border border-white/15 text-white/60 text-sm py-3.5 rounded-full hover:border-white/30 hover:text-white/80 transition-all">
                      Share trip →
                    </button>
                  </div>
                )}
                <button onClick={() => router.push('/trips')}
                  className="w-full text-white/25 text-xs py-2 hover:text-white/45 transition-colors">
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

// ─── Page wrapper ─────────────────────────────────────────────────────────────

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
