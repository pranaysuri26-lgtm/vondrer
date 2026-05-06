import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Next.js 16 proxy (replaces middleware.ts)
// Runs only on the root path.
// Check session cookie directly — avoids Supabase API call at edge runtime.
// Unauthenticated → serve /landing.html at getvoya.net (URL stays clean)
// Authenticated   → let app/page.tsx handle redirect to /discover or /signup

export async function proxy(request: NextRequest) {
  // Supabase stores the session in cookies named like:
  // sb-<project-ref>-auth-token or sb-<project-ref>-auth-token.0
  const hasSession = request.cookies.getAll().some(
    c => c.name.includes('-auth-token') && c.value.length > 20
  )

  if (!hasSession) {
    return NextResponse.rewrite(new URL('/landing.html', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/'],
}
