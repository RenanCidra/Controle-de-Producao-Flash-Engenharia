const IMAGE_CACHE = 'flash-connect-static-images-v1';
const STATIC_IMAGES = [
  '/assets/flash-favicon.png',
  '/assets/flash-brand.svg',
  '/assets/flash-symbol.png',
  '/assets/login-production.webp',
  '/assets/industrial_banner.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(IMAGE_CACHE)
      .then((cache) => cache.addAll(STATIC_IMAGES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith('flash-connect-static-images-') && key !== IMAGE_CACHE)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const isLocalImageAsset = request.method === 'GET'
    && url.origin === self.location.origin
    && url.pathname.startsWith('/assets/')
    && /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(url.pathname);

  if (!isLocalImageAsset) return;

  event.respondWith(
    caches.open(IMAGE_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return new Response('', { status: 503, statusText: 'Imagem indisponível offline' });
      }
    }),
  );
});
