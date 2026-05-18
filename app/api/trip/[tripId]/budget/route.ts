import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface BudgetExpense {
  id:        string
  day?:      number          // null = trip-level (flights, hotels)
  category:  'activities' | 'food' | 'transport' | 'accommodation' | 'other'
  name:      string
  planned:   number          // expected cost (per-person)
  actual:    number | null   // null = not spent yet
  note?:     string
  currency:  string          // ISO e.g. 'USD'
}

// ─── Supabase migration required ─────────────────────────────────────────────
// Run once in your Supabase SQL editor:
//
//   ALTER TABLE trips ADD COLUMN IF NOT EXISTS budget_json JSONB DEFAULT '[]'::jsonb;
//
// ─────────────────────────────────────────────────────────────────────────────

async function getClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => {
          try { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) }
          catch { /* read-only context */ }
        },
      },
    }
  )
}

// ─── GET /api/trip/[tripId]/budget ────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params
  const supabase = await getClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: trip } = await supabase
    .from('trips')
    .select('budget_json, user_id')
    .eq('id', tripId)
    .single()

  if (!trip || trip.user_id !== user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return NextResponse.json({ expenses: trip.budget_json ?? [] })
}

// ─── PATCH /api/trip/[tripId]/budget ─────────────────────────────────────────
// Replaces the full expenses array (client owns the diff).

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params
  const supabase = await getClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: trip } = await supabase
    .from('trips')
    .select('user_id')
    .eq('id', tripId)
    .single()

  if (!trip || trip.user_id !== user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { expenses } = await req.json() as { expenses: BudgetExpense[] }

  const { error } = await supabase
    .from('trips')
    .update({ budget_json: expenses })
    .eq('id', tripId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ─── POST /api/trip/[tripId]/budget  (generate AI estimate) ──────────────────

export const maxDuration = 30

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params
  const supabase   = await getClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch trip + destinations
  const [{ data: trip }, { data: destinations }, { data: profile }] = await Promise.all([
    supabase.from('trips').select('id, user_id, total_days, trip_pace').eq('id', tripId).single(),
    supabase.from('trip_destinations').select('destination_name, country, days, itinerary_json, notes').eq('trip_id', tripId).order('position'),
    supabase.from('onboarding_responses').select('budget_per_day, group_type, interests').eq('user_id', user.id).single(),
  ])

  if (!trip || trip.user_id !== user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const dests    = destinations ?? []
  const primary  = dests[0]
  const dest     = primary?.destination_name ?? 'Unknown'
  const country  = primary?.country ?? ''
  const days     = trip.total_days ?? dests.reduce((s, d) => s + (d.days ?? 0), 0)
  const budget   = profile?.budget_per_day ?? '50-150'
  const group    = profile?.group_type ?? 'couple'

  // Collect activity names from itinerary for realistic cost estimation
  const activities: string[] = []
  dests.forEach(d => {
    const itinerary = Array.isArray(d.itinerary_json) ? d.itinerary_json : []
    itinerary.forEach((day: { morning?: {activity?:string}; afternoon?: {activity?:string}; dinner?: {activity?:string}; evening?: {activity?:string} }) => {
      ;['morning','afternoon','dinner','evening'].forEach(slot => {
        const act = (day as Record<string, {activity?:string}>)[slot]?.activity
        if (act) activities.push(act)
      })
    })
  })

  const BUDGET_LABELS: Record<string, string> = {
    'under-20': 'under $20/day (backpacker)',
    '20-50':    '$20–50/day (budget)',
    '50-150':   '$50–150/day (mid-range)',
    '150-300':  '$150–300/day (comfort)',
    '300+':     '$300+/day (luxury)',
  }

  const system = `You are a travel budget planner. Return ONLY a JSON array of expense objects — no markdown.
Each object shape:
{
  "day": 1,           // day number (1-based); null for trip-level items like flights/hotel
  "category": "activities" | "food" | "transport" | "accommodation" | "other",
  "name": "Expense name",
  "planned": 45,      // number in USD, per person
  "note": "optional short note"
}
Rules:
- Generate 10–18 realistic expenses covering the whole trip
- Include 1 accommodation total (category: "accommodation", day: null) and 1 transport total (flights/airport transfer, day: null)
- For each day include ~2-3 items: a food entry and 1-2 activity entries
- Base amounts on the traveller budget tier
- Use real costs for ${dest}, ${country}
- day-level food should cover meals for that day combined
- Return a flat array only`

  const userMsg = `Trip: ${dest}, ${country} — ${days} days
Budget tier: ${BUDGET_LABELS[budget] ?? budget}
Group: ${group}
Activities: ${activities.slice(0, 12).join(', ') || 'general sightseeing'}`

  try {
    const msg = await anthropic.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 1200,
      system,
      messages:   [{ role: 'user', content: userMsg }],
    })

    const raw  = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '[]'
    const arr  = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()) as Omit<BudgetExpense, 'id' | 'actual' | 'currency'>[]
    const expenses: BudgetExpense[] = arr.map((e, i) => ({
      id:       `ai-${i}-${Date.now()}`,
      day:      e.day ?? undefined,
      category: e.category,
      name:     e.name,
      planned:  typeof e.planned === 'number' ? e.planned : 0,
      actual:   null,
      currency: 'USD',
      note:     e.note,
    }))

    return NextResponse.json({ expenses })
  } catch (err) {
    console.error('[Budget generate]', err)
    return NextResponse.json({ error: 'Could not generate budget.' }, { status: 500 })
  }
}
