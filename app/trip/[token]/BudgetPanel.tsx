'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { BudgetExpense } from '@/app/api/trip/[tripId]/budget/route'

// ─── Types ─────────────────────────────────────────────────────────────────────

type Category = BudgetExpense['category']

interface Props {
  tripId:    string
  totalDays: number
  currency?: string  // default 'USD'
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES: { value: Category; label: string; icon: string; color: string }[] = [
  { value: 'activities',    label: 'Activities',    icon: '🎭', color: 'bg-purple-100 text-purple-700' },
  { value: 'food',          label: 'Food & Drink',  icon: '🍽️', color: 'bg-orange-100 text-orange-700' },
  { value: 'transport',     label: 'Transport',     icon: '🚗', color: 'bg-blue-100   text-blue-700'   },
  { value: 'accommodation', label: 'Accommodation', icon: '🏨', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'other',         label: 'Other',         icon: '💳', color: 'bg-stone-100  text-stone-700'  },
]

const BLANK: Omit<BudgetExpense, 'id'> = {
  name:     '',
  category: 'activities',
  planned:  0,
  actual:   null,
  currency: 'USD',
}

function genId() { return Math.random().toString(36).slice(2, 10) }
function fmt(n: number | null, currency = 'USD') {
  if (n === null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BudgetPanel({ tripId, totalDays, currency = 'USD' }: Props) {
  const [expenses,  setExpenses]  = useState<BudgetExpense[]>([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [addOpen,   setAddOpen]   = useState(false)
  const [editId,    setEditId]    = useState<string | null>(null)
  const [form,      setForm]      = useState<Omit<BudgetExpense, 'id'>>(BLANK)
  const [filter,    setFilter]    = useState<Category | 'all'>('all')

  // AI generation state
  const [aiLoading,   setAiLoading]   = useState(false)
  const [aiExpenses,  setAiExpenses]  = useState<BudgetExpense[] | null>(null)
  const [aiSelected,  setAiSelected]  = useState<Set<string>>(new Set())
  const [aiError,     setAiError]     = useState('')
  const autoGenFired = useRef(false)

  // ── Load ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/trip/${tripId}/budget`)
      .then(r => r.ok ? r.json() : { expenses: [] })
      .then(d => setExpenses(d.expenses ?? []))
      .finally(() => setLoading(false))
  }, [tripId])

  // ── Auto-generate when empty ──────────────────────────────────────────────────
  useEffect(() => {
    if (loading || expenses.length > 0 || autoGenFired.current) return
    autoGenFired.current = true
    generateAI()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, expenses.length])

  async function generateAI() {
    setAiLoading(true)
    setAiError('')
    try {
      const res  = await fetch(`/api/trip/${tripId}/budget`, { method: 'POST' })
      const data = await res.json() as { expenses?: BudgetExpense[]; error?: string }
      if (!res.ok || !data.expenses) throw new Error(data.error ?? 'Generation failed')
      setAiExpenses(data.expenses)
      setAiSelected(new Set(data.expenses.map(e => e.id)))
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setAiLoading(false)
    }
  }

  function acceptAI() {
    if (!aiExpenses) return
    const approved = aiExpenses.filter(e => aiSelected.has(e.id))
    setExpenses(approved)
    persist(approved)
    setAiExpenses(null)
  }

  // ── Persist ───────────────────────────────────────────────────────────────────
  const persist = useCallback(async (list: BudgetExpense[]) => {
    setSaving(true)
    await fetch(`/api/trip/${tripId}/budget`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ expenses: list }),
    })
    setSaving(false)
  }, [tripId])

  function upsert() {
    if (!form.name.trim()) return
    let next: BudgetExpense[]
    if (editId) {
      next = expenses.map(e => e.id === editId ? { ...form, id: editId } : e)
    } else {
      next = [...expenses, { ...form, id: genId() }]
    }
    setExpenses(next)
    persist(next)
    setAddOpen(false)
    setEditId(null)
    setForm(BLANK)
  }

