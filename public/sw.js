/* 타임라인 — 오프라인에서도 열리도록 하는 최소 서비스 워커
   전략: 네트워크 우선, 실패하면 캐시. 새 배포가 있으면 온라인일 때 즉시 갱신됩니다. */
const CACHE = 'timeline-shell-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.allSettled([cache.add('./'), cache.add('./index.html')]))
      .catch(() => {}),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {})
        }
        return response
      })
      .catch(async () => {
        const cached = await caches.match(request)
        if (cached) return cached
        if (request.mode === 'navigate') {
          const shell = (await caches.match('./index.html')) || (await caches.match('./'))
          if (shell) return shell
        }
        return new Response('오프라인 상태입니다.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
      }),
  )
})
