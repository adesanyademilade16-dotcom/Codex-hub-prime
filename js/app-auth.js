/* CodexAuth — persistent session + requireUser gate
   Keeps students signed in across PWA close/reopen (LOCAL persistence).
*/
(function (w) {
  "use strict";
  if (!w.firebase || !w.FIREBASE_CONFIG) {
    console.error("CodexAuth: load firebase compat + firebase-config.js first");
    return;
  }
  if (!w.firebase.apps.length) {
    w.firebase.initializeApp(w.FIREBASE_CONFIG);
  }
  var auth = w.firebase.auth();
  var db = w.firebase.firestore();

  // CRITICAL: survive app close / phone restart
  try {
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function (e) {
      console.warn("setPersistence", e);
    });
  } catch (e0) {
    console.warn("setPersistence", e0);
  }

  function isPasswordUser(user) {
    if (!user) return false;
    var providers = user.providerData || [];
    for (var i = 0; i < providers.length; i++) {
      if (providers[i] && providers[i].providerId === "password") return true;
    }
    if (!providers.length && user.email) return true;
    return false;
  }

  function needsEmailVerification(user) {
    if (!user) return false;
    if (user.emailVerified) return false;
    var providers = user.providerData || [];
    var hasGoogle = providers.some(function (p) { return p && p.providerId === "google.com"; });
    if (hasGoogle && !isPasswordUser(user)) return false;
    if (isPasswordUser(user)) return true;
    return false;
  }

  function verifyPageUrl() {
    var path = (location.pathname || "").replace(/\\/g, "/");
    if (path.indexOf("/app/") >= 0) return "../verify-email.html";
    return "verify-email.html";
  }

  function loginPageUrl() {
    return location.pathname.indexOf("/app/") >= 0 ? "../login.html" : "login.html";
  }

  function facultyPageUrl() {
    return location.pathname.indexOf("/app/") >= 0 ? "../chooseFaculty.html" : "chooseFaculty.html";
  }

  /**
   * Wait until Firebase restores session from IndexedDB (not a premature null).
   */
  function whenAuthReady() {
    return new Promise(function (resolve) {
      // Firebase fires onAuthStateChanged once state is known
      var unsub = auth.onAuthStateChanged(function (user) {
        try { unsub(); } catch (e) {}
        resolve(user);
      });
    });
  }

  function requireUser(opts) {
    opts = opts || {};
    return whenAuthReady().then(function (user) {
      if (!user) {
        location.href = opts.loginUrl || loginPageUrl();
        return new Promise(function () {}); // hang navigation
      }
      return user.reload().then(function () {
        var u = auth.currentUser || user;
        if (!opts.allowUnverified && needsEmailVerification(u)) {
          location.href = verifyPageUrl();
          return new Promise(function () {});
        }
        return db.collection("users").doc(u.uid).get().then(function (snap) {
          var profile = snap.exists
            ? snap.data()
            : { fullName: u.displayName || "Student" };
          // Prefer Firestore emailVerified mirror if Auth lagging after Brevo
          if (
            !opts.allowUnverified &&
            needsEmailVerification(u) === false &&
            profile.emailVerified === false &&
            isPasswordUser(u) &&
            !u.emailVerified
          ) {
            /* already handled above */
          }
          if (!opts.skipFaculty && (!profile.faculty || !profile.department || !profile.level)) {
            location.href = facultyPageUrl();
            return new Promise(function () {});
          }
          return { user: u, profile: profile, auth: auth, db: db };
        });
      }).catch(function (err) {
        console.error(err);
        var u = auth.currentUser || user;
        if (!opts.allowUnverified && needsEmailVerification(u)) {
          location.href = verifyPageUrl();
          return new Promise(function () {});
        }
        return db.collection("users").doc(u.uid).get()
          .then(function (snap) {
            var profile = snap.exists ? snap.data() : { fullName: u.displayName || "Student" };
            return { user: u, profile: profile, auth: auth, db: db };
          })
          .catch(function () {
            return {
              user: u,
              profile: { fullName: u.displayName || "Student" },
              auth: auth,
              db: db
            };
          });
      });
    });
  }

  w.CodexAuth = {
    auth: auth,
    db: db,
    requireUser: requireUser,
    whenAuthReady: whenAuthReady,
    isPasswordUser: isPasswordUser,
    needsEmailVerification: needsEmailVerification
  };
})(window);
