// FIAMS campo · service worker: guarda o app no aparelho para abrir sem internet.
const V = 'fiams-v3';
const CORE = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/config.js', 'js/logic.js', 'js/schema.js', 'js/store.js', 'js/ui.js', 'js/form.js', 'js/editor.js', 'js/sup.js',
  'vendor/preact-htm.js', 'vendor/supabase.js', 'vendor/591.supabase.js', 'vendor/chart.umd.js', 'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const sameOrigin = u.origin === location.origin;
  const fonts = /fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);
  const tiles = /tile\.openstreetmap\.org$/.test(u.hostname);
  if (!sameOrigin && !fonts && !tiles) return; // Supabase e demais: sempre rede
  // rede primeiro (conteúdo atualizado), cache como reserva offline
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok || r.type === 'opaque') { const cp = r.clone(); caches.open(V).then((c) => c.put(e.request, cp)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((m) => m || (e.request.mode === 'navigate' ? caches.match('index.html') : undefined))));
});
