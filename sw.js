const CACHE = 'chef-en-casa-v1';
const ASSETS = [
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,700;0,900;1,400&family=Cabinet+Grotesk:wght@400;500;700;800&display=swap'
];

// Install: cache core assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for assets, network-first for API, stale-while-revalidate for images
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never intercept Anthropic API calls — always need network
  if (url.hostname === 'api.anthropic.com') return;

  // Unsplash images: cache-first (they don't change)
  if (url.hostname.includes('unsplash.com') || url.hostname.includes('images.unsplash')) {
    e.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(e.request);
        if (cached) return cached;
        try {
          const fresh = await fetch(e.request);
          if (fresh.ok) cache.put(e.request, fresh.clone());
          return fresh;
        } catch {
          // Return a simple offline placeholder SVG for images
          return new Response(
            `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" style="background:#1A1712">
              <text x="50%" y="50%" text-anchor="middle" fill="#5A5248" font-size="48" dy=".3em">🍽️</text>
            </svg>`,
            { headers: { 'Content-Type': 'image/svg+xml' } }
          );
        }
      })
    );
    return;
  }

  // Google Fonts: cache-first
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(e.request);
        if (cached) return cached;
        try {
          const fresh = await fetch(e.request);
          if (fresh.ok) cache.put(e.request, fresh.clone());
          return fresh;
        } catch { return cached || new Response('', { status: 503 }); }
      })
    );
    return;
  }

  // App shell (HTML, manifest): cache-first, update in background
  if (url.pathname.endsWith('.html') || url.pathname.endsWith('.json') || url.pathname === '/') {
    e.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(e.request);
        const networkFetch = fetch(e.request).then(fresh => {
          if (fresh.ok) cache.put(e.request, fresh.clone());
          return fresh;
        }).catch(() => null);
        return cached || await networkFetch || new Response('Offline', { status: 503 });
      })
    );
    return;
  }
});

// Listen for skip-waiting message from app
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
