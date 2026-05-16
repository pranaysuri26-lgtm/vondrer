import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { CookieOptions } from '@supabase/ssr'

/**
 * GET /auth/callback
 *
 * Supabase redirects here after Google OAuth with a `code` query param.
 * We exchange it for a session, then send the user to:
 *   - /discover  — if they've completed onboarding
 *   - /signup    — if they're a new user (no onboarding_responses row yet)
 *
 * Critical: cookies from exchangeCodeForSession must be written directly
 * onto the NextResponse object so they travel with the redirect.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  // Collect cookies Supabase wants to set — apply them to the response later
  const pendingCookies: Array<{ name: string; value: string; options: CookieOptions }> = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cs) => cs.forEach(c => pendingCookies.push(c)),
      },
    }
  )

  // exchangeCodeForSession returns the session directly — use it instead of
  // calling getUser() which makes a second network round-trip that can fail
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.session) {
    console.error('[auth/callback]', error?.message ?? 'no session returned')
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  const userId = data.session.user.id

  // Decide where to send the user
  let destination: string

  if (next && next !== '/') {
    destination = next
  } else {
    // Check whether they've completed onboarding
    const { data: onboarding } = await supabase
      .from('onboarding_responses')
      .select('user_id')
      .eq('user_id', userId)
      .single()

    destination = onboarding ? '/discover' : '/signup'
  }

  // Build redirect and stamp all session cookies onto it
  const response = NextResponse.redirect(`${origin}${destination}`)
  pendingCookies.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, options)
  )

  return response
}
