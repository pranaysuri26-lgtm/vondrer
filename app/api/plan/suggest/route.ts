import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const maxDuration = 30

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlanActivityCard {
  id:           string
  name:         string
  tagline:      string   // 3-6 word vibe descriptor
  why:          string   // 1 sentence — specific reason for this traveler
  category:     string   // emoji + label e.g. "🎨 Art & Culture"
  duration:     string   // e.g. "2–3 hours"
  price:        string   // "Free" | "$" | "$$" | "$$$"
  neighbourhood: string
  related_to?:  string   // "Near Wynwood Walls" — only when contextually relevant
}

export interface PlanAccommodation {
  neighbourhood: string
  why:           string   // specific sentence about their pick cluster
  price_range:   string   // e.g. "$120–200/night"
}

export interface SuggestResponse {
  cards:          PlanActivityCard[]
  accommodation?: PlanAccommodation
}

// ─── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM = `You are Voya's AI trip planner. Suggest specific, real experiences for a traveler building a personalised trip.

GEOGRAPHIC RULE:
Suggestions should primarily be within or very close to the destination city. You may include up to 2 classic day trips per round — places within ~2 hours that people commonly visit as part of a trip to this city (e.g. Santa Cruz, Muir Woods, Carmel-by-the-Sea, 17-Mile Drive from San Francisco; Windsor from London; the Hamptons from NYC). When you include a day trip, use the actual place name as the neighbourhood so the traveler knows it requires travel. Do NOT suggest generic suburban sprawl — only iconic, worth-the-drive destinations.

LANDMARK RULE — CRITICAL:
Round 1 MUST include the city's single most iconic landmark, done the non-tourist way (best time, angle, secret approach). Being "local" does NOT mean skipping famous spots — it means experiencing them right. Examples:
- San Francisco: Golden Gate Bridge (walk it at dawn from the south side, not the vista point lot)
- Paris: Eiffel Tower (Champ de Mars picnic at dusk, skip the queue for the view)
- New York: Brooklyn Bridge (walk east-to-west at sunrise, start in DUMBO)
Never omit the most iconic landmark of a city just because tourists visit it too.

PHOTOGRAPHY RULE:
Every round must include at least one photography/viewpoint spot — a place specifically great for sunrise, sunset, skyline shots, or unique compositions. Use the 📸 Photography category. Examples: "Twin Peaks Summit at Sunrise", "Bernal Hill for SF Skyline", "Palace of Fine Arts at Golden Hour".

WHAT TO SUGGEST — vary across these types every round:
• Named streets and pedestrian strips with specific stretches
• Walking districts and cultural zones
• Landmark experiences done the LOCAL way — the specific time, angle, approach that makes it non-tourist
• Specific food spots — one named restaurant or market
• Parks, beaches, waterfronts — named section with specific stretch
• Live music venues, markets, events — exact names
• Photography/viewpoint spots — named location with specific shot or time
• Classic day trips — iconic destinations within ~2 hours

NEVER suggest:
- Generic "explore [neighbourhood]" without a named street or specific spot
- Anything phrased as "visit the area" — always name the exact place
- A single unnamed "local restaurant" — always use a real name
- Boring suburban towns with nothing iconic to offer

CATEGORIES (pick the most accurate):
🏖️ Beach  🎨 Art & Culture  🍽️ Food & Drink  🌿 Nature  🌙 Nightlife  🏛️ History  🛍️ Shopping  🎭 Experience  🏃 Active  ☕ Cafe & Chill  🚶 Street & Walk  🚗 Day Trip  📸 Photography

Return ONLY a JSON object — no markdown, no explanation:
{
  "cards": [
    {
      "id": "unique-kebab-slug",
      "name": "Exact real name — street stretch, place, or experience",
      "tagline": "3-6 words capturing the vibe",
      "why": "One sentence: why this is worth it — specific to this destination and traveler, never generic",
      "category": "emoji + label e.g. '🚶 Street & Walk' or '📸 Photography'",
      "duration": "e.g. '1–2 hours' or 'Half day' or 'Full day' for day trips",
      "price": "Free or $ or $$ or $$$",
      "neighbourhood": "exact neighbourhood, or actual city/area name for day trips (e.g. 'Santa Cruz', 'Muir Woods')",
      "related_to": "ONLY if directly near or pairs with a picked activity — otherwise OMIT this field entirely"
    }
  ],
  "accommodation": {
    "neighbourhood": "best neighbourhood balancing activity cluster + budget tier + group type",
    "why": "one specific sentence: reference their activity areas AND why it fits their budget and travel style",
    "price_range": "realistic nightly range matching their budget tier"
  }
}

