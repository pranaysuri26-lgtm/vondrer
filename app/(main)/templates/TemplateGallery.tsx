'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'

const CATEGORIES = ['beach','city','adventure','culture','foodie','romantic','family','backpacker']

const CAT_EMOJI: Record<string, string> = {
  beach: '🏖️', city: '🏙️', adventure: '🧗', culture: '🏛️',
  foodie: '🍜', romantic: '💑', family: '👨‍👩‍👧', backpacker: '🎒',
}

interface Template {
  id:               string
  title:            string
  description:      string | null
  destination_name: string
  country:          string
  days:             number
  category:         string[]
  copies:           number
  views:            number
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
    </svg>
  )
}

export default function TemplateGallery({ templates }: { templates: Template[] }) {
  const router = useRouter()

  const [filter,   setFilter]   = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])        // ordered selection
  const [showModal, setShowModal] = useState(false)
  const [tripName,  setTripName]  = useState('')
  const [creating,  setCreating]  = useState(false)
  const [error,     setError]     = useState('')

  const filtered = useMemo(() =>
    filter ? templates.filter(t => t.category?.includes(filter)) : templates
  , [templates, filter])

  // Ordered selected templates (preserving selection order)
  const orderedSelected = selected
    .map(id => templates.find(t => t.id === id))
    .filter((t): t is Template => !!t)

  function toggleSelect(id: string) {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    )
  }

  function moveUp(idx: number) {
    if (idx === 0) return
    setSelected(prev => {
      const next = [...prev]
      ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
      return next
    })
  }

  function moveDown(idx: number) {
    if (idx === orderedSelected.length - 1) return
    setSelected(prev => {
      const next = [...prev]
      ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      return next
    })
  }

  function openModal() {
    // Auto-name from selected destinations
    const names = orderedSelected.map(t => t.destination_name)
    setTripName(names.join(' + '))
    setShowModal(true)
    setError('')
  }

  function closeModal() {
    if (creating) return
    setShowModal(false)
  }

  async function createTrip() {
    if (!tripName.trim() || selected.length === 0) return
    setCreating(true)
    setError('')
    try {
      const res = await fetch('/api/trips/from-templates', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: tripName.trim(), template_ids: selected }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create trip')
      router.push(`/trip/${data.share_token}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not create trip.')
      setCreating(false)
    }
  }

  const totalDays = orderedSelected.reduce((s, t) => s + t.days, 0)

  return (
    <>
      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6" style={{ scrollbarWidth: 'none' }}>
        <button
          onClick={() => setFilter(null)}
          className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors ${
            !filter
              ? 'border-[#C97552] text-[#C97552] bg-[#FFF8F5]'
              : 'border-[#E0D8CF] text-[#6b5f54] bg-white hover:border-[#C97552] hover:text-[#C97552]'
          }`}
        >
          All
        </button>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(filter === cat ? null : cat)}
            className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full border capitalize transition-colors ${
              filter === cat
                ? 'border-[#C97552] text-[#C97552] bg-[#FFF8F5]'
                : 'border-[#E0D8CF] text-[#6b5f54] bg-white hover:border-[#C97552] hover:text-[#C97552]'
            }`}
          >
            {CAT_EMOJI[cat]} {cat}
          </button>
        ))}
      </div>

      {/* Combine hint (shown when nothing selected yet) */}
      {selected.length === 0 && templates.length > 0 && (
        <p className="text-xs text-[#B8B0A4] mb-4 italic">
          Tip: select multiple templates to combine them into a multi-city trip.
        </p>
      )}

      {/* Template grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-4">🗺️</p>
          <p className="text-[#9A8E7E] text-sm">No templates yet.</p>
          <p className="text-[#B8B0A4] text-xs mt-1">Be the first — finish a trip and publish it as a template.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-28">
          {filtered.map(t => {
            const isSelected = selected.includes(t.id)
            const selIdx     = selected.indexOf(t.id)
            return (
              <div
                key={t.id}
                onClick={() => toggleSelect(t.id)}
                className={`relative bg-white border rounded-2xl overflow-hidden cursor-pointer transition-all group ${
                  isSelected
                    ? 'border-[#C97552] ring-2 ring-[#C97552]/20 shadow-sm'
                    : 'border-[#E8E0D6] hover:border-[#C97552]/40'
                }`}
              >
                {/* Selection badge */}
                <div className={`absolute top-3 right-3 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                  isSelected
                    ? 'bg-[#C97552] border-[#C97552] text-white'
                    : 'bg-white/80 border-[#D8D0C4] group-hover:border-[#C97552]/50'
                }`}>
                  {isSelected ? (
                    <span className="text-[10px] font-bold">{selIdx + 1}</span>
                  ) : (
                    <svg className="w-3 h-3 text-transparent group-hover:text-[#C97552]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                    </svg>
                  )}
                </div>

                {/* Gradient header */}
                <div className={`h-20 bg-gradient-to-br transition-all ${
                  isSelected ? 'from-[#C97552]/30 to-[#E8D5C4]/50' : 'from-[#C97552]/20 to-[#E8D5C4]/40'
                } flex items-end px-4 pb-2`}>
                  <p className="text-[10px] text-[#9A8E7E] uppercase tracking-widest">
                    {t.destination_name}, {t.country}
                  </p>
                </div>

                <div className="p-4">
                  <h3 className={`font-serif italic text-base mb-1 transition-colors ${isSelected ? 'text-[#C97552]' : 'text-[#1A1A1A] group-hover:text-[#C97552]'}`}>
                    {t.title}
                  </h3>
                  {t.description && (
                    <p className="text-xs text-[#6b5f54] line-clamp-2 mb-3">{t.description}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex gap-3 text-[11px] text-[#9A8E7E]">
                      <span>{t.days} {t.days === 1 ? 'day' : 'days'}</span>
                      <span>{t.copies} copies</span>
                    </div>
                    <div className="flex gap-1">
                      {(t.category ?? []).slice(0, 2).map(cat => (
                        <span key={cat} className="text-[10px] bg-[#F0EBE3] text-[#8A7E6E] px-2 py-0.5 rounded-full capitalize">
                          {cat}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Single-use link (stops propagation so it doesn't toggle selection) */}
                  {!isSelected && (
                    <a
                      href={`/plan?template=${t.id}`}
                      onClick={e => e.stopPropagation()}
                      className="mt-3 block text-center text-xs font-medium text-[#C97552] border border-[#C97552]/30 rounded-full py-2 hover:bg-[#C97552] hover:text-white transition-colors"
                    >
                      Use alone →
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Sticky combine bar ────────────────────────────────────────────────── */}
      {selected.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center p-4 pointer-events-none">
          <div className="pointer-events-auto bg-[#1A1A1A] text-white rounded-2xl shadow-2xl px-5 py-3.5 flex items-center gap-4 max-w-sm w-full">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">
                {selected.length} {selected.length === 1 ? 'template' : 'templates'} selected
              </p>
              <p className="text-xs text-white/60 mt-0.5">{totalDays} days total</p>
            </div>
            <button
              onClick={() => setSelected([])}
              className="text-white/50 hover:text-white/80 text-xs transition-colors flex-shrink-0"
            >
              Clear
            </button>
            <button
              onClick={openModal}
              className="bg-[#C97552] text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-[#b86644] transition-colors flex-shrink-0"
            >
              {selected.length === 1 ? 'Create trip →' : 'Combine →'}
            </button>
          </div>
        </div>
      )}

      {/* ── Combine modal ─────────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">

            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#F0EBE3]">
              <div>
                <h3 className="font-semibold text-[#1A1A1A]">Create trip</h3>
                <p className="text-xs text-[#9A8E7E] mt-0.5">
                  {totalDays} days across {orderedSelected.length} {orderedSelected.length === 1 ? 'destination' : 'destinations'}
                </p>
              </div>
              <button onClick={closeModal} className="text-[#9A8E7E] hover:text-[#1A1A1A] transition-colors p-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Trip name */}
              <div>
                <label className="text-xs text-[#9A8E7E] uppercase tracking-widest block mb-1.5">Trip name</label>
                <input
                  value={tripName}
                  onChange={e => setTripName(e.target.value)}
                  placeholder="e.g. SF + Napa Weekend"
                  className="w-full text-sm text-[#1A1A1A] border border-[#D8D0C4] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#C97552]/60"
                />
              </div>

              {/* Ordered segments */}
              <div>
                <label className="text-xs text-[#9A8E7E] uppercase tracking-widest block mb-2">
                  Itinerary order
                  <span className="normal-case text-[#B8B0A4] ml-1">— drag to reorder</span>
                </label>
                <div className="space-y-2">
                  {orderedSelected.map((t, i) => (
                    <div key={t.id} className="flex items-center gap-3 p-3 bg-[#F8F5F1] rounded-xl border border-[#E8E0D6]">
                      <span className="w-5 h-5 rounded-full bg-[#C97552] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#1A1A1A] truncate">{t.destination_name}</p>
                        <p className="text-xs text-[#9A8E7E]">{t.days} {t.days === 1 ? 'day' : 'days'} · {t.title}</p>
                      </div>
                      <div className="flex flex-col gap-0.5 flex-shrink-0">
                        <button
                          onClick={() => moveUp(i)}
                          disabled={i === 0}
                          className="text-[#B8B0A4] hover:text-[#5A504A] disabled:opacity-20 transition-colors p-0.5"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7"/>
                          </svg>
                        </button>
                        <button
                          onClick={() => moveDown(i)}
                          disabled={i === orderedSelected.length - 1}
                          className="text-[#B8B0A4] hover:text-[#5A504A] disabled:opacity-20 transition-colors p-0.5"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                          </svg>
                        </button>
                      </div>
                      <button
                        onClick={() => toggleSelect(t.id)}
                        className="text-[#B8B0A4] hover:text-red-400 transition-colors p-1 flex-shrink-0"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {error && <p className="text-red-400 text-xs">{error}</p>}
            </div>

            <div className="px-5 pb-5 flex gap-3">
              <button
                onClick={closeModal}
                disabled={creating}
                className="flex-1 py-2.5 text-sm border border-[#E0D8CF] rounded-full text-[#6b5f54] hover:border-[#C8C0B4] transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={createTrip}
                disabled={creating || !tripName.trim()}
                className="flex-1 py-2.5 text-sm bg-[#C97552] text-white rounded-full hover:bg-[#b86644] transition-colors disabled:opacity-40 font-semibold flex items-center justify-center gap-2"
              >
                {creating ? <><Spinner /> Creating…</> : 'Create trip →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
