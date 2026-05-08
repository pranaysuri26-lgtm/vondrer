import crypto from 'crypto'
import { BUDGET_LABELS } from '@/lib/currency'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OnboardingData {
  home_country:         string    // e.g. 'United States', 'India', 'Australia'
  home_city?:           string    // e.g. 'Sydney', 'Delhi', 'London'
  travel_scope?:        string    // 'anywhere' | 'closer'
  budget_per_day:       string    // 'under-20' | '20-50' | '50-150' | '150-300' | '300+'
  trip_duration:        string    // 'weekend' | '1-week' | '2-weeks' | 'month+'
  group_type:           string    // 'solo' | 'couple' | 'small-group'
  interests:            string[]  // ['hidden-gems','local-food','adventure','culture','slow-travel','photography']
  offbeat_score:        number    // 1–5
  dietary_preferences?: string[]  // ['vegetarian','vegan','halal','kosher','gluten-free','no-pork','no-beef','pescatarian','none']
  trip_timing?:         string    // 'next_month' | '2_3_months' | 'exploring' — when they plan to travel
}

export interface PastTrip {
  destination_name: string
}

export interface UpcomingEvent {
  name:        string  // festival or event name
  when:        string  // month e.g. "November"
  what:        string  // one-line description
  crowd_level: 'local' | 'mixed' | 'tourist'
}

export interface TransportMode {
  mode:        'fly' | 'train' | 'bus' | 'drive' | 'ferry'
  duration:    string   // e.g. "~2h", "~11h", "4h overnight"
  note:        string   // e.g. "Direct from Heathrow", "Eurostar from St Pancras", "Via Dubai"
  recommended: boolean  // true on the single best option
}

export interface RecommendedDestination {
  name:               string
  country:            string
  match_score:        number   // 0–100
  reasons:            string[] // 2–3 short strings
  budget_per_day_usd?: number
  best_time_to_visit?: string
  hidden_gem_score?:  number   // 1–10
  dietary_tags?:      string[] // e.g. ['vegetarian-friendly','halal-available'] — only set if genuinely true
  timing_score?:      number   // 1–5 — how good is timing right now for this traveller
  timing_note?:       string   // one honest line on timing quality e.g. "May is monsoon — consider October"
  timing_warning?:    string   // amber badge text — ONLY for genuine access restrictions e.g. "Road access closes May–Oct"
  upcoming_event?:    UpcomingEvent | null
  transport?:         TransportMode[]  // HOW TO GET THERE — realistic modes from traveller's home
}

export interface RecommendationResponse {
  destinations: RecommendedDestination[]
}

// ─── Profile hash ─────────────────────────────────────────────────────────────
// Bump PROMPT_VERSION whenever prompt logic changes — busts all cached results.
const PROMPT_VERSION = 9

export function buildProfileHash(
  onboarding: OnboardingData,
  pastTrips: PastTrip[]
): string {
  const payload = {
    prompt_version:       PROMPT_VERSION,
    home_country:         onboarding.home_country?.toLowerCase().trim() ?? '',
    home_city:            onboarding.home_city?.toLowerCase().trim() ?? '',
    travel_scope:         onboarding.travel_scope ?? 'anywhere',
    budget_per_day:       onboarding.budget_per_day,
    trip_duration:        onboarding.trip_duration,
    group_type:           onboarding.group_type,
    interests:            [...onboarding.interests].sort(),
    offbeat_score:        onboarding.offbeat_score,
    dietary_preferences:  [...(onboarding.dietary_preferences ?? [])].sort(),
    trip_timing:          onboarding.trip_timing ?? '',
    past_trips:           pastTrips.map(t => t.destination_name.toLowerCase().trim()).sort(),
  }

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex')
}

// ─── Dietary prompt section ───────────────────────────────────────────────────

