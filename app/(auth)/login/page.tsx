'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSupabaseClient } from '@/lib/supabase'

export default function LoginPage() {
  const router  = useRouter()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = getSupabaseClient()
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })

    if (loginError) {
      setError(loginError.message)
      setLoading(false)
      return
    }

    // Check if onboarding is complete — if not, redirect to finish it
    const { data: { user } } = await supabase.auth.getUser()
    router.push('/discover')
  }

  async function handleGoogleLogin() {
    setLoading(true)
    const supabase = getSupabaseClient()
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options:  { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (oauthError) {
      setError(oauthError.message)
      setLoading(false)
    }
    // OAuth redirects — no further action needed
  }

  return (
    <div className="min-h-screen bg-[#0d1f35] flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        {/* Wordmark */}
        <div className="text-center mb-10">
          <span className="font-serif italic text-3xl text-white/90 tracking-wide">Voya</span>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-light text-white mb-2">Welcome back</h1>
          <p className="text-white/45 text-sm">Your recommendations are waiting.</p>
        </div>

        {/* Google */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-white/5 border border-white/15 text-white py-3.5 rounded-full mb-6 hover:bg-white/10 transition-all disabled:opacity-40"
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
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-xs text-white/25 uppercase tracking-widest">or</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Email form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs text-white/45 uppercase tracking-widest mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError('') }}
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-[#C97552]/60 transition-colors"
            />
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs text-white/45 uppercase tracking-widest">Password</label>
              <Link href="/forgot-password" className="text-xs text-white/35 hover:text-white/60 transition-colors">
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-[#C97552]/60 transition-colors"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={!email || !password || loading}
            className="w-full bg-white text-[#0d1f35] font-semibold py-3.5 rounded-full mt-2 disabled:opacity-40 hover:bg-white/90 transition-all"
          >
            {loading ? 'Signing in…' : 'Sign in →'}
          </button>
        </form>

        <p className="text-center text-sm text-white/35 mt-6">
          New to Voya?{' '}
          <Link href="/signup" className="text-white/60 hover:text-white underline">
            Start for free
          </Link>
        </p>

      </div>
    </div>
  )
}
