/**
 * Codex Hub push helpers (local + FCM token save).
 * Full "WhatsApp-style" delivery when the app is closed needs:
 *  1) This client saving fcmTokens on the user doc
 *  2) Backend (or Cloud Function) sending FCM when chat/friend/nova events happen
 */
(function (global) {
  "use strict";

  async function ensurePermission() {
    if (!("Notification" in window)) return "denied";
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    return await Notification.requestPermission();
  }

  function localNotify(title, body, tag) {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    try {
      new Notification(title || "Codex Hub", {
        body: body || "",
        tag: tag || "codex",
        icon: "../assets/icons/icon-192.png"
      });
    } catch (e) {
      try {
        navigator.serviceWorker.ready.then(function (reg) {
          reg.showNotification(title || "Codex Hub", { body: body || "", tag: tag || "codex" });
        });
      } catch (e2) {}
    }
  }

  async function saveTokenIfPossible(uid) {
    if (!uid || !firebase || !firebase.messaging) return null;
    try {
      const messaging = firebase.messaging();
      // VAPID key from Firebase Console → Project settings → Cloud Messaging → Web Push certificates
      const vapid = (window.CODEX_FCM_VAPID || "").trim();
      const token = vapid
        ? await messaging.getToken({ vapidKey: vapid, serviceWorkerRegistration: await navigator.serviceWorker.register("/firebase-messaging-sw.js") })
        : null;
      if (!token) return null;
      await firebase.firestore().collection("users").doc(uid).set({
        fcmTokens: firebase.firestore.FieldValue.arrayUnion(token),
        fcmUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return token;
    } catch (e) {
      console.warn("FCM token", e);
      return null;
    }
  }

  global.CodexPush = {
    ensurePermission: ensurePermission,
    localNotify: localNotify,
    saveTokenIfPossible: saveTokenIfPossible
  };
})(typeof window !== "undefined" ? window : this);
