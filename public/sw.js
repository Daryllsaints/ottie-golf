// Ottie Golf service worker. Cache-first for static assets so the
// game opens instantly on repeat visits and survives flaky connections.
// Bumping CACHE_VERSION below invalidates the old cache on next load.

const CACHE_VERSION = 'ottiegolf-v3';
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/sprites/ottie-ready.png',
  '/sprites/ottie-swing.png',
  '/sprites/tree.png',
  '/tiles/ocean-grass.png',
  '/tiles/ocean-grass.json',
  '/tiles/rough-fairway.png',
  '/tiles/rough-fairway.json',
  '/tiles/fairway-sand.png',
  '/tiles/fairway-sand.json',
  '/tiles/fairway-green.png',
  '/tiles/fairway-green.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never cache Supabase or any third-party API calls.
  if (url.origin !== self.location.origin) return;
  // Never cache match URLs — they have to hit the SPA fresh.
  if (url.pathname.startsWith('/m/')) {
    event.respondWith(fetch(req).catch(() => caches.match('/')));
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((resp) => {
          if (!resp || resp.status !== 200 || resp.type !== 'basic') return resp;
          const copy = resp.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return resp;
        })
        .catch(() => caches.match('/'));
    })
  );
});
