import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const maxDuration = 55

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TripStop {
  name:           string
  city:           string
  state:          string
  type:           string
  why:            string
  dietary_fit:    string
  price_range:    string
  distance_note:  string
  open_note:      string
  lat:            number | null
  lng:            number | null
  display_name:   string
}

export interface TripAskParsed {
  origin:       string
  destination:  string
  mode:         string
  stop_types:   string[]
  vibes:        string[]
  dietary:      string[]
  travelers:    number | null
}

export interface LocalPlace {
  name:          string
  area:          string
  type:          string
  story:         string
  tagline:       string
  price_range:   string
  best_time?:    string
  insider_tip?:  string
  lat:           number | null
  lng:           number | null
  display_name:  string
}

export interface LocalDiscoveryParsed {
  location:  string
  country:   string
  intent:    string
}

export interface PhotoSpot {
  name:         string        // exact location name
  area:         string        // neighbourhood/district
  composition:  string        // exactly where to stand + what to frame (2–3 sentences)
  locals_tip:   string        // where pros/locals set up vs where tourists go
  best_session: 'golden_sunrise' | 'golden_sunset' | 'blue_sunrise' | 'blue_sunset' | 'midday' | 'night'
  light_note:   string        // why this light + this spot = magic
  lens:         string        // e.g. "24mm — fits the full arch and reflection"
  avoid:        string        // what tourists do wrong here
  lat:          number | null
  lng:          number | null
  display_name: string
}

export interface PhotoSunTimes {
  date:              string   // YYYY-MM-DD (today at that location)
  blue_am_start:     string   // HH:MM local approx
  blue_am_end:       string
  golden_am_start:   string
  golden_am_end:     string
  golden_pm_start:   string
  golden_pm_end:     string
  blue_pm_start:     string
  blue_pm_end:       string
}

export interface PhotoSpotsParsed {
  location:  string
  country:   string
  intent:    string   // any photographic intent mentioned
}

export type TripAskResponse =
  | { mode: 'road_trip';        parsed: TripAskParsed;        stops:  TripStop[];   route_summary: string }
  | { mode: 'local_discovery';  parsed: LocalDiscoveryParsed; places: LocalPlace[]; map_center: { lat: number; lng: number; zoom: number } }
  | { mode: 'photo_spots';      parsed: PhotoSpotsParsed;     spots:  PhotoSpot[];  sun: PhotoSunTimes; map_center: { lat: number; lng: number; zoom: number } }

// ─── Nominatim geocoder ───────────────────────────────────────────────────────

async function geocode(query: string): Promise<{ lat: number; lng: number; display_name: string } | null> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'Voya-App/1.0 (getvoya.net)' } }
    )
    const data = await r.json() as Array<{ lat: string; lon: string; display_name: string }>
    if (!data.length) return null
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), display_name: data[0].display_name }
  } catch { return null }
}

function calcZoom(places: { lat: number | null; lng: number | null }[]): number {
  const lats = places.filter(p => p.lat != null).map(p => p.lat!)
  const lngs = places.filter(p => p.lng != null).map(p => p.lng!)
  if (!lats.length) return 13
  const span = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lngs) - Math.min(...lngs))
  if (span < 0.01) return 15
  if (span < 0.05) return 14
  if (span < 0.15) return 13
  if (span < 0.5)  return 12
  if (span < 1.5)  return 11
  return 9
}

// ─── Sun times ────────────────────────────────────────────────────────────────
// Approximate local time from UTC using longitude (±15 min accuracy for most locations)

function utcToApproxLocal(utcIso: string, lngDeg: number): string {
  const offsetMin = Math.round(lngDeg / 15) * 60
  const d = new Date(new Date(utcIso).getTime() + offsetMin * 60_000)
  return d.toISOString().substring(11, 16) // "HH:MM"
}

function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

