/* Codex Hub Prime — referral codes and invite registration.
 * Referral rewards are intentionally NOT automatic. Admin reviews confirmed
 * links and awards CBT trials from the protected admin area.
 */
(function (window) {
  "use strict";
  if (window.CodexReferrals) return;

  function db() {
    if (!window.firebase || !firebase.firestore) throw new Error("Firebase is not ready");
    return firebase.firestore();
  }
  function cleanCode(value) {
    return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  }
  function randomPart() {
    var bytes = new Uint8Array(5);
    try {
      if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
      else for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    } catch (e) {
      for (var j = 0; j < bytes.length; j++) bytes[j] = Math.floor(Math.random() * 256);
    }
    return Array.prototype.map.call(bytes, function (b) { return (b % 36).toString(36); }).join("").toUpperCase();
  }
  function makeCode() { return "HUB-" + randomPart(); }

  function ensureReferralCode(user) {
    if (!user || !user.uid) return Promise.reject(new Error("Sign in before creating a referral code"));
    var firestore = db();
    var userRef = firestore.collection("users").doc(user.uid);
    return userRef.get().then(function (userSnap) {
      var existing = cleanCode(userSnap.exists && userSnap.data().referralCode);
      if (existing && /^HUB-[A-Z0-9]{5}$/.test(existing)) {
        return firestore.collection("referral_codes").doc(existing).get().then(function (codeSnap) {
          if (codeSnap.exists && codeSnap.data().uid === user.uid) return existing;
          // A profile value without its matching registry entry is repaired below.
          return createUniqueCode(user, userRef, firestore);
        });
      }
      return createUniqueCode(user, userRef, firestore);
    });
  }

  function createUniqueCode(user, userRef, firestore) {
    var codes = firestore.collection("referral_codes");
    var attempts = 0;
    function attempt() {
      if (++attempts > 8) return Promise.reject(new Error("Could not allocate a unique referral code. Please try again."));
      var code = makeCode();
      var codeRef = codes.doc(code);
      return firestore.runTransaction(function (tx) {
        return tx.get(codeRef).then(function (snap) {
          if (snap.exists) return false;
          tx.set(codeRef, {
            uid: user.uid,
            code: code,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          tx.set(userRef, {
            referralCode: code,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
          return true;
        });
      }).then(function (created) { return created ? code : attempt(); });
    }
    return attempt();
  }

  function registerReferral(user, inputCode) {
    if (!user || !user.uid) return Promise.reject(new Error("Sign in before applying a referral code"));
    var code = cleanCode(inputCode);
    if (!code) return Promise.resolve({ skipped: true, reason: "no_code" });
    if (!/^HUB-[A-Z0-9]{5}$/.test(code)) return Promise.reject(new Error("That referral code format is not valid."));

    var firestore = db();
    var codeRef = firestore.collection("referral_codes").doc(code);
    var referralRef = firestore.collection("referrals").doc(user.uid);
    return firestore.runTransaction(function (tx) {
      return Promise.all([tx.get(codeRef), tx.get(referralRef)]).then(function (snaps) {
        var codeSnap = snaps[0], referralSnap = snaps[1];
        if (referralSnap.exists) {
          var prior = referralSnap.data() || {};
          if (prior.referralCode === code) return { alreadyRegistered: true };
          return { alreadyRegistered: true, ignoredDifferentCode: true };
        }
        if (!codeSnap.exists) throw new Error("Referral code not found. Check the code and try again.");
        var owner = codeSnap.data() || {};
        if (!owner.uid) throw new Error("This referral code is not valid.");
        if (owner.uid === user.uid) throw new Error("You cannot use your own referral code.");
        tx.set(referralRef, {
          referredUid: user.uid,
          referredName: user.displayName || "",
          referredEmail: user.email || "",
          referrerUid: owner.uid,
          referralCode: code,
          status: "confirmed",
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return { registered: true, referrerUid: owner.uid };
      });
    });
  }

  function getReferralStats(uid) {
    if (!uid) return Promise.resolve({ count: 0, referrals: [] });
    return db().collection("referrals").where("referrerUid", "==", uid).get().then(function (snap) {
      var rows = [];
      snap.forEach(function (doc) {
        var d = doc.data() || {};
        if (d.status === "confirmed") rows.push(Object.assign({ id: doc.id }, d));
      });
      return { count: rows.length, referrals: rows };
    });
  }

  window.CodexReferrals = {
    ensureReferralCode: ensureReferralCode,
    registerReferral: registerReferral,
    getReferralStats: getReferralStats,
    normalizeCode: cleanCode
  };
})(window);
