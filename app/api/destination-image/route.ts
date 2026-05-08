import { NextRequest, NextResponse } from 'next/server'

// Simple in-process cache so re-expanding the same card doesn't re-hit Unsplash
const cache = new Map<string, string | null>()

export async function GET(req: NextRequest) {
  const q   = req.nextUrl.searchParams.get('q') ?? 'travel landscape'
  const key = process.env.UNSPLASH_ACCESS_KEY

  // No key configured — tell the client to show the gradient fallback
  if (!key) {
    return NextResponse.json({ url: null, reason: 'no_key' })
  }

  // Return cached result if we already fetched this query this process lifetime
  if (cache.has(q)) {
    return NextResponse.json({ url: cache.get(q) })
  }

  try {
    const res = await fetch(
      `https://api.unsplash.com/photos/random?query=${encodeURIComponent(q)}&orientation=landscape&content_filter=high`,
      {
        headers: { Authorization: `Client-ID ${key}` },
        // Next.js cache: revalidate once a day — same destination gets same photo
        next: { revalidate: 86400 },
      }
    )

    if (!res.ok) {
      cache.set(q, null)
      return NextResponse.json({ url: null, reason: `unsplash_${res.status}` })
    }

    const data = await res.json()
    const url: string | null = data?.urls?.regular ?? null
    cache.set(q, url)
    return NextResponse.json({ url })
  } catch (err) {
    console.warn('[destination-image] fetch error:', err)
    cache.set(q, null)
    return NextResponse.json({ url: null, reason: 'fetch_error' })
  }
}
