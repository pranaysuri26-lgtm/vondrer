import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { ItineraryDay } from '@/app/api/itinerary/route'

export const maxDuration = 30

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ─── POST /api/trip/[tripId]/replan-day ───────────────────────────────────────
// Regenerate a single day with a fresh AI perspective.
// Body: { destination_id, day_number, destination_name, country, reason?, constraints? }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params

  // Auth
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

  // Ownership
  const { data: trip } = await supabase
    .from('trips')
    .select('user_id')
    .eq('id', tripId)
    .single()
  if (!trip || trip.user_id !== user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const {
    destination_id,
    day_number,
    destination_name,
    country,
    reason,
    constraints,
    existing_day,
  } = await req.json() as {
    destination_id:   string
    day_number:       number
    destination_name: string
    country:          string
    reason?:          string    // e.g. "weather is bad", "already did morning activity"
    constraints?:     string    // e.g. "keep dinner block", "avoid museums"
    existing_day?:    ItineraryDay
  }

  const existingContext = existing_day
    ? `Current plan for this day (avoid repeating these unless kept by constraint):
Morning:   ${existing_day.morning?.activity ?? '—'}
Afternoon: ${existing_day.afternoon?.activity ?? '—'}
Dinner:    ${existing_day.dinner?.activity ?? '—'}
Evening:   ${existing_day.evening?.activity ?? '—'}`
    : ''

  const system = `You are a travel itinerary expert. Return ONLY a valid JSON object for a single day — no markdown, no explanation.

Schema:
{
  "day": ${day_number},
  "title": "📍 ${destination_name} — Day ${day_number}: [evocative subtitle]",
  "morning":   { "activity": "", "start_time": "HH:MM", "end_time": "HH:MM", "description": "2-3 sentences", "insider_tip": "", "estimated_cost": "" },
  "afternoon": { "activity": "", "start_time": "HH:MM", "end_time": "HH:MM", "description": "2-3 sentences", "insider_tip": "", "estimated_cost": "" },
  "dinner":    { "activity": "ALWAYS a specific named restaurant", "start_time": "HH:MM", "end_time": "HH:MM", "description": "", "insider_tip": "", "estimated_cost": "" },
  "evening":   { "activity": "", "start_time": "HH:MM", "end_time": "HH:MM", "description": "", "insider_tip": "", "estimated_cost": "" },
  "day_total_estimate": "$X–$Y per person"
}

Rules: real place names only, specific restaurants, time windows in 24h HH:MM format.`

  const userPrompt = `Re-plan Day ${day_number} in ${destination_name}, ${country}.
${reason       ? `Reason for re-plan: ${reason}`       : ''}
${constraints  ? `Keep/avoid: ${constraints}`           : 'Make it completely fresh — different vibe from the original.'}
${existingContext}`

  try {
    const msg = await anthropic.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 1200,
      system,
      messages:   [{ role: 'user', content: userPrompt }],
    })
    const raw     = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '{}'
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    const newDay  = JSON.parse(cleaned) as ItineraryDay

    // Persist the updated day
    const { data: dest } = await supabase
      .from('trip_destinations')
      .select('itinerary_json')
      .eq('id', destination_id)
      .single()

    if (!dest?.itinerary_json)
      return NextResponse.json({ error: 'Destination not found' }, { status: 404 })

    const itinerary = (dest.itinerary_json as ItineraryDay[]).map(d =>
      d.day === day_number ? newDay : d
    )
    await supabase
      .from('trip_destinations')
      .update({ itinerary_json: itinerary })
      .eq('id', destination_id)

    return NextResponse.json({ day: newDay })
  } catch (err) {
    console.error('[Replan]', err)
    return NextResponse.json({ error: 'Re-planning failed — try again.' }, { status: 500 })
  }
}
