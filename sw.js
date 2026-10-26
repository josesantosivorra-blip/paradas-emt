// Cachea la app para que abra sin cobertura, y recibe los avisos de bus.
const CACHE = 'paradas-emt-v29';
const SHELL = ['./', './index.html', './icono.png', './manifest.json'];

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

function avisaDeVersionNueva() {
  self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((ventanas) => ventanas.forEach((v) => v.postMessage({ tipo: 'version-nueva' })))
    .catch(() => {});
}

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
    // La pagina se sirve de la copia guardada al instante: abrir no debe esperar a la red.
    // Por detras se descarga la ultima y, si ha cambiado, se avisa a la app.
    e.respondWith(
      caches.match(e.request).then((cacheada) => {
        const red = fetch(e.request)
          .then(async (r) => {
            if (!r || !r.ok) return r;
            const paraCache = r.clone();
            if (cacheada) {
              try {
                const [nuevo, viejo] = await Promise.all([r.clone().text(), cacheada.clone().text()]);
                if (nuevo !== viejo) avisaDeVersionNueva();
              } catch (err) { /* da igual: igualmente guardamos */ }
            }
            const c = await caches.open(CACHE);
            await c.put(e.request, paraCache);
            return r;
          })
          .catch(() => cacheada || caches.match('./index.html'));
        return cacheada || red;
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