async function fetchSunTimes(lat: number, lng: number): Promise<PhotoSunTimes | null> {
  try {
    const today = new Date().toISOString().split('T')[0]
    const r = await fetch(
      `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lng}&formatted=0&date=${today}`,
      { headers: { 'User-Agent': 'Voya-App/1.0' } }
    )
    const data = await r.json() as {
      status: string
      results: { sunrise: string; sunset: string; dawn: string; dusk: string }
    }
    if (data.status !== 'OK') return null

    const sunrise      = utcToApproxLocal(data.results.sunrise, lng)
    const sunset       = utcToApproxLocal(data.results.sunset,  lng)
    const dawn         = utcToApproxLocal(data.results.dawn,    lng)
    const dusk         = utcToApproxLocal(data.results.dusk,    lng)
    const goldenAmEnd  = addMinutes(sunrise, 60)
    const goldenPmStart = addMinutes(sunset, -60)

    return {
      date:            today,
      blue_am_start:   dawn,
      blue_am_end:     sunrise,
      golden_am_start: sunrise,
      golden_am_end:   goldenAmEnd,
      golden_pm_start: goldenPmStart,
      golden_pm_end:   sunset,
      blue_pm_start:   sunset,
      blue_pm_end:     dusk,
    }
  } catch { return null }
}

