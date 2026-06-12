const CACHE_NAME = 'raddo-runtime-cache-v1';
const TILE_HOSTS = ['basemaps.cartocdn.com'];

function shouldCache(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) return true;
  return TILE_HOSTS.some((host) => url.hostname.endsWith(host));
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!shouldCache(request)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const refresh = fetch(request)
        .then((response) => {
          if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || refresh;
    }),
  );
});
