import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createHash, randomBytes } from 'crypto'

// ─── Supabase migration required ─────────────────────────────────────────────
//
//   CREATE TABLE IF NOT EXISTS api_keys (
//     id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//     user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE,
//     name           TEXT NOT NULL,
//     key_hash       TEXT NOT NULL UNIQUE,
//     key_prefix     TEXT NOT NULL,
//     created_at     TIMESTAMPTZ DEFAULT NOW(),
//     last_used_at   TIMESTAMPTZ,
//     requests_count INT DEFAULT 0
//   );
//   ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "Users manage own keys"
//     ON api_keys FOR ALL USING (auth.uid() = user_id);
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

// ─── GET /api/developer/keys ──────────────────────────────────────────────────

export async function GET() {
  const supabase = await getClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('api_keys')
    .select('id, name, key_prefix, created_at, last_used_at, requests_count')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ keys: data ?? [] })
}

// ─── POST /api/developer/keys ─────────────────────────────────────────────────
// Creates a new API key. Returns the raw key ONCE — never stored in plain text.

export async function POST(req: NextRequest) {
  const supabase = await getClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await req.json() as { name: string }
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  // Max 5 keys per user
  const { count } = await supabase
    .from('api_keys')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
  if ((count ?? 0) >= 5)
    return NextResponse.json({ error: 'Maximum 5 API keys per account' }, { status: 400 })

  const rawKey    = `vondrer_${randomBytes(24).toString('hex')}`
  const keyHash   = createHash('sha256').update(rawKey).digest('hex')
  const keyPrefix = rawKey.slice(0, 12)

  const { data, error } = await supabase
    .from('api_keys')
    .insert({ user_id: user.id, name: name.trim(), key_hash: keyHash, key_prefix: keyPrefix })
    .select('id, name, key_prefix, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ key: rawKey, meta: data })
}

// ─── DELETE /api/developer/keys ───────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const supabase = await getClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json() as { id: string }
  const { error } = await supabase
    .from('api_keys')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
