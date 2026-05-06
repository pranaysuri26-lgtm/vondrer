import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Link from 'next/link'

// ─── Root page ────────────────────────────────────────────────────────────────
// Authenticated + onboarded  → /discover
// Authenticated + incomplete → /signup
// Not authenticated          → landing page (getvoya.net)

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

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_done')
      .eq('id', user.id)
      .single()

    redirect(profile?.onboarding_done ? '/discover' : '/signup')
  }

  // ── Landing page ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0d1f35] flex flex-col">

      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-5xl mx-auto w-full">
        <span className="font-serif italic text-2xl text-white/90 tracking-wide">Voya</span>
        <Link
          href="/login"
          className="text-xs text-white/45 hover:text-white/70 transition-colors font-label tracking-widest uppercase"
        >
          Sign in
        </Link>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center max-w-2xl mx-auto w-full">

        {/* Eyebrow */}
        <p className="text-xs text-[#C97552] font-label tracking-[0.2em] uppercase mb-6">
          Travel discovery
        </p>

        {/* Headline */}
        <h1 className="font-serif italic text-5xl sm:text-6xl text-white leading-[1.08] mb-6">
          Find places most apps
          <br />
          <span className="text-white/50">will never show you.</span>
        </h1>

        {/* Sub */}
        <p className="text-white/45 text-base sm:text-lg font-light leading-relaxed max-w-md mb-10">
          Three hidden-gem destinations a month, matched to your budget,
          your pace, and your version of beautiful. Free, forever.
        </p>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Link
            href="/signup"
            className="bg-white text-[#0d1f35] font-semibold px-8 py-4 rounded-full hover:bg-white/90 transition-all text-sm tracking-wide"
          >
            Find my destinations →
          </Link>
          <Link
            href="/login"
            className="bg-white/8 border border-white/15 text-white/70 font-medium px-8 py-4 rounded-full hover:bg-white/12 hover:text-white transition-all text-sm"
          >
            I have an account
          </Link>
        </div>

        {/* Social proof */}
        <p className="text-white/25 text-xs mt-8 font-label tracking-wider uppercase">
          Takes 2 minutes &nbsp;·&nbsp; No credit card &nbsp;·&nbsp; Free forever
        </p>
      </main>

      {/* Feature strip */}
      <section className="max-w-5xl mx-auto w-full px-6 py-14">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              icon: '🧭',
              title: 'Actually offbeat',
              body: 'Our AI is trained to avoid the obvious. No Paris. No Bali. No Santorini.'
            },
            {
              icon: '🎯',
              title: 'Matched to you',
              body: 'Budget, pace, group size, and how far off the beaten path you actually want to go.'
            },
            {
              icon: '🔒',
              title: 'No algorithm anxiety',
              body: 'Three destinations a month. Curated, not infinite. So you can actually decide.'
            },
          ].map(f => (
            <div
              key={f.title}
              className="bg-white/4 border border-white/8 rounded-2xl p-6"
            >
              <div className="text-2xl mb-3">{f.icon}</div>
              <h3 className="text-white font-medium mb-1.5 text-sm">{f.title}</h3>
              <p className="text-white/40 text-sm leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/8 px-6 py-6 max-w-5xl mx-auto w-full flex items-center justify-between">
        <span className="font-serif italic text-white/30 text-sm">Voya</span>
        <p className="text-white/20 text-xs">getvoya.net</p>
      </footer>

    </div>
  )
}
