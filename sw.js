/**
 * Service Worker — Secure Notes PWA
 *
 * Strategy:
 *   - Static assets (HTML, CSS, JS, fonts): Cache-first with network fallback
 *   - Supabase API calls: Pass through directly (no SW interception).
 *     Offline data handling is done by IndexedDB + SyncEngine in app.js.
 */

const CACHE_NAME = 'secure-notes-v3';
const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
];

// Install — cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching static assets');
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // DO NOT intercept Supabase API or auth calls.
    // IndexedDB + SyncEngine handles offline data; the SW should not
    // interfere with Supabase requests (avoids CORS/caching issues).
    if (url.hostname.includes('supabase')) {
        return; // Let the browser handle it natively
    }

    // DO NOT intercept CDN calls (marked.js, supabase-js, Google Fonts API)
    // These can cause CORS issues when cached/intercepted by SW
    if (url.hostname.includes('cdn.jsdelivr.net') ||
        url.hostname.includes('fonts.googleapis.com')) {
        return;
    }

    // Cache-first for local static assets only
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((res) => {
                // Only cache successful GET responses for same-origin
                if (res.ok && event.request.method === 'GET' && url.origin === self.location.origin) {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                }
                return res;
            });
        }).catch(() => {
            // If both cache and network fail, return a basic offline page for navigation requests
            if (event.request.mode === 'navigate') {
                return caches.match('./index.html');
            }
            // For other requests, return a proper error response instead of undefined
            return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        })
    );
});
