/**
 * Codex Hub — push client (token save + notify via backend)
 *
 * Setup once:
 *   1) Firebase Console → Cloud Messaging → Web Push certificates → Generate key pair
 *   2) Put public key in js/fcm-config.js (CODEX_FCM_VAPID)
 *   3) Deploy firebase-messaging-sw.js at site ROOT
 *   4) Mount fcm-routes.js on Render backend
 */
(function (global) {
  "use strict";

  var API_BASE = (global.CODEX_API_BASE || "https://codex-backend-new.onrender.com").replace(/\/$/, "");
  var FRONTEND = "https://codex-hub-prime.vercel.app";

  function vapidKey() {
    return String(global.CODEX_FCM_VAPID || "").trim();
  }

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
        icon: "/assets/icons/icon-192.png"
      });
    } catch (e) {
      try {
        navigator.serviceWorker.ready.then(function (reg) {
          reg.showNotification(title || "Codex Hub", { body: body || "", tag: tag || "codex" });
        });
      } catch (e2) {}
    }
  }

  async function getIdToken() {
    var u = firebase.auth().currentUser;
    if (!u) return null;
    return await u.getIdToken();
  }

  async function registerAndSaveToken() {
    var perm = await ensurePermission();
    if (perm !== "granted") {
      throw new Error("Notification permission not granted");
    }
    var key = vapidKey();
    if (!key) {
      throw new Error("Missing VAPID key — add CODEX_FCM_VAPID in js/fcm-config.js");
    }
    if (!firebase.messaging) {
      throw new Error("firebase-messaging not loaded");
    }

    var reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;

    var messaging = firebase.messaging();
    var token = await messaging.getToken({
      vapidKey: key,
      serviceWorkerRegistration: reg
    });
    if (!token) throw new Error("No FCM token returned");

    var user = firebase.auth().currentUser;
    if (!user) throw new Error("Not signed in");

    await firebase.firestore().collection("users").doc(user.uid).set(
      {
        fcmTokens: firebase.firestore.FieldValue.arrayUnion(token),
        fcmUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        pushEnabled: true
      },
      { merge: true }
    );

    try {
      localStorage.setItem("codex_push_enabled", "1");
    } catch (e) {}

    return token;
  }

  async function notifyUser(opts) {
    opts = opts || {};
    var toUid = opts.toUid;
    if (!toUid) return { ok: false, error: "no toUid" };
    // Don't notify yourself
    try {
      if (firebase.auth().currentUser && firebase.auth().currentUser.uid === toUid) {
        return { ok: true, skipped: "self" };
      }
    } catch (e) {}

    var idToken = await getIdToken();
    if (!idToken) return { ok: false, error: "not signed in" };

    try {
      var res = await fetch(API_BASE + "/push/notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + idToken
        },
        body: JSON.stringify({
          toUid: toUid,
          title: opts.title || "Codex Hub",
          body: opts.body || "",
          url: opts.url || FRONTEND + "/app/chats.html",
          tag: opts.tag || "codex",
          type: opts.type || "generic"
        })
      });
      return await res.json();
    } catch (e) {
      console.warn("push notify", e);
      return { ok: false, error: String(e.message || e) };
    }
  }

  async function testPush() {
    var idToken = await getIdToken();
    if (!idToken) throw new Error("Not signed in");
    var res = await fetch(API_BASE + "/push/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + idToken
      },
      body: "{}"
    });
    return await res.json();
  }

  global.CodexPush = {
    ensurePermission: ensurePermission,
    localNotify: localNotify,
    registerAndSaveToken: registerAndSaveToken,
    notifyUser: notifyUser,
    testPush: testPush,
    API_BASE: API_BASE
  };
})(typeof window !== "undefined" ? window : this);
