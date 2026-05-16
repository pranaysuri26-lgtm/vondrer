'use client'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'
import type { ItineraryBlock, ItineraryResult, PreTripInfo } from '@/app/api/itinerary/route'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FlightInfo {
  status:               'none' | 'booked'
  arrival_date:         string
  arrival_time:         string
  departure_date:       string
  departure_time:       string
  flight_number:        string
  pdf_parsing:          boolean
  pdf_extracted:        PdfFlight[] | null
  pdf_confirmed:        boolean
  flight_accessibility: string[]
  min_connection_hours: number
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

interface LegTransport {
  mode:           'fly' | 'drive' | 'bus' | 'train' | 'ferry' | null
  departure_date: string
  departure_time: string
  transit_stop:   string   // 0-day via city label
}

interface BookedActivity {
  id:             string
  name:           string
  date:           string
  start_time:     string
  duration_hours: number
  ticket_count:   number
  notes:          string
}

interface AccessibilityInfo {
  needs:               string[]
  max_walking_minutes: number | null
}

interface TripDestination {
  id:                string
  name:              string
  country:           string
  days:              number
  start_date:        string
  end_date:          string
  flights:           FlightInfo
  hotel:             HotelInfo
  must_do:           string
  nice_to_do:        string
  things_to_avoid:   string[]
  avoid_notes:       string
  local_transport:   string[]
  booked_activities: BookedActivity[]
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
  pre_trip?:      PreTripInfo
  days:           MutableDay[]
  loading:        boolean
  error:          string
}

// ─── Pre-calculated drive routes ─────────────────────────────────────────────
// Keys are sorted city names joined with '|' so lookup works both directions.

const DRIVE_ROUTES: Record<string, { miles: number; hours: number }> = {
  'atlanta|miami':             { miles: 661,  hours: 9.5  },
  'atlanta|nashville':         { miles: 249,  hours: 3.75 },
  'atlanta|charlotte':         { miles: 245,  hours: 3.5  },
  'austin|dallas':             { miles: 195,  hours: 3.0  },
  'amsterdam|brussels':        { miles: 120,  hours: 2.5  },
  'amsterdam|paris':           { miles: 318,  hours: 4.5  },
  'barcelona|madrid':          { miles: 393,  hours: 5.5  },
  'barcelona|paris':           { miles: 629,  hours: 8.5  },
  'boston|new york':           { miles: 215,  hours: 4.25 },
  'chicago|detroit':           { miles: 280,  hours: 4.5  },
  'chicago|cleveland':         { miles: 344,  hours: 5.0  },
  'dallas|houston':            { miles: 239,  hours: 3.75 },
  'denver|salt lake city':     { miles: 525,  hours: 7.5  },
  'florence|rome':             { miles: 173,  hours: 3.0  },
  'florence|venice':           { miles: 163,  hours: 2.5  },
  'london|edinburgh':          { miles: 404,  hours: 7.5  },
  'london|paris':              { miles: 289,  hours: 6.5  },
  'los angeles|las vegas':     { miles: 270,  hours: 4.0  },
  'los angeles|san francisco': { miles: 381,  hours: 5.75 },
  'miami|orlando':             { miles: 235,  hours: 3.5  },
  'miami|san francisco':       { miles: 2757, hours: 39.0 },
  'miami|tampa':               { miles: 281,  hours: 4.0  },
  'munich|vienna':             { miles: 295,  hours: 4.5  },
  'nashville|charlotte':       { miles: 409,  hours: 6.0  },
  'new york|philadelphia':     { miles: 95,   hours: 2.0  },
  'new york|washington':       { miles: 225,  hours: 4.25 },
  'paris|rome':                { miles: 888,  hours: 12.0 },
  'portland|san francisco':    { miles: 639,  hours: 10.0 },
  'prague|vienna':             { miles: 190,  hours: 3.5  },
  'rome|venice':               { miles: 335,  hours: 5.0  },
  'salt lake city|san francisco': { miles: 754, hours: 11.0 },
  'san francisco|las vegas':   { miles: 569,  hours: 7.5  },
  'san francisco|los angeles': { miles: 381,  hours: 5.75 },
  'seattle|portland':          { miles: 175,  hours: 3.0  },
  'seattle|san francisco':     { miles: 807,  hours: 13.0 },
  'washington|philadelphia':   { miles: 140,  hours: 2.75 },
}

function getDriveInfo(cityA: string, cityB: string): { miles: number; hours: number } | null {
  const [a, b] = [cityA.toLowerCase().trim(), cityB.toLowerCase().trim()].sort()
  return DRIVE_ROUTES[`${a}|${b}`] ?? null
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
    flight_accessibility: [], min_connection_hours: 0,
  }
}

function emptyDest(id: string, name: string, country: string, days: number, start: string, end: string): TripDestination {
  return {
    id, name, country, days, start_date: start, end_date: end,
    flights: emptyFlight(), hotel: emptyHotel(),
    must_do: '', nice_to_do: '',
    things_to_avoid: [], avoid_notes: '',
    local_transport: [], booked_activities: [],
  }
}

function emptyHotel(): HotelInfo {
  return { status: 'none', neighbourhood: '', checkin_date: '', checkout_date: '' }
}

function emptyLeg(): LegTransport {
  return { mode: null, departure_date: '', departure_time: '', transit_stop: '' }
}

function legModeIcon(mode: LegTransport['mode']): string {
  if (mode === 'fly')   return '✈️'
  if (mode === 'drive') return '🚗'
  if (mode === 'bus')   return '🚌'
  if (mode === 'train') return '🚂'
  if (mode === 'ferry') return '🚢'
  return '✈️'
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
            : 'border-white/25 bg-white',
        ].join(' ')}
      >
        {checked && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </span>
      <span>
        <span className="text-sm text-[#1A1A1A]/65">{label}</span>
        {sublabel && <p className="text-xs text-[#8A7E6E] mt-0.5">{sublabel}</p>}
      </span>
    </button>
  )
}

// ─── Group composition section ────────────────────────────────────────────────

const ACCESSIBILITY_OPTIONS = [
  { key: 'wheelchair',      label: 'Wheelchair user' },
  { key: 'limited_walking', label: 'Limited walking' },
  { key: 'no_stairs',       label: 'No stairs or steep inclines' },
  { key: 'visual',          label: 'Visual impairment' },
  { key: 'hearing',         label: 'Hearing impairment' },
  { key: 'stroller',        label: 'Travelling with stroller' },
]
const WALK_DIST = [5, 10, 15, 30] as const

