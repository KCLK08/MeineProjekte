const SW_VERSION = '2026-03-24-v2';
const STATIC_CACHE = `elifba-static-${SW_VERSION}`;
const RUNTIME_CACHE = `elifba-runtime-${SW_VERSION}`;

const CORE_ASSETS = [
  './',
  './index.html',
  './dashboard.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/dashboard.js',
  './js/exercise-list-progress.js',
  './js/letter-trainer.js',
  './js/progress.js',
  './js/reset-progress.js',
  './js/start.js',
  './js/pwa-register.js',
  './kapitel/kapitel.html',
  './kapitel/elifba/elifba.html',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  const isAsset = /\.(?:css|js|png|jpg|jpeg|svg|webp|mp3|woff2?|ttf|html)$/i.test(url.pathname);
  if (isAsset) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    return caches.match('./index.html');
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cached || fetchPromise || Response.error();
}
