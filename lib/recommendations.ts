import crypto from 'crypto'
import { BUDGET_LABELS } from '@/lib/currency'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OnboardingData {
  home_country:   string   // e.g. 'United States', 'India', 'Germany'
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
  match_score:       number  // 0–100
  reasons:           string[] // 2–3 short strings
  budget_per_day_usd?: number
  best_time_to_visit?: string
  hidden_gem_score?: number  // 1–10
}

export interface RecommendationResponse {
  destinations: RecommendedDestination[]
}

// ─── Profile hash ─────────────────────────────────────────────────────────────
// Hash all inputs that affect recommendations.
// Sorting arrays ensures consistent hashes regardless of insertion order.
// past_trips MUST be included — adding a past trip should invalidate the cache.

export function buildProfileHash(
  onboarding: OnboardingData,
  pastTrips: PastTrip[]
): string {
  const payload = {
    home_country:   onboarding.home_country?.toLowerCase().trim() ?? '',
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
    '', // 0 unused
    'popular destinations are fine — tourist infrastructure is a plus',
    'some tourism is ok, prefers a mix of known and local spots',
    'wants places with character, not overrun by tourists',
    'strongly prefers destinations most travellers skip',
    'wants places almost nobody visits — obscurity is the point',
  ][onboarding.offbeat_score]

  const system = `You are a travel recommendation engine for Voya.
Return ONLY valid JSON. No explanation. No prose. No markdown.
Response schema: { "destinations": [{ "name": string, "country": string, "match_score": number, "reasons": string[], "budget_per_day_usd": number, "best_time_to_visit": string, "hidden_gem_score": number }] }
Rules:
- match_score: 0–100, ranked descending
- reasons: exactly 2–3 short strings explaining why this destination fits this specific traveller
- hidden_gem_score: 1–10 (10 = almost nobody goes there, 1 = extremely touristy)
- budget_per_day_usd: realistic daily budget in USD including accommodation, food, local transport
- best_time_to_visit: concise string e.g. "October–March" or "Year-round"
- Return between 5 and 10 destinations. Never fewer than 5. Never more than 10.
- Never suggest a destination the traveller has already visited.
- Vary regions — do not cluster all suggestions in one continent.`

  const user = `Traveller profile:
- Based in: ${onboarding.home_country}
- Daily budget: ${BUDGET_LABELS[onboarding.budget_per_day] ?? onboarding.budget_per_day}
- Trip duration: ${onboarding.trip_duration}
- Travelling with: ${onboarding.group_type}
- What matters most: ${onboarding.interests.join(', ')}
- Off the beaten path preference (${onboarding.offbeat_score}/5): ${offbeatDescription}

Past trips (do not suggest these): ${pastTripsList}

Recommend destinations this traveller hasn't visited.
Factor in their home country when assessing destination relevance — consider realistic travel distance, flight accessibility, and regional variety relative to where they live.
Prioritise the offbeat_score signal heavily — it is the most important dimension of this recommendation.`

  return { system, user }
}

// ─── Response validator ───────────────────────────────────────────────────────

export function validateResponse(raw: string): RecommendedDestination[] {
  const parsed: RecommendationResponse = JSON.parse(raw) // throws on invalid JSON

  if (!parsed.destinations || !Array.isArray(parsed.destinations)) {
    throw new Error('Response missing destinations array')
  }

  if (parsed.destinations.length < 5) {
    throw new Error(`Insufficient destinations: got ${parsed.destinations.length}, need at least 5`)
  }

  // Enforce cap
  return parsed.destinations.slice(0, 10)
}
