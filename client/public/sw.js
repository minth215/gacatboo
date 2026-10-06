// 가캣부 PWA 서비스 워커 — 같은 출처 정적 자원만 캐시, Supabase 등 외부 요청은 건드리지 않음.
const CACHE = 'gacatboo-v197';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 서버(Edge Function)가 보낸 웹 푸시 수신 → 알림 표시.
// data 는 JSON { title, body, emoji, link } 형태로 보낸다고 가정(실패해도 조용히 기본값으로 대체).
self.addEventListener('push', (e) => {
  let payload = {};
  try { payload = e.data ? e.data.json() : {}; } catch {}
  const title = payload.title || '가캣부';
  const body = payload.body || '';
  const icon = self.registration.scope + 'favicon.svg';
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: icon,
      data: { link: payload.link || self.registration.scope },
      tag: payload.tag || undefined,
    }).catch(() => {})
  );
});

// 알림 탭 → 해당 링크로 이동(이미 열린 탭이 있으면 포커스하고 그 탭을 이동).
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const link = e.notification.data?.link || self.registration.scope;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) { client.navigate(link); return client.focus(); }
      }
      return self.clients.openWindow(link);
    })
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