function GroupCompositionSection({
  group, onChange, accessibility, onAccessibilityChange,
}: {
  group:                   GroupComposition
  onChange:                (g: GroupComposition) => void
  accessibility:           AccessibilityInfo
  onAccessibilityChange:   (a: AccessibilityInfo) => void
}) {

  const typeOptions = [
    { key: 'includes_adults',     label: 'Adults'            },
    { key: 'includes_children',   label: 'Children under 12' },
    { key: 'includes_teenagers',  label: 'Teenagers 12–17'   },
    { key: 'includes_elderly',    label: 'Elderly 65+'       },
  ] as const

  return (
    <div className="bg-white border border-[#E8E0D6] rounded-2xl p-5 space-y-5">
      <p className="text-xs text-[#7A6E64] uppercase tracking-widest font-label">Who&apos;s coming on this trip?</p>

      <div className="flex items-center gap-4">
        <span className="text-sm text-[#3A3430] flex-1">Number of travelers</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onChange({ ...group, traveler_count: Math.max(1, group.traveler_count - 1) })}
            className="w-8 h-8 rounded-full border border-[#D8D0C4] text-[#4A4440] hover:border-white/35 hover:text-[#1A1A1A] transition-all flex items-center justify-center text-lg leading-none"
          >−</button>
          <span className="text-[#1A1A1A] font-medium w-6 text-center">{group.traveler_count}</span>
          <button
            type="button"
            onClick={() => onChange({ ...group, traveler_count: group.traveler_count + 1 })}
            className="w-8 h-8 rounded-full border border-[#D8D0C4] text-[#4A4440] hover:border-white/35 hover:text-[#1A1A1A] transition-all flex items-center justify-center text-lg leading-none"
          >+</button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-[#7A6E64]">Traveler types</p>
        {typeOptions.map(opt => (
          <CheckRow
            key={opt.key}
            checked={group[opt.key]}
            label={opt.label}
            onToggle={() => onChange({ ...group, [opt.key]: !group[opt.key] })}
          />
        ))}
      </div>

      {/* Accessibility section — below traveler types */}
      <div className="space-y-2.5 border-t border-[#E8E0D6] pt-4">
        <div>
          <p className="text-xs text-[#7A6E64]">Any mobility or accessibility needs?</p>
          <p className="text-xs text-[#A8A09A] mt-0.5">We adjust every activity recommendation</p>
        </div>
        {ACCESSIBILITY_OPTIONS.map(opt => (
          <div key={opt.key}>
            <CheckRow
              checked={accessibility.needs.includes(opt.key)}
              label={opt.label}
              onToggle={() => {
                const has = accessibility.needs.includes(opt.key)
                onAccessibilityChange({
                  ...accessibility,
                  needs: has
                    ? accessibility.needs.filter(k => k !== opt.key)
                    : [...accessibility.needs, opt.key],
                  max_walking_minutes: (opt.key === 'limited_walking' && has) ? null : accessibility.max_walking_minutes,
                })
              }}
            />
            {opt.key === 'limited_walking' && accessibility.needs.includes('limited_walking') && (
              <div className="ml-7 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-xs text-[#7A6E64]">Max comfortable distance:</span>
                {WALK_DIST.map(mins => (
                  <label key={mins} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="max-walk"
                      checked={accessibility.max_walking_minutes === mins}
                      onChange={() => onAccessibilityChange({ ...accessibility, max_walking_minutes: mins })}
                      className="accent-[#C97552]"
                    />
                    <span className="text-xs text-[#5A504A]">{mins} min</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
        <CheckRow
          checked={accessibility.needs.length === 0}
          label="None — fully mobile"
          onToggle={() => onAccessibilityChange({ needs: [], max_walking_minutes: null })}
        />
      </div>

      <div className="space-y-2.5 border-t border-[#E8E0D6] pt-4">
        <p className="text-xs text-[#7A6E64]">Any dietary needs to accommodate?</p>

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
            <span className="text-xs text-[#6b5f54]">How many?</span>
            <input
              type="number"
              min={1}
              max={group.traveler_count}
              value={group.vegetarian_count || ''}
              onChange={e => onChange({ ...group, vegetarian_count: Math.min(group.traveler_count, parseInt(e.target.value) || 0) })}
              placeholder="0"
              className="w-16 bg-white border border-[#D8D0C4] rounded-lg px-2 py-1.5 text-[#1A1A1A] text-sm focus:outline-none focus:border-[#C97552]/60 transition-colors"
            />
            <span className="text-xs text-[#8A7E6E]">of {group.traveler_count}</span>
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

const FLIGHT_ACCESS_OPTIONS = [
  { key: 'wheelchair_airport',   label: 'Wheelchair assistance needed' },
  { key: 'aisle_seat',           label: 'Aisle seat required' },
  { key: 'extra_connection',     label: 'Extra connection time needed' },
  { key: 'mobility_assistance',  label: 'Airport mobility assistance' },
]
const CONNECTION_HOURS = [1.5, 2, 2.5, 3] as const

function FlightsSection({
  dest, homeCity, flights, onChange, accessibility,
}: {
  dest:          TripDestination
  homeCity:      string
  flights:       FlightInfo
  onChange:      (f: FlightInfo) => void
  accessibility: AccessibilityInfo
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
    <div className="mt-2 bg-[#F5F2ED] border border-[#E8E0D6] rounded-xl p-4 space-y-4">
      <p className="text-xs text-[#7A6E64] uppercase tracking-widest font-label">Flights to {dest.name}</p>

      <div className="space-y-2">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="radio"
            name={`flight-status-${dest.id}`}
            checked={flights.status === 'none'}
            onChange={() => onChange({ ...flights, status: 'none' })}
            className="accent-[#C97552]"
          />
          <span className="text-sm text-[#1A1A1A]/65">Search for flights</span>
        </label>

        {flights.status === 'none' && (
          <div className="ml-7">
            <a
              href={skyscannerLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs text-[#4A4440] border border-[#D8D0C4] rounded-full px-4 py-2 hover:border-white/30 hover:text-[#2A2420] transition-all"
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
          <span className="text-sm text-[#1A1A1A]/65">Already booked</span>
        </label>
      </div>

      {flights.status === 'booked' && (
        <div className="space-y-4 border-t border-[#E8E0D6] pt-3">
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
                className="w-full flex items-center justify-center gap-2 border border-dashed border-[#CCC4B8] rounded-xl py-3 text-sm text-[#5C564E] hover:border-white/35 hover:text-[#3A3430] transition-all disabled:opacity-50"
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
                <div className="bg-white border border-[#E8E0D6] rounded-xl p-4 space-y-3">
                  <p className="text-xs text-[#6b5f54]">Is this correct?</p>
                  {flights.pdf_extracted.map((f, i) => (
                    <div key={i} className="text-xs text-[#1A1A1A]/65 space-y-0.5">
                      <p className="font-medium text-[#2A2420]">{f.from_city ?? '?'} → {f.to_city ?? '?'}</p>
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
                      className="flex-1 text-xs border border-[#D8D0C4] text-[#5C564E] rounded-full py-2 hover:border-white/25 transition-all"
                    >
                      Edit manually
                    </button>
                  </div>
                </div>
              )}

              <p className="text-xs text-[#9A8E7E] text-center">or enter manually below</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs text-[#7A6E64]">Arriving date</label>
              <input type="date" value={flights.arrival_date}
                onChange={e => set('arrival_date', e.target.value)}
                className="w-full bg-white border border-[#E2D8CE] rounded-lg px-3 py-2.5 text-[#1A1A1A] text-sm focus:outline-none focus:border-[#C97552]/60 [color-scheme:dark]" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-[#7A6E64]">Arrival time</label>
              <input type="time" value={flights.arrival_time}
                onChange={e => set('arrival_time', e.target.value)}
                className="w-full bg-white border border-[#E2D8CE] rounded-lg px-3 py-2.5 text-[#1A1A1A] text-sm focus:outline-none focus:border-[#C97552]/60 [color-scheme:dark]" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-[#7A6E64]">Departing date</label>
              <input type="date" value={flights.departure_date}
                onChange={e => set('departure_date', e.target.value)}
                className="w-full bg-white border border-[#E2D8CE] rounded-lg px-3 py-2.5 text-[#1A1A1A] text-sm focus:outline-none focus:border-[#C97552]/60 [color-scheme:dark]" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-[#7A6E64]">Departure time</label>
              <input type="time" value={flights.departure_time}
                onChange={e => set('departure_time', e.target.value)}
                className="w-full bg-white border border-[#E2D8CE] rounded-lg px-3 py-2.5 text-[#1A1A1A] text-sm focus:outline-none focus:border-[#C97552]/60 [color-scheme:dark]" />
            </div>
            <div className="space-y-1 col-span-2">
              <label className="block text-xs text-[#7A6E64]">Flight number (optional)</label>
              <input type="text" value={flights.flight_number}
                onChange={e => set('flight_number', e.target.value)}
                placeholder="e.g. AA2547"
                className="w-full bg-white border border-[#E2D8CE] rounded-lg px-3 py-2.5 text-[#1A1A1A] text-sm placeholder-white/20 focus:outline-none focus:border-[#C97552]/60" />
            </div>
          </div>

          {(hasArrival || hasDeparture) && (
            <div className="bg-[#C97552]/8 border border-[#C97552]/20 rounded-xl px-4 py-3 text-xs space-y-1.5">
              <div className="flex items-center gap-2">
                <span>✈️</span>
                <span className="text-[#2A2420] font-medium">{dest.name} flights</span>
                {flights.flight_number && <span className="text-[#6b5f54]">· {flights.flight_number}</span>}
              </div>
              {hasArrival && (
                <p className="text-[#5A504A] ml-6">
                  {flights.arrival_date} · Arrives {flights.arrival_time}
                </p>
              )}
              {hasDeparture && (
                <p className="text-[#5A504A] ml-6">
                  {flights.departure_date} · Departs {flights.departure_time}
                </p>
              )}
            </div>
          )}

          {/* Airport accessibility — shown when any accessibility needs exist */}
          {accessibility.needs.length > 0 && (
            <div className="border-t border-[#E8E0D6] pt-3 space-y-2.5">
              <p className="text-xs text-[#7A6E64] uppercase tracking-widest font-label">Airport accessibility</p>
              {FLIGHT_ACCESS_OPTIONS.map(opt => (
                <div key={opt.key}>
                  <CheckRow
                    checked={flights.flight_accessibility.includes(opt.key)}
                    label={opt.label}
                    onToggle={() => {
                      const has = flights.flight_accessibility.includes(opt.key)
                      onChange({
                        ...flights,
                        flight_accessibility: has
                          ? flights.flight_accessibility.filter(k => k !== opt.key)
                          : [...flights.flight_accessibility, opt.key],
                        min_connection_hours: (opt.key === 'extra_connection' && has) ? 0 : flights.min_connection_hours,
                      })
                    }}
                  />
                  {opt.key === 'extra_connection' && flights.flight_accessibility.includes('extra_connection') && (
                    <div className="ml-7 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="text-xs text-[#7A6E64]">Minimum connection time:</span>
                      {CONNECTION_HOURS.map(h => (
                        <label key={h} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name={`conn-${dest.id}`}
                            checked={flights.min_connection_hours === h}
                            onChange={() => onChange({ ...flights, min_connection_hours: h })}
                            className="accent-[#C97552]"
                          />
                          <span className="text-xs text-[#5A504A]">{h}h</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <p className="text-xs text-[#9A8E7E] mt-1">Contact your airline 48 hours before travel to arrange assistance.</p>
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
    <div className="mt-2 bg-[#F5F2ED] border border-[#E8E0D6] rounded-xl p-4 space-y-4">
      <p className="text-xs text-[#7A6E64] uppercase tracking-widest font-label">Hotel in {dest.name}</p>

      <div className="space-y-2">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="radio"
            name={`hotel-status-${dest.id}`}
            checked={hotel.status === 'none'}
            onChange={() => onChange({ ...hotel, status: 'none' })}
            className="accent-[#C97552]"
          />
          <span className="text-sm text-[#1A1A1A]/65">Search for hotels</span>
        </label>

        {hotel.status === 'none' && (
          <div className="ml-7">
            <a
              href={bookingLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs text-[#4A4440] border border-[#D8D0C4] rounded-full px-4 py-2 hover:border-white/30 hover:text-[#2A2420] transition-all"
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
          <span className="text-sm text-[#1A1A1A]/65">Already booked</span>
        </label>
      </div>

      {hotel.status === 'booked' && !showSummary && (
        <div className="space-y-3 border-t border-[#E8E0D6] pt-3">
          <div className="space-y-1">
            <label className="block text-xs text-[#7A6E64]">Neighbourhood / area</label>
            <input
              type="text"
              value={hotel.neighbourhood}
              onChange={e => onChange({ ...hotel, neighbourhood: e.target.value })}
              placeholder="e.g. Midtown, Marais, Shibuya"
              className="w-full bg-white border border-[#E2D8CE] rounded-lg px-3 py-2.5 text-[#1A1A1A] text-sm placeholder-white/20 focus:outline-none focus:border-[#C97552]/60"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs text-[#7A6E64]">Check-in date</label>
              <input
                type="date"
                value={hotel.checkin_date}
                onChange={e => onChange({ ...hotel, checkin_date: e.target.value })}
                className="w-full bg-white border border-[#E2D8CE] rounded-lg px-3 py-2.5 text-[#1A1A1A] text-sm focus:outline-none focus:border-[#C97552]/60 [color-scheme:dark]"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-[#7A6E64]">Check-out date</label>
              <input
                type="date"
                value={hotel.checkout_date}
                onChange={e => onChange({ ...hotel, checkout_date: e.target.value })}
                className="w-full bg-white border border-[#E2D8CE] rounded-lg px-3 py-2.5 text-[#1A1A1A] text-sm focus:outline-none focus:border-[#C97552]/60 [color-scheme:dark]"
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
          <span className="text-[#2A2420] text-xs font-medium flex-1">
            {hotel.neighbourhood}
            {nights > 0 && <span className="text-[#6b5f54] font-normal"> · {nights} {nights === 1 ? 'night' : 'nights'}</span>}
          </span>
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-[#7A6E64] hover:text-[#4A4440] border border-[#D8D0C4] rounded-full px-3 py-1 transition-all"
          >
            Edit
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Activity preferences section ────────────────────────────────────────────

const TRIP_INTEREST_OPTIONS = [
  { key: 'beaches',     icon: '🏖️', label: 'Beaches and outdoor time'  },
  { key: 'food',        icon: '🍜', label: 'Food and restaurants'       },
  { key: 'art',         icon: '🎨', label: 'Art and culture'            },
  { key: 'nightlife',   icon: '🌙', label: 'Nightlife'                  },
  { key: 'photography', icon: '📸', label: 'Photography spots'          },
  { key: 'adventure',   icon: '🏃', label: 'Adventure and activities'   },
  { key: 'shopping',    icon: '🛍️', label: 'Shopping'                   },
  { key: 'relaxation',  icon: '😴', label: 'Relaxation — slow pace'     },
  { key: 'history',     icon: '🏛️', label: 'History and architecture'   },
  { key: 'local',       icon: '🏘️', label: 'Local neighbourhood life'   },
] as const

const PACE_OPTIONS = [
  { key: 'packed',   icon: '⚡', label: 'Packed',   desc: 'Full days, see as much as possible' },
  { key: 'balanced', icon: '⚖️', label: 'Balanced', desc: 'Mix of activities and downtime'     },
  { key: 'relaxed',  icon: '🌿', label: 'Relaxed',  desc: 'Slow pace, quality over quantity'   },
] as const

function ActivityPreferencesSection({
  interests, pace, onInterestsChange, onPaceChange,
}: {
  interests:         string[]
  pace:              'packed' | 'balanced' | 'relaxed'
  onInterestsChange: (v: string[]) => void
  onPaceChange:      (v: 'packed' | 'balanced' | 'relaxed') => void
}) {
  const MAX = 4
  function toggle(key: string) {
    if (interests.includes(key)) onInterestsChange(interests.filter(k => k !== key))
    else if (interests.length < MAX) onInterestsChange([...interests, key])
  }
  return (
    <div className="bg-white border border-[#E8E0D6] rounded-2xl p-5 space-y-5">
      <div>
        <p className="text-xs text-[#7A6E64] uppercase tracking-widest font-label">What matters most on this trip?</p>
        <p className="text-xs text-[#9A8E7E] mt-1">Can differ from your usual travel style · Pick up to 4</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {TRIP_INTEREST_OPTIONS.map(opt => {
          const sel   = interests.includes(opt.key)
          const maxed = interests.length >= MAX && !sel
          return (
            <button
              key={opt.key}
              type="button"
              disabled={maxed}
              onClick={() => toggle(opt.key)}
              className={[
                'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all',
                sel
                  ? 'bg-[#C97552]/15 border-[#C97552]/40 text-[#1A1A1A]/85'
                  : maxed
                    ? 'border-[#E8E0D6] text-[#A8A09A] cursor-not-allowed'
                    : 'border-[#E2D8CE] text-[#5C564E] hover:border-white/25 hover:text-[#3A3430]',
              ].join(' ')}
            >
              <span className="text-base">{opt.icon}</span>
              <span className="text-xs">{opt.label}</span>
            </button>
          )
        })}
      </div>
      {interests.length === MAX && <p className="text-xs text-[#8A7E6E] text-center">Maximum 4 selected</p>}

      <div className="border-t border-[#E8E0D6] pt-4 space-y-3">
        <p className="text-xs text-[#7A6E64]">How packed do you want each day?</p>
        <div className="space-y-2">
          {PACE_OPTIONS.map(opt => (
            <label key={opt.key} className="flex items-start gap-3 cursor-pointer py-0.5">
              <input type="radio" name="trip-pace" checked={pace === opt.key}
                onChange={() => onPaceChange(opt.key)} className="accent-[#C97552] mt-0.5" />
              <div>
                <span className="text-sm text-[#3A3430]">{opt.icon} {opt.label}</span>
                <p className="text-xs text-[#7A6E64] mt-0.5">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Special occasion section ─────────────────────────────────────────────────

const OCCASION_OPTIONS = [
  { key: 'none',           label: 'No — just a great trip'        },
  { key: 'birthday',       label: '🎂 Birthday'                   },
  { key: 'anniversary',    label: '💑 Anniversary'                },
  { key: 'honeymoon',      label: '💍 Honeymoon'                  },
  { key: 'bachelor',       label: '🥂 Bachelor / Bachelorette'    },
  { key: 'family_reunion', label: '👨‍👩‍👧‍👦 Family reunion'           },
  { key: 'work_leisure',   label: '💼 Work trip with leisure time' },
  { key: 'concert',        label: '🎵 Concert or event'           },
  { key: 'wedding',        label: '💒 Wedding (attending)'        },
  { key: 'graduation',     label: '🎓 Graduation trip'            },
] as const

function SpecialOccasionSection({
  occasion, person, date, time, venue, eventName,
  onOccasionChange, onPersonChange, onDateChange, onTimeChange, onVenueChange, onEventNameChange,
  tripStartDate, tripEndDate,
}: {
  occasion:           string
  person:             string
  date:               string
  time:               string
  venue:              string
  eventName:          string
  onOccasionChange:   (v: string) => void
  onPersonChange:     (v: string) => void
  onDateChange:       (v: string) => void
  onTimeChange:       (v: string) => void
  onVenueChange:      (v: string) => void
  onEventNameChange:  (v: string) => void
  tripStartDate:      string
  tripEndDate:        string
}) {
  // Check if provided date falls within trip dates
  const dateInTrip = date && tripStartDate && tripEndDate
    ? date >= tripStartDate && date <= tripEndDate
    : null

  const inputCls = 'w-full bg-white border border-[#D8D0C4] rounded-lg px-3 py-2.5 text-[#1A1A1A] text-sm placeholder-[#9A8E7E] focus:outline-none focus:border-[#C97552]/60'
  const dateCls  = `${inputCls} [color-scheme:dark]`
  const labelCls = 'block text-xs text-[#7A6E64] mb-1.5'

  return (
    <div className="bg-white border border-[#E8E0D6] rounded-2xl p-5 space-y-4">
      <p className="text-xs text-[#7A6E64] uppercase tracking-widest font-label">Is this trip for a special occasion?</p>
      <div className="space-y-2">
        {OCCASION_OPTIONS.map(opt => (
          <label key={opt.key} className="flex items-center gap-3 cursor-pointer py-0.5">
            <input type="radio" name="special-occasion" checked={occasion === opt.key}
              onChange={() => { onOccasionChange(opt.key); onDateChange(''); onTimeChange(''); onVenueChange(''); onEventNameChange('') }}
              className="accent-[#C97552]" />
            <span className="text-sm text-[#1A1A1A]/65">{opt.label}</span>
          </label>
        ))}
      </div>

      {/* BIRTHDAY */}
      {occasion === 'birthday' && (
        <div className="ml-7 space-y-3">
          <div>
            <label className={labelCls}>Whose birthday? (optional)</label>
            <input type="text" value={person} onChange={e => onPersonChange(e.target.value)}
              placeholder="e.g. Alex" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>When is the birthday?</label>
            <input type="date" value={date} onChange={e => onDateChange(e.target.value)} className={dateCls} />
          </div>
          {date && dateInTrip === false && tripStartDate && tripEndDate && (
            <p className="text-xs text-amber-400/80">Birthday is outside your trip dates — we&apos;ll pick the best day to celebrate instead.</p>
          )}
          {date && dateInTrip === true && (
            <p className="text-xs text-[#C97552]/80">🎂 Birthday falls on this trip — that day gets the full birthday treatment.</p>
          )}
        </div>
      )}

      {/* ANNIVERSARY / HONEYMOON */}
      {(occasion === 'anniversary' || occasion === 'honeymoon') && (
        <div className="ml-7 space-y-3">
          <div>
            <label className={labelCls}>Anniversary date (optional)</label>
            <input type="date" value={date} onChange={e => onDateChange(e.target.value)} className={dateCls} />
          </div>
          {date && dateInTrip === true && (
            <p className="text-xs text-[#C97552]/80">💑 Anniversary falls during this trip — that evening gets the special dinner.</p>
          )}
        </div>
      )}

      {/* CONCERT / EVENT */}
      {occasion === 'concert' && (
        <div className="ml-7 space-y-3">
          <div>
            <label className={labelCls}>Event name</label>
            <input type="text" value={eventName} onChange={e => onEventNameChange(e.target.value)}
              placeholder="e.g. Taylor Swift Eras Tour" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Venue</label>
            <input type="text" value={venue} onChange={e => onVenueChange(e.target.value)}
              placeholder="e.g. Wrigley Field, Chicago" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Date</label>
              <input type="date" value={date} onChange={e => onDateChange(e.target.value)} className={dateCls} />
            </div>
            <div>
              <label className={labelCls}>Start time</label>
              <input type="time" value={time} onChange={e => onTimeChange(e.target.value)} className={dateCls} />
            </div>
          </div>
          {date && dateInTrip === false && (
            <p className="text-xs text-amber-400/80">⚠️ Event date is outside your trip dates — check your trip dates above.</p>
          )}
          {date && dateInTrip === true && (
            <p className="text-xs text-[#C97552]/80">🎵 Concert day is in your trip — that entire day will be scheduled around it.</p>
          )}
        </div>
      )}

      {/* WEDDING */}
      {occasion === 'wedding' && (
        <div className="ml-7 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Wedding date</label>
              <input type="date" value={date} onChange={e => onDateChange(e.target.value)} className={dateCls} />
            </div>
            <div>
              <label className={labelCls}>Ceremony time</label>
              <input type="time" value={time} onChange={e => onTimeChange(e.target.value)} className={dateCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Venue area (optional)</label>
            <input type="text" value={venue} onChange={e => onVenueChange(e.target.value)}
              placeholder="e.g. Lincoln Park area" className={inputCls} />
          </div>
        </div>
      )}

      {/* GRADUATION */}
      {occasion === 'graduation' && (
        <div className="ml-7 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Graduation date</label>
              <input type="date" value={date} onChange={e => onDateChange(e.target.value)} className={dateCls} />
            </div>
            <div>
              <label className={labelCls}>Ceremony time (optional)</label>
              <input type="time" value={time} onChange={e => onTimeChange(e.target.value)} className={dateCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Location (optional)</label>
            <input type="text" value={venue} onChange={e => onVenueChange(e.target.value)}
              placeholder="e.g. Madison Square Garden" className={inputCls} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Booked activities section ────────────────────────────────────────────────

function BookedActivitiesSection({
  destName, activities, onChange,
}: {
  destName:   string
  activities: BookedActivity[]
  onChange:   (a: BookedActivity[]) => void
}) {
  function addActivity() {
    onChange([...activities, { id: localId(), name: '', date: '', start_time: '', duration_hours: 2, ticket_count: 2, notes: '' }])
  }
  function upd(id: string, patch: Partial<BookedActivity>) {
    onChange(activities.map(a => a.id === id ? { ...a, ...patch } : a))
  }

  return (
    <div className="mt-2 bg-[#F5F2ED] border border-[#E8E0D6] rounded-xl p-4 space-y-3">
      <p className="text-xs text-[#7A6E64] uppercase tracking-widest font-label">Any tickets already booked for {destName}?</p>

      {activities.map(act => (
        <div key={act.id} className="bg-white border border-[#E8E0D6] rounded-xl p-4 space-y-3 relative">
          <button onClick={() => onChange(activities.filter(a => a.id !== act.id))}
            className="absolute top-3 right-3 text-[#9A8E7E] hover:text-[#4A4440] text-xl leading-none transition-colors">×</button>

          <div>
            <label className="block text-xs text-[#7A6E64] mb-1.5">Activity</label>
            <input type="text" value={act.name} onChange={e => upd(act.id, { name: e.target.value })}
              placeholder="e.g. Alcatraz Island Tour"
              className="w-full bg-white border border-[#E2D8CE] rounded-lg px-3 py-2.5 text-[#1A1A1A] text-sm placeholder-[#9A8E7E] focus:outline-none focus:border-[#C97552]/60" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#7A6E64] mb-1.5">Date</label>
              <input type="date" value={act.date} onChange={e => upd(act.id, { date: e.target.value })}
                className="w-full bg-white border border-[#E2D8CE] rounded-lg px-3 py-2.5 text-[#1A1A1A] text-sm focus:outline-none focus:border-[#C97552]/60 [color-scheme:dark]" />
            </div>
            <div>
              <label className="block text-xs text-[#7A6E64] mb-1.5">Start time</label>
              <input type="time" value={act.start_time} onChange={e => upd(act.id, { start_time: e.target.value })}
                className="w-full bg-white border border-[#E2D8CE] rounded-lg px-3 py-2.5 text-[#1A1A1A] text-sm focus:outline-none focus:border-[#C97552]/60 [color-scheme:dark]" />
            </div>
            <div>
              <label className="block text-xs text-[#7A6E64] mb-1.5">Duration (hours)</label>
              <input type="number" min={0.5} max={24} step={0.5} value={act.duration_hours}
                onChange={e => upd(act.id, { duration_hours: parseFloat(e.target.value) || 1 })}
                className="w-full bg-white border border-[#E2D8CE] rounded-lg px-3 py-2.5 text-[#1A1A1A] text-sm focus:outline-none focus:border-[#C97552]/60" />
            </div>
            <div>
              <label className="block text-xs text-[#7A6E64] mb-1.5">Tickets for</label>
              <input type="number" min={1} value={act.ticket_count} onChange={e => upd(act.id, { ticket_count: parseInt(e.target.value) || 1 })}
                className="w-full bg-white border border-[#E2D8CE] rounded-lg px-3 py-2.5 text-[#1A1A1A] text-sm focus:outline-none focus:border-[#C97552]/60" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#7A6E64] mb-1.5">Notes (optional)</label>
            <input type="text" value={act.notes} onChange={e => upd(act.id, { notes: e.target.value })}
              placeholder="e.g. Meet at Pier 33, 9:45am"
              className="w-full bg-white border border-[#E2D8CE] rounded-lg px-3 py-2.5 text-[#1A1A1A] text-sm placeholder-[#9A8E7E] focus:outline-none focus:border-[#C97552]/60" />
          </div>
        </div>
      ))}

      <button onClick={addActivity}
        className="w-full border border-dashed border-[#D8D0C4] rounded-xl py-3 text-sm text-[#6b5f54] hover:border-white/30 hover:text-[#4A4440] transition-all">
        + Add booked activity
      </button>
    </div>
  )
}

// ─── Must do / Nice to do section ────────────────────────────────────────────

function MustDoSection({
  destName, mustDo, niceToDo, onChange,
}: {
  destName:  string
  mustDo:    string
  niceToDo:  string
  onChange:  (must: string, nice: string) => void
}) {
  return (
    <div className="mt-2 bg-[#F5F2ED] border border-[#E8E0D6] rounded-xl p-4 space-y-4">
      <div>
        <p className="text-xs text-[#7A6E64] uppercase tracking-widest font-label">Things you <span className="text-[#4A4440]">MUST</span> do</p>
        <p className="text-xs text-[#9A8E7E] mt-0.5">Voya includes all of these — non-negotiable</p>
        <textarea
          value={mustDo}
          onChange={e => onChange(e.target.value, niceToDo)}
          rows={2}
          placeholder={`e.g. 17 Mile Drive, Pier 39, authentic Cuban food`}
          className="mt-2 w-full bg-white border border-[#E2D8CE] rounded-xl px-4 py-3 text-[#2A2420] text-sm placeholder-white/20 focus:outline-none focus:border-[#C97552]/40 resize-none leading-relaxed"
        />
      </div>
      <div>
        <p className="text-xs text-[#7A6E64] uppercase tracking-widest font-label">Would love to do if time</p>
        <p className="text-xs text-[#9A8E7E] mt-0.5">Included if schedule allows</p>
        <textarea
          value={niceToDo}
          onChange={e => onChange(mustDo, e.target.value)}
          rows={2}
          placeholder={`e.g. Alcatraz if tickets available, Muir Woods if not too far`}
          className="mt-2 w-full bg-white border border-[#E2D8CE] rounded-xl px-4 py-3 text-[#2A2420] text-sm placeholder-white/20 focus:outline-none focus:border-[#C97552]/40 resize-none leading-relaxed"
        />
      </div>
    </div>
  )
}

// ─── Things to avoid section ──────────────────────────────────────────────────

const AVOID_OPTIONS = [
  { key: 'tourist_crowds',       label: 'Tourist crowds'                    },
  { key: 'long_queues',          label: 'Long queues (30+ min wait)'        },
  { key: 'expensive',            label: 'Expensive activities ($50+/person)'},
  { key: 'physically_demanding', label: 'Physically demanding activities'   },
  { key: 'loud_venues',          label: 'Loud or busy venues'               },
  { key: 'shopping',             label: 'Shopping areas'                    },
  { key: 'nightlife',            label: 'Party and nightlife'               },
  { key: 'museums',              label: 'Museums and galleries'             },
  { key: 'guided_tours',         label: 'Guided tours'                      },
  { key: 'early_starts',         label: 'Early morning starts (before 9am)' },
  { key: 'late_nights',          label: 'Late nights (after 10pm)'          },
] as const

function AvoidSection({
  destName, toAvoid, avoidNotes, onAvoidChange, onNotesChange,
}: {
  destName:      string
  toAvoid:       string[]
  avoidNotes:    string
  onAvoidChange: (v: string[]) => void
  onNotesChange: (v: string) => void
}) {
  return (
    <div className="mt-2 bg-[#F5F2ED] border border-[#E8E0D6] rounded-xl p-4 space-y-3">
      <div>
        <p className="text-xs text-[#7A6E64] uppercase tracking-widest font-label">Anything to avoid in {destName}?</p>
        <p className="text-xs text-[#9A8E7E] mt-0.5">Optional — helps us skip what's not for you</p>
      </div>
      <div className="space-y-2">
        {AVOID_OPTIONS.map(opt => (
          <CheckRow
            key={opt.key}
            checked={toAvoid.includes(opt.key)}
            label={opt.label}
            onToggle={() => onAvoidChange(
              toAvoid.includes(opt.key)
                ? toAvoid.filter(k => k !== opt.key)
                : [...toAvoid, opt.key]
            )}
          />
        ))}
      </div>
      <div>
        <label className="block text-xs text-[#7A6E64] mb-1.5">Anything else?</label>
        <input type="text" value={avoidNotes} onChange={e => onNotesChange(e.target.value)}
          placeholder="e.g. We prefer boutique experiences over big chains"
          className="w-full bg-white border border-[#E2D8CE] rounded-lg px-3 py-2.5 text-[#1A1A1A] text-sm placeholder-[#9A8E7E] focus:outline-none focus:border-[#C97552]/60" />
      </div>
    </div>
  )
}

// ─── Local transport section ──────────────────────────────────────────────────

const LOCAL_TRANSPORT_OPTIONS = [
  { key: 'rental_car',   label: '🚗 Rental car'              },
  { key: 'transit',      label: '🚇 Public transit'           },
  { key: 'rideshare',    label: '🚖 Rideshare (Uber/Lyft)'   },
  { key: 'walking',      label: '🚶 Walking where possible'  },
  { key: 'bike_scooter', label: '🚲 Bike / scooter rental'   },
  { key: 'mix',          label: '🔀 Mix — whatever makes sense' },
]

function LocalTransportSection({
  destName, transport, onChange,
}: {
  destName:  string
  transport: string[]
  onChange:  (v: string[]) => void
}) {
  function toggle(key: string) {
    onChange(transport.includes(key) ? transport.filter(k => k !== key) : [...transport, key])
  }
  return (
    <div className="mt-2 bg-[#F5F2ED] border border-[#E8E0D6] rounded-xl p-4 space-y-3">
      <p className="text-xs text-[#7A6E64] uppercase tracking-widest font-label">Getting around {destName}</p>
      <p className="text-xs text-[#9A8E7E]">Select all that apply</p>
      <div className="space-y-2">
        {LOCAL_TRANSPORT_OPTIONS.map(opt => (
          <label key={opt.key} className="flex items-center gap-3 cursor-pointer py-0.5">
            <input type="checkbox"
              checked={transport.includes(opt.key)}
              onChange={() => toggle(opt.key)}
              className="accent-[#C97552] w-4 h-4 rounded" />
            <span className="text-sm text-[#1A1A1A]/65">{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

// ─── Trip context section ─────────────────────────────────────────────────────

function TripContextSection({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="bg-white border border-[#E8E0D6] rounded-2xl p-5 space-y-3">
      <div>
        <p className="text-xs text-[#7A6E64] uppercase tracking-widest font-label">Anything else we should know?</p>
        <p className="text-xs text-[#9A8E7E] mt-0.5">Optional — applies across the whole trip</p>
      </div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={4}
        placeholder={`e.g. One person has never traveled internationally before.\nWe want a mix of iconic and local.\nWe're celebrating a promotion.\nOur Airbnb is in the Mission District.`}
        className="w-full bg-white border border-[#E2D8CE] rounded-xl px-4 py-3 text-[#2A2420] text-sm placeholder-white/20 focus:outline-none focus:border-[#C97552]/40 resize-none leading-relaxed"
      />
    </div>
  )
}

// ─── Group coordination section ───────────────────────────────────────────────

function GroupCoordinationSection({ shareToken }: { shareToken: string }) {
  const [copied, setCopied] = useState(false)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const collabLink = `${origin}/trip/${shareToken}/collaborate`

  return (
    <div className="bg-white border border-[#E8E0D6] rounded-2xl p-5 space-y-4">
      <div>
        <p className="text-xs text-[#7A6E64] uppercase tracking-widest font-label mb-1">Planning with others?</p>
        <p className="text-[#5C564E] text-sm">Invite your group to view, comment and vote on activities.</p>
      </div>
      <div className="space-y-2">
        <p className="text-xs text-[#8A7E6E]">Collaboration link</p>
        <div className="flex items-center gap-2">
          <input readOnly value={collabLink}
            className="flex-1 bg-white border border-[#E2D8CE] rounded-lg px-3 py-2 text-[#5A504A] text-xs focus:outline-none" />
          <button
            onClick={() => { navigator.clipboard?.writeText(collabLink); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
            className="text-xs text-[#6b5f54] border border-[#E2D8CE] rounded-lg px-3 py-2 hover:border-white/25 hover:text-[#4A4440] transition-all flex-shrink-0"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <p className="text-xs text-[#7A6E64] bg-[#F5F2ED] border border-white/6 rounded-xl px-4 py-3 leading-relaxed">
        Anyone with this link can view the full itinerary, add comments on any activity, suggest changes, and vote 👍 👎. Only you can accept or apply changes.
      </p>
    </div>
  )
}

// ─── Transport connector ──────────────────────────────────────────────────────

const MODE_OPTIONS = [
  { mode: 'fly',   icon: '✈️', label: 'Flying'       },
  { mode: 'drive', icon: '🚗', label: 'Driving'      },
  { mode: 'bus',   icon: '🚌', label: 'Bus'          },
  { mode: 'train', icon: '🚂', label: 'Train'        },
  { mode: 'ferry', icon: '🚢', label: 'Ferry/Cruise' },
] as const

function AddStopOverlay({
  fromName, toName, nextDate, onAddTransit, onAddDest, onCancel,
}: {
  fromName:     string
  toName:       string
  nextDate:     string
  onAddTransit: (city: string) => void
  onAddDest:    (dest: TripDestination) => void
  onCancel:     () => void
}) {
  const [city,    setCity]    = useState('')
  const [country, setCountry] = useState('')
  const [days,    setDays]    = useState(0)
  const [start,   setStart]   = useState(nextDate)
  const endDate = days > 0 ? calcEndDate(start, days) : start

  function submit() {
    if (!city.trim()) return
    if (days === 0) {
      onAddTransit(city.trim())
    } else {
      if (!country.trim()) return
      onAddDest(emptyDest(localId(), city.trim(), country.trim(), days, start, endDate))
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-[#FAF8F5] border border-[#E2D8CE] rounded-2xl max-w-sm w-full p-6 space-y-5">
        <div>
          <p className="text-xs text-[#7A6E64] uppercase tracking-widest font-label mb-1">Add a stop</p>
          <p className="text-[#5A504A] text-sm">
            Between <span className="text-[#2A2420]">{fromName}</span> and <span className="text-[#2A2420]">{toName}</span>
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[#7A6E64] mb-1.5">City / destination</label>
            <input
              type="text" value={city} onChange={e => setCity(e.target.value)}
              placeholder="e.g. Orlando" autoFocus
              className="w-full bg-white border border-[#D8D0C4] rounded-lg px-3 py-2.5 text-[#1A1A1A] text-sm placeholder-[#9A8E7E] focus:outline-none focus:border-[#C97552]/60"
            />
          </div>

          <div>
            <label className="block text-xs text-[#7A6E64] mb-1.5">
              Days <span className="text-[#A8A09A] normal-case">(0 = transit stop only, no itinerary)</span>
            </label>
            <input
              type="number" value={days} min={0} max={30}
              onChange={e => setDays(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full bg-white border border-[#D8D0C4] rounded-lg px-3 py-2.5 text-[#1A1A1A] text-sm focus:outline-none focus:border-[#C97552]/60"
            />
          </div>

          {days > 0 && (
            <>
              <div>
                <label className="block text-xs text-[#7A6E64] mb-1.5">Country</label>
                <input
                  type="text" value={country} onChange={e => setCountry(e.target.value)}
                  placeholder="e.g. United States"
                  className="w-full bg-white border border-[#D8D0C4] rounded-lg px-3 py-2.5 text-[#1A1A1A] text-sm placeholder-[#9A8E7E] focus:outline-none focus:border-[#C97552]/60"
                />
              </div>
              <div>
                <label className="block text-xs text-[#7A6E64] mb-1.5">Start date</label>
                <input
                  type="date" value={start} onChange={e => setStart(e.target.value)}
                  className="w-full bg-white border border-[#D8D0C4] rounded-lg px-3 py-2.5 text-[#1A1A1A] text-sm focus:outline-none focus:border-[#C97552]/60 [color-scheme:dark]"
                />
              </div>
              <p className="text-xs text-[#7A6E64]">{formatDateRange(start, endDate)} · {days} {days === 1 ? 'day' : 'days'}</p>
            </>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={submit}
            disabled={!city.trim() || (days > 0 && !country.trim())}
            className="flex-1 bg-[#C97552] text-white text-sm font-medium py-3 rounded-full disabled:opacity-40 hover:bg-[#b86644] transition-colors"
          >
            {days === 0 ? 'Add transit stop →' : 'Add to trip →'}
          </button>
          <button
            onClick={onCancel}
            className="px-5 py-3 text-sm text-[#6b5f54] border border-[#E2D8CE] rounded-full hover:border-white/25 hover:text-[#4A4440] transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function TransportConnectorSection({
  from, to, leg, onChange, onAddStop, hasError,
}: {
  from:      TripDestination
  to:        TripDestination
  leg:       LegTransport
  onChange:  (l: LegTransport) => void
  onAddStop: () => void
  hasError?: boolean
}) {
  const travelDate = to.start_date
  const driveInfo  = getDriveInfo(from.name, to.name)
  const flightLink = `https://www.skyscanner.com/transport/flights/${getIATA(from.name)}/${getIATA(to.name)}/${travelDate.replace(/-/g, '')}/`
  const mapsLink   = `https://www.google.com/maps/dir/${encodeURIComponent(from.name + ', ' + from.country)}/${encodeURIComponent(to.name + ', ' + to.country)}`

  // Auto-suggest driving if from-city has rental car and this leg is unselected
  const fromHasRentalCar = from.local_transport.includes('rental_car')
  const showDriveSuggestion = fromHasRentalCar && !leg.mode

  return (
    <div className={[
      'rounded-xl p-4 space-y-3 my-1 border',
      hasError
        ? 'bg-amber-400/5 border-amber-400/40'
        : 'bg-[#F5F2ED] border-[#E8E0D6]',
    ].join(' ')}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-[#5A504A]">
          <span className="text-[#1A1A1A]/75 font-medium">{from.name}</span>
          <span className="mx-2 text-[#9A8E7E]">→</span>
          <span className="text-[#1A1A1A]/75 font-medium">{to.name}</span>
          {leg.transit_stop && (
            <span className="ml-2 text-[#7A6E64] text-xs">via {leg.transit_stop}</span>
          )}
        </p>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-[#9A8E7E]">{travelDate}</span>
          <button
            onClick={onAddStop}
            className="text-xs text-[#7A6E64] hover:text-[#4A4440] border border-[#E2D8CE] rounded-full px-3 py-1 transition-all"
            title="Add a stop between these destinations"
          >
            + Stop
          </button>
        </div>
      </div>

      {/* Mode selector */}
      <div className="flex gap-1.5 flex-wrap">
        {MODE_OPTIONS.map(opt => (
          <button
            key={opt.mode}
            type="button"
            onClick={() => onChange({ ...leg, mode: leg.mode === opt.mode ? null : opt.mode })}
            className={[
              'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all',
              leg.mode === opt.mode
                ? 'bg-[#C97552]/15 border-[#C97552]/40 text-[#1A1A1A]/85'
                : 'border-[#E2D8CE] text-[#6b5f54] hover:border-white/25 hover:text-[#4A4440]',
            ].join(' ')}
          >
            <span>{opt.icon}</span>
            <span>{opt.label}</span>
          </button>
        ))}
      </div>

      {/* Validation error */}
      {hasError && (
        <p className="text-xs text-amber-400/90 font-medium">
          ⚠️ Please select how you&apos;re traveling from {from.name} to {to.name}
        </p>
      )}

      {/* Drive suggestion when from-city has rental car and no mode selected */}
      {showDriveSuggestion && (
        <div className="bg-amber-400/8 border border-amber-400/20 rounded-lg px-3 py-2.5">
          <p className="text-xs text-amber-400/80">
            You have a rental car in {from.name} — driving to {to.name}?
          </p>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => onChange({ ...leg, mode: 'drive' })}
              className="text-xs bg-amber-400/15 border border-amber-400/30 text-amber-400/90 px-3 py-1.5 rounded-full hover:bg-amber-400/20 transition-all"
            >
              🚗 Yes, driving
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...leg, mode: 'fly' })}
              className="text-xs border border-[#E2D8CE] text-[#6b5f54] px-3 py-1.5 rounded-full hover:border-white/25 hover:text-[#4A4440] transition-all"
            >
              ✈️ No, flying (returning car first)
            </button>
          </div>
        </div>
      )}

      {/* Mode-specific details */}
      {leg.mode === 'fly' && (
        <div className="pt-0.5">
          <a
            href={flightLink} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs text-[#5A504A] border border-[#E2D8CE] rounded-full px-4 py-2 hover:border-white/25 hover:text-[#1A1A1A]/75 transition-all"
          >
            ✈️ Search flights {from.name} → {to.name} →
          </a>
        </div>
      )}

      {leg.mode === 'drive' && (
        <div className="space-y-3 pt-0.5">
          {driveInfo ? (
            <div className="bg-white border border-[#E8E0D6] rounded-xl px-4 py-3">
              <p className="text-sm text-[#3A3430] font-medium">
                🚗 {from.name} → {to.name}
              </p>
              <p className="text-xs text-[#6b5f54] mt-1">
                ~{driveInfo.miles.toLocaleString()} miles · ~{driveInfo.hours}h driving
              </p>
              {driveInfo.hours > 10 && (
                <p className="text-xs text-amber-400/70 mt-2 bg-amber-400/8 border border-amber-400/15 rounded-lg px-3 py-2">
                  ⚠️ Very long drive — consider adding an overnight stop or splitting this leg
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-[#7A6E64]">No pre-calculated route for this pair — open Maps for directions.</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="block text-xs text-[#8A7E6E]">Depart date</label>
              <input
                type="date" value={leg.departure_date}
                onChange={e => onChange({ ...leg, departure_date: e.target.value })}
                className="w-full bg-white border border-[#E2D8CE] rounded-lg px-3 py-2 text-[#1A1A1A] text-xs focus:outline-none focus:border-[#C97552]/60 [color-scheme:dark]"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-[#8A7E6E]">Depart time</label>
              <input
                type="time" value={leg.departure_time}
                onChange={e => onChange({ ...leg, departure_time: e.target.value })}
                className="w-full bg-white border border-[#E2D8CE] rounded-lg px-3 py-2 text-[#1A1A1A] text-xs focus:outline-none focus:border-[#C97552]/60 [color-scheme:dark]"
              />
            </div>
          </div>
          {leg.departure_date && leg.departure_time && driveInfo && (
            <p className="text-xs text-[#7A6E64]">
              Depart {leg.departure_date} at {leg.departure_time} · est. arrival ~{
                (() => {
                  const [h, m] = leg.departure_time.split(':').map(Number)
                  const totalMins = h * 60 + m + Math.round(driveInfo.hours * 60)
                  const arrH = Math.floor(totalMins / 60) % 24
                  const arrM = totalMins % 60
                  const extra = Math.floor(totalMins / (60 * 24))
                  return `${arrH.toString().padStart(2, '0')}:${arrM.toString().padStart(2, '0')}${extra > 0 ? ` (+${extra}d)` : ''}`
                })()
              }
            </p>
          )}
          <a
            href={mapsLink} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs text-[#5A504A] border border-[#E2D8CE] rounded-full px-4 py-2 hover:border-white/25 hover:text-[#1A1A1A]/75 transition-all"
          >
            🗺️ Open in Google Maps →
          </a>
        </div>
      )}

      {leg.mode === 'bus' && (
        <div className="pt-0.5 space-y-2">
          <p className="text-xs text-[#6b5f54]">Check Flixbus, Greyhound, or local operators for schedules.</p>
          <a
            href={`https://www.google.com/search?q=bus+${encodeURIComponent(from.name)}+to+${encodeURIComponent(to.name)}`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs text-[#5A504A] border border-[#E2D8CE] rounded-full px-4 py-2 hover:border-white/25 hover:text-[#1A1A1A]/75 transition-all"
          >
            🚌 Search bus routes →
          </a>
        </div>
      )}

      {leg.mode === 'train' && (
        <div className="pt-0.5 space-y-2">
          <p className="text-xs text-[#6b5f54]">Book via national rail, Amtrak, Eurail, or local operators.</p>
          <a
            href={`https://www.google.com/search?q=train+${encodeURIComponent(from.name)}+to+${encodeURIComponent(to.name)}`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs text-[#5A504A] border border-[#E2D8CE] rounded-full px-4 py-2 hover:border-white/25 hover:text-[#1A1A1A]/75 transition-all"
          >
            🚂 Search train routes →
          </a>
        </div>
      )}

      {leg.mode === 'ferry' && (
        <div className="pt-0.5 space-y-2">
          <p className="text-xs text-[#6b5f54]">Check ferry schedules and cruise lines for this route.</p>
          <a
            href={`https://www.google.com/search?q=ferry+cruise+${encodeURIComponent(from.name)}+to+${encodeURIComponent(to.name)}`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs text-[#5A504A] border border-[#E2D8CE] rounded-full px-4 py-2 hover:border-white/25 hover:text-[#1A1A1A]/75 transition-all"
          >
            🚢 Search ferry routes →
          </a>
        </div>
      )}
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
    onAdd(emptyDest(localId(), name.trim(), country.trim(), days, start, endDate))
  }

  return (
    <div className="bg-white border border-[#E2D8CE] rounded-2xl p-5 space-y-4">
      <p className="text-xs text-[#6b5f54] uppercase tracking-widest font-label">Add destination</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-[#7A6E64] mb-1.5">City / Destination</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Miami" autoFocus
            className="w-full bg-white border border-[#D8D0C4] rounded-lg px-4 py-3 text-[#1A1A1A] placeholder-[#9A8E7E] focus:outline-none focus:border-[#C97552]/60 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-[#7A6E64] mb-1.5">Country</label>
          <input type="text" value={country} onChange={e => setCountry(e.target.value)}
            placeholder="e.g. United States"
            className="w-full bg-white border border-[#D8D0C4] rounded-lg px-4 py-3 text-[#1A1A1A] placeholder-[#9A8E7E] focus:outline-none focus:border-[#C97552]/60 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-[#7A6E64] mb-1.5">Start date</label>
          <input type="date" value={start} onChange={e => setStart(e.target.value)}
            className="w-full bg-white border border-[#D8D0C4] rounded-lg px-4 py-3 text-[#1A1A1A] focus:outline-none focus:border-[#C97552]/60 text-sm [color-scheme:dark]" />
        </div>
        <div>
          <label className="block text-xs text-[#7A6E64] mb-1.5">Days</label>
          <input type="number" value={days} min={1} max={30}
            onChange={e => setDays(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full bg-white border border-[#D8D0C4] rounded-lg px-4 py-3 text-[#1A1A1A] focus:outline-none focus:border-[#C97552]/60 text-sm" />
        </div>
      </div>
      {start && days > 0 && (
        <p className="text-xs text-[#7A6E64]">{formatDateRange(start, endDate)} · {days} {days === 1 ? 'day' : 'days'}</p>
      )}
      <div className="flex gap-2 pt-1">
        <button onClick={submit} disabled={!name.trim() || !country.trim()}
          className="flex-1 bg-[#C97552] text-white text-sm font-medium py-3 rounded-full disabled:opacity-40 hover:bg-[#b86644] transition-colors">
          Add to trip
        </button>
        <button onClick={onCancel}
          className="px-5 py-3 text-sm text-[#6b5f54] border border-[#E2D8CE] rounded-full hover:border-white/25 hover:text-[#4A4440] transition-all">
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
        <p className="text-xs text-[#8A7E6E] uppercase tracking-widest font-label">{label}</p>
        <div className="flex items-center gap-2 text-[#6b5f54] text-sm py-2">
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
        <p className="text-xs text-[#8A7E6E] uppercase tracking-widest font-label">{label}</p>
        <button
          onClick={onAdd}
          className="w-full border border-dashed border-[#D8D0C4] rounded-xl py-3 text-xs text-[#8A7E6E] hover:border-white/30 hover:text-[#5C564E] transition-all"
        >
          + Add something here
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1.5 relative">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#8A7E6E] uppercase tracking-widest font-label">{label}</p>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="w-6 h-6 flex items-center justify-center text-[#8A7E6E] hover:text-[#4A4440] transition-colors rounded"
          >
            ⋮
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-7 z-50 bg-[#1a2f48] border border-[#E2D8CE] rounded-xl shadow-xl w-48 overflow-hidden">
              <button
                onClick={() => { setMenuOpen(false); onReplace() }}
                className="w-full text-left px-4 py-3 text-sm text-[#3A3430] hover:bg-[#F0EBE3] transition-colors flex items-center gap-2"
              >
                🔄 Replace this
              </button>
              <button
                onClick={() => { setMenuOpen(false); onMove() }}
                className="w-full text-left px-4 py-3 text-sm text-[#3A3430] hover:bg-[#F0EBE3] transition-colors flex items-center gap-2"
              >
                ↕ Move to another day
              </button>
              <button
                onClick={() => { setMenuOpen(false); onRemove() }}
                className="w-full text-left px-4 py-3 text-sm text-red-400/80 hover:bg-[#F0EBE3] transition-colors flex items-center gap-2"
              >
                ✕ Remove
              </button>
            </div>
          )}
        </div>
      </div>
      <p className="text-[#1A1A1A] font-medium text-sm">{block.activity}</p>
      <p className="text-[#5A504A] text-sm leading-relaxed">{block.description}</p>
      {block.insider_tip && (
        <p className="text-[#C97552]/80 text-xs italic">💡 {block.insider_tip}</p>
      )}
      <p className="text-[#8A7E6E] text-xs">{block.estimated_cost}</p>
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
    <div className="bg-white border border-[#E8E0D6] rounded-2xl p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="font-serif italic text-base text-[#1A1A1A] leading-tight">{day.title}</h4>
        <span className="text-xs text-[#9A8E7E] flex-shrink-0">Day {day.day}</span>
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
      <div className="pt-2 border-t border-[#E8E0D6] flex items-center justify-between">
        <span className="text-xs text-[#C97552]/70">Day total: ~{day.day_total_estimate}</span>
        <button
          onClick={handleAddActivity}
          className="text-xs text-[#8A7E6E] hover:text-[#5A504A] transition-colors"
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
      <div className="bg-[#FAF8F5] border border-[#E2D8CE] rounded-2xl max-w-sm w-full p-6 space-y-5">
        <div>
          <p className="text-xs text-[#7A6E64] uppercase tracking-widest font-label mb-1">Replace activity</p>
          <h3 className="text-[#1A1A1A] font-medium text-base">{activityName}</h3>
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
              <span className="text-sm text-[#3A3430]">{opt.label}</span>
            </label>
          ))}
          {selected === 'specific' && (
            <input
              type="text"
              value={custom}
              onChange={e => setCustom(e.target.value)}
              placeholder="What would you like instead?"
              autoFocus
              className="w-full bg-white border border-[#D8D0C4] rounded-lg px-3 py-2.5 text-[#1A1A1A] text-sm placeholder-[#9A8E7E] focus:outline-none focus:border-[#C97552]/60 mt-1"
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
            className="px-5 py-3 text-sm text-[#6b5f54] border border-[#E2D8CE] rounded-full hover:border-white/25 hover:text-[#4A4440] transition-all"
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
      <div className="bg-[#FAF8F5] border border-[#E2D8CE] rounded-2xl max-w-sm w-full p-6 space-y-5">
        <div>
          <p className="text-xs text-[#7A6E64] uppercase tracking-widest font-label mb-1">Move activity</p>
          <p className="text-[#4A4440] text-sm">Choose a new slot</p>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {allDays.map(d => (
            <div key={d.day} className="space-y-1">
              <p className="text-xs text-[#7A6E64]">Day {d.day} — {d.title}</p>
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
                          ? 'border-[#E8E0D6] text-[#A8A09A] cursor-not-allowed'
                          : isSelected
                            ? 'border-[#C97552] bg-[#C97552]/15 text-[#2A2420]'
                            : 'border-[#D8D0C4] text-[#5C564E] hover:border-white/30',
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
            className="px-5 py-3 text-sm text-[#6b5f54] border border-[#E2D8CE] rounded-full hover:border-white/25 hover:text-[#4A4440] transition-all"
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
      <div className="bg-[#FAF8F5] border border-[#E2D8CE] rounded-2xl max-w-sm w-full p-6 space-y-5">
        <div>
          <p className="text-xs text-[#7A6E64] uppercase tracking-widest font-label mb-1">Add activity</p>
          <p className="text-[#4A4440] text-sm">Day {dayNum} · {slot.charAt(0).toUpperCase() + slot.slice(1)}</p>
        </div>

        <div>
          <label className="block text-xs text-[#7A6E64] mb-1.5">What do you want to add?</label>
          <input
            type="text"
            value={request}
            onChange={e => setRequest(e.target.value)}
            placeholder="e.g. a hidden bar, something romantic, street food…"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && request.trim() && onConfirm(request.trim())}
            className="w-full bg-white border border-[#D8D0C4] rounded-lg px-3 py-2.5 text-[#1A1A1A] text-sm placeholder-[#9A8E7E] focus:outline-none focus:border-[#C97552]/60"
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
            className="px-5 py-3 text-sm text-[#6b5f54] border border-[#E2D8CE] rounded-full hover:border-white/25 hover:text-[#4A4440] transition-all"
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

  // Cached recommendations for destination suggestions
  const [suggestions,      setSuggestions]      = useState<{ name: string; country: string; match_score: number }[]>([])
  // Prefill values for AddDestForm — changing formKey forces a re-mount so inputs reset
  const [formPrefillName,    setFormPrefillName]    = useState('')
  const [formPrefillCountry, setFormPrefillCountry] = useState('')
  const [formKey,            setFormKey]            = useState(0)

  // transport legs — keyed by "fromId|toId"
  const [transportLegs,   setTransportLegs]   = useState<Record<string, LegTransport>>({})
  // index of the "from" destination when user clicks "+ Stop"
  const [addStopBetween,  setAddStopBetween]  = useState<number | null>(null)
  // connector validation errors — set of "fromId|toId" keys that have no mode selected
  const [connectorErrors, setConnectorErrors] = useState<Set<string>>(new Set())

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

  // ── Trip-level new state ───────────────────────────────────────────────────
  const [accessibility,   setAccessibility]   = useState<AccessibilityInfo>({ needs: [], max_walking_minutes: null })
  const [tripInterests,   setTripInterests]   = useState<string[]>([])
  const [tripPace,        setTripPace]        = useState<'packed'|'balanced'|'relaxed'>('balanced')
  const [specialOccasion,    setSpecialOccasion]    = useState<string>('none')
  const [occasionPerson,     setOccasionPerson]     = useState<string>('')
  const [occasionDate,       setOccasionDate]       = useState<string>('')
  const [occasionTime,       setOccasionTime]       = useState<string>('')
  const [occasionVenue,      setOccasionVenue]      = useState<string>('')
  const [occasionEventName,  setOccasionEventName]  = useState<string>('')
  const [tripContext,     setTripContext]      = useState<string>('')

  // Pre-open add form if dest pre-filled from discover
  useEffect(() => {
    if ((prefillDest || prefillCountry) && !formPrefillUsed) {
      setFormPrefillName(prefillDest)
      setFormPrefillCountry(prefillCountry)
      setShowAddForm(true)
      setFormPrefillUsed(true)
    }
  }, [prefillDest, prefillCountry, formPrefillUsed])

  // Load user profile + cached recommendations for suggestions
  useEffect(() => {
    async function load() {
      const supabase = getSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [profileResult, recResult] = await Promise.all([
        supabase.from('onboarding_responses').select('*').eq('user_id', user.id).single(),
        supabase.from('recommendations').select('destinations').eq('user_id', user.id).single(),
      ])

      if (profileResult.data) {
        const data = profileResult.data
        setProfile({
          budget_per_day:       data.budget_per_day      ?? '50-150',
          group_type:           data.group_type          ?? 'couple',
          interests:            data.interests           ?? [],
          dietary_preferences:  data.dietary_preferences ?? [],
          home_city:            data.home_city           ?? '',
          home_country:         data.home_country        ?? '',
        })
        if (data.group_type === 'solo') setGroup(g => ({ ...g, traveler_count: 1 }))

        // Pre-fill group dietary from profile so user doesn't have to re-enter every trip
        const prefs: string[] = data.dietary_preferences ?? []
        const hasVeg      = prefs.includes('vegetarian') || prefs.includes('vegan')
        const hasHalal    = prefs.includes('halal')
        const hasGF       = prefs.includes('gluten-free')
        const hasAnyDiet  = hasVeg || hasHalal || hasGF
        if (hasAnyDiet) {
          setGroup(g => ({
            ...g,
            dietary_some_veg:    hasVeg,
            vegetarian_count:    hasVeg ? 1 : 0,
            dietary_halal:       hasHalal,
            dietary_gluten_free: hasGF,
            dietary_none:        false,
          }))
        }
      }

      // Load cached recommendation suggestions (top 6 unlocked, sorted by match score)
      if (recResult.data?.destinations) {
        const dests = recResult.data.destinations as { name: string; country: string; match_score: number; locked?: boolean }[]
        const top = dests
          .filter(d => !d.locked && d.name && d.country)
          .sort((a, b) => b.match_score - a.match_score)
          .slice(0, 6)
          .map(d => ({ name: d.name, country: d.country, match_score: d.match_score }))
        setSuggestions(top)
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

  function getLeg(fromId: string, toId: string): LegTransport {
    return transportLegs[`${fromId}|${toId}`] ?? emptyLeg()
  }

  function updateLeg(fromId: string, toId: string, updates: Partial<LegTransport>) {
    const key = `${fromId}|${toId}`
    setTransportLegs(prev => ({ ...prev, [key]: { ...emptyLeg(), ...prev[key], ...updates } }))
    // Clear connector error for this leg once a mode is selected
    if (updates.mode) {
      setConnectorErrors(prev => { const next = new Set(prev); next.delete(key); return next })
    }
  }

  function setTransitStop(fromId: string, toId: string, transitStop: string) {
    updateLeg(fromId, toId, { transit_stop: transitStop })
  }

  // Insert a new destination at position afterIdx+1 (0-indexed).
  // Subsequent destinations keep their existing dates — user can adjust manually.
  function insertDestinationAfter(afterIdx: number, newDest: TripDestination) {
    setDestinations(prev => {
      const updated = [...prev]
      updated.splice(afterIdx + 1, 0, newDest)
      return updated
    })
    setAddStopBetween(null)
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

    // FIX 3 — Validate all connectors between destinations have a mode selected
    if (destinations.length > 1) {
      const missingKeys = new Set<string>()
      for (let i = 0; i < destinations.length - 1; i++) {
        const key = `${destinations[i].id}|${destinations[i + 1].id}`
        const leg = transportLegs[key]
        if (!leg?.mode) missingKeys.add(key)
      }
      if (missingKeys.size > 0) {
        setConnectorErrors(missingKeys)
        // Scroll to first error
        const firstKey = [...missingKeys][0]
        document.getElementById(`connector-${firstKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
    }
    setConnectorErrors(new Set())

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

    const requests = destinations.map(async (dest, idx) => {
      const f = dest.flights
      // Determine arrival transport mode for this destination
      const inboundLeg: LegTransport | null = idx > 0
        ? getLeg(destinations[idx - 1].id, dest.id)
        : null
      const transport_mode = inboundLeg?.mode ?? null
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
            // Legacy user_plans synthesised from new split fields
            user_plans:      [dest.must_do, dest.nice_to_do].filter(Boolean).join('\n') || undefined,
            must_do:         dest.must_do      || undefined,
            nice_to_do:      dest.nice_to_do   || undefined,
            things_to_avoid: dest.things_to_avoid.length > 0 ? dest.things_to_avoid : undefined,
            avoid_notes:     dest.avoid_notes  || undefined,
            local_transport: dest.local_transport.length > 0 ? dest.local_transport : undefined,
            searching_flights:   f.status === 'none',
            searching_hotel:     dest.hotel.status === 'none',
            booked_activities: dest.booked_activities.filter(a => a.name && a.date).length > 0
              ? dest.booked_activities.filter(a => a.name && a.date)
              : undefined,
            transport_mode:      transport_mode      || undefined,
            trip_interests:      tripInterests.length > 0 ? tripInterests : undefined,
            trip_pace:           tripPace,
            special_occasion:    specialOccasion !== 'none' ? specialOccasion : undefined,
            occasion_person:     occasionPerson || undefined,
            occasion_date:       occasionDate   || undefined,
            occasion_time:       occasionTime   || undefined,
            occasion_venue:      occasionVenue  || undefined,
            occasion_event_name: occasionEventName || undefined,
            accessibility_needs: accessibility.needs.length > 0 ? accessibility.needs : undefined,
            max_walking_minutes: accessibility.max_walking_minutes || undefined,
            trip_context:        tripContext || undefined,
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
      return { ...item, loading: false, days: mutableDays, pre_trip: r.result!.pre_trip, error: '' }
    }))
    setGenerating(false)
  }, [destinations, profile, group, tripInterests, tripPace, specialOccasion, occasionPerson, occasionDate, occasionTime, occasionVenue, occasionEventName, accessibility, tripContext, transportLegs])

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
        user_id:             user.id,
        trip_name:           tripName.trim() || `${destinations.map(d => d.name).join(' + ')} — ${tripStart}`,
        status:              'planning',
        total_days:          totalDays,
        start_date:          tripStart,
        end_date:            tripEnd,
        // New trip-level fields (requires DB migration — fails silently if columns don't exist)
        trip_interests:      tripInterests.length > 0 ? tripInterests : null,
        trip_pace:           tripPace,
        special_occasion:    specialOccasion !== 'none' ? specialOccasion : null,
        occasion_person:     occasionPerson || null,
        accessibility_needs: accessibility.needs.length > 0 ? accessibility.needs : null,
        max_walking_minutes: accessibility.max_walking_minutes || null,
        trip_context:        tripContext || null,
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
          // Serialize per-dest fields into notes as JSON (no separate migration needed)
          notes: JSON.stringify({
            must_do:         dest.must_do        || null,
            nice_to_do:      dest.nice_to_do     || null,
            things_to_avoid: dest.things_to_avoid.length > 0 ? dest.things_to_avoid : null,
            avoid_notes:     dest.avoid_notes    || null,
            local_transport: dest.local_transport.length > 0 ? dest.local_transport : null,
          }) || null,
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
  }, [destinations, itineraries, tripName, totalDays, tripStart, tripEnd, router, tripInterests, tripPace, specialOccasion, occasionPerson, accessibility, tripContext])

  const hasItineraries = itineraries.some(i => !i.loading && !i.error && i.days.length > 0)
  const hasAnyDays     = itineraries.some(i => i.days.length > 0)

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <main className="max-w-2xl mx-auto px-4 py-10 space-y-6">

        {/* Header */}
        <div>
          <p className="text-xs text-[#7A6E64] uppercase tracking-widest font-label mb-2">Trip planner</p>
          <h1 className="font-serif italic text-4xl text-[#1A1A1A] leading-tight">Plan your trip</h1>
        </div>

        {/* Trip name */}
        <input
          type="text" value={tripName} onChange={e => setTripName(e.target.value)}
          placeholder="e.g. Miami + San Francisco May 2026 (optional)"
          className="w-full bg-white border border-[#E2D8CE] rounded-xl px-4 py-3 text-[#1A1A1A] placeholder-[#9A8E7E] focus:outline-none focus:border-[#C97552]/40 text-sm"
        />

        {/* Group composition + accessibility */}
        <GroupCompositionSection
          group={group} onChange={setGroup}
          accessibility={accessibility} onAccessibilityChange={setAccessibility}
        />

        {/* Activity preferences */}
        <ActivityPreferencesSection
          interests={tripInterests} pace={tripPace}
          onInterestsChange={setTripInterests} onPaceChange={setTripPace}
        />

        {/* Special occasion */}
        <SpecialOccasionSection
          occasion={specialOccasion} person={occasionPerson}
          date={occasionDate} time={occasionTime}
          venue={occasionVenue} eventName={occasionEventName}
          onOccasionChange={setSpecialOccasion} onPersonChange={setOccasionPerson}
          onDateChange={setOccasionDate} onTimeChange={setOccasionTime}
          onVenueChange={setOccasionVenue} onEventNameChange={setOccasionEventName}
          tripStartDate={tripStart} tripEndDate={tripEnd}
        />

        {/* Destinations */}
        <div className="space-y-3">
          {destinations.length === 0 && !showAddForm && (
            <div className="text-center py-10 border border-dashed border-[#E2D8CE] rounded-2xl">
              <p className="text-[#6b5f54] text-sm">No destinations yet.</p>
              <p className="text-[#9A8E7E] text-xs mt-1">Add your first stop below.</p>
            </div>
          )}

          {destinations.map((dest, idx) => (
            <div key={dest.id} className="space-y-0">
              {idx > 0 && (() => {
                const connKey = `${destinations[idx - 1].id}|${dest.id}`
                return (
                  <div id={`connector-${connKey}`}>
                    <TransportConnectorSection
                      from={destinations[idx - 1]}
                      to={dest}
                      leg={getLeg(destinations[idx - 1].id, dest.id)}
                      onChange={l => updateLeg(destinations[idx - 1].id, dest.id, l)}
                      onAddStop={() => setAddStopBetween(idx - 1)}
                      hasError={connectorErrors.has(connKey)}
                    />
                  </div>
                )
              })()}
              {/* Inline "add stop" form between this connector and this destination */}
              {addStopBetween === idx - 1 && idx > 0 && (
                <AddStopOverlay
                  fromName={destinations[idx - 1].name}
                  toName={dest.name}
                  nextDate={addDays(destinations[idx - 1].end_date, 1)}
                  onAddTransit={city => {
                    setTransitStop(destinations[idx - 1].id, dest.id, city)
                    setAddStopBetween(null)
                  }}
                  onAddDest={newDest => insertDestinationAfter(idx - 1, newDest)}
                  onCancel={() => setAddStopBetween(null)}
                />
              )}

              {/* Destination header card */}
              <div className="rounded-2xl border border-[#E8E0D6] bg-white">
                {/* Compact header */}
                <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="text-lg mt-0.5">📍</span>
                    <div className="min-w-0">
                      <p className="text-[#1A1A1A] font-medium text-sm">
                        {dest.name}, {dest.country}
                        <span className="text-[#6b5f54] font-normal ml-2">{dest.days} {dest.days === 1 ? 'day' : 'days'}</span>
                      </p>
                      <p className="text-[#7A6E64] text-xs mt-0.5">{formatDateRange(dest.start_date, dest.end_date)}</p>
                    </div>
                  </div>
                  <button onClick={() => removeDestination(dest.id)}
                    className="text-[#9A8E7E] hover:text-[#4A4440] transition-colors text-xl leading-none flex-shrink-0"
                    aria-label="Remove">×</button>
                </div>

                {/* Flights + accessibility */}
                <div className="px-4 pb-3">
                  <FlightsSection
                    dest={dest}
                    homeCity={profile?.home_city ?? ''}
                    flights={dest.flights}
                    onChange={f => updateDestination(dest.id, { flights: f })}
                    accessibility={accessibility}
                  />
                </div>

                {/* Hotel */}
                <div className="px-4 pb-3">
                  <HotelSection
                    dest={dest}
                    hotel={dest.hotel}
                    onChange={h => updateDestination(dest.id, { hotel: h })}
                  />
                </div>

                {/* Local transport */}
                <div className="px-4 pb-3">
                  <LocalTransportSection
                    destName={dest.name}
                    transport={dest.local_transport}
                    onChange={v => updateDestination(dest.id, { local_transport: v })}
                  />
                </div>

                {/* Already booked activities */}
                <div className="px-4 pb-3">
                  <BookedActivitiesSection
                    destName={dest.name}
                    activities={dest.booked_activities}
                    onChange={a => updateDestination(dest.id, { booked_activities: a })}
                  />
                </div>

                {/* Must do / Nice to do */}
                <div className="px-4 pb-3">
                  <MustDoSection
                    destName={dest.name}
                    mustDo={dest.must_do}
                    niceToDo={dest.nice_to_do}
                    onChange={(must, nice) => updateDestination(dest.id, { must_do: must, nice_to_do: nice })}
                  />
                </div>

                {/* Things to avoid */}
                <div className="px-4 pb-4">
                  <AvoidSection
                    destName={dest.name}
                    toAvoid={dest.things_to_avoid}
                    avoidNotes={dest.avoid_notes}
                    onAvoidChange={v => updateDestination(dest.id, { things_to_avoid: v })}
                    onNotesChange={v => updateDestination(dest.id, { avoid_notes: v })}
                  />
                </div>
              </div>
            </div>
          ))}

          {/* Destination suggestions from Discover picks */}
          {suggestions.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-[#8A7E6E] uppercase tracking-widest font-label">From your Discover picks</p>
              <div className="flex flex-wrap gap-2">
                {suggestions
                  .filter(s => !destinations.some(d => d.name.toLowerCase() === s.name.toLowerCase()))
                  .map((s, i) => (
                    <button
                      key={`${s.name}-${i}`}
                      type="button"
                      onClick={() => {
                        setFormPrefillName(s.name)
                        setFormPrefillCountry(s.country)
                        setFormKey(k => k + 1)
                        setShowAddForm(true)
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#E8E0D6] text-[#3A3430] text-xs hover:bg-[#EDE5D8] hover:border-[#CCC4B8] hover:text-[#1A1A1A] transition-all"
                    >
                      <span>{s.name}</span>
                      <span className="text-[#C97552] font-medium">{s.match_score}%</span>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Add form */}
          {showAddForm && (
            <AddDestForm
              key={formKey}
              nextStart={nextStartDate}
              onAdd={dest => {
                addDestination(dest)
                setFormPrefillName('')
                setFormPrefillCountry('')
              }}
              onCancel={() => {
                setShowAddForm(false)
                setFormPrefillName('')
                setFormPrefillCountry('')
              }}
              prefillName={formPrefillName}
              prefillCountry={formPrefillCountry}
            />
          )}

          {!showAddForm && (
            <button onClick={() => { setShowAddForm(true); setFormPrefillName(''); setFormPrefillCountry('') }}
              className="w-full py-3 rounded-xl border border-dashed border-[#D8D0C4] text-[#6b5f54] text-sm hover:border-white/30 hover:text-[#4A4440] transition-all">
              + Add destination
            </button>
          )}
        </div>

        {/* Trip context */}
        <TripContextSection value={tripContext} onChange={setTripContext} />

        {/* Summary + CTA */}
        {destinations.length > 0 && (
          <div className="sticky bottom-20 md:bottom-4 z-10">
            <div className="bg-[#FAF8F5]/95 backdrop-blur border border-[#E2D8CE] rounded-2xl p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[#5C564E] text-xs">
                  <span className="text-[#1A1A1A]">{totalDays} {totalDays === 1 ? 'day' : 'days'}</span>
                  {tripStart && tripEnd && (
                    <span className="ml-2 text-[#7A6E64]">· {formatDateRange(tripStart, tripEnd)}</span>
                  )}
                </p>
                {destinations.length > 1 ? (
                  <p className="text-[#8A7E6E] text-xs mt-0.5 truncate">
                    {destinations.slice(0, -1).map((d, i) => {
                      const leg = getLeg(d.id, destinations[i + 1].id)
                      const icon = legModeIcon(leg.mode)
                      return (
                        <span key={d.id}>
                          {i > 0 && <span className="mx-1 text-[#1A1A1A]/15">·</span>}
                          {icon} {getIATA(d.name)}→{getIATA(destinations[i + 1].name)}
                        </span>
                      )
                    })}
                    <span className="ml-2 text-[#A8A09A]">· {group.traveler_count} {group.traveler_count === 1 ? 'traveler' : 'travelers'}</span>
                  </p>
                ) : (
                  <p className="text-[#9A8E7E] text-xs mt-0.5">
                    {destinations.length} {destinations.length === 1 ? 'destination' : 'destinations'}
                    {' · '}{group.traveler_count} {group.traveler_count === 1 ? 'traveler' : 'travelers'}
                  </p>
                )}
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
                  <div className="border-t border-[#E8E0D6] pt-6 mb-4">
                    <p className="text-xs text-[#7A6E64] uppercase tracking-widest font-label mb-1">
                      📍 {dest.name.toUpperCase()}, {dest.country.toUpperCase()}
                      {' · '}
                      {dest.days === 1
                        ? `Day ${dayOffset + 1}`
                        : `Days ${dayOffset + 1}–${dayOffset + dest.days}`
                      }
                    </p>
                    <h2 className="font-serif italic text-2xl text-[#1A1A1A]">{dest.name}</h2>
                    <p className="text-[#7A6E64] text-xs mt-0.5">{formatDateRange(dest.start_date, dest.end_date)}</p>
                  </div>

                  {itin.loading && (
                    <div className="flex items-center gap-3 py-6 text-[#6b5f54] text-sm">
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

                  {!itin.loading && !itin.error && itin.pre_trip && (
                    <div className="space-y-3 mb-4">
                      {itin.pre_trip.flight_recommendation && (() => {
                        const f = itin.pre_trip!.flight_recommendation!
                        return (
                          <div className="bg-white border border-[#C97552]/25 rounded-xl p-4 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-base">✈️</span>
                              <p className="text-[#C97552] text-xs font-semibold uppercase tracking-widest">Flight recommendation</p>
                            </div>
                            <p className="text-[#1A1A1A] text-sm font-medium">{f.best_arrival}</p>
                            <p className="text-[#5A504A] text-xs">{f.booking_advice}</p>
                            {f.airport_to_hotel && (
                              <p className="text-[#6b5f54] text-xs">🚕 {f.airport_to_hotel}</p>
                            )}
                            {f.skyscanner_url && (
                              <a href={f.skyscanner_url} target="_blank" rel="noopener noreferrer"
                                className="inline-block mt-1 text-xs text-[#C97552]/80 hover:text-[#C97552] underline underline-offset-2 transition-colors">
                                Search on Skyscanner →
                              </a>
                            )}
                          </div>
                        )
                      })()}
                      {itin.pre_trip.hotel_recommendation && (() => {
                        const h = itin.pre_trip!.hotel_recommendation!
                        return (
                          <div className="bg-white border border-blue-400/20 rounded-xl p-4 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-base">🏨</span>
                              <p className="text-blue-300/80 text-xs font-semibold uppercase tracking-widest">Best neighbourhood to stay</p>
                            </div>
                            <p className="text-[#1A1A1A] text-sm font-medium">{h.neighbourhood}</p>
                            <p className="text-[#5A504A] text-xs">{h.why}</p>
                            {h.price_range && (
                              <p className="text-[#6b5f54] text-xs">💰 {h.price_range}</p>
                            )}
                            {h.alternative && (
                              <p className="text-[#6b5f54] text-xs">Alternative: {h.alternative}</p>
                            )}
                            {h.booking_url && (
                              <a href={h.booking_url} target="_blank" rel="noopener noreferrer"
                                className="inline-block mt-1 text-xs text-blue-300/70 hover:text-blue-300 underline underline-offset-2 transition-colors">
                                Search hotels →
                              </a>
                            )}
                          </div>
                        )
                      })()}
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

                  {idx < destinations.length - 1 && !itin.loading && !itin.error && (() => {
                    const connKey = `${dest.id}|${destinations[idx + 1].id}`
                    return (
                      <div className="mt-4" id={`connector-${connKey}`}>
                        <TransportConnectorSection
                          from={dest}
                          to={destinations[idx + 1]}
                          leg={getLeg(dest.id, destinations[idx + 1].id)}
                          onChange={l => updateLeg(dest.id, destinations[idx + 1].id, l)}
                          onAddStop={() => setAddStopBetween(idx)}
                          hasError={connectorErrors.has(connKey)}
                        />
                      </div>
                    )
                  })()}
                </div>
              )
            })}

            {/* Save & Share */}
            {hasItineraries && (
              <div className="border-t border-[#E8E0D6] pt-6 space-y-3">
                {savedTripId ? (
                  <div className="space-y-3">
                    <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
                      <p className="text-green-400 text-sm font-medium">✓ Trip saved</p>
                    </div>
                    {shareToken && (
                      <>
                        <div className="bg-white border border-[#E8E0D6] rounded-xl p-4 space-y-2">
                          <p className="text-[#5C564E] text-xs">Share this trip</p>
                          <div className="flex items-center gap-2">
                            <input readOnly
                              value={`${typeof window !== 'undefined' ? window.location.origin : ''}/trip/${shareToken}`}
                              className="flex-1 bg-white border border-[#E2D8CE] rounded-lg px-3 py-2 text-[#4A4440] text-xs focus:outline-none"
                            />
                            <button onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/trip/${shareToken}`)}
                              className="text-xs text-[#6b5f54] border border-[#E2D8CE] rounded-lg px-3 py-2 hover:border-white/25 hover:text-[#4A4440] transition-all">
                              Copy
                            </button>
                          </div>
                        </div>
                        <GroupCoordinationSection shareToken={shareToken} />
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <button onClick={saveTrip} disabled={saving}
                      className="flex-1 bg-[#1A1A1A] text-white text-sm font-semibold py-3.5 rounded-full disabled:opacity-50 hover:bg-white/90 transition-all">
                      {saving ? 'Saving…' : 'Save trip'}
                    </button>
                    <button onClick={saveTrip} disabled={saving}
                      className="flex-1 border border-[#D8D0C4] text-[#4A4440] text-sm py-3.5 rounded-full hover:border-white/30 hover:text-[#2A2420] transition-all">
                      Share trip →
                    </button>
                  </div>
                )}
                <button onClick={() => router.push('/trips')}
                  className="w-full text-[#9A8E7E] text-xs py-2 hover:text-[#6b5f54] transition-colors">
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
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-[#CCC4B8] border-t-[#C97552]"
          style={{ animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <PlanNewInner />
    </Suspense>
  )
}
