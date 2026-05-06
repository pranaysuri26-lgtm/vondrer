import { createBrowserClient } from '@supabase/ssr'

// createBrowserClient from @supabase/ssr manages its own internal state —
// calling it multiple times is safe. No singleton needed.
export function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    console.error('[Supabase] Missing env vars. URL:', !!url, 'KEY:', !!key)
    throw new Error('Supabase env vars not set. Check .env.local')
  }

  return createBrowserClient(url, key)
}

export const supabase = getSupabaseClient
