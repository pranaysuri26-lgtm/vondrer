'use client'

import { useState, useEffect, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Viewer {
  user_id:   string
  name:      string
  color:     string
  joined_at: number
}

interface Props {
  tripId:    string
  myUserId?: string   // undefined for anonymous viewers
  myName?:   string
}

const COLORS = ['#C97552','#5B8DB8','#7BA05B','#8B6BA8','#3D9E8A','#D4845A','#6B8EC4','#88A86B']
function pickColor(userId: string) {
  const n = userId.split('').reduce((s, c) => s + c.charCodeAt(0), 0)
  return COLORS[n % COLORS.length]
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CollabPresence({ tripId, myUserId, myName }: Props) {
  const [viewers, setViewers]   = useState<Viewer[]>([])
  const [copied,  setCopied]    = useState(false)
  const channelRef              = useRef<ReturnType<ReturnType<typeof createBrowserClient>['channel']> | null>(null)

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const uid   = myUserId ?? `anon-${Math.random().toString(36).slice(2, 8)}`
    const name  = myName ?? 'Guest'
    const color = pickColor(uid)

    const channel = supabase.channel(`trip-presence:${tripId}`, {
      config: { presence: { key: uid } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<Viewer>()
        const all: Viewer[] = Object.values(state).flat()
        setViewers(all.sort((a, b) => a.joined_at - b.joined_at))
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: uid, name, color, joined_at: Date.now() })
        }
      })

    channelRef.current = channel

    return () => {
      channel.unsubscribe()
      supabase.removeChannel(channel)
    }
  }, [tripId, myUserId, myName])

  function collabUrl() {
    const base = window.location.origin + window.location.pathname
    // If already on /collaborate, use as-is; otherwise append /collaborate
    return base.endsWith('/collaborate') ? base : `${base}/collaborate`
  }

  async function copyCollabLink() {
    await navigator.clipboard.writeText(collabUrl())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const inviteButton = (
    <button
      onClick={copyCollabLink}
      className="flex items-center gap-1.5 text-xs font-medium text-[#C97552] hover:text-[#b86644] transition-colors border border-[#C97552]/30 hover:border-[#C97552]/60 rounded-full px-3 py-1"
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
      </svg>
      {copied ? 'Link copied!' : 'Invite to collaborate'}
    </button>
  )

  if (viewers.length <= 1) {
    return (
      <div className="flex items-center gap-3">
        {inviteButton}
        <span className="text-[10px] text-[#B8B0A4]">Friends can comment &amp; suggest changes — no login needed</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Viewer avatars (max 4) */}
      <div className="flex -space-x-2">
        {viewers.slice(0, 4).map(v => (
          <div
            key={v.user_id}
            title={v.name}
            style={{ backgroundColor: v.color }}
            className="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-white text-[10px] font-bold"
          >
            {v.name.charAt(0).toUpperCase()}
          </div>
        ))}
        {viewers.length > 4 && (
          <div className="w-7 h-7 rounded-full border-2 border-white bg-[#E8E0D6] flex items-center justify-center text-[#6b5f54] text-[10px] font-bold">
            +{viewers.length - 4}
          </div>
        )}
      </div>
      <span className="text-xs text-[#9A8E7E]">{viewers.length} viewing</span>
      {inviteButton}
    </div>
  )
}
