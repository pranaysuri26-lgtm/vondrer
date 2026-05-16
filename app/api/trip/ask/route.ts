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
  type:           string   // brunch | coffee | scenic | food | activity | rest
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
  mode:         string   // car | bus | train | walk (transport mode)
  stop_types:   string[]
  vibes:        string[]
  dietary:      string[]
  travelers:    number | null
}

export interface LocalPlace {
  name:          string
  area:          string   // neighbourhood / district within the location
  type:          string   // e.g. "hole-in-the-wall snack stall", "hidden cove", "solo-friendly bar"
  story:         string   // 2–3 sentences: the real reason locals go, not guidebook copy
  tagline:       string   // ≤12 punchy words for the map pin popup
  price_range:   string   // $ | $$ | $$$
  best_time?:    string   // time of day or season
  insider_tip?:  string   // one specific practical tip a first-timer wouldn't know
  lat:           number | null
  lng:           number | null
  display_name:  string
}

export interface LocalDiscoveryParsed {
  location:  string   // city or area the user is asking about
  country:   string
  intent:    string   // concise description of what they want to find
}

export type TripAskResponse =
  | {
      mode:          'road_trip'
      parsed:        TripAskParsed
      stops:         TripStop[]
      route_summary: string
    }
  | {
      mode:          'local_discovery'
      parsed:        LocalDiscoveryParsed
      places:        LocalPlace[]
      map_center:    { lat: number; lng: number; zoom: number }
    }

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
  const span = Math.max(
    Math.max(...lats) - Math.min(...lats),
    Math.max(...lngs) - Math.min(...lngs)
  )
  if (span < 0.01) return 15
  if (span < 0.05) return 14
  if (span < 0.15) return 13
  if (span < 0.5)  return 12
  if (span < 1.5)  return 11
  return 9
}