export function buildDietarySection(prefs: string[]): string {
  const active = prefs.filter(p => p !== 'none')
  if (active.length === 0) return ''

  const isVeg        = active.includes('vegetarian')
  const isVegan      = active.includes('vegan')
  const isHalal      = active.includes('halal')
  const isKosher     = active.includes('kosher')
  const isGlutenFree = active.includes('gluten-free')
  const noPork       = active.includes('no-pork')
  const noBeef       = active.includes('no-beef')
  const isPescatarian = active.includes('pescatarian')

  const rules: string[] = []

  if (isVegan || isVeg) {
    const label = isVegan ? 'vegan' : 'vegetarian'
    rules.push(
      `- Traveller is ${label}. Prioritise destinations with strong ${label} food scenes.`,
      `- Cities with large Indian, Buddhist, or Mediterranean communities score higher.`,
      `- In reasons, NEVER mention meat dishes. Mention plant-based local dishes, vegetarian street food culture, markets with fresh produce, specific vegetarian restaurants by name where they exist.`,
      `- Penalise destinations where ${label} options are limited or hard to find.`,
    )
  }

  if (isHalal) {
    rules.push(
      `- Traveller requires halal food. Prioritise destinations with large Muslim communities.`,
      `- Middle East, Southeast Asia, parts of West and East Africa score higher.`,
      `- Mention halal certification availability in reason tags when relevant.`,
      `- Do not recommend destinations where halal food is extremely difficult to find.`,
    )
  }

  if (isKosher) {
    rules.push(
      `- Traveller requires kosher food. Prioritise cities with established Jewish communities and kosher certification infrastructure.`,
      `- Penalise destinations with very limited kosher options.`,
    )
  }

  if (isGlutenFree) {
    rules.push(
      `- Traveller needs gluten-free options. Favour destinations where gluten-free food is widely available (most western cities, Japan, Mexico).`,
      `- Flag destinations where wheat/gluten is central to almost every dish.`,
    )
  }

  if (noPork) {
    rules.push(
      `- Traveller does not eat pork. Never mention pork dishes in reasons.`,
      `- Note when a destination's local cuisine is heavily pork-based so traveller is aware it may be limiting.`,
    )
  }

  if (noBeef) {
    rules.push(
      `- Traveller does not eat beef. Never mention beef dishes in reasons.`,
      `- Note when beef is central to local food culture (e.g. Argentina, Texas BBQ cities) as a potential limitation.`,
    )
  }

  if (isPescatarian) {
    rules.push(
      `- Traveller is pescatarian (fish and seafood OK, no land meat). Prioritise coastal destinations and cities with strong seafood scenes.`,
      `- Never mention land-meat dishes in reasons.`,
    )
  }

  const dietaryTagInstructions = `
DIETARY TAGS:
For each destination, return a "dietary_tags" array. Only include tags genuinely true for this destination — never include a tag just because the user asked for it. Leave dietary_tags as [] if not a strong fit.
Valid values: "vegetarian-friendly" | "vegan-friendly" | "halal-available" | "kosher-available" | "gluten-free-options" | "pork-free-easy" | "beef-free-easy" | "pescatarian-friendly"`

  return `
DIETARY PREFERENCES: ${active.join(', ')}

DIETARY RULES:
${rules.join('\n')}
Every food mention in reasons must be something this traveller can actually eat.
BAD (vegetarian): "street food centred on meat dishes"
GOOD (vegetarian): "pure vegetarian South Indian restaurants serving dosas and idlis"
BAD (halal): "craft brewery culture and farm-to-table pork"
GOOD (halal): "large Moroccan community with halal-certified tagine restaurants"
${dietaryTagInstructions}`
}

// ─── Companion awareness ──────────────────────────────────────────────────────

