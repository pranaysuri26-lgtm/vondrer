import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { BUDGET_LABELS } from '@/lib/currency'

export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ItineraryBlock {
  activity:       string
  description:    string
  insider_tip:    string
  estimated_cost: string
}

export interface ItineraryDay {
  day:                 number
  title:               string
  morning:             ItineraryBlock
  afternoon:           ItineraryBlock
  evening:             ItineraryBlock
  day_total_estimate:  string
}

export interface ItineraryResult {
  destination: string
  country:     string
  days:        number
  start_date:  string
  end_date:    string
  itinerary:   ItineraryDay[]
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

interface FlightDetails {
  arrival_date?:    string
  arrival_time?:    string
  departure_date?:  string
  departure_time?:  string
  flight_number?:   string
}

interface ItineraryRequest {
  destination:   string
  country:       string
  days:          number
  start_date:    string
  user_profile?: {
    budget_per_day?:      string
    group_type?:          string
    interests?:           string[]
    dietary_preferences?: string[]
    home_city?:           string
    home_country?:        string
  }
  group?:        GroupComposition
  flights?:      FlightDetails
  user_plans?:   string
}

// ─── Budget day totals ────────────────────────────────────────────────────────

const BUDGET_DAY_TOTALS: Record<string, string> = {
  'under-20': 'under $30 total per person per day',
  '20-50':    '$30–$60 total per person per day',
  '50-150':   '$60–$150 total per person per day',
  '150-300':  '$150–$300 total per person per day',
  '300+':     '$300+ per person per day — lead with quality',
}

// ─── Airport transit lookup ───────────────────────────────────────────────────

const AIRPORT_TRANSIT: Record<string, string> = {
  'san francisco': 'SFO → BART 45 min to downtown or drive 30 min',
  'miami':         'MIA → rideshare 25–40 min to South Beach / Downtown',
  'atlanta':       'ATL → MARTA 45 min to downtown or rideshare 30 min',
  'new york':      'JFK → AirTrain + subway ~1h or Lyft 45–60 min',
  'los angeles':   'LAX → FlyAway bus or rideshare 30–60 min (traffic dependent)',
  'chicago':       "ORD → Blue Line El 45 min or rideshare 30–45 min",
  'london':        'LHR → Elizabeth line 30 min to central London',
  'paris':         'CDG → RER B 35 min to city centre',
  'tokyo':         'NRT → Narita Express 60 min or Skyliner 41 min',
  'sydney':        'SYD → Train 13 min to central or rideshare 20 min',
}

function getAirportTransit(dest: string): string {
  return AIRPORT_TRANSIT[dest.toLowerCase().trim()] ?? `check Google Maps for transit from airport`
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(body: ItineraryRequest): { system: string; user: string } {
  const { destination, country, days, start_date, user_profile, group, flights, user_plans } = body

  const budget      = user_profile?.budget_per_day ?? '50-150'
  const groupType   = user_profile?.group_type     ?? 'couple'
  const interests   = (user_profile?.interests     ?? []).join(', ')
  const dietary     = (user_profile?.dietary_preferences ?? []).filter(p => p !== 'none')
  const homeCity    = user_profile?.home_city      ?? ''
  const homeCountry = user_profile?.home_country   ?? ''
  const budgetLabel = BUDGET_LABELS[budget] ?? budget
  const dayTotal    = BUDGET_DAY_TOTALS[budget] ?? '$60–$150 per person per day'

  const startMs   = new Date(start_date).getTime()
  const endDate   = new Date(startMs + (days - 1) * 86400000).toISOString().split('T')[0]

  // ── Group context ────────────────────────────────────────────────────────────
  const travelerCount = group?.traveler_count ?? (groupType === 'solo' ? 1 : 2)
  const hasElderly    = group?.includes_elderly   ?? false
  const hasChildren   = group?.includes_children  ?? false
  const hasTeen       = group?.includes_teenagers ?? false
  const vegCount      = group?.dietary_some_veg ? (group.vegetarian_count ?? 0) : 0
  const nonVegCount   = travelerCount - vegCount
  const hasMixedDiet  = vegCount > 0 && nonVegCount > 0
  const isHalal       = group?.dietary_halal      ?? false
  const isGlutenFree  = group?.dietary_gluten_free ?? false
  const isLargeGroup  = travelerCount >= 5

  // ── Group context section ────────────────────────────────────────────────────
  const groupSection = `
GROUP CONTEXT:
Travelers: ${travelerCount} people
Composition: ${[
    group?.includes_adults   ? 'adults'              : null,
    hasChildren              ? 'children under 12'   : null,
    hasTeen                  ? 'teenagers 12–17'     : null,
    hasElderly               ? 'elderly (65+)'       : null,
  ].filter(Boolean).join(', ') || 'adults'}
${vegCount > 0 ? `Dietary split: ${vegCount} vegetarian/vegan out of ${travelerCount} total` : ''}
${isHalal ? 'Dietary: halal required' : ''}
${isGlutenFree ? 'Dietary: gluten free required' : ''}`

  // ── Mixed dietary rules ──────────────────────────────────────────────────────
  const mixedDietSection = hasMixedDiet ? `
MIXED DIETARY GROUP — CRITICAL:
This group has ${vegCount} vegetarian/vegan AND ${nonVegCount} non-vegetarian traveler(s).

Every restaurant MUST serve BOTH groups genuinely well from the same menu.
Never recommend a restaurant that only serves one dietary group.

Test every restaurant recommendation:
✓ Does it have genuinely good vegan/vegetarian options? (not just a side salad)
✓ Does it have genuinely good meat/fish options?
✓ Would BOTH groups feel the restaurant was chosen for them?
If a restaurant fails this test — do not recommend it.

Good examples of mixed-dietary restaurants:
- Mediterranean (falafel + grilled meats on same menu)
- Indian (huge vegetarian selection + curries for all)
- Thai/Vietnamese (tofu + meat/seafood options throughout)
- Modern American with vegetable-forward AND protein mains
- Tex-Mex (bean options + meat options equally good)

BAD examples (avoid):
- Pure steakhouse (vegetarians get one option, an afterthought)
- Pure vegan restaurant (non-vegetarians feel penalized)
- Sushi-only (limited for vegans)` : ''

  // ── Elderly rules ────────────────────────────────────────────────────────────
  const elderlySection = hasElderly ? `
ELDERLY TRAVELERS — MANDATORY ACCESSIBILITY NOTES:
Group includes elderly travelers (65+). For EVERY activity:
1. State walking distance in minutes (must be under 15 min on flat ground OR provide Uber/taxi alternative)
2. Flag steep hills or uneven terrain explicitly — never omit
3. Note seating availability at venues
4. Note accessible entrance where relevant

For San Francisco specifically — NEVER recommend without accessibility note:
- Any steep hill neighbourhood on foot
- Battery Spencer (uphill walk — Uber instead)
- Lands End Trail (uneven coastal terrain — alternative: Sutro Baths from the flat car park)
- Twin Peaks (no direct transit — car only)

ALWAYS provide two options when activity is demanding:
"While others hike, elderly travelers can enjoy [flat alternative at same location]"

Every day must include at least one elderly-friendly rest stop (café, bench with view, etc.).` : ''

  // ── Children rules ───────────────────────────────────────────────────────────
  const childrenSection = hasChildren ? `
CHILDREN IN GROUP:
Group includes children under 12.
- Prioritize free/low-cost activities kids enjoy (beaches, playgrounds, open markets, wildlife)
- Keep activities under 2 hours each — children lose interest quickly
- Flag venues with kids' menus
- Avoid late evening activities after 9pm for the group as a whole` : ''

  // ── Group cost rules ─────────────────────────────────────────────────────────
  const costSection = travelerCount >= 3 ? `
GROUP COST RULES — MANDATORY:
ALWAYS show TWO cost lines for every activity and meal:
  Per person: $X
  Group total (${travelerCount} people): $Y

Never show only per-person costs. Show both, always.` : `
COST RULES:
Show estimated cost per person for every activity and meal.`

  // ── Large group booking rules ─────────────────────────────────────────────────
  const largeGroupSection = isLargeGroup ? `
LARGE GROUP RULES (group of ${travelerCount}):
Every dinner recommendation MUST include:
"Reservation required — book [X] weeks ahead for a group of ${travelerCount}"
Never suggest "arrive early" as the solution. Large groups cannot walk in anywhere.
Prioritize restaurants that explicitly take large group reservations.
Note: most walk-in places will not accommodate ${travelerCount} people without notice.` : ''

  // ── Halal rules ──────────────────────────────────────────────────────────────
  const halalSection = isHalal ? `
HALAL REQUIREMENTS:
Only recommend halal-certified or clearly halal restaurants.
Flag halal certification where known.
Never recommend venues that serve alcohol as the primary draw (OK to mention they serve halal food at a venue with bar, but be explicit).` : ''

  // ── Gluten-free rules ─────────────────────────────────────────────────────────
  const gfSection = isGlutenFree ? `
GLUTEN-FREE REQUIREMENTS:
Every meal recommendation must clearly state gluten-free options available.
Never recommend a venue where GF is difficult or unavailable.` : ''

  // ── Flight arrival/departure rules ───────────────────────────────────────────
  const arrivalTime     = flights?.arrival_time   ?? null
  const departureTime   = flights?.departure_time ?? null
  const arrivalDate     = flights?.arrival_date   ?? null
  const departureDate   = flights?.departure_date ?? null
  const transit         = getAirportTransit(destination)

  let flightSection = ''
  if (arrivalTime && arrivalDate) {
    const [hr, min] = arrivalTime.split(':').map(Number)
    const arrivalMins = hr * 60 + min
    const startMins   = arrivalMins + 90 // 1.5 hr buffer for transit + check-in
    const startHr     = Math.floor(startMins / 60) % 24
    const startMin    = startMins % 60
    const startStr    = `${startHr.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}`
    const isAfternoon = hr >= 12

    flightSection += `
ARRIVAL RULES (Day 1 — ${arrivalDate}):
Flight arrives at ${arrivalTime}. First activity starts no earlier than ${startStr} (allowing 1.5 hours for transit and check-in).
Transit note for itinerary: ${transit}
${isAfternoon ? 'Arrival is in the afternoon — Day 1 should have AFTERNOON and EVENING activities only. Morning block: "Arrival, transit, and check-in." No morning sightseeing.' : ''}
${hr >= 17 ? 'Late arrival — Day 1 evening only. Morning: arrival context. Afternoon: arrival. Evening: light first-night dinner near hotel.' : ''}`
  }

  if (departureTime && departureDate) {
    const [hr, min] = departureTime.split(':').map(Number)
    const depMins   = hr * 60 + min
    const latestMins = depMins - 180 // 3 hr before flight
    const latestHr   = Math.floor(latestMins / 60)
    const latestMin  = latestMins % 60
    const latestStr  = latestHr >= 0
      ? `${latestHr.toString().padStart(2, '0')}:${latestMin.toString().padStart(2, '0')}`
      : 'morning'

    flightSection += `
DEPARTURE RULES (Last day — ${departureDate}):
Flight departs at ${departureTime}. Last activity must end by ${latestStr} (3 hours before flight).
Include airport transit note: ${transit}
Last day morning: light activity or breakfast near hotel — no full-day itinerary.`
  }

  // ── User's existing plans ─────────────────────────────────────────────────────
  const userPlansSection = user_plans ? `
USER'S EXISTING PLANS — READ CAREFULLY:
The user has told Voya: "${user_plans}"

MANDATORY RULES:
1. Keep EVERYTHING the user specified. Never remove or replace their plans.
2. Build AROUND their plans. Fill the gaps. Don't duplicate what they've mentioned.
3. If user mentions rental car or driving:
   - Suggest drive-friendly activities
   - Never suggest public transit for activities easier by car
   - For San Francisco + rental car: 17 Mile Drive is mandatory if not already mentioned
4. If user mentions landing/arrival time: start Day 1 from that time
5. VALIDATE user decisions in the itinerary text:
   Good: "Smart choice for arrival day — [venue] is flat, accessible, perfect for a tired group"
6. FLAG conflicts gently: "Note: this is a full day — consider splitting if with elderly travelers"
7. Never assume transport mode — if user has rental car, don't suggest BART
8. If user mentions a hotel area (Mission District, South Beach, etc.):
   - Cluster Day 1 activities near that area to minimize tired-traveler transit` : ''

  // ── Companion rules ───────────────────────────────────────────────────────────
  const companionSection = groupType === 'couple' && travelerCount <= 2 ? `
COUPLE FRAMING: Write for two people. "You and your partner…" Include one romantic element per day.` :
    groupType === 'solo' ? `SOLO FRAMING: Write for solo travel. Easy to do alone. Good spots to meet other travelers.` :
    travelerCount > 2 ? `GROUP FRAMING: Write for ${travelerCount} people. Group-friendly venues throughout.` : ''

  // ── Beach cities rule ─────────────────────────────────────────────────────────
  const beachDests = ['miami', 'sydney', 'barcelona', 'bali', 'goa', 'cancun', 'lisbon', 'dubai', 'gold coast', 'tel aviv']
  const isBeach = beachDests.some(b => destination.toLowerCase().includes(b)) ||
    country.toLowerCase().includes('maldives') || country.toLowerCase().includes('fiji')
  const beachSection = isBeach ? `
BEACH RULE: ${destination} is a beach destination. ALWAYS include beach time — minimum one session per trip.
Morning beach is ideal: cooler, better light, fewer crowds.
Beach is free, accessible, works for all dietary needs, works for all group sizes.
Never skip beach in a beach city.` : ''

  // ── City-specific intelligence ────────────────────────────────────────────────
  let cityIntelSection = ''
  const destLower = destination.toLowerCase()

  if (destLower.includes('san francisco') || destLower === 'sf') {
    const hasCarInPlans = user_plans?.toLowerCase().includes('rental car') ||
                          user_plans?.toLowerCase().includes('car') ||
                          user_plans?.toLowerCase().includes('drive')
    cityIntelSection = `
SAN FRANCISCO SPECIFIC INTELLIGENCE:
${hasCarInPlans ? `USER HAS A RENTAL CAR — mandatory 17 Mile Drive day:
Route: SF → Pacific Grove → 17 Mile Drive (Lone Cypress, Pebble Beach, Bird Rock) → Carmel-by-the-Sea lunch → Optional: Big Sur 30 min further → Return via Highway 1.
Entry fee: $12.25 per car.
Best lunch for mixed dietary groups: Dametra Cafe, Carmel — Mediterranean menu with excellent vegetarian AND non-vegetarian options. Call ahead for groups of 5+.
Why this works for elderly: mostly a drive, minimal walking, can stay in car at any stop.` : ''}

Pier 39 & Ghirardelli on arrival day:
If mentioned in user plans, validate: "Smart arrival day choice — flat, accessible, no advance planning needed."
Sea lions at Pier 39 are free and universally enjoyed.
Ghirardelli chocolate: note for vegans — check with staff for dairy-free options.

Good group dinner options: Fog Harbor Fish House (Pier 39, bookable for large groups, mixed dietary).
Neighborhoods: Mission District (diverse food, good for mixed dietary groups), Ferry Building (weekend farmers market), Fisherman's Wharf (touristy but family-friendly).`
  }

  if (destLower.includes('miami')) {
    cityIntelSection += `
MIAMI SPECIFIC INTELLIGENCE:
South Beach Lummus Park (5th–10th Street section): less touristy, more local, flat and accessible for elderly, free.
ALWAYS include South Beach on Day 1 morning or as primary afternoon activity.
Wynwood Walls: flat, walkable, excellent for all groups. Free street art viewing.
Good mixed-dietary restaurants: Mandolin Aegean Bistro (Mediterranean, excellent veg + meat), Lung Yai Thai Tapas, KYU.
For large groups: make reservations — Miami restaurants fill up quickly especially weekends.`
  }

  // ── System prompt ─────────────────────────────────────────────────────────────
  const system = `You are a travel itinerary expert for Voya. Generate a day-by-day plan.
Return ONLY a valid JSON array of day objects. No markdown. No explanation. No wrapper.

Schema per day:
{
  "day": number,
  "title": "evocative title — never just 'Day 1'",
  "morning": {
    "activity": "specific real place name",
    "description": "2-3 sentences — what to do, why it's worth it",
    "insider_tip": "genuinely useful local knowledge",
    "estimated_cost": "$X per person${travelerCount >= 3 ? ` / $${travelerCount}X group total` : ''}"
  },
  "afternoon": { same structure },
  "evening": { same structure },
  "day_total_estimate": "$X–$Y per person${travelerCount >= 3 ? ` (group: $${travelerCount}×)` : ''}"
}

ABSOLUTE RULES:
- SPECIFIC real place names only — never "a local restaurant" or "a park"
- Every activity must be real and currently operating
- Day titles must be evocative: "Arrival & Wynwood After Dark" ✓, "Day 1" ✗
- Budget must match the traveler tier throughout
- Every restaurant must serve something this group can eat
- Day 1 morning: light if arrival day — no forcing full tourism before check-in

${groupSection}
${mixedDietSection}
${elderlySection}
${childrenSection}
${costSection}
${largeGroupSection}
${halalSection}
${gfSection}
${flightSection}
${userPlansSection}
${companionSection}
${beachSection}
${cityIntelSection}`

  const userPrompt = `Generate a ${days}-day itinerary for ${destination}, ${country}.

Dates: ${start_date} to ${endDate}

Traveler profile:
- Home: ${homeCity ? `${homeCity}, ${homeCountry}` : homeCountry || 'not specified'}
- Budget: ${budgetLabel} (${dayTotal})
- Group: ${travelerCount} people — ${groupType}
${interests ? `- Interests: ${interests}` : ''}
${dietary.length > 0 ? `- Dietary (from profile): ${dietary.join(', ')}` : ''}

Return the JSON array of ${days} day objects. Nothing else.`

  return { system, user: userPrompt }
}

// ─── POST /api/itinerary ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────────
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
  let body: ItineraryRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.destination || !body.country || !body.days || !body.start_date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { system, user: userPrompt } = buildPrompt(body)

  const startMs = new Date(body.start_date).getTime()
  const endDate = new Date(startMs + (body.days - 1) * 86400000).toISOString().split('T')[0]

  try {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-5',
      max_tokens: 5000,
      system,
      messages:   [{ role: 'user', content: userPrompt }],
    })

    const raw     = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

    let itinerary: ItineraryDay[]
    try {
      itinerary = JSON.parse(cleaned)
      if (!Array.isArray(itinerary)) throw new Error('Expected array')
    } catch {
      console.error('[Itinerary] Parse error. Raw:', raw.slice(0, 500))
      return NextResponse.json({ error: 'Itinerary generation failed — please try again.' }, { status: 500 })
    }

    const result: ItineraryResult = {
      destination: body.destination,
      country:     body.country,
      days:        body.days,
      start_date:  body.start_date,
      end_date:    endDate,
      itinerary,
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[Itinerary] Claude error:', err)
    return NextResponse.json({ error: 'Itinerary generation failed — please try again.' }, { status: 500 })
  }
}
