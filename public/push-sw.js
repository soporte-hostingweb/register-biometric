// La pantalla con el logo que Android pone al abrir la app instalada dura hasta que llega la
// primera página. Guardando la app en el teléfono, abre sin esperar a la red y ese logo
// apenas se ve.
//  - Páginas: se sirven al instante desde el teléfono y, en paralelo, se pide la versión nueva.
//    Si cambió, la página avisa con el banner "Actualizar" (ver +html.tsx).
//  - /_expo/static y /assets llevan hash en el nombre: nunca cambian, se guardan para siempre.
//  - Todo lo demás (y la API, que está en otro dominio) va siempre a la red.
const CACHE_PAGINAS = 'hwperu-paginas-v1';
const CACHE_ESTATICOS = 'hwperu-estaticos-v1';
const CACHES_VIGENTES = [CACHE_PAGINAS, CACHE_ESTATICOS];

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(nombres.filter((n) => !CACHES_VIGENTES.includes(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

async function paginaRapida(request) {
  const cache = await caches.open(CACHE_PAGINAS);
  const desdeRed = fetch(request)
    .then((respuesta) => {
      if (respuesta.ok && !respuesta.redirected) cache.put(request, respuesta.clone());
      return respuesta;
    });
  const guardada = await cache.match(request, { ignoreSearch: true });
  if (guardada) {
    desdeRed.catch(() => {});
    return guardada;
  }
  return desdeRed;
}

async function estaticoPermanente(request) {
  const cache = await caches.open(CACHE_ESTATICOS);
  const guardado = await cache.match(request);
  if (guardado) return guardado;
  const respuesta = await fetch(request);
  if (respuesta.ok) cache.put(request, respuesta.clone());
  return respuesta;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(paginaRapida(request));
    return;
  }
  if (url.pathname.startsWith('/_expo/static/') || url.pathname.startsWith('/assets/')) {
    event.respondWith(estaticoPermanente(request));
    return;
  }
  event.respondWith(fetch(request));
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'HWPerú Asistencia';
  const options = {
    body: payload.body || '',
    data: payload.data || { url: '/' },
    icon: '/icons/notification-icon-v5.png',
    badge: '/icons/notification-badge-v5.png',
    tag: payload.tag || 'hwperu-asistencia',
    renotify: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const existingWindow = windows.find((client) => client.url.startsWith(self.location.origin));
      if (existingWindow) {
        existingWindow.navigate(targetUrl);
        return existingWindow.focus();
      }
      return clients.openWindow(targetUrl);
    })
  );
});
