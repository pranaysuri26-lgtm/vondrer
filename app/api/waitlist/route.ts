import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Run in Supabase SQL Editor before deploying:
// CREATE TABLE IF NOT EXISTS waitlist (
//   id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//   email      TEXT NOT NULL,
//   source     TEXT DEFAULT 'paywall',
//   created_at TIMESTAMPTZ DEFAULT NOW()
// );
// ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "Service role only" ON waitlist USING (false);

export async function POST(req: NextRequest) {
  let email: string
  try {
    const body = await req.json()
    email = (body.email ?? '').trim().toLowerCase()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }

  // Service role key — writes bypass RLS so we can insert from this public endpoint
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { error } = await supabase.from('waitlist').insert({ email, source: 'paywall' })

  // Ignore duplicate email errors (unique constraint) — still return success
  if (error && !error.message.includes('duplicate') && !error.message.includes('unique')) {
    console.error('[Waitlist]', error.message)
    return NextResponse.json({ error: 'Failed to join waitlist' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
