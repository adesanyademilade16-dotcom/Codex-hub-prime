/**
 * Codex Hub — daily quota (Nova Charge + Study Lab pages)
 * Units reset at local midnight. Mirrored to users/{uid} best-effort.
 */
(function (w) {
  "use strict";

  /** Daily Nova charge units by plan */
  var NOVA_DAILY = {
    free: 40,
    regular: 250,
    pro: 600
  };

  /** Study Lab limits by plan */
  var LAB = {
    free: { uploads: 3, flashMax: 15, quizMax: 10, flashDef: 10, quizDef: 8, docsMax: 12, label: "Free" },
    regular: { uploads: 9, flashMax: 25, quizMax: 20, flashDef: 15, quizDef: 12, docsMax: 40, label: "Regular" },
    pro: { uploads: 15, flashMax: 40, quizMax: 35, flashDef: 20, quizDef: 15, docsMax: 80, label: "Pro" }
  };

  /** Weighted cost for one Nova action */
  var COST = {
    chat: 1,
    plan: 2,
    search: 3,
    image: 4,
    code: 4,
    lab_gen: 2
  };

  function normTier(tier) {
    tier = String(tier || "free").toLowerCase();
    if (tier.indexOf("pro") >= 0) return "pro";
    if (tier.indexOf("regular") >= 0 || tier.indexOf("premium") >= 0) return "regular";
    return "free";
  }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }

  function novaCap(tier) {
    return NOVA_DAILY[normTier(tier)] || NOVA_DAILY.free;
  }

  function labLimits(tier) {
    return LAB[normTier(tier)] || LAB.free;
  }

  function storageKey(uid, kind) {
    return "codex_" + kind + "_" + (uid || "anon");
  }

  function readUsage(uid, kind) {
    try {
      var raw = localStorage.getItem(storageKey(uid, kind));
      if (!raw) return { date: todayKey(), used: 0 };
      var o = JSON.parse(raw);
      if (o.date !== todayKey()) return { date: todayKey(), used: 0 };
      return { date: o.date, used: Number(o.used) || 0 };
    } catch (e) {
      return { date: todayKey(), used: 0 };
    }
  }

  function writeUsage(uid, kind, used, db) {
    var o = { date: todayKey(), used: Math.max(0, Number(used) || 0) };
    try {
      localStorage.setItem(storageKey(uid, kind), JSON.stringify(o));
    } catch (e) {}
    if (db && uid) {
      try {
        var field = kind === "nova" ? "novaDaily" : "studyLabDaily";
        var payload = {};
        payload[field] = o;
        payload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        db.collection("users").doc(uid).set(payload, { merge: true });
      } catch (e) {}
    }
    return o;
  }

  /**
   * Estimate cost from user text + flags
   * @param {string} text
   * @param {{codingMode?:boolean, hasImageGen?:boolean, hasSearch?:boolean}} flags
   */
  function estimateCost(text, flags) {
    flags = flags || {};
    var q = String(text || "").toLowerCase();
    if (flags.hasImageGen || /\b(generate|create|draw|make)\b.*\b(image|picture|diagram|illustration)\b/.test(q) || /\bdraw and label\b/.test(q)) {
      return COST.image;
    }
    if (flags.codingMode || /\b(code|debug|function|algorithm|python|javascript|java|c\+\+)\b/.test(q) && q.length > 80) {
      return COST.code;
    }
    if (flags.hasSearch || /\b(search|latest|today|202[4-9]|who won|current|news)\b/.test(q)) {
      return COST.search;
    }
    if (/\b(study plan|todo|to-do|schedule|timetable|roadmap)\b/.test(q)) {
      return COST.plan;
    }
    return COST.chat;
  }

  function remainingNova(uid, tier) {
    var cap = novaCap(tier);
    var u = readUsage(uid, "nova");
    return Math.max(0, cap - u.used);
  }

  function canSpendNova(uid, tier, cost) {
    cost = cost || 1;
    return remainingNova(uid, tier) >= cost;
  }

  function spendNova(uid, tier, cost, db) {
    cost = Math.max(1, Number(cost) || 1);
    var u = readUsage(uid, "nova");
    u.used += cost;
    writeUsage(uid, "nova", u.used, db);
    if (db && uid) {
      try {
        var day = todayKey();
        db.collection("nova_usage").doc(day).set({
          date: day,
          count: firebase.firestore.FieldValue.increment(cost),
          lastUid: uid,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (e) {}
    }
    return { used: u.used, remaining: Math.max(0, novaCap(tier) - u.used), cap: novaCap(tier), cost: cost };
  }

  function remainingUploads(uid, tier) {
    var lim = labLimits(tier);
    var u = readUsage(uid, "lab");
    return Math.max(0, lim.uploads - u.used);
  }

  function canUpload(uid, tier) {
    return remainingUploads(uid, tier) > 0;
  }

  function spendUpload(uid, tier, db) {
    var u = readUsage(uid, "lab");
    u.used += 1;
    writeUsage(uid, "lab", u.used, db);
    var lim = labLimits(tier);
    return { used: u.used, remaining: Math.max(0, lim.uploads - u.used), cap: lim.uploads };
  }

  function pctRemaining(uid, tier) {
    var cap = novaCap(tier);
    if (!cap) return 0;
    return Math.round((remainingNova(uid, tier) / cap) * 100);
  }

  w.CodexQuota = {
    COST: COST,
    NOVA_DAILY: NOVA_DAILY,
    LAB: LAB,
    normTier: normTier,
    novaCap: novaCap,
    labLimits: labLimits,
    estimateCost: estimateCost,
    remainingNova: remainingNova,
    canSpendNova: canSpendNova,
    spendNova: spendNova,
    remainingUploads: remainingUploads,
    canUpload: canUpload,
    spendUpload: spendUpload,
    pctRemaining: pctRemaining,
    todayKey: todayKey,
    readUsage: readUsage
  };
})(window);
