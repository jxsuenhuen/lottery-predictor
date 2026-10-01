const CACHE = 'lottery-predictor-v4';
const ASSETS = ['./','./index.html','./styles.css','./app.js','./history.csv','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).pathname.endsWith('/history.csv')) {
    event.respondWith(fetch(req, {cache:'no-store'}).catch(() => caches.match(req)));
    return;
  }
  event.respondWith(fetch(req).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
    return response;
  }).catch(() => caches.match(req)));
});
