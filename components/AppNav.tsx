'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getSupabaseClient } from '@/lib/supabase'

// ─── Tier badge ───────────────────────────────────────────────────────────────

type Tier = 'pro' | 'traveller' | null
interface TierInfo { tier: Tier; daysLeft?: number }

function TierBadge({ tier, daysLeft }: TierInfo) {
  if (!tier) return null
  if (tier === 'pro') return (
    <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full border border-yellow-400/40 bg-yellow-400/10 text-yellow-300 tracking-wide">
      PRO ✦
    </span>
  )
  const label = daysLeft !== undefined ? `TRAVELLER · ${daysLeft}d` : 'TRAVELLER'
  return (
    <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full border border-[#C97552]/40 bg-[#C97552]/10 text-[#C97552] tracking-wide">
      {label}
    </span>
  )
}

// ─── Nav structure ────────────────────────────────────────────────────────────
// Trip Ask is removed — it lives as the global chat bar on every page.

interface NavItem {
  key:      string
  label:    string
  icon:     string
  href:     string
  children?: { label: string; href: string; icon: string }[]
}

const NAV: NavItem[] = [
  {
    key:   'discover',
    label: 'Discover',
    icon:  '🧭',
    href:  '/discover',
  },
  {
    key:   'deals',
    label: 'Deals',
    icon:  '💡',
    href:  '/deals',
  },
  {
    key:   'plan',
    label: 'Plan',
    icon:  '✈️',
    href:  '/plan/day',
    children: [
      { label: 'Plan a Day',     href: '/plan/day',         icon: '☀️' },
      { label: 'Inspire Me ✨',  href: '/plan/inspiration', icon: '🌟' },
    ],
  },
  {
    key:   'trips',
    label: 'Trips',
    icon:  '🗺️',
    href:  '/trips',
    children: [
      { label: 'My Trips',    href: '/trips',     icon: '🗺️' },
      { label: 'Templates',   href: '/templates', icon: '📋' },
    ],
  },
  {
    key:   'profile',
    label: 'Profile',
    icon:  '👤',
    href:  '/profile',
    children: [
      { label: 'Profile',    href: '/profile',   icon: '👤' },
      { label: 'Voya Pro',   href: '/pro',        icon: '✦'  },
      { label: 'Developer',  href: '/developer',  icon: '🔑' },
      { label: 'Passport',   href: '/passport',   icon: '🛂' },
    ],
  },
]

// Which top-level keys are "active" for a given pathname
function isActive(key: string, pathname: string, searchParams: ReturnType<typeof useSearchParams>): boolean {
  if (key === 'discover') return pathname === '/discover' && searchParams.get('search') !== '1'
  if (key === 'plan')     return pathname.startsWith('/plan')
  if (key === 'trips')    return pathname.startsWith('/trips') || pathname.startsWith('/templates')
  if (key === 'profile')  return pathname.startsWith('/profile') || pathname.startsWith('/pro') || pathname.startsWith('/developer') || pathname.startsWith('/passport')
  return pathname.startsWith(`/${key}`)
}

// ─── AppNav ───────────────────────────────────────────────────────────────────

export default function AppNav() {
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const router       = useRouter()
  const [tierInfo, setTierInfo] = useState<TierInfo>({ tier: null })
  // Mobile sub-strip: which parent tab is expanded
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null)

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
      } catch { /* silent */ }
    }
    fetchTier()
  }, [])

  // Close mobile sub-strip on navigation
  useEffect(() => { setMobileExpanded(null) }, [pathname])

  // ── Desktop nav ─────────────────────────────────────────────────────────────
  const DesktopNav = (
    <nav className="hidden md:flex sticky top-0 z-30 bg-[#FAF8F5]/95 backdrop-blur-md border-b border-[#E8E0D6] px-8 h-14 items-center justify-between">
      <Link href="/discover" className="font-serif italic text-xl text-[#1A1A1A] select-none tracking-wide hover:text-[#C97552] transition-colors">
        Voya
      </Link>

      <div className="flex items-center gap-0.5">
        {NAV.map(item => {
          const active = isActive(item.key, pathname, searchParams)
          const hasChildren = item.children && item.children.length > 0

          return (
            <div key={item.key} className="relative group">
              {/* Top-level button */}
              <button
                onClick={() => router.push(item.href)}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm transition-all ${
                  active
                    ? 'text-[#C97552] bg-[#C97552]/8'
                    : 'text-[#6b5f54] hover:text-[#2A2420] hover:bg-white'
                }`}
              >
                <span className="text-base leading-none">{item.icon}</span>
                <span className="font-label tracking-wide">{item.label}</span>
                {hasChildren && (
                  <svg className="w-3 h-3 opacity-40 group-hover:opacity-70 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </button>

              {/* Dropdown */}
              {hasChildren && (
                <div className="absolute top-full left-0 pt-1 hidden group-hover:block">
                  <div className="bg-white border border-[#E0D8CF] rounded-xl shadow-lg shadow-black/5 overflow-hidden min-w-[160px] py-1">
                    {item.children!.map(child => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors hover:bg-[#FAF8F5] ${
                          pathname.startsWith(child.href) && child.href !== '/'
                            ? 'text-[#C97552] font-medium'
                            : 'text-[#5A504A]'
                        }`}
                      >
                        <span className="text-base leading-none w-5 text-center">{child.icon}</span>
                        {child.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <TierBadge {...tierInfo} />
    </nav>
  )

  // ── Mobile bottom nav ───────────────────────────────────────────────────────
  // Active parent with children shows a sub-strip row above the main bar
  const activeParent = NAV.find(item => isActive(item.key, pathname, searchParams))
  const showSubStrip = activeParent?.children && activeParent.children.length > 0

  const MobileNav = (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-30">
      {/* Sub-strip — shown when expanded or when inside a section with sub-pages */}
      {(mobileExpanded || showSubStrip) && (() => {
        const parent = mobileExpanded
          ? NAV.find(n => n.key === mobileExpanded)
          : activeParent
        if (!parent?.children) return null
        return (
          <div className="bg-[#FAF8F5]/97 backdrop-blur-md border-t border-[#E8E0D6] flex items-center gap-1 px-3 py-2 overflow-x-auto"
            style={{ scrollbarWidth: 'none' }}>
            {parent.children.map(child => {
              const childActive = pathname.startsWith(child.href)
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs flex-shrink-0 transition-colors ${
                    childActive
                      ? 'bg-[#C97552] text-white font-medium'
                      : 'bg-white border border-[#E0D8CF] text-[#5A504A] hover:border-[#C97552]/40'
                  }`}
                >
                  <span>{child.icon}</span>
                  {child.label}
                </Link>
              )
            })}
          </div>
        )
      })()}

      {/* Main bar */}
      <nav className="bg-[#FAF8F5]/97 backdrop-blur-md border-t border-[#E8E0D6] flex items-stretch h-14">
        {NAV.map(item => {
          const active = isActive(item.key, pathname, searchParams)
          const hasChildren = item.children && item.children.length > 0

          return (
            <button
              key={item.key}
              onClick={() => {
                if (hasChildren) {
                  // Toggle sub-strip or navigate directly
                  if (active) {
                    setMobileExpanded(prev => prev === item.key ? null : item.key)
                  } else {
                    router.push(item.href)
                  }
                } else {
                  router.push(item.href)
                }
              }}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1"
            >
              <span className={`text-lg leading-none transition-opacity ${active ? 'opacity-100' : 'opacity-35'}`}>
                {item.icon}
              </span>
              <span className={`text-[8px] font-label tracking-wide uppercase transition-colors ${
                active ? 'text-[#C97552]' : 'text-[#7A6E64]'
              }`}>
                {item.label}
              </span>
            </button>
          )
        })}
      </nav>
    </div>
  )

  return (
    <>
      {DesktopNav}
      {MobileNav}
    </>
  )
}
