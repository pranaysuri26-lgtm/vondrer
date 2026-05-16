'use client'

import { useRouter } from 'next/navigation'

export default function PassportPage() {
  const router = useRouter()
  return (
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col">

      {/* Atmospheric hero */}
      <div className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1200&q=80&auto=format')", opacity: 0.22 }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#FAF8F5]/40 to-[#FAF8F5]" />
        <div className="relative px-6 pt-12 pb-8 text-center">
          <p className="text-xs text-[#8A7E6E] uppercase tracking-widest font-label mb-4">Voya Passport</p>
          <div className="text-6xl mb-4">📔</div>
          <h1 className="font-serif italic text-3xl text-[#1A1A1A] leading-tight">Your travel story</h1>
        </div>
      </div>

      <main className="flex-1 flex flex-col items-center px-6 py-8 text-center">

        {/* Passport book illustration */}
        <div className="w-48 h-64 relative mb-8">
          {/* Passport cover */}
          <div className="w-full h-full rounded-lg bg-gradient-to-br from-[#1a3a5c] to-[#FAF8F5] border border-[#D8D0C4] shadow-2xl flex flex-col items-center justify-center gap-3 p-6">
            <div className="w-12 h-12 rounded-full border-2 border-[#CCC4B8] flex items-center justify-center">
              <span className="text-xl">🌍</span>
            </div>
            <div className="text-center">
              <p className="text-[#4A4440] text-[10px] font-label tracking-widest uppercase">Voya</p>
              <p className="text-[#6b5f54] text-[9px] font-label tracking-widest uppercase mt-0.5">Travel Passport</p>
            </div>
            <div className="w-full border-t border-[#E8E0D6] pt-3 mt-1">
              <p className="text-[#9A8E7E] text-[9px] font-label tracking-widest uppercase text-center">No stamps yet</p>
            </div>
          </div>

          {/* Stamp preview dots */}
          <div className="absolute -right-3 -top-3 w-8 h-8 rounded-full bg-[#C97552]/20 border border-[#C97552]/30 flex items-center justify-center">
            <span className="text-xs">+</span>
          </div>
        </div>

        <div className="w-8 h-px bg-[#E2D8CC] mb-6" />

        <p className="text-[#5A504A] text-sm max-w-xs leading-relaxed mb-2">
          Your passport is empty — but not for long.
        </p>
        <p className="text-[#8A7E6E] text-sm max-w-xs leading-relaxed">
          Complete a trip to earn your first stamp.
        </p>

        {/* Upcoming stamps preview */}
        <div className="mt-8 grid grid-cols-3 gap-3 w-full max-w-xs">
          {[
            { icon: '🗺️', label: 'First trip' },
            { icon: '💎', label: 'Hidden gem' },
            { icon: '📸', label: 'Golden hour' },
          ].map((stamp) => (
            <div key={stamp.label} className="flex flex-col items-center gap-2 bg-white border border-[#E8E0D6] rounded-2xl p-3">
              <div className="w-10 h-10 rounded-full bg-[#F5F0EA] border border-[#E8E0D6] flex items-center justify-center opacity-40">
                <span className="text-lg">{stamp.icon}</span>
              </div>
              <p className="text-[#9A8E7E] text-[9px] font-label tracking-wider uppercase">{stamp.label}</p>
            </div>
          ))}
        </div>

        <p className="text-[#A8A09A] text-xs max-w-xs leading-relaxed mt-8">
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
          className="mt-4 text-xs text-[#9A8E7E] hover:text-[#5C564E] transition-colors"
        >
          ← Back
        </button>
      </main>
    </div>
  )
}
