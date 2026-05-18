'use client'

import { useEffect, useState } from 'react'

/**
 * Fetches a Wikipedia thumbnail for any activity / place name.
 * Two-step: search for the best-matching article, then get its thumbnail.
 * This handles spelling variants, subtitles, and descriptive names.
 */
export function useWikiPhoto(activity: string, destination: string, existingUrl?: string): string {
  const [url, setUrl] = useState(existingUrl ?? '')

  useEffect(() => {
    if (url) return
    const ctrl = new AbortController()

    async function load() {
      // Strip sub-names like "Restaurant – Famous Dish" or "Place (optional note)"
      const clean = activity
        .replace(/\s+[–—-].*$/, '')
        .replace(/\s+\(.*\)$/, '')
        .replace(/\b(walking tour|day trip to|exploring|visiting|stroll|tour|walk|workshop|class|performance)\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim()

      // Include city name so "House of Nanking" finds the SF restaurant not the Chinese city
      const query = destination ? `${clean} ${destination}` : clean

      try {
        // Step 1: Wikipedia full-text search — handles fuzzy / variant names
        const searchUrl =
          `https://en.wikipedia.org/w/api.php?action=query&list=search` +
          `&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=1`
        const searchRes  = await fetch(searchUrl, { signal: ctrl.signal })
        const searchData = await searchRes.json()
        const title      = searchData.query?.search?.[0]?.title as string | undefined
        if (!title) return

        // Step 2: Fetch page summary (includes thumbnail)
        const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
        const summaryRes  = await fetch(summaryUrl, { signal: ctrl.signal })
        const summaryData = await summaryRes.json()
        const src         = summaryData.thumbnail?.source as string | undefined
        if (src) setUrl(src)
      } catch { /* ignore abort / network errors */ }
    }

    load()
    return () => ctrl.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity, destination])

  return url
}
