import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface BudgetExpense {
  id:        string
  day?:      number          // null = trip-level (flights, hotels)
  category:  'activities' | 'food' | 'transport' | 'accommodation' | 'other'
  name:      string
  planned:   number          // expected cost (per-person)
  actual:    number | null   // null = not spent yet
  note?:     string
  currency:  string          // ISO e.g. 'USD'
}

// ─── Supabase migration required ─────────────────────────────────────────────
// Run once in your Supabase SQL editor:
//
//   ALTER TABLE trips ADD COLUMN IF NOT EXISTS budget_json JSONB DEFAULT '[]'::jsonb;
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
          catch { /* read-only context */ }
        },
      },
    }
  )
}

// ─── GET /api/trip/[tripId]/budget ────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params
  const supabase = await getClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: trip } = await supabase
    .from('trips')
    .select('budget_json, user_id')
    .eq('id', tripId)
    .single()

  if (!trip || trip.user_id !== user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return NextResponse.json({ expenses: trip.budget_json ?? [] })
}

// ─── PATCH /api/trip/[tripId]/budget ─────────────────────────────────────────
// Replaces the full expenses array (client owns the diff).

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params
  const supabase = await getClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: trip } = await supabase
    .from('trips')
    .select('user_id')
    .eq('id', tripId)
    .single()

  if (!trip || trip.user_id !== user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { expenses } = await req.json() as { expenses: BudgetExpense[] }

  const { error } = await supabase
    .from('trips')
    .update({ budget_json: expenses })
    .eq('id', tripId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
