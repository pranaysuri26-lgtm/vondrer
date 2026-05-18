'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSupabaseClient } from '@/lib/supabase'

const TRIPS = [
  {
    photo:       'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=800&q=80&auto=format',
    destination: 'Kyoto, Japan',
    days:        7,
    budget:      '$95/day',
    style:       'Cultural Immersion',
    stops:       ['Fushimi Inari Shrine', 'Arashiyama Bamboo Grove', 'Philosopher\'s Path'],
  },
  {
    photo:       'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=800&q=80&auto=format',
    destination: 'Santorini, Greece',
    days:        5,
    budget:      '$140/day',
    style:       'Slow Travel',
    stops:       ['Oia Sunset Viewpoint', 'Akrotiri Ruins', 'Red Beach'],
  },
  {
    photo:       'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800&q=80&auto=format',
    destination: 'Bali, Indonesia',
    days:        10,
    budget:      '$60/day',
    style:       'Adventure + Wellness',
    stops:       ['Tegallalang Rice Terraces', 'Uluwatu Temple', 'Seminyak Beach'],
  },
  {
    photo:       'https://images.unsplash.com/photo-1539037116277-4db20889f2d4?w=800&q=80&auto=format',
    destination: 'Barcelona, Spain',
    days:        4,
    budget:      '$110/day',
    style:       'Food & Architecture',
    stops:       ['Sagrada Família', 'El Born Market', 'Barceloneta Beach'],
  },
]

export default function LoginPage() {
  const router  = useRouter()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [trip,     setTrip]     = useState(TRIPS[0])

  useEffect(() => {
    setTrip(TRIPS[Math.floor(Math.random() * TRIPS.length)])
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const supabase = getSupabaseClient()
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
    if (loginError) { setError(loginError.message); setLoading(false); return }
    router.push('/discover')
  }

  async function handleGoogleLogin() {
    setLoading(true)
    const supabase = getSupabaseClient()
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options:  { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (oauthError) { setError(oauthError.message); setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex">

      {/* ── Left: form panel ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col justify-between px-8 py-10 max-w-lg mx-auto w-full lg:mx-0">

        {/* Wordmark */}
        <Link href="/" className="font-serif italic text-2xl text-[#1A1A1A] tracking-wide">
          vondrer
        </Link>

        {/* Form */}
        <div className="w-full max-w-sm mx-auto lg:mx-0">
          <p className="text-xs text-[#C97552] uppercase tracking-widest mb-3">Welcome back</p>
          <h1 className="font-serif italic text-4xl text-[#1A1A1A] leading-tight mb-8">
            Your next trip<br />is waiting.
          </h1>

          {/* Google */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white border border-[#E0D8CF] text-[#1A1A1A] text-sm font-medium py-3 rounded-full mb-5 hover:border-[#C8C0B4] hover:bg-[#F5F0EA] transition-all disabled:opacity-40"
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-4 mb-5">
            <div className="flex-1 h-px bg-[#E8E0D6]" />
            <span className="text-xs text-[#B8B0A4] uppercase tracking-widest">or</span>
            <div className="flex-1 h-px bg-[#E8E0D6]" />
          </div>

          {/* Email form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs text-[#9A8E7E] uppercase tracking-widest mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full bg-white border border-[#E0D8CF] rounded-xl px-4 py-3 text-sm text-[#1A1A1A] placeholder-[#C8C0B4] focus:outline-none focus:border-[#C97552]/60 transition-colors"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-xs text-[#9A8E7E] uppercase tracking-widest">Password</label>
                <Link href="/forgot-password" className="text-xs text-[#9A8E7E] hover:text-[#C97552] transition-colors">
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full bg-white border border-[#E0D8CF] rounded-xl px-4 py-3 text-sm text-[#1A1A1A] placeholder-[#C8C0B4] focus:outline-none focus:border-[#C97552]/60 transition-colors"
              />
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <button
              type="submit"
              disabled={!email || !password || loading}
              className="w-full bg-[#1A1A1A] text-white text-sm font-semibold py-3.5 rounded-full mt-1 disabled:opacity-40 hover:bg-[#2A2420] transition-all"
            >
              {loading ? 'Signing in…' : 'Sign in →'}
            </button>
          </form>

          <p className="text-center text-sm text-[#9A8E7E] mt-6">
            New to Vondrer?{' '}
            <Link href="/signup" className="text-[#C97552] hover:underline font-medium">
              Start for free
            </Link>
          </p>
        </div>

        {/* Footer */}
        <p className="text-xs text-[#C8C0B4] text-center lg:text-left">
          © {new Date().getFullYear()} Vondrer · AI Travel Intelligence
        </p>
      </div>

      {/* ── Right: destination photo panel (desktop only) ─────────────────────── */}
      <div className="hidden lg:block flex-1 relative overflow-hidden">
        {/* Destination photo */}
        <img
          src={trip.photo}
          alt={trip.destination}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1A1A1A]/70 via-[#1A1A1A]/10 to-transparent" />

        {/* Trip card */}
        <div className="absolute bottom-12 left-10 right-10 max-w-sm">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl overflow-hidden shadow-2xl">

            {/* Card destination thumbnail */}
            <div className="relative h-28 overflow-hidden">
              <img src={trip.photo} alt={trip.destination} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <div className="absolute bottom-2.5 left-3.5 right-3.5 flex items-end justify-between">
                <p className="font-serif italic text-xl text-white leading-tight">
                  {trip.days} Days in {trip.destination.split(',')[0]}
                </p>
                <span className="text-[9px] bg-white/20 backdrop-blur-sm text-white border border-white/30 rounded-full px-2 py-0.5 uppercase tracking-widest">
                  {trip.style}
                </span>
              </div>
            </div>

            {/* Card body */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] text-[#9A8E7E] uppercase tracking-widest">{trip.destination}</span>
                <span className="text-[10px] text-[#C97552] font-medium">{trip.budget}</span>
              </div>

              {/* Stops */}
              <div className="space-y-1.5 mb-3">
                {trip.stops.map((stop, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-[#F0EBE3] text-[#C97552] text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-xs text-[#5A504A]">{stop}</span>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-[#E8E0D6] flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-[11px] text-[#6b5f54]">AI-planned · fully editable</span>
                </div>
                <span className="font-serif italic text-xs text-[#9A8E7E]">Vondrer</span>
              </div>
            </div>

          </div>
        </div>
      </div>

    </div>
  )
}
