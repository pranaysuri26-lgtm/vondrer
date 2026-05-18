import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const maxDuration = 60

// POST /api/plan/auto-generate
// Takes an InspirationResult and generates + saves the trip in one step.
// Returns { share_token } for redirect to /trip/[share_token].

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
          catch { /* read-only in middleware */ }
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    destination: string
    country:     string
    days:        number
    budget:      string
    interests:   string[]
    activities:  string[]   // must-do places extracted from inspiration
  }

  if (!body.destination || !body.country || !body.days) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Fetch user profile for richer itinerary generation
  const { data: profile } = await supabase
    .from('onboarding_responses')
    .select('budget_per_day, group_type, interests, dietary_preferences, home_city, home_country')
    .eq('user_id', user.id)
    .single()

  const today    = new Date().toISOString().split('T')[0]
  const mustDo   = body.activities?.length > 0
    ? `Must include these places/activities from my inspiration:\n${body.activities.join('\n')}`
    : undefined

  // Call the itinerary API internally — forward cookies so auth works
  const cookieHeader = cookieStore.getAll()
    .map(c => `${c.name}=${c.value}`)
    .join('; ')

  const itineraryRes = await fetch(
    new URL('/api/itinerary', req.url).toString(),
    {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie':        cookieHeader,
      },
      body: JSON.stringify({
        destination:  body.destination,
        country:      body.country,
        days:         body.days,
        start_date:   today,
        trip_interests: body.interests?.length > 0 ? body.interests : (profile?.interests ?? []),
        trip_pace:    'balanced',
        must_do:      mustDo,
        user_profile: {
          budget_per_day:      body.budget || profile?.budget_per_day || '50-150',
          group_type:          profile?.group_type          ?? 'couple',
          interests:           profile?.interests           ?? [],
          dietary_preferences: profile?.dietary_preferences ?? [],
          home_city:           profile?.home_city           ?? '',
          home_country:        profile?.home_country        ?? '',
        },
      }),
    }
  )

  if (!itineraryRes.ok) {
    const err = await itineraryRes.json().catch(() => ({}))
    return NextResponse.json(
      { error: (err as { error?: string }).error ?? 'Itinerary generation failed.' },
      { status: 500 }
    )
  }

  const itinerary = await itineraryRes.json() as {
    itinerary: Array<{
      day: number; title: string
      morning: unknown; afternoon: unknown; dinner: unknown; evening: unknown
      day_total_estimate: string
    }>
    pre_trip?: unknown
  }

  const endDate = new Date(
    new Date(today).getTime() + (body.days - 1) * 86400000
  ).toISOString().split('T')[0]

  // Save trip
  const { data: trip, error: tripErr } = await supabase
    .from('trips')
    .insert({
      user_id:    user.id,
      trip_name:  `${body.destination} trip`,
      total_days: body.days,
      start_date: today,
      end_date:   endDate,
      trip_pace:  'balanced',
    })
    .select('id, share_token')
    .single()

  if (tripErr || !trip) {
    console.error('[auto-generate] trip insert error:', tripErr)
    return NextResponse.json({ error: 'Failed to save trip.' }, { status: 500 })
  }

  // Save destination with itinerary
  const itineraryJson = itinerary.itinerary?.map(
    ({ day, title, morning, afternoon, dinner, evening, day_total_estimate }) =>
      ({ day, title, morning, afternoon, dinner, evening, day_total_estimate })
  ) ?? null

  await supabase.from('trip_destinations').insert({
    trip_id:          trip.id,
    destination_name: body.destination,
    country:          body.country,
    position:         0,
    days:             body.days,
    start_date:       today,
    end_date:         endDate,
    itinerary_json:   itineraryJson,
    notes: JSON.stringify({
      must_do:      mustDo ?? null,
      trip_context: mustDo ?? null,
    }),
  })

  return NextResponse.json({ share_token: trip.share_token })
}
