'use client'

import { useState } from 'react'
import Link from 'next/link'

const CATEGORIES = [
  'beach', 'city', 'adventure', 'culture',
  'foodie', 'romantic', 'family', 'backpacker',
]

const CAT_EMOJI: Record<string, string> = {
  beach: '🏖️', city: '🏙️', adventure: '🧗', culture: '🏛️',
  foodie: '🍜', romantic: '💑', family: '👨‍👩‍👧', backpacker: '🎒',
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
    </svg>
  )
}

export default function PublishTemplateButton({ tripId }: { tripId: string }) {
  const [open,        setOpen]        = useState(false)
  const [description, setDescription] = useState('')
  const [selected,    setSelected]    = useState<string[]>([])
  const [publishing,  setPublishing]  = useState(false)
  const [published,   setPublished]   = useState(false)
  const [error,       setError]       = useState('')

  function toggleCat(cat: string) {
    setSelected(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    )
  }

  async function publish() {
    setPublishing(true)
    setError('')
    try {
      const res = await fetch('/api/templates', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ trip_id: tripId, description, category: selected }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to publish')
      setPublished(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not publish template.')
    } finally {
      setPublishing(false)
    }
  }

  function close() {
    if (publishing) return
    setOpen(false)
    // reset after close animation
    setTimeout(() => { setPublished(false); setDescription(''); setSelected([]); setError('') }, 300)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-[#9A8E7E] border border-[#E0D8CF] rounded-full px-3 py-1.5 hover:border-[#C97552]/50 hover:text-[#C97552] hover:bg-[#FFF8F5] transition-all"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
        </svg>
        Publish as template
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">

            {published ? (
              /* ── Success state ── */
              <div className="p-6 text-center space-y-4">
                <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto text-2xl">
                  🎉
                </div>
                <div>
                  <h3 className="font-semibold text-[#1A1A1A] text-lg">Template published!</h3>
                  <p className="text-sm text-[#6b5f54] mt-1">
                    Your trip is now live in the community template gallery.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={close}
                    className="flex-1 py-2.5 text-sm border border-[#E0D8CF] rounded-full text-[#6b5f54] hover:border-[#C8C0B4] transition-colors"
                  >
                    Done
                  </button>
                  <Link
                    href="/templates"
                    className="flex-1 py-2.5 text-sm text-center bg-[#C97552] text-white rounded-full hover:bg-[#b86644] transition-colors font-semibold"
                  >
                    View gallery →
                  </Link>
                </div>
              </div>
            ) : (
              /* ── Publish form ── */
              <>
                <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#F0EBE3]">
                  <div>
                    <h3 className="font-semibold text-[#1A1A1A]">Publish as template</h3>
                    <p className="text-xs text-[#9A8E7E] mt-0.5">Share this trip in the community gallery</p>
                  </div>
                  <button onClick={close} className="text-[#9A8E7E] hover:text-[#1A1A1A] p-1 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                  </button>
                </div>

                <div className="px-5 py-4 space-y-4">
                  {/* Description */}
                  <div>
                    <label className="text-xs text-[#9A8E7E] uppercase tracking-widest block mb-1.5">
                      Description
                    </label>
                    <textarea
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      rows={3}
                      placeholder="What makes this trip special? (e.g. best beaches, hidden gems, budget-friendly spots)"
                      className="w-full text-sm text-[#1A1A1A] border border-[#D8D0C4] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#C97552]/60 resize-none placeholder:text-[#B8B0A4]"
                    />
                  </div>

                  {/* Categories */}
                  <div>
                    <label className="text-xs text-[#9A8E7E] uppercase tracking-widest block mb-2">
                      Categories <span className="normal-case text-[#B8B0A4]">(pick all that apply)</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {CATEGORIES.map(cat => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => toggleCat(cat)}
                          className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border transition-all ${
                            selected.includes(cat)
                              ? 'border-[#C97552] bg-[#FFF8F5] text-[#C97552] font-medium'
                              : 'border-[#E0D8CF] text-[#6b5f54] hover:border-[#C97552]/40'
                          }`}
                        >
                          {CAT_EMOJI[cat]} {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {error && <p className="text-red-400 text-xs">{error}</p>}
                </div>

                <div className="px-5 pb-5 flex gap-3">
                  <button
                    onClick={close}
                    disabled={publishing}
                    className="flex-1 py-2.5 text-sm border border-[#E0D8CF] rounded-full text-[#6b5f54] hover:border-[#C8C0B4] transition-colors disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={publish}
                    disabled={publishing}
                    className="flex-1 py-2.5 text-sm bg-[#C97552] text-white rounded-full hover:bg-[#b86644] transition-colors disabled:opacity-40 font-semibold flex items-center justify-center gap-2"
                  >
                    {publishing ? <><Spinner /> Publishing…</> : 'Publish'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
