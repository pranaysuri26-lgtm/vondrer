import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Runs only on the root path.
// Unauthenticated → serve /landing.html content at getvoya.net (URL stays clean)
// Authenticated   → let app/page.tsx handle the redirect to /discover or /signup

export async function middleware(request: NextRequest) {
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
    // Rewrite: serve /landing.html but keep URL as getvoya.net
    return NextResponse.rewrite(new URL('/landing.html', request.url))
  }

  return response
}

export const config = {
  matcher: ['/'],   // Only intercept the root path
}
