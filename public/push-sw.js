self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'HWPerÃº Asistencia';
  const options = {
    body: payload.body || '',
    data: payload.data || { url: '/' },
    badge: '/favicon.png',
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
