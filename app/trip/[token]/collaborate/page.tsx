'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseClient } from '@/lib/supabase'
import type { ItineraryDay, ItineraryBlock } from '@/app/api/itinerary/route'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TripRow {
  id:         string
  trip_name:  string
  user_id:    string
  start_date: string
  end_date:   string
  share_token: string
}

interface DestRow {
  id:               string
  destination_name: string
  country:          string
  days:             number
  start_date:       string
  end_date:         string
  position:         number
  itinerary_json:   ItineraryDay[] | null
}

interface Comment {
  id:             string
  trip_id:        string
  destination_id: string
  day_number:     number
  time_of_day:    string
  activity_name:  string
  comment:        string
  commenter_name: string
  votes_up:       number
  votes_down:     number
  status:         'pending' | 'accepted' | 'dismissed'
  created_at:     string
}

interface PresenceUser {
  name:       string
  online_at:  string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  if (!d) return ''
  const date = new Date(d + 'T12:00:00')
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function slotLabel(slot: string) {
  if (slot === 'morning')   return '🌅 Morning'
  if (slot === 'afternoon') return '☀️ Afternoon'
  if (slot === 'evening')   return '🌙 Evening'
  return slot
}

// ─── Comment bubble ───────────────────────────────────────────────────────────

function CommentBubble({
  comment, isOrganizer, onAccept, onDismiss, onVote,
}: {
  comment:     Comment
  isOrganizer: boolean
  onAccept:    (id: string) => void
  onDismiss:   (id: string) => void
  onVote:      (id: string, dir: 'up' | 'down') => void
}) {
  return (
    <div className={[
      'rounded-xl p-3 space-y-2 border text-xs',
      comment.status === 'accepted'  ? 'bg-green-500/8 border-green-500/20' :
      comment.status === 'dismissed' ? 'bg-[#F5F2ED] border-[#E8E0D6] opacity-50' :
      'bg-[#FAF8F5] border-[#E8E0D6]',
    ].join(' ')}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-[#2A2420] font-medium">{comment.commenter_name || 'Anonymous'}</span>
          {comment.status === 'accepted'  && <span className="ml-2 text-green-600/70">✓ Accepted</span>}
          {comment.status === 'dismissed' && <span className="ml-2 text-[#9A8E7E]">Dismissed</span>}
        </div>
        <span className="text-[#A8A09A] flex-shrink-0">{new Date(comment.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
      </div>
      <p className="text-[#4A4440] leading-relaxed">{comment.comment}</p>

      <div className="flex items-center gap-3 pt-1">
        <button onClick={() => onVote(comment.id, 'up')}
          className="flex items-center gap-1 text-[#8A7E6E] hover:text-green-600 transition-colors">
          👍 <span>{comment.votes_up}</span>
        </button>
        <button onClick={() => onVote(comment.id, 'down')}
          className="flex items-center gap-1 text-[#8A7E6E] hover:text-red-500 transition-colors">
          👎 <span>{comment.votes_down}</span>
        </button>

        {isOrganizer && comment.status === 'pending' && (
          <div className="ml-auto flex gap-2">
            <button onClick={() => onAccept(comment.id)}
              className="text-green-600/80 hover:text-green-700 border border-green-500/30 rounded-full px-2 py-0.5 transition-colors">
              Accept
            </button>
            <button onClick={() => onDismiss(comment.id)}
              className="text-[#9A8E7E] hover:text-[#5A504A] border border-[#D8D0C4] rounded-full px-2 py-0.5 transition-colors">
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Block with comments ──────────────────────────────────────────────────────

function BlockWithComments({
  slot, block, destId, dayNum, comments, isOrganizer,
  commenterName, onAddComment, onAccept, onDismiss, onVote,
}: {
  slot:           string
  block:          ItineraryBlock
  destId:         string
  dayNum:         number
  comments:       Comment[]
  isOrganizer:    boolean
  commenterName:  string
  onAddComment:   (destId: string, day: number, slot: string, activity: string, text: string) => void
  onAccept:       (id: string) => void
  onDismiss:      (id: string) => void
  onVote:         (id: string, dir: 'up' | 'down') => void
}) {
  const [open,   setOpen]   = useState(false)
  const [text,   setText]   = useState('')
  const pending = comments.filter(c => c.status === 'pending').length

  function submit() {
    if (!text.trim()) return
    onAddComment(destId, dayNum, slot, block.activity, text.trim())
    setText('')
    // Stay open so the user can see their comment appear
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-[#8A7E6E] uppercase tracking-widest">{slotLabel(slot)}</p>
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-1 text-xs text-[#8A7E6E] hover:text-[#5A504A] transition-colors"
        >
          💬{pending > 0 && <span className="bg-[#C97552] text-white rounded-full text-[10px] px-1.5 py-0.5">{pending}</span>}
        </button>
      </div>
      <p className="text-[#1A1A1A] font-medium text-sm">{block.activity}</p>
      <p className="text-[#5A504A] text-sm leading-relaxed">{block.description}</p>
      {block.insider_tip && <p className="text-[#C97552]/80 text-xs italic">💡 {block.insider_tip}</p>}
      <p className="text-[#8A7E6E] text-xs">{block.estimated_cost}</p>

      {open && (
        <div className="mt-3 space-y-3 border-t border-[#E8E0D6] pt-3">
          {comments.map(c => (
            <CommentBubble
              key={c.id} comment={c} isOrganizer={isOrganizer}
              onAccept={onAccept} onDismiss={onDismiss} onVote={onVote}
            />
          ))}
          <div className="space-y-2">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={2}
              placeholder="Add a comment or suggestion…"
              className="w-full bg-white border border-[#D8D0C4] rounded-lg px-3 py-2 text-[#1A1A1A] text-xs placeholder-[#9A8E7E] focus:outline-none focus:border-[#C97552]/60 resize-none"
            />
            <div className="flex gap-2">
              <button onClick={submit} disabled={!text.trim()}
                className="flex-1 bg-[#C97552] text-white text-xs py-2 rounded-full disabled:opacity-40 hover:bg-[#b86644] transition-colors">
                Send
              </button>
              <button onClick={() => setOpen(false)}
                className="px-4 text-xs text-[#7A6E64] border border-[#D8D0C4] rounded-full hover:border-[#C0B8AC] transition-all">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CollaboratePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const [token,    setToken]    = useState<string | null>(null)
  const [trip,     setTrip]     = useState<TripRow | null>(null)
  const [dests,    setDests]    = useState<DestRow[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [presence, setPresence] = useState<PresenceUser[]>([])
  const [userId,   setUserId]   = useState<string | null>(null)

  const [commenterName, setCommenterName]   = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('voya_collab_name') || '' : ''
  )
  const [nameInput,   setNameInput]   = useState('')
  const [nameSet,     setNameSet]     = useState(!!commenterName)
  const [loading,     setLoading]     = useState(true)
  const [notFound,    setNotFound]    = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  const channelRef = useRef<ReturnType<typeof anonClient.channel> | null>(null)

  // Public anon client for reads
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Resolve params
  useEffect(() => {
    params.then(p => setToken(p.token))
  }, [params])

  // Check if current user is the organizer
  useEffect(() => {
    getSupabaseClient().auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null)
    })
  }, [])

  // Initial data load — uses server API route with service role key so
  // non-authenticated collaborators can view trips owned by others.
  useEffect(() => {
    if (!token) return
    async function load() {
      try {
        const res = await fetch(`/api/collaborate/${token}`)
        if (!res.ok) { setNotFound(true); setLoading(false); return }
        const data = await res.json()
        setTrip(data.trip)
        setDests(data.destinations)
        setComments(data.comments)
      } catch {
        setNotFound(true)
      }
      setLoading(false)
    }
    load()
  }, [token])

  // Realtime — subscribe after trip loaded
  useEffect(() => {
    if (!trip) return

    const channel = anonClient.channel(`trip:${trip.id}`)

    // Comments changes
    channel.on(
      'postgres_changes' as Parameters<typeof channel.on>[0],
      { event: '*', schema: 'public', table: 'trip_comments', filter: `trip_id=eq.${trip.id}` },
      (payload: { eventType: string; new: Comment; old: Comment }) => {
        setComments(prev => {
          if (payload.eventType === 'INSERT') return [...prev, payload.new as Comment]
          if (payload.eventType === 'UPDATE') return prev.map(c => c.id === (payload.new as Comment).id ? payload.new as Comment : c)
          if (payload.eventType === 'DELETE') return prev.filter(c => c.id !== (payload.old as Comment).id)
          return prev
        })
      }
    )

    // Presence
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<PresenceUser>()
      setPresence(Object.values(state).flat())
    })

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && commenterName) {
        await channel.track({ name: commenterName, online_at: new Date().toISOString() })
      }
    })

    channelRef.current = channel

    return () => { anonClient.removeChannel(channel) }
  }, [trip?.id, commenterName])

  // Pending count
  useEffect(() => {
    setPendingCount(comments.filter(c => c.status === 'pending').length)
  }, [comments])

  const isOrganizer = !!(userId && trip && userId === trip.user_id)

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleAddComment = useCallback(async (
    destId: string, day: number, slot: string, activity: string, text: string
  ) => {
    if (!trip || !commenterName) return

    // Optimistic insert — show comment immediately without waiting for realtime
    const optimistic: Comment = {
      id:             `opt-${Date.now()}`,
      trip_id:        trip.id,
      destination_id: destId,
      day_number:     day,
      time_of_day:    slot,
      activity_name:  activity,
      comment:        text,
      commenter_name: commenterName,
      votes_up:       0,
      votes_down:     0,
      status:         'pending',
      created_at:     new Date().toISOString(),
    }
    setComments(prev => [...prev, optimistic])

    try {
      const { data, error } = await anonClient.from('trip_comments').insert({
        trip_id:        trip.id,
        destination_id: destId,
        day_number:     day,
        time_of_day:    slot,
        activity_name:  activity,
        comment:        text,
        commenter_name: commenterName,
      }).select().single()

      if (!error && data) {
        // Replace optimistic entry with real DB row
        setComments(prev => prev.map(c => c.id === optimistic.id ? (data as Comment) : c))
      }
    } catch {
      // Leave optimistic entry — user can still see their comment
    }
  }, [trip, commenterName])

  const handleAccept = useCallback(async (id: string) => {
    await anonClient.from('trip_comments').update({ status: 'accepted' }).eq('id', id)
  }, [])

  const handleDismiss = useCallback(async (id: string) => {
    await anonClient.from('trip_comments').update({ status: 'dismissed' }).eq('id', id)
  }, [])

  const handleVote = useCallback(async (id: string, dir: 'up' | 'down') => {
    const comment = comments.find(c => c.id === id)
    if (!comment) return
    const field = dir === 'up' ? 'votes_up' : 'votes_down'
    await anonClient.from('trip_comments').update({ [field]: (comment[field] ?? 0) + 1 }).eq('id', id)
  }, [comments])

  function saveName() {
    if (!nameInput.trim()) return
    setCommenterName(nameInput.trim())
    localStorage.setItem('voya_collab_name', nameInput.trim())
    setNameSet(true)
    channelRef.current?.track({ name: nameInput.trim(), online_at: new Date().toISOString() })
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-[#D8D0C4] border-t-[#C97552]"
        style={{ animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (notFound || !trip) return (
    <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center">
      <p className="text-[#9A8E7E]">Trip not found.</p>
    </div>
  )

  // Name gate for non-organizers
  if (!isOrganizer && !nameSet) return (
    <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center p-4">
      <div className="bg-white border border-[#E8E0D6] rounded-2xl max-w-sm w-full p-8 space-y-5 text-center shadow-sm">
        <p className="text-xs text-[#9A8E7E] uppercase tracking-widest">Collaborating on</p>
        <h1 className="font-serif italic text-2xl text-[#1A1A1A]">{trip.trip_name}</h1>
        <p className="text-[#6b5f54] text-sm">Enter your name so the group knows who&apos;s commenting.</p>
        <input
          type="text"
          value={nameInput}
          onChange={e => setNameInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && saveName()}
          placeholder="Your name"
          autoFocus
          className="w-full bg-white border border-[#D8D0C4] rounded-xl px-4 py-3 text-[#1A1A1A] text-sm placeholder-[#9A8E7E] focus:outline-none focus:border-[#C97552]/60"
        />
        <button onClick={saveName} disabled={!nameInput.trim()}
          className="w-full bg-[#C97552] text-white py-3 rounded-full font-medium text-sm disabled:opacity-40 hover:bg-[#b86644] transition-colors">
          Join collaboration →
        </button>
      </div>
    </div>
  )

  const onlineNames = presence.map(p => p.name).filter(Boolean)

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      {/* Header */}
      <div className="border-b border-[#E8E0D6] sticky top-0 bg-[#FAF8F5]/95 backdrop-blur z-20">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-[#9A8E7E] uppercase tracking-widest mb-1">
              {isOrganizer ? 'Your trip' : 'Collaborating on'}
            </p>
            <h1 className="font-serif italic text-xl text-[#1A1A1A]">{trip.trip_name}</h1>
          </div>
          <div className="text-right flex-shrink-0 space-y-1">
            {onlineNames.length > 0 && (
              <p className="text-xs text-[#9A8E7E]">
                👁️ {onlineNames.slice(0, 3).join(', ')}{onlineNames.length > 3 ? ` +${onlineNames.length - 3}` : ''} viewing
              </p>
            )}
            {isOrganizer && pendingCount > 0 && (
              <p className="text-xs text-[#C97552]">{pendingCount} suggestion{pendingCount > 1 ? 's' : ''} pending</p>
            )}
            {!isOrganizer && (
              <p className="text-xs text-[#8A7E6E]">Viewing as <span className="text-[#4A4440]">{commenterName}</span></p>
            )}
          </div>
        </div>
      </div>

      {/* Itinerary */}
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-12">
        {dests.map((dest, di) => {
          const days: ItineraryDay[] = Array.isArray(dest.itinerary_json) ? dest.itinerary_json : []
          const dayOffset = dests.slice(0, di).reduce((s, d) => s + d.days, 0)

          return (
            <section key={dest.id}>
              <div className="border-t border-[#E8E0D6] pt-6 mb-5">
                <p className="text-xs text-[#9A8E7E] uppercase tracking-widest mb-1">
                  📍 {dest.destination_name.toUpperCase()}, {dest.country.toUpperCase()}
                  {' · '}
                  {dest.days === 1 ? `Day ${dayOffset + 1}` : `Days ${dayOffset + 1}–${dayOffset + dest.days}`}
                </p>
                <h2 className="font-serif italic text-2xl text-[#1A1A1A]">{dest.destination_name}</h2>
                {dest.start_date && <p className="text-[#8A7E6E] text-xs mt-0.5">{formatDate(dest.start_date)} – {formatDate(dest.end_date)}</p>}
              </div>

              {days.length === 0 && (
                <p className="text-[#9A8E7E] text-sm italic py-4">No itinerary generated for this destination.</p>
              )}

              <div className="space-y-4">
                {days.map(day => {
                  const slots: Array<{ slot: string; block: ItineraryBlock }> = [
                    { slot: 'morning',   block: day.morning   },
                    { slot: 'afternoon', block: day.afternoon },
                    { slot: 'evening',   block: day.evening   },
                  ]
                  return (
                    <div key={day.day} className="bg-white border border-[#E8E0D6] rounded-2xl p-5 space-y-4">
                      <div className="flex items-baseline justify-between">
                        <h4 className="font-serif italic text-base text-[#1A1A1A]">{day.title}</h4>
                        <span className="text-xs text-[#9A8E7E]">Day {day.day}</span>
                      </div>
                      <div className="space-y-4 divide-y divide-[#F0EBE3]">
                        {slots.map(({ slot, block }, si) => {
                          const blockComments = comments.filter(c =>
                            c.destination_id === dest.id &&
                            c.day_number === day.day &&
                            c.time_of_day === slot
                          )
                          return (
                            <div key={slot} className={si > 0 ? 'pt-4' : ''}>
                              <BlockWithComments
                                slot={slot}
                                block={block}
                                destId={dest.id}
                                dayNum={day.day}
                                comments={blockComments}
                                isOrganizer={isOrganizer}
                                commenterName={commenterName}
                                onAddComment={handleAddComment}
                                onAccept={handleAccept}
                                onDismiss={handleDismiss}
                                onVote={handleVote}
                              />
                            </div>
                          )
                        })}
                      </div>
                      <div className="pt-2 border-t border-[#E8E0D6] flex justify-end">
                        <span className="text-xs text-[#C97552]/70">Day total: ~{day.day_total_estimate}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}

        {/* Footer */}
        <div className="border-t border-[#E8E0D6] pt-8 text-center space-y-2">
          <p className="text-[#9A8E7E] text-xs">Tap 💬 on any activity to comment or suggest a change.</p>
          {isOrganizer && (
            <p className="text-[#9A8E7E] text-xs">You&apos;re the organizer — you can accept or dismiss suggestions.</p>
          )}
          <a href={`/trip/${trip.share_token}`}
            className="inline-block text-xs text-[#8A7E6E] hover:text-[#5A504A] mt-2 transition-colors">
            View read-only version →
          </a>
        </div>
      </main>
    </div>
  )
}
