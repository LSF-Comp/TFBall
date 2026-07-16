const CACHE_NAME = 'tfball-cache-v1';
const ASSETS = [
    './index.html',
    './offline.html',
    './style.css',
    './app.js',
    './authentification.js',
    './firebase-sync.js',
    './manifest.json',
    './icons/icon-192.svg',
    './icons/icon-512.svg'
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(keys.map(key => {
            if (key !== CACHE_NAME) return caches.delete(key);
        })))
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;

    // Navigation requests: network-first, fallback to cached index
    if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
        event.respondWith(
            fetch(req).then(res => {
                const copy = res.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
                return res;
            }).catch(() => caches.match('./offline.html'))
        );
        return;
    }

    // Other assets: cache-first
    event.respondWith(
        caches.match(req).then(cached => cached || fetch(req).then(res => {
            caches.open(CACHE_NAME).then(cache => cache.put(req, res.clone()));
            return res;
        })).catch(() => { })
    );
});
