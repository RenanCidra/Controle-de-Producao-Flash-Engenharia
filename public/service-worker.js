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

self.addEventListener('push', (event) => {
  let payload = {
    title: 'NexusPCP · Flash Engenharia',
    body: 'Você tem uma atualização operacional pendente. Toque para acessar.',
    url: '/?tab=occurrences',
    tag: 'nexuspcp-notification',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') {
        payload = {
          title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim().slice(0, 100) : payload.title,
          body: typeof parsed.body === 'string' && parsed.body.trim() ? parsed.body.trim().slice(0, 220) : payload.body,
          url: typeof parsed.url === 'string' && parsed.url.startsWith('/') ? parsed.url : payload.url,
          tag: typeof parsed.tag === 'string' && parsed.tag.trim() ? parsed.tag.trim().slice(0, 80) : payload.tag,
        };
      }
    } catch {
      const text = event.data.text?.();
      if (text && text.trim()) {
        payload.body = text.trim().slice(0, 220);
      }
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: payload.tag,
      renotify: true,
      data: { url: payload.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && typeof event.notification.data.url === 'string' && event.notification.data.url.startsWith('/'))
    ? event.notification.data.url
    : '/?tab=occurrences';
  const absoluteTarget = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin)) {
          if ('focus' in client) await client.focus();
          client.postMessage({ type: 'OPEN_NOTIFICATION_URL', url: targetUrl });
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(absoluteTarget);
      }
      return undefined;
    }),
  );
});

