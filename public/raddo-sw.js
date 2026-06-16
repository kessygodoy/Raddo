const CACHE_NAME = 'raddo-runtime-cache-v2';
const TILE_HOSTS = ['basemaps.cartocdn.com'];

function shouldCache(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.searchParams.has('token')) return false;
  if (url.pathname.startsWith('/@vite') || url.pathname.startsWith('/src/') || url.pathname.startsWith('/node_modules/')) return false;
  if (url.origin === self.location.origin) return true;
  return TILE_HOSTS.some((host) => url.hostname.endsWith(host));
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith('raddo-runtime-cache-') && key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!shouldCache(request)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      try {
        const response = await fetch(request);
        if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
        return response || cached || new Response('', { status: 504, statusText: 'Offline' });
      } catch {
        if (cached) return cached;
        if (request.mode === 'navigate') {
          return (await caches.match('/index.html')) || new Response('', { status: 504, statusText: 'Offline' });
        }
        return new Response('', { status: 504, statusText: 'Offline' });
      }
    }),
  );
});
