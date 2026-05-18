import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const maxDuration = 20

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

// ─── POST /api/itinerary/alternatives ────────────────────────────────────────
// Returns 3 distinct replacement suggestions for a single itinerary block.

export async function POST(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => {
          try { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) }
          catch { /* read-only */ }
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Parse body ────────────────────────────────────────────────────────────────
  const body = await req.json() as {
    destination:       string
    country:           string
    day:               number
    slot:              string
    current_activity:  string
    day_context?:      Record<string, string | undefined>   // slot → activity name
    user_profile?: {
      budget_per_day?: string
      group_type?:     string
    }
  }

  const { destination, country, day, slot, current_activity, day_context, user_profile } = body

  if (!destination || !country || !slot)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

  // ── Build context from other slots in the same day ────────────────────────────
  const otherSlots = day_context
    ? Object.entries(day_context)
        .filter(([s, v]) => s !== slot && v)
        .map(([s, v]) => `  ${s}: ${v}`)
        .join('\n')
    : ''

  const budgetNote = user_profile?.budget_per_day
    ? `Budget tier: ${user_profile.budget_per_day}. `
    : ''

  const groupNote = user_profile?.group_type
    ? `Traveling as: ${user_profile.group_type}. `
    : ''

  const systemPrompt = `You are a travel expert generating alternative activity suggestions for Vondrer.
${budgetNote}${groupNote}
Return ONLY a JSON object in this exact shape — no markdown, no explanation:
{
  "alternatives": [
    { "activity": "...", "description": "2-3 sentences", "insider_tip": "local tip", "estimated_cost": "$X per person" },
    { "activity": "...", "description": "2-3 sentences", "insider_tip": "local tip", "estimated_cost": "$X per person" },
    { "activity": "...", "description": "2-3 sentences", "insider_tip": "local tip", "estimated_cost": "$X per person" }
  ]
}`

  const userPrompt = `Destination: ${destination}, ${country}
Day ${day} — ${slot} slot
Currently planned: "${current_activity}"
${otherSlots ? `Other activities on this day (do NOT repeat any of these):\n${otherSlots}` : ''}

Suggest 3 DIFFERENT alternatives that:
1. Are each a distinct type/vibe (e.g. cultural, nature, food — not three museums)
2. Are real, currently operating places in ${destination}
3. Suit the ${slot} time slot
4. Are NOT similar to "${current_activity}"`

  try {
    const completion = await openai.chat.completions.create({
      model:            'gpt-4o-mini',
      temperature:      0.85,
      max_tokens:       700,
      response_format:  { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
    })

    const raw  = completion.choices[0]?.message?.content ?? '{}'
    const data = JSON.parse(raw) as { alternatives?: unknown[] }

    if (!Array.isArray(data.alternatives) || data.alternatives.length === 0)
      return NextResponse.json({ error: 'No alternatives returned' }, { status: 500 })

    return NextResponse.json({ alternatives: data.alternatives.slice(0, 3) })
  } catch (err) {
    console.error('[Alternatives]', err)
    return NextResponse.json({ error: 'Failed to generate alternatives' }, { status: 500 })
  }
}
