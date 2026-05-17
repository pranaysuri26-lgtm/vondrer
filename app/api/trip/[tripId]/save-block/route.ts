import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { ItineraryBlock, ItineraryDay } from '@/app/api/itinerary/route'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SaveBlockBody {
  destination_id: string
  day:            number
  slot:           'morning' | 'afternoon' | 'dinner' | 'evening'
  block:          ItineraryBlock
}

// ─── PATCH /api/trip/[tripId]/save-block ──────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params

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

  // ── Ownership check ───────────────────────────────────────────────────────────
  const { data: trip } = await supabase
    .from('trips')
    .select('user_id')
    .eq('id', tripId)
    .single()

  if (!trip || trip.user_id !== user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // ── Parse body ────────────────────────────────────────────────────────────────
  let body: SaveBlockBody
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  const { destination_id, day, slot, block } = body
  if (!destination_id || !day || !slot || !block)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  // ── Fetch current itinerary ───────────────────────────────────────────────────
  const { data: dest } = await supabase
    .from('trip_destinations')
    .select('itinerary_json')
    .eq('id', destination_id)
    .single()

  if (!dest?.itinerary_json)
    return NextResponse.json({ error: 'Destination not found' }, { status: 404 })

  // ── Patch the single block, leave everything else untouched ───────────────────
  const itinerary = (dest.itinerary_json as ItineraryDay[]).map(d =>
    d.day === day ? { ...d, [slot]: block } : d
  )

  const { error: updateErr } = await supabase
    .from('trip_destinations')
    .update({ itinerary_json: itinerary })
    .eq('id', destination_id)

  if (updateErr)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
