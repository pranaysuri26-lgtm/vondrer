'use client'

import { useState, useEffect } from 'react'
import type { VisaInfo } from '@/app/api/visa/route'

const LS_KEY = 'vondrer-passport-country'

const STATUS: Record<VisaInfo['requirement'], {
  icon: string; label: string
  light: string; dark: string
}> = {
  visa_free:       { icon: '✅', label: 'Visa-free',          light: 'text-emerald-700 bg-emerald-50 border-emerald-200',  dark: 'text-emerald-400 bg-emerald-900/20 border-emerald-800/40' },
  visa_on_arrival: { icon: '🟡', label: 'Visa on arrival',    light: 'text-amber-700 bg-amber-50 border-amber-200',        dark: 'text-amber-400 bg-amber-900/20 border-amber-800/40'       },
  e_visa:          { icon: '💻', label: 'e-Visa required',    light: 'text-blue-700 bg-blue-50 border-blue-200',           dark: 'text-blue-400 bg-blue-900/20 border-blue-800/40'          },
  visa_required:   { icon: '🔴', label: 'Visa required',      light: 'text-red-700 bg-red-50 border-red-200',              dark: 'text-red-400 bg-red-900/20 border-red-800/40'             },
  unknown:         { icon: 'ℹ️', label: 'Check requirements', light: 'text-stone-700 bg-stone-50 border-stone-200',        dark: 'text-stone-400 bg-stone-800/40 border-stone-700/40'       },
}

interface Props {
  homeCountry: string
  destCountry:  string
  variant?:    'light' | 'dark'
}

export default function VisaInlineBlock({ homeCountry, destCountry, variant = 'light' }: Props) {
  const [passport, setPassport] = useState(homeCountry)
  const [draft,    setDraft]    = useState(homeCountry)
  const [editing,  setEditing]  = useState(false)
  const [info,     setInfo]     = useState<VisaInfo | null>(null)
  const [loading,  setLoading]  = useState(true)

  const isDark = variant === 'dark'

  // Hydrate from localStorage — overrides prop if user previously set a custom passport
  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY)
    if (saved) { setPassport(saved); setDraft(saved) }
    else if (homeCountry) { setPassport(homeCountry); setDraft(homeCountry) }
  }, [homeCountry])

  useEffect(() => {
    if (!passport || !destCountry) { setLoading(false); return }
    setLoading(true)
    const cacheKey = `visa:${passport}:${destCountry}`
    const cached = sessionStorage.getItem(cacheKey)
    if (cached) { setInfo(JSON.parse(cached)); setLoading(false); return }

    fetch(`/api/visa?from=${encodeURIComponent(passport)}&to=${encodeURIComponent(destCountry)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setInfo(d); sessionStorage.setItem(cacheKey, JSON.stringify(d)) } })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [passport, destCountry])

  function savePassport() {
    const t = draft.trim()
    if (!t) return
    sessionStorage.removeItem(`visa:${passport}:${destCountry}`)
    setPassport(t)
    setInfo(null)
    setLoading(true)
    localStorage.setItem(LS_KEY, t)
    setEditing(false)
  }

  if (!passport && !editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className={`text-xs underline underline-offset-2 transition-colors ${isDark ? 'text-[#666] hover:text-[#C97552]' : 'text-[#9A8E7E] hover:text-[#C97552]'}`}
      >
        🛂 Add passport country for visa info
      </button>
    )
  }

  if (editing) {
    return (
      <form
        onSubmit={e => { e.preventDefault(); savePassport() }}
        onClick={e => e.stopPropagation()}
        className="flex items-center gap-1.5"
      >
        <span className={`text-[10px] uppercase tracking-widest flex-shrink-0 ${isDark ? 'text-[#666]' : 'text-[#9A8E7E]'}`}>
          🛂 Passport
        </span>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          autoFocus
          placeholder="e.g. India"
          className={`flex-1 text-xs border rounded-lg px-2 py-1 focus:outline-none min-w-0 ${
            isDark
              ? 'bg-[#2A2A2E] border-[#444] text-white placeholder-[#555] focus:border-[#C97552]/60'
              : 'bg-white border-[#D8D0C4] text-[#1A1A1A] placeholder-[#9A8E7E] focus:border-[#C97552]/60'
          }`}
        />
        <button type="submit" className="text-[11px] bg-[#C97552] text-white px-2.5 py-1 rounded-lg hover:bg-[#b86644] flex-shrink-0">
          Save
        </button>
        <button
          type="button"
          onClick={() => { setEditing(false); setDraft(passport) }}
          className={`text-[11px] flex-shrink-0 ${isDark ? 'text-[#666]' : 'text-[#9A8E7E]'}`}
        >
          ✕
        </button>
      </form>
    )
  }

  if (loading) {
    return <div className={`h-8 rounded-xl animate-pulse ${isDark ? 'bg-[#2A2A2E]' : 'bg-[#F0EBE3]'}`} />
  }

  if (!info) return null

  const s = STATUS[info.requirement]
  const colorClass = isDark ? s.dark : s.light

  return (
    <div className={`rounded-xl border ${colorClass} px-3 py-2 flex items-center gap-2`}>
      <span className="text-sm flex-shrink-0">{s.icon}</span>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-semibold uppercase tracking-wider">{s.label}</span>
        {info.summary && (
          <span className="text-xs opacity-70 ml-1.5 hidden sm:inline">{info.summary}</span>
        )}
      </div>
      <button
        onClick={e => { e.stopPropagation(); setEditing(true) }}
        className="text-[10px] opacity-50 hover:opacity-90 transition-opacity flex-shrink-0 underline underline-offset-1"
      >
        {passport} ✎
      </button>
    </div>
  )
}
