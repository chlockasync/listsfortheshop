const CACHE_NAME = "listsfortheshop-v1.2.000-202610301200";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./firebase.js",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "https://cdn.jsdelivr.net/npm/sortablejs@1.15.7/modular/sortable.core.esm.js",
  "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js",
  "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      /* A third-party CDN being temporarily unavailable must not prevent the
       * service worker itself from installing. Each asset is cached
       * independently and will also be captured by the fetch handler later. */
      await Promise.allSettled(
        PRECACHE_URLS.map(async (url) => {
          const request = new Request(url, { cache: "reload" });
          const response = await fetch(request);

          if (response.ok || response.type === "opaque") {
            await cache.put(request, response.clone());
          }
        }),
      );

      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(
            (name) =>
              name.startsWith("listsfortheshop-") && name !== CACHE_NAME,
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();

      /* A newly deployed worker must not leave an already-open installed PWA
       * running the previous cached app.js. Refresh controlled windows once
       * after activation so the matching app shell is loaded immediately. */
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      await Promise.allSettled(
        windowClients.map((client) => client.navigate(client.url)),
      );
    })(),
  );
});

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

function cacheMatchOptions(request) {
  return isSameOrigin(request) ? { ignoreSearch: true } : undefined;
}

async function updateCachedResponse(request) {
  try {
    const response = await fetch(request);

    if (response.ok || response.type === "opaque") {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    return null;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request, cacheMatchOptions(request));

      /* The app shell and already-used Firebase/CDN modules are served from
       * cache immediately. A network refresh happens in the background, so
       * launching the installed PWA does not wait for GitHub Pages or a CDN. */
      if (cached) {
        event.waitUntil(updateCachedResponse(request));
        return cached;
      }

      const networkResponse = await updateCachedResponse(request);

      if (networkResponse) {
        return networkResponse;
      }

      if (request.mode === "navigate") {
        const fallback = await caches.match("./index.html", {
          ignoreSearch: true,
        });

        if (fallback) {
          return fallback;
        }
      }

      return new Response("Offline", {
        status: 503,
        statusText: "Offline",
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    })(),
  );
});
