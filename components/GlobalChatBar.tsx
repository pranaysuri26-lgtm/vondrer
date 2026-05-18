'use client'

import { useState, useRef, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useChat } from '@/context/ChatContext'
import type { ChatMessage } from '@/context/ChatContext'
import { getSupabaseClient } from '@/lib/supabase'

// ─── Page context labels ───────────────────────────────────────────────────────

function pageLabel(pathname: string): string {
  if (pathname === '/discover')            return 'Discover'
  if (pathname.startsWith('/deals'))       return 'Deals'
  if (pathname.startsWith('/plan'))        return 'Planning'
  if (pathname.startsWith('/trips'))       return 'My Trips'
  if (pathname.startsWith('/templates'))   return 'Templates'
  if (pathname.startsWith('/trip/'))       return 'Trip view'
  if (pathname.startsWith('/profile'))     return 'Profile'
  return 'Vondrer'
}

function placeholder(pathname: string): string {
  if (pathname === '/discover')          return 'Ask Vondrer — plan a trip, get tips…'
  if (pathname.startsWith('/deals'))     return 'Ask about deals, flights, hotels…'
  if (pathname.startsWith('/plan'))      return 'Where do you want to go?'
  if (pathname.startsWith('/trips'))     return 'Ask about one of your trips…'
  if (pathname.startsWith('/trip/'))     return 'Ask about this trip…'
  return 'Ask Vondrer anything…'
}

// ─── Quick chips shown before first message ────────────────────────────────────

const CHIPS = [
  'Plan me 5 days in Tokyo 🇯🇵',
  'Best street food in Bangkok?',
  'Create a Paris trip for 3 days',
  'Is Bali safe for solo travel?',
  'What to pack for Iceland in winter?',
]

// ─── Message bubble ────────────────────────────────────────────────────────────

function Bubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'

  // Render **bold** markdown
  function renderContent(text: string) {
    const parts = text.split(/(\*\*[^*]+\*\*)/)
    return parts.map((p, i) =>
      p.startsWith('**') && p.endsWith('**')
        ? <strong key={i}>{p.slice(2, -2)}</strong>
        : p
    )
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-[#C97552] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5 mr-2">
          V
        </div>
      )}
      <div className="max-w-[82%] space-y-2">
        <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-[#C97552] text-white rounded-tr-sm'
            : 'bg-white border border-[#E8E0D6] text-[#1A1A1A] rounded-tl-sm'
        }`}>
          {msg.content
            ? renderContent(msg.content)
            : <span className="inline-flex gap-1 items-center text-[#9A8E7E]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#C97552] animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[#C97552] animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[#C97552] animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
          }
        </div>

        {/* Trip created CTA */}
        {msg.tripCreated && (
          <Link
            href={`/trip/${msg.tripCreated.token}`}
            className="flex items-center justify-between gap-2 bg-[#C97552] text-white px-4 py-2.5 rounded-xl hover:bg-[#b86644] transition-colors"
          >
            <div>
              <p className="text-xs font-semibold">{msg.tripCreated.name}</p>
              <p className="text-[11px] text-white/80">Tap to view &amp; edit your itinerary</p>
            </div>
            <span className="text-lg flex-shrink-0">→</span>
          </Link>
        )}
      </div>
    </div>
  )
}

// ─── GlobalChatBar ─────────────────────────────────────────────────────────────

export default function GlobalChatBar() {
  const pathname = usePathname()
  const { messages, isLoading, sendMessage, clearChat } = useChat()

  const [open,   setOpen]  = useState(false)
  const [input,  setInput] = useState('')
  const [isPro,  setIsPro] = useState<boolean | null>(null)  // null = loading

  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLTextAreaElement>(null)
  const panelRef   = useRef<HTMLDivElement>(null)

  // Check pro status on mount
  useEffect(() => {
    async function checkPro() {
      try {
        const supabase = getSupabaseClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setIsPro(false); return }
        const { data } = await supabase
          .from('subscriptions')
          .select('tier, expires_at')
          .eq('user_id', user.id)
          .single()
        if (!data) { setIsPro(false); return }
        const active = !data.expires_at || new Date(data.expires_at) > new Date()
        setIsPro(active && data.tier !== 'free')
      } catch { setIsPro(false) }
    }
    checkPro()
  }, [])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  async function submit() {
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')
    setOpen(true)
    await sendMessage(text, pageLabel(pathname))
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
  }

  const hasMessages = messages.length > 0

  return (
    <>
      {/* ── Backdrop (mobile) ─────────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/20 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Chat panel + input bar container ──────────────────────────────────── */}
      <div
        className={`
          fixed z-40 transition-all duration-300
          /* mobile: full-width strip above bottom nav */
          bottom-14 left-0 right-0
          /* desktop: floating bottom-right panel */
          md:bottom-4 md:right-4 md:left-auto md:w-[400px]
        `}
      >
        {/* Message panel — slides up when open */}
        {open && (
          <div
            ref={panelRef}
            className="
              bg-[#FAF8F5] border border-[#E8E0D6] shadow-xl
              /* mobile */
              rounded-t-2xl mx-0 max-h-[60vh]
              /* desktop */
              md:rounded-2xl md:mb-2 md:max-h-[480px]
              overflow-hidden flex flex-col
            "
          >
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8E0D6] flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-[#C97552] text-white text-[10px] font-bold flex items-center justify-center">
                  V
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#1A1A1A]">Vondrer Assistant</p>
                  <p className="text-[10px] text-[#9A8E7E]">{pageLabel(pathname)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {hasMessages && (
                  <button
                    onClick={clearChat}
                    className="text-[10px] text-[#9A8E7E] hover:text-[#C97552] transition-colors"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="text-[#9A8E7E] hover:text-[#1A1A1A] transition-colors p-1"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {!hasMessages && (
                <div className="space-y-4">
                  <p className="text-xs text-[#9A8E7E] text-center">
                    Ask me anything — I can plan full trips, answer travel questions, suggest swaps, and more.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {CHIPS.map(chip => (
                      <button
                        key={chip}
                        onClick={() => { setInput(chip); setTimeout(() => submit(), 0) }}
                        className="text-xs bg-white border border-[#E0D8CF] text-[#5A504A] px-3 py-1.5 rounded-full hover:border-[#C97552]/50 hover:text-[#C97552] transition-colors"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map(msg => <Bubble key={msg.id} msg={msg} />)}
              <div ref={bottomRef} />
            </div>
          </div>
        )}

        {/* ── Input bar (always visible) ─────────────────────────────────────── */}
        {isPro === false ? (
          /* ── LOCKED state for free users ── */
          <Link
            href="/pro"
            className="block mx-3 md:mx-0 bg-white border border-[#E0D8CF] shadow-lg rounded-2xl px-3 py-2.5 hover:border-[#C97552]/50 hover:bg-[#FFF8F5] transition-all group"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-[#F0EBE3] text-[#C97552] text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                🔒
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#B8B0A4] truncate">AI Chat assistant</p>
                <p className="text-[10px] text-[#C97552] font-medium group-hover:underline">Pro feature — upgrade to unlock →</p>
              </div>
            </div>
          </Link>
        ) : (
          /* ── UNLOCKED state for pro users (or while loading) ── */
          <div className="
            bg-white border border-[#E0D8CF] shadow-lg
            mx-3 rounded-2xl
            md:mx-0 md:rounded-2xl
          ">
            <div className="flex items-end gap-2 px-3 py-2.5">
              {/* Vondrer dot */}
              <button
                onClick={() => setOpen(o => !o)}
                className="w-7 h-7 rounded-full bg-[#C97552] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mb-0.5 hover:bg-[#b86644] transition-colors"
              >
                {open ? '▾' : 'V'}
              </button>

              {/* Textarea */}
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => {
                  setInput(e.target.value)
                  e.target.style.height = 'auto'
                  e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px'
                }}
                onKeyDown={handleKey}
                onFocus={() => setOpen(true)}
                placeholder={placeholder(pathname)}
                rows={1}
                className="flex-1 text-sm text-[#1A1A1A] bg-transparent resize-none focus:outline-none placeholder:text-[#B8B0A4] leading-5"
                style={{ height: '20px', maxHeight: '80px' }}
              />

              {/* Send button */}
              <button
                onClick={submit}
                disabled={!input.trim() || isLoading}
                className="w-7 h-7 rounded-full bg-[#C97552] text-white flex items-center justify-center flex-shrink-0 mb-0.5 hover:bg-[#b86644] disabled:opacity-30 transition-all"
              >
                {isLoading
                  ? <span className="w-3 h-3 border border-white/60 border-t-white rounded-full animate-spin" />
                  : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                }
              </button>
            </div>

            {/* Unread indicator */}
            {!open && hasMessages && (
              <div className="px-4 pb-2 -mt-1">
                <button
                  onClick={() => setOpen(true)}
                  className="text-[10px] text-[#C97552] hover:underline"
                >
                  ↑ {messages.length} message{messages.length !== 1 ? 's' : ''} in this session
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
