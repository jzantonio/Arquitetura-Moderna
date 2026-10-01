// Endereço antigo: o service worker se desinstala para os celulares passarem a usar a nova plataforma.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.registration.unregister().then(() => self.clients.matchAll()).then((cs) => cs.forEach((c) => c.navigate(c.url)))));
