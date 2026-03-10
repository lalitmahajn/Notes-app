/**
 * Service Worker — Secure Notes PWA
 *
 * Strategy:
 *   - Static assets: Stale-while-revalidate (serve cached, update in background)
 *   - Supabase / CDN: Pass through, never intercept
 *   - On new SW version: skipWaiting + claim — instant takeover
 */

const CACHE_NAME = 'secure-notes-v8';
const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './manifest.json',
    './icons/notes_128px.png',
    './icons/notes_192px.png',
    './icons/notes_256px.png',
    './icons/notes_512px.png',
    './app/config.js',
    './app/services/supabase.js',
    './app/services/auth.js',
    './app/services/folders.js',
    './app/services/notes.js',
    './app/services/indexeddb.js',
    './app/utils/helpers.js',
    './app/services/sync.js',
    './app/services/markdown.js',
    './app/ui/controller.js',
    './app/main.js',
];

// Install — cache static assets, then activate immediately
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching static assets');
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting(); // Don't wait — activate right away
});

// Activate — clean old caches, claim all clients
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim(); // Take control of all open tabs immediately
});

// Fetch — stale-while-revalidate for local assets
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // DO NOT intercept Supabase API or auth calls
    if (url.hostname.includes('supabase')) return;

    // DO NOT intercept CDN calls (marked.js, supabase-js, Google Fonts)
    if (url.hostname.includes('cdn.jsdelivr.net') ||
        url.hostname.includes('fonts.googleapis.com')) {
        return;
    }

    // Stale-while-revalidate: serve from cache immediately,
    // fetch fresh copy in background and update cache for next load
    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            const cached = await cache.match(event.request);
            const networkFetch = fetch(event.request).then((res) => {
                if (res.ok && event.request.method === 'GET' && url.origin === self.location.origin) {
                    cache.put(event.request, res.clone());
                }
                return res;
            }).catch(() => {
                // Network failed — return cached or offline fallback
                if (cached) return cached;
                if (event.request.mode === 'navigate') {
                    return cache.match('./index.html');
                }
                return new Response('Offline', { status: 503 });
            });

            // Return cached version instantly if available, otherwise wait for network
            return cached || networkFetch;
        })
    );
});
