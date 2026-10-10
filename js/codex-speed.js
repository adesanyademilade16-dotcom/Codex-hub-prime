/**
 * Codex Hub — perceived performance helpers
 * 1) sessionStorage profile cache → paint name/stats before Firestore returns
 * 2) prefetch next likely pages while user is on Home
 * 3) soft skeleton class on stats until real data arrives
 */
(function (w) {
  "use strict";
  var KEY = "codex_session_profile_v1";
  var PREFETCH = [
    "profile.html",
    "chats.html",
    "nova.html",
    "course-library.html",
    "cbt.html",
    "leaderboard.html",
    "settings.html"
  ];

  function safeParse(s) {
    try { return JSON.parse(s); } catch (e) { return null; }
  }

  var CodexSpeed = {
    /** Save slim profile after first successful load */
    saveProfile: function (profile, user) {
      try {
        if (!profile && !user) return;
        var slim = {
          fullName: (profile && profile.fullName) || (user && user.displayName) || "",
          username: (profile && (profile.username || profile.userName)) || "",
          level: profile && profile.level,
          department: profile && profile.department,
          semester: profile && profile.semester,
          subscriptionTier: profile && (profile.subscriptionTier || profile.plan),
          plan: profile && profile.plan,
          rank: profile && (profile.rank || profile.publicRank),
          publicRank: profile && profile.publicRank,
          streak: profile && (profile.streak || profile.currentStreak),
          email: user && user.email,
          uid: user && user.uid,
          photoURL: (profile && profile.photoURL) || (user && user.photoURL) || "",
          avatarKey: profile && profile.avatarKey,
          university: profile && profile.university,
          faculty: profile && profile.faculty,
          xpPoints: profile && (profile.xpPoints || profile.xp),
          ts: Date.now()
        };
        sessionStorage.setItem(KEY, JSON.stringify(slim));
      } catch (e) {}
    },

    getCached: function () {
      try {
        var o = safeParse(sessionStorage.getItem(KEY));
        if (!o || !o.ts) return null;
        // Expire after 6 hours
        if (Date.now() - o.ts > 6 * 60 * 60 * 1000) return null;
        return o;
      } catch (e) {
        return null;
      }
    },

    /** Instant paint on Home (and similar) from cache */
    paintHomeFromCache: function () {
      var p = this.getCached();
      if (!p) return false;
      function set(id, val) {
        var el = document.getElementById(id);
        if (el && val != null && val !== "") el.textContent = val;
      }
      var first = (p.fullName || "Student").trim().split(/\s+/)[0];
      set("mName", first);
      set("dName", p.fullName || first);
      var meta = [p.level, p.department, p.semester].filter(Boolean).join(" · ");
      set("mMeta", meta || p.email || "");
      set("dMeta", meta || p.email || "");
      var tier = (p.subscriptionTier || p.plan || "free").toString().toLowerCase();
      var planLabel = tier.indexOf("pro") >= 0 ? "PRO" : tier.indexOf("regular") >= 0 ? "REGULAR" : "FREE PLAN";
      set("mPlan", planLabel);
      set("dPlan", planLabel);
      set("mLevel", p.level || "—");
      set("dLevel", p.level || "—");
      if (p.streak != null) {
        set("mStreak", p.streak);
        set("dStreak", p.streak);
        set("dStreak2", p.streak);
        set("dWelStreak", p.streak);
      }
      if (p.rank != null || p.publicRank != null) {
        var r = p.rank || p.publicRank || "—";
        set("mRank", r);
        set("dRank", r);
        set("dRank2", r);
      }
      document.querySelectorAll(".codex-skel").forEach(function (el) {
        el.classList.remove("codex-skel");
      });
      return true;
    },

    /** Profile page reuses most of the same ids as Home (mName, mRank, mPlan,
     *  dName, dRank, dStreak, dPlan, dLevel all already get set by
     *  paintHomeFromCache above) — this just adds the avatar initials and the
     *  extra detail-card fields that are specific to the profile layout. */
    paintProfileFromCache: function () {
      var p = this.getCached();
      if (!p) return false;
      this.paintHomeFromCache();
      function set(id, val) {
        var el = document.getElementById(id);
        if (el && val != null && val !== "") el.textContent = val;
      }
      var full = (p.fullName || "Student").trim();
      var initials = full.split(/\s+/).map(function (w) { return w[0] || ""; }).join("").slice(0, 2).toUpperCase() || "ST";
      // Only paint initials when there's no photo cached — a real <img> will
      // replace this the moment CodexMedia resolves the real avatar, we just
      // don't want to show a blank/default circle for that first moment.
      if (!p.photoURL && !p.avatarKey) {
        ["mAv", "dAv"].forEach(function (id) {
          var el = document.getElementById(id);
          if (el && !el.querySelector("img")) el.textContent = initials;
        });
      }
      set("dUni", p.university);
      set("dFac", p.faculty);
      set("dLev", p.level);
      set("dUser", p.username ? "@" + p.username : null);
      if (p.xpPoints != null) set("dXp", p.xpPoints + (p.rank ? " · Rank " + p.rank : ""));
      this.clearSkeleton();
      return true;
    },

    /** CBT/study stats cache for stats.html — separate from the profile
     *  cache since this is analytics data, not identity data. */
    saveStats: function (s) {
      try {
        if (!s) return;
        var slim = {
          overall: s.overall, sessions: s.sessions, questions: s.questions,
          best: s.best, courses: s.courses, ts: Date.now()
        };
        sessionStorage.setItem("codex_session_stats_v1", JSON.stringify(slim));
      } catch (e) {}
    },
    paintStatsFromCache: function () {
      try {
        var o = safeParse(sessionStorage.getItem("codex_session_stats_v1"));
        if (!o || !o.ts || Date.now() - o.ts > 6 * 60 * 60 * 1000) return false;
        function set(id, val) {
          var el = document.getElementById(id);
          if (el && val != null && val !== "") el.textContent = val;
        }
        set("overall", o.overall); set("sessions", o.sessions);
        set("questions", o.questions); set("best", o.best); set("courses", o.courses);
        this.clearSkeleton();
        return true;
      } catch (e) { return false; }
    },

    /** Generic small-list cache (conversation lists, etc). Stores at most
     *  `limit` items — this is only ever a "paint something while we wait"
     *  layer, never a source of truth, so it stays deliberately small. */
    saveList: function (key, items, limit) {
      try {
        if (!Array.isArray(items)) return;
        sessionStorage.setItem(
          "codex_list_" + key,
          JSON.stringify({ items: items.slice(0, limit || 20), ts: Date.now() })
        );
      } catch (e) {}
    },
    getList: function (key) {
      try {
        var o = safeParse(sessionStorage.getItem("codex_list_" + key));
        if (!o || !o.ts || Date.now() - o.ts > 6 * 60 * 60 * 1000) return null;
        return o.items || null;
      } catch (e) { return null; }
    },

    markSkeleton: function (ids) {
      (ids || ["mName", "mMeta", "mStreak", "mRank", "mLevel"]).forEach(function (id) {
        var el = document.getElementById(id);
        if (el && (!el.textContent || el.textContent === "Student" || el.textContent === "—" || el.textContent === "0")) {
          el.classList.add("codex-skel");
        }
      });
    },

    clearSkeleton: function () {
      document.querySelectorAll(".codex-skel").forEach(function (el) {
        el.classList.remove("codex-skel");
      });
    },

    /** Warm browser cache for common next pages */
    prefetchAppPages: function () {
      try {
        var base = "";
        if (location.pathname.indexOf("/app/") >= 0) base = "";
        else if (location.pathname.indexOf("app/") >= 0) base = "";
        PREFETCH.forEach(function (file) {
          var href = file;
          // from app/ pages relative is fine
          var link = document.createElement("link");
          link.rel = "prefetch";
          link.href = href;
          link.as = "document";
          document.head.appendChild(link);
        });
      } catch (e) {}
    },

    injectSkeletonCss: function () {
      if (document.getElementById("codex-speed-css")) return;
      var s = document.createElement("style");
      s.id = "codex-speed-css";
      s.textContent =
        ".codex-skel{background:linear-gradient(90deg,#e2e8f0 25%,#f1f5f9 50%,#e2e8f0 75%);" +
        "background-size:200% 100%;animation:codexSkel 1.2s ease-in-out infinite;" +
        "color:transparent!important;border-radius:6px;min-width:2.5rem;display:inline-block}" +
        "@keyframes codexSkel{0%{background-position:200% 0}100%{background-position:-200% 0}}" +
        "html.theme-dark .codex-skel{background:linear-gradient(90deg,#1e293b 25%,#334155 50%,#1e293b 75%);background-size:200% 100%}";
      document.head.appendChild(s);
    }
  };

  w.CodexSpeed = CodexSpeed;

  // Auto: on any page with shell, inject CSS + paint whatever's cached for
  // that page immediately (before Firestore even starts), so the first
  // frame the student sees is their own last-known data, not a blank
  // skeleton. The real fetch still runs as normal and overwrites this.
  try {
    CodexSpeed.injectSkeletonCss();
    var pg = document.body && document.body.getAttribute("data-page");
    if (pg === "home") {
      CodexSpeed.markSkeleton();
      CodexSpeed.paintHomeFromCache();
    } else if (pg === "profile") {
      CodexSpeed.markSkeleton(["mName", "mRank", "mStreak", "mPlan", "dName", "dRank", "dStreak", "dPlan", "dLevel"]);
      CodexSpeed.paintProfileFromCache();
    } else if (pg === "stats") {
      CodexSpeed.markSkeleton(["overall", "sessions", "questions", "best", "courses"]);
      CodexSpeed.paintStatsFromCache();
    }
  } catch (e) {}
})(window);
