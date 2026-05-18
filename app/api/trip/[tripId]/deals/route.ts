import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const maxDuration = 30

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export interface DealTip {
  title:  string
  detail: string
  badge?: string   // e.g. "Save 30%", "Pro tip"
}

export interface HotelPick {
  name:        string
  area:        string
  why:         string
  price_range: string   // e.g. "$120–$180/night"
  booking_url: string
}

export interface DealsResult {
  flight_tips:  DealTip[]
  hotel_picks:  HotelPick[]
  money_tips:   DealTip[]
  local_hacks:  DealTip[]
}

export async function GET(
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
        setAll: () => {},
      },
    }
  )

  // Public trips are readable without auth — allow via share_token column
  // but we still need trip data
  const { data: trip } = await supabase
    .from('trips')
    .select('id, trip_name, start_date, end_date, total_days')
    .eq('id', tripId)
    .single()

  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  const { data: destinations } = await supabase
    .from('trip_destinations')
    .select('destination_name, country, days, start_date, end_date, notes')
    .eq('trip_id', tripId)
    .order('position', { ascending: true })

  const dests = destinations ?? []
  if (dests.length === 0) return NextResponse.json({ error: 'No destinations' }, { status: 400 })

  const primary      = dests[0]
  const dest         = primary.destination_name
  const country      = primary.country
  const checkIn      = trip.start_date ?? primary.start_date
  const checkOut     = trip.end_date   ?? primary.end_date
  const nights       = trip.total_days ?? dests.reduce((s, d) => s + (d.days ?? 0), 0)

  // Extract neighbourhood hints from itinerary if present
  const notes = primary.notes ? (() => { try { return JSON.parse(primary.notes) } catch { return {} } })() : {}
  const mustDo = (notes.must_do ?? '') as string

  const system = `You are a sharp travel deals researcher. Return ONLY a JSON object — no markdown, no commentary.
JSON shape:
{
  "flight_tips": [
    { "title": "...", "detail": "...", "badge": "optional short badge like 'Save 30%'" }
  ],
  "hotel_picks": [
    { "name": "Specific hotel name", "area": "neighbourhood", "why": "one reason", "price_range": "$X–$Y/night", "booking_url": "https://www.booking.com/searchresults.html?ss=HOTEL+NAME+CITY" }
  ],
  "money_tips": [
    { "title": "...", "detail": "..." }
  ],
  "local_hacks": [
    { "title": "...", "detail": "..." }
  ]
}
Rules:
- flight_tips: 2-3 tips. Include alternative airports if cheaper (with distance/transport), best booking window, and any known airline route tip.
- hotel_picks: 3 real hotels with actual names that exist in ${dest}. Pick areas that match the itinerary activities. Include a mix of budget and mid-range. booking_url should be a working Booking.com search URL.
- money_tips: 2-3 tips on cards, currency, tipping, or payment methods specific to ${country}.
- local_hacks: 2-3 hyper-local tips — transit passes, tourist cards, free days at museums, best time to queue, etc.
- Be specific and actionable. No generic advice like "book early". Use real names, real prices, real routes.`

  const userMsg = `Generate travel deals and tips for:
Destination: ${dest}, ${country}
Check-in: ${checkIn}
Check-out: ${checkOut}
Duration: ${nights} nights
${mustDo ? `Key activities: ${mustDo.slice(0, 300)}` : ''}

Focus on what's specifically useful for this destination and these dates.`

  try {
    const msg = await anthropic.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 1200,
      system,
      messages:   [{ role: 'user', content: userMsg }],
    })

    const raw  = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '{}'
    const data = JSON.parse(
      raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    ) as DealsResult

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    })
  } catch (err) {
    console.error('[Deals]', err)
    return NextResponse.json({ error: 'Could not generate deals.' }, { status: 500 })
  }
}
