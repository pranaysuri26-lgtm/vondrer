import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Middleware already handles unauthenticated users (rewrites to /landing.html)
// This page only runs for authenticated users.

export default async function RootPage() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) =>
          cs.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
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
