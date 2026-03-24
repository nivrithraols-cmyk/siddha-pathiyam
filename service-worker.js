/* ═══════════════════════════════════════════════════
   Siddha Pathiyam — Service Worker v2
   Strategy: cache-first for assets, stale-while-revalidate for fonts
   ═══════════════════════════════════════════════════ */

const CACHE_VERSION = 'pathiyam-v2';
const FONT_CACHE    = 'pathiyam-fonts-v1';

const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/pathiyam-regimen.pdf',
];

const FONT_ORIGINS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
];

// ── Install: cache core assets ───────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clear old caches ───────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_VERSION && k !== FONT_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: routing strategies ────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Fonts: stale-while-revalidate
  if (FONT_ORIGINS.some(o => url.origin === new URL(o).origin)) {
    event.respondWith(staleWhileRevalidate(event.request, FONT_CACHE));
    return;
  }

  // Everything else: cache-first, fall back to network
  if (event.request.method === 'GET') {
    event.respondWith(cacheFirstStrategy(event.request));
  }
});

// ── Helper: cache-first ──────────────────────────
async function cacheFirstStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok && response.type !== 'opaque') {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline fallback for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('/index.html');
    }
    return new Response('Offline', { status: 503 });
  }
}

// ── Helper: stale-while-revalidate ──────────────
async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached || fetchPromise;
}
