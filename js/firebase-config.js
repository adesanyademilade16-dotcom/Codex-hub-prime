/* Loaded as a classic script so it works from file:// (Android editors). */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCd7l9eOMbO7F4TSuV55VqnaJUQbFvsibA",
  authDomain: "codex-study-hub-923c5.firebaseapp.com",
  projectId: "codex-study-hub-923c5",
  storageBucket: "codex-study-hub-923c5.appspot.com",
  messagingSenderId: "750631534625",
  appId: "1:750631534625:web:5f59e1841bb856bdbba360"
};

/**
 * Call ONCE after firebase.initializeApp().
 * - experimentalForceLongPolling: helps some NG ISP WebChannel blocks
 * - persistence: keeps last profile/chats offline (does NOT wipe cloud data)
 * Safe to call many times — only the first call does work.
 */
window.CodexFirebaseReady = function CodexFirebaseReady() {
  if (window.__CODEX_FIRESTORE_READY) {
    try { return firebase.firestore(); } catch (e) { return null; }
  }
  window.__CODEX_FIRESTORE_READY = true;

  try {
    if (!window.firebase || !firebase.apps || !firebase.apps.length) {
      if (window.FIREBASE_CONFIG) firebase.initializeApp(window.FIREBASE_CONFIG);
    }
  } catch (e0) {}

  try {
    var db = firebase.firestore();
    // ONE settings call only — always merge so we never "override host"
    try {
      db.settings({
        experimentalForceLongPolling: true,
        merge: true
      });
    } catch (eSet) {
      // Already configured by another script — ignore
    }
    // Single-tab persistence (avoids multi-tab deprecation noise).
    // Does not delete server data; only caches locally.
    try {
      db.enablePersistence({ synchronizeTabs: false }).catch(function (err) {
        // failed-precondition / unimplemented are normal
      });
    } catch (ePer) {}
    return db;
  } catch (e) {
    console.warn("CodexFirebaseReady", e);
    return null;
  }
};
