// Generated at build time. Only the exact application assets are cached.
const prefix = 'marketweft/' + self.registration.scope + '/'
const current = prefix + '__DIGEST__'
const assets = __MARKETWEFT_BUILD_ASSETS__
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(current)
      .then((cache) => cache.addAll(assets))
      .then(() => self.skipWaiting()),
  )
})
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(prefix) && key !== current)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})
self.addEventListener('fetch', (event) => {
  if (
    event.request.method !== 'GET' ||
    !event.request.url.startsWith(self.registration.scope)
  )
    return
  event.respondWith(
    caches.open(current).then(async (cache) => {
      // Build assets are identical for every origin. Module requests may carry
      // an Origin header that was absent when the same asset was precached.
      const match = await cache.match(event.request, { ignoreVary: true })
      if (match) return match
      if (event.request.mode === 'navigate')
        return (await cache.match('./index.html')) || fetch(event.request)
      return fetch(event.request)
    }),
  )
})
