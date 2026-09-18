// Nugudú Store — Service Worker
// Intercepta pedido.html para siempre servir la versión más reciente
var CACHE_NAME = 'ngd-v20260917b';
var ALWAYS_FRESH = ['pedido.html', 'crm.html'];

self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; })
             .map(function(n) { return caches.delete(n); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);
  var path = url.pathname.split('/').pop();

  // Para pedido.html y crm.html: SIEMPRE ir a la red (nunca caché)
  if (ALWAYS_FRESH.indexOf(path) >= 0) {
    e.respondWith(
      fetch(e.request).catch(function() {
        return caches.match(e.request);
      })
    );
    return;
  }

  // Para imágenes y otros assets: cache-first (rápido)
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(resp) {
        if (resp.ok) {
          var clone = resp.clone();
          caches.open(CACHE_NAME).then(function(c) { c.put(e.request, clone); });
        }
        return resp;
      });
    })
  );
});
