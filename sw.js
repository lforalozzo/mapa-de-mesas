/* Mapa de Mesas — funciona sem internet depois da primeira visita.
   Estratégia: responde do cache na hora e atualiza o cache em segundo plano
   (a versão nova aparece na próxima vez que a página for aberta). */
const CACHE = "mdm-v1";
const CORE = [
  "./", "index.html", "manifest.webmanifest",
  "assets/app.css", "assets/icon.svg", "assets/icon-192.png",
  "assets/fonts/inter.woff2", "assets/fonts/cormorant.woff2", "assets/fonts/playfair.woff2", "assets/fonts/greatvibes.woff2",
  "assets/js/core.js", "assets/js/ui.js", "assets/js/floor.js", "assets/js/plan.js", "assets/js/guests.js",
  "assets/js/views.js", "assets/js/xlsxw.js", "assets/js/io.js", "assets/js/main.js"
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
