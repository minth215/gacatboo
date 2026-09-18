// 가캣부 PWA 서비스 워커 — 같은 출처 정적 자원만 캐시, Supabase 등 외부 요청은 건드리지 않음.
const CACHE = 'gacatboo-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 외부(API/CDN) 요청은 그대로 통과

  // 페이지 이동: 네트워크 우선, 오프라인이면 캐시된 앱 셸로 폴백
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match(self.registration.scope + 'index.html'))
    );
    return;
  }

  // 정적 자원: 캐시 우선 + 백그라운드 갱신(stale-while-revalidate)
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => { if (res && res.status === 200) cache.put(req, res.clone()); return res; })
        .catch(() => cached);
      return cached || network;
    })
  );
});
