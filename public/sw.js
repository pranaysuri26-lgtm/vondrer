// Voya Service Worker — offline-first for trip pages only
// v2 — bump version to clear bad v1 cache entries
const CACHE = 'voya-v2'
const OFFLINE_URL = '/offline'

// Only pre-cache the offline fallback itself — NOT '/' (dynamic auth redirect)
const PRECACHE = [
  '/offline',
  '/manifest.json',
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    // Delete ALL old caches (including voya-v1 with bad entries)
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle same-origin GET requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  // API calls: always network-only
  if (url.pathname.startsWith('/api/')) return

  // _next/static assets: cache-first (immutable hashed filenames)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached
        return fetch(request).then(res => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE).then(c => c.put(request, clone))
          }
          return res
        })
      })
    )
    return
  }

  // Trip share pages: cache-first + background refresh (offline day-of viewing)
  if (url.pathname.startsWith('/trip/')) {
    event.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(request)
        const networkFetch = fetch(request).then(res => {
          // Accept any non-error response (200, 301, 302 etc.)
          if (res.status < 400) cache.put(request, res.clone())
          return res
        }).catch(() => null)
        return cached ?? networkFetch ?? caches.match(OFFLINE_URL)
      })
    )
    return
  }

  // Everything else: network-first, NO offline fallback for navigation
  // (we don't want to show the offline page when the user is online but
  //  the page returns a redirect or a non-200 for other reasons)
  event.respondWith(
    fetch(request).catch(async () => {
      // Genuinely offline — try cache, then offline page
      const cached = await caches.match(request)
      return cached ?? (await caches.match(OFFLINE_URL)) ?? new Response('Offline', { status: 503 })
    })
  )
})
