/* ListsForTheShop v1.2.014: prefer current app files online, retain them offline. */
const CACHE_NAME = "listsfortheshop-v1.2.014-202610311816";

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
      // Carry forward last-known-good assets before deleting the old release.
      // This also preserves CDN modules if a release installs on a poor connection.
      await Promise.allSettled(
        PRECACHE_URLS.map(async (url) => {
          const request = new Request(url, { cache: "reload" });
          const matchOptions = new URL(request.url).origin === self.location.origin
            ? { ignoreSearch: true }
            : undefined;
          const previous = await caches.match(request, matchOptions);
          if (previous) await cache.put(request, previous.clone());

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          try {
            const response = await fetch(request, { signal: controller.signal });
            if (response.ok || response.type === "opaque") {
              await cache.put(request, response.clone());
            }
          } catch (_error) {
            // The cached copy will remain available offline.
          } finally {
            clearTimeout(timeout);
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
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("listsfortheshop-") && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      );
      // Existing pages listen for controllerchange and reload once. Do not
      // additionally navigate clients here: two competing reloads can occur.
      await self.clients.claim();
    })(),
  );
});

const APP_SHELL_PATHS = new Set(["", "index.html", "styles.css", "app.js", "firebase.js"]);

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

function isAppShellRequest(request) {
  if (!isSameOrigin(request)) return false;
  if (request.mode === "navigate") return true;

  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return false;
  const localPath = url.pathname.slice(scope.pathname.length);
  return APP_SHELL_PATHS.has(localPath);
}

async function fetchAndStore(cache, request, fresh) {
  try {
    // Bypass the browser HTTP cache for the HTML, CSS and JavaScript shell.
    // GitHub Pages and installed PWAs can otherwise keep reusing old files.
    const response = await fetch(request, fresh ? { cache: "no-store" } : undefined);
    if (response.ok || response.type === "opaque") {
      await cache.put(request, response.clone());
      return response;
    }
    // Retain a usable cached copy if a deployment temporarily returns 404/5xx.
    return null;
  } catch (_error) {
    return null;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  event.respondWith(
    (async () => {
      // Always read only THIS release's cache, not older release caches.
      const cache = await caches.open(CACHE_NAME);
      const matchOptions = isSameOrigin(request) ? { ignoreSearch: true } : undefined;
      const cached = await cache.match(request, matchOptions);

      if (isAppShellRequest(request)) {
        // Network-first keeps the UI coherent on every online open/refresh;
        // cached copies provide a fully functional offline fallback.
        const fresh = await fetchAndStore(cache, request, true);
        if (fresh) return fresh;
        if (cached) return cached;
      } else {
        // External libraries, icons and manifests stay fast and offline-ready.
        if (cached) {
          event.waitUntil(fetchAndStore(cache, request, false));
          return cached;
        }
        const fresh = await fetchAndStore(cache, request, false);
        if (fresh) return fresh;
      }

      if (request.mode === "navigate") {
        const fallback = await cache.match("./index.html", { ignoreSearch: true });
        if (fallback) return fallback;
      }
      return new Response("Offline", {
        status: 503,
        statusText: "Offline",
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    })(),
  );
});
