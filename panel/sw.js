/* Paffu Panel · service worker: guarda la app para abrirla rápido y sin conexión.
   Los datos (Supabase) siempre se piden en línea. */
const CACHE = 'paffu-panel-v1';
const SHELL = ['/panel/', '/panel/index.html', '/panel/manifest.webmanifest', '/panel/icons/icon-192.png', '/panel/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase y fuentes: directo a la red
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/panel/index.html')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok && url.pathname.startsWith('/panel/')) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});

/* Al tocar una notificación, abre el panel en la pestaña indicada */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '/panel/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if (c.url.includes('/panel/')) { c.focus(); c.navigate(target); return; } }
    return self.clients.openWindow(target);
  }));
});
