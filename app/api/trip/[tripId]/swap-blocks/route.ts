import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { ItineraryBlock, ItineraryDay } from '@/app/api/itinerary/route'

interface SwapBlocksBody {
  from: { dest_id: string; day: number; slot: string }
  to:   { dest_id: string; day: number; slot: string }
}

// PATCH /api/trip/[tripId]/swap-blocks
// Swaps two activity blocks (possibly across destinations or days).
// Returns the resulting blocks at each position.

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params

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

  const { data: trip } = await supabase
    .from('trips')
    .select('user_id')
    .eq('id', tripId)
    .single()
  if (!trip || trip.user_id !== user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: SwapBlocksBody
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  const { from, to } = body
  if (!from?.dest_id || !from?.day || !from?.slot || !to?.dest_id || !to?.day || !to?.slot)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const sameDest = from.dest_id === to.dest_id

  // Load from-destination
  const { data: fromDest } = await supabase
    .from('trip_destinations')
    .select('itinerary_json')
    .eq('id', from.dest_id)
    .single()
  if (!fromDest?.itinerary_json)
    return NextResponse.json({ error: 'From destination not found' }, { status: 404 })

  const fromItinerary = fromDest.itinerary_json as ItineraryDay[]

  // Load to-destination (may be the same row)
  let toItinerary: ItineraryDay[]
  if (sameDest) {
    toItinerary = fromItinerary
  } else {
    const { data: toDest } = await supabase
      .from('trip_destinations')
      .select('itinerary_json')
      .eq('id', to.dest_id)
      .single()
    if (!toDest?.itinerary_json)
      return NextResponse.json({ error: 'To destination not found' }, { status: 404 })
    toItinerary = toDest.itinerary_json as ItineraryDay[]
  }

  const fromDayData = fromItinerary.find(d => d.day === from.day)
  const toDayData   = toItinerary.find(d => d.day === to.day)
  if (!fromDayData || !toDayData)
    return NextResponse.json({ error: 'Day not found' }, { status: 404 })

  const fromBlock = (fromDayData as unknown as Record<string, unknown>)[from.slot] as ItineraryBlock | undefined
  const toBlock   = (toDayData   as unknown as Record<string, unknown>)[to.slot]   as ItineraryBlock | undefined
  if (!fromBlock || !toBlock)
    return NextResponse.json({ error: 'Slot not found' }, { status: 404 })

  // Apply swap: from-slot gets toBlock, to-slot gets fromBlock
  const newFromItinerary = fromItinerary.map(d =>
    d.day === from.day ? { ...d, [from.slot]: toBlock } : d
  )
  // For same dest, chain on top of newFromItinerary; for different dest, map toItinerary directly
  const newToItinerary = sameDest
    ? newFromItinerary.map(d => d.day === to.day ? { ...d, [to.slot]: fromBlock } : d)
    : toItinerary.map(d => d.day === to.day ? { ...d, [to.slot]: fromBlock } : d)

  if (sameDest) {
    const { error } = await supabase
      .from('trip_destinations')
      .update({ itinerary_json: newToItinerary })
      .eq('id', from.dest_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const [r1, r2] = await Promise.all([
      supabase.from('trip_destinations').update({ itinerary_json: newFromItinerary }).eq('id', from.dest_id),
      supabase.from('trip_destinations').update({ itinerary_json: newToItinerary   }).eq('id', to.dest_id),
    ])
    if (r1.error || r2.error)
      return NextResponse.json({ error: r1.error?.message ?? r2.error?.message }, { status: 500 })
  }

  return NextResponse.json({
    ok:             true,
    result_at_from: toBlock,    // block now sitting at the source slot
    result_at_to:   fromBlock,  // block now sitting at the target slot
  })
}
