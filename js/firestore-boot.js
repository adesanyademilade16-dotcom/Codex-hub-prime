/* Codex Hub — Firestore network resilience boot.
 *
 * Why this exists: Firestore's default transport (WebChannel, basically a
 * websocket) gets silently dropped or badly routed by several Nigerian ISPs
 * (MTN/Airtel/Glo), which is what produces:
 *   "Could not reach Cloud Firestore backend... FirebaseError:
 *    [code=unavailable]: Failed to get document because the client is offline."
 * — even though the rest of the internet (WhatsApp, browsing) works fine.
 * A VPN "fixes" it only because it changes the route. Long-polling is a
 * plainer HTTP transport that survives that bad routing for most users.
 *
 * This MUST run before anything else touches firebase.firestore(), so it's
 * loaded right after the firebase-firestore-compat.js SDK tag on every page,
 * before that page's own init code. It owns calling firebase.initializeApp()
 * for exactly that reason — every page's own
 * `if (!firebase.apps.length) firebase.initializeApp(...)` already guards
 * against double-init, so this just needs to win the race to go first.
 */
(function (w) {
  "use strict";
  if (w.__codexFirestoreBooted) return;
  w.__codexFirestoreBooted = true;

  if (!w.firebase || !w.FIREBASE_CONFIG) {
    // firebase-config.js or the SDK itself hasn't loaded yet — nothing to
    // configure. Each page's own init code still runs as a fallback, just
    // without the long-polling fix.
    return;
  }

  try {
    if (!w.firebase.apps.length) {
      w.firebase.initializeApp(w.FIREBASE_CONFIG);
    }
    if (w.firebase.firestore) {
      var db = w.firebase.firestore();
      db.settings({
        experimentalForceLongPolling: true, // survives ISP routing that blocks WebChannel
        useFetchStreams: false,
        merge: true
      });
      // Cached reads work instantly even mid-reconnect, and writes queue
      // until the connection comes back, instead of throwing "offline".
      db.enablePersistence({ synchronizeTabs: true }).catch(function (err) {
        // failed-precondition = another tab already has persistence open;
        // unimplemented = old/private browser. Both are fine to ignore —
        // the long-polling fix above is what actually matters most.
        console.log("Firestore persistence not enabled:", err && err.code);
      });
    }
  } catch (e) {
    console.log("firestore-boot:", e && e.message);
  }
})(window);
