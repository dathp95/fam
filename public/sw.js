/* FAM service worker (hand written, no build step). Production only: registered from src/main.tsx.
 *
 * Everything is derived from the worker's own scope, so it works under any base path ("/", "/fam/", ...).
 * To ship a change to this file's caching rules, bump CACHE_VERSION: old "fam-" caches are deleted on activate.
 *
 *   shell      precached on install (index.html, manifest, icons, the hashed /assets/ files index.html uses)
 *   navigation network first, cached index.html when offline
 *   catalogs   lessons/index.json and pictures/index.json: stale-while-revalidate
 *   assets/    cache first (hashed file names never change)
 *   pictures/  cache first
 *   audio      cache first, with Range (206) support for Safari; cached the first time it is played
 *
 * A new worker waits until the page sends {type: 'SKIP_WAITING'}, so an update never swaps files mid-lesson.
 */

const CACHE_VERSION = 3
const STATIC_CACHE = `fam-static-v${CACHE_VERSION}`
const MEDIA_CACHE = `fam-media-v${CACHE_VERSION}`
const DATA_CACHE = `fam-data-v${CACHE_VERSION}`
const CURRENT_CACHES = [STATIC_CACHE, MEDIA_CACHE, DATA_CACHE]

const SCOPE = self.registration.scope // absolute URL, always ends with "/"
const at = (path) => new URL(path, SCOPE).href

const INDEX_HTML = at('index.html')
const HOME = SCOPE // the app's own address: hosts such as Cloudflare redirect /index.html to /
const SHELL = ['site.webmanifest', 'favicon.ico', 'icons/favicon.svg', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'].map(at)
const CATALOGS = [at('lessons/index.json'), at('pictures/index.json')]

let claimOnActivate = false

/**
 * Parse a single "bytes=start-end" Range header for a file of `size` bytes.
 * Returns {start, end} (inclusive), {unsatisfiable: true}, or null when the header should be ignored.
 */
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header || '').trim())
  if (!m || (m[1] === '' && m[2] === '')) return null
  if (m[1] === '') {
    const suffix = Number(m[2]) // last N bytes
    if (suffix === 0) return { unsatisfiable: true }
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(m[1])
  const end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  if (start >= size) return { unsatisfiable: true }
  if (end < start) return null
  return { start, end }
}

/** Answer a Range request from a cached full (200) response. */
async function sliceResponse(cached, rangeHeader) {
  const buffer = await cached.clone().arrayBuffer()
  const size = buffer.byteLength
  const range = parseRange(rangeHeader, size)
  if (range === null) return cached
  if (range.unsatisfiable) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
  const body = buffer.slice(range.start, range.end + 1)
  return new Response(body, {
    status: 206,
    headers: {
      'Content-Type': cached.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Length': String(body.byteLength),
      'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
      'Accept-Ranges': 'bytes',
    },
  })
}

/**
 * A response that came through a redirect cannot be handed to the page: Safari refuses it with
 * "Response served by service worker has redirections". Rebuild it as a plain response.
 */
async function clean(res) {
  if (!res.redirected) return res
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers })
}

async function putOk(cacheName, key, response) {
  if (response && response.status === 200) {
    const cache = await caches.open(cacheName)
    await cache.put(key, response)
  }
}

/** Fetch index.html and list the same-scope /assets/ files it uses (so the app also works offline after the first visit). */
async function assetsOf(html) {
  const found = new Set()
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    let url
    try {
      url = new URL(m[1], SCOPE).href
    } catch {
      continue
    }
    if (url.startsWith(at('assets/'))) found.add(url)
  }
  return [...found]
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE)
      const res = await clean(await fetch(HOME, { cache: 'reload' }))
      if (!res.ok) throw new Error(`index.html: HTTP ${res.status}`)
      const html = await res.clone().text()
      await cache.put(INDEX_HTML, res)
      // Optional files must not break the install: ignore failures one by one.
      const optional = [...SHELL, ...(await assetsOf(html))]
      await Promise.all(
        optional.map((url) =>
          fetch(url, { cache: 'reload' })
            .then((r) => putOk(STATIC_CACHE, url, r))
            .catch(() => {}),
        ),
      )
      const data = await caches.open(DATA_CACHE)
      await Promise.all(
        CATALOGS.map((url) =>
          fetch(url, { cache: 'reload' })
            .then((r) => (r.status === 200 ? data.put(url, r) : undefined))
            .catch(() => {}),
        ),
      )
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('fam-') && !CURRENT_CACHES.includes(name)) await caches.delete(name)
      }
      if (claimOnActivate) await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    claimOnActivate = true
    self.skipWaiting()
  }
})

async function networkFirstNavigation() {
  try {
    const res = await clean(await fetch(HOME))
    if (res.ok) await putOk(STATIC_CACHE, INDEX_HTML, res.clone())
    return res
  } catch {
    const cached = await caches.match(INDEX_HTML)
    if (cached) return clean(cached)
    throw new Error('offline and not cached')
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request.url)
  const refresh = fetch(request)
    .then(async (res) => {
      if (res.status === 200) await cache.put(request.url, res.clone())
      return res
    })
    .catch(() => undefined)
  return cached || (await refresh) || Response.error()
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request.url)
  if (cached) return cached
  const res = await fetch(request)
  if (res.status === 200) await cache.put(request.url, res.clone())
  return res
}

const downloading = new Set()

/** Audio: cache first; Range requests are answered from the cached file with a 206. */
async function audio(event) {
  const request = event.request
  const cache = await caches.open(MEDIA_CACHE)
  const cached = await cache.match(request.url)
  const range = request.headers.get('range')
  if (cached) return range ? sliceResponse(cached, range) : cached
  if (!range) {
    const res = await fetch(request)
    if (res.status === 200) await cache.put(request.url, res.clone())
    return res
  }
  // Not cached yet and the browser asked for a slice: pass it through and keep the whole file for next time.
  if (!downloading.has(request.url)) {
    downloading.add(request.url)
    event.waitUntil(
      fetch(request.url)
        .then((res) => putOk(MEDIA_CACHE, request.url, res))
        .catch(() => {})
        .finally(() => downloading.delete(request.url)),
    )
  }
  return fetch(request)
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || !request.url.startsWith(SCOPE)) return // third parties stay on the network

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation())
    return
  }
  const path = url.pathname.slice(new URL(SCOPE).pathname.length)
  const bare = at(path) // same URL without the query string

  if (CATALOGS.includes(bare)) {
    event.respondWith(staleWhileRevalidate(new Request(bare), DATA_CACHE))
  } else if (path.startsWith('assets/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE))
  } else if (path.endsWith('.mp3')) {
    event.respondWith(audio(event))
  } else if (path.startsWith('pictures/')) {
    event.respondWith(cacheFirst(request, MEDIA_CACHE))
  } else if (SHELL.includes(bare)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE))
  }
})

// Lets tests load the pure helpers (a classic worker has no `module`).
if (typeof module !== 'undefined') module.exports = { parseRange, sliceResponse, clean }
