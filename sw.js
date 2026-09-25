/* Service worker: makes the app work offline after the first visit.
 * Bump CACHE_VERSION when you change app files (html/css/js/icons) so phones pick up the new version.
 * Word lists do not need a bump: they are always fetched fresh when online. */
const CACHE_VERSION = 'v1';
const CACHE = 'brain-mouth-' + CACHE_VERSION;

const CORE = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'languages/languages.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })));
    // Also cache every language listed in the manifest.
    try {
      const res = await fetch('languages/languages.json', { cache: 'reload' });
      const manifest = await res.json();
      const files = (Array.isArray(manifest) ? manifest : manifest.languages || [])
        .map((e) => 'languages/' + (typeof e === 'string' ? e : e.file));
      await Promise.all(files.map((f) => cache.add(new Request(f, { cache: 'reload' })).catch(() => {})));
    } catch (_) { /* offline or bad manifest: the app still caches files as they are used */ }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('brain-mouth-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes('/languages/')) {
    event.respondWith(networkFirst(req));
  } else if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, 'index.html'));
  } else {
    event.respondWith(staleWhileRevalidate(req));
  }
});

async function networkFirst(req, fallbackUrl) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetchWithTimeout(req, 4000);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (_) {
    const hit = await cache.match(req, { ignoreSearch: true })
      || (fallbackUrl && await cache.match(fallbackUrl));
    if (hit) return hit;
    throw _;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  const update = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return hit || (await update) || Response.error();
}

function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(req.url, { cache: 'no-cache' }).then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
  });
}