Rules:
- Return exactly 6 cards
- Omit the accommodation block entirely when the user has fewer than 3 picks
- Never repeat any place from the already-shown list
- "why" must never be a generic travel cliché — always name something specific about this destination`

// ─── POST /api/plan/suggest ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────────
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

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Parse body ────────────────────────────────────────────────────────────────
  const body = await req.json() as {
    destination:     string
    country:         string
    state_province?: string
    picked:          PlanActivityCard[]
    seen_names:      string[]   // all names shown so far (to avoid repeats)
    round:           number
    onboarding?: {
      home_city?:    string
      home_country?: string
      budget_per_day?: string
      group_type?:   string
      interests?:    string[]
    }
  }

  const { destination, country, state_province, picked, seen_names, round, onboarding } = body

  if (!destination || !country) {
    return NextResponse.json({ error: 'destination and country required' }, { status: 400 })
  }

  const location = state_province
    ? `${destination}, ${state_province}, ${country}`
    : `${destination}, ${country}`

  const BUDGET_MAP: Record<string, string> = {
    'under-20': 'budget traveler (under $20/day)',
    '20-50':    'budget-conscious ($20–50/day)',
    '50-150':   'mid-range ($50–150/day)',
    '150-300':  'comfortable ($150–300/day)',
    '300+':     'luxury ($300+/day)',
  }
  const budgetLabel = BUDGET_MAP[onboarding?.budget_per_day ?? '50-150'] ?? 'mid-range'

  // ── Build user prompt ─────────────────────────────────────────────────────────
  let userPrompt: string

  if (round === 1) {
    userPrompt = `Suggest activities for a trip to: ${location}

Traveler context:
- Home: ${onboarding?.home_city ? `${onboarding.home_city}, ` : ''}${onboarding?.home_country ?? 'not specified'}
- Budget: ${budgetLabel}
- Group: ${onboarding?.group_type ?? 'couple'}
${onboarding?.interests?.length ? `- Interests: ${onboarding.interests.join(', ')}` : ''}

This is Round 1. Suggest 6 diverse experiences that MUST include ALL of the following:
1. The city's single most iconic landmark/monument — done the non-tourist way (best angle, time, approach)
2. At least 1 photography/viewpoint spot (📸 Photography category) — sunrise, sunset, skyline or unique composition
3. At least 1 named street or pedestrian strip worth walking
4. At least 1 local food spot (specific named place)
5. At least 1 park/nature/waterfront spot (specific named section)
6. 1 classic day trip OR 1 evening/nightlife option

Spread across morning, afternoon and evening. Do NOT include the accommodation block in this round.
REMINDER: Golden Gate Bridge for SF, Eiffel Tower for Paris, Colosseum for Rome, etc. MUST appear in Round 1 — done the local way, not the tourist way.`
  } else {
    const pickedSummary   = picked.map(p => `"${p.name}" (${p.neighbourhood})`).join(', ')
    const clusterAreas    = [...new Set(picked.map(p => p.neighbourhood))].join(', ')
    const seenList        = seen_names.join(', ')

    const seenStr = seenList || 'none yet'

    userPrompt = `Suggest MORE activities for a trip to: ${location}

Traveler context:
- Home: ${onboarding?.home_city ? `${onboarding.home_city}, ` : ''}${onboarding?.home_country ?? 'not specified'}
- Budget: ${budgetLabel}
- Group: ${onboarding?.group_type ?? 'couple'}
${onboarding?.interests?.length ? `- Interests: ${onboarding.interests.join(', ')}` : ''}

Already PICKED (${picked.length} total): ${pickedSummary}
Their picks cluster around: ${clusterAreas}

Already SHOWN — do NOT repeat any of these: ${seenStr}

Round ${round}. Suggest 6 MORE activities that:
1. Complement their picks — geographically nearby OR thematically related
2. MUST include at least 1 📸 Photography/viewpoint spot if none have been shown yet
3. MUST include at least 1 🚗 Day Trip if none have been shown yet (e.g. Carmel, 17-Mile Drive, Muir Woods for SF)
4. Cover categories and areas not yet well-represented
5. Include a mix of streets/walks, food spots, and experiences — not just standalone buildings
6. Never repeat anything from the "already shown" list
${picked.length >= 3
  ? `\nUser has 3+ picks — include the accommodation block. The neighbourhood should:
  - Be central to their pick cluster (${clusterAreas})
  - Match their ${budgetLabel} budget tier
  - Suit their group type: ${onboarding?.group_type ?? 'couple'}
  Explain all three factors in the "why" field.`
  : '\nDo NOT include the accommodation block yet.'}`
  }

  // ── Call OpenAI ───────────────────────────────────────────────────────────────
  try {
    const completion = await openai.chat.completions.create({
      model:            'gpt-4o-mini',
      temperature:      0.85,
      max_tokens:       2000,
      response_format:  { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user',   content: userPrompt },
      ],
    })

    const raw    = completion.choices[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(raw) as SuggestResponse

    // Ensure every card has a stable unique id
    const cards = (parsed.cards ?? []).map((c, i) => ({
      ...c,
      id: c.id || `r${round}-${i}-${Date.now()}`,
    }))

    return NextResponse.json({
      cards,
      accommodation: parsed.accommodation,
    } satisfies SuggestResponse)

  } catch (err) {
    console.error('[Plan Suggest]', err)
    return NextResponse.json({ error: 'Failed to generate suggestions' }, { status: 500 })
  }
}
