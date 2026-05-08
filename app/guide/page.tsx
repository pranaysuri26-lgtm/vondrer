'use client'

import { Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

// ─── Guide content ────────────────────────────────────────────────────────────
// useSearchParams() must be inside a Suspense boundary in Next.js App Router.

function GuideContent() {
  const params      = useSearchParams()
  const router      = useRouter()
  const destination = params.get('q')?.trim() ?? ''

  return (
    <div className="min-h-screen bg-[#0d1f35] flex flex-col">
      {/* Nav */}
      <nav className="sticky top-0 z-20 bg-[#0d1f35]/90 backdrop-blur-md border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <span className="font-serif italic text-xl text-white/90">Voya</span>
        <button
          onClick={() => router.push('/discover')}
          className="text-xs text-white/35 hover:text-white/60 transition-colors font-label tracking-widest uppercase"
        >
          ← Discover
        </button>
      </nav>

      {/* Body */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
        <p className="text-xs text-white/30 uppercase tracking-widest font-label mb-5">
          Local Intel
        </p>

        <h1 className="font-serif italic text-4xl text-white leading-tight mb-5">
          {destination || 'Your destination'}
        </h1>

        <div className="w-8 h-px bg-white/15 mb-6" />

        <p className="text-white/45 text-sm max-w-xs leading-relaxed mb-3">
          We&apos;re building local guides right now — neighbourhood breakdowns,
          food spots worth the walk, and insider intel that doesn&apos;t end up in
          every travel blog.
        </p>

        <p className="text-white/25 text-xs max-w-xs leading-relaxed">
          No timeline. But it&apos;s coming.
        </p>

        <button
          onClick={() => router.push('/discover')}
          className="mt-12 text-xs text-white/25 hover:text-white/50 transition-colors"
        >
          ← Back to your recommendations
        </button>
      </main>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GuidePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0d1f35]" />}>
      <GuideContent />
    </Suspense>
  )
}
