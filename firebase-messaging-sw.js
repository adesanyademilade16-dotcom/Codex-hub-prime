/* Codex Hub FCM service worker — MUST live at site ROOT (same folder as index.html) */
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

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
  const n = (payload && payload.notification) || {};
  const d = (payload && payload.data) || {};
  const title = n.title || d.title || "Codex Hub";
  const body = n.body || d.body || "New update";
  const options = {
    body: body,
    icon: "/assets/icons/icon-192.png",
    badge: "/assets/icons/icon-192.png",
    tag: d.tag || "codex-hub",
    data: d,
    renotify: true
  };
  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var path = (event.notification.data && event.notification.data.url) || "/app/chats.html";
  if (path.indexOf("http") !== 0) {
    path = self.location.origin + (path.charAt(0) === "/" ? path : "/" + path);
  }
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url && "focus" in c) {
          try { c.navigate(path); } catch (e) {}
          return c.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(path);
    })
  );
});
