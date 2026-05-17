export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center px-4">
      <div className="max-w-sm text-center space-y-4">
        <p className="text-6xl">✈️</p>
        <h1 className="font-serif italic text-2xl text-[#1A1A1A]">You&apos;re offline</h1>
        <p className="text-[#6b5f54] text-sm leading-relaxed">
          No internet connection detected. Previously viewed trips are available — go back and open one.
        </p>
        <button
          onClick={() => window.history.back()}
          className="inline-block text-sm bg-[#C97552] text-white px-6 py-3 rounded-full hover:bg-[#b86644] transition-colors"
        >
          ← Go back
        </button>
      </div>
    </div>
  )
}
