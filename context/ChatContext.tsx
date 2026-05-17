'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id:           string
  role:         'user' | 'assistant'
  content:      string
  tripCreated?: { token: string; name: string }
}

interface ChatContextValue {
  messages:    ChatMessage[]
  isLoading:   boolean
  sendMessage: (text: string, pageContext?: string) => Promise<void>
  clearChat:   () => void
}

// ─── Context ───────────────────────────────────────────────────────────────────

const ChatContext = createContext<ChatContextValue | null>(null)

const SS_KEY = 'voya-global-chat'

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [messages,  setMessages]  = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const messagesRef = useRef<ChatMessage[]>([])

  // Keep ref in sync so sendMessage always reads latest without being in its dep array
  useEffect(() => { messagesRef.current = messages }, [messages])

  // Hydrate from sessionStorage on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SS_KEY)
      if (saved) setMessages(JSON.parse(saved))
    } catch { /* sessionStorage unavailable */ }
  }, [])

  // Persist to sessionStorage on every change
  useEffect(() => {
    try {
      sessionStorage.setItem(SS_KEY, JSON.stringify(messages))
    } catch { /* quota exceeded or unavailable */ }
  }, [messages])

  const sendMessage = useCallback(async (text: string, pageContext?: string) => {
    const userMsg: ChatMessage = {
      id:      crypto.randomUUID(),
      role:    'user',
      content: text,
    }
    const asstId = crypto.randomUUID()
    const asstMsg: ChatMessage = {
      id:      asstId,
      role:    'assistant',
      content: '',
    }

    setMessages(prev => [...prev, userMsg, asstMsg])
    setIsLoading(true)

    try {
      // Send last 10 turns as history
      const history = messagesRef.current.slice(-10).map(m => ({
        role:    m.role,
        content: m.content,
      }))

      const res = await fetch('/api/ask', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: text, history, pageContext }),
      })

      if (!res.ok || !res.body) throw new Error('Request failed')

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const line = part.split('\n').find(l => l.startsWith('data: '))
          if (!line) continue
          const raw = line.slice(6)
          if (raw === '[DONE]') continue
          try {
            const event = JSON.parse(raw)
            if (event.text) {
              setMessages(prev => prev.map(m =>
                m.id === asstId ? { ...m, content: m.content + event.text } : m
              ))
            }
            if (event.type === 'trip_created') {
              setMessages(prev => prev.map(m =>
                m.id === asstId
                  ? { ...m, tripCreated: { token: event.token, name: event.name } }
                  : m
              ))
            }
          } catch { /* malformed chunk */ }
        }
      }
    } catch {
      setMessages(prev => prev.map(m =>
        m.id === asstId
          ? { ...m, content: 'Something went wrong — please try again.' }
          : m
      ))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const clearChat = useCallback(() => {
    setMessages([])
    try { sessionStorage.removeItem(SS_KEY) } catch { /* noop */ }
  }, [])

  return (
    <ChatContext.Provider value={{ messages, isLoading, sendMessage, clearChat }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be used within ChatProvider')
  return ctx
}
