import { createBrowserClient } from '@supabase/ssr'

// ─── Browser client (singleton — safe to call in any client component) ────────
let _client: ReturnType<typeof createBrowserClient> | null = null

export function getSupabaseClient() {
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _client
}

// Convenience alias
export const supabase = getSupabaseClient
