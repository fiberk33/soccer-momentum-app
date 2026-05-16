// MomentumTrack Service Worker v3
// Cache bust — forces fresh reload

const CACHE_NAME = 'momentumtrack-v3';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network first — always get fresh content
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // API — always network
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Everything else — network first, no cache
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
