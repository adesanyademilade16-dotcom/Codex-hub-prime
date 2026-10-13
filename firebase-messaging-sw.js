/* Codex Hub FCM service worker — place at site ROOT next to index.html */
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

// Same config as js/firebase-config.js (public keys only)
firebase.initializeApp({
  apiKey: "AIzaSyCd7l9eOMbO7F4TSuV55VqnaJUQbFvsibA",
  authDomain: "codex-study-hub-923c5.firebaseapp.com",
  projectId: "codex-study-hub-923c5",
  storageBucket: "codex-study-hub-923c5.appspot.com",
  messagingSenderId: "750631534625",
  appId: "1:750631534625:web:5f59e1841bb856bdbba360"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  const title = (payload.notification && payload.notification.title) || "Codex Hub";
  const body = (payload.notification && payload.notification.body) || "New update";
  const data = payload.data || {};
  self.registration.showNotification(title, {
    body: body,
    icon: "/assets/icons/icon-192.png",
    badge: "/assets/icons/icon-192.png",
    tag: data.tag || "codex-hub",
    data: data
  });
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/app/home.html";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (const c of list) {
        if (c.url && "focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
