import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service-role read — share_token acts as a capability URL; anyone with the
// UUID can view the trip. Service role bypasses RLS so collaborators (non-owners)
// can load the trip data without being authenticated.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Fetch trip by share_token
  const { data: trip, error: tripErr } = await supabase
    .from('trips')
    .select('id, trip_name, user_id, start_date, end_date, share_token')
    .eq('share_token', token)
    .single()

  if (tripErr || !trip) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
  }

  // Fetch destinations
  const { data: destinations } = await supabase
    .from('trip_destinations')
    .select('id, destination_name, country, days, start_date, end_date, position, itinerary_json')
    .eq('trip_id', trip.id)
    .order('position', { ascending: true })

  // Fetch initial comments
  const { data: comments } = await supabase
    .from('trip_comments')
    .select('*')
    .eq('trip_id', trip.id)
    .order('created_at', { ascending: true })

  return NextResponse.json({
    trip,
    destinations: destinations ?? [],
    comments:     comments     ?? [],
  })
}
