import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

// ─── Supabase migration required ─────────────────────────────────────────────
//
//   CREATE TABLE IF NOT EXISTS trip_templates (
//     id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//     user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE,
//     title            TEXT NOT NULL,
//     description      TEXT,
//     destination_name TEXT NOT NULL,
//     country          TEXT NOT NULL,
//     days             INT  NOT NULL,
//     category         TEXT[] DEFAULT '{}',
//     itinerary_json   JSONB,
//     views            INT  DEFAULT 0,
//     copies           INT  DEFAULT 0,
//     is_public        BOOLEAN DEFAULT TRUE,
//     created_at       TIMESTAMPTZ DEFAULT NOW()
//   );
//   ALTER TABLE trip_templates ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "Public templates are readable by all"
//     ON trip_templates FOR SELECT USING (is_public = true);
//   CREATE POLICY "Users manage their own templates"
//     ON trip_templates FOR ALL USING (auth.uid() = user_id);
//
// ─────────────────────────────────────────────────────────────────────────────

async function getClient() {
  const cookieStore = await cookies()
  return createServerClient(
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
}

// ─── GET /api/templates ───────────────────────────────────────────────────────
// Returns public templates, sorted by copies desc.

export async function GET(req: NextRequest) {
  const supabase = await getClient()
  const { searchParams } = new URL(req.url)
  const q  = searchParams.get('q')?.trim()
  const cat = searchParams.get('category')

  let query = supabase
    .from('trip_templates')
    .select('id, title, description, destination_name, country, days, category, views, copies, created_at, destinations')
    .eq('is_public', true)
    .order('copies', { ascending: false })
    .limit(40)

  if (q)   query = query.ilike('destination_name', `%${q}%`)
  if (cat) query = query.contains('category', [cat])

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templates: data ?? [] })
}

// ─── POST /api/templates ──────────────────────────────────────────────────────
// Publish a trip as a template.

export async function POST(req: NextRequest) {
  const supabase = await getClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { trip_id, description, category, is_public = true } = await req.json() as {
    trip_id:     string
    description: string
    category:    string[]
    is_public?:  boolean
  }

  // Fetch trip + destinations
  const { data: trip } = await supabase
    .from('trips')
    .select('trip_name, user_id')
    .eq('id', trip_id)
    .single()

  if (!trip || trip.user_id !== user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: dests } = await supabase
    .from('trip_destinations')
    .select('destination_name, country, days, itinerary_json')
    .eq('trip_id', trip_id)
    .order('position', { ascending: true })

  const primaryDest = dests?.[0]
  if (!primaryDest) return NextResponse.json({ error: 'No destinations found' }, { status: 400 })

  const { data: tmpl, error } = await supabase
    .from('trip_templates')
    .insert({
      user_id:          user.id,
      title:            trip.trip_name,
      description,
      destination_name: primaryDest.destination_name,
      country:          primaryDest.country,
      days:             dests!.reduce((s, d) => s + d.days, 0),
      category,
      itinerary_json:   dests?.map(d => d.itinerary_json),
      destinations:     dests?.map(d => ({
        destination_name: d.destination_name,
        country:          d.country,
        days:             d.days,
      })) ?? [],
      is_public,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  revalidatePath('/templates')
  return NextResponse.json({ id: tmpl.id })
}
