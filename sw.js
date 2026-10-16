// Cachea la app para que abra sin cobertura, y recibe los avisos de bus.
const CACHE = 'paradas-emt-v24';
const SHELL = ['./', './index.html', './icono.png', './manifest.json'];
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

  e.respondWith(
    caches.match(e.request).then((cacheada) => {
      const red = fetch(e.request).then((r) => guardar(e.request, r)).catch(() => cacheada);
      return cacheada || red;
    })
  );
});

// ---------- avisos de bus ----------
self.addEventListener('push', (e) => {
  let datos = { titulo: 'Tu bus está cerca', cuerpo: '', url: './' };
  try { if (e.data) datos = Object.assign(datos, e.data.json()); } catch (err) {}
  // Avisamos a la app, si esta abierta, de que este aviso ya ha saltado.
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((ventanas) => ventanas.forEach((v) => v.postMessage({ tipo: 'aviso-lanzado' })))
      .catch(() => {})
  );
  e.waitUntil(
    self.registration.showNotification(datos.titulo, {
      body: datos.cuerpo,
      icon: './icono-192.png',
      badge: './icono-192.png',
      tag: 'bus',
      renotify: true,
      data: { url: datos.url }
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destino = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if (v.url.indexOf(self.location.origin) === 0 && 'focus' in v) return v.focus();
      }
      return self.clients.openWindow(destino);
    })
  );
});
