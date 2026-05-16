import { NextRequest, NextResponse } from 'next/server'

// Session-level cache: key = "query::count"
const cache = new Map<string, string[]>()

// ── Unsplash (requires UNSPLASH_ACCESS_KEY env var) ───────────────────────────
async function fromUnsplash(q: string, count: number, key: string): Promise<string[]> {
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
  if (!res.ok) return []
  const data = await res.json()
  return count > 1 && Array.isArray(data)
    ? data.map((p: { urls?: { regular?: string } }) => p?.urls?.regular).filter(Boolean)
    : data?.urls?.regular ? [data.urls.regular] : []
}

// ── Wikipedia REST summary (no key needed) — returns 1 high-quality thumbnail ─
// Uses the destination name as the article title (first 1-3 words work best).
async function fromWikipedia(destination: string): Promise<string[]> {
  // Try exact title first, then first two words (strip trailing country/state)
  const titles = [
    destination,
    destination.split(',')[0].trim(),            // "Ocracoke Island, NC" → "Ocracoke Island"
  ].filter((t, i, arr) => arr.indexOf(t) === i)  // dedupe

  for (const title of titles) {
    try {
      const slug = encodeURIComponent(title.replace(/ /g, '_'))
      const res = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`,
        {
          headers: { 'User-Agent': 'Voya-App/1.0 (contact@voya.app)' },
          next: { revalidate: 86400 },
        }
      )
      if (!res.ok) continue
      const data = await res.json()
      // Prefer 'originalimage' (higher res) over 'thumbnail'
      const url: string | undefined =
        data?.originalimage?.source ?? data?.thumbnail?.source
      if (url) return [url]
    } catch { /* try next title */ }
  }
  return []
}

// ── Wikimedia Commons search — returns up to 4 images ────────────────────────
// Uses MediaWiki API to search for images related to the destination.
async function fromWikimediaSearch(destination: string, count: number): Promise<string[]> {
  try {
    const searchTerm = destination.split(',')[0].trim()
    const res = await fetch(
      `https://commons.wikimedia.org/w/api.php` +
      `?action=query&generator=search&gsrnamespace=6` +
      `&gsrsearch=${encodeURIComponent(searchTerm + ' landscape')}` +
      `&gsrlimit=${count * 3}` +           // fetch extra, filter bad ones
      `&prop=imageinfo&iiprop=url|mime|size` +
      `&iiurlwidth=1200` +
      `&format=json&origin=*`,
      {
        headers: { 'User-Agent': 'Voya-App/1.0' },
        next: { revalidate: 86400 },
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    const pages: Record<string, { imageinfo?: { url?: string; mime?: string }[] }> =
      data?.query?.pages ?? {}
    const urls = Object.values(pages)
      .flatMap(p => p.imageinfo ?? [])
      .filter(ii => ii.mime?.startsWith('image/jpeg') || ii.mime?.startsWith('image/png'))
      .map(ii => ii.url)
      .filter((u): u is string => Boolean(u))
      .slice(0, count)
    return urls
  } catch {
    return []
  }
}

export async function GET(req: NextRequest) {
  const q     = req.nextUrl.searchParams.get('q') ?? 'travel landscape'
  const count = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('count') ?? '1', 10), 1), 4)
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY

  const cacheKey = `${q}::${count}`
  if (cache.has(cacheKey)) {
    const urls = cache.get(cacheKey)!
    return NextResponse.json({ urls, url: urls[0] ?? null })
  }

  try {
    let urls: string[] = []

    // 1. Unsplash — best quality, requires API key
    if (unsplashKey) {
      urls = await fromUnsplash(q, count, unsplashKey)
    }

    // 2. Wikipedia REST summary — no key, 1 great photo
    if (urls.length === 0) {
      // q is "Ocracoke Island United States travel" — strip trailing words
      const destName = q.replace(/ travel$/, '').replace(/ tourism$/, '')
      urls = await fromWikipedia(destName)
    }

    // 3. Wikimedia Commons search — no key, up to 4 photos (more variable quality)
    if (urls.length < count) {
      const destName = q.replace(/ travel$/, '').replace(/ tourism$/, '')
      const extra = await fromWikimediaSearch(destName, count - urls.length)
      urls = [...urls, ...extra]
    }

    cache.set(cacheKey, urls)
    return NextResponse.json({ urls, url: urls[0] ?? null })
  } catch (err) {
    console.warn('[destination-image] fetch error:', err)
    cache.set(cacheKey, [])
    return NextResponse.json({ urls: [], url: null, reason: 'fetch_error' })
  }
}
