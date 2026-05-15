import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { CookieOptions } from '@supabase/ssr'

/**
 * GET /auth/callback
 *
 * Supabase redirects here after Google OAuth with a `code` query param.
 * We exchange it for a session cookie, then send the user to:
 *   - /discover  — if they've completed onboarding
 *   - /signup    — if they're a new user (no onboarding_responses row yet)
 *
 * Critical: cookies from exchangeCodeForSession must be written directly onto
 * the NextResponse object — NOT via cookies() from next/headers — otherwise
 * they're lost on the redirect and the proxy sees no session.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  // Collect cookies Supabase wants to set, apply them to the response later
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

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('[auth/callback]', error.message)
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=no_user`)
  }

  // Decide destination
  let destination: string

  if (next && next !== '/') {
    destination = next
  } else {
    const { data: onboarding } = await supabase
      .from('onboarding_responses')
      .select('user_id')
      .eq('user_id', user.id)
      .single()

    destination = onboarding ? '/discover' : '/signup'
  }

  // Build the redirect and stamp all session cookies onto it
  const response = NextResponse.redirect(`${origin}${destination}`)
  pendingCookies.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, options)
  )

  return response
}
