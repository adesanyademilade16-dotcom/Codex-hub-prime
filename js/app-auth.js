/* Classic script — works on file://.
   requireUser() redirects when not signed in / incomplete profile /
   email not verified (password accounts only — Google is trusted). */
(function (w) {
  "use strict";
  if (!w.firebase || !w.FIREBASE_CONFIG) {
    console.error("CodexAuth: load firebase compat + firebase-config.js first");
    return;
  }
  if (!w.firebase.apps.length) {
    w.firebase.initializeApp(w.FIREBASE_CONFIG);
  }
  // Exactly once — see firebase-config.js (long polling + cache). Never call settings() again here.
  if (typeof w.CodexFirebaseReady === "function") {
    try { w.CodexFirebaseReady(); } catch (eFs) { console.warn(eFs); }
  }
  var auth = w.firebase.auth();
  var db = w.firebase.firestore();
  try { auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); } catch (ePer) {}

  function isPasswordUser(user) {
    if (!user) return false;
    var providers = user.providerData || [];
    for (var i = 0; i < providers.length; i++) {
      if (providers[i] && providers[i].providerId === "password") return true;
    }
    // legacy: no providerData but has email
    if (!providers.length && user.email) return true;
    return false;
  }

  function needsEmailVerification(user, profile) {
    if (!user) return false;
    if (user.emailVerified) return false;
    if (profile && profile.emailVerifiedApp) return false;
    // Google / OAuth always OK
    var providers = user.providerData || [];
    var hasGoogle = providers.some(function (p) { return p && p.providerId === "google.com"; });
    if (hasGoogle && !isPasswordUser(user)) return false;
    if (isPasswordUser(user)) return true;
    return false;
  }

  function verifyPageUrl() {
    var path = (location.pathname || "").replace(/\/g, "/");
    // From /app/* use app/verify-email.html (same folder as home.html)
    if (path.indexOf("/app/") >= 0) return "verify-email.html";
    // From login/signup at project root
    return "verify-email.html";
  }

  function requireUser(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      auth.onAuthStateChanged(function (user) {
        if (!user) {
          location.href = opts.loginUrl || (location.pathname.indexOf("/app/") >= 0 ? "../login.html" : "login.html");
          return;
        }
        // Soft-reload verification status
        user.reload().then(function () {
          return db.collection("users").doc(user.uid).get()
            .then(function (snap) {
              var profile = snap.exists
                ? snap.data()
                : { fullName: user.displayName || "Student" };
              if (!opts.allowUnverified && needsEmailVerification(auth.currentUser || user, profile)) {
                var vp = verifyPageUrl();
                // from /app/ pages verify-email is same folder; from root too
                location.href = vp;
                return;
              }
              if (!opts.skipFaculty && (!profile.faculty || !profile.department || !profile.level)) {
                location.href = location.pathname.indexOf("/app/") >= 0 ? "../chooseFaculty.html" : "chooseFaculty.html";
                return;
              }
              resolve({ user: auth.currentUser || user, profile: profile, auth: auth, db: db });
            });
        }).catch(function (err) {
          console.error(err);
          if (!opts.allowUnverified && needsEmailVerification(user)) {
            location.href = verifyPageUrl();
            return;
          }
          db.collection("users").doc(user.uid).get()
            .then(function (snap) {
              var profile = snap.exists ? snap.data() : { fullName: user.displayName || "Student" };
              resolve({ user: user, profile: profile, auth: auth, db: db });
            })
            .catch(function () {
              resolve({
                user: user,
                profile: { fullName: user.displayName || "Student" },
                auth: auth,
                db: db
              });
            });
        });
      });
    });
  }

    try {
    var p = location.pathname || "";
    if (p.indexOf("/app/") >= 0 && p.indexOf("login") < 0) {
      localStorage.setItem("codex_last_route", location.pathname + location.search);
    }
  } catch (eR) {}
  w.CodexAuth = {
    auth: auth,
    db: db,
    requireUser: requireUser,
    isPasswordUser: isPasswordUser,
    needsEmailVerification: needsEmailVerification
  };
})(window);
