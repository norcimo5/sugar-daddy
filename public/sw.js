/* Sugar Daddy service worker. Hand-written, no dependencies.
 * The build (vite-plugin-precache.ts) replaces the two placeholder lines below with the
 * precache list and a build id. Keep each placeholder on its own line, exactly as written. */
'use strict';

self.__PRECACHE__ = [];
const BUILD_ID = 'dev';

const CACHE_PREFIX = 'sugar-daddy-';
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_ID}`;
const APP_SHELL = '/index.html';

self.addEventListener('install', (event) => {
  // No automatic skipWaiting: the page asks via {type: 'SKIP_WAITING'} after the user agrees.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(self.__PRECACHE__)));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function fromNetworkAndCache(request) {
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    const copy = response.clone();
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.put(request, copy))
      .catch(() => {});
  }
  return response;
}

async function handleNavigation(request) {
  const cached = await caches.match(APP_SHELL, { cacheName: CACHE_NAME });
  if (cached) return cached;
  return fetch(request);
}

async function handleAsset(request) {
  const cached = await caches.match(request, { cacheName: CACHE_NAME });
  if (cached) return cached;
  return fromNetworkAndCache(request);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Never touch (or cache) cross-origin requests.
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js') return;
  event.respondWith(request.mode === 'navigate' ? handleNavigation(request) : handleAsset(request));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const existing = windows.find(
        (client) => new URL(client.url).origin === self.location.origin,
      );
      if (existing) return existing.focus();
      return self.clients.openWindow('/');
    }),
  );
});
