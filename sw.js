// Service worker: precache the app shell, then cache-first.
// RELEASING AN UPDATE: bump CACHE_VERSION (and add any new files to APP_SHELL).
// A new version installs in the background; old caches are deleted on activate.

const CACHE_VERSION = 'v2';
const CACHE_NAME = `soroban-${CACHE_VERSION}`;

// Relative URLs resolve against the SW location, so this works under /<repo>/.
const APP_SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/theme.css',
  'css/base.css',
  'css/components.css',
  'css/screens.css',
  'js/main.js',
  'js/core/utils.js',
  'js/core/prng.js',
  'js/core/storage.js',
  'js/core/store.js',
  'js/core/router.js',
  'js/core/audio.js',
  'js/i18n/index.js',
  'js/i18n/th.js',
  'js/i18n/en.js',
  'js/engine/techniques.js',
  'js/engine/levels.js',
  'js/engine/generator.js',
  'js/engine/scoring.js',
  'js/engine/validator.js',
  'js/engine/history.js',
  'js/components/soroban-model.js',
  'js/components/soroban.js',
  'js/components/modal.js',
  'js/components/toast.js',
  'js/components/numpad.js',
  'js/components/avatar.js',
  'js/screens/home.js',
  'js/screens/settings.js',
  'js/screens/lab.js',
  'js/screens/placeholder.js',
  'js/screens/shared.js',
  'js/screens/play-setup.js',
  'js/screens/game.js',
  'js/screens/students.js',
  'assets/icons/icon.svg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/maskable-192.png',
  'assets/icons/maskable-512.png',
  'assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
    // no skipWaiting(): the page offers a "Reload" button so an update never swaps files mid-game
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('soroban-') && k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch other origins

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    } catch {
      // offline: page navigations fall back to the app shell
      if (request.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
      return Response.error();
    }
  })());
});
