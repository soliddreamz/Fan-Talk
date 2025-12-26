/* Fan Talk Service Worker — bulletproof offline + GH Pages safe */
const CACHE_VERSION = 'fan-talk-v9';
const CORE_ASSETS = [
  './index.html',
  './manifest.json',
  './logo.png',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './sw.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);

    // Fetch each asset individually so one failure doesn't break install
    await Promise.all(CORE_ASSETS.map(async (url) => {
      try{
        const req = new Request(url, { cache: 'reload' });
        const res = await fetch(req);
        if(res && res.ok) await cache.put(url, res.clone());
      }catch(e){
        // ignore; offline install can still partially succeed
      }
    }));

    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE_VERSION ? caches.delete(k) : Promise.resolve())));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if(req.method !== 'GET') return;

  const url = new URL(req.url);

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);

    // 1) Navigations (page loads / refresh): network-first, then cached index.html
    // This is the key to offline refresh working.
    if(req.mode === 'navigate'){
      try{
        const fresh = await fetch(req);
        // Cache the latest index when we can (best effort)
        const clone = fresh.clone();
        // Only cache same-origin
        if(url.origin === self.location.origin){
          cache.put('./index.html', clone).catch(()=>{});
        }
        return fresh;
      }catch(e){
        const shell = await cache.match('./index.html');
        return shell || new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    }

    // 2) Same-origin assets: cache-first
    if(url.origin === self.location.origin){
      const cached = await cache.match(req, { ignoreSearch: true }) || await cache.match(url.pathname, { ignoreSearch: true });
      if(cached) return cached;

      try{
        const fresh = await fetch(req);
        if(fresh && fresh.ok){
          cache.put(req, fresh.clone()).catch(()=>{});
        }
        return fresh;
      }catch(e){
        return new Response('', { status: 504, statusText: 'Offline' });
      }
    }

    // 3) Cross-origin: just try network
    return fetch(req);
  })());
});
