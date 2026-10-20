/* Codex Hub — ONE service worker for the whole site (scope "/").
 *
 * Why one: the app used to register service-worker.js AND
 * firebase-messaging-sw.js on the same scope. The browser keeps only one per
 * scope, so every page load silently replaced the push worker and offline
 * notifications (chats, announcements, Nova replies) stopped arriving.
 *
 * This file now does both jobs:
 *   1) Push notifications (FCM) — works when the app is closed
 *   2) Speed: static files (icons, CSS, JS) are served instantly from cache and
 *      refreshed in the background. Static HTML shells are cached; Firebase and Nova API data stay live.
 */
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

const VERSION = "codexhub-sw-v4";
const STATIC_CACHE = VERSION + "-static";

firebase.initializeApp({
  apiKey: "AIzaSyCd7l9eOMbO7F4TSuV55VqnaJUQbFvsibA",
  authDomain: "codex-study-hub-923c5.firebaseapp.com",
  projectId: "codex-study-hub-923c5",
  storageBucket: "codex-study-hub-923c5.appspot.com",
  messagingSenderId: "750631534625",
  appId: "1:750631534625:web:5f59e1841bb856bdbba360"
});
const messaging = firebase.messaging();

// FCM shows `notification` payloads by itself. Only draw manually for
// data-only messages, otherwise students get every notification twice.
messaging.onBackgroundMessage(function (payload) {
  if (payload && payload.notification) return;
  const d = (payload && payload.data) || {};
  return self.registration.showNotification(d.title || "Codex Hub", {
    body: d.body || "New update",
    icon: "/assets/icons/icon-192.png",
    badge: "/assets/icons/icon-192.png",
    tag: d.tag || "codex-hub",
    data: d,
    renotify: true,
    vibrate: [80, 40, 80]
  });
});

function cleanPath(p) {
  // old links → clean URLs (/app/chats.html → /chats)
  return String(p || "/chats").replace(/^\/?app\/([A-Za-z0-9_-]+)\.html/, "/$1");
}

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const d = event.notification.data || {};
  const fcm = d.FCM_MSG && d.FCM_MSG.notification && d.FCM_MSG.notification.click_action;
  let path = d.url || fcm || "/chats";
  try {
    const u = new URL(path, self.location.origin);
    path = u.origin === self.location.origin ? self.location.origin + cleanPath(u.pathname) + u.search + u.hash : self.location.origin + "/home";
  } catch (e) {
    path = self.location.origin + "/home";
  }
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (const c of list) {
        if (c.url && c.url.indexOf(self.location.origin) === 0 && "focus" in c) {
          return c.focus().then(function (fc) { try { return (fc || c).navigate(path); } catch (e) {} });
        }
      }
      if (clients.openWindow) return clients.openWindow(path);
    })
  );
});

const PRECACHE = [
  "/assets/logo.png",
  "/assets/favicon.png",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/css/tokens.css",
  "/css/shell.css",
  "/css/components.css",
  "/js/theme-boot.js",
  "/js/firebase-config.js",
  "/js/shell.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      Promise.all(PRECACHE.map((u) => cache.add(u).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith("codexhub-sw-") && n !== STATIC_CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

function isStatic(url) {
  if (url.origin !== self.location.origin) {
    // Firebase SDK files are versioned & immutable → safe to cache
    return url.hostname === "www.gstatic.com" && /\/firebasejs\/\d/.test(url.pathname);
  }
  if (url.pathname === "/service-worker.js" || url.pathname === "/firebase-messaging-sw.js") return false;
  return /\.(png|jpg|jpeg|webp|svg|ico|woff2?|css|js|mp4)$/i.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.headers.get("range")) return; // video seeking

  if (req.mode === "navigate" && url.origin === self.location.origin) {
    // Only public static page shells; never API or user-data responses.
    if (/^\/(api|auth)\//.test(url.pathname)) return;
    const response = caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const refresh = fetch(req).then(async (res) => {
        if (res.ok && !res.redirected && /text\/html/i.test(res.headers.get("content-type") || "")) {
          await cache.put(req, res.clone());
        }
        return res;
      });
      event.waitUntil(refresh.then(() => {}).catch(() => {}));
      if (cached) return cached;
      return refresh;
    });
    event.respondWith(response);
    return;
  }

  if (isStatic(url)) {
    // stale-while-revalidate: instant from cache, refresh in background
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          const net = fetch(req).then((res) => {
            if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
            return res;
          }).catch(() => cached);
          return cached || net;
        })
      )
    );
    return;
  }
  // Firebase, Nova API: always live; no account data stored in page cache.
});
