import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const maxDuration = 30

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReplaceRequest {
  destination:         string
  country:             string
  day:                 number
  time_of_day:         'morning' | 'afternoon' | 'evening'
  current_activity?:   string
  replacement_request: string
  action:              'replace' | 'add'
  user_profile?: {
    budget_per_day?:      string
    group_type?:          string
    dietary_preferences?: string[]
  }
  full_day_context?: {
    title: string
    morning?:   { activity: string } | null
    afternoon?: { activity: string } | null
    evening?:   { activity: string } | null
  }
  hotel_neighbourhood?: string
  group?: {
    traveler_count?:     number
    dietary_some_veg?:   boolean
    vegetarian_count?:   number
    dietary_halal?:      boolean
    dietary_gluten_free?: boolean
  }
}

// ─── POST /api/itinerary/replace ──────────────────────────────────────────────

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
          try {
            cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // read-only context — ignore
          }
        },
      },
    }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Parse body ────────────────────────────────────────────────────────────────
  let body: ReplaceRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.destination || !body.country || !body.time_of_day || !body.replacement_request) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // ── Build prompt ─────────────────────────────────────────────────────────────
  const vegCount   = body.group?.dietary_some_veg ? (body.group.vegetarian_count ?? 0) : 0
  const totalCount = body.group?.traveler_count ?? 2
  const nonVegCount = totalCount - vegCount
  const hasMixedDiet = vegCount > 0 && nonVegCount > 0
  const isHalal = body.group?.dietary_halal ?? false
  const isGlutenFree = body.group?.dietary_gluten_free ?? false

  const mixedDietWarning = hasMixedDiet
    ? `\nNEVER recommend vegetarian-only restaurants like Greens Restaurant for mixed groups. The group has ${vegCount} vegetarian/vegan AND ${nonVegCount} non-vegetarian travelers — every restaurant must genuinely serve both.`
    : ''

  const halalNote = isHalal ? '\nDietary: halal required — only recommend halal-certified venues.' : ''
  const gfNote    = isGlutenFree ? '\nDietary: gluten-free required — confirm GF options available.' : ''

  const hotelNote = body.hotel_neighbourhood
    ? `\nThe group is staying in ${body.hotel_neighbourhood}. Prefer activities accessible from there.`
    : ''

  const dayCtx = body.full_day_context
    ? `\nRest of Day ${body.day} context (for continuity):
- Morning: ${body.full_day_context.morning?.activity ?? 'empty'}
- Afternoon: ${body.full_day_context.afternoon?.activity ?? 'empty'}
- Evening: ${body.full_day_context.evening?.activity ?? 'empty'}
Do not repeat activities already in this day.`
    : ''

  const actionInstruction = body.action === 'replace'
    ? `Replace the ${body.time_of_day} activity "${body.current_activity ?? 'current activity'}" with: ${body.replacement_request}`
    : `Add a new ${body.time_of_day} activity: ${body.replacement_request}`

  const systemPrompt = `You are a travel expert for Voya. ${actionInstruction} for Day ${body.day} in ${body.destination}, ${body.country}.
${mixedDietWarning}${halalNote}${gfNote}${hotelNote}${dayCtx}

Return ONLY a single JSON object (no array, no markdown, no explanation):
{ "activity": "specific real place name", "description": "2-3 sentences", "insider_tip": "useful tip", "estimated_cost": "$X per person" }

Use only real, currently operating places. Be specific.`

  const userPrompt = `Suggest a ${body.time_of_day} activity for Day ${body.day} in ${body.destination}, ${body.country}. Request: "${body.replacement_request}". Return the JSON object only.`

  try {
    const response = await openai.chat.completions.create({
      model:      'gpt-4o-mini',
      max_tokens: 400,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    })

    const raw = response.choices[0]?.message?.content?.trim() ?? ''

    let block: { activity: string; description: string; insider_tip: string; estimated_cost: string }
    try {
      block = JSON.parse(raw)
      if (!block.activity) throw new Error('Missing activity field')
    } catch {
      console.error('[Replace] Parse error. Raw:', raw.slice(0, 300))
      return NextResponse.json({ error: 'Suggestion failed — please try again.' }, { status: 500 })
    }

    return NextResponse.json(block)
  } catch (err) {
    console.error('[Replace] GPT-4o-mini error:', err)
    return NextResponse.json({ error: 'Suggestion failed — please try again.' }, { status: 500 })
  }
}
