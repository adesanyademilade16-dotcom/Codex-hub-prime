/**
 * Codex Hub — live rank from Firestore leaderboard (deduped by uid)
 */
(function (w) {
  "use strict";

  function scoreOf(d) {
    if (!d) return 0;
    var n = d.score != null ? d.score : (d.xp != null ? d.xp : (d.points != null ? d.points : 0));
    return Number(n) || 0;
  }

  function realUid(row) {
    var id = (row && (row.uid || row.id || row._id)) || "";
    id = String(id);
    // Per-course docs: CODE_uid or subject_uid
    if (id.indexOf("_") > 0 && id.length > 28) {
      var parts = id.split("_");
      if (parts.length >= 2) return parts[parts.length - 1];
    }
    return id;
  }

  function db() {
    return firebase.firestore();
  }

  function dedupeRows(rows) {
    var byUid = {};
    rows.forEach(function (r) {
      var id = realUid(r);
      if (!id) return;
      var isAgg = (r.id === id || r._id === id) || (!r.subject && !r.code) || r.sessions != null;
      var prev = byUid[id];
      if (!prev) {
        byUid[id] = Object.assign({}, r, { uid: id });
        return;
      }
      var prevAgg = (prev.id === id || prev._id === id) || (!prev.subject && !prev.code) || prev.sessions != null;
      if (isAgg && !prevAgg) {
        byUid[id] = Object.assign({}, r, { uid: id });
        return;
      }
      if (isAgg === prevAgg && scoreOf(r) >= scoreOf(prev)) {
        byUid[id] = Object.assign({}, r, { uid: id });
      }
    });
    return Object.keys(byUid).map(function (k) { return byUid[k]; });
  }

  function computeRank(uid) {
    if (!uid || !w.firebase || !firebase.firestore) {
      return Promise.resolve({ rank: null, total: 0, score: 0 });
    }
    return db().collection("leaderboard").limit(200).get()
      .then(function (snap) {
        var rows = [];
        snap.forEach(function (doc) {
          var d = doc.data() || {};
          rows.push({
            id: doc.id,
            _id: doc.id,
            uid: d.uid || doc.id,
            score: scoreOf(d),
            xp: d.xp,
            points: d.points,
            subject: d.subject,
            code: d.code,
            sessions: d.sessions,
            name: d.displayName || d.fullName || d.name || "Student"
          });
        });
        rows = dedupeRows(rows);
        rows.sort(function (a, b) { return scoreOf(b) - scoreOf(a); });
        return finish(rows, uid);
      })
      .catch(function (err) {
        console.warn("CodexRank", err);
        return { rank: null, total: 0, score: 0 };
      });
  }

  function finish(rows, uid) {
    var total = rows.length;
    var rank = null;
    var score = 0;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].uid === uid || rows[i].id === uid) {
        rank = i + 1;
        score = scoreOf(rows[i]);
        break;
      }
    }
    if (rank != null) {
      try {
        db().collection("users").doc(uid).set({
          publicRank: rank,
          rank: rank,
          rankUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).catch(function () {});
      } catch (e) {}
    }
    return { rank: rank, total: total, score: score, top3: rows.slice(0, 3) };
  }

  /** Solid medal colors — no shine overlays (those broke home layout) */
  function paintRankEl(el, rank) {
    if (!el) return;
    el.classList.remove("rank-gold", "rank-silver", "rank-bronze", "rank-default", "rank-shine");
    el.style.removeProperty("background");
    el.style.removeProperty("-webkit-background-clip");
    el.style.removeProperty("background-clip");
    el.style.removeProperty("color");
    el.style.removeProperty("filter");
    if (rank == null || rank === "" || rank === "—" || rank === "-") {
      el.textContent = "—";
      el.classList.add("rank-default");
      return;
    }
    var n = Number(rank);
    if (!isFinite(n) || n < 1) {
      el.textContent = "—";
      el.classList.add("rank-default");
      return;
    }
    el.textContent = String(n);
    if (n === 1) el.classList.add("rank-gold");
    else if (n === 2) el.classList.add("rank-silver");
    else if (n === 3) el.classList.add("rank-bronze");
    else el.classList.add("rank-default");
  }

  function injectRankStyles() {
    if (document.getElementById("codex-rank-styles")) return;
    var s = document.createElement("style");
    s.id = "codex-rank-styles";
    s.textContent = [
      /* Solid colors only — no pseudo-elements, no overflow */
      ".rank-gold{color:#B45309!important;font-weight:900!important;}",
      ".rank-silver{color:#64748B!important;font-weight:900!important;}",
      ".rank-bronze{color:#C2410C!important;font-weight:900!important;}",
      ".rank-default{color:#4F46E5!important;font-weight:800!important;}",
      "html.theme-dark .rank-gold{color:#FBBF24!important;}",
      "html.theme-dark .rank-silver{color:#CBD5E1!important;}",
      "html.theme-dark .rank-bronze{color:#FB923C!important;}",
      "html.theme-dark .rank-default{color:#A5B4FC!important;}"
    ].join("");
    document.head.appendChild(s);
  }

  function loadAndPaint(uid, selectors) {
    injectRankStyles();
    selectors = selectors || ["#mRank", "#dRank", "#dRank2"];
    return computeRank(uid).then(function (info) {
      selectors.forEach(function (sel) {
        try {
          document.querySelectorAll(sel).forEach(function (el) {
            paintRankEl(el, info.rank);
          });
        } catch (e) {}
      });
      return info;
    });
  }

  w.CodexRank = {
    computeRank: computeRank,
    paintRankEl: paintRankEl,
    loadAndPaint: loadAndPaint,
    injectRankStyles: injectRankStyles,
    scoreOf: scoreOf,
    dedupeRows: dedupeRows
  };
})(window);
