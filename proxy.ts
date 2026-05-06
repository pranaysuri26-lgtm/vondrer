import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Next.js 16: renamed from middleware.ts → proxy.ts
// Runs only on the root path.
// Unauthenticated → serve /landing.html at getvoya.net (URL stays clean)
// Authenticated   → let app/page.tsx handle redirect to /discover or /signup

export async function middleware(request: NextRequest) {
  try {
    let response = NextResponse.next({ request })

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cs) => {
            cs.forEach(({ name, value }) => request.cookies.set(name, value))
            response = NextResponse.next({ request })
            cs.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.rewrite(new URL('/landing.html', request.url))
    }

    return response
  } catch {
    // If auth check fails for any reason, show landing page rather than error
    return NextResponse.rewrite(new URL('/landing.html', request.url))
  }
}

export const config = {
  matcher: ['/'],   // Only intercept the root path
}
