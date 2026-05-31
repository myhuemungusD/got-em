const CACHE = "streetdice-v2";

self.addEventListener("install", () => {
  // Don't precache — Vite emits hashed asset URLs we can't know at SW-build
  // time. Assets are cached on first fetch (cache-first below); navigations
  // go network-first so new deploys aren't held back by stale cached HTML.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Never intercept cross-origin (Firestore, fonts CDN, QR CDN).
  if (url.origin !== self.location.origin) return;

  const isNavigation =
    req.mode === "navigate" || req.destination === "document";

  if (isNavigation) {
    // Network-first for HTML so new deploys are picked up immediately;
    // fall back to the cached navigation (then /index.html) when offline.
    event.respondWith(
      fetch(req)
        .then((resp) => {
          if (resp.ok) {
            const copy = resp.clone();
            caches
              .open(CACHE)
              .then((c) => c.put(req, copy))
              .catch(() => undefined);
          }
          return resp;
        })
        .catch(() =>
          caches
            .match(req)
            .then((hit) => hit ?? caches.match("/index.html"))
            .then((hit) => hit ?? Response.error()),
        ),
    );
    return;
  }

  // Hashed assets: cache-first with runtime fill. Content-hashed URLs mean a
  // new deploy emits new filenames, so a stale entry can never shadow the
  // new bundle — the new HTML simply asks for URLs that aren't in cache.
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((resp) => {
          if (resp.ok && resp.type === "basic") {
            const copy = resp.clone();
            caches
              .open(CACHE)
              .then((c) => c.put(req, copy))
              .catch(() => undefined);
          }
          return resp;
        })
        .catch(() => Response.error());
    }),
  );
});