function buildCompanionSection(groupType: string): string {
  if (groupType === 'couple') return `
COMPANION AWARENESS — COUPLE:
Write reason tags acknowledging BOTH travelers. Never write solo-focused copy.
Good: "Perfect for couples who want X without compromising on Y"
Good: "Flexible enough that one explores while the other relaxes"
Bad: "Great for solo exploration" (never for a couple profile)
Every reason tag should implicitly include both people.`

  if (groupType === 'solo') return `
COMPANION AWARENESS — SOLO:
Write for the solo experience where relevant:
- Mention solo-friendly infrastructure where genuinely true
- "Easy to meet other travelers at [type of venue]" if applicable
- Safety context for solo exploration if relevant
- Never write couple-focused copy`

  if (groupType === 'small-group') return `
COMPANION AWARENESS — SMALL GROUP:
Write for a group of friends or family:
- Mention variety of options to split the group or stay together
- Activity range that works for mixed interests
- Group-friendly accommodation contexts`

  return ''
}

// ─── Past trip DNA matching ───────────────────────────────────────────────────

function buildDNASection(pastTrips: PastTrip[]): string {
  if (pastTrips.length === 0) return ''

  const names = pastTrips.map(t => t.destination_name.toLowerCase())

  const dnaHints: string[] = []

  // Music, food, culture, walkability
  if (names.some(n => /new orleans|nola/.test(n))) {
    dnaHints.push(`New Orleans visitor: values live music culture, food depth (not just "good food" — food as identity), walkable neighbourhoods, late-night street life, local character, history layered into everyday life. Avoids: sterile, resort-style, corporate, theme-park touristy.

REQUIREMENT — MANDATORY: At least one result MUST have a reason tag that explicitly says one of:
  "Same live music and food culture energy as New Orleans"
  "Similar street life energy to New Orleans — different continent"
  "Same late-night neighbourhood energy as New Orleans"

NOLA-DNA destinations — consider these first, include at least one:
  - Cartagena, Colombia: colonial walled city, cumbia music spilling from doorways, Caribbean heat, street food culture, painted buildings, local nightlife
  - Tbilisi, Georgia: thriving live music scene, polyphonic singing tradition, remarkable food culture (khinkali, natural wine), walkable old town, late-night energy, raw authenticity
  - Porto, Portugal: fado music in neighbourhood tascas, genuine port wine culture, steep walkable streets, local festivals, not yet overrun
  - Oaxaca, Mexico: one of the world's great food cities, mezcal as ritual not trend, local market life, indigenous artisan scene, Day of the Dead authenticity, music every evening

These destinations carry the same emotional fingerprint as New Orleans on a completely different map. Include at least one and say so explicitly in a reason tag.`)
  }
  if (names.some(n => /nashville/.test(n))) {
    dnaHints.push(`Nashville visitor: values live music scenes, food halls, neighbourhood culture, late-night energy. Find destinations with authentic music/arts scenes.`)
  }
  // SE Asia familiarity
  if (names.some(n => /thailand|vietnam|cambodia|laos|myanmar|indonesia|bali|bangkok|hanoi|saigon|ho chi minh/.test(n))) {
    dnaHints.push(`Southeast Asia traveller: comfortable with street food culture, immersive chaos, budget accommodation, language barriers, heat. Find similarly immersive but different region. Don't over-explain basic travel logistics.`)
  }
  // Europe appreciation
  if (names.some(n => /paris|rome|barcelona|amsterdam|berlin|prague|lisbon|madrid|vienna/.test(n))) {
    dnaHints.push(`European city traveller: appreciates history, walkable architecture, cafe culture, museum density. Find destinations with same qualities in less obvious locations.`)
  }
  // Japan
  if (names.some(n => /japan|tokyo|kyoto|osaka/.test(n))) {
    dnaHints.push(`Japan traveller: values precision, design, food culture, public transport excellence, safety, hidden depth. Find destinations that reward slow exploration and attention to detail.`)
  }
  // Latin America
  if (names.some(n => /mexico|colombia|peru|argentina|chile|brazil|cuba|costa rica/.test(n))) {
    dnaHints.push(`Latin America traveller: values colour, music, street food, local warmth, colonial architecture, outdoor adventure. Find destinations with similar vibrancy.`)
  }
  // India
  if (names.some(n => /india|rajasthan|kerala|goa|mumbai|delhi|bangalore/.test(n))) {
    dnaHints.push(`India traveller: comfortable with sensory intensity, street life, regional food variations, heritage depth. Find destinations that reward patience and curiosity.`)
  }

  if (dnaHints.length === 0) return ''

  return `
PAST TRIP DNA MATCHING:
Analyse the traveller's past trips not just to exclude destinations but to build an emotional fingerprint.
${dnaHints.join('\n')}
Build DNA profile from ALL regions visited and find destinations that match the emotional fingerprint, not just the geography. Where DNA match is strong, say so explicitly in one reason tag.`
}

