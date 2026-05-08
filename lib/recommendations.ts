import crypto from 'crypto'
import { BUDGET_LABELS } from '@/lib/currency'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OnboardingData {
  home_country:   string   // e.g. 'United States', 'India', 'Australia'
  home_city?:     string   // e.g. 'Sydney', 'Delhi', 'London' (optional, new field)
  travel_scope?:  string   // 'anywhere' | 'closer' (optional, new field)
  budget_per_day: string   // 'under-20' | '20-50' | '50-150' | '150-300' | '300+'
  trip_duration:  string   // 'weekend' | '1-week' | '2-weeks' | 'month+'
  group_type:     string   // 'solo' | 'couple' | 'small-group'
  interests:      string[] // ['hidden-gems','local-food','adventure','culture','slow-travel','photography']
  offbeat_score:  number   // 1–5
}

export interface PastTrip {
  destination_name: string
}

export interface RecommendedDestination {
  name:              string
  country:           string
  match_score:       number   // 0–100
  reasons:           string[] // 2–3 short strings
  budget_per_day_usd?: number
  best_time_to_visit?: string
  hidden_gem_score?: number   // 1–10
}

export interface RecommendationResponse {
  destinations: RecommendedDestination[]
}

// ─── Profile hash ─────────────────────────────────────────────────────────────
// Bump PROMPT_VERSION whenever prompt logic changes — busts all cached results.
const PROMPT_VERSION = 4

export function buildProfileHash(
  onboarding: OnboardingData,
  pastTrips: PastTrip[]
): string {
  const payload = {
    prompt_version: PROMPT_VERSION,
    home_country:   onboarding.home_country?.toLowerCase().trim() ?? '',
    home_city:      onboarding.home_city?.toLowerCase().trim() ?? '',
    travel_scope:   onboarding.travel_scope ?? 'anywhere',
    budget_per_day: onboarding.budget_per_day,
    trip_duration:  onboarding.trip_duration,
    group_type:     onboarding.group_type,
    interests:      [...onboarding.interests].sort(),
    offbeat_score:  onboarding.offbeat_score,
    past_trips:     pastTrips.map(t => t.destination_name.toLowerCase().trim()).sort(),
  }

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex')
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

  const travelScope = onboarding.travel_scope ?? 'anywhere'

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
Return ONLY valid JSON. No explanation. No prose. No markdown.
Response schema: { "destinations": [{ "name": string, "country": string, "match_score": number, "reasons": string[], "budget_per_day_usd": number, "best_time_to_visit": string, "hidden_gem_score": number }] }

RULES:
- match_score: 0–100, ranked descending
- reasons: exactly 2–3 short strings explaining why this destination fits this specific traveller
- hidden_gem_score: 1–10 scale:
    1–3 = famous tourist destinations everyone knows (Paris, Bali, Santorini, Asheville, Queenstown, Goa, etc.)
    4–6 = moderately known, some tourists but not overwhelmed
    7–10 = genuinely obscure — most travellers have never heard of them
  A destination well-known within its home country scores 1–3 even if less known internationally.
  Never assign hidden_gem_score above 4 to any destination featured in mainstream travel listicles.
- ${budgetConstraint}
- best_time_to_visit: concise string e.g. "October–March" or "Year-round"
- Return MINIMUM 8, MAXIMUM 12 destinations. Never fewer than 8.
- Never suggest a destination the traveller has already visited.

GEOGRAPHIC RULES:
- Always include 2–3 destinations within the traveller's home country first (unless they've visited them all).
- Then add international destinations appropriate to their travel scope and budget.
- Never recommend a destination where estimated flight cost exceeds 50% of total trip budget.

${scopeRules}

HIDDEN GEM LISTS — use these when traveller is from these countries and wants hidden gems:

For Australian travellers consider: Broken Hill, Coober Pedy, Cooktown, Cape York Peninsula, Flinders Ranges, Kimberley region, Kangaroo Island (off-season), Norfolk Island, Ningaloo Reef, Lord Howe Island, Daintree (beyond tourist circuit), Kakadu interior

For Indian travellers consider: Chettinad, Majuli Island, Spiti Valley, Ziro Valley, Dzukou Valley, Mawlynnong, Shekhawati, Rann of Kutch, Hampi agricultural surrounds, Gokarna (off-season)`

  const user = `Traveller profile:
- Based in: ${homeLocation}
- Travel scope: ${travelScope === 'closer' ? 'Closer to home (regional only)' : 'Anywhere in the world'}
- Daily budget (on-the-ground, excl. flights): ${BUDGET_LABELS[onboarding.budget_per_day] ?? onboarding.budget_per_day}
- Trip duration: ${onboarding.trip_duration}
- Travelling with: ${onboarding.group_type}
- What matters most: ${onboarding.interests.join(', ')}
- Off the beaten path preference (${onboarding.offbeat_score}/5): ${offbeatDescription}

Past trips (do not suggest these): ${pastTripsList}

Prioritise the offbeat_score heavily — it is the most important dimension.
For offbeat_score 4–5: only suggest destinations with hidden_gem_score 7–10.
Budget is a hard constraint on ground costs. Flight costs are separate and must be realistic for their tier.
Return 8–12 destinations.`

  return { system, user }
}

// ─── Response validator ───────────────────────────────────────────────────────

export function validateResponse(raw: string): RecommendedDestination[] {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  const parsed: RecommendationResponse = JSON.parse(cleaned)

  if (!parsed.destinations || !Array.isArray(parsed.destinations)) {
    throw new Error('Response missing destinations array')
  }

  if (parsed.destinations.length < 8) {
    throw new Error(`Insufficient destinations: got ${parsed.destinations.length}, need at least 8`)
  }

  return parsed.destinations.slice(0, 12)
}
