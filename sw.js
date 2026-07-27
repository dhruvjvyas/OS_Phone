/* sw.js — offline shell + notification plumbing.
   NETWORK-FIRST for the shell; /api/* is never cached (it must reach
   the live serverless function each time). */

const CACHE = "osp-shell-v4";
const SHELL = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/timewords.js",
  "./js/store.js",
  "./js/unlock.js",
  "./js/overlays.js",
  "./js/oversmart-ai.js",
  "./js/app.js",
  "./manifest.webmanifest",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;                 // POSTs to /api pass through
  if (new URL(e.request.url).pathname.startsWith("/api/")) return; // never cache the AI
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window" }).then((list) => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      return clients.openWindow("./");
    })
  );
});
