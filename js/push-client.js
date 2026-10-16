/**
 * Codex Hub push client — PWA-safe, default-on friendly
 * Never relies on `new Notification()` (illegal in Android installed PWA).
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
    if (typeof Notification === "undefined") return Promise.resolve();
    if (Notification.permission !== "granted") return Promise.resolve();
    var opts = {
      body: body || "",
      tag: tag || "codex",
      icon: "/assets/icons/icon-192.png",
      badge: "/assets/icons/icon-192.png"
    };
    if (!("serviceWorker" in navigator)) return Promise.resolve();
    return navigator.serviceWorker.ready
      .then(function (reg) {
        return reg.showNotification(title || "Codex Hub", opts);
      })
      .catch(function () { /* ignore */ });
  }

  async function getIdToken() {
    var u = firebase.auth().currentUser;
    if (!u) return null;
    return await u.getIdToken();
  }

  async function registerAndSaveToken() {
    var perm = await ensurePermission();
    if (perm !== "granted") {
      throw new Error("Notifications blocked. Enable them in phone Settings → Apps → Chrome/Codex Hub → Notifications.");
    }
    var key = vapidKey();
    if (!key || key.indexOf("PASTE_") === 0) {
      throw new Error("Missing VAPID key in js/fcm-config.js");
    }
    if (!firebase.messaging) throw new Error("firebase-messaging not loaded");

    var reg = await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
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
      localStorage.removeItem("codex_push_disabled");
    } catch (e) {}

    try {
      await localNotify("Codex Hub", "Notifications are on. You’ll get chat & study alerts here.", "codex-fcm-on");
    } catch (e) {}

    return token;
  }

  /** Turn off preference (does not revoke browser permission — only stops our sends preference + optional token remove) */
  async function disablePush() {
    try {
      localStorage.setItem("codex_push_enabled", "0");
      localStorage.setItem("codex_push_disabled", "1");
    } catch (e) {}
    var user = firebase.auth().currentUser;
    if (user) {
      try {
        await firebase.firestore().collection("users").doc(user.uid).set(
          { pushEnabled: false, fcmUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        );
      } catch (e) {}
    }
    return true;
  }

  async function notifyUser(opts) {
    opts = opts || {};
    var toUid = opts.toUid;
    if (!toUid) return { ok: false, error: "no toUid" };
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

  /**
   * Soft auto-enable after login (default ON).
   * Only runs if user has not explicitly turned push off.
   * Does not spam: once per session.
   */
  function autoEnableIfNeeded() {
    try {
      if (localStorage.getItem("codex_push_disabled") === "1") return;
      if (sessionStorage.getItem("codex_push_auto_done") === "1") return;
    } catch (e) {}

    if (!firebase || !firebase.auth) return;
    firebase.auth().onAuthStateChanged(function (user) {
      if (!user) return;
      try {
        if (sessionStorage.getItem("codex_push_auto_done") === "1") return;
        sessionStorage.setItem("codex_push_auto_done", "1");
      } catch (e) {}

      // Delay slightly so page scripts finish
      setTimeout(function () {
        if (!global.CodexPush || !global.CodexPush.registerAndSaveToken) return;
        // If already granted, register silently. If default, request once.
        var perm = (typeof Notification !== "undefined") ? Notification.permission : "denied";
        if (perm === "denied") return;
        global.CodexPush.registerAndSaveToken().catch(function (err) {
          console.warn("auto push", err && err.message ? err.message : err);
        });
      }, 2500);
    });
  }

  
  /** Typed push so shade shows clear source */
  async function notifyTyped(type, opts) {
    opts = opts || {};
    var titles = {
      chat_message: opts.title || "New message",
      friend_request: "Friend request",
      friend_accept: "Friend request accepted",
      group_invite: "Group invite",
      announcement: "Codex Hub announcement",
      nova_ready: "Nova · reply ready",
      admin: "Codex Hub update"
    };
    var tag = type || "codex";
    return notifyUser({
      toUid: opts.toUid,
      title: titles[type] || opts.title || "Codex Hub",
      body: opts.body || "",
      url: opts.url || "https://codex-hub-prime.vercel.app/app/home.html",
      tag: tag,
      type: type || "generic"
    });
  }

  global.CodexPush = {
    notifyTyped: notifyTyped,
    ensurePermission: ensurePermission,
    localNotify: localNotify,
    registerAndSaveToken: registerAndSaveToken,
    disablePush: disablePush,
    notifyUser: notifyUser,
    testPush: testPush,
    autoEnableIfNeeded: autoEnableIfNeeded,
    API_BASE: API_BASE
  };

  // Kick auto-enable when this script loads (home/settings/chats)
  try {
    if (document.readyState === "complete") autoEnableIfNeeded();
    else window.addEventListener("load", autoEnableIfNeeded);
  } catch (e) {}
})(typeof window !== "undefined" ? window : this);
