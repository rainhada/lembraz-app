const CACHE = 'lembraz-v2';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;

  // Navegação (o próprio index.html): tenta sempre a rede primeiro, para nunca deixar
  // o usuário travado numa versão antiga do app depois de uma atualização. Só usa o
  // cache se estiver de fato offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Demais arquivos estáticos: cache primeiro (mais rápido), busca na rede e atualiza
  // o cache em segundo plano.
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// Recebe pedido da página para disparar uma notificação local (usado no modo web/PWA)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag } = event.data;
    self.registration.showNotification(title, {
      body,
      tag,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      vibrate: [100, 50, 100],
    });
  }
});

// Clique na notificação abre/foca o app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientsArr) => {
      const hadWindow = clientsArr.find((c) => c.url.includes('index.html'));
      if (hadWindow) return hadWindow.focus();
      return self.clients.openWindow('./index.html');
    })
  );
});

// Reforço para quem usa o app pelo navegador/PWA (não instalado via Capacitor): quando o
// Chrome/Android permite, tenta acordar o app periodicamente para checar pendências.
// Isso é best-effort e não é garantido pelo navegador — no app nativo (Capacitor) as
// notificações são pré-agendadas de verdade no sistema operacional e não dependem disso.
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-pendencias') {
    event.waitUntil(checkPendencias());
  }
});

async function checkPendencias() {
  const clientsArr = await self.clients.matchAll();
  clientsArr.forEach((c) => c.postMessage({ type: 'CHECK_DUE' }));
}
