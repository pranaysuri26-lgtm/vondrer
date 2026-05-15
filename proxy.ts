import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Next.js 16 proxy (replaces middleware.ts)
// Handles two concerns:
//   1. Root path ("/") — rewrite to /landing.html for unauthenticated visitors
//   2. Protected app routes — redirect to /login if no valid session

const PROTECTED = [
  '/discover',
  '/plan',
  '/trips',
  '/passport',
  '/profile',
  '/deals',
  '/guide',
]

function isProtected(pathname: string): boolean {
  return PROTECTED.some(p => pathname === p || pathname.startsWith(p + '/'))
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Root path: fast cookie check (no Supabase API call) ──────────────────────
  if (pathname === '/') {
    const hasSession = request.cookies.getAll().some(
      c => c.name.includes('-auth-token') && c.value.length > 20
    )
    if (!hasSession) {
      return NextResponse.rewrite(new URL('/landing.html', request.url))
    }
    return NextResponse.next()
  }

  // ── Protected routes: full Supabase session check + cookie refresh ────────────
  if (isProtected(pathname)) {
    let res = NextResponse.next({ request: { headers: request.headers } })

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            // Write refreshed session cookies back onto request + response
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            res = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) =>
              res.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    // getSession() refreshes an expired token if a refresh token is present
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    return res
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/',
    '/discover/:path*',
    '/plan/:path*',
    '/trips/:path*',
    '/passport/:path*',
    '/profile/:path*',
    '/deals/:path*',
    '/guide/:path*',
  ],
}
