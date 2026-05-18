'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface ApiKey {
  id:             string
  name:           string
  key_prefix:     string
  created_at:     string
  last_used_at:   string | null
  requests_count: number
}

export default function DeveloperPage() {
  const [keys,       setKeys]       = useState<ApiKey[]>([])
  const [loading,    setLoading]    = useState(true)
  const [name,       setName]       = useState('')
  const [creating,   setCreating]   = useState(false)
  const [newKey,     setNewKey]     = useState<string | null>(null)
  const [copied,     setCopied]     = useState(false)
  const [error,      setError]      = useState('')
  const [isPro,      setIsPro]      = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/user/status')
      .then(r => r.json())
      .then(d => setIsPro(d.isPro ?? false))
      .catch(() => setIsPro(false))
  }, [])

  useEffect(() => {
    if (isPro === false) return  // don't fetch keys for free users
    fetch('/api/developer/keys')
      .then(r => r.json())
      .then(d => setKeys(d.keys ?? []))
      .finally(() => setLoading(false))
  }, [isPro])

  async function create() {
    if (!name.trim()) return
    setCreating(true); setError('')
    const res  = await fetch('/api/developer/keys', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setCreating(false); return }
    setNewKey(data.key)
    setKeys(prev => [data.meta, ...prev])
    setName('')
    setCreating(false)
  }

  async function remove(id: string) {
    await fetch('/api/developer/keys', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id }),
    })
    setKeys(prev => prev.filter(k => k.id !== id))
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  // ── Pro gate ────────────────────────────────────────────────────────────────
  if (isPro === false) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-[#F0EBE3] text-3xl flex items-center justify-center mx-auto">🔑</div>
          <div>
            <p className="text-xs text-[#C97552] uppercase tracking-widest mb-2">Developer API</p>
            <h1 className="font-serif italic text-3xl text-[#1A1A1A] mb-3">Pro feature</h1>
            <p className="text-sm text-[#6b5f54] leading-relaxed">
              API keys let you embed Vondrer's itinerary engine in your own product.
              Upgrade to Pro to generate keys and start building.
            </p>
          </div>
          <div className="bg-white border border-[#E8E0D6] rounded-2xl p-5 text-left space-y-3">
            <p className="text-xs text-[#9A8E7E] uppercase tracking-widest">What you get</p>
            {[
              'Up to 5 API keys',
              'Full itinerary JSON responses',
              'Usage tracking per key',
              'Bearer token authentication',
            ].map(item => (
              <div key={item} className="flex items-center gap-2 text-sm text-[#1A1A1A]">
                <span className="text-[#C97552]">✓</span> {item}
              </div>
            ))}
          </div>
          <Link
            href="/pro"
            className="block w-full bg-[#C97552] text-white text-sm font-medium py-3 rounded-xl hover:bg-[#b86644] transition-colors"
          >
            Upgrade to Pro →
          </Link>
          <p className="text-xs text-[#9A8E7E]">Already Pro? Try refreshing the page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <div className="max-w-2xl mx-auto px-4 pt-12 pb-16 space-y-8">

        {/* Header */}
        <div>
          <p className="text-xs text-[#C97552] uppercase tracking-widest mb-2">Developer</p>
          <h1 className="font-serif italic text-3xl text-[#1A1A1A] mb-2">API Keys</h1>
          <p className="text-sm text-[#6b5f54]">
            Use the Vondrer API to embed AI itinerary generation in your own product.
            Keys authenticate via <code className="bg-[#F0EBE3] px-1 rounded text-xs">Authorization: Bearer vondrer_…</code>
          </p>
        </div>

        {/* Newly created key banner */}
        {newKey && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
            <p className="text-xs font-semibold text-amber-800 uppercase tracking-widest">⚠️ Save this key — shown only once</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-white border border-amber-200 rounded-lg px-3 py-2 break-all font-mono">{newKey}</code>
              <button
                onClick={() => copy(newKey)}
                className="flex-shrink-0 text-xs bg-amber-600 text-white px-3 py-2 rounded-lg hover:bg-amber-700 transition-colors"
              >
                {copied ? '✓' : 'Copy'}
              </button>
            </div>
            <button onClick={() => setNewKey(null)} className="text-xs text-amber-700 underline">Dismiss</button>
          </div>
        )}

        {/* Create new key */}
        <div className="bg-white border border-[#E8E0D6] rounded-2xl p-5 space-y-3">
          <p className="text-sm font-semibold text-[#1A1A1A]">Create new key</p>
          <div className="flex gap-3">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') create() }}
              placeholder="e.g. Production, My App"
              className="flex-1 text-sm border border-[#D8D0C4] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#C97552]/60"
            />
            <button
              onClick={create}
              disabled={!name.trim() || creating}
              className="text-sm bg-[#C97552] text-white px-5 py-2.5 rounded-xl hover:bg-[#b86644] disabled:opacity-40 transition-colors"
            >
              {creating ? '…' : 'Create'}
            </button>
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>

        {/* Keys list */}
        <div className="space-y-3">
          <p className="text-xs text-[#9A8E7E] uppercase tracking-widest">Your keys ({keys.length}/5)</p>
          {loading && <p className="text-sm text-[#9A8E7E]">Loading…</p>}
          {!loading && keys.length === 0 && (
            <p className="text-sm text-[#9A8E7E] italic">No API keys yet.</p>
          )}
          {keys.map(k => (
            <div key={k.id} className="bg-white border border-[#E8E0D6] rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#1A1A1A]">{k.name}</p>
                <p className="text-xs text-[#9A8E7E] font-mono">{k.key_prefix}…</p>
              </div>
              <div className="text-right text-xs text-[#9A8E7E] flex-shrink-0">
                <p>{k.requests_count} req</p>
                {k.last_used_at && <p>Used {new Date(k.last_used_at).toLocaleDateString()}</p>}
              </div>
              <button
                onClick={() => remove(k.id)}
                className="text-[#9A8E7E] hover:text-red-500 transition-colors ml-1 p-1"
                title="Revoke key"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        {/* Quick-start docs */}
        <div className="bg-[#1A1A1A] rounded-2xl p-5 space-y-3">
          <p className="text-xs text-[#9A8E7E] uppercase tracking-widest">Quick start</p>
          <pre className="text-xs text-emerald-400 overflow-auto leading-relaxed">{`curl -X POST https://vondrer.com/api/itinerary \\
  -H "Authorization: Bearer vondrer_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "destination": "Tokyo",
    "country": "Japan",
    "days": 5,
    "start_date": "2026-09-01"
  }'`}</pre>
          <p className="text-xs text-[#6b5f54]">Returns a full itinerary JSON. See <a href="/api-docs" className="text-[#C97552] underline">API docs →</a></p>
        </div>
      </div>
    </div>
  )
}
