'use client'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'
import type { ItineraryBlock, ItineraryResult } from '@/app/api/itinerary/route'

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

interface HotelInfo {
  status:        'none' | 'booked'
  neighbourhood: string
  checkin_date:  string
  checkout_date: string
}

interface TripDestination {
  id:           string
  name:         string
  country:      string
  days:         number
  start_date:   string
  end_date:     string
  flights:      FlightInfo
  hotel:        HotelInfo
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

type TimeSlot = 'morning' | 'afternoon' | 'evening'
type MaybeBlock = ItineraryBlock | null

interface MutableDay {
  day:                number
  title:              string
  morning:            MaybeBlock
  afternoon:          MaybeBlock
  evening:            MaybeBlock
  day_total_estimate: string
  loading_slot:       TimeSlot | null
}

interface EditableItinerary {
  destination_id: string
  destination:    string
  country:        string
  start_date:     string
  end_date:       string
  days:           MutableDay[]
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
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end   + 'T12:00:00')
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

function emptyHotel(): HotelInfo {
  return { status: 'none', neighbourhood: '', checkin_date: '', checkout_date: '' }
}

// ─── Reusable custom checkbox row ─────────────────────────────────────────────

function CheckRow({
  checked, onToggle, label, sublabel,
}: { checked: boolean; onToggle: () => void; label: string; sublabel?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-start gap-3 text-left py-0.5"
    >
      <span
        className={[
          'mt-0.5 flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors',
          checked
            ? 'bg-[#C97552] border-[#C97552]'
            : 'border-white/25 bg-white/5',
        ].join(' ')}
      >
        {checked && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </span>
      <span>
        <span className="text-sm text-white/65">{label}</span>
        {sublabel && <p className="text-xs text-white/30 mt-0.5">{sublabel}</p>}
      </span>
    </button>
  )
}

// ─── Group composition section ────────────────────────────────────────────────

function GroupCompositionSection({
  group, onChange,
}: { group: GroupComposition; onChange: (g: GroupComposition) => void }) {

  const typeOptions = [
    { key: 'includes_adults',     label: 'Adults'            },
    { key: 'includes_children',   label: 'Children under 12' },
    { key: 'includes_teenagers',  label: 'Teenagers 12–17'   },
    { key: 'includes_elderly',    label: 'Elderly 65+'       },
  ] as const

  return (
    <div className="bg-white/4 border border-white/8 rounded-2xl p-5 space-y-5">
      <p className="text-xs text-white/35 uppercase tracking-widest font-label">Who&apos;s coming on this trip?</p>

      <div className="flex items-center gap-4">
        <span className="text-sm text-white/70 flex-1">Number of travelers</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onChange({ ...group, traveler_count: Math.max(1, group.traveler_count - 1) })}
            className="w-8 h-8 rounded-full border border-white/15 text-white/60 hover:border-white/35 hover:text-white transition-all flex items-center justify-center text-lg leading-none"
          >−</button>
          <span className="text-white font-medium w-6 text-center">{group.traveler_count}</span>
          <button
            type="button"
            onClick={() => onChange({ ...group, traveler_count: group.traveler_count + 1 })}
            className="w-8 h-8 rounded-full border border-white/15 text-white/60 hover:border-white/35 hover:text-white transition-all flex items-center justify-center text-lg leading-none"
          >+</button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-white/35">Traveler types</p>
        {typeOptions.map(opt => (
          <CheckRow
            key={opt.key}
            checked={group[opt.key]}
            label={opt.label}
            onToggle={() => onChange({ ...group, [opt.key]: !group[opt.key] })}
          />
        ))}
      </div>

      <div className="space-y-2.5 border-t border-white/8 pt-4">
        <p className="text-xs text-white/35">Any dietary needs to accommodate?</p>

        <CheckRow
          checked={group.dietary_some_veg}
          label="Some are vegetarian or vegan"
          onToggle={() => onChange({
            ...group,
            dietary_some_veg: !group.dietary_some_veg,
            vegetarian_count: group.dietary_some_veg ? 0 : group.vegetarian_count,
            dietary_none:     !group.dietary_some_veg ? false : group.dietary_none,
          })}
        />
        {group.dietary_some_veg && (
          <div className="ml-7 flex items-center gap-3">
            <span className="text-xs text-white/40">How many?</span>
            <input
              type="number"
              min={1}
              max={group.traveler_count}
              value={group.vegetarian_count || ''}
              onChange={e => onChange({ ...group, vegetarian_count: Math.min(group.traveler_count, parseInt(e.target.value) || 0) })}
              placeholder="0"
              className="w-16 bg-white/5 border border-white/15 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-[#C97552]/60 transition-colors"
            />
            <span className="text-xs text-white/30">of {group.traveler_count}</span>
          </div>
        )}

        <CheckRow
          checked={group.dietary_halal}
          label="Some need halal food"
          sublabel="Others in the group can eat anywhere"
          onToggle={() => onChange({
            ...group,
            dietary_halal: !group.dietary_halal,
            dietary_none:  !group.dietary_halal ? false : group.dietary_none,
          })}
        />

        <CheckRow
          checked={group.dietary_gluten_free}
          label="Some are gluten free"
          onToggle={() => onChange({
            ...group,
            dietary_gluten_free: !group.dietary_gluten_free,
            dietary_none:        !group.dietary_gluten_free ? false : group.dietary_none,
          })}
        />

        <CheckRow
          checked={group.dietary_none}
          label="No restrictions — everyone eats everything"
          onToggle={() => {
            if (!group.dietary_none) {
              onChange({
                ...group,
                dietary_none:        true,
                dietary_some_veg:    false,
                dietary_halal:       false,
                dietary_gluten_free: false,
                vegetarian_count:    0,
              })
            } else {
              onChange({ ...group, dietary_none: false })
            }
          }}
        />
      </div>

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

      {flights.status === 'booked' && (
        <div className="space-y-4 border-t border-white/8 pt-3">
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

// ─── Hotel section ────────────────────────────────────────────────────────────

function HotelSection({ dest, hotel, onChange }: {
  dest:     TripDestination
  hotel:    HotelInfo
  onChange: (h: HotelInfo) => void
}) {
  const [editing, setEditing] = useState(false)

  const bookingLink = `https://www.booking.com/search.html?ss=${encodeURIComponent(dest.name)}&checkin=${dest.start_date}&checkout=${dest.end_date}`
  const nights = hotel.checkin_date && hotel.checkout_date
    ? Math.round((new Date(hotel.checkout_date + 'T12:00:00').getTime() - new Date(hotel.checkin_date + 'T12:00:00').getTime()) / 86400000)
    : 0

  const showSummary = hotel.status === 'booked' && hotel.neighbourhood && !editing

  return (
    <div className="mt-2 bg-white/3 border border-white/8 rounded-xl p-4 space-y-4">
      <p className="text-xs text-white/35 uppercase tracking-widest font-label">Hotel in {dest.name}</p>

      <div className="space-y-2">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="radio"
            name={`hotel-status-${dest.id}`}
            checked={hotel.status === 'none'}
            onChange={() => onChange({ ...hotel, status: 'none' })}
            className="accent-[#C97552]"
          />
          <span className="text-sm text-white/65">Search for hotels</span>
        </label>

        {hotel.status === 'none' && (
          <div className="ml-7">
            <a
              href={bookingLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs text-white/60 border border-white/15 rounded-full px-4 py-2 hover:border-white/30 hover:text-white/80 transition-all"
            >
              Search Booking.com → {dest.name}
            </a>
          </div>
        )}

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="radio"
            name={`hotel-status-${dest.id}`}
            checked={hotel.status === 'booked'}
            onChange={() => { onChange({ ...hotel, status: 'booked' }); setEditing(true) }}
            className="accent-[#C97552]"
          />
          <span className="text-sm text-white/65">Already booked</span>
        </label>
      </div>

      {hotel.status === 'booked' && !showSummary && (
        <div className="space-y-3 border-t border-white/8 pt-3">
          <div className="space-y-1">
            <label className="block text-xs text-white/35">Neighbourhood / area</label>
            <input
              type="text"
              value={hotel.neighbourhood}
              onChange={e => onChange({ ...hotel, neighbourhood: e.target.value })}
              placeholder="e.g. Midtown, Marais, Shibuya"
              className="w-full bg-white/5 border border-white/12 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#C97552]/60"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs text-white/35">Check-in date</label>
              <input
                type="date"
                value={hotel.checkin_date}
                onChange={e => onChange({ ...hotel, checkin_date: e.target.value })}
                className="w-full bg-white/5 border border-white/12 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#C97552]/60 [color-scheme:dark]"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-white/35">Check-out date</label>
              <input
                type="date"
                value={hotel.checkout_date}
                onChange={e => onChange({ ...hotel, checkout_date: e.target.value })}
                className="w-full bg-white/5 border border-white/12 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#C97552]/60 [color-scheme:dark]"
              />
            </div>
          </div>
          {hotel.neighbourhood && (
            <button
              onClick={() => setEditing(false)}
              className="text-xs text-[#C97552]/70 hover:text-[#C97552] transition-colors"
            >
              Done
            </button>
          )}
        </div>
      )}

      {showSummary && (
        <div className="flex items-center gap-2 bg-[#C97552]/8 border border-[#C97552]/20 rounded-xl px-4 py-3">
          <span>🏨</span>
          <span className="text-white/80 text-xs font-medium flex-1">
            {hotel.neighbourhood}
            {nights > 0 && <span className="text-white/40 font-normal"> · {nights} {nights === 1 ? 'night' : 'nights'}</span>}
          </span>
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-white/35 hover:text-white/60 border border-white/15 rounded-full px-3 py-1 transition-all"
          >
            Edit
          </button>
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

// ─── Transport connector ──────────────────────────────────────────────────────

function TransportConnector({ from, to }: { from: TripDestination; to: TripDestination }) {
  const travelDate = to.start_date
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
      flights: emptyFlight(), hotel: emptyHotel(), user_plans: '',
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

// ─── EditableBlockView ────────────────────────────────────────────────────────

function EditableBlockView({
  label, slot, block, isLoading, onReplace, onRemove, onMove, onAdd,
}: {
  label:     string
  slot:      TimeSlot
  block:     MaybeBlock
  isLoading: boolean
  onReplace: () => void
  onRemove:  () => void
  onMove:    () => void
  onAdd:     () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  if (isLoading) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs text-white/30 uppercase tracking-widest font-label">{label}</p>
        <div className="flex items-center gap-2 text-white/40 text-sm py-2">
          <div className="w-3 h-3 rounded-full border border-white/30 border-t-[#C97552]"
            style={{ animation: 'spin 0.7s linear infinite' }} />
          Generating…
        </div>
      </div>
    )
  }

  if (!block) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs text-white/30 uppercase tracking-widest font-label">{label}</p>
        <button
          onClick={onAdd}
          className="w-full border border-dashed border-white/15 rounded-xl py-3 text-xs text-white/30 hover:border-white/30 hover:text-white/50 transition-all"
        >
          + Add something here
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1.5 relative">
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/30 uppercase tracking-widest font-label">{label}</p>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="w-6 h-6 flex items-center justify-center text-white/30 hover:text-white/60 transition-colors rounded"
          >
            ⋮
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-7 z-50 bg-[#1a2f48] border border-white/12 rounded-xl shadow-xl w-48 overflow-hidden">
              <button
                onClick={() => { setMenuOpen(false); onReplace() }}
                className="w-full text-left px-4 py-3 text-sm text-white/70 hover:bg-white/8 transition-colors flex items-center gap-2"
              >
                🔄 Replace this
              </button>
              <button
                onClick={() => { setMenuOpen(false); onMove() }}
                className="w-full text-left px-4 py-3 text-sm text-white/70 hover:bg-white/8 transition-colors flex items-center gap-2"
              >
                ↕ Move to another day
              </button>
              <button
                onClick={() => { setMenuOpen(false); onRemove() }}
                className="w-full text-left px-4 py-3 text-sm text-red-400/80 hover:bg-white/8 transition-colors flex items-center gap-2"
              >
                ✕ Remove
              </button>
            </div>
          )}
        </div>
      </div>
      <p className="text-white/90 font-medium text-sm">{block.activity}</p>
      <p className="text-white/55 text-sm leading-relaxed">{block.description}</p>
      {block.insider_tip && (
        <p className="text-[#C97552]/80 text-xs italic">💡 {block.insider_tip}</p>
      )}
      <p className="text-white/30 text-xs">{block.estimated_cost}</p>
    </div>
  )
}

// ─── EditableDayCard ──────────────────────────────────────────────────────────

function EditableDayCard({
  day, onReplace, onRemove, onMove, onAdd,
}: {
  day:       MutableDay
  onReplace: (slot: TimeSlot) => void
  onRemove:  (slot: TimeSlot) => void
  onMove:    (slot: TimeSlot) => void
  onAdd:     (slot: TimeSlot) => void
}) {
  function handleAddActivity() {
    const firstNull: TimeSlot = day.morning === null ? 'morning' : day.afternoon === null ? 'afternoon' : 'evening'
    onAdd(firstNull)
  }

  return (
    <div className="bg-white/4 border border-white/8 rounded-2xl p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="font-serif italic text-base text-white leading-tight">{day.title}</h4>
        <span className="text-xs text-white/25 flex-shrink-0">Day {day.day}</span>
      </div>
      <div className="space-y-4 divide-y divide-white/6">
        <EditableBlockView
          label="🌅 Morning"
          slot="morning"
          block={day.morning}
          isLoading={day.loading_slot === 'morning'}
          onReplace={() => onReplace('morning')}
          onRemove={() => onRemove('morning')}
          onMove={() => onMove('morning')}
          onAdd={() => onAdd('morning')}
        />
        <div className="pt-4">
          <EditableBlockView
            label="☀️ Afternoon"
            slot="afternoon"
            block={day.afternoon}
            isLoading={day.loading_slot === 'afternoon'}
            onReplace={() => onReplace('afternoon')}
            onRemove={() => onRemove('afternoon')}
            onMove={() => onMove('afternoon')}
            onAdd={() => onAdd('afternoon')}
          />
        </div>
        <div className="pt-4">
          <EditableBlockView
            label="🌙 Evening"
            slot="evening"
            block={day.evening}
            isLoading={day.loading_slot === 'evening'}
            onReplace={() => onReplace('evening')}
            onRemove={() => onRemove('evening')}
            onMove={() => onMove('evening')}
            onAdd={() => onAdd('evening')}
          />
        </div>
      </div>
      <div className="pt-2 border-t border-white/8 flex items-center justify-between">
        <span className="text-xs text-[#C97552]/70">Day total: ~{day.day_total_estimate}</span>
        <button
          onClick={handleAddActivity}
          className="text-xs text-white/30 hover:text-white/55 transition-colors"
        >
          + Add activity
        </button>
      </div>
    </div>
  )
}

// ─── ReplaceOverlay ───────────────────────────────────────────────────────────

function ReplaceOverlay({
  activityName, onConfirm, onCancel,
}: {
  activityName: string
  onConfirm:    (request: string) => void
  onCancel:     () => void
}) {
  const [selected, setSelected] = useState<'nearby' | 'similar' | 'specific'>('nearby')
  const [custom, setCustom] = useState('')

  function handleConfirm() {
    if (selected === 'nearby')   onConfirm('something nearby')
    if (selected === 'similar')  onConfirm(`something similar to ${activityName} in style`)
    if (selected === 'specific' && custom.trim()) onConfirm(custom.trim())
  }

  const canConfirm = selected !== 'specific' || custom.trim().length > 0

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-[#0d1f35] border border-white/12 rounded-2xl max-w-sm w-full p-6 space-y-5">
        <div>
          <p className="text-xs text-white/35 uppercase tracking-widest font-label mb-1">Replace activity</p>
          <h3 className="text-white font-medium text-base">{activityName}</h3>
        </div>

        <div className="space-y-2">
          {[
            { key: 'nearby',   label: 'Suggest something nearby' },
            { key: 'similar',  label: `Suggest something similar in style` },
            { key: 'specific', label: 'I have something specific' },
          ].map(opt => (
            <label key={opt.key} className="flex items-center gap-3 cursor-pointer py-1">
              <input
                type="radio"
                name="replace-option"
                checked={selected === opt.key}
                onChange={() => setSelected(opt.key as 'nearby' | 'similar' | 'specific')}
                className="accent-[#C97552]"
              />
              <span className="text-sm text-white/70">{opt.label}</span>
            </label>
          ))}
          {selected === 'specific' && (
            <input
              type="text"
              value={custom}
              onChange={e => setCustom(e.target.value)}
              placeholder="What would you like instead?"
              autoFocus
              className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:border-[#C97552]/60 mt-1"
            />
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="flex-1 bg-[#C97552] text-white text-sm font-medium py-3 rounded-full disabled:opacity-40 hover:bg-[#b86644] transition-colors"
          >
            Replace →
          </button>
          <button
            onClick={onCancel}
            className="px-5 py-3 text-sm text-white/40 border border-white/12 rounded-full hover:border-white/25 hover:text-white/60 transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── MoveOverlay ──────────────────────────────────────────────────────────────

function MoveOverlay({
  currentDay, currentSlot, allDays, onConfirm, onCancel,
}: {
  currentDay:  number
  currentSlot: TimeSlot
  allDays:     MutableDay[]
  onConfirm:   (toDay: number, toSlot: TimeSlot) => void
  onCancel:    () => void
}) {
  const [selected, setSelected] = useState<{ day: number; slot: TimeSlot } | null>(null)
  const slots: TimeSlot[] = ['morning', 'afternoon', 'evening']

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-[#0d1f35] border border-white/12 rounded-2xl max-w-sm w-full p-6 space-y-5">
        <div>
          <p className="text-xs text-white/35 uppercase tracking-widest font-label mb-1">Move activity</p>
          <p className="text-white/60 text-sm">Choose a new slot</p>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {allDays.map(d => (
            <div key={d.day} className="space-y-1">
              <p className="text-xs text-white/35">Day {d.day} — {d.title}</p>
              <div className="grid grid-cols-3 gap-1.5">
                {slots.map(slot => {
                  const isCurrent = d.day === currentDay && slot === currentSlot
                  const isSelected = selected?.day === d.day && selected?.slot === slot
                  return (
                    <button
                      key={slot}
                      disabled={isCurrent}
                      onClick={() => setSelected({ day: d.day, slot })}
                      className={[
                        'text-xs py-2 rounded-lg border transition-all',
                        isCurrent
                          ? 'border-white/8 text-white/20 cursor-not-allowed'
                          : isSelected
                            ? 'border-[#C97552] bg-[#C97552]/15 text-white/80'
                            : 'border-white/15 text-white/50 hover:border-white/30',
                      ].join(' ')}
                    >
                      {slot.charAt(0).toUpperCase() + slot.slice(1)}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => selected && onConfirm(selected.day, selected.slot)}
            disabled={!selected}
            className="flex-1 bg-[#C97552] text-white text-sm font-medium py-3 rounded-full disabled:opacity-40 hover:bg-[#b86644] transition-colors"
          >
            Move →
          </button>
          <button
            onClick={onCancel}
            className="px-5 py-3 text-sm text-white/40 border border-white/12 rounded-full hover:border-white/25 hover:text-white/60 transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── AddOverlay ───────────────────────────────────────────────────────────────

function AddOverlay({
  dayNum, slot, onConfirm, onCancel,
}: {
  dayNum:    number
  slot:      TimeSlot
  onConfirm: (request: string) => void
  onCancel:  () => void
}) {
  const [request, setRequest] = useState('')

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-[#0d1f35] border border-white/12 rounded-2xl max-w-sm w-full p-6 space-y-5">
        <div>
          <p className="text-xs text-white/35 uppercase tracking-widest font-label mb-1">Add activity</p>
          <p className="text-white/60 text-sm">Day {dayNum} · {slot.charAt(0).toUpperCase() + slot.slice(1)}</p>
        </div>

        <div>
          <label className="block text-xs text-white/35 mb-1.5">What do you want to add?</label>
          <input
            type="text"
            value={request}
            onChange={e => setRequest(e.target.value)}
            placeholder="e.g. a hidden bar, something romantic, street food…"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && request.trim() && onConfirm(request.trim())}
            className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:border-[#C97552]/60"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => request.trim() && onConfirm(request.trim())}
            disabled={!request.trim()}
            className="flex-1 bg-[#C97552] text-white text-sm font-medium py-3 rounded-full disabled:opacity-40 hover:bg-[#b86644] transition-colors"
          >
            Add →
          </button>
          <button
            onClick={onCancel}
            className="px-5 py-3 text-sm text-white/40 border border-white/12 rounded-full hover:border-white/25 hover:text-white/60 transition-all"
          >
            Cancel
          </button>
        </div>
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
  const [itineraries,  setItineraries]  = useState<EditableItinerary[]>([])
  const [generating,   setGenerating]   = useState(false)
  const [profile,      setProfile]      = useState<UserProfile | null>(null)
  const [saving,       setSaving]       = useState(false)
  const [savedTripId,  setSavedTripId]  = useState<string | null>(null)
  const [shareToken,   setShareToken]   = useState<string | null>(null)
  const [formPrefillUsed, setFormPrefillUsed] = useState(false)

  const [savedDestIds, setSavedDestIds] = useState<Record<string, string>>({})
  const [saveStatus,   setSaveStatus]   = useState<'idle' | 'saving' | 'saved'>('idle')

  const [replaceTarget, setReplaceTarget] = useState<{ destId: string; dayNum: number; slot: TimeSlot; activity: string } | null>(null)
  const [moveTarget,    setMoveTarget]    = useState<{ destId: string; dayNum: number; slot: TimeSlot; block: ItineraryBlock } | null>(null)
  const [addTarget,     setAddTarget]     = useState<{ destId: string; dayNum: number; slot: TimeSlot } | null>(null)

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

  // ── autoSave ─────────────────────────────────────────────────────────────────
  const autoSave = useCallback(async (destId: string, days: MutableDay[]) => {
    const dbId = savedDestIds[destId]
    if (!dbId) return
    setSaveStatus('saving')
    const supabase = getSupabaseClient()
    const itinerary_json = days.map(({ day, title, morning, afternoon, evening, day_total_estimate }) =>
      ({ day, title, morning, afternoon, evening, day_total_estimate })
    )
    await supabase.from('trip_destinations').update({ itinerary_json }).eq('id', dbId)
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus('idle'), 2000)
  }, [savedDestIds])

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleRemove = useCallback((destId: string, dayNum: number, slot: TimeSlot) => {
    setItineraries(prev => prev.map(itin => {
      if (itin.destination_id !== destId) return itin
      const newDays = itin.days.map(d => d.day === dayNum ? { ...d, [slot]: null } : d)
      autoSave(destId, newDays)
      return { ...itin, days: newDays }
    }))
  }, [autoSave])

  const handleReplace = useCallback(async (destId: string, dayNum: number, slot: TimeSlot, request: string) => {
    const dest = destinations.find(d => d.id === destId)
    let currentActivity: string | undefined
    let fullDayContext: { title: string; morning?: { activity: string } | null; afternoon?: { activity: string } | null; evening?: { activity: string } | null } | undefined

    setItineraries(prev => prev.map(itin => {
      if (itin.destination_id !== destId) return itin
      const day = itin.days.find(d => d.day === dayNum)
      if (day) {
        currentActivity = day[slot]?.activity
        fullDayContext = {
          title:     day.title,
          morning:   day.morning   ? { activity: day.morning.activity }   : null,
          afternoon: day.afternoon ? { activity: day.afternoon.activity } : null,
          evening:   day.evening   ? { activity: day.evening.activity }   : null,
        }
      }
      const newDays = itin.days.map(d => d.day === dayNum ? { ...d, loading_slot: slot } : d)
      return { ...itin, days: newDays }
    }))

    try {
      const res = await fetch('/api/itinerary/replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination:         dest?.name ?? '',
          country:             dest?.country ?? '',
          day:                 dayNum,
          time_of_day:         slot,
          current_activity:    currentActivity,
          replacement_request: request,
          action:              'replace',
          user_profile:        profile ? { budget_per_day: profile.budget_per_day, group_type: profile.group_type, dietary_preferences: profile.dietary_preferences } : undefined,
          full_day_context:    fullDayContext,
          hotel_neighbourhood: dest?.hotel?.neighbourhood || undefined,
          group:               { ...group },
        }),
      })
      const text = await res.text()
      const newBlock = JSON.parse(text) as ItineraryBlock
      setItineraries(prev => prev.map(itin => {
        if (itin.destination_id !== destId) return itin
        const newDays = itin.days.map(d => d.day === dayNum ? { ...d, [slot]: newBlock, loading_slot: null } : d)
        autoSave(destId, newDays)
        return { ...itin, days: newDays }
      }))
    } catch {
      setItineraries(prev => prev.map(itin => {
        if (itin.destination_id !== destId) return itin
        return { ...itin, days: itin.days.map(d => d.day === dayNum ? { ...d, loading_slot: null } : d) }
      }))
    }
  }, [destinations, profile, group, autoSave])

  const handleAdd = useCallback(async (destId: string, dayNum: number, slot: TimeSlot, request: string) => {
    const dest = destinations.find(d => d.id === destId)
    let fullDayContext: { title: string; morning?: { activity: string } | null; afternoon?: { activity: string } | null; evening?: { activity: string } | null } | undefined

    setItineraries(prev => prev.map(itin => {
      if (itin.destination_id !== destId) return itin
      const day = itin.days.find(d => d.day === dayNum)
      if (day) {
        fullDayContext = {
          title:     day.title,
          morning:   day.morning   ? { activity: day.morning.activity }   : null,
          afternoon: day.afternoon ? { activity: day.afternoon.activity } : null,
          evening:   day.evening   ? { activity: day.evening.activity }   : null,
        }
      }
      const newDays = itin.days.map(d => d.day === dayNum ? { ...d, loading_slot: slot } : d)
      return { ...itin, days: newDays }
    }))

    try {
      const res = await fetch('/api/itinerary/replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination:         dest?.name ?? '',
          country:             dest?.country ?? '',
          day:                 dayNum,
          time_of_day:         slot,
          replacement_request: request,
          action:              'add',
          user_profile:        profile ? { budget_per_day: profile.budget_per_day, group_type: profile.group_type, dietary_preferences: profile.dietary_preferences } : undefined,
          full_day_context:    fullDayContext,
          hotel_neighbourhood: dest?.hotel?.neighbourhood || undefined,
          group:               { ...group },
        }),
      })
      const text = await res.text()
      const newBlock = JSON.parse(text) as ItineraryBlock
      setItineraries(prev => prev.map(itin => {
        if (itin.destination_id !== destId) return itin
        const newDays = itin.days.map(d => d.day === dayNum ? { ...d, [slot]: newBlock, loading_slot: null } : d)
        autoSave(destId, newDays)
        return { ...itin, days: newDays }
      }))
    } catch {
      setItineraries(prev => prev.map(itin => {
        if (itin.destination_id !== destId) return itin
        return { ...itin, days: itin.days.map(d => d.day === dayNum ? { ...d, loading_slot: null } : d) }
      }))
    }
  }, [destinations, profile, group, autoSave])

  const handleMove = useCallback((destId: string, fromDay: number, fromSlot: TimeSlot, toDay: number, toSlot: TimeSlot) => {
    setItineraries(prev => prev.map(itin => {
      if (itin.destination_id !== destId) return itin
      let block: MaybeBlock = null
      const step1 = itin.days.map(d => {
        if (d.day === fromDay) { block = d[fromSlot]; return { ...d, [fromSlot]: null } }
        return d
      })
      const step2 = step1.map(d => {
        if (d.day === toDay) return { ...d, [toSlot]: block }
        return d
      })
      autoSave(destId, step2)
      return { ...itin, days: step2 }
    }))
  }, [autoSave])

  // ── Generate ──────────────────────────────────────────────────────────────────
  const buildItinerary = useCallback(async () => {
    if (destinations.length === 0) return
    setGenerating(true)
    setItineraries([])

    const initial: EditableItinerary[] = destinations.map(d => ({
      destination_id: d.id,
      destination:    d.name,
      country:        d.country,
      start_date:     d.start_date,
      end_date:       d.end_date,
      days:           [],
      loading:        true,
      error:          '',
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
            hotel: dest.hotel.status === 'booked' && dest.hotel.neighbourhood
              ? { neighbourhood: dest.hotel.neighbourhood, checkin_date: dest.hotel.checkin_date, checkout_date: dest.hotel.checkout_date }
              : undefined,
            user_plans:  dest.user_plans || undefined,
          }),
        })
        // Read as text first — non-JSON responses (timeout, Vercel error) won't crash
        const text = await res.text()
        let data: ItineraryResult
        try {
          data = JSON.parse(text) as ItineraryResult
        } catch {
          throw new Error('Generation timed out — please try again.')
        }
        if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Generation failed')
        return { id: dest.id, result: data, error: '' }
      } catch (err) {
        return { id: dest.id, result: null, error: (err as Error).message }
      }
    })

    const results = await Promise.all(requests)
    setItineraries(prev => prev.map(item => {
      const r = results.find(x => x.id === item.destination_id)
      if (!r) return item
      if (r.error) return { ...item, loading: false, error: r.error }
      const mutableDays: MutableDay[] = r.result!.itinerary.map(day => ({
        ...day,
        loading_slot: null,
      }))
      return { ...item, loading: false, days: mutableDays, error: '' }
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

    const { data: insertedDests } = await supabase.from('trip_destinations').insert(
      destinations.map((dest, idx) => {
        const itin = itineraries.find(i => i.destination_id === dest.id)
        const itinerary_json = itin
          ? itin.days.map(({ day, title, morning, afternoon, evening, day_total_estimate }) =>
              ({ day, title, morning, afternoon, evening, day_total_estimate }))
          : null
        return {
          trip_id:          trip.id,
          destination_name: dest.name,
          country:          dest.country,
          position:         idx + 1,
          days:             dest.days,
          start_date:       dest.start_date,
          end_date:         dest.end_date,
          itinerary_json,
          notes:            dest.user_plans || null,
        }
      })
    ).select('id, destination_name')

    if (insertedDests) {
      const idMap: Record<string, string> = {}
      destinations.forEach(dest => {
        const found = (insertedDests as { id: string; destination_name: string }[]).find(
          row => row.destination_name === dest.name
        )
        if (found) idMap[dest.id] = found.id
      })
      setSavedDestIds(idMap)
    }

    setSavedTripId(trip.id)
    setShareToken(trip.share_token ?? null)
    setSaving(false)
  }, [destinations, itineraries, tripName, totalDays, tripStart, tripEnd, router])

  const hasItineraries = itineraries.some(i => !i.loading && !i.error && i.days.length > 0)
  const hasAnyDays     = itineraries.some(i => i.days.length > 0)

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

                {/* Hotel section */}
                <div className="px-4 pb-3">
                  <HotelSection
                    dest={dest}
                    hotel={dest.hotel}
                    onChange={h => updateDestination(dest.id, { hotel: h })}
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
                {generating ? 'Building…' : hasAnyDays ? 'Regenerate with your changes' : 'Build itinerary →'}
              </button>
            </div>
          </div>
        )}

        {/* Generated itineraries */}
        {itineraries.length > 0 && (
          <div className="space-y-8 pt-4">
            {/* Save status indicator */}
            {saveStatus === 'saved' && (
              <div className="flex justify-end">
                <span className="text-green-400/60 text-xs">Saved ✓</span>
              </div>
            )}

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

                  {!itin.loading && !itin.error && itin.days.length > 0 && (
                    <div className="space-y-4">
                      {itin.days.map(day => (
                        <EditableDayCard
                          key={day.day}
                          day={day}
                          onReplace={(slot) => {
                            const block = day[slot]
                            if (block) {
                              setReplaceTarget({ destId: dest.id, dayNum: day.day, slot, activity: block.activity })
                            }
                          }}
                          onRemove={(slot) => handleRemove(dest.id, day.day, slot)}
                          onMove={(slot) => {
                            const block = day[slot]
                            if (block) setMoveTarget({ destId: dest.id, dayNum: day.day, slot, block })
                          }}
                          onAdd={(slot) => setAddTarget({ destId: dest.id, dayNum: day.day, slot })}
                        />
                      ))}
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

        {/* Overlays */}
        {replaceTarget && (
          <ReplaceOverlay
            activityName={replaceTarget.activity}
            onConfirm={(req) => {
              handleReplace(replaceTarget.destId, replaceTarget.dayNum, replaceTarget.slot, req)
              setReplaceTarget(null)
            }}
            onCancel={() => setReplaceTarget(null)}
          />
        )}

        {moveTarget && (
          <MoveOverlay
            currentDay={moveTarget.dayNum}
            currentSlot={moveTarget.slot}
            allDays={itineraries.find(i => i.destination_id === moveTarget.destId)?.days ?? []}
            onConfirm={(toDay, toSlot) => {
              handleMove(moveTarget.destId, moveTarget.dayNum, moveTarget.slot, toDay, toSlot)
              setMoveTarget(null)
            }}
            onCancel={() => setMoveTarget(null)}
          />
        )}

        {addTarget && (
          <AddOverlay
            dayNum={addTarget.dayNum}
            slot={addTarget.slot}
            onConfirm={(req) => {
              handleAdd(addTarget.destId, addTarget.dayNum, addTarget.slot, req)
              setAddTarget(null)
            }}
            onCancel={() => setAddTarget(null)}
          />
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
