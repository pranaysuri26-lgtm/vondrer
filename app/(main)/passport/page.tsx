'use client'

import { useRouter } from 'next/navigation'

export default function PassportPage() {
  const router = useRouter()
  return (
    <div className="min-h-screen bg-[#0d1f35] flex flex-col">

      {/* Atmospheric hero */}
      <div className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-15"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1200&q=80&auto=format')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0d1f35]/40 to-[#0d1f35]" />
        <div className="relative px-6 pt-12 pb-8 text-center">
          <p className="text-xs text-white/30 uppercase tracking-widest font-label mb-4">Voya Passport</p>
          <div className="text-6xl mb-4">📔</div>
          <h1 className="font-serif italic text-3xl text-white leading-tight">Your travel story</h1>
        </div>
      </div>

      <main className="flex-1 flex flex-col items-center px-6 py-8 text-center">

        {/* Passport book illustration */}
        <div className="w-48 h-64 relative mb-8">
          {/* Passport cover */}
          <div className="w-full h-full rounded-lg bg-gradient-to-br from-[#1a3a5c] to-[#0d1f35] border border-white/15 shadow-2xl flex flex-col items-center justify-center gap-3 p-6">
            <div className="w-12 h-12 rounded-full border-2 border-white/20 flex items-center justify-center">
              <span className="text-xl">🌍</span>
            </div>
            <div className="text-center">
              <p className="text-white/60 text-[10px] font-label tracking-widest uppercase">Voya</p>
              <p className="text-white/40 text-[9px] font-label tracking-widest uppercase mt-0.5">Travel Passport</p>
            </div>
            <div className="w-full border-t border-white/10 pt-3 mt-1">
              <p className="text-white/25 text-[9px] font-label tracking-widest uppercase text-center">No stamps yet</p>
            </div>
          </div>

          {/* Stamp preview dots */}
          <div className="absolute -right-3 -top-3 w-8 h-8 rounded-full bg-[#C97552]/20 border border-[#C97552]/30 flex items-center justify-center">
            <span className="text-xs">+</span>
          </div>
        </div>

        <div className="w-8 h-px bg-white/15 mb-6" />

        <p className="text-white/55 text-sm max-w-xs leading-relaxed mb-2">
          Your passport is empty — but not for long.
        </p>
        <p className="text-white/30 text-sm max-w-xs leading-relaxed">
          Complete a trip to earn your first stamp.
        </p>

        {/* Upcoming stamps preview */}
        <div className="mt-8 grid grid-cols-3 gap-3 w-full max-w-xs">
          {[
            { icon: '🗺️', label: 'First trip' },
            { icon: '💎', label: 'Hidden gem' },
            { icon: '📸', label: 'Golden hour' },
          ].map((stamp) => (
            <div key={stamp.label} className="flex flex-col items-center gap-2 bg-white/4 border border-white/8 rounded-2xl p-3">
              <div className="w-10 h-10 rounded-full bg-white/6 border border-white/10 flex items-center justify-center opacity-40">
                <span className="text-lg">{stamp.icon}</span>
              </div>
              <p className="text-white/25 text-[9px] font-label tracking-wider uppercase">{stamp.label}</p>
            </div>
          ))}
        </div>

        <p className="text-white/20 text-xs max-w-xs leading-relaxed mt-8">
          Stamps, AI memory lines, and your travel story — coming soon.
        </p>

        <button
          onClick={() => router.push('/discover')}
          className="mt-8 bg-[#C97552] text-white text-sm font-semibold px-6 py-3 rounded-full hover:bg-[#b86644] transition-colors"
        >
          Find your first destination →
        </button>

        <button
          onClick={() => router.back()}
          className="mt-4 text-xs text-white/25 hover:text-white/50 transition-colors"
        >
          ← Back
        </button>
      </main>
    </div>
  )
}
