// Cachea la propia app para que abra al instante, incluso sin cobertura.
// Los tiempos de la EMT nunca se cachean: siempre van a la red.
const CACHE = 'paradas-emt-v3';
const SHELL = ['./', './index.html', './icono.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  // Servimos de la caché al instante y refrescamos por detrás.
  e.respondWith(
    caches.match(e.request).then((cacheada) => {
      const red = fetch(e.request)
        .then((resp) => {
          if (resp && resp.ok) {
            const copia = resp.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copia));
          }
          return resp;
        })
        .catch(() => cacheada || caches.match('./index.html'));
      return cacheada || red;
    })
  );
});
