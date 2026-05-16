'use client'

export default function PlanDayPage() {
  return (
    <div className="min-h-screen bg-[#0d1f35] flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
        <p className="text-xs text-white/30 uppercase tracking-widest font-label mb-5">
          Plan a Day
        </p>

        <h1 className="font-serif italic text-4xl text-white leading-tight mb-5">
          ☀️
        </h1>

        <div className="w-8 h-px bg-white/15 mb-6" />

        <p className="text-white/50 text-sm max-w-xs leading-relaxed mb-2">
          Pick any place, get a full day itinerary with timings — built around the weather.
        </p>
        <p className="text-white/30 text-sm max-w-xs leading-relaxed">
          Perfect for locals and travellers alike.
        </p>

        <p className="text-white/20 text-xs max-w-xs leading-relaxed mt-6">
          Coming soon.
        </p>
      </main>
    </div>
  )
}
