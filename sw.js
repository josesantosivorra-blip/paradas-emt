// Cachea la propia app para que abra sin cobertura.
// Los tiempos de la EMT nunca se cachean: siempre van a la red.
const CACHE = 'paradas-emt-v4';
const SHELL = ['./', './index.html', './icono.png'];
const ESPERA_RED = 2000;

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

function guardar(peticion, respuesta) {
  if (respuesta && respuesta.ok) {
    const copia = respuesta.clone();
    caches.open(CACHE).then((c) => c.put(peticion, copia));
  }
  return respuesta;
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  const esPagina = e.request.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');

  if (esPagina) {
    // La pagina: red primero, para no quedarnos con una version vieja.
    // Si tarda mas de 2 s o no hay cobertura, tiramos de la copia guardada.
    e.respondWith(
      new Promise((resolve) => {
        let resuelto = false;
        const conCache = () => caches.match(e.request).then((c) => c || caches.match('./index.html'));
        const reloj = setTimeout(() => {
          if (resuelto) return;
          conCache().then((c) => { if (c && !resuelto) { resuelto = true; resolve(c); } });
        }, ESPERA_RED);

        fetch(e.request)
          .then((r) => {
            guardar(e.request, r);
            clearTimeout(reloj);
            if (!resuelto) { resuelto = true; resolve(r); }
          })
          .catch(() => {
            clearTimeout(reloj);
            conCache().then((c) => {
              if (resuelto) return;
              resuelto = true;
              resolve(c || Response.error());
            });
          });
      })
    );
    return;
  }

  // El resto (icono): de la cache al instante, refrescando por detras.
  e.respondWith(
    caches.match(e.request).then((cacheada) => {
      const red = fetch(e.request).then((r) => guardar(e.request, r)).catch(() => cacheada);
      return cacheada || red;
    })
  );
});