// ─── POST /api/trip/ask ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { query } = await req.json() as { query: string }
  if (!query?.trim()) return NextResponse.json({ error: 'query required' }, { status: 400 })

  // ── Step 1: Detect mode + parse intent ───────────────────────────────────
  const parseCompletion = await openai.chat.completions.create({
    model:           'gpt-4o-mini',
    temperature:     0.1,
    response_format: { type: 'json_object' },
    messages: [{
      role: 'system',
      content: `You are a travel query classifier. Determine which type this is:

"road_trip"       — traveling FROM one city/place TO another city/place
"local_discovery" — finding places, food, experiences within one location
"photo_spots"     — finding photography locations, viewpoints, golden hour spots, photo timing

Return ONE JSON format:

Road trip:
{ "query_mode": "road_trip", "origin": "...", "destination": "...", "transport": "car|bus|train|walk", "stop_types": [], "vibes": [], "dietary": [], "travelers": null }

Local discovery:
{ "query_mode": "local_discovery", "location": "city or area", "country": "country in English", "intent": "what they want to find" }

Photo spots:
{ "query_mode": "photo_spots", "location": "city or area", "country": "country in English", "intent": "photographic intent or subject" }

For photo_spots: detect keywords like "photo", "shoot", "golden hour", "sunrise", "sunset", "viewpoint", "lens", "light", "Instagram", "photography", "spot", "capture".`,
    }, {
      role: 'user',
      content: query,
    }],
  })

  const parseRaw = JSON.parse(parseCompletion.choices[0]?.message?.content ?? '{}') as {
    query_mode?: string
    // road trip
    origin?: string; destination?: string; transport?: string
    stop_types?: string[]; vibes?: string[]; dietary?: string[]; travelers?: number | null
    // local / photo
    location?: string; country?: string; intent?: string
  }

  // ── Road trip ──────────────────────────────────────────────────────────────
  if (parseRaw.query_mode === 'road_trip' || parseRaw.origin) {
    const parsed: TripAskParsed = {
      origin:      parseRaw.origin      ?? '',
      destination: parseRaw.destination ?? '',
      mode:        parseRaw.transport   ?? 'car',
      stop_types:  parseRaw.stop_types  ?? [],
      vibes:       parseRaw.vibes       ?? [],
      dietary:     parseRaw.dietary     ?? [],
      travelers:   parseRaw.travelers   ?? null,
    }
    if (!parsed.origin || !parsed.destination) {
      return NextResponse.json({ error: 'Could not find a route — try "I\'m in [city], going to [city]"' }, { status: 400 })
    }
    const dietaryNote   = parsed.dietary.length    ? `Group dietary needs: ${parsed.dietary.join(', ')}. Every suggestion MUST work for these needs.` : ''
    const stopTypesNote = parsed.stop_types.length ? `Looking for: ${parsed.stop_types.join(', ')}` : 'Looking for: interesting stops'
    const vibesNote     = parsed.vibes.length      ? `Vibe: ${parsed.vibes.join(', ')}` : ''

    const genComp = await openai.chat.completions.create({
      model: 'gpt-4o-mini', temperature: 0.7, response_format: { type: 'json_object' },
      messages: [{
        role: 'system',
        content: `Road trip guide. Generate 5–7 REAL named places along the route. Geographically ordered origin→destination. ${dietaryNote}
Return JSON: { "route_summary": "origin → destination via [highway], approx [time]", "stops": [{ "name","city","state","type","why","dietary_fit","price_range","distance_note","open_note" }] }`,
      }, {
        role: 'user',
        content: `Route: ${parsed.origin} → ${parsed.destination} by ${parsed.mode || 'car'}\n${stopTypesNote}\n${vibesNote}\n${dietaryNote}\n${parsed.travelers ? `Group: ${parsed.travelers}` : ''}`,
      }],
    })
    const gen = JSON.parse(genComp.choices[0]?.message?.content ?? '{}') as { route_summary: string; stops: Omit<TripStop, 'lat'|'lng'|'display_name'>[] }
    const stops: TripStop[] = await Promise.all((gen.stops ?? []).map(async s => {
      const geo = await geocode(`${s.name}, ${s.city}, ${s.state}`)
      return { ...s, lat: geo?.lat ?? null, lng: geo?.lng ?? null, display_name: geo?.display_name ?? `${s.city}, ${s.state}` }
    }))
    return NextResponse.json({ mode: 'road_trip', parsed, stops, route_summary: gen.route_summary ?? `${parsed.origin} → ${parsed.destination}` } as TripAskResponse)
  }

  // ── Photo spots ────────────────────────────────────────────────────────────
  if (parseRaw.query_mode === 'photo_spots') {
    const parsed: PhotoSpotsParsed = {
      location: parseRaw.location ?? '',
      country:  parseRaw.country  ?? '',
      intent:   parseRaw.intent   ?? query,
    }
    if (!parsed.location) return NextResponse.json({ error: 'Could not find a location — include a city or place name' }, { status: 400 })
    const locationStr = parsed.country ? `${parsed.location}, ${parsed.country}` : parsed.location

    // Geocode location first (needed for sun times)
    const centerGeo = await geocode(locationStr)
    if (!centerGeo) return NextResponse.json({ error: `Couldn't locate "${locationStr}" — try a more specific place name` }, { status: 400 })

    // Run GPT + sun times in parallel
    const [spotsComp, sunTimes] = await Promise.all([
      openai.chat.completions.create({
        model: 'gpt-4o-mini', temperature: 0.7, response_format: { type: 'json_object' },
        messages: [{
          role: 'system',
          content: `You are a professional travel photographer briefing a client. Generate 4–5 REAL, specific photo locations in ${locationStr}.

Be hyper-specific — not generic viewpoints, but exact positions, exact compositions.

Rules:
- Real locations with exact names locals recognise
- "composition": exactly where to stand, what's in frame, how to frame it (2–3 sentences)
- "locals_tip": precisely WHERE pros/locals set up vs where tourist groups congregate
- "best_session": "golden_sunrise" | "golden_sunset" | "blue_sunrise" | "blue_sunset" | "midday" | "night"
- "light_note": why THIS specific light at THIS spot is special — what it does to the scene
- "lens": focal length + brief reason (e.g. "24mm — fits full arch and its reflection below")
- "avoid": what most tourists do wrong (wrong position, wrong time, wrong focal length)
- "area": neighbourhood/district within ${locationStr}

Return JSON: { "spots": [{ "name","area","composition","locals_tip","best_session","light_note","lens","avoid" }] }`,
        }, {
          role: 'user',
          content: `Location: ${locationStr}\nPhotographic intent: ${parsed.intent || 'general photography'}`,
        }],
      }),
      fetchSunTimes(centerGeo.lat, centerGeo.lng),
    ])

    const gen = JSON.parse(spotsComp.choices[0]?.message?.content ?? '{}') as { spots: Omit<PhotoSpot, 'lat'|'lng'|'display_name'>[] }
    const spots: PhotoSpot[] = await Promise.all((gen.spots ?? []).map(async s => {
      const geo = await geocode(`${s.name}, ${s.area}, ${locationStr}`)
        ?? await geocode(`${s.area}, ${locationStr}`)
      return { ...s, lat: geo?.lat ?? null, lng: geo?.lng ?? null, display_name: geo?.display_name ?? `${s.area}, ${locationStr}` }
    }))

    // Fallback sun times if API unavailable
    const sun: PhotoSunTimes = sunTimes ?? {
      date:            new Date().toISOString().split('T')[0],
      blue_am_start:   '05:10', blue_am_end:     '05:40',
      golden_am_start: '05:40', golden_am_end:   '06:40',
      golden_pm_start: '17:20', golden_pm_end:   '18:20',
      blue_pm_start:   '18:20', blue_pm_end:     '18:50',
    }

    return NextResponse.json({
      mode:       'photo_spots',
      parsed,
      spots,
      sun,
      map_center: { lat: centerGeo.lat, lng: centerGeo.lng, zoom: calcZoom(spots) },
    } as TripAskResponse)
  }

  // ── Local discovery ────────────────────────────────────────────────────────
  const localParsed: LocalDiscoveryParsed = {
    location: parseRaw.location ?? '',
    country:  parseRaw.country  ?? '',
    intent:   parseRaw.intent   ?? query,
  }
  if (!localParsed.location) return NextResponse.json({ error: 'Could not understand the location — try adding a city name' }, { status: 400 })
  const locationStr = localParsed.country ? `${localParsed.location}, ${localParsed.country}` : localParsed.location

  const discovComp = await openai.chat.completions.create({
    model: 'gpt-4o-mini', temperature: 0.75, response_format: { type: 'json_object' },
    messages: [{
      role: 'system',
      content: `Deeply knowledgeable local guide. Generate 4–6 REAL places in ${locationStr}.
Rules: Real names locals recognise. "story": 2–3 sentences, written like a local not a guidebook. "tagline": ≤12 words. Skip tourist traps.
Return JSON: { "places": [{ "name","area","type","story","tagline","price_range","best_time","insider_tip" }] }`,
    }, {
      role: 'user',
      content: `Find: ${localParsed.intent}\nLocation: ${locationStr}`,
    }],
  })
  const dGen = JSON.parse(discovComp.choices[0]?.message?.content ?? '{}') as { places: Omit<LocalPlace, 'lat'|'lng'|'display_name'>[] }
  const [placesGeo, centerGeo] = await Promise.all([
    Promise.all((dGen.places ?? []).map(async p => {
      const geo = await geocode(`${p.name}, ${p.area}, ${locationStr}`) ?? await geocode(`${p.area}, ${locationStr}`)
      return { ...p, lat: geo?.lat ?? null, lng: geo?.lng ?? null, display_name: geo?.display_name ?? `${p.area}, ${locationStr}` } as LocalPlace
    })),
    geocode(locationStr),
  ])
  const withCoords = placesGeo.filter(p => p.lat != null)
  const cLat = centerGeo?.lat ?? (withCoords.length ? withCoords.reduce((s, p) => s + p.lat!, 0) / withCoords.length : 0)
  const cLng = centerGeo?.lng ?? (withCoords.length ? withCoords.reduce((s, p) => s + p.lng!, 0) / withCoords.length : 0)
  return NextResponse.json({ mode: 'local_discovery', parsed: localParsed, places: placesGeo, map_center: { lat: cLat, lng: cLng, zoom: calcZoom(placesGeo) } } as TripAskResponse)
}
