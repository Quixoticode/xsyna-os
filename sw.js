const CACHE_NAME = "xsyna-v4";
const OFFLINE_URLS = [
  "/",
  "/index.html",
  "/docs/",
  "/docs/index.html",
  "/auth/",
  "/auth/index.html",
  "/internal-services/",
  "/internal-services/index.html",
  "/track/",
  "/track/index.html",
  "/src/index.css",
  "/src/main.js",
  "/src/docs.js",
  "/src/auth.js",
  "/src/internal.js",
  "/src/track.js",
  "/src/js/ui.js",
  "/src/js/supabase.js",
  "/src/js/supabase-db.js",
  "/src/js/neural-bg.js",
  "/src/js/sw-register.js",
  "/xyna-logo.svg",
  "/xsyn-icon.svg",
  "/synai-icon.svg",
  "/xs-labs-icon.svg",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(OFFLINE_URLS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Skip external CDN resources and Supabase API
  if (!url.pathname.startsWith("/")) return;
  if (url.host.includes("supabase.co") || url.host.includes("esm.sh")) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== "basic") {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        })
        .catch(() => {
          if (url.pathname.startsWith("/internal-services")) {
            return caches.match("/internal-services/index.html");
          }
          if (url.pathname.startsWith("/docs")) {
            return caches.match("/docs/index.html");
          }
          if (url.pathname.startsWith("/auth")) {
            return caches.match("/auth/index.html");
          }
          if (url.pathname.startsWith("/track")) {
            return caches.match("/track/index.html");
          }
          return caches.match("/index.html");
        });
    })
  );
});
