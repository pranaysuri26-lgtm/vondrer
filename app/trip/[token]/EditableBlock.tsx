'use client'

import { useState } from 'react'
import type { ItineraryBlock } from '@/app/api/itinerary/route'
import { useWikiPhoto } from '@/hooks/useWikiPhoto'

// ─── Types ─────────────────────────────────────────────────────────────────────

type Mode = 'read' | 'edit' | 'loading-alts' | 'alts' | 'saving'

export interface AvailableDay {
  globalDay: number
  destId:    string
  destName:  string
  day:       number
}

export interface EditableBlockProps {
  label:         string
  block:         ItineraryBlock
  tripId:        string
  destId:        string
  day:           number
  slot:          'morning' | 'afternoon' | 'dinner' | 'evening'
  destination:   string
  country:       string
  dayContext?:   Record<string, string | undefined>
  stopNum?:      number
  availableDays?: AvailableDay[]
  onSaved:       (updated: ItineraryBlock) => void
  onSwapped?:    (toDestId: string, toDay: number, toSlot: string, newBlock: ItineraryBlock) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt12(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`
}

const SLOT_BG: Record<string, string> = {
  '🌅 Morning':   'from-amber-100  to-orange-50',
  '☀️ Afternoon': 'from-sky-100    to-blue-50',
  '🍽️ Dinner':    'from-rose-100   to-red-50',
  '🌙 Evening':   'from-indigo-100 to-purple-50',
}

function PencilIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
    </svg>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EditableBlock({
  label, block, tripId, destId, day, slot,
  destination, country, dayContext, stopNum,
  availableDays, onSaved, onSwapped,
}: EditableBlockProps) {
  const [mode, setMode]               = useState<Mode>('read')
  const [draft, setDraft]             = useState<ItineraryBlock>(block)
  const [alternatives, setAlternatives] = useState<ItineraryBlock[]>([])
  const [error, setError]             = useState('')
  const [savedFlash, setSavedFlash]   = useState(false)
  const [describing, setDescribing]           = useState(false)
  const [describingSubIdx, setDescribingSubIdx] = useState<number | null>(null)
  const [showMovePanel, setShowMovePanel] = useState(false)
  const [moveTarget, setMoveTarget]       = useState('')   // "destId|day" key
  const [moveSlot, setMoveSlot]           = useState<'morning'|'afternoon'|'dinner'|'evening'>('morning')
  const [moving, setMoving]               = useState(false)

  // Read mode always renders from the `block` prop — the parent is the single source
  // of truth. No local copy needed; onSaved() updates the parent which re-passes block.
  const photoUrl = useWikiPhoto(block.activity, destination, block.photo_url ?? undefined)

  // ── Persist block to DB ───────────────────────────────────────────────────────
  async function save(blockToSave: ItineraryBlock) {
    setMode('saving')
    setError('')
    // Clear cached photo when activity name changes so useWikiPhoto re-fetches for the new name
    const toSave = blockToSave.activity.trim() !== block.activity.trim()
      ? { ...blockToSave, photo_url: undefined }
      : blockToSave
    try {
      const res = await fetch(`/api/trip/${tripId}/save-block`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ destination_id: destId, day, slot, block: toSave }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Save failed')
      }
      onSaved(toSave)   // parent updates its localDests → block prop refreshes
      setMode('read')
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1800)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save. Try again.')
      setMode('edit')
    }
  }

  // ── AI: write description for a sub-stop by index ───────────────────────────
  async function describeSubStop(idx: number) {
    const subActivity = draft.also_visit?.[idx]?.activity?.trim()
    if (!subActivity) return
    setDescribingSubIdx(idx)
    setError('')
    try {
      const res = await fetch('/api/itinerary/describe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ activity: subActivity, destination, country, slot, day_context: dayContext }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setDraft(d => ({
        ...d,
        also_visit: (d.also_visit ?? []).map((s, j) =>
          j === idx
            ? { ...s, description: data.description || s.description, estimated_cost: data.estimated_cost || s.estimated_cost }
            : s
        ),
      }))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not generate description.')
    } finally {
      setDescribingSubIdx(null)
    }
  }

  // ── AI: write description for the current draft activity name ────────────────
  async function describeActivity() {
    setDescribing(true)
    setError('')
    try {
      const res = await fetch('/api/itinerary/describe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          activity:    draft.activity,
          destination, country, slot,
          day_context: dayContext,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setDraft(d => ({
        ...d,
        description:    data.description    || d.description,
        insider_tip:    data.insider_tip    || d.insider_tip,
        estimated_cost: data.estimated_cost || d.estimated_cost,
      }))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not generate description.')
    } finally {
      setDescribing(false)
    }
  }

  // ── Load 3 AI alternatives ────────────────────────────────────────────────────
  async function loadAlternatives() {
    setMode('loading-alts')
    setError('')
    try {
      const res = await fetch('/api/itinerary/alternatives', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          destination, country, day, slot,
          current_activity: block.activity,
          day_context: dayContext,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setAlternatives(data.alternatives ?? [])
      setMode('alts')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load alternatives.')
      setMode('edit')
    }
  }

  // ── Swap this block with another day/slot ────────────────────────────────────
  async function moveBlock() {
    if (!moveTarget || !onSwapped) return
    const [toDestId, toDayStr] = moveTarget.split('|')
    const toDay = parseInt(toDayStr, 10)
    setMoving(true)
    setError('')
    try {
      const res = await fetch(`/api/trip/${tripId}/swap-blocks`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          from: { dest_id: destId, day, slot },
          to:   { dest_id: toDestId, day: toDay, slot: moveSlot },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      onSaved(data.result_at_from)                          // update source slot
      onSwapped(toDestId, toDay, moveSlot, data.result_at_to)  // update target slot
      setShowMovePanel(false)
      setMode('read')
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1800)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not swap activities.')
    } finally {
      setMoving(false)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // READ MODE
  // ═══════════════════════════════════════════════════════════════════════════
  if (mode === 'read') {
    const time = block.start_time
      ? block.end_time
        ? `${fmt12(block.start_time)} – ${fmt12(block.end_time)}`
        : fmt12(block.start_time)
      : ''

    return (
      <div className="group/block relative">
        {/* Photo */}
        {photoUrl ? (
          <div className="relative h-40 -mx-5 mb-3 overflow-hidden">
            <img
              src={photoUrl} alt={block.activity}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
            <button
              onClick={() => { setDraft(block); setMode('edit') }}
              title="Edit this block"
              className="absolute top-2 right-2 opacity-70 hover:opacity-100 focus:opacity-100 w-7 h-7 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center text-[#8A7E6E] hover:bg-[#C97552] hover:text-white transition-all duration-150 shadow-sm"
            >
              <PencilIcon />
            </button>
          </div>
        ) : (
          <div className={`relative h-20 -mx-5 mb-3 bg-gradient-to-br ${SLOT_BG[label] ?? 'from-stone-100 to-stone-50'}`}>
            <button
              onClick={() => { setDraft(block); setMode('edit') }}
              title="Edit this block"
              className="absolute top-2 right-2 opacity-70 hover:opacity-100 focus:opacity-100 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center text-[#8A7E6E] hover:bg-[#C97552] hover:text-white transition-all duration-150 shadow-sm"
            >
              <PencilIcon />
            </button>
          </div>
        )}

        {/* Stop badge + label + time */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2">
            {stopNum !== undefined && (
              <span className="w-5 h-5 rounded-full bg-[#C97552] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                {stopNum}
              </span>
            )}
            <p className="text-xs text-[#8A7E6E] uppercase tracking-widest">{label}</p>
          </div>
          {time && <span className="text-xs text-[#C97552] font-medium tabular-nums">{time}</span>}
        </div>

        {/* Content */}
        <p className={`text-[#1A1A1A] font-semibold text-sm mb-1 transition-colors ${savedFlash ? 'text-emerald-600' : ''}`}>
          {block.activity}
          {savedFlash && <span className="ml-1.5 text-xs font-normal text-emerald-500">✓ saved</span>}
        </p>
        <p className="text-[#5A504A] text-sm leading-relaxed">{block.description}</p>
        {block.insider_tip && (
          <p className="text-[#C97552]/80 text-xs italic mt-1">💡 {block.insider_tip}</p>
        )}
        <p className="text-[#8A7E6E] text-xs mt-1">{block.estimated_cost}</p>

        {/* also_visit sub-stops */}
        {block.also_visit && block.also_visit.length > 0 && (
          <div className="mt-2.5 space-y-2 border-l-2 border-[#E8E0D6] pl-3">
            {block.also_visit.map((stop, i) => (
              <div key={i} className="space-y-0.5">
                <p className="text-[#1A1A1A] font-medium text-xs">↳ {stop.activity}</p>
                <p className="text-[#5A504A] text-xs leading-relaxed">{stop.description}</p>
                <p className="text-[#8A7E6E] text-[11px]">{stop.estimated_cost}</p>
              </div>
            ))}
          </div>
        )}

        {/* Always-visible edit button */}
        <button
          onClick={() => { setDraft(block); setMode('edit') }}
          className="mt-3 flex items-center gap-1.5 text-xs text-[#9A8E7E] border border-[#E0D8CF] rounded-full px-3 py-1.5 hover:border-[#C97552]/50 hover:text-[#C97552] hover:bg-[#FFF8F5] transition-all"
        >
          <PencilIcon />
          Edit
        </button>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOADING ALTERNATIVES
  // ═══════════════════════════════════════════════════════════════════════════
  if (mode === 'loading-alts') {
    return (
      <div className="space-y-1.5">
        <p className="text-xs text-[#8A7E6E] uppercase tracking-widest">{label}</p>
        <div className="flex items-center gap-2 py-3 text-[#9A8E7E] text-sm">
          <Spinner />
          Finding alternatives…
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ALTERNATIVES PICKER
  // ═══════════════════════════════════════════════════════════════════════════
  if (mode === 'alts') {
    return (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-[#8A7E6E] uppercase tracking-widest">{label}</p>
          <button
            onClick={() => setMode('edit')}
            className="text-xs text-[#9A8E7E] hover:text-[#5A504A] transition-colors"
          >
            ← back
          </button>
        </div>

        <p className="text-xs text-[#9A8E7E] italic">Choose a replacement:</p>

        {alternatives.map((alt, i) => (
          <button
            key={i}
            onClick={() => save(alt)}
            className="w-full text-left p-3.5 bg-[#F8F5F1] border border-[#E8E0D6] rounded-xl hover:border-[#C97552]/50 hover:bg-[#FFF8F5] transition-all group/alt"
          >
            <p className="font-medium text-sm text-[#1A1A1A] mb-0.5 group-hover/alt:text-[#C97552] transition-colors">
              {alt.activity}
            </p>
            <p className="text-xs text-[#5A504A] leading-relaxed line-clamp-2">{alt.description}</p>
            {alt.estimated_cost && (
              <p className="text-[11px] text-[#9A8E7E] mt-1">{alt.estimated_cost}</p>
            )}
          </button>
        ))}

        {error && <p className="text-red-400 text-xs">{error}</p>}
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EDIT MODE  (also covers 'saving')
  // ═══════════════════════════════════════════════════════════════════════════
  const isSaving = mode === 'saving'

  return (
    <div className="space-y-2 p-3.5 bg-[#F8F5F1] rounded-xl border border-[#E0D8CF]">
      <p className="text-xs text-[#8A7E6E] uppercase tracking-widest">{label}</p>

      <input
        value={draft.activity}
        onChange={e => setDraft(d => ({ ...d, activity: e.target.value }))}
        placeholder="Activity name"
        disabled={isSaving}
        className="w-full text-sm font-medium text-[#1A1A1A] bg-white border border-[#D8D0C4] rounded-lg px-3 py-2 focus:outline-none focus:border-[#C97552]/60 disabled:opacity-50"
      />

      <div className="relative">
        <textarea
          value={draft.description}
          onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
          rows={3}
          placeholder="Description"
          disabled={isSaving || describing}
          className="w-full text-sm text-[#5A504A] bg-white border border-[#D8D0C4] rounded-lg px-3 py-2 focus:outline-none focus:border-[#C97552]/60 resize-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={describeActivity}
          disabled={describing || isSaving || !draft.activity.trim()}
          className="absolute bottom-2 right-2 flex items-center gap-1 text-[11px] font-medium text-[#C97552] bg-white border border-[#E8D8CC] rounded-full px-2 py-0.5 hover:bg-[#FFF8F5] hover:border-[#C97552]/50 transition-all disabled:opacity-40 shadow-sm"
        >
          {describing ? <><Spinner /> Writing…</> : '✨ AI write'}
        </button>
      </div>

      <input
        value={draft.insider_tip ?? ''}
        onChange={e => setDraft(d => ({ ...d, insider_tip: e.target.value }))}
        placeholder="💡 Insider tip (optional)"
        disabled={isSaving}
        className="w-full text-xs text-[#C97552] bg-white border border-[#D8D0C4] rounded-lg px-3 py-2 focus:outline-none focus:border-[#C97552]/60 disabled:opacity-50"
      />

      <input
        value={draft.estimated_cost ?? ''}
        onChange={e => setDraft(d => ({ ...d, estimated_cost: e.target.value }))}
        placeholder="Estimated cost"
        disabled={isSaving}
        className="w-full text-xs text-[#8A7E6E] bg-white border border-[#D8D0C4] rounded-lg px-3 py-2 focus:outline-none focus:border-[#C97552]/60 disabled:opacity-50"
      />

      {/* Sub-stops (also_visit) */}
      <div className="space-y-2 pt-1">
        {(draft.also_visit ?? []).length > 0 && (
          <p className="text-[10px] text-[#9A8E7E] uppercase tracking-widest">↳ Sub-stops</p>
        )}
        {(draft.also_visit ?? []).map((sub, i) => (
          <div key={i} className="space-y-1.5 pl-3 border-l-2 border-[#E0D8CF]">
            <div className="flex gap-1.5 items-start">
              <input
                value={sub.activity}
                onChange={e => setDraft(d => ({
                  ...d,
                  also_visit: (d.also_visit ?? []).map((s, j) => j === i ? { ...s, activity: e.target.value } : s)
                }))}
                placeholder="Activity name"
                disabled={isSaving}
                className="flex-1 text-xs font-medium text-[#1A1A1A] bg-white border border-[#D8D0C4] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#C97552]/60 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setDraft(d => ({
                  ...d,
                  also_visit: (d.also_visit ?? []).filter((_, j) => j !== i)
                }))}
                disabled={isSaving}
                className="flex-shrink-0 mt-0.5 text-[#B8B0A4] hover:text-red-400 disabled:opacity-40 transition-colors p-1"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="relative">
              <textarea
                value={sub.description}
                onChange={e => setDraft(d => ({
                  ...d,
                  also_visit: (d.also_visit ?? []).map((s, j) => j === i ? { ...s, description: e.target.value } : s)
                }))}
                rows={2}
                placeholder="Description (optional)"
                disabled={isSaving || describingSubIdx === i}
                className="w-full text-xs text-[#5A504A] bg-white border border-[#D8D0C4] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#C97552]/60 resize-none disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => describeSubStop(i)}
                disabled={describingSubIdx !== null || isSaving || !sub.activity.trim()}
                className="absolute bottom-1.5 right-1.5 flex items-center gap-1 text-[10px] font-medium text-[#C97552] bg-white border border-[#E8D8CC] rounded-full px-2 py-0.5 hover:bg-[#FFF8F5] hover:border-[#C97552]/50 transition-all disabled:opacity-40 shadow-sm"
              >
                {describingSubIdx === i ? <><Spinner /> Writing…</> : '✨ AI write'}
              </button>
            </div>
            <input
              value={sub.estimated_cost ?? ''}
              onChange={e => setDraft(d => ({
                ...d,
                also_visit: (d.also_visit ?? []).map((s, j) => j === i ? { ...s, estimated_cost: e.target.value } : s)
              }))}
              placeholder="Estimated cost (optional)"
              disabled={isSaving}
              className="w-full text-[11px] text-[#8A7E6E] bg-white border border-[#D8D0C4] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#C97552]/60 disabled:opacity-50"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setDraft(d => ({
            ...d,
            also_visit: [...(d.also_visit ?? []), { activity: '', description: '', estimated_cost: '' }]
          }))}
          disabled={isSaving}
          className="text-xs text-[#9A8E7E] hover:text-[#C97552] disabled:opacity-40 flex items-center gap-1 transition-colors"
        >
          + Add sub-stop
        </button>
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <div className="flex gap-2 pt-0.5">
        <button
          onClick={() => { setMode('read'); setError(''); setShowMovePanel(false) }}
          disabled={isSaving}
          className="flex-1 py-2 text-xs text-[#6b5f54] border border-[#E0D8CF] rounded-full hover:border-[#C8C0B4] transition-colors disabled:opacity-40"
        >
          Cancel
        </button>

        <button
          onClick={loadAlternatives}
          disabled={isSaving}
          className="flex-1 py-2 text-xs text-[#6b5f54] border border-[#E0D8CF] rounded-full hover:border-[#C8C0B4] transition-colors disabled:opacity-40 whitespace-nowrap"
        >
          ↻ AI suggest
        </button>

        <button
          onClick={() => save(draft)}
          disabled={isSaving || !draft.activity.trim()}
          className="flex-1 py-2 text-xs bg-[#C97552] text-white rounded-full hover:bg-[#b86644] transition-colors disabled:opacity-40 flex items-center justify-center gap-1"
        >
          {isSaving ? <><Spinner /> Saving…</> : '✓ Save'}
        </button>
      </div>

      {/* Move to another day */}
      {availableDays && availableDays.length > 1 && (
        <div className="border-t border-[#EDE8E1] pt-2.5">
          {!showMovePanel ? (
            <button
              type="button"
              onClick={() => setShowMovePanel(true)}
              disabled={isSaving || moving}
              className="text-xs text-[#9A8E7E] hover:text-[#5A504A] disabled:opacity-40 flex items-center gap-1 transition-colors"
            >
              ↕ Swap with another day
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-[#9A8E7E] font-medium uppercase tracking-wider">Swap with</p>
              <div className="flex gap-2">
                <select
                  value={moveTarget}
                  onChange={e => setMoveTarget(e.target.value)}
                  className="flex-1 text-xs border border-[#D8D0C4] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#C97552]/60 bg-white text-[#1A1A1A]"
                >
                  <option value="">Day…</option>
                  {availableDays
                    .filter(d => !(d.destId === destId && d.day === day))
                    .map(d => (
                      <option key={d.globalDay} value={`${d.destId}|${d.day}`}>
                        Day {d.globalDay} – {d.destName}
                      </option>
                    ))}
                </select>
                <select
                  value={moveSlot}
                  onChange={e => setMoveSlot(e.target.value as typeof moveSlot)}
                  className="text-xs border border-[#D8D0C4] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#C97552]/60 bg-white text-[#1A1A1A]"
                >
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                  <option value="dinner">Dinner</option>
                  <option value="evening">Evening</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => { setShowMovePanel(false); setMoveTarget('') }}
                  disabled={moving}
                  className="text-xs text-[#9A8E7E] hover:text-[#5A504A] disabled:opacity-40 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={moveBlock}
                  disabled={!moveTarget || moving || !onSwapped}
                  className="text-xs text-[#C97552] font-semibold hover:text-[#b86644] disabled:opacity-40 transition-colors flex items-center gap-1"
                >
                  {moving ? <><Spinner /> Swapping…</> : '↕ Swap'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
