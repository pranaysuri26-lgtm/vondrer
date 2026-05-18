import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(
  _req: NextRequest,
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

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership before allowing token regeneration
  const { data: trip } = await supabase
    .from('trips')
    .select('id, user_id')
    .eq('id', tripId)
    .single()

  if (!trip || trip.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // gen_random_uuid() produces a new UUID — old share_token is immediately invalid
  const { data: updated, error } = await supabase
    .from('trips')
    .update({ share_token: crypto.randomUUID() })
    .eq('id', tripId)
    .select('share_token')
    .single()

  if (error || !updated) {
    return NextResponse.json({ error: 'Failed to regenerate link' }, { status: 500 })
  }

  return NextResponse.json({ share_token: updated.share_token })
}
