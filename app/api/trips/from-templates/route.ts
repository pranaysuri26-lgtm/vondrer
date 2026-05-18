import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface FromTemplatesBody {
  name:         string
  template_ids: string[]
}

// ─── POST /api/trips/from-templates ──────────────────────────────────────────

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
          catch { /* read-only context */ }
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Parse body ────────────────────────────────────────────────────────────────
  let body: FromTemplatesBody
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  const { name, template_ids } = body
  if (!name || !Array.isArray(template_ids) || template_ids.length === 0)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  // ── Fetch templates ───────────────────────────────────────────────────────────
  const { data: templates, error: templatesErr } = await supabase
    .from('trip_templates')
    .select('id, title, destination_name, country, days, itinerary_json, copies')
    .in('id', template_ids)

  if (templatesErr)
    return NextResponse.json({ error: templatesErr.message }, { status: 500 })

  if (!templates || templates.length === 0)
    return NextResponse.json({ error: 'Templates not found' }, { status: 404 })

  // Preserve the order from template_ids (DB may return in any order)
  const templateMap = new Map(templates.map(t => [t.id, t]))
  const orderedTemplates = template_ids
    .map(id => templateMap.get(id))
    .filter((t): t is NonNullable<typeof t> => t != null)

  // ── Create trip ───────────────────────────────────────────────────────────────
  const totalDays = orderedTemplates.reduce((sum, t) => sum + (t.days ?? 0), 0)

  const { data: trip, error: tripErr } = await supabase
    .from('trips')
    .insert({
      user_id:    user.id,
      trip_name:  name,
      total_days: totalDays,
      status:     'planning',
    })
    .select('id, share_token')
    .single()

  if (tripErr || !trip)
    return NextResponse.json({ error: tripErr?.message ?? 'Failed to create trip' }, { status: 500 })

  // ── Create trip_destinations ──────────────────────────────────────────────────
  const destinations = orderedTemplates.map((t, index) => ({
    trip_id:          trip.id,
    destination_name: t.destination_name,
    country:          t.country,
    days:             t.days,
    position:         index,
    itinerary_json:   Array.isArray(t.itinerary_json) ? (t.itinerary_json[0] ?? null) : null,
  }))

  const { error: destErr } = await supabase
    .from('trip_destinations')
    .insert(destinations)

  if (destErr)
    return NextResponse.json({ error: destErr.message }, { status: 500 })

  // ── Increment copies on each template (fire-and-forget) ───────────────────────
  void Promise.all(
    templates.map(t =>
      supabase
        .from('trip_templates')
        .update({ copies: (t.copies ?? 0) + 1 })
        .eq('id', t.id)
    )
  )

  return NextResponse.json({ share_token: trip.share_token })
}
