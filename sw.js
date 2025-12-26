sw.js
/* Fan Talk Service Worker — cache for offline + speed
   - Keeps app usable with weak/no signal
   - Updates safely via CACHE_VERSION bump
*/
const CACHE_VERSION = 'fan-talk-v6';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './logo.png',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(CORE_ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE_VERSION ? caches.delete(k) : Promise.resolve())));
    await self.clients.claim();

    // Notify clients SW is ready (no forced reload)
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      client.postMessage({ type: 'SW_READY' });
    }
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET
  if (req.method !== 'GET') return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);

    // Cache-first for core assets
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;

    // Network, then cache
    try{
      const fresh = await fetch(req);
      // Only cache same-origin successful responses
      const url = new URL(req.url);
      if (fresh.ok && url.origin === self.location.origin) {
        cache.put(req, fresh.clone());
      }
      return fresh;
    }catch(e){
      // If offline and nothing cached, fall back to app shell
      const shell = await cache.match('./index.html');
      return shell || new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