// ─── POST /api/trip/ask ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
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
      content: `You are a travel query parser. Determine if this is a road trip (traveling FROM one place TO another) or a local discovery search (finding specific places within one city/area).

Return JSON — choose ONE format:

Road trip format:
{
  "query_mode": "road_trip",
  "origin": "full city/address as written",
  "destination": "full city/address",
  "transport": "car|bus|train|walk",
  "stop_types": ["brunch","coffee","scenic","food","activity","rest"],
  "vibes": ["relax","quick","scenic","lively","quiet"],
  "dietary": ["vegan","vegetarian","halal","gluten-free","kosher"],
  "travelers": number or null
}

Local discovery format:
{
  "query_mode": "local_discovery",
  "location": "city or specific area/neighbourhood",
  "country": "country name in English",
  "intent": "concise description of exactly what they want to find"
}

Use road_trip when the user is traveling BETWEEN two places.
Use local_discovery when the user wants to find places WITHIN one location.
For road trip, use empty arrays or null for missing fields.`,
    }, {
      role: 'user',
      content: query,
    }],
  })

  const parseRaw = JSON.parse(parseCompletion.choices[0]?.message?.content ?? '{}') as {
    query_mode: 'road_trip' | 'local_discovery'
    // road_trip fields
    origin?: string; destination?: string; transport?: string
    stop_types?: string[]; vibes?: string[]; dietary?: string[]; travelers?: number | null
    // local_discovery fields
    location?: string; country?: string; intent?: string
  }

  // ── Road trip path ────────────────────────────────────────────────────────
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

    const generateCompletion = await openai.chat.completions.create({
      model:           'gpt-4o-mini',
      temperature:     0.7,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'system',
        content: `You are a road trip guide. Generate 5–7 REAL, named places along a driving route.

Rules:
- All places must ACTUALLY EXIST and be accessible by car along this route
- Places must be geographically ordered (origin → destination)
- Include city and state so they can be accurately geocoded
- ${dietaryNote}
- Be specific: exact restaurant/café name, not generic descriptions
- "why" field: 1–2 sentences on exactly why it fits this specific request
- "dietary_fit": "Fully vegan" | "Strong vegan menu" | "Vegan options available" | "Ask kitchen" | ""
- "distance_note": "On route" or "[X] mi off [highway]"
- "open_note": any relevant hours info or ""
- "price_range": $ (under $15) | $$ ($15–30) | $$$ (30+)

Return JSON: {
  "route_summary": "origin → destination via [highway], approx [time]",
  "stops": [ { "name", "city", "state", "type", "why", "dietary_fit", "price_range", "distance_note", "open_note" } ]
}`,
      }, {
        role: 'user',
        content: `Route: ${parsed.origin} → ${parsed.destination} by ${parsed.mode || 'car'}
${stopTypesNote}
${vibesNote}
${dietaryNote}
${parsed.travelers ? `Group size: ${parsed.travelers} people` : ''}`,
      }],
    })

    const generated = JSON.parse(generateCompletion.choices[0]?.message?.content ?? '{}') as {
      route_summary: string
      stops: Omit<TripStop, 'lat' | 'lng' | 'display_name'>[]
    }

    const stops: TripStop[] = await Promise.all(
      (generated.stops ?? []).map(async (stop) => {
        const geo = await geocode(`${stop.name}, ${stop.city}, ${stop.state}`)
        return {
          ...stop,
          lat:          geo?.lat          ?? null,
          lng:          geo?.lng          ?? null,
          display_name: geo?.display_name ?? `${stop.city}, ${stop.state}`,
        }
      })
    )

    return NextResponse.json({
      mode:          'road_trip',
      parsed,
      stops,
      route_summary: generated.route_summary ?? `${parsed.origin} → ${parsed.destination}`,
    } as TripAskResponse)
  }

  // ── Local discovery path ──────────────────────────────────────────────────
  const localParsed: LocalDiscoveryParsed = {
    location: parseRaw.location ?? '',
    country:  parseRaw.country  ?? '',
    intent:   parseRaw.intent   ?? query,
  }

  if (!localParsed.location) {
    return NextResponse.json({ error: 'Could not understand the location — try adding a city name' }, { status: 400 })
  }

  const locationStr = localParsed.country
    ? `${localParsed.location}, ${localParsed.country}`
    : localParsed.location

  const discoveryCompletion = await openai.chat.completions.create({
    model:           'gpt-4o-mini',
    temperature:     0.75,
    response_format: { type: 'json_object' },
    messages: [{
      role: 'system',
      content: `You are a deeply knowledgeable local guide — not a tourist guide. Generate 4–6 REAL, specific places.

Rules:
- All places must ACTUALLY EXIST — use exact names locals would recognise
- Include the specific neighbourhood/area/district within the city
- "story": 2–3 sentences. The real reason this place matters. Write like a local, not a travel magazine.
- "tagline": ≤12 words. One punchy, specific line that captures the essence — for a map pin popup.
- Be opinionated. Skip tourist traps. These are genuine local finds.
- "type": specific (e.g. "hole-in-the-wall snack stall", "hidden cove", "old-school kissariat", "solo counter seat bar")
- "best_time": when to go (morning, dusk, winter only, etc.)
- "insider_tip": one very specific practical tip a first-timer wouldn't know
- "price_range": $ | $$ | $$$

Return JSON: {
  "places": [ { "name", "area", "type", "story", "tagline", "price_range", "best_time", "insider_tip" } ]
}`,
    }, {
      role: 'user',
      content: `Find: ${localParsed.intent}
Location: ${locationStr}`,
    }],
  })

  const discoveryGenerated = JSON.parse(discoveryCompletion.choices[0]?.message?.content ?? '{}') as {
    places: Omit<LocalPlace, 'lat' | 'lng' | 'display_name'>[]
  }

  // ── Geocode each place + location center ──────────────────────────────────
  const [placesGeo, centerGeo] = await Promise.all([
    Promise.all(
      (discoveryGenerated.places ?? []).map(async (place) => {
        // Try specific name first, fall back to area
        const geo = await geocode(`${place.name}, ${place.area}, ${locationStr}`)
          ?? await geocode(`${place.area}, ${locationStr}`)
        return {
          ...place,
          lat:          geo?.lat          ?? null,
          lng:          geo?.lng          ?? null,
          display_name: geo?.display_name ?? `${place.area}, ${locationStr}`,
        } as LocalPlace
      })
    ),
    geocode(locationStr),
  ])

  // Map center: use geocoded location, or fall back to centroid of places
  const placesWithCoords = placesGeo.filter(p => p.lat != null && p.lng != null)
  const centerLat = centerGeo?.lat
    ?? (placesWithCoords.length ? placesWithCoords.reduce((s, p) => s + p.lat!, 0) / placesWithCoords.length : 0)
  const centerLng = centerGeo?.lng
    ?? (placesWithCoords.length ? placesWithCoords.reduce((s, p) => s + p.lng!, 0) / placesWithCoords.length : 0)
  const zoom = calcZoom(placesGeo)

  return NextResponse.json({
    mode:       'local_discovery',
    parsed:     localParsed,
    places:     placesGeo,
    map_center: { lat: centerLat, lng: centerLng, zoom },
  } as TripAskResponse)
}
