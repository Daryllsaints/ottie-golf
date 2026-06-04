// Ottie Golf service worker. Network-first for HTML and JS chunks so
// a new deploy is picked up immediately; cache-first only for the
// large static art assets (PNG / JSON tilesets) that change rarely
// and benefit from offline availability.

const CACHE_VERSION = 'ottiegolf-v5';
const STATIC_PRECACHE = [
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
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(STATIC_PRECACHE).catch(() => {}))
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
  if (url.origin !== self.location.origin) return;

  const dest = req.destination;
  const isHtml = req.mode === 'navigate' || dest === 'document';
  const isScriptOrStyle = dest === 'script' || dest === 'style';

  // Always go to the network for HTML and JS / CSS so a new deploy
  // is picked up on the next load without manual cache clears.
  if (isHtml || isScriptOrStyle) {
    return; // let the browser handle it; no SW interception
  }

  // Static art assets: cache-first with background refill.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        if (!resp || resp.status !== 200 || resp.type !== 'basic') return resp;
        const copy = resp.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        return resp;
      });
    })
  );
});
