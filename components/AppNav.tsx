'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'

// ─── Tier badge ───────────────────────────────────────────────────────────────

type Tier = 'pro' | 'traveller' | null

interface TierInfo {
  tier:     Tier
  daysLeft?: number
}

function TierBadge({ tier, daysLeft }: TierInfo) {
  if (!tier) return null
  if (tier === 'pro') {
    return (
      <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full border border-yellow-400/40 bg-yellow-400/10 text-yellow-300 tracking-wide">
        PRO ✦
      </span>
    )
  }
  const label = daysLeft !== undefined ? `TRAVELLER · ${daysLeft}d` : 'TRAVELLER'
  return (
    <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full border border-[#C97552]/40 bg-[#C97552]/10 text-[#C97552] tracking-wide">
      {label}
    </span>
  )
}

// ─── Tabs config ──────────────────────────────────────────────────────────────

const TABS = [
  { key: 'discover',  href: '/discover',   icon: '🧭', label: 'Discover'  },
  { key: 'deals',     href: '/deals',      icon: '💡', label: 'Tips'      },
  { key: 'plan-day',  href: '/plan/day',   icon: '☀️', label: 'Plan Day'  },
  { key: 'plan-ask',  href: '/plan/ask',   icon: '🚗', label: 'Trip Ask'  },
  { key: 'trips',     href: '/trips',      icon: '🗺️', label: 'Trips'     },
  { key: 'profile',   href: '/profile',    icon: '👤', label: 'Profile'   },
] as const

// ─── AppNav ───────────────────────────────────────────────────────────────────

export default function AppNav() {
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const router       = useRouter()
  const [tierInfo, setTierInfo] = useState<TierInfo>({ tier: null })

  // Fetch tier badge from subscriptions table (table may not exist yet)
  useEffect(() => {
    async function fetchTier() {
      try {
        const supabase = getSupabaseClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data } = await supabase
          .from('subscriptions')
          .select('tier, expires_at')
          .eq('user_id', user.id)
          .single()
        if (!data) return
        const daysLeft = data.expires_at
          ? Math.max(0, Math.ceil((new Date(data.expires_at).getTime() - Date.now()) / 86_400_000))
          : undefined
        setTierInfo({ tier: data.tier as Tier, daysLeft })
      } catch { /* subscriptions table may not exist yet — silent */ }
    }
    fetchTier()
  }, [])

  function isActive(key: string): boolean {
    if (key === 'discover') return pathname === '/discover' && searchParams.get('search') !== '1'
    if (key === 'plan-day') return pathname.startsWith('/plan/day')
    if (key === 'plan-ask') return pathname.startsWith('/plan/ask')
    return pathname.startsWith(`/${key}`)
  }

  function handleTab(key: string, href: string | null) {
    if (href) router.push(href)
  }

  // ── Desktop top nav ─────────────────────────────────────────────────────────
  const DesktopNav = (
    <nav className="hidden md:flex sticky top-0 z-30 bg-[#0d1f35]/95 backdrop-blur-md border-b border-white/8 px-8 h-14 items-center justify-between">
      <span className="font-serif italic text-xl text-white/90 select-none tracking-wide">Voya</span>

      <div className="flex items-center gap-1">
        {TABS.map(tab => {
          const active = isActive(tab.key)
          return (
            <button
              key={tab.key}
              onClick={() => handleTab(tab.key, tab.href)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm transition-all ${
                active
                  ? 'text-[#C97552] bg-[#C97552]/8'
                  : 'text-white/45 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              <span className="text-base leading-none">{tab.icon}</span>
              <span className="font-label tracking-wide">{tab.label}</span>
            </button>
          )
        })}
      </div>

      <TierBadge {...tierInfo} />
    </nav>
  )

  // ── Mobile bottom nav ───────────────────────────────────────────────────────
  const MobileNav = (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#0d1f35]/97 backdrop-blur-md border-t border-white/8 flex items-stretch h-14">
      {TABS.map(tab => {
        const active = isActive(tab.key)
        return (
          <button
            key={tab.key}
            onClick={() => handleTab(tab.key, tab.href)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1"
          >
            <span className={`text-lg leading-none transition-opacity ${active ? 'opacity-100' : 'opacity-35'}`}>
              {tab.icon}
            </span>
            <span className={`text-[8px] font-label tracking-wide uppercase transition-colors ${
              active ? 'text-[#C97552]' : 'text-white/35'
            }`}>
              {tab.label}
            </span>
          </button>
        )
      })}
    </nav>
  )

  return (
    <>
      {DesktopNav}
      {MobileNav}
    </>
  )
}
