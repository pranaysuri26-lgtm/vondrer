import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const maxDuration = 45

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TripStop {
  name:           string
  city:           string
  state:          string
  type:           string   // brunch | coffee | scenic | food | activity | rest
  why:            string   // specific reason this fits the request
  dietary_fit:    string   // "Fully vegan" | "Strong vegan options" | "Ask kitchen" | ""
  price_range:    string   // $ | $$ | $$$
  distance_note:  string   // "On route" | "0.4 mi off I-75"
  open_note:      string   // "Opens 8am" | "Closed Mondays" | ""
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

export interface TripAskResponse {
  parsed:        TripAskParsed
  stops:         TripStop[]
  route_summary: string
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

  // ── Step 1: Parse the natural language query ──────────────────────────────
  const parseCompletion = await openai.chat.completions.create({
    model:           'gpt-4o-mini',
    temperature:     0.2,
    response_format: { type: 'json_object' },
    messages: [{
      role: 'system',
      content: `Extract trip details from natural language. Return JSON:
{
  "origin": "full city/address as written",
  "destination": "full city/address",
  "mode": "car|bus|train|walk",
  "stop_types": ["brunch","coffee","scenic","food","activity","rest"],
  "vibes": ["relax","quick","scenic","lively","quiet"],
  "dietary": ["vegan","vegetarian","halal","gluten-free","kosher"],
  "travelers": number or null
}
If something isn't mentioned, use empty array or null.`
    }, {
      role: 'user',
      content: query,
    }],
  })

  const parsed = JSON.parse(parseCompletion.choices[0]?.message?.content ?? '{}') as TripAskParsed

  if (!parsed.origin || !parsed.destination) {
    return NextResponse.json({ error: 'Could not find a route — try "I\'m in [city], going to [city]"' }, { status: 400 })
  }

  // ── Step 2: Generate real stops along the route ───────────────────────────
  const dietaryNote = parsed.dietary.length
    ? `Group dietary needs: ${parsed.dietary.join(', ')}. Every suggestion MUST work for these needs.`
    : ''

  const stopTypesNote = parsed.stop_types.length
    ? `Looking for: ${parsed.stop_types.join(', ')}`
    : 'Looking for: interesting stops'

  const vibesNote = parsed.vibes.length
    ? `Vibe: ${parsed.vibes.join(', ')}`
    : ''

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
- "dietary_fit": how well it matches dietary needs ("Fully vegan", "Strong vegan menu", "Vegan options available", "Ask kitchen" or "" if no dietary needs)
- "distance_note": "On route" or "[X] mi off [highway]"
- "open_note": any relevant hours info or ""
- "price_range": $ (under $15) | $$ ($15-30) | $$$ (30+)

Return JSON: {
  "route_summary": "origin → destination via [highway], approx [time]",
  "stops": [ { "name", "city", "state", "type", "why", "dietary_fit", "price_range", "distance_note", "open_note" } ]
}`
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

  // ── Step 3: Geocode each stop via Nominatim ───────────────────────────────
  const stops: TripStop[] = await Promise.all(
    (generated.stops ?? []).map(async (stop) => {
      const geo = await geocode(`${stop.name}, ${stop.city}, ${stop.state}`)
      return {
        ...stop,
        lat:          geo?.lat ?? null,
        lng:          geo?.lng ?? null,
        display_name: geo?.display_name ?? `${stop.city}, ${stop.state}`,
      }
    })
  )

  return NextResponse.json({
    parsed,
    stops,
    route_summary: generated.route_summary ?? `${parsed.origin} → ${parsed.destination}`,
  } satisfies TripAskResponse)
}
