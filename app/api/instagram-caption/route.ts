import { NextRequest } from 'next/server'

const IG_URL_RE = /instagram\.com\/(p|reel|tv)\/[\w-]+/i

export async function POST(req: NextRequest) {
  const { url } = await req.json() as { url?: string }

  if (!url || !IG_URL_RE.test(url)) {
    return Response.json({ error: 'Not a valid Instagram post URL' }, { status: 400 })
  }

  // Try Instagram's oEmbed endpoint (works for public posts)
  try {
    const oembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}&omitscript=true`
    const res = await fetch(oembedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      // 8s timeout
      signal: AbortSignal.timeout(8000),
    })

    if (res.ok) {
      const data = await res.json() as { title?: string; author_name?: string; thumbnail_url?: string }
      return Response.json({
        caption:       data.title       ?? null,
        author:        data.author_name ?? null,
        thumbnail_url: data.thumbnail_url ?? null,
      })
    }

    // oEmbed failed (likely auth required) — fall through to og scrape
  } catch { /* timeout or network — try scrape */ }

  // Fallback: scrape Open Graph tags (Instagram serves these to crawlers)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept':     'text/html',
      },
      signal: AbortSignal.timeout(8000),
    })

    const html = await res.text()

    const desc  = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i)?.[1]
    const title = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)?.[1]
    const thumb = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1]

    const caption = desc ?? title ?? null

    if (caption) {
      return Response.json({
        caption:       decodeHTMLEntities(caption),
        author:        null,
        thumbnail_url: thumb ?? null,
      })
    }
  } catch { /* scrape failed */ }

  return Response.json(
    { error: 'Could not fetch caption. Make sure the post is public.' },
    { status: 422 }
  )
}

function decodeHTMLEntities(str: string): string {
  return str
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&apos;/g, "'")
}
