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

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (viewers.length <= 1) {
    // Just the share button when alone
    return (
      <button
        onClick={copyLink}
        className="flex items-center gap-1.5 text-xs text-[#9A8E7E] hover:text-[#C97552] transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        {copied ? 'Copied!' : 'Share trip'}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
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

      {/* Share button */}
      <button onClick={copyLink} className="text-xs text-[#9A8E7E] hover:text-[#C97552] transition-colors ml-1">
        {copied ? '✓ Copied' : 'Share →'}
      </button>
    </div>
  )
}
