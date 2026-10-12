/**
 * Codex Hub — plan + CBT entitlement helpers
 * Free: lifetime CBT trials (system/limits.cbtTrialsFree + cbtTrialsBonus)
 * Regular/Pro: unlimited CBT while subscription active (planExpiresAt)
 * Expired paid → free trials again
 */
(function (global) {
  function toMs(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number" && isFinite(v)) return v < 1e12 ? v * 1000 : v;
    if (typeof v === "object") {
      if (typeof v.toMillis === "function") return v.toMillis();
      if (typeof v.seconds === "number") return v.seconds * 1000;
    }
    var p = Date.parse(String(v));
    return isFinite(p) ? p : null;
  }
  function normPlan(raw) {
    var s = String(raw || "free").toLowerCase().trim();
    if (s.indexOf("pro") >= 0) return "pro";
    if (s.indexOf("regular") >= 0 || s === "reg") return "regular";
    if (s === "vip" || s === "paid") return "regular";
    return "free";
  }
  function getEntitlement(profile, userEmail) {
    profile = profile || {};
    var email = String(userEmail || profile.email || "").toLowerCase();
    if (email === "codexhub16@gmail.com") {
      return { plan: "pro", activePaid: true, expired: false, expiresAt: null, unlimitedCbt: true, label: "Pro (admin)" };
    }
    var stored = normPlan(profile.subscriptionTier || profile.plan || profile.tier || profile.subscription || "free");
    var exp =
      toMs(profile.planExpiresAt) ||
      toMs(profile.subscriptionExpires) ||
      toMs(profile.proUntil) ||
      toMs(profile.regularUntil);
    if (stored === "free") {
      return { plan: "free", activePaid: false, expired: false, expiresAt: exp, unlimitedCbt: false, label: "Free" };
    }
    if (exp != null && Date.now() > exp) {
      return {
        plan: "free",
        activePaid: false,
        expired: true,
        expiresAt: exp,
        unlimitedCbt: false,
        label: "Free (expired)",
        storedPlan: stored
      };
    }
    return {
      plan: stored,
      activePaid: true,
      expired: false,
      expiresAt: exp,
      unlimitedCbt: true,
      label: stored === "pro" ? "Pro" : "Regular"
    };
  }
  function formatExpiry(expMs) {
    if (!expMs) return "";
    try {
      return new Date(expMs).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch (e) { return ""; }
  }
  function cbtAllowance(profile, limits, userEmail) {
    var ent = getEntitlement(profile, userEmail);
    var used = Number(profile && profile.cbtTrialsUsed) || 0;
    var bonus = Number(profile && profile.cbtTrialsBonus) || 0;
    var personal = Number(profile && profile.cbtTrialsLimit) || 0;
    limits = limits || {};
    var free = Number(limits.cbtTrialsFree);
    if (!isFinite(free) || free < 0) free = 3;
    if (ent.unlimitedCbt) {
      return { limit: 999999, used: used, left: 999999, unlimited: true, ent: ent };
    }
    var limit = Math.max(free, personal) + bonus;
    return { limit: limit, used: used, left: Math.max(0, limit - used), unlimited: false, ent: ent };
  }
  global.CodexEntitlements = {
    toMs: toMs, normPlan: normPlan, getEntitlement: getEntitlement,
    formatExpiry: formatExpiry, cbtAllowance: cbtAllowance
  };
})(typeof window !== "undefined" ? window : globalThis);
