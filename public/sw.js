const CACHE_NAME = 'my-pa-shell-v4';
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/my-pa-logo.png',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/')));
    return;
  }

  if (url.pathname.startsWith('/src/') || url.pathname.startsWith('/node_modules/')) return;
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch (error) {
    console.error('Could not parse a push notification:', error);
  }

  const title = typeof payload.title === 'string' ? payload.title : 'My PA';
  const options = {
    body: typeof payload.body === 'string' ? payload.body : 'You have an update from Mercy.',
    icon: '/pwa-icon-192.png',
    badge: '/pwa-icon-192.png',
    tag: typeof payload.tag === 'string' ? payload.tag : undefined,
    data: { url: typeof payload.url === 'string' ? payload.url : '/' },
    vibrate: [200, 100, 200, 100, 400],
    silent: false,
    requireInteraction: true,
  };

  event.waitUntil(
    self.registration.showNotification(title, options).then(() => (
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        clients.forEach(client => client.postMessage({ type: 'MY_PA_PUSH_NOTIFICATION' }));
      })
    ))
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    const appClient = clients.find(client => new URL(client.url).origin === self.location.origin);
    if (appClient) return appClient.navigate(url).then(() => appClient.focus());
    return self.clients.openWindow(url);
  }));
});
