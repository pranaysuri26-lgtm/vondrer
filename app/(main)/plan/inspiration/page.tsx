'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { InspirationResult } from '@/app/api/plan/inspiration/route'

type Step = 'input' | 'loading' | 'result'

export default function InspirationPage() {
  const router = useRouter()
  const [step,     setStep]     = useState<Step>('input')
  const [url,      setUrl]      = useState('')
  const [text,     setText]     = useState('')
  const [result,   setResult]   = useState<InspirationResult | null>(null)
  const [error,    setError]    = useState('')
  const [preview,  setPreview]  = useState<string | null>(null)
  const [imgB64,   setImgB64]   = useState<string | null>(null)
  const [imgType,  setImgType]  = useState<string>('image/jpeg')
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    if (!file.type.startsWith('image/')) { setError('Please upload an image file.'); return }
    setError('')
    setImgType(file.type)
    const reader = new FileReader()
    reader.onload = e => {
      const dataUrl = e.target?.result as string
      setPreview(dataUrl)
      // strip the data:image/...;base64, prefix
      setImgB64(dataUrl.split(',')[1])
    }
    reader.readAsDataURL(file)
  }

  async function analyse() {
    setError('')
    setStep('loading')
    try {
      const body: Record<string, string> = {}
      if (imgB64)        { body.image_base64 = imgB64; body.media_type = imgType }
      else if (url.trim()) body.url = url.trim()
      else if (text.trim()) body.text = text.trim()
      else { setError('Paste a URL, describe a place, or upload a photo.'); setStep('input'); return }

      const res = await fetch('/api/plan/inspiration', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await res.json() as InspirationResult
      if (!res.ok) throw new Error((data as unknown as { error: string }).error)
      setResult(data)
      setStep('result')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setStep('input')
    }
  }

  function usePlan() {
    if (!result) return
    const params = new URLSearchParams({
      dest:      result.destination,
      country:   result.country,
      days:      String(result.days),
      budget:    result.budget,
      interests: result.interests.join(','),
    })
    if (result.activities?.length > 0) {
      params.set('must_do', result.activities.join('\n'))
    }
    router.push(`/plan/new?${params}`)
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <div className="max-w-lg mx-auto px-4 pt-12 pb-16">

        {/* Header */}
        <div className="mb-8 text-center">
          <p className="text-xs text-[#C97552] uppercase tracking-widest mb-2">Plan from inspiration</p>
          <h1 className="font-serif italic text-3xl text-[#1A1A1A] mb-3">Show us what inspires you</h1>
          <p className="text-[#6b5f54] text-sm">
            Paste a travel article URL, drop a photo, or describe a place — we&apos;ll extract the destination and pre-fill your plan.
          </p>
          <p className="text-[11px] text-[#9A8E7E] mt-2">
            Works with travel blogs, articles &amp; websites. For Instagram posts, use a screenshot or copy the caption.
          </p>
        </div>

        {step === 'loading' && (
          <div className="flex flex-col items-center py-20 gap-4">
            <div className="w-10 h-10 border-2 border-[#C97552] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-[#9A8E7E]">Analysing your inspiration…</p>
          </div>
        )}

        {step === 'input' && (
          <div className="space-y-4">

            {/* URL input */}
            <div className="bg-white border border-[#E8E0D6] rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-[#9A8E7E] uppercase tracking-widest">Travel article / blog URL</label>
                <span className="text-[10px] text-[#B8B0A4]">Not Instagram / TikTok</span>
              </div>
              <input
                value={url}
                onChange={e => { setUrl(e.target.value); setImgB64(null); setPreview(null) }}
                placeholder="e.g. afar.com, lonelyplanet.com, any travel blog…"
                className="w-full text-sm text-[#1A1A1A] bg-[#F8F5F1] border border-[#E0D8CF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#C97552]/60"
              />
              {/instagram\.com|tiktok\.com|twitter\.com|x\.com/i.test(url) && (
                <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-snug">
                  Social posts can&apos;t be fetched. Upload a <strong>screenshot</strong> or copy the <strong>caption text</strong> below instead.
                </p>
              )}
            </div>

            <div className="relative flex items-center gap-3">
              <div className="flex-1 h-px bg-[#E8E0D6]" />
              <span className="text-xs text-[#9A8E7E]">or</span>
              <div className="flex-1 h-px bg-[#E8E0D6]" />
            </div>

            {/* Image upload */}
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
              className="bg-white border-2 border-dashed border-[#E0D8CF] rounded-2xl p-6 text-center cursor-pointer hover:border-[#C97552]/50 transition-colors"
            >
              {preview ? (
                <div className="space-y-2">
                  <img src={preview} alt="Preview" className="max-h-40 mx-auto rounded-xl object-cover" />
                  <p className="text-xs text-[#9A8E7E]">Tap to change image</p>
                </div>
              ) : (
                <>
                  <p className="text-3xl mb-2">📷</p>
                  <p className="text-sm text-[#6b5f54]">Drop a travel photo here</p>
                  <p className="text-xs text-[#9A8E7E] mt-1">or tap to browse</p>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />

            <div className="relative flex items-center gap-3">
              <div className="flex-1 h-px bg-[#E8E0D6]" />
              <span className="text-xs text-[#9A8E7E]">or describe</span>
              <div className="flex-1 h-px bg-[#E8E0D6]" />
            </div>

            {/* Text description */}
            <textarea
              value={text}
              onChange={e => { setText(e.target.value); setImgB64(null); setPreview(null) }}
              placeholder="I want to do a 5-day foodie trip to Japan in cherry blossom season…"
              rows={3}
              className="w-full text-sm text-[#1A1A1A] bg-white border border-[#E0D8CF] rounded-2xl px-4 py-3 focus:outline-none focus:border-[#C97552]/60 resize-none"
            />

            {error && <p className="text-red-400 text-xs text-center">{error}</p>}

            <button
              onClick={analyse}
              disabled={!url.trim() && !text.trim() && !imgB64}
              className="w-full py-3.5 bg-[#C97552] text-white text-sm font-semibold rounded-full hover:bg-[#b86644] disabled:opacity-40 transition-colors"
            >
              Analyse →
            </button>
          </div>
        )}

        {step === 'result' && result && (
          <div className="space-y-5">
            {/* Confidence badge */}
            <div className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full ${
              result.confidence === 'high'   ? 'bg-emerald-100 text-emerald-700' :
              result.confidence === 'medium' ? 'bg-amber-100 text-amber-700' :
                                               'bg-stone-100 text-stone-700'
            }`}>
              {result.confidence === 'high' ? '✅' : result.confidence === 'medium' ? '🟡' : 'ℹ️'}
              {result.confidence} confidence
            </div>

            {/* Summary card */}
            <div className="bg-white border border-[#E8E0D6] rounded-2xl p-5 space-y-4">
              <p className="text-xs text-[#9A8E7E] italic">{result.summary}</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Destination', value: result.destination },
                  { label: 'Country',     value: result.country     },
                  { label: 'Duration',    value: `${result.days} days` },
                  { label: 'Budget',      value: result.budget.replace('-', '–') + '/day' },
                ].map(row => (
                  <div key={row.label}>
                    <p className="text-[10px] text-[#9A8E7E] uppercase tracking-widest">{row.label}</p>
                    <p className="text-sm font-medium text-[#1A1A1A] mt-0.5">{row.value}</p>
                  </div>
                ))}
              </div>
              {result.interests.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {result.interests.map(i => (
                    <span key={i} className="text-xs bg-[#F0EBE3] text-[#8A7E6E] px-2.5 py-1 rounded-full">{i}</span>
                  ))}
                </div>
              )}

              {result.activities?.length > 0 && (
                <div className="border-t border-[#F0EBE3] pt-3 space-y-2">
                  <p className="text-[10px] text-[#9A8E7E] uppercase tracking-widest">Places we&apos;ll include</p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.activities.map((a, i) => (
                      <span key={i} className="text-xs bg-[#EAF4EF] text-[#3D7A5A] border border-[#C0DFD0] px-2.5 py-1 rounded-full">
                        📍 {a}
                      </span>
                    ))}
                  </div>
                  <p className="text-[10px] text-[#B8B0A4]">These will be added as must-do items in your itinerary</p>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep('input')} className="flex-1 py-3 border border-[#E0D8CF] text-sm text-[#6b5f54] rounded-full hover:border-[#C8C0B4] transition-colors">
                ← Try again
              </button>
              <button onClick={usePlan} className="flex-1 py-3 bg-[#C97552] text-white text-sm font-semibold rounded-full hover:bg-[#b86644] transition-colors">
                Plan this trip →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
