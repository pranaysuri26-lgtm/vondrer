'use client'

import { useRouter } from 'next/navigation'

export default function TripsPage() {
  const router = useRouter()
  return (
    <div className="min-h-screen bg-[#0d1f35] flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
        <p className="text-xs text-white/30 uppercase tracking-widest font-label mb-5">
          Your Trips
        </p>

        <h1 className="font-serif italic text-4xl text-white leading-tight mb-5">
          🗺️
        </h1>

        <div className="w-8 h-px bg-white/15 mb-6" />

        <p className="text-white/50 text-sm max-w-xs leading-relaxed mb-2">
          No saved trips yet.
        </p>
        <p className="text-white/30 text-sm max-w-xs leading-relaxed">
          Start planning your first adventure.
        </p>

        <button
          onClick={() => router.push('/plan/new')}
          className="mt-10 bg-[#C97552] text-white text-sm font-medium px-6 py-3 rounded-full hover:bg-[#b86644] transition-colors"
        >
          Start planning →
        </button>
        <button
          onClick={() => router.push('/discover')}
          className="mt-3 text-white/30 text-xs hover:text-white/50 transition-colors"
        >
          Browse destinations first →
        </button>
      </main>
    </div>
  )
}
