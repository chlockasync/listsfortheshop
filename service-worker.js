/* ListsForTheShop v1.2.017: instant cached launches, background version checks. */
const APP_REVISION = "202611121843";
const CACHE_NAME = `listsfortheshop-v1.2.017-${APP_REVISION}`;

// Only the files needed to launch are required for a new release to activate.
// External modules are reused from the previous release's cache and cached on
// first use; a slow CDN must not hold up a service-worker upgrade.
const CORE_ASSETS = ["./index.html", "./app.js", "./styles.css", "./firebase.js"];
const OPTIONAL_ASSETS = [
  "./manifest.webmanifest", "./favicon.svg", "./icon-192.png", "./icon-512.png",
];
const EXTERNAL_MODULES = new Set([
  "https://cdn.jsdelivr.net/npm/sortablejs@1.15.7/modular/sortable.core.esm.js",
  "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js",
  "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js",
]);
const STATIC_PATHS = new Set([
  "", "index.html", "app.js", "styles.css", "firebase.js",
  "manifest.webmanifest", "favicon.svg", "icon-192.png", "icon-512.png",
]);
const CORE_PATHS = new Set(["", "index.html", "app.js", "styles.css", "firebase.js"]);

const assetURL = (path) => new URL(path, self.registration.scope).href;

async function fetchAndCache(cache, request, { bypassHTTP = false } = {}) {
  try {
    const response = await fetch(request, bypassHTTP ? { cache: "no-store" } : undefined);
    if (!response.ok && response.type !== "opaque") return null;
    await cache.put(request, response.clone());
    return response;
  } catch (_error) {
    return null;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Do not replace a functioning old release with a partially downloaded
    // one. Users can keep working offline until the new shell is available.
    await Promise.all(CORE_ASSETS.map(async (path) => {
      const request = new Request(assetURL(path), { cache: "reload" });
      const response = await fetchAndCache(cache, request, { bypassHTTP: true });
      if (!response) throw new Error(`Required update file unavailable: ${path}`);
    }));

    // These are small and can be carried from the last release when offline.
    await Promise.all(OPTIONAL_ASSETS.map(async (path) => {
      const request = new Request(assetURL(path));
      const old = await caches.match(request, { ignoreSearch: true });
      if (old) await cache.put(request, old.clone());
    }));
    await Promise.all([...EXTERNAL_MODULES].map(async (url) => {
      const request = new Request(url);
      const old = await caches.match(request);
      if (old) await cache.put(request, old.clone());
    }));

    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const oldNames = await caches.keys();
    await Promise.all(oldNames
      .filter((name) => name.startsWith("listsfortheshop-") && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

function localStaticPath(request) {
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return null;
  const path = url.pathname.slice(scope.pathname.length);
  if (request.mode === "navigate") return "";
  return STATIC_PATHS.has(path) ? path : null;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const path = localStaticPath(request);
  const external = EXTERNAL_MODULES.has(request.url);
  // Crucial: never route Firestore/Auth API calls through the asset cache.
  if (path === null && !external) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const requestURL = new URL(request.url);
    const revision = requestURL.searchParams.get("v");

    // A new HTML page controlled by an older worker can request newer assets.
    // Don't accidentally serve old code when the URL specifies a new revision.
    const differentRevision = path !== null && CORE_PATHS.has(path) &&
      revision && revision !== APP_REVISION &&
      !(path === "firebase.js" && revision === "202609021347");

    if (!differentRevision) {
      const cached = await cache.match(request) ||
        (path !== null && await cache.match(assetURL(path || "./index.html")));
      if (cached) return cached;
    }

    // Only a missing asset (or explicitly new revision) needs the network.
    const fresh = await fetchAndCache(cache, request, { bypassHTTP: differentRevision });
    if (fresh) return fresh;

    // Offline navigation uses the saved app shell, even for a deep link.
    if (request.mode === "navigate" || path === "" || path === "index.html") {
      const fallback = await cache.match(assetURL("./index.html"));
      if (fallback) return fallback;
    }
    return new Response("Offline", {
      status: 503, statusText: "Offline",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  })());
});
