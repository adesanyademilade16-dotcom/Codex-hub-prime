/* Codex Hub — auth retry + friendly error messages.
 *
 * "auth/network-request-failed" / "auth/timeout" mean the SIGN-IN request
 * itself (to Google's identitytoolkit servers) didn't get a response — this
 * is separate from the Firestore long-polling fix (js/firestore-boot.js),
 * which only helps Firestore reads/writes, not the Auth SDK's own network
 * calls. On a flaky connection this is often transient: the exact same
 * request often succeeds a second later. So instead of showing an error
 * immediately, we quietly retry (with a short backoff) before telling the
 * user anything went wrong.
 */
(function (w) {
  "use strict";

  var TRANSIENT_CODES = {
    "auth/network-request-failed": true,
    "auth/timeout": true,
    "auth/internal-error": true
  };

  var FRIENDLY = {
    "auth/invalid-credential": "Wrong email or password.",
    "auth/user-not-found": "No account with that email.",
    "auth/wrong-password": "Wrong password.",
    "auth/too-many-requests": "Too many attempts. Wait a bit and try again.",
    "auth/invalid-email": "That email looks invalid.",
    "auth/email-already-in-use": "An account already uses that email.",
    "auth/weak-password": "Choose a stronger password (at least 6 characters).",
    "auth/popup-closed-by-user": "", // not a real error — user just closed it
    "auth/network-request-failed": "Can't reach the login server right now (common on some networks). Check your data/Wi-Fi, or try again in a few seconds — your account data is safe, nothing was lost.",
    "auth/timeout": "That took too long on this connection. Please try again.",
    "auth/internal-error": "Something went wrong on our end. Please try again."
  };

  function friendlyMessage(err, fallback) {
    if (!err) return fallback || "Something went wrong.";
    if (FRIENDLY.hasOwnProperty(err.code)) return FRIENDLY[err.code];
    return err.message || fallback || "Something went wrong.";
  }

  function wait(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }

  /** Run a Firebase Auth call (fn must return the promise, so it can be
   *  re-invoked). On a transient network error, retries with a short
   *  backoff before giving up. Default: 2 retries (3 attempts total) at
   *  900ms / 1800ms, which covers the "works 20s later" pattern students
   *  were hitting manually. */
  function run(fn, opts) {
    opts = opts || {};
    var retries = opts.retries != null ? opts.retries : 2;
    var delay = opts.delay != null ? opts.delay : 900;
    function attempt(n, d) {
      return fn().catch(function (err) {
        if (n > 0 && err && TRANSIENT_CODES[err.code]) {
          return wait(d).then(function () { return attempt(n - 1, d * 2); });
        }
        throw err;
      });
    }
    return attempt(retries, delay);
  }

  w.CodexAuthRetry = { run: run, friendlyMessage: friendlyMessage };
})(window);
