'use client'

import { useState, useRef, useEffect } from 'react'
import type { SerializableDest } from './ItineraryTabs'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  role:    'user' | 'assistant'
  content: string
}

interface Props {
  tripId:   string
  tripName: string
  dests:    SerializableDest[]
}

// ─── Quick-prompt chips shown before first message ────────────────────────────

const CHIPS = [
  'What should I pack?',
  'Best way between stops?',
  'Any restaurants to swap?',
  'Weather tips for my dates?',
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function TripChat({ tripId, tripName, dests }: Props) {
  const [open,     setOpen]     = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLTextAreaElement>(null)

  // Greeting on first open
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role:    'assistant',
        content: `Hi! I'm your Voya travel assistant for **${tripName}**. Ask me anything — logistics, restaurant swaps, what to pack, or how to tweak any day. 🗺️`,
      }])
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 150)
  }, [open, tripName, messages.length])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(text?: string) {
    const userMsg = (text ?? input).trim()
    if (!userMsg || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setLoading(true)

    try {
      const res = await fetch(`/api/trip/${tripId}/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          message:  userMsg,
          history:  messages.slice(-10),
          tripName,
          dests: dests.map(d => ({
            destination_name: d.destination_name,
            country:          d.country,
            start_date:       d.start_date,
            end_date:         d.end_date,
            itinerary_json:   d.itinerary_json,
          })),
        }),
      })

      if (!res.ok || !res.body) throw new Error('Chat failed')

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''

      setMessages(prev => [...prev, { role: 'assistant', content: '' }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const lines = decoder.decode(value).split('\n')
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)
          if (payload === '[DONE]') break
          try {
            const { text } = JSON.parse(payload) as { text: string }
            acc += text
            setMessages(prev => {
              const copy = [...prev]
              copy[copy.length - 1] = { role: 'assistant', content: acc }
              return copy
            })
          } catch { /* ignore malformed */ }
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong — please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  const isFirstMessage = messages.length <= 1

  return (
    <>
      {/* ── Floating button ──────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Chat with Voya AI"
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white transition-all hover:scale-105 ${
          open ? 'bg-[#5A504A] hover:bg-[#1A1A1A]' : 'bg-[#C97552] hover:bg-[#b86644]'
        }`}
      >
        {open ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )}
      </button>

      {/* ── Chat panel ───────────────────────────────────────────────────────── */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[380px] max-w-[calc(100vw-3rem)] h-[540px] bg-white rounded-2xl shadow-2xl border border-[#E8E0D6] flex flex-col overflow-hidden">

          {/* Header */}
          <div className="px-4 py-3 border-b border-[#E8E0D6] bg-[#FAF8F5] flex items-center gap-3">
            <div className="w-8 h-8 bg-[#C97552] rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              V
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#1A1A1A] leading-tight">Voya AI</p>
              <p className="text-[10px] text-[#9A8E7E] truncate">{tripName}</p>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] text-[#9A8E7E]">online</span>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 bg-[#C97552] rounded-full flex items-center justify-center text-white text-[10px] font-bold mr-2 mt-0.5 flex-shrink-0">V</div>
                )}
                <div className={`max-w-[80%] px-3 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-[#C97552] text-white rounded-br-sm'
                    : 'bg-[#F0EBE3] text-[#1A1A1A] rounded-bl-sm'
                }`}>
                  {msg.content || (
                    <span className="flex gap-1 items-center h-4">
                      {[0, 150, 300].map(d => (
                        <span key={d} className="w-1.5 h-1.5 rounded-full bg-[#8A7E6E] animate-bounce" style={{ animationDelay: `${d}ms` }} />
                      ))}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {/* Quick-prompt chips */}
            {isFirstMessage && !loading && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {CHIPS.map(chip => (
                  <button
                    key={chip}
                    onClick={() => send(chip)}
                    className="text-xs text-[#6b5f54] border border-[#D8D0C4] rounded-full px-3 py-1.5 hover:border-[#C97552] hover:text-[#C97552] transition-colors bg-white"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 pb-3 pt-2 border-t border-[#E8E0D6]">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
                }}
                placeholder="Ask anything about your trip…"
                rows={1}
                className="flex-1 resize-none text-sm text-[#1A1A1A] bg-[#F8F5F1] border border-[#E0D8CF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#C97552]/60 max-h-28 overflow-auto"
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || loading}
                className="w-9 h-9 bg-[#C97552] text-white rounded-xl flex items-center justify-center hover:bg-[#b86644] disabled:opacity-40 transition-colors flex-shrink-0"
              >
                <svg className="w-4 h-4 rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
            <p className="text-[10px] text-[#C0B8B0] mt-1.5 text-center">Powered by Claude · Enter to send</p>
          </div>
        </div>
      )}
    </>
  )
}
