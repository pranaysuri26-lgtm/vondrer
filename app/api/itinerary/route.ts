import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { BUDGET_LABELS } from '@/lib/currency'

export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ItineraryBlock {
  activity:        string
  description:     string
  insider_tip:     string
  estimated_cost:  string
}

export interface ItineraryDay {
  day:                  number
  title:                string
  morning:              ItineraryBlock
  afternoon:            ItineraryBlock
  evening:              ItineraryBlock
  day_total_estimate:   string
}

export interface ItineraryResult {
  destination:  string
  country:      string
  days:         number
  start_date:   string
  end_date:     string
  itinerary:    ItineraryDay[]
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
}

// ─── Budget daily totals ──────────────────────────────────────────────────────

const BUDGET_DAY_TOTALS: Record<string, string> = {
  'under-20':  'under $30 total for the day',
  '20-50':     '$30–$60 total for the day',
  '50-150':    '$60–$150 total for the day',
  '150-300':   '$150–$300 total for the day',
  '300+':      '$300+ — no ceiling, lead with quality',
}

// ─── POST /api/itinerary ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
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

  // ── Parse body ───────────────────────────────────────────────────────────────
  let body: ItineraryRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { destination, country, days, start_date, user_profile } = body

  if (!destination || !country || !days || !start_date) {
    return NextResponse.json({ error: 'Missing required fields: destination, country, days, start_date' }, { status: 400 })
  }

  // ── Calculate end date ───────────────────────────────────────────────────────
  const startMs  = new Date(start_date).getTime()
  const endDate  = new Date(startMs + (days - 1) * 86400000).toISOString().split('T')[0]

  // ── Profile context ──────────────────────────────────────────────────────────
  const budget        = user_profile?.budget_per_day ?? '50-150'
  const groupType     = user_profile?.group_type     ?? 'couple'
  const interests     = (user_profile?.interests     ?? []).join(', ')
  const dietary       = (user_profile?.dietary_preferences ?? []).filter(p => p !== 'none')
  const homeCity      = user_profile?.home_city      ?? ''
  const homeCountry   = user_profile?.home_country   ?? ''
  const homeLocation  = homeCity ? `${homeCity}, ${homeCountry}` : homeCountry
  const budgetLabel   = BUDGET_LABELS[budget] ?? budget
  const dayTotal      = BUDGET_DAY_TOTALS[budget] ?? '$60–$150 total for the day'

  // ── Dietary rules ─────────────────────────────────────────────────────────────
  const dietaryRules = dietary.length > 0 ? `
DIETARY — MANDATORY RULES:
The traveller has these preferences: ${dietary.join(', ')}.
Every single meal mention must be something this traveller can eat.
${dietary.includes('vegetarian') || dietary.includes('vegan') ? 'No meat dishes, ever. Name specific vegetarian restaurants or dishes.' : ''}
${dietary.includes('halal') ? 'Only halal-certified or clearly halal restaurants. Flag certification where known.' : ''}
${dietary.includes('gluten-free') ? 'Clearly gluten-free options at every meal block.' : ''}
Add: "Verify current menu before visiting" when naming specific restaurants.` : ''

  // ── Companion rules ───────────────────────────────────────────────────────────
  const companionRules = groupType === 'couple' ? `
COMPANION — COUPLE:
Write for two people throughout. "You and your partner…"
Include one romantic element per day. One standout dinner per trip.
Frame activities as shared experiences, not solo exploration.` :
    groupType === 'solo' ? `
COMPANION — SOLO:
Write for solo travel. Easy to do alone. Note good spots to meet other travelers.
Safety context where relevant. Never write couple-focused copy.` : `
COMPANION — SMALL GROUP:
Write for a group. Variety of options. Group-friendly venues.`

  // ── Home city transport hint ──────────────────────────────────────────────────
  let transportHint = ''
  if (homeCity) {
    transportHint = `
ARRIVAL CONTEXT (Day 1):
The traveller is flying from ${homeLocation} to ${destination}, ${country}.
On Day 1, mention the practical arrival context: which airport, rough transit time to city centre. Assume afternoon arrival unless dates suggest otherwise.
Keep it one sentence — don't over-explain.`
  }

  // ── System prompt ─────────────────────────────────────────────────────────────
  const system = `You are a travel itinerary expert for Voya. Generate a day-by-day plan.
Return ONLY valid JSON. No markdown. No explanation. No wrapper object.
Return a JSON array of day objects directly.

Schema per day:
{
  "day": number,
  "title": "evocative title e.g. Arrival & South Beach at Sunset",
  "morning": {
    "activity": "specific real place name",
    "description": "2-3 sentences — what to do, why it's worth it",
    "insider_tip": "genuinely useful local knowledge — not generic advice",
    "estimated_cost": "$X per person"
  },
  "afternoon": { same structure },
  "evening": { same structure },
  "day_total_estimate": "$X–$Y per person"
}

Day title rules:
✓ "Arrival & First Impressions"
✓ "Wynwood, Brickell, and a Rooftop at Dusk"
✗ "Day 1" — never just the day number
✗ "Exploring the city" — never generic

Activity rules:
- SPECIFIC real place names only — never "a local restaurant" or "a museum"
- Every activity must be real and currently operating (to your knowledge)
- Budget activities must fit the traveller's tier
- Day 1: assume afternoon arrival — morning block should be light (arrival, check-in, first wander)
- Last day: assume morning checkout — evening block should be airport-friendly
- Each time block should include one meal or food recommendation

${dietaryRules}
${companionRules}
${transportHint}`

  const userPrompt = `Generate a ${days}-day itinerary for ${destination}, ${country}.

Dates: ${start_date} to ${endDate}
Traveller profile:
- Home: ${homeLocation || 'not specified'}
- Budget: ${budgetLabel} (${dayTotal})
- Travelling with: ${groupType}
${interests ? `- Interests: ${interests}` : ''}
${dietary.length > 0 ? `- Dietary: ${dietary.join(', ')}` : ''}

Return the JSON array of ${days} day objects. Nothing else.`

  // ── Call Claude ───────────────────────────────────────────────────────────────
  try {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-5',
      max_tokens: 4000,
      system,
      messages:   [{ role: 'user', content: userPrompt }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

    // Strip markdown code fences if present
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
      destination,
      country,
      days,
      start_date,
      end_date: endDate,
      itinerary,
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[Itinerary] Claude error:', err)
    return NextResponse.json({ error: 'Itinerary generation failed — please try again.' }, { status: 500 })
  }
}
