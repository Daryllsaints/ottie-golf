// Self-destruct service worker. Anyone with a previously-registered
// Ottie Golf SW will, on their next page load, fetch this file (the
// browser checks for SW updates automatically), notice the new
// contents, install it, and immediately have it unregister itself
// and purge every cache. Combined with main.tsx's getRegistrations
// cleanup, this gives us two independent paths back to a clean slate
// while we re-architect the offline strategy.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      try { client.navigate(client.url); } catch { /* ignore */ }
    }
  })());
});

self.addEventListener('fetch', () => {
  // No interception while we tear down.
});
