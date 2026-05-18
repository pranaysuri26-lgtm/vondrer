import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const maxDuration = 20

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

// POST /api/itinerary/describe
// Generates description + insider_tip + estimated_cost for a given activity name.
// Used when the user renames an activity and wants AI to fill in the details.

export async function POST(req: NextRequest) {
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

  const body = await req.json() as {
    activity:    string
    destination: string
    country:     string
    slot:        string
    day_context?: Record<string, string | undefined>
  }

  const { activity, destination, country, slot, day_context } = body
  if (!activity || !destination || !country)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const otherSlots = day_context
    ? Object.entries(day_context)
        .filter(([s, v]) => s !== slot && v)
        .map(([s, v]) => `  ${s}: ${v}`)
        .join('\n')
    : ''

  const systemPrompt = `You are a travel expert writing concise itinerary details for Vondrer.
Return ONLY a JSON object — no markdown, no explanation:
{
  "description":    "2-3 sentences describing the activity, what to expect, why it's worth it",
  "insider_tip":    "one actionable local tip (best time, parking, booking, hidden gem)",
  "estimated_cost": "$X per person" or "Free"
}`

  const userPrompt = `Activity: "${activity}"
Location: ${destination}, ${country}
Time slot: ${slot}
${otherSlots ? `Other activities this day (for context):\n${otherSlots}` : ''}

Write description, insider_tip, and estimated_cost for "${activity}" in ${destination}.`

  try {
    const completion = await openai.chat.completions.create({
      model:           'gpt-4o-mini',
      temperature:     0.7,
      max_tokens:      300,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
    })

    const raw  = completion.choices[0]?.message?.content ?? '{}'
    const data = JSON.parse(raw) as {
      description?: string
      insider_tip?: string
      estimated_cost?: string
    }

    return NextResponse.json({
      description:    data.description    ?? '',
      insider_tip:    data.insider_tip    ?? '',
      estimated_cost: data.estimated_cost ?? '',
    })
  } catch (err) {
    console.error('[Describe]', err)
    return NextResponse.json({ error: 'Failed to generate description' }, { status: 500 })
  }
}
