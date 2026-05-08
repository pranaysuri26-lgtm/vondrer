import { NextRequest, NextResponse } from 'next/server'

// Session-level cache: key = "query::count"
const cache = new Map<string, string[]>()

export async function GET(req: NextRequest) {
  const q     = req.nextUrl.searchParams.get('q') ?? 'travel landscape'
  const count = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('count') ?? '1', 10), 1), 4)
  const key   = process.env.UNSPLASH_ACCESS_KEY

  if (!key) return NextResponse.json({ urls: [], url: null, reason: 'no_key' })

  const cacheKey = `${q}::${count}`
  if (cache.has(cacheKey)) {
    const urls = cache.get(cacheKey)!
    return NextResponse.json({ urls, url: urls[0] ?? null })
  }

  try {
    // count > 1: Unsplash returns an array; count = 1: returns a single object
    const endpoint =
      `https://api.unsplash.com/photos/random` +
      `?query=${encodeURIComponent(q)}` +
      `&orientation=landscape` +
      `&content_filter=high` +
      (count > 1 ? `&count=${count}` : '')

    const res = await fetch(endpoint, {
      headers: { Authorization: `Client-ID ${key}` },
      next: { revalidate: 86400 },
    })

    if (!res.ok) {
      cache.set(cacheKey, [])
      return NextResponse.json({ urls: [], url: null, reason: `unsplash_${res.status}` })
    }

    const data = await res.json()
    const urls: string[] = count > 1 && Array.isArray(data)
      ? data.map((p: { urls?: { regular?: string } }) => p?.urls?.regular).filter(Boolean)
      : data?.urls?.regular ? [data.urls.regular] : []

    cache.set(cacheKey, urls)
    return NextResponse.json({ urls, url: urls[0] ?? null })
  } catch (err) {
    console.warn('[destination-image] fetch error:', err)
    cache.set(cacheKey, [])
    return NextResponse.json({ urls: [], url: null, reason: 'fetch_error' })
  }
}
