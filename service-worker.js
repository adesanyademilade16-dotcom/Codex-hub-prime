/* Codex Hub service worker — deliberately conservative.
 * This app is auth-gated and data-heavy (Firestore, Nova AI, PDFs, credits),
 * so we do NOT cache HTML pages, API calls, or Firebase traffic — stale
 * cached auth state or stale credit/resource data would be worse than no
 * offline support at all. All this SW does is:
 *   1) make the app installable (required for the browser's install prompt)
 *   2) cache-first the truly static shell assets (icons, fonts CSS, logo)
 *      so repeat visits feel faster on slow mobile data.
 * Everything else always goes to the network.
 */
const VERSION = "codexhub-sw-v1";
const STATIC_CACHE = VERSION + "-static";

// Resolved relative to this file's own URL (wherever it was registered from),
// so this still works whether the site sits at a domain root or a subpath
// (e.g. a GitHub Pages project page).
const PRECACHE = [
  "assets/logo.png",
  "assets/favicon.png",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "css/tokens.css",
  "css/shell.css"
].map((p) => new URL(p, self.location.href).toString());

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => {}) // never fail install over one missing asset
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== STATIC_CACHE).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

function isStaticAsset(url) {
  return /\.(png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(url.pathname) &&
    url.origin === self.location.origin;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never touch writes

  const url = new URL(req.url);

  // Never intercept Firebase/Firestore/Auth, the AI backend, or any
  // cross-origin API call — those must always hit the network live.
  if (url.origin !== self.location.origin) return;
  if (/\/chat\b|\/image-gen\b|\/api\//.test(url.pathname)) return;

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // HTML / everything else: network first, never served stale, so a signed-in
  // user never sees yesterday's page. Only used to avoid a hard offline error.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => Response.error()));
  }
});