// ─── Proximity awareness ─────────────────────────────────────────────────────

function buildProximitySection(homeCity: string): string {
  if (!homeCity) return `
PROXIMITY AWARENESS — SCOPE:
Block only obvious nearby weekend trips (within ~6 hours, well-known to every local).
Do NOT block all domestic destinations — most domestic destinations are fine and should be included.
Only exclude the handful of places every local already knows as their default weekend escape.`

  const city = homeCity.toLowerCase().trim()

  const exclusions: Record<string, string[]> = {
    atlanta:       ['Asheville', 'Savannah', 'Nashville', 'Charleston', 'New Orleans', 'Blue Ridge', 'Helen', 'Chattanooga', 'Charlotte', 'Memphis'],
    'new york':    ['Boston', 'Philadelphia', 'Washington DC', 'Hamptons', 'Hudson Valley', 'Catskills', 'Cape Cod', 'Providence'],
    'new york city': ['Boston', 'Philadelphia', 'Washington DC', 'Hamptons', 'Hudson Valley', 'Catskills', 'Cape Cod'],
    nyc:           ['Boston', 'Philadelphia', 'Washington DC', 'Hamptons', 'Hudson Valley', 'Catskills'],
    london:        ['Paris', 'Amsterdam', 'Dublin', 'Edinburgh', 'Bath', 'Brighton', 'Cotswolds', 'Cambridge', 'Oxford', 'Brussels'],
    sydney:        ['Melbourne', 'Gold Coast', 'Byron Bay', 'Blue Mountains', 'Hunter Valley', 'Cairns', 'Uluru'],
    melbourne:     ['Sydney', 'Gold Coast', 'Byron Bay', 'Grampians', 'Mornington Peninsula', 'Great Ocean Road'],
    delhi:         ['Agra', 'Jaipur', 'Rishikesh', 'Shimla', 'Manali', 'Haridwar', 'Amritsar', 'Chandigarh', 'Mussoorie'],
    mumbai:        ['Goa', 'Pune', 'Lonavala', 'Mahabaleshwar', 'Alibaug', 'Nashik'],
    dubai:         ['Abu Dhabi', 'Muscat', 'Doha', 'Bahrain'],
    singapore:     ['Kuala Lumpur', 'Batam', 'Bintan', 'Bangkok', 'Bali', 'Phuket'],
    toronto:       ['Montreal', 'Niagara Falls', 'Ottawa', 'Quebec City', 'Muskoka'],
    chicago:       ['Milwaukee', 'Indianapolis', 'Detroit', 'St Louis', 'Minneapolis'],
    'los angeles': ['San Diego', 'Santa Barbara', 'Palm Springs', 'Las Vegas', 'San Francisco'],
    la:            ['San Diego', 'Santa Barbara', 'Palm Springs', 'Las Vegas'],
    sf:            ['Napa', 'Sonoma', 'Monterey', 'Lake Tahoe', 'Los Angeles'],
    'san francisco': ['Napa', 'Sonoma', 'Monterey', 'Lake Tahoe', 'Los Angeles'],
    berlin:        ['Prague', 'Warsaw', 'Amsterdam', 'Copenhagen', 'Hamburg'],
    paris:         ['London', 'Amsterdam', 'Brussels', 'Lyon', 'Bordeaux', 'Nice'],
    beijing:       ['Shanghai', 'Chengdu', 'Xian', 'Tianjin'],
    shanghai:      ['Beijing', 'Hangzhou', 'Suzhou', 'Nanjing'],
  }

  // Find matching city
  let cityExclusions: string[] = []
  for (const [key, list] of Object.entries(exclusions)) {
    if (city.includes(key) || key.includes(city)) {
      cityExclusions = list
      break
    }
  }

  if (cityExclusions.length === 0) {
    return `
PROXIMITY AWARENESS — SCOPE:
Block only the handful of destinations every local from ${homeCity} already knows as obvious weekend escapes (within ~6 hours drive, heavily promoted locally).
Do NOT block all domestic destinations — most are perfectly valid and should appear in results.
Only ask: "Would every ${homeCity} local already know this as a weekend trip?" If no, it is fine to recommend.`
  }

  return `
PROXIMITY AWARENESS — CRITICAL SCOPE CLARIFICATION:
The list below contains ONLY the obvious nearby weekend trips that every ${homeCity} local already knows.
Blocking these does NOT mean blocking all domestic destinations.

BLOCK ONLY these specific nearby weekend trips from ${homeCity}:
${cityExclusions.join(', ')}

ALLOW freely — these are examples of domestic destinations that are NOT weekend trips and ARE valid recommendations:
${homeCity.toLowerCase().includes('atlanta') ? 'Marfa TX, Natchez MS, Muscle Shoals AL, Beaufort SC, Bisbee AZ, Whitefish MT, Arcata CA — all valid for an Atlanta user' : `any ${homeCity.split(',')[0].trim()} domestic destination that is NOT an obvious local weekend drive`}

Rule: "Is this an obvious 6-hour-or-less weekend escape that every ${homeCity} local already knows?" → if yes, block it. If no, it is fine.`
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

export function buildRecommendationPrompt(
  onboarding: OnboardingData,
  pastTrips: PastTrip[]
): { system: string; user: string } {
  const pastTripsList =
    pastTrips.length > 0
      ? pastTrips.map(t => t.destination_name).join(', ')
      : 'none'

  const offbeatDescription = [
    '',
    'popular destinations are fine — tourist infrastructure is a plus',
    'some tourism is ok, prefers a mix of known and local spots',
    'wants places with character, not overrun by tourists',
    'strongly prefers destinations most travellers skip',
    'wants places almost nobody visits — obscurity is the point',
  ][onboarding.offbeat_score]

  const homeLocation = onboarding.home_city
    ? `${onboarding.home_city}, ${onboarding.home_country}`
    : onboarding.home_country

  const travelScope      = onboarding.travel_scope ?? 'anywhere'
  const dietaryPrefs     = (onboarding.dietary_preferences ?? []).filter(p => p !== 'none')
  const dietarySection   = buildDietarySection(dietaryPrefs)
  const companionSection = buildCompanionSection(onboarding.group_type)
  const dnaSection       = buildDNASection(pastTrips)
  const proximitySection = buildProximitySection(onboarding.home_city ?? '')
  const tripTiming       = onboarding.trip_timing ?? null

  // Hard budget caps per tier
  const BUDGET_CAPS: Record<string, { min: number; max: number; target: number }> = {
    'under-20': { min: 0,   max: 20,  target: 15  },
    '20-50':    { min: 20,  max: 50,  target: 35  },
    '50-150':   { min: 50,  max: 150, target: 80  },
    '150-300':  { min: 150, max: 300, target: 210 },
    '300+':     { min: 300, max: 600, target: 400 },
  }
  const cap = BUDGET_CAPS[onboarding.budget_per_day]
  const budgetConstraint = cap
    ? `budget_per_day_usd MUST be between $${cap.min} and $${cap.max}. Target ~$${cap.target}. This is ON-THE-GROUND cost only (accommodation + food + local transport), EXCLUDING flights. Reject any destination where realistic ground costs exceed $${cap.max}/day.`
    : 'budget_per_day_usd: realistic daily on-the-ground cost in USD (excl. flights).'

  const scopeRules = travelScope === 'closer'
    ? `TRAVEL SCOPE: CLOSER TO HOME
- ONLY recommend destinations within the traveller's home region or nearby countries.
- No transcontinental flights.
- For Australia: domestic destinations + New Zealand, SE Asia, Pacific Islands only.
- For India: domestic destinations + Sri Lanka, Nepal, Bhutan, Maldives, Thailand only.
- For UK/Europe: domestic + European destinations only.
- For USA/Canada: domestic + Mexico, Caribbean, Central America only.
- Maximum flight time: 6 hours from home city.`
    : `TRAVEL SCOPE: GLOBAL
- Worldwide destinations are fine.
- Vary regions — do not cluster all suggestions in one continent.
- For budget/mid-range travellers: keep estimated flight costs under $400. NEVER recommend a destination where flight cost alone exceeds 50% of their estimated total trip budget.
- Flight radius guide: under $50-150/day budget → prefer destinations under 6 hours flight time. Higher budgets → longer flights acceptable.`

  const system = `You are a travel recommendation engine for Voya.

OUTPUT FORMAT — CRITICAL:
Output each destination as a separate, complete JSON object on its own line.
One destination per line. No outer array. No "destinations" wrapper key. No markdown. No explanation.
Every line must be a complete, valid, parseable JSON object.
Example of correct output:
{"name":"Hampi","country":"India","match_score":91,"reasons":["...","..."],"budget_per_day_usd":25,"best_time_to_visit":"Oct–Feb","hidden_gem_score":7,"dietary_tags":[],"timing_score":3,"timing_note":"","timing_warning":"","upcoming_event":null,"transport":[{"mode":"fly","duration":"~10h","note":"Via Delhi or Mumbai, no direct","recommended":true}]}
{"name":"Spiti Valley","country":"India","match_score":89,"reasons":["..."],"budget_per_day_usd":30,"best_time_to_visit":"Jun–Sep","hidden_gem_score":9,"dietary_tags":[],"timing_score":1,"timing_note":"Road access closed until mid-June","timing_warning":"⚠️ Road access closed in May — open Jun–Sep only","upcoming_event":null,"transport":[{"mode":"fly","duration":"~10h","note":"Fly to Delhi, then 12h drive when road opens","recommended":true}]}

Per-line schema: {"name": string, "country": string, "match_score": number, "reasons": string[], "budget_per_day_usd": number, "best_time_to_visit": string, "hidden_gem_score": number, "dietary_tags": string[], "timing_score": number, "timing_note": string, "timing_warning": string, "upcoming_event": {"name":string,"when":string,"what":string,"crowd_level":"local"|"mixed"|"tourist"}|null, "transport": [{"mode":"fly"|"train"|"bus"|"drive"|"ferry","duration":string,"note":string,"recommended":boolean}]}

RULES:
- match_score: 0–100, ranked descending
- reasons: exactly 2–3 short strings. Specific, evocative, personal to THIS traveller.
- hidden_gem_score: 1–10:
    1–3 = famous everywhere (Paris, Bali, Santorini, Asheville, Queenstown, Goa, etc.)
    4–6 = moderately known, some tourists
    7–10 = genuinely obscure to most travellers
  A destination well-known in its home country scores 1–3 even if less known internationally.
  Never assign hidden_gem_score above 4 to any destination in mainstream travel listicles.
- ${budgetConstraint}
- best_time_to_visit: concise e.g. "October–March" or "Year-round"
- timing_score: 1–5 for how good the current/upcoming travel window is for this destination
    1 = effectively inaccessible or strongly inadvisable (road closed, extreme season, dangerous)
    2 = significant limitations but still visitable
    3 = acceptable, not ideal
    4 = good window
    5 = perfect timing
- timing_note: one honest line — only include if timing has a meaningful implication. Empty string "" if neutral.
- timing_warning: SHORT amber badge text. Populate ONLY for genuine hard restrictions during the traveller's
    window: road closures, seasonal inaccessibility, monsoon, extreme heat/cold, hurricane season,
    dangerous conditions. Covers ALL conflict types — not just road closures.
    Format: "⚠️ [specific reason]" e.g. "⚠️ Monsoon June–Sep", "⚠️ Extreme heat Nov–Mar",
    "⚠️ Hurricane season Aug–Oct", "⚠️ Road access closes May–Oct", "⚠️ Extreme cold Dec–Feb"
    Empty string "" if no hard restriction. Do NOT use for mild timing preferences.
- MATCH SCORE — CRITICAL: match_score is the RAW profile-fit score only. Do NOT reduce match_score
    for timing conflicts. Score the destination on profile fit as if timing were perfect, then
    separately flag timing issues via timing_score and timing_warning.
    The UI applies a deterministic −20 point penalty client-side whenever timing_warning is non-empty.
    If timing_score is 1 AND the destination is completely inaccessible during travel window AND you
    have 8+ viable alternatives, exclude the destination entirely rather than including it at any score.
- upcoming_event: festival or event within the traveller's travel window. null if none relevant.
- Return MINIMUM 8, MAXIMUM 12 destinations. Never fewer than 8.
- Never suggest a destination the traveller has already visited.

TONE RULES — reason tags:
NEVER USE: weird, strange, odd, bizarre, unusual, peculiar, quirky, underrated, overlooked, forgotten, hidden away, tucked away
ALWAYS USE: authentic, raw, one-of-a-kind, remarkable, genuinely local, unscripted, untouched, undiscovered, unlike anywhere else
Never frame a destination as a lesser alternative ("the poor man's X"). Every destination IS the destination.

GEOGRAPHIC RULES:
- Always include 2–3 destinations within the traveller's home country first (unless they've visited them all).
- Then add international destinations appropriate to scope and budget.
- Never recommend a destination where estimated flight cost exceeds 50% of total trip budget.

${scopeRules}
${proximitySection}
${companionSection}
${dnaSection}

DESTINATION FAMILIARITY (default: null — hidden gems mode):
When familiarity_level is null: prioritise undiscovered, hidden gem focused recommendations.
When first_time: include 2–3 well-known attractions with honest positive framing, then deeper cuts.
When been_once: skip obvious attractions, lead with neighbourhood exploration, one thing they probably missed.
When know_it: locals-only mode, nothing a tourist would find.

HIDDEN GEM LISTS — use when traveller wants hidden gems:
Australian: Broken Hill, Coober Pedy, Cooktown, Cape York, Flinders Ranges, Kimberley, Kangaroo Island (off-season), Norfolk Island, Ningaloo Reef, Lord Howe Island
Indian: Chettinad, Majuli Island, Spiti Valley, Ziro Valley, Dzukou Valley, Mawlynnong, Shekhawati, Rann of Kutch, Hampi surrounds, Gokarna (off-season)
${dietarySection}

TRANSPORT — HOW TO GET THERE:
For each destination, return a "transport" array of realistic options FROM the traveller's home city/country.
Rules:
- Only include modes that are genuinely viable for this origin–destination pair.
- Maximum 2–3 modes. Never list a mode just to pad the list.
- Mark exactly ONE mode as recommended: true — the best balance of time, cost, and experience.
- drive: only if destination is within ~8 hours by road from home city. Never drive across oceans.
- ferry: only if there is a genuine regular ferry service between home country/region and destination.
- train: include if there is a real rail option (Eurostar, overnight rail, Amtrak, Indian Railways intercity, etc.).
- bus: only if long-distance bus is a realistic and common option (e.g. South/Southeast Asia, Europe, Latin America).
- fly: always include if destination requires or benefits from air travel.
- duration: flight time or journey time. Be accurate. Include connections where relevant in the note.
- note: one specific, useful line. Name the hub airport, rail terminal, or line. "Via" connections. Avoid vague filler.
Examples:
  Home: London → Paris: [{"mode":"train","duration":"2h20m","note":"Eurostar direct from St Pancras","recommended":true},{"mode":"fly","duration":"~1h","note":"City airports but airport time negates saving","recommended":false},{"mode":"drive","duration":"~6h via Eurotunnel","note":"Scenic but train is faster","recommended":false}]
  Home: New York → Tokyo: [{"mode":"fly","duration":"~14h","note":"Direct on ANA or JAL from JFK","recommended":true}]
  Home: Delhi → Rishikesh: [{"mode":"drive","duration":"~5h","note":"NH58 via Haridwar, scenic drive","recommended":true},{"mode":"bus","duration":"~6h","note":"Regular ISBT buses from Delhi","recommended":false},{"mode":"train","duration":"~5h","note":"Train to Haridwar then taxi","recommended":false}]
  Home: Singapore → Bali: [{"mode":"fly","duration":"~2h30m","note":"Multiple daily flights, Ngurah Rai Airport","recommended":true}]`

  const dietaryLine = dietaryPrefs.length > 0
    ? `\n- Dietary: ${dietaryPrefs.join(', ')}`
    : ''

  const timingLine = tripTiming
    ? `\n- Trip timing: ${tripTiming === 'next_month' ? 'Travelling next month' : tripTiming === '2_3_months' ? 'Travelling in 2–3 months' : 'Exploring options, no fixed date'}`
    : ''

  const user = `Traveller profile:
- Based in: ${homeLocation}
- Travel scope: ${travelScope === 'closer' ? 'Closer to home (regional only)' : 'Anywhere in the world'}
- Daily budget (on-the-ground, excl. flights): ${BUDGET_LABELS[onboarding.budget_per_day] ?? onboarding.budget_per_day}
- Trip duration: ${onboarding.trip_duration}
- Travelling with: ${onboarding.group_type}
- What matters most: ${onboarding.interests.join(', ')}
- Off the beaten path preference (${onboarding.offbeat_score}/5): ${offbeatDescription}${dietaryLine}${timingLine}
- Familiarity level per destination: null (default hidden gems mode)

Past trips — build DNA profile from these AND exclude them from recommendations: ${pastTripsList}

Rules:
- Prioritise offbeat_score heavily — it is the most important single dimension
- For offbeat_score 4–5: only suggest destinations with hidden_gem_score 7–10
- Budget is a hard constraint on ground costs. Flight costs are separate and must be realistic
- Apply proximity awareness — do not suggest obvious weekend trips from ${onboarding.home_city ?? onboarding.home_country}
- Apply companion awareness for ${onboarding.group_type} travel style
- Return 8–12 destinations`

  return { system, user }
}

// ─── Response validator ───────────────────────────────────────────────────────
// Handles both NDJSON (one destination per line) and legacy JSON array formats.

export function validateResponse(raw: string): RecommendedDestination[] {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  // ── Try NDJSON first (one destination per line) ───────────────────────────
  const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length >= 2) {
    const ndjson: RecommendedDestination[] = []
    for (const line of lines) {
      try {
        const d = JSON.parse(line)
        if (d.name && d.country && typeof d.match_score === 'number') {
          ndjson.push(d)
        }
      } catch { /* not valid JSON on this line */ }
    }
    if (ndjson.length >= 8) return ndjson.slice(0, 12)
  }

  // ── Fallback: JSON array format ───────────────────────────────────────────
  const parsed: RecommendationResponse = JSON.parse(cleaned)
  if (!parsed.destinations || !Array.isArray(parsed.destinations)) {
    throw new Error('Response missing destinations array')
  }
  if (parsed.destinations.length < 8) {
    throw new Error(`Insufficient destinations: got ${parsed.destinations.length}, need at least 8`)
  }
  return parsed.destinations.slice(0, 12)
}
