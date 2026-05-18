import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { ItineraryBlock, ItineraryDay } from '@/app/api/itinerary/route'

async function getAuthedClient(tripId: string) {
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
  if (!user) return { supabase, user: null }

  const { data: trip } = await supabase.from('trips').select('user_id').eq('id', tripId).single()
  if (!trip || trip.user_id !== user.id) return { supabase, user: null }

  return { supabase, user }
}

// POST — append a custom stop to a day's extra_stops
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params
  const { supabase, user } = await getAuthedClient(tripId)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { destination_id, day, block } = await req.json() as {
    destination_id: string
    day:            number
    block:          ItineraryBlock
  }

  const { data: dest } = await supabase
    .from('trip_destinations')
    .select('itinerary_json')
    .eq('id', destination_id)
    .single()

  if (!dest?.itinerary_json) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const itinerary = (dest.itinerary_json as ItineraryDay[]).map(d => {
    if (d.day !== day) return d
    return { ...d, extra_stops: [...(d.extra_stops ?? []), block] }
  })

  const { error } = await supabase.from('trip_destinations').update({ itinerary_json: itinerary }).eq('id', destination_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — remove a stop by index from a day's extra_stops
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params
  const { supabase, user } = await getAuthedClient(tripId)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { destination_id, day, index } = await req.json() as {
    destination_id: string
    day:            number
    index:          number
  }

  const { data: dest } = await supabase
    .from('trip_destinations')
    .select('itinerary_json')
    .eq('id', destination_id)
    .single()

  if (!dest?.itinerary_json) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const itinerary = (dest.itinerary_json as ItineraryDay[]).map(d => {
    if (d.day !== day) return d
    const stops = (d.extra_stops ?? []).filter((_, i) => i !== index)
    return { ...d, extra_stops: stops }
  })

  const { error } = await supabase.from('trip_destinations').update({ itinerary_json: itinerary }).eq('id', destination_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
