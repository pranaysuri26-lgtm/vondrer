import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const maxDuration = 60

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Cache TTL: 14 days. Guide content is evergreen — neighbourhoods and food
// spots don't change week-to-week. Regenerate only when stale or missing.
const CACHE_TTL_DAYS = 14

function cacheKey(destination: string, country: string, state_province?: string): string {
  const parts = [destination, state_province, country]
    .filter(Boolean)
    .map(s => s!.toLowerCase().trim())
  return parts.join('|')
}

export interface GuideNeighbourhood {
  name:       string
  vibe:       string   // 2-sentence character description
  best_for:   string   // who it suits and when
  dont_miss:  string   // one specific thing most visitors skip
  local_eat:  string   // one specific spot locals actually go to
}

export interface GuideFoodSpot {
  name:          string
  neighbourhood: string
  type:          string   // e.g. "tacos al pastor", "natural wine bar", "kopitiam"
  why:           string   // one line — why locals go, not tourists
  order_this:    string   // the specific thing to get
  price:         string   // e.g. "$", "$$", "$$$"
}

export interface GuideInsiderTip {
  tip:     string
  detail:  string
}

export interface GuideAccommodationOption {
  type:         string
  name?:        string | null
  price_range:  string
  book_via:     string
  booking_url?: string | null
  why:          string
  book_ahead?:  string
}

export interface GuideAccommodation {
  primary_type:           string
  primary_recommendation: GuideAccommodationOption
  alternative?:           { type: string; price_range: string; book_via: string; note: string } | null
  avoid?:                 string | null
  neighbourhood_advice?:  string | null
  platforms: {
    booking_com: 'strong' | 'limited' | 'not_recommended'
    airbnb:      'strong' | 'limited' | 'not_available'
    direct:      'recommended' | 'required' | 'optional'
  }
}

export interface GuideAirport {
  iata:          string   // e.g. "MIA"
  name:          string   // e.g. "Miami International"
  distance_km:   number   // from city centre
  transfer_time: string   // e.g. "25–40 min by taxi"
  transfer_cost: string   // e.g. "$30–45 taxi, $2.65 Metrorail"
  best_for:      string   // e.g. "Direct intercontinental + domestic"
  airlines:      string   // key carriers e.g. "American, Delta, United, LATAM"
  verdict:       string   // one-line honest take e.g. "Main hub — best connections, pricier fares"
  is_primary:    boolean  // true for the main recommended option
}

export interface LocalGuide {
  destination:    string
  country:        string
  state_province?: string
  intro:          string
  airports:       GuideAirport[]
  neighbourhoods: GuideNeighbourhood[]
  food_spots:     GuideFoodSpot[]
  insider_tips:   GuideInsiderTip[]
  skip_these:     string[]
  accommodation?: GuideAccommodation
}

