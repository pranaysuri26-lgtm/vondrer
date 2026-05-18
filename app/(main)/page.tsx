'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getSupabaseClient } from '@/lib/supabase'

interface UserData {
  name:       string
  isReturner: boolean
}

export default function HomePage() {
  const [userData, setUserData] = useState<UserData | null>(null)
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const supabase = getSupabaseClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setLoading(false); return }

        // Get first name from user metadata or email
        const fullName = user.user_metadata?.full_name as string | undefined
        const email    = user.email ?? ''
        const name     = fullName
          ? fullName.split(' ')[0]
          : email.split('@')[0].replace(/[^a-zA-Z]/g, '') || 'there'

        // Returning = has at least one trip
        const { count } = await supabase
          .from('trips')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)

        setUserData({ name, isReturner: (count ?? 0) > 0 })
      } catch {
        /* silent */
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const greeting = !userData
    ? null
    : userData.isReturner
    ? `Welcome back, ${userData.name}!`
    : `Hi, ${userData.name}!`

  const subline = !userData
    ? null
    : userData.isReturner
    ? 'Ready to plan your next adventure?'
    : 'Let\'s build your first trip.'

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <div className="max-w-2xl mx-auto px-4 pt-16 pb-12">

        {/* Greeting */}
        <div className="mb-10">
          {loading ? (
            <div className="space-y-3">
              <div className="h-9 w-64 bg-[#EDE5D8] rounded-xl animate-pulse" />
              <div className="h-4 w-48 bg-[#F0EBE3] rounded-lg animate-pulse" />
            </div>
          ) : (
            <>
              <h1 className="font-serif italic text-4xl text-[#1A1A1A] leading-tight mb-2">
                {greeting ?? 'Welcome to Vondrer'}
              </h1>
              <p className="text-[#6b5f54] text-base">
                {subline ?? 'AI-powered travel planning, built around you.'}
              </p>
            </>
          )}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
          <Link
            href="/discover"
            className="group flex items-center gap-4 bg-white border border-[#E8E0D6] rounded-2xl px-5 py-4 hover:border-[#C97552]/40 hover:shadow-sm transition-all"
          >
            <span className="text-2xl">🌍</span>
            <div>
              <p className="font-medium text-[#1A1A1A] text-sm group-hover:text-[#C97552] transition-colors">Discover destinations</p>
              <p className="text-xs text-[#9A8E7E] mt-0.5">Find where to go next</p>
            </div>
          </Link>

          <Link
            href="/trips"
            className="group flex items-center gap-4 bg-white border border-[#E8E0D6] rounded-2xl px-5 py-4 hover:border-[#C97552]/40 hover:shadow-sm transition-all"
          >
            <span className="text-2xl">🗺️</span>
            <div>
              <p className="font-medium text-[#1A1A1A] text-sm group-hover:text-[#C97552] transition-colors">My trips</p>
              <p className="text-xs text-[#9A8E7E] mt-0.5">View and edit your itineraries</p>
            </div>
          </Link>

          <Link
            href="/templates"
            className="group flex items-center gap-4 bg-white border border-[#E8E0D6] rounded-2xl px-5 py-4 hover:border-[#C97552]/40 hover:shadow-sm transition-all"
          >
            <span className="text-2xl">📋</span>
            <div>
              <p className="font-medium text-[#1A1A1A] text-sm group-hover:text-[#C97552] transition-colors">Browse templates</p>
              <p className="text-xs text-[#9A8E7E] mt-0.5">Start from a proven itinerary</p>
            </div>
          </Link>

          <Link
            href="/plan/new"
            className="group flex items-center gap-4 bg-white border border-[#E8E0D6] rounded-2xl px-5 py-4 hover:border-[#C97552]/40 hover:shadow-sm transition-all"
          >
            <span className="text-2xl">✨</span>
            <div>
              <p className="font-medium text-[#1A1A1A] text-sm group-hover:text-[#C97552] transition-colors">Plan a new trip</p>
              <p className="text-xs text-[#9A8E7E] mt-0.5">AI builds it around you</p>
            </div>
          </Link>
        </div>

        {/* CTA for guests */}
        {!loading && !userData && (
          <div className="text-center pt-4">
            <Link
              href="/login"
              className="inline-block bg-[#C97552] text-white font-semibold text-sm px-8 py-3.5 rounded-full hover:bg-[#b86644] transition-colors"
            >
              Get started free →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
