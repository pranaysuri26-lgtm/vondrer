'use client'

import { useRouter } from 'next/navigation'

export default function PassportPage() {
  const router = useRouter()
  return (
    <div className="min-h-screen bg-[#0d1f35] flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
        <p className="text-xs text-white/30 uppercase tracking-widest font-label mb-5">
          Your Passport
        </p>

        <h1 className="font-serif italic text-4xl text-white leading-tight mb-5">
          📔
        </h1>

        <div className="w-8 h-px bg-white/15 mb-6" />

        <p className="text-white/50 text-sm max-w-xs leading-relaxed mb-2">
          Your passport is empty — but not for long.
        </p>
        <p className="text-white/30 text-sm max-w-xs leading-relaxed">
          Complete a trip to earn your first stamp.
        </p>

        <p className="text-white/20 text-xs max-w-xs leading-relaxed mt-6">
          Stamps, AI memory lines, and your travel story — coming soon.
        </p>

        <button
          onClick={() => router.push('/discover')}
          className="mt-12 text-xs text-white/25 hover:text-white/50 transition-colors"
        >
          ← Back to discover
        </button>
      </main>
    </div>
  )
}
