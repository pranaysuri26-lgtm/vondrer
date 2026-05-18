import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const ADMIN_EMAILS = [
  'pranaysuri26@gmail.com',
  'sehgalnavina09@gmail.com',
  ...(process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean),
]

export async function GET() {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cs) => {
            try { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) }
            catch { /* read-only in server components */ }
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ isPro: false, isAdmin: false })

    // Admin check — always Pro, no locks
    const isAdmin = ADMIN_EMAILS.includes((user.email ?? '').toLowerCase())
    if (isAdmin) return NextResponse.json({ isPro: true, isAdmin: true })

    // Subscription check
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('tier, expires_at')
      .eq('user_id', user.id)
      .single()

    const isPro = !!sub && sub.tier !== 'free' &&
      (!sub.expires_at || new Date(sub.expires_at) > new Date())

    return NextResponse.json({ isPro, isAdmin: false })
  } catch {
    return NextResponse.json({ isPro: false, isAdmin: false })
  }
}
