'use client'

import { useState, useEffect, useRef } from 'react'
import type { VisaInfo } from '@/app/api/visa/route'

interface Props {
  homeCountry:  string   // from user profile — used as fallback only
  destCountry:  string   // destination country
}

const STATUS_CONFIG: Record<VisaInfo['requirement'], { icon: string; label: string; bg: string; text: string; border: string }> = {
  visa_free:       { icon: '✅', label: 'Visa-free',         bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  visa_on_arrival: { icon: '🟡', label: 'Visa on arrival',   bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200'   },
  e_visa:          { icon: '💻', label: 'e-Visa required',   bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200'    },
  visa_required:   { icon: '🔴', label: 'Visa required',     bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200'     },
  unknown:         { icon: 'ℹ️', label: 'Check requirements', bg: 'bg-stone-50',   text: 'text-stone-700',   border: 'border-stone-200'   },
}

const LS_KEY = 'vondrer-passport-country'

export default function VisaStrip({ homeCountry, destCountry }: Props) {
  // ── Passport country — localStorage > profile home_country ──────────────────
  const [passportCountry, setPassportCountry] = useState(homeCountry)
  const [editing,         setEditing]         = useState(false)
  const [draft,           setDraft]           = useState(homeCountry)
  const inputRef = useRef<HTMLInputElement>(null)

  // Hydrate from localStorage on mount (client-only)
  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY)
    if (saved) { setPassportCountry(saved); setDraft(saved) }
  }, [])

  function savePassport() {
    const trimmed = draft.trim()
    if (!trimmed) return
    setPassportCountry(trimmed)
    localStorage.setItem(LS_KEY, trimmed)
    setEditing(false)
    // Clear cached visa info so it refetches for the new passport
    sessionStorage.removeItem(`visa:${passportCountry}:${destCountry}`)
  }

  // ── Visa info fetch ──────────────────────────────────────────────────────────
  const [info,     setInfo]     = useState<VisaInfo | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    setLoading(true)
    setInfo(null)
    const key = `visa:${passportCountry}:${destCountry}`
    const cached = sessionStorage.getItem(key)
    if (cached) { setInfo(JSON.parse(cached)); setLoading(false); return }

    fetch(`/api/visa?from=${encodeURIComponent(passportCountry)}&to=${encodeURIComponent(destCountry)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) { setInfo(d); sessionStorage.setItem(key, JSON.stringify(d)) }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [passportCountry, destCountry])

  // Focus input when editing opens
  useEffect(() => {
    if (editing) setTimeout(() => inputRef.current?.focus(), 50)
  }, [editing])

  if (loading) return (
    <div className="h-10 bg-[#F0EBE3] rounded-xl animate-pulse" />
  )
  if (!info) return null

  const cfg = STATUS_CONFIG[info.requirement]

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} overflow-hidden`}>

      {/* ── Passport selector row ────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 pt-2.5 pb-0">
        <span className="text-[10px] text-[#9A8E7E] uppercase tracking-widest flex-shrink-0">
          🛂 Passport
        </span>

        {editing ? (
          <form
            onSubmit={e => { e.preventDefault(); savePassport() }}
            className="flex items-center gap-1.5 flex-1"
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="e.g. India"
              className="flex-1 text-xs border border-[#D8D0C4] rounded-lg px-2 py-1 focus:outline-none focus:border-[#C97552]/60 bg-white min-w-0"
            />
            <button
              type="submit"
              className="text-[11px] bg-[#C97552] text-white px-2.5 py-1 rounded-lg hover:bg-[#b86644] transition-colors flex-shrink-0"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setDraft(passportCountry) }}
              className="text-[11px] text-[#9A8E7E] hover:text-[#5A504A] transition-colors flex-shrink-0"
            >
              Cancel
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className="text-xs font-medium text-[#1A1A1A] truncate">{passportCountry}</span>
            <button
              onClick={() => setEditing(true)}
              className="text-[10px] text-[#9A8E7E] hover:text-[#C97552] underline underline-offset-2 transition-colors flex-shrink-0"
            >
              Change
            </button>
            {passportCountry !== homeCountry && (
              <span className="text-[10px] text-[#C97552]/70 flex-shrink-0">· custom</span>
            )}
          </div>
        )}
      </div>

      {/* ── Summary row ──────────────────────────────────────────────────────── */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
      >
        <span className="text-base">{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold uppercase tracking-widest ${cfg.text}`}>{cfg.label}</p>
          <p className="text-xs text-[#5A504A] truncate mt-0.5">{info.summary}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {info.stay_days && (
            <span className={`text-xs font-medium ${cfg.text}`}>{info.stay_days}d max</span>
          )}
          <span className={`text-xs transition-transform ${expanded ? 'rotate-180' : ''} ${cfg.text}`}>▾</span>
        </div>
      </button>

      {/* ── Expanded details ─────────────────────────────────────────────────── */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-[#E8E0D6]">
          {info.steps && info.steps.length > 0 && (
            <div className="pt-3">
              <p className="text-[10px] text-[#9A8E7E] uppercase tracking-widest mb-2">Steps</p>
              <ol className="space-y-1.5">
                {info.steps.map((step, i) => (
                  <li key={i} className="flex gap-2 text-xs text-[#5A504A]">
                    <span className={`w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white ${cfg.text.replace('text-', 'bg-').replace('-700', '-500')}`}>
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            {info.cost       && <div><span className="text-[#9A8E7E]">Cost: </span><span className="text-[#1A1A1A]">{info.cost}</span></div>}
            {info.processing && <div><span className="text-[#9A8E7E]">Processing: </span><span className="text-[#1A1A1A]">{info.processing}</span></div>}
          </div>

          {info.important && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ⚠️ {info.important}
            </p>
          )}

          <div className="flex items-center justify-between pt-1">
            {info.official_url ? (
              <a href={info.official_url} target="_blank" rel="noopener noreferrer"
                className={`text-xs font-medium underline underline-offset-2 ${cfg.text}`}>
                Official portal →
              </a>
            ) : <span />}
            <p className="text-[10px] text-[#B8B0A4]">AI-generated · verify before travel · {info.last_verified}</p>
          </div>
        </div>
      )}
    </div>
  )
}
