/* JAC-KNES · Service worker: guarda solo el "cascarón" de la app para que abra rápido.
   Los datos (pedidos a la API de Apps Script) nunca se guardan aquí: siempre van en vivo a la red. */
var VERSION = 'jacknes-v3';
var CASCARON = [
  './', 'index.html', 'styles.css', 'config.js', 'backend.js', 'ui.js', 'pwa.js', 'manifest.webmanifest',
  'img/logo.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png', 'icons/favicon-32.png'
];
self.addEventListener('install', function(e){
  e.waitUntil(caches.open(VERSION).then(function(c){ return c.addAll(CASCARON); }).then(function(){ return self.skipWaiting(); }));
});
self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){ return k !== VERSION; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener('fetch', function(e){
  var req = e.request, url = new URL(req.url);
  // La API (script.google.com / googleusercontent.com) y todo lo que no sea GET del mismo sitio: directo a la red.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (/script\.google(usercontent)?\.com|googleusercontent\.com/.test(url.hostname)) return;
  // Rápido desde caché y se actualiza por detrás (stale-while-revalidate).
  e.respondWith(caches.open(VERSION).then(function(c){
    return c.match(req, { ignoreSearch: true }).then(function(hit){
      var red = fetch(req).then(function(r){ if (r && r.ok) c.put(req, r.clone()); return r; }).catch(function(){ return hit; });
      return hit || red;
    });
  }));
});
