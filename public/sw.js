// Voya Service Worker — offline-first for trip pages
const CACHE = 'voya-v1'
const OFFLINE_URL = '/offline'

// Assets to pre-cache on install
const PRECACHE = [
  '/',
  '/offline',
  '/manifest.json',
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle same-origin GET requests
  if (request.method !== 'GET' || !url.origin.includes(self.location.origin)) return

  // API calls: network-only (never cache dynamic data)
  if (url.pathname.startsWith('/api/')) return

  // Trip share pages: cache-first with background refresh (great for offline day-of viewing)
  if (url.pathname.startsWith('/trip/')) {
    event.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(request)
        const fetchPromise = fetch(request).then(res => {
          if (res.ok) cache.put(request, res.clone())
          return res
        }).catch(() => null)
        return cached ?? fetchPromise ?? caches.match(OFFLINE_URL)
      })
    )
    return
  }

  // Everything else: network-first, fall back to cache, then offline page
  event.respondWith(
    fetch(request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE).then(cache => cache.put(request, clone))
        }
        return res
      })
      .catch(async () => {
        const cached = await caches.match(request)
        return cached ?? (await caches.match(OFFLINE_URL)) ?? new Response('Offline', { status: 503 })
      })
  )
})
