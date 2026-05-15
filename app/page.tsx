import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Middleware already handles unauthenticated users (rewrites to /landing.html)
// This page only runs for authenticated users.

export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; next?: string }>
}) {
  // If Supabase redirected here with ?code= (dashboard redirect URL = "/"),
  // forward to the dedicated callback handler so the code gets exchanged.
  const params = await searchParams
  if (params.code) {
    const qs = new URLSearchParams({ code: params.code })
    if (params.next) qs.set('next', params.next)
    redirect(`/auth/callback?${qs.toString()}`)
  }
  const cookieStore = await cookies()

  // In Next.js 15+, cookies().set() throws in Server Components.
  // The try/catch swallows it safely — middleware handles session refresh.
  // See: https://supabase.com/docs/guides/auth/server-side/nextjs
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => {
          try {
            cs.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Expected in Server Components — middleware keeps the session fresh
          }
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/landing.html')

  // Check onboarding_responses — more reliable than profiles.onboarding_done flag
  // If the user has answered onboarding questions, send them to /discover
  const { data: onboarding } = await supabase
    .from('onboarding_responses')
    .select('user_id')
    .eq('user_id', user.id)
    .single()

  redirect(onboarding ? '/discover' : '/signup')
}