const SYSTEM = `You are a local guide writer for Voya — a travel app that shows the side of cities most visitors never see.
Your voice: direct, specific, never generic. Zero filler. You write like a local friend who knows the city deeply.

RULES:
- Every spot must be real and specific — named places, specific dishes, actual neighbourhood names.
- Never write anything that could appear on TripAdvisor's front page or a generic travel blog.
- food_spots must be places locals genuinely eat — not restaurants that appear on every "best of" list.
- neighbourhoods must be described through what they feel like on foot, not their Wikipedia summary.
- insider_tips must be things a tourist would never figure out on their own.
- skip_these should be honest — specific tourist traps that locals actively avoid and why.
- All text should be punchy, specific, and under 2 sentences per field unless instructed otherwise.

OUTPUT: Return a single valid JSON object matching this schema exactly:
{
  "intro": "2-3 sentences. The soul of the city — what makes it unlike anywhere else.",
  "airports": [
    {
      "iata": "3-letter IATA code",
      "name": "full airport name",
      "distance_km": <number — km from city centre>,
      "transfer_time": "realistic door-to-centre time e.g. '25–40 min by taxi'",
      "transfer_cost": "cheapest + mid option e.g. '$2.65 Metrorail or $35–50 taxi'",
      "best_for": "one line — which travellers should use this airport and why",
      "airlines": "key carriers that fly here",
      "verdict": "one honest sentence — the real tradeoff vs other options",
      "is_primary": true/false — true for the single best default choice
    }
  ],
  "neighbourhoods": [
    {
      "name": "neighbourhood name",
      "vibe": "2 sentences. What it feels like to walk through it on a Tuesday afternoon.",
      "best_for": "one sentence — who it's perfect for and in what context",
      "dont_miss": "one specific thing — a street, market, viewpoint, or moment most visitors completely miss",
      "local_eat": "one specific named place locals eat at — not the famous one, the real one"
    }
  ],
  "food_spots": [
    {
      "name": "exact name of the place",
      "neighbourhood": "which neighbourhood",
      "type": "what kind of food/drink — be specific",
      "why": "one line — why locals go here, what makes it real",
      "order_this": "the specific thing to get",
      "price": "$" | "$$" | "$$$"
    }
  ],
  "insider_tips": [
    {
      "tip": "short title — 5 words max",
      "detail": "one specific, actionable sentence"
    }
  ],
  "skip_these": ["specific tourist trap — one line each including why locals avoid it"],
  "accommodation": {
    "primary_type": "government_property" | "homestay" | "guesthouse" | "hotel" | "hostel" | "resort" | "camp" | "airbnb",
    "primary_recommendation": {
      "type": "specific type e.g. 'KMVN Tourist Rest House', 'Beach hut guesthouse', 'Boutique riad'",
      "name": "specific property name if you know one, else null",
      "price_range": "in local currency e.g. '₹1,500–2,800/night', '$120–200/night', '€80–140/night'",
      "book_via": "actual platform e.g. 'kmvn.gov.in', 'Booking.com', 'Airbnb', 'direct'",
      "booking_url": "direct URL if applicable, else null",
      "why": "one line — what makes this the right choice for this specific destination",
      "book_ahead": "booking window advice e.g. 'Book 2 weeks ahead for weekends'"
    },
    "alternative": { "type": "...", "price_range": "...", "book_via": "...", "note": "one line" } or null,
    "avoid": "one line on what to avoid and why" or null,
    "neighbourhood_advice": "which area/neighbourhood to stay in and why" or null,
    "platforms": {
      "booking_com": "strong" | "limited" | "not_recommended",
      "airbnb": "strong" | "limited" | "not_available",
      "direct": "recommended" | "required" | "optional"
    }
  }
}

ACCOMMODATION RULES:
- Indian hill stations (Lansdowne, Chakrata, Dhanaulti, Kasauli, etc.): primary_type=government_property, book_via=state tourism board (kmvn.gov.in/gmvn.gov.in/hptdc.nic.in), platforms.airbnb=not_available, platforms.direct=required. Name the actual KMVN/GMVN/HPTDC property if it exists.
- Remote Indian destinations (Spiti, Ziro, Tawang, Majuli): primary_type=homestay, book_via=local operators, platforms.booking_com=limited, platforms.airbnb=not_available, platforms.direct=required
- Major Indian cities: primary_type=hotel, booking_com=strong, airbnb=strong
- International cities: booking_com=strong, neighbourhood_advice required
- Japan: mention ryokan if appropriate, book via jalan.net or japanican.com
- Southeast Asia: Agoda.com strong, mention old-town guesthouse option

AIRPORT RULES:
- CRITICAL: Only include airports that have ACTIVE, REGULAR scheduled commercial passenger service right now. Never include airports that are defunct, closed, rarely used, or serve only charter/military/emergency flights.
- If a city's nearest airport has very limited or no scheduled service (e.g. Kota/KTU, small regional airstrips), DO NOT list it. Instead list the nearest practical airport with real scheduled flights (e.g. Jaipur/JAI or Udaipur/UDR for Kota).
- Always include ALL airports within ~150km that have meaningful scheduled service — never just the main one.
- Common multi-airport cities: Miami (MIA + FLL), London (LHR/LGW/STN/LTN/LCY), Paris (CDG/ORY), New York (JFK/LGA/EWR), LA (LAX/BUR/LGB/ONT/SNA), Rome (FCO/CIA), Tokyo (NRT/HND), Bangkok (BKK/DMK), Kuala Lumpur (KUL/SZB), Chicago (ORD/MDW), Delhi (DEL only — one airport), Mumbai (BOM only — one airport).
- For single-airport cities (or cities where you fly into a nearby city), return an array with just that one best airport (is_primary: true).
- is_primary should be true for the airport with the best overall balance of price + convenience for most travellers. Only one airport should have is_primary: true.
- transfer_cost must name the cheapest public transport option first, then taxi/rideshare. Include overland transfer time/distance if flying into a nearby city.
- verdict must be honest about negatives — e.g. "No direct airport; fly into Jaipur (JAI, 240 km, ~4 hr by road) or take a train from Delhi."

Return 2–4 airports (all relevant ones), 4 neighbourhoods, 6 food spots, 5 insider tips, 3 skip_these items, 1 accommodation object.
No markdown. No explanation before or after. Just the JSON object.`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      destination:    string
      country?:       string
      state_province?: string
    }

    if (!body.destination?.trim()) {
      return NextResponse.json({ error: 'destination required' }, { status: 400 })
    }

    // If country is missing, try to infer it from the destination string.
    // e.g. "Kota, Rajasthan, India" → country = "India", destination = "Kota"
    let destination   = body.destination.trim()
    let country       = body.country?.trim() ?? ''
    let state_province = body.state_province?.trim()

    if (!country) {
      const parts = destination.split(',').map(p => p.trim()).filter(Boolean)
      if (parts.length >= 2) {
        destination    = parts[0]
        country        = parts[parts.length - 1]
        state_province = state_province ?? (parts.length >= 3 ? parts[parts.length - 2] : undefined)
      } else {
        // Last resort — pass full string as destination, leave country blank
        // GPT can still generate a guide with partial info
        country = destination
      }
    }

    // ── Supabase client (anon key — no auth required for guide cache) ──────────
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

    const key = cacheKey(destination, country, state_province)
    const cutoff = new Date(Date.now() - CACHE_TTL_DAYS * 86400_000).toISOString()

    // ── Cache hit ─────────────────────────────────────────────────────────────
    const { data: cached } = await supabase
      .from('guide_cache')
      .select('guide')
      .eq('cache_key', key)
      .gte('generated_at', cutoff)
      .single()

    if (cached?.guide) {
      console.log(`[Guide] Cache hit: ${key}`)
      return NextResponse.json(cached.guide)
    }

    // ── Generate fresh ────────────────────────────────────────────────────────
    console.log(`[Guide] Generating fresh: ${key}`)
    const location = state_province
      ? `${destination}, ${state_province}, ${country}`
      : `${destination}, ${country}`

    const completion = await openai.chat.completions.create({
      model:       'gpt-4o-mini',
      temperature: 0.7,
      max_tokens:  4000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `Write a local intel guide for: ${location}

Focus entirely on what locals actually do — not what tourists come for.
The reader has likely already googled the basics. Skip everything that appears on the city's Wikipedia page.
Give them the city that exists underneath the tourist layer.`,
        },
      ],
    })

    const raw = completion.choices[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(raw) as Omit<LocalGuide, 'destination' | 'country' | 'state_province'>

    const guide: LocalGuide = {
      destination,
      country,
      state_province: state_province || undefined,
      ...parsed,
    }

    // ── Write to cache (fire-and-forget — never block the response) ───────────
    supabase
      .from('guide_cache')
      .upsert(
        { cache_key: key, guide, generated_at: new Date().toISOString() },
        { onConflict: 'cache_key' }
      )
      .then(() => {})

    return NextResponse.json(guide)
  } catch (err) {
    console.error('[Guide API]', err)
    return NextResponse.json({ error: 'Failed to generate guide' }, { status: 500 })
  }
}