  function remove(id: string) {
    const next = expenses.filter(e => e.id !== id)
    setExpenses(next)
    persist(next)
  }

  function startEdit(e: BudgetExpense) {
    setForm({ name: e.name, category: e.category, planned: e.planned, actual: e.actual, currency: e.currency, day: e.day, note: e.note })
    setEditId(e.id)
    setAddOpen(true)
  }

  // ── Summaries ─────────────────────────────────────────────────────────────────
  const shown     = filter === 'all' ? expenses : expenses.filter(e => e.category === filter)
  const totalPlan = expenses.reduce((s, e) => s + (e.planned ?? 0), 0)
  const totalAct  = expenses.reduce((s, e) => s + (e.actual  ?? 0), 0)
  const remaining = totalPlan - totalAct

  const byCategory = CATEGORIES.map(cat => ({
    ...cat,
    planned: expenses.filter(e => e.category === cat.value).reduce((s, e) => s + e.planned, 0),
    actual:  expenses.filter(e => e.category === cat.value).reduce((s, e) => s + (e.actual ?? 0), 0),
  }))

  if (loading) return (
    <div className="py-20 text-center text-[#9A8E7E] text-sm">Loading budget…</div>
  )

  // ── AI estimate preview (shown when expenses empty + AI has generated) ────────
  if (expenses.length === 0 && (aiLoading || aiExpenses || aiError)) {
    const totalAiPlanned = aiExpenses
      ? [...aiSelected].reduce((s, id) => {
          const e = aiExpenses.find(x => x.id === id)
          return s + (e?.planned ?? 0)
        }, 0)
      : 0

    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-[#9A8E7E] uppercase tracking-widest mb-0.5">AI budget estimate</p>
            <p className="text-sm text-[#6b5f54]">Based on your budget tier and itinerary. Deselect anything that doesn&apos;t apply.</p>
          </div>
          {aiExpenses && (
            <p className="text-sm font-semibold text-[#1A1A1A] flex-shrink-0 ml-4">
              {fmt(totalAiPlanned, currency)} total
            </p>
          )}
        </div>

        {aiLoading && (
          <div className="space-y-2">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="h-12 bg-[#F0EBE3] rounded-xl animate-pulse" />
            ))}
            <p className="text-xs text-[#9A8E7E] text-center pt-1">Estimating costs for your trip…</p>
          </div>
        )}

        {aiError && (
          <div className="py-6 text-center space-y-3">
            <p className="text-sm text-red-400">{aiError}</p>
            <button onClick={generateAI} className="text-xs text-[#C97552] underline">Try again</button>
          </div>
        )}

        {aiExpenses && !aiLoading && (
          <>
            <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1">
              {aiExpenses.map(exp => {
                const cat     = CATEGORIES.find(c => c.value === exp.category)!
                const checked = aiSelected.has(exp.id)
                return (
                  <button
                    key={exp.id}
                    onClick={() => {
                      const next = new Set(aiSelected)
                      checked ? next.delete(exp.id) : next.add(exp.id)
                      setAiSelected(next)
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                      checked ? 'bg-white border-[#E8E0D6]' : 'bg-[#F8F5F1] border-transparent opacity-50'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors ${
                      checked ? 'bg-[#C97552] border-[#C97552]' : 'border-[#C0B8B0]'
                    }`}>
                      {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${cat.color}`}>{cat.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[#1A1A1A] truncate">{exp.name}</p>
                      {(exp.day || exp.note) && (
                        <p className="text-[10px] text-[#9A8E7E]">
                          {exp.day ? `Day ${exp.day}` : 'Trip total'}
                          {exp.note ? ` · ${exp.note}` : ''}
                        </p>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-[#1A1A1A] flex-shrink-0">{fmt(exp.planned, currency)}</p>
                  </button>
                )
              })}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setAiExpenses(null); setAiError('') }}
                className="flex-1 py-2.5 text-sm border border-[#E0D8CF] rounded-full text-[#6b5f54] hover:border-[#C8C0B4] transition-colors"
              >
                Start from scratch
              </button>
              <button
                onClick={acceptAI}
                disabled={aiSelected.size === 0}
                className="flex-1 py-2.5 text-sm bg-[#C97552] text-white rounded-full hover:bg-[#b86644] disabled:opacity-40 transition-colors font-semibold"
              >
                Use this budget ({aiSelected.size})
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* ── Summary cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Planned',   value: fmt(totalPlan, currency), color: 'text-[#1A1A1A]' },
          { label: 'Spent',     value: fmt(totalAct,  currency), color: 'text-[#C97552]' },
          { label: 'Remaining', value: fmt(remaining, currency), color: remaining >= 0 ? 'text-emerald-600' : 'text-red-500' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-[#E8E0D6] rounded-2xl p-4 text-center">
            <p className="text-[10px] text-[#9A8E7E] uppercase tracking-widest mb-1">{s.label}</p>
            <p className={`text-lg font-semibold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Category bar breakdown ────────────────────────────────────────────── */}
      <div className="bg-white border border-[#E8E0D6] rounded-2xl p-4 space-y-3">
        <p className="text-xs text-[#9A8E7E] uppercase tracking-widest">By category</p>
        {byCategory.filter(c => c.planned > 0 || c.actual > 0).map(cat => (
          <div key={cat.value} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ${cat.color}`}>
                {cat.icon} {cat.label}
              </span>
              <span className="text-[#5A504A] tabular-nums">
                {fmt(cat.actual, currency)} / {fmt(cat.planned, currency)}
              </span>
            </div>
            <div className="h-1.5 bg-[#F0EBE3] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${cat.actual > cat.planned ? 'bg-red-400' : 'bg-[#C97552]'}`}
                style={{ width: cat.planned > 0 ? `${Math.min(100, (cat.actual / cat.planned) * 100)}%` : '0%' }}
              />
            </div>
          </div>
        ))}
        {byCategory.every(c => c.planned === 0 && c.actual === 0) && (
          <p className="text-sm text-[#9A8E7E] italic text-center py-2">No expenses yet</p>
        )}
      </div>

      {/* ── Filter + Add ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          <button
            onClick={() => setFilter('all')}
            className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors ${filter === 'all' ? 'bg-[#C97552] text-white border-[#C97552]' : 'border-[#E0D8CF] text-[#6b5f54] hover:border-[#C97552]'}`}
          >
            All
          </button>
          {CATEGORIES.map(cat => (
            <button
              key={cat.value}
              onClick={() => setFilter(cat.value)}
              className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors ${filter === cat.value ? 'bg-[#C97552] text-white border-[#C97552]' : 'border-[#E0D8CF] text-[#6b5f54] hover:border-[#C97552]'}`}
            >
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setForm(BLANK); setEditId(null); setAddOpen(true) }}
          className="flex-shrink-0 text-xs bg-[#C97552] text-white px-4 py-2 rounded-full hover:bg-[#b86644] transition-colors"
        >
          + Add
        </button>
      </div>

      {/* ── Expense list ──────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {shown.length === 0 && (
          <div className="text-center py-8 space-y-3">
            <p className="text-sm text-[#9A8E7E] italic">
              {filter === 'all' ? 'No expenses yet.' : 'No expenses in this category.'}
            </p>
            {filter === 'all' && (
              <button
                onClick={() => { autoGenFired.current = false; generateAI() }}
                className="text-xs text-[#C97552] border border-[#C97552]/30 px-4 py-2 rounded-full hover:bg-[#C97552]/5 transition-colors"
              >
                Generate AI budget estimate
              </button>
            )}
          </div>
        )}
        {shown.map(exp => {
          const cat = CATEGORIES.find(c => c.value === exp.category)!
          const over = exp.actual !== null && exp.actual > exp.planned
          return (
            <div key={exp.id} className="bg-white border border-[#E8E0D6] rounded-xl px-4 py-3 flex items-center gap-3">
              <span className={`text-sm px-2 py-0.5 rounded-full text-xs ${cat.color}`}>{cat.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#1A1A1A] truncate">{exp.name}</p>
                <p className="text-[11px] text-[#9A8E7E]">
                  {exp.day ? `Day ${exp.day} · ` : ''}
                  {cat.label}
                  {exp.note ? ` · ${exp.note}` : ''}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`text-sm font-semibold ${over ? 'text-red-500' : 'text-[#1A1A1A]'}`}>
                  {fmt(exp.actual, exp.currency)}
                </p>
                <p className="text-[11px] text-[#9A8E7E]">of {fmt(exp.planned, exp.currency)}</p>
              </div>
              <div className="flex gap-1 ml-1">
                <button onClick={() => startEdit(exp)} className="text-[#9A8E7E] hover:text-[#C97552] transition-colors p-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                  </svg>
                </button>
                <button onClick={() => remove(exp.id)} className="text-[#9A8E7E] hover:text-red-500 transition-colors p-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Add / Edit modal ──────────────────────────────────────────────────── */}
      {addOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-[#1A1A1A]">{editId ? 'Edit expense' : 'Add expense'}</h3>
              <button onClick={() => { setAddOpen(false); setEditId(null) }} className="text-[#9A8E7E] hover:text-[#1A1A1A]">✕</button>
            </div>

            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Expense name"
              className="w-full text-sm border border-[#D8D0C4] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#C97552]/60"
            />

            {/* Category */}
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.value}
                  onClick={() => setForm(f => ({ ...f, category: cat.value }))}
                  className={`text-xs py-2 rounded-xl border transition-colors ${form.category === cat.value ? 'bg-[#C97552] text-white border-[#C97552]' : 'border-[#E0D8CF] text-[#6b5f54]'}`}
                >
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#9A8E7E] mb-1 block">Planned ($)</label>
                <input
                  type="number" min="0" step="0.01"
                  value={form.planned}
                  onChange={e => setForm(f => ({ ...f, planned: parseFloat(e.target.value) || 0 }))}
                  className="w-full text-sm border border-[#D8D0C4] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#C97552]/60"
                />
              </div>
              <div>
                <label className="text-xs text-[#9A8E7E] mb-1 block">Actual ($)</label>
                <input
                  type="number" min="0" step="0.01"
                  value={form.actual ?? ''}
                  placeholder="—"
                  onChange={e => setForm(f => ({ ...f, actual: e.target.value ? parseFloat(e.target.value) : null }))}
                  className="w-full text-sm border border-[#D8D0C4] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#C97552]/60"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#9A8E7E] mb-1 block">Day (optional)</label>
                <input
                  type="number" min="1" max={totalDays}
                  value={form.day ?? ''}
                  placeholder="Any"
                  onChange={e => setForm(f => ({ ...f, day: e.target.value ? parseInt(e.target.value) : undefined }))}
                  className="w-full text-sm border border-[#D8D0C4] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#C97552]/60"
                />
              </div>
              <div>
                <label className="text-xs text-[#9A8E7E] mb-1 block">Note</label>
                <input
                  value={form.note ?? ''}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Optional"
                  className="w-full text-sm border border-[#D8D0C4] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#C97552]/60"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setAddOpen(false); setEditId(null) }}
                className="flex-1 py-2.5 text-sm border border-[#E0D8CF] rounded-full text-[#6b5f54] hover:border-[#C8C0B4] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={upsert}
                disabled={!form.name.trim() || saving}
                className="flex-1 py-2.5 text-sm bg-[#C97552] text-white rounded-full hover:bg-[#b86644] disabled:opacity-40 transition-colors"
              >
                {saving ? 'Saving…' : editId ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
