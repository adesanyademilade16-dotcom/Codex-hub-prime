/**
 * Codex Hub — Admin Command Center
 * Single-shell SPA with modular workspaces.
 * Authorization: Firestore admins/{uid} + SUPER_ADMIN email bootstrap.
 * Sensitive billing changes must remain server/rules protected.
 */
(function () {
  "use strict";

  var ADMIN_BOOTSTRAP_EMAILS = ["codexhub16@gmail.com"];
  var ROLES = {
    SUPER_ADMIN: "SUPER_ADMIN",
    ADMIN: "ADMIN",
    MODERATOR: "MODERATOR",
    CONTENT_ADMIN: "CONTENT_ADMIN",
    FINANCE_ADMIN: "FINANCE_ADMIN",
    SUPPORT_ADMIN: "SUPPORT_ADMIN"
  };

  var state = {
    user: null,
    profile: null,
    adminDoc: null,
    role: null,
    view: "overview",
    students: [],
    studentsCursor: null,
    selectedStudent: null,
    metrics: {},
    attention: [],
    activity: [],
    unsubPresence: null,
    searchTimer: null
  };

  var $ = function (id) { return document.getElementById(id); };
  var qs = function (sel, root) { return (root || document).querySelector(sel); };
  var qsa = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function db() {
    return firebase.firestore();
  }

  function fmtDate(v) {
    if (!v) return "—";
    try {
      var d = v.toDate ? v.toDate() : new Date(v);
      if (isNaN(d.getTime())) return "—";
      return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
    } catch (e) { return "—"; }
  }

  function fmtTime(v) {
    if (!v) return "";
    try {
      var d = v.toDate ? v.toDate() : new Date(v);
      return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    } catch (e) { return ""; }
  }

  function planOf(u) {
    if (!u) return "free";
    if (u.isPro || u.plan === "pro" || /pro/i.test(u.subscriptionTier || u.plan || "")) return "pro";
    if (u.isRegular || u.plan === "regular" || /regular/i.test(u.subscriptionTier || u.plan || "")) return "regular";
    return "free";
  }

  function planPill(plan) {
    var p = (plan || "free").toLowerCase();
    return '<span class="pill ' + p + '">' + esc(p.charAt(0).toUpperCase() + p.slice(1)) + "</span>";
  }

  function avatarHtml(name, photo) {
    if (photo) return '<img src="' + esc(photo) + '" alt="">';
    var ini = String(name || "?").trim().split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase();
    return '<div class="av">' + esc(ini || "?") + "</div>";
  }

  function roleLabel(role) {
    if (role === ROLES.SUPER_ADMIN) return "SUPER ADMIN";
    if (role === ROLES.ADMIN) return "ADMIN";
    return String(role || "ADMIN").replace(/_/g, " ");
  }

  function can(action) {
    var r = state.role;
    if (!r) return false;
    if (r === ROLES.SUPER_ADMIN) return true;
    if (r === ROLES.ADMIN) {
      return action !== "manage_admins" && action !== "security_config";
    }
    if (r === ROLES.FINANCE_ADMIN) return /subscription|payment|finance|view/.test(action);
    if (r === ROLES.CONTENT_ADMIN) return /resource|content|announce|view/.test(action);
    if (r === ROLES.MODERATOR) return /moderate|community|view/.test(action);
    if (r === ROLES.SUPPORT_ADMIN) return /student|view|support/.test(action);
    return action === "view";
  }

  /* ── Auth / role resolution ─────────────────────────────── */
  function resolveAdminRole(user) {
    if (!user) return Promise.resolve(null);
    var email = (user.email || "").toLowerCase();
    return db().collection("admins").doc(user.uid).get().then(function (snap) {
      if (snap.exists) {
        var d = snap.data() || {};
        if (d.active === false) return null;
        return d.role || ROLES.ADMIN;
      }
      // Bootstrap: seed SUPER_ADMIN for configured founder emails (one-time create)
      if (ADMIN_BOOTSTRAP_EMAILS.indexOf(email) >= 0) {
        return db().collection("admins").doc(user.uid).set({
          email: user.email,
          role: ROLES.SUPER_ADMIN,
          active: true,
          displayName: user.displayName || "",
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          bootstrap: true
        }, { merge: true }).then(function () {
          return ROLES.SUPER_ADMIN;
        }).catch(function () {
          // Rules may block create — still allow UI for bootstrap email if rules use email check
          return ROLES.SUPER_ADMIN;
        });
      }
      return null;
    }).catch(function (err) {
      console.warn("admin role lookup", err);
      if (ADMIN_BOOTSTRAP_EMAILS.indexOf(email) >= 0) return ROLES.SUPER_ADMIN;
      return null;
    });
  }

  function loadProfile(uid) {
    return db().collection("users").doc(uid).get().then(function (s) {
      return s.exists ? s.data() : {};
    }).catch(function () { return {}; });
  }

  /* ── Audit ──────────────────────────────────────────────── */
  function writeAudit(action, target, meta) {
    if (!state.user) return Promise.resolve();
    var doc = {
      adminUid: state.user.uid,
      adminEmail: state.user.email || "",
      adminName: (state.profile && (state.profile.fullName || state.profile.displayName)) || state.user.displayName || "",
      action: action,
      target: target || null,
      meta: meta || {},
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    return db().collection("admin_audit").add(doc).catch(function (e) {
      console.warn("audit write", e);
    });
  }

  /* ── Navigation ─────────────────────────────────────────── */
  var VIEWS = [
    { id: "overview", section: "OVERVIEW", label: "Dashboard", icon: "grid" },
    { id: "students", section: "STUDENTS", label: "Students", icon: "users" },
    { id: "subscriptions", section: "STUDENTS", label: "Subscriptions", icon: "card" },
    { id: "payments", section: "BUSINESS", label: "Payments", icon: "cash" },
    { id: "resources", section: "ACADEMIC", label: "Resources", icon: "file" },
    { id: "academic", section: "ACADEMIC", label: "Courses & CBT", icon: "book" },
    { id: "ai", section: "AI", label: "AI & Usage", icon: "spark" },
    { id: "community", section: "COMMUNITY", label: "Chat & Moderation", icon: "chat" },
    { id: "announcements", section: "COMMUNICATION", label: "Announcements", icon: "megaphone" },
    { id: "analytics", section: "SYSTEM", label: "Analytics", icon: "chart" },
    { id: "admins", section: "SYSTEM", label: "Administrators", icon: "shield" },
    { id: "referrals", section: "STUDENTS", label: "Referrals", icon: "users" },
    { id: "config", section: "SYSTEM", label: "Configuration", icon: "gear" },
    { id: "audit", section: "SYSTEM", label: "Audit Log", icon: "list" }
  ];

  function icons(name) {
    var m = {
      grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
      users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>',
      card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
      cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
      file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>',
      book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
      spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z"/></svg>',
      chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
      megaphone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l18-5v12L3 13v-2z"/><path d="M11.6 16.8a3 3 0 11-5.2-3"/></svg>',
      chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>',
      shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
      gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>',
      list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>'
    };
    return m[name] || m.grid;
  }

  function renderNav() {
    var nav = $("adminNav");
    if (!nav) return;
    var html = "";
    var lastSection = "";
    VIEWS.forEach(function (v) {
      if (v.id === "admins" && !can("manage_admins")) return;
      if (v.section !== lastSection) {
        html += '<div class="nav-section">' + esc(v.section) + "</div>";
        lastSection = v.section;
      }
      html += '<button type="button" class="nav-item' + (state.view === v.id ? " active" : "") + '" data-view="' + v.id + '">' +
        icons(v.icon) + "<span>" + esc(v.label) + "</span></button>";
    });
    nav.innerHTML = html;
    qsa("[data-view]", nav).forEach(function (btn) {
      btn.onclick = function () {
        navigate(btn.getAttribute("data-view"));
        closeMobileNav();
      };
    });
  }

  function navigate(view) {
    state.view = view || "overview";
    renderNav();
    var title = (VIEWS.find(function (v) { return v.id === state.view; }) || {}).label || "Dashboard";
    var ht = $("wsTitle");
    if (ht) ht.textContent = title;
    var main = $("workspace");
    if (!main) return;
    main.innerHTML = '<div class="card"><div class="card-bd"><div class="skeleton"></div><div class="skeleton" style="width:70%"></div><div class="skeleton" style="width:40%"></div></div></div>';
    var renderer = MODULES[state.view];
    if (typeof renderer === "function") {
      Promise.resolve(renderer(main)).catch(function (err) {
        main.innerHTML = '<div class="empty"><b>Could not load workspace</b><span>' + esc(err.message || err) + "</span></div>";
      });
    } else {
      main.innerHTML = '<div class="empty"><b>Coming soon</b><span>This workspace is reserved for the next phase.</span></div>';
    }
  }

  function closeMobileNav() {
    var sb = $("sidebar");
    var bd = $("sidebarBackdrop");
    if (sb) sb.classList.remove("open");
    if (bd) bd.classList.remove("show");
  }

  /* ── Metrics helpers ────────────────────────────────────── */
  function countCollection(col, limitN) {
    return db().collection(col).limit(limitN || 500).get().then(function (snap) {
      return snap.size;
    }).catch(function () { return 0; });
  }

  function countAllResources() {
    return Promise.all([
      db().collection("pdfs").get().catch(function () { return { size: 0 }; }),
      db().collection("resources").get().catch(function () { return { size: 0 }; })
    ]).then(function (pair) {
      var a = (pair[0] && pair[0].size) || 0;
      var b = (pair[1] && pair[1].size) || 0;
      if (a && !b) return a;
      if (b && !a) return b;
      return a + b;
    });
  }

  function loadUsageMetrics() {
    var dbRef = db();
    var novaCount = 0, cbtToday = 0, cbtTotal = 0;
    var start = new Date();
    start.setHours(0, 0, 0, 0);

    function setTxt(id, val) {
      var el = document.getElementById(id);
      if (el) el.textContent = String(val);
    }
    function apply() {
      setTxt("metricNova", novaCount);
      setTxt("metricCbt", cbtTotal);
      setTxt("metricCbtToday", cbtToday);
      setTxt("stat-nova", novaCount);
      setTxt("stat-cbt", cbtTotal);
      setTxt("stat-cbt-today", cbtToday);
      setTxt("ov-cbt-today", cbtToday);
      setTxt("ov-cbt-total", cbtTotal);
      setTxt("ov-nova", novaCount);
      try {
        document.querySelectorAll('[data-metric="cbt-today"]').forEach(function (el) {
          el.textContent = String(cbtToday);
        });
        document.querySelectorAll('[data-metric="cbt-total"]').forEach(function (el) {
          el.textContent = String(cbtTotal);
        });
        document.querySelectorAll('[data-metric="nova"]').forEach(function (el) {
          el.textContent = String(novaCount);
        });
      } catch (e) {}
    }

    return dbRef.collection("quiz_attempts").limit(200).get()
      .then(function (q) {
        q.forEach(function (d) {
          cbtTotal++;
          var data = d.data() || {};
          var t = null;
          if (data.finishedAt && data.finishedAt.toDate) t = data.finishedAt.toDate();
          else if (data.createdAt && data.createdAt.toDate) t = data.createdAt.toDate();
          else if (typeof data.createdAt === "number") t = new Date(data.createdAt);
          if (t && t >= start) cbtToday++;
        });
      })
      .catch(function (e) { console.warn("CBT metrics", e); })
      .then(function () {
        return dbRef.collection("nova_usage").limit(80).get().then(function (nq) {
          nq.forEach(function (d) {
            var data = d.data() || {};
            novaCount += Number(data.count || data.messages || data.total || data.used || 0);
          });
        }).catch(function () {
          /* nova_usage may not exist yet */
        });
      })
      .then(function () {
        if (novaCount) return null;
        return dbRef.collection("users").limit(200).get().then(function (us) {
          var today = new Date().toISOString().slice(0, 10);
          us.forEach(function (d) {
            var data = d.data() || {};
            var nd = data.novaDaily;
            if (nd && (nd.date === today || nd.date === today.replace(/-/g, ""))) {
              novaCount += Number(nd.used || 0);
            }
          });
        }).catch(function () {});
      })
      .then(function () {
        apply();
        return { novaCount: novaCount, cbtToday: cbtToday, cbtTotal: cbtTotal };
      });
  }

  function loadOverviewMetrics() {
    try {
      if (typeof loadUsageMetrics === "function") loadUsageMetrics();
      document.querySelectorAll("[data-go]").forEach(function (b) {
        b.onclick = function () {
          var v = b.getAttribute("data-go");
          if (typeof showSection === "function") showSection(v);
          else if (typeof navigateAdmin === "function") navigateAdmin(v);
          else if (typeof setView === "function") setView(v);
          else if (typeof navigate === "function") navigate(v);
        };
      });
    } catch (e) {}

    var usersRef = db().collection("users");
    var start = new Date();
    start.setHours(0, 0, 0, 0);

    return Promise.all([
      usersRef.get().catch(function () { return { size: 0, forEach: function () {} }; }),
      db().collection("presence").limit(500).get().catch(function () {
        return { size: 0, forEach: function () {} };
      }),
      db().collection("resources").where("status", "==", "pending").limit(50).get().catch(function () {
        return { size: 0, docs: [] };
      }),
      db().collection("resource_reports").where("status", "==", "open").limit(50).get().catch(function () {
        return { size: 0, docs: [] };
      }),
      db().collection("admin_audit").orderBy("createdAt", "desc").limit(12).get().catch(function () {
        return { docs: [] };
      }),
      db().collection("quiz_attempts").orderBy("createdAt", "desc").limit(200).get().catch(function () {
        return db().collection("quiz_attempts").limit(200).get().catch(function () {
          return { docs: [], size: 0, forEach: function () {} };
        });
      }),
      db().collection("resources").where("status", "==", "verified").limit(50).get().catch(function () {
        return db().collection("resources").where("verified", "==", true).limit(50).get().catch(function () {
          return { size: 0 };
        });
      }),
      db().collection("pdfs").get().catch(function () { return { size: 0 }; }),
      db().collection("resources").get().catch(function () { return { size: 0 }; })
    ]).then(function (results) {
      var usersSnap = results[0];
      var presenceSnap = results[1];
      var pendingRes = results[2];
      var reports = results[3];
      var audit = results[4];
      var attemptsSnap = results[5];
      var verifiedRes = results[6];
      var pdfsSnap = results[7] || { size: 0 };
      var allResSnap = results[8] || { size: 0 };

      var total = usersSnap.size || 0;
      var free = 0, regular = 0, pro = 0, today = 0;
      if (usersSnap.forEach) {
        usersSnap.forEach(function (doc) {
          var u = doc.data() || {};
          var p = planOf(u);
          if (p === "pro") pro++;
          else if (p === "regular") regular++;
          else free++;
          var created = u.createdAt && u.createdAt.toDate ? u.createdAt.toDate() : null;
          if (created && created >= start) today++;
        });
      }

      var online = 0;
      var cutoff = Date.now() - 5 * 60 * 1000;
      if (presenceSnap.forEach) {
        presenceSnap.forEach(function (doc) {
          var d = doc.data() || {};
          var t = 0;
          if (d.lastSeen && d.lastSeen.toDate) t = d.lastSeen.toDate().getTime();
          else if (d.updatedAt && d.updatedAt.toDate) t = d.updatedAt.toDate().getTime();
          if (d.online || (t && t > cutoff)) online++;
        });
      }

      var cbtToday = 0, cbtSample = 0;
      if (attemptsSnap && attemptsSnap.forEach) {
        attemptsSnap.forEach(function (doc) {
          cbtSample++;
          var d = doc.data() || {};
          var ts = d.createdAt || d.finishedAt || d.completedAt || d.at;
          var dt = ts && ts.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
          if (dt && !isNaN(dt.getTime()) && dt >= start) cbtToday++;
        });
      }

      var totalRes = (pdfsSnap.size || 0) + (allResSnap.size || 0);
      if (!(allResSnap.size) && pdfsSnap.size) totalRes = pdfsSnap.size;
      if (!(pdfsSnap.size) && allResSnap.size) totalRes = allResSnap.size;

      state.metrics = {
        totalResources: totalRes,
        totalStudents: total,
        online: online,
        newToday: today,
        free: free,
        regular: regular,
        pro: pro,
        pendingResources: pendingRes.size || 0,
        openReports: reports.size || 0,
        cbtToday: cbtToday,
        cbtSample: cbtSample,
        verifiedResources: (verifiedRes && verifiedRes.size) || 0
      };

      state.attention = [];
      if (pendingRes.size) {
        state.attention.push({
          count: pendingRes.size,
          title: "Resources awaiting review",
          view: "resources",
          type: "warn"
        });
      }
      if (reports.size) {
        state.attention.push({
          count: reports.size,
          title: "Reports need attention",
          view: "community",
          type: "danger"
        });
      }

      state.activity = [];
      (audit.docs || []).forEach(function (doc) {
        var a = doc.data() || {};
        state.activity.push({
          title: a.action || "Admin action",
          sub: (a.adminName || a.adminEmail || "Admin") +
            (a.target && a.target.email ? " → " + a.target.email : ""),
          at: a.createdAt
        });
      });

      return state.metrics;
    });
  }

  /* ── Modules ────────────────────────────────────────────── */
  var MODULES = {};

  MODULES.overview = function (root) {
    return loadOverviewMetrics().then(function (m) {
      var att = state.attention.length
        ? state.attention.map(function (a) {
            return '<div class="attention-item" data-go="' + esc(a.view) + '"><div class="count">' + a.count + '</div><div><b>' + esc(a.title) + '</b><span>Tap to open</span></div></div>';
          }).join("")
        : '<div class="empty" style="padding:18px"><span>No urgent items right now.</span></div>';

      var act = state.activity.length
        ? state.activity.map(function (a) {
            return '<div class="list-item"><div class="ico">' + icons("list") + '</div><div class="body"><b>' + esc(a.title) + '</b><span>' + esc(a.sub) + '</span></div><time>' + esc(fmtTime(a.at)) + '</time></div>';
          }).join("")
        : '<div class="empty" style="padding:18px"><span>Admin actions will appear here.</span></div>';

      root.innerHTML =
        '<div class="ws-header"><div><h1>Command Center</h1><p>What is happening across Codex Hub right now.</p></div>' +
        '<div class="ws-actions"><button type="button" class="btn" id="btnRefreshOverview">Refresh</button></div></div>' +
        '<div class="metrics">' +
          '<div class="metric accent"><div class="label">Students</div><div class="value">' + m.totalStudents + '</div><div class="hint">All accounts in Firestore</div></div>' +
          '<div class="metric"><div class="label">Online now</div><div class="value">' + m.online + '</div><div class="hint">Presence ~5 min</div></div>' +
          '<div class="metric"><div class="label">New today</div><div class="value">' + m.newToday + '</div><div class="hint">Registrations</div></div>' +
          '<div class="metric"><div class="label">Pro</div><div class="value">' + m.pro + '</div><div class="hint">Regular: ' + m.regular + ' · Free: ' + m.free + '</div></div>' +
        '</div>' +
        '<div class="metrics">' +
          '<div class="metric"><div class="label">CBT today</div><div class="value">' + (m.cbtToday || 0) + '</div><div class="hint">From recent attempts sample</div></div>' +
          '<div class="metric"><div class="label">Pending resources</div><div class="value">' + (m.pendingResources || 0) + '</div><div class="hint">Awaiting review</div></div>' +
          '<div class="metric"><div class="label">Verified resources</div><div class="value">' + (m.verifiedResources || 0) + '</div><div class="hint">Sample window</div></div>' +
          '<div class="metric"><div class="label">Open reports</div><div class="value">' + (m.openReports || 0) + '</div><div class="hint">Moderation</div></div>' +
        '</div>' +
        '<div class="grid-2">' +
          '<div class="card"><div class="card-hd"><h2>Attention required</h2></div><div class="card-bd">' + att + '</div></div>' +
          '<div class="card"><div class="card-hd"><h2>Live activity</h2><span class="sub">Audit stream</span></div><div class="card-bd">' + act + '</div></div>' +
        '</div>' +
        '<div class="grid-3">' +
          '<div class="card"><div class="card-hd"><h2>Quick actions</h2></div><div class="card-bd" style="display:flex;flex-wrap:wrap;gap:8px">' +
            '<button type="button" class="btn btn-primary" data-go="resources">Review resources</button>' +
            '<button type="button" class="btn" data-go="students">Manage students</button>' +
            '<button type="button" class="btn" data-go="announcements">Create announcement</button>' +
            '<button type="button" class="btn" data-go="community">View reports</button>' +
            '<a class="btn" href="../app/home.html" style="text-decoration:none">Open student app</a>' +
          '</div></div>' +
          '<div class="card"><div class="card-hd"><h2>AI health</h2></div><div class="card-bd">' +
            '<div class="status-row"><span><span class="status-dot"></span>Nova</span><span class="pill ok">Monitored</span></div>' +
            '<div class="status-row"><span><span class="status-dot"></span>Study Lab</span><span class="pill ok">Monitored</span></div>' +
            '<div class="status-row"><span><span class="status-dot"></span>Student Tools</span><span class="pill ok">Monitored</span></div>' +
            '<p style="font-size:.76rem;color:var(--muted);margin-top:10px">Provider keys stay on Render. Open AI workspace for usage detail.</p>' +
          '</div></div>' +
          '<div class="card"><div class="card-hd"><h2>Payments</h2></div><div class="card-bd">' +
            '<div class="empty" style="padding:12px"><b>Paystack not connected</b><span>Revenue metrics appear after integration.</span></div>' +
          '</div></div>' +
        '</div>';

      qsa("[data-go]", root).forEach(function (el) {
        el.onclick = function () { navigate(el.getAttribute("data-go")); };
      });
      var ref = $("btnRefreshOverview");
      if (ref) ref.onclick = function () { navigate("overview"); };
    });
  };

  MODULES.students = function (root) {
    root.innerHTML =
      '<div class="ws-header"><div><h1>Students</h1><p>Directory, plans, and account status.</p></div></div>' +
      '<div class="toolbar">' +
        '<input type="search" id="studentSearch" placeholder="Search name, email, username…">' +
        '<select id="planFilter"><option value="">All plans</option><option value="free">Free</option><option value="regular">Regular</option><option value="pro">Pro</option></select>' +
        '<button type="button" class="btn" id="btnLoadStudents">Search</button>' +
      '</div>' +
      '<div class="card"><div class="card-bd tight"><div class="table-wrap"><table class="data" id="studentTable">' +
        '<thead><tr><th>Student</th><th>Plan</th><th>University</th><th>Level</th><th>Joined</th></tr></thead>' +
        '<tbody><tr><td colspan="5"><div class="empty">Loading…</div></td></tr></tbody>' +
      '</table></div></div></div>';

    function run() {
      var q = ($("studentSearch").value || "").trim().toLowerCase();
      var planF = $("planFilter").value;
      var tbody = qs("#studentTable tbody");
      tbody.innerHTML = '<tr><td colspan="5"><div class="empty">Loading…</div></td></tr>';

      // Load students: prefer createdAt order, fallback plain limit (users missing createdAt still appear).
      // Email search uses equality query so any account can be found.
      var loadPromise;
      var searchRaw = ($("studentSearch").value || "").trim();
      if (q && q.indexOf("@") >= 0) {
        loadPromise = db().collection("users").where("email", "==", q).limit(25).get().catch(function () {
          return db().collection("users").where("email", "==", searchRaw).limit(25).get();
        });
      } else {
        // Same strategy as former Codex Hub admin: load ALL users (no limit)
        loadPromise = db().collection("users").orderBy("createdAt", "desc").get().catch(function () {
          return db().collection("users").get();
        });
      }
      return loadPromise.then(function (snap) {
        var rows = [];
        var seen = {};
        snap.forEach(function (doc) {
          if (seen[doc.id]) return;
          seen[doc.id] = true;
          var u = doc.data() || {};
          u._id = doc.id;
          var plan = planOf(u);
          if (planF && plan !== planF) return;
          var hay = ((u.fullName || u.displayName || "") + " " + (u.email || "") + " " + (u.username || "") + " " + doc.id).toLowerCase();
          if (q && q.indexOf("@") < 0 && hay.indexOf(q) < 0) return;
          rows.push(u);
        });
        state.students = rows;
        if (!rows.length) {
          tbody.innerHTML = '<tr><td colspan="5"><div class="empty"><b>No students found</b><span>Try another search.</span></div></td></tr>';
          return;
        }
        tbody.innerHTML = rows.map(function (u, i) {
          var name = u.fullName || u.displayName || u.email || "Student";
          var photo = u.photoURL || u.avatarUrl || "";
          return '<tr data-idx="' + i + '"><td><div class="user-cell">' + avatarHtml(name, photo) +
            '<div><b>' + esc(name) + '</b><span>' + esc(u.email || u.username || u._id) + '</span></div></div></td>' +
            '<td>' + planPill(planOf(u)) + '</td>' +
            '<td>' + esc(u.university || "—") + '</td>' +
            '<td>' + esc(u.level || "—") + '</td>' +
            '<td>' + esc(fmtDate(u.createdAt)) + '</td></tr>';
        }).join("");
        qsa("tr[data-idx]", tbody).forEach(function (tr) {
          tr.onclick = function () {
            openStudentDrawer(state.students[+tr.getAttribute("data-idx")]);
          };
        });
      }).catch(function (err) {
        tbody.innerHTML = '<tr><td colspan="5"><div class="empty"><b>Load failed</b><span>' + esc(err.message) + '</span></div></td></tr>';
      });
    }

    $("btnLoadStudents").onclick = run;
    $("studentSearch").onkeydown = function (e) { if (e.key === "Enter") run(); };
    return run();
  };

  function openStudentDrawer(u) {
    if (!u) return;
    state.selectedStudent = u;
    var name = u.fullName || u.displayName || u.email || "Student";
    var backdrop = $("drawerBackdrop");
    var drawer = $("drawer");
    $("drawerTitle").textContent = name;
    $("drawerBody").innerHTML =
      '<div class="user-cell" style="margin-bottom:14px">' + avatarHtml(name, u.photoURL || u.avatarUrl || "") +
      '<div><b>' + esc(name) + '</b><span>' + esc(u.email || "") + '</span></div></div>' +
      planPill(planOf(u)) +
      '<div class="section-label">Profile</div><dl class="kv">' +
      '<dt>Username</dt><dd>' + esc(u.username || "—") + '</dd>' +
      '<dt>University</dt><dd>' + esc(u.university || "—") + '</dd>' +
      '<dt>Faculty</dt><dd>' + esc(u.faculty || "—") + '</dd>' +
      '<dt>Department</dt><dd>' + esc(u.department || "—") + '</dd>' +
      '<dt>Level</dt><dd>' + esc(u.level || "—") + '</dd>' +
      '</dl>' +
      '<div class="section-label">Account</div><dl class="kv">' +
      '<dt>UID</dt><dd style="font-size:.72rem">' + esc(u._id || "") + '</dd>' +
      '<dt>Joined</dt><dd>' + esc(fmtDate(u.createdAt)) + '</dd>' +
      '<dt>Plan field</dt><dd>' + esc(u.subscriptionTier || u.plan || "free") + '</dd>' +
      '</dl>' +
      '<p style="font-size:.76rem;color:var(--muted)">Billing fields are protected by Firestore rules. Manual plan changes require SUPER_ADMIN and will be audited.</p>';

    $("drawerFooter").innerHTML =
      (can("subscription_change")
        ? '<button type="button" class="btn btn-primary" id="btnChangePlan">Change plan</button>'
        : "") +
      '<button type="button" class="btn" id="btnCloseDrawer2">Close</button>';

    backdrop.classList.add("show");
    drawer.classList.add("show");
    $("btnCloseDrawer2").onclick = closeDrawer;
    var bp = $("btnChangePlan");
    if (bp) bp.onclick = function () { openPlanModal(u); };
  }

  function closeDrawer() {
    $("drawerBackdrop").classList.remove("show");
    $("drawer").classList.remove("show");
  }

  function openPlanModal(u) {
    if (!can("subscription_change") && state.role !== ROLES.SUPER_ADMIN && state.role !== ROLES.ADMIN) {
      alert("You do not have permission to change plans.");
      return;
    }
    // Only SUPER_ADMIN should actually write billing — ADMIN may be restricted by rules
    var modal = $("modalBackdrop");
    $("modalTitle").textContent = "Change subscription";
    $("modalBody").innerHTML =
      '<p style="font-size:.84rem;margin-bottom:12px">Student: <b>' + esc(u.fullName || u.email || u._id) + '</b></p>' +
      '<div class="field"><label>New plan</label><select id="newPlan"><option value="free">Free</option><option value="regular">Regular</option><option value="pro">Pro</option></select></div>' +
      '<div class="field"><label>Duration (days, 0 = clear expiry)</label><input type="number" id="planDays" value="30" min="0" max="730"></div>' +
      '<div class="field"><label>Reason (required)</label><textarea id="planReason" placeholder="Scholarship, support, testing…"></textarea></div>' +
      '<p style="font-size:.74rem;color:var(--danger)">This writes protected billing fields. Rules may only allow SUPER_ADMIN / Cloud Functions. Every change is audited.</p>';
    $("modalFooter").innerHTML =
      '<button type="button" class="btn" id="modalCancel">Cancel</button>' +
      '<button type="button" class="btn btn-primary" id="modalConfirmPlan">Confirm</button>';
    modal.classList.add("show");
    $("modalCancel").onclick = function () { modal.classList.remove("show"); };
    $("modalConfirmPlan").onclick = function () {
      var plan = $("newPlan").value;
      var days = parseInt($("planDays").value, 10) || 0;
      var reason = ($("planReason").value || "").trim();
      if (!reason) { alert("Reason is required."); return; }
      var patch = {
        plan: plan,
        subscriptionTier: plan,
        isPro: plan === "pro",
        isRegular: plan === "regular",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (days > 0) {
        var exp = new Date();
        exp.setDate(exp.getDate() + days);
        patch.proUntil = plan === "pro" ? exp : null;
        patch.regularUntil = plan === "regular" ? exp : null;
        patch.subscriptionExpires = exp;
      }
      $("modalConfirmPlan").disabled = true;
      db().collection("users").doc(u._id).set(patch, { merge: true }).then(function () {
        return writeAudit("subscription_change", { uid: u._id, email: u.email }, {
          from: planOf(u), to: plan, days: days, reason: reason
        });
      }).then(function () {
        modal.classList.remove("show");
        closeDrawer();
        alert("Plan update requested. If rules blocked billing fields, fulfill via Cloud Function.");
        navigate("students");
      }).catch(function (err) {
        $("modalConfirmPlan").disabled = false;
        alert("Could not update plan: " + (err.message || err) + "\nBilling fields are rule-protected — use a Cloud Function for production grants.");
      });
    };
  }

  MODULES.subscriptions = function (root) {
    return loadOverviewMetrics().then(function (m) {
      root.innerHTML =
        '<div class="ws-header"><div><h1>Subscriptions</h1><p>Plan distribution and manual grants (audited).</p></div></div>' +
        '<div class="metrics">' +
          '<div class="metric"><div class="label">Free</div><div class="value">' + m.free + '</div></div>' +
          '<div class="metric"><div class="label">Regular</div><div class="value">' + m.regular + '</div></div>' +
          '<div class="metric"><div class="label">Pro</div><div class="value">' + m.pro + '</div></div>' +
          '<div class="metric accent"><div class="label">Paid (sample)</div><div class="value">' + (m.regular + m.pro) + '</div></div>' +
        '</div>' +
        '<div class="card"><div class="card-bd"><p style="font-size:.88rem;line-height:1.55;color:var(--muted)">' +
        'Manual plan changes are available from <b>Students → student drawer → Change plan</b>. ' +
        'Production grants should go through a Cloud Function so billing fields stay rule-protected. Paystack is not connected yet.' +
        '</p><button type="button" class="btn btn-primary" id="goStudents">Open students</button></div></div>';
      $("goStudents").onclick = function () { navigate("students"); };
    });
  };

  MODULES.payments = function (root) {
    root.innerHTML =
      '<div class="ws-header"><div><h1>Payments</h1><p>Paystack integration-ready workspace.</p></div></div>' +
      '<div class="card"><div class="card-bd">' +
      '<div class="empty"><b>Payments integration not connected</b>' +
      '<span>Paystack has not been integrated yet. When it is, this workspace will show revenue, successful/failed transactions, and verification status. Secret keys stay server-side only.</span></div>' +
      '</div></div>';
    return Promise.resolve();
  };

  MODULES.resources = function (root) {
    root.innerHTML =
      '<div class="ws-header"><div><h1>Resources</h1><p>PDF and study resource moderation.</p></div>' +
      '<div class="ws-actions"><a class="btn btn-primary" href="pdf-resources.html">Open full resource admin</a></div></div>' +
      '<div class="card"><div class="card-bd"><p style="font-size:.88rem;color:var(--muted);margin-bottom:12px">' +
      'Existing PDF Resource Manager remains the full tooling surface (approve, reject, tiers, reports). ' +
      'It is linked here so the Command Center stays one product.</p>' +
      '<a class="btn" href="pdf-resources.html">Go to PDF Resources</a> ' +
      '<a class="btn" href="announcements.html">Legacy announcements page</a></div></div>';
    return Promise.resolve();
  };

    MODULES.academic = function (root) {
    root.innerHTML = '<div class="ws-header"><div><h1>Courses & CBT</h1><p>Live attempts from quiz_attempts + course codes.</p></div>' +
      '<div class="ws-actions"><button type="button" class="btn" id="btnRefreshAcademic">Refresh</button></div></div>' +
      '<div class="metrics" id="acMetrics"><div class="metric"><div class="label">Loading…</div><div class="value">—</div></div></div>' +
      '<div class="card"><div class="card-hd"><h2>Recent CBT attempts</h2></div><div class="card-bd"><div class="table-wrap"><table class="data" id="acTable"><thead><tr><th>When</th><th>Course</th><th>Score</th><th>Student</th></tr></thead><tbody></tbody></table></div></div></div>';

    function load() {
      var start = new Date(); start.setHours(0, 0, 0, 0);
      var d3 = new Date(Date.now() - 3 * 864e5);
      var d7 = new Date(Date.now() - 7 * 864e5);
      return db().collection("quiz_attempts").orderBy("createdAt", "desc").limit(200).get().catch(function () {
        return db().collection("quiz_attempts").limit(200).get();
      }).then(function (snap) {
        var today = 0, last3 = 0, last7 = 0, byCode = {};
        var rows = [];
        snap.forEach(function (doc) {
          var d = doc.data() || {};
          var ts = d.createdAt || d.finishedAt;
          var dt = ts && ts.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
          if (dt && dt >= start) today++;
          if (dt && dt >= d3) last3++;
          if (dt && dt >= d7) last7++;
          var code = d.code || d.subject || "—";
          byCode[code] = (byCode[code] || 0) + 1;
          rows.push({
            when: dt ? dt.toLocaleString() : "—",
            code: code,
            score: (d.score != null ? d.score : "—") + (d.total != null ? "/" + d.total : (d.percentage != null ? " (" + d.percentage + "%)" : "")),
            who: d.fullName || d.email || (d.uid ? String(d.uid).slice(0, 8) : "—")
          });
        });
        var topCodes = Object.keys(byCode).sort(function (a, b) { return byCode[b] - byCode[a]; }).slice(0, 8);
        document.getElementById("acMetrics").innerHTML =
          '<div class="metric"><div class="label">CBT today</div><div class="value">' + today + '</div></div>' +
          '<div class="metric"><div class="label">Last 3 days</div><div class="value">' + last3 + '</div></div>' +
          '<div class="metric"><div class="label">Last 7 days</div><div class="value">' + last7 + '</div></div>' +
          '<div class="metric"><div class="label">Top course</div><div class="value" style="font-size:1rem">' + (topCodes[0] || "—") + '</div><div class="hint">' + (topCodes[0] ? byCode[topCodes[0]] + " attempts" : "") + '</div></div>';
        var tb = document.querySelector("#acTable tbody");
        if (!rows.length) {
          tb.innerHTML = '<tr><td colspan="4"><div class="empty"><b>No attempts yet</b><span>Finish a CBT to populate this list.</span></div></td></tr>';
        } else {
          tb.innerHTML = rows.slice(0, 40).map(function (r) {
            return "<tr><td>" + esc(r.when) + "</td><td>" + esc(r.code) + "</td><td>" + esc(String(r.score)) + "</td><td>" + esc(r.who) + "</td></tr>";
          }).join("");
        }
      }).catch(function (err) {
        document.getElementById("acMetrics").innerHTML = '<div class="empty"><b>Load failed</b><span>' + esc(err.message) + '</span></div>';
      });
    }
    var br = document.getElementById("btnRefreshAcademic");
    if (br) br.onclick = load;
    return load();
  };


    MODULES.ai = function (root) {
    root.innerHTML = '<div class="ws-header"><div><h1>AI & Usage</h1><p>Nova spend from nova_usage + user novaDaily samples.</p></div>' +
      '<div class="ws-actions"><button type="button" class="btn" id="btnRefreshAi">Refresh</button></div></div>' +
      '<div class="metrics" id="aiMetrics"></div>' +
      '<div class="grid-3" style="margin-top:12px">' +
        '<div class="card"><div class="card-hd"><h2>Nova</h2></div><div class="card-bd"><div class="status-row"><span><span class="status-dot"></span>Backend</span><span class="pill ok">Render</span></div><p style="font-size:.8rem;color:var(--muted);margin-top:8px" id="aiNovaHint">Loading usage…</p></div></div>' +
        '<div class="card"><div class="card-hd"><h2>Study Lab</h2></div><div class="card-bd"><div class="status-row"><span><span class="status-dot"></span>Status</span><span class="pill ok">Active</span></div></div></div>' +
        '<div class="card"><div class="card-hd"><h2>Student Tools</h2></div><div class="card-bd"><div class="status-row"><span><span class="status-dot"></span>Status</span><span class="pill ok">Active</span></div></div></div>' +
      '</div>' +
      '<div class="card" style="margin-top:12px"><div class="card-hd"><h2>Daily Nova usage</h2></div><div class="card-bd"><div class="table-wrap"><table class="data" id="aiTable"><thead><tr><th>Date</th><th>Count</th></tr></thead><tbody></tbody></table></div></div></div>';

    function load() {
      var novaTotal = 0;
      var rows = [];
      return db().collection("nova_usage").limit(30).get().then(function (snap) {
        snap.forEach(function (doc) {
          var d = doc.data() || {};
          var c = Number(d.count || d.used || d.total || 0);
          novaTotal += c;
          rows.push({ date: d.date || doc.id, count: c });
        });
        rows.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
      }).catch(function () {}).then(function () {
        if (!novaTotal) {
          return db().collection("users").limit(300).get().then(function (us) {
            var today = new Date().toISOString().slice(0, 10);
            var sum = 0;
            us.forEach(function (doc) {
              var nd = (doc.data() || {}).novaDaily;
              if (nd && nd.date === today) sum += Number(nd.used || 0);
            });
            novaTotal = sum;
            if (sum) rows = [{ date: today + " (from users)", count: sum }];
          }).catch(function () {});
        }
      }).then(function () {
        document.getElementById("aiMetrics").innerHTML =
          '<div class="metric accent"><div class="label">Nova units (sample)</div><div class="value">' + novaTotal + '</div><div class="hint">From nova_usage or user novaDaily</div></div>' +
          '<div class="metric"><div class="label">Days logged</div><div class="value">' + rows.length + '</div></div>';
        var hint = document.getElementById("aiNovaHint");
        if (hint) hint.textContent = novaTotal ? ("Recorded usage units: " + novaTotal) : "No nova_usage docs yet — send Nova messages after rules publish.";
        var tb = document.querySelector("#aiTable tbody");
        if (!rows.length) tb.innerHTML = '<tr><td colspan="2"><div class="empty"><span>No usage rows yet.</span></div></td></tr>';
        else tb.innerHTML = rows.slice(0, 14).map(function (r) {
          return "<tr><td>" + esc(String(r.date)) + "</td><td>" + esc(String(r.count)) + "</td></tr>";
        }).join("");
      });
    }
    var b = document.getElementById("btnRefreshAi");
    if (b) b.onclick = load;
    return load();
  };


  MODULES.community = function (root) {
    return db().collection("resource_reports").where("status", "==", "open").limit(30).get().then(function (snap) {
      var rows = [];
      snap.forEach(function (d) { rows.push(Object.assign({ id: d.id }, d.data())); });
      root.innerHTML =
        '<div class="ws-header"><div><h1>Chat & Moderation</h1><p>Reports and health — not a private inbox.</p></div></div>' +
        '<div class="card"><div class="card-hd"><h2>Open reports</h2><span class="sub">' + rows.length + '</span></div><div class="card-bd">' +
        (rows.length ? rows.map(function (r) {
          return '<div class="list-item"><div class="ico danger">' + icons("shield") + '</div><div class="body"><b>' + esc(r.reason || "Report") + '</b><span>' + esc(r.resourceId || r.target || "") + '</span></div></div>';
        }).join("") : '<div class="empty"><span>No open reports.</span></div>') +
        '</div></div>' +
        '<div class="card" style="margin-top:14px"><div class="card-bd"><p style="font-size:.84rem;color:var(--muted)">Private conversations are not listed here. Moderation is report-driven and auditable.</p></div></div>';
    }).catch(function () {
      root.innerHTML = '<div class="empty"><b>Community</b><span>No report collection yet, or rules blocked read.</span></div>';
    });
  };

  MODULES.announcements = function (root) {
    root.innerHTML =
      '<div class="ws-header"><div><h1>Announcements</h1><p>Broadcasts to students.</p></div>' +
      '<div class="ws-actions"><a class="btn btn-primary" href="announcements.html">Open announcements admin</a></div></div>' +
      '<div class="card"><div class="card-bd"><p style="font-size:.88rem;color:var(--muted)">Use the dedicated announcements tool for create/edit/schedule with image and CTA. It remains linked inside the Command Center.</p></div></div>';
    return Promise.resolve();
  };

  MODULES.analytics = function (root) {
    return loadOverviewMetrics().then(function (m) {
      root.innerHTML =
        '<div class="ws-header"><div><h1>Analytics</h1><p>Cross-platform snapshot (no fabricated charts).</p></div></div>' +
        '<div class="metrics">' +
          '<div class="metric"><div class="label">Students (sample)</div><div class="value">' + m.totalStudents + '</div></div>' +
          '<div class="metric"><div class="label">Pro</div><div class="value">' + m.pro + '</div></div>' +
          '<div class="metric"><div class="label">Regular</div><div class="value">' + m.regular + '</div></div>' +
          '<div class="metric"><div class="label">Pending resources</div><div class="value">' + m.pendingResources + '</div></div>' +
        '</div>' +
        '<div class="card"><div class="card-bd"><div class="empty"><b>Not enough series data yet</b><span>Time-series revenue and retention charts appear when Paystack and aggregate events are connected.</span></div></div></div>';
    });
  };

  MODULES.admins = function (root) {
    if (!can("manage_admins")) {
      root.innerHTML = '<div class="empty"><b>Restricted</b><span>Only SUPER_ADMIN can manage administrators.</span></div>';
      return Promise.resolve();
    }
    return db().collection("admins").limit(50).get().then(function (snap) {
      var rows = [];
      snap.forEach(function (d) { rows.push(Object.assign({ id: d.id }, d.data())); });
      root.innerHTML =
        '<div class="ws-header"><div><h1>Administrators</h1><p>Roles and access.</p></div></div>' +
        '<div class="card"><div class="table-wrap"><table class="data"><thead><tr><th>Email</th><th>Role</th><th>Status</th></tr></thead><tbody>' +
        (rows.length ? rows.map(function (a) {
          return '<tr><td>' + esc(a.email || a.id) + '</td><td>' + esc(a.role || "ADMIN") + '</td><td>' +
            (a.active === false ? '<span class="pill danger">Inactive</span>' : '<span class="pill ok">Active</span>') + '</td></tr>';
        }).join("") : '<tr><td colspan="3"><div class="empty">No admin documents yet. Bootstrap email seeds SUPER_ADMIN on first login.</div></td></tr>') +
        '</tbody></table></div></div>';
    }).catch(function (err) {
      root.innerHTML = '<div class="empty"><b>Could not load admins</b><span>' + esc(err.message) + ' — deploy rules for admins collection.</span></div>';
    });
  };


  MODULES.referrals = function (root) {
    root.innerHTML =
      '<div class="ws-header"><div><h1>Referrals</h1><p>Review confirmed invites. You award CBT trials — nothing is auto-granted.</p></div>' +
      '<button type="button" class="btn primary" id="refReload">Refresh</button></div>' +
      '<div class="metrics" id="refMetrics"><div class="metric"><div class="label">Loading</div><div class="value">…</div></div></div>' +
      '<div class="card" style="margin-top:14px"><div class="card-hd"><h2>Top referrers</h2></div><div class="card-bd"><div class="table-wrap"><table class="data" id="refTable"><thead><tr>' +
      '<th>Student</th><th>Code</th><th>Confirmed</th><th>Trials bonus</th><th>Award</th></tr></thead><tbody></tbody></table></div></div></div>' +
      '<div class="card" style="margin-top:14px"><div class="card-hd"><h2>Recent referral links</h2></div><div class="card-bd" id="refRecent"><div class="skeleton"></div></div></div>';

    function load() {
      return db().collection("referrals").limit(500).get().then(function (snap) {
        var byRef = {};
        var recent = [];
        snap.forEach(function (d) {
          var r = Object.assign({ id: d.id }, d.data());
          if (r.status !== "confirmed") return;
          recent.push(r);
          var uid = r.referrerUid;
          if (!uid) return;
          if (!byRef[uid]) byRef[uid] = { uid: uid, count: 0, code: r.referralCode || "", emails: [] };
          byRef[uid].count += 1;
          if (r.referredEmail) byRef[uid].emails.push(r.referredEmail);
        });
        var list = Object.keys(byRef).map(function (k) { return byRef[k]; });
        list.sort(function (a, b) { return b.count - a.count; });
        var total = recent.length;
        $("refMetrics").innerHTML =
          '<div class="metric"><div class="label">Confirmed links</div><div class="value">' + total + '</div></div>' +
          '<div class="metric"><div class="label">Active referrers</div><div class="value">' + list.length + '</div></div>' +
          '<div class="metric"><div class="label">Ready for award</div><div class="value">' + list.filter(function (x) { return x.count >= 1; }).length + '</div><div class="hint">Admin decides amount</div></div>';

        // hydrate names + bonus
        var tb = qs("#refTable tbody");
        if (!list.length) {
          tb.innerHTML = '<tr><td colspan="5"><div class="empty"><b>No referrals yet</b><span>When students enter a HUB- code at signup, they appear here.</span></div></td></tr>';
        } else {
          tb.innerHTML = list.slice(0, 80).map(function (x) {
            return '<tr data-uid="' + esc(x.uid) + '"><td class="ref-name">' + esc(x.uid.slice(0, 8)) + '…</td><td><code>' + esc(x.code) + '</code></td><td><b>' + x.count + '</b></td><td class="ref-bonus">…</td>' +
              '<td><input type="number" class="ref-award-n" min="1" max="50" value="' + Math.min(10, Math.max(1, x.count)) + '" style="width:64px;padding:6px;border-radius:8px;border:1px solid var(--border)" /> ' +
              '<button type="button" class="btn primary ref-award-btn" style="padding:6px 10px;font-size:.8rem">Award trials</button></td></tr>';
          }).join("");
        }

        // load user docs for names / current bonus
        var uids = list.slice(0, 80).map(function (x) { return x.uid; });
        var chain = Promise.resolve();
        uids.forEach(function (uid) {
          chain = chain.then(function () {
            return db().collection("users").doc(uid).get().then(function (us) {
              var d = us.exists ? us.data() : {};
              var row = qs('tr[data-uid="' + uid + '"]');
              if (!row) return;
              var name = d.fullName || d.displayName || d.email || uid.slice(0, 10);
              var email = d.email || "";
              qs(".ref-name", row).innerHTML = "<b>" + esc(name) + "</b><br><span style=\"font-size:.75rem;opacity:.7\">" + esc(email) + "</span>";
              qs(".ref-bonus", row).textContent = String(Number(d.cbtTrialsBonus) || 0);
            }).catch(function () {});
          });
        });

        recent.sort(function (a, b) {
          var ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
          var tb2 = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
          return tb2 - ta;
        });
        $("refRecent").innerHTML = recent.slice(0, 40).length
          ? '<div class="table-wrap"><table class="data"><thead><tr><th>When</th><th>Referrer</th><th>Referred</th><th>Code</th></tr></thead><tbody>' +
            recent.slice(0, 40).map(function (r) {
              return "<tr><td>" + esc(fmtDate(r.createdAt)) + "</td><td>" + esc((r.referrerUid || "").slice(0, 10)) +
                "</td><td>" + esc(r.referredName || r.referredEmail || r.referredUid) + "</td><td><code>" + esc(r.referralCode || "") + "</code></td></tr>";
            }).join("") + "</tbody></table></div>"
          : '<div class="empty"><span>No links yet.</span></div>';

        qsa(".ref-award-btn").forEach(function (btn) {
          btn.onclick = function () {
            var row = btn.closest("tr");
            var uid = row.getAttribute("data-uid");
            var n = Math.max(1, Math.min(50, parseInt(qs(".ref-award-n", row).value, 10) || 1));
            if (!confirm("Award +" + n + " CBT trial(s) to this referrer? Only do this after you trust the invites are real.")) return;
            btn.disabled = true;
            db().collection("users").doc(uid).get().then(function (us) {
              var cur = us.exists ? (Number((us.data() || {}).cbtTrialsBonus) || 0) : 0;
              var next = cur + n;
              return db().collection("users").doc(uid).set({
                cbtTrialsBonus: next,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
              }, { merge: true }).then(function () {
                return db().collection("referral_rewards").add({
                  uid: uid,
                  trialsAwarded: n,
                  bonusAfter: next,
                  grantedByAdmin: state.user.email || state.user.uid,
                  grantedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
              }).then(function () {
                writeAudit("referral_trials_award", { uid: uid }, { trials: n, bonusAfter: next });
                qs(".ref-bonus", row).textContent = String(next);
                btn.disabled = false;
                alert("Awarded +" + n + " trials. New bonus total: " + next);
              });
            }).catch(function (err) {
              btn.disabled = false;
              alert("Award failed: " + (err.message || err));
            });
          };
        });
        return chain;
      }).catch(function (err) {
        root.innerHTML = '<div class="empty"><b>Could not load referrals</b><span>' + esc(err.message) + " — publish rules for referrals collection.</span></div>";
      });
    }

    $("refReload").onclick = function () { load(); };
    return load();
  };

  MODULES.config = function (root) {
    var defaults = {
      cbtTrialsFree: 3,
      cbtTrialsRegular: 30,
      cbtTrialsPro: 999,
      novaDailyFree: 40,
      novaDailyRegular: 120,
      novaDailyPro: 400,
      promoNote: ""
    };
    root.innerHTML =
      '<div class="ws-header"><div><h1>Configuration</h1><p>Live limits for free / promo plans — no code deploy needed.</p></div>' +
      '<button type="button" class="btn primary" id="cfgSave">Save limits</button></div>' +
      '<div class="card"><div class="card-hd"><h2>CBT free trials</h2></div><div class="card-bd">' +
        '<p style="margin:0 0 12px;color:var(--muted);font-size:.9rem">Free students use this global trial count. Raise it during a promo (e.g. 10), then set it back. Paid plans stay unlimited / high caps.</p>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">' +
          '<label style="display:flex;flex-direction:column;gap:6px;font-size:.8rem;font-weight:600">Free plan trials' +
            '<input type="number" id="cfgCbtFree" min="0" max="500" step="1" style="padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:inherit;font-size:1rem" /></label>' +
          '<label style="display:flex;flex-direction:column;gap:6px;font-size:.8rem;font-weight:600">Regular plan (soft cap)' +
            '<input type="number" id="cfgCbtReg" min="0" max="9999" step="1" style="padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:inherit;font-size:1rem" /></label>' +
          '<label style="display:flex;flex-direction:column;gap:6px;font-size:.8rem;font-weight:600">Pro plan (soft cap)' +
            '<input type="number" id="cfgCbtPro" min="0" max="9999" step="1" style="padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:inherit;font-size:1rem" /></label>' +
        '</div>' +
      '</div></div>' +
      '<div class="card" style="margin-top:14px"><div class="card-hd"><h2>Nova daily Charge (optional)</h2></div><div class="card-bd">' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">' +
          '<label style="display:flex;flex-direction:column;gap:6px;font-size:.8rem;font-weight:600">Free / day' +
            '<input type="number" id="cfgNovaFree" min="1" max="2000" step="1" style="padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:inherit;font-size:1rem" /></label>' +
          '<label style="display:flex;flex-direction:column;gap:6px;font-size:.8rem;font-weight:600">Regular / day' +
            '<input type="number" id="cfgNovaReg" min="1" max="5000" step="1" style="padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:inherit;font-size:1rem" /></label>' +
          '<label style="display:flex;flex-direction:column;gap:6px;font-size:.8rem;font-weight:600">Pro / day' +
            '<input type="number" id="cfgNovaPro" min="1" max="9999" step="1" style="padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:inherit;font-size:1rem" /></label>' +
        '</div>' +
      '</div></div>' +
      '<div class="card" style="margin-top:14px"><div class="card-hd"><h2>Promo note (optional)</h2></div><div class="card-bd">' +
        '<input type="text" id="cfgPromo" placeholder="e.g. Promo week: 10 free CBT trials" maxlength="120" style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:inherit;font-size:.95rem;box-sizing:border-box" />' +
        '<p id="cfgStatus" style="margin:10px 0 0;font-size:.85rem;color:var(--muted)"></p>' +
      '</div></div>';

    function fill(data) {
      var d = Object.assign({}, defaults, data || {});
      $("cfgCbtFree").value = d.cbtTrialsFree;
      $("cfgCbtReg").value = d.cbtTrialsRegular;
      $("cfgCbtPro").value = d.cbtTrialsPro;
      $("cfgNovaFree").value = d.novaDailyFree;
      $("cfgNovaReg").value = d.novaDailyRegular;
      $("cfgNovaPro").value = d.novaDailyPro;
      $("cfgPromo").value = d.promoNote || "";
    }

    return db().collection("system").doc("limits").get().then(function (snap) {
      fill(snap.exists ? snap.data() : {});
    }).catch(function () {
      fill({});
    }).then(function () {
      $("cfgSave").onclick = function () {
        var payload = {
          cbtTrialsFree: Math.max(0, parseInt($("cfgCbtFree").value, 10) || 0),
          cbtTrialsRegular: Math.max(0, parseInt($("cfgCbtReg").value, 10) || 0),
          cbtTrialsPro: Math.max(0, parseInt($("cfgCbtPro").value, 10) || 0),
          novaDailyFree: Math.max(1, parseInt($("cfgNovaFree").value, 10) || 40),
          novaDailyRegular: Math.max(1, parseInt($("cfgNovaReg").value, 10) || 120),
          novaDailyPro: Math.max(1, parseInt($("cfgNovaPro").value, 10) || 400),
          promoNote: String($("cfgPromo").value || "").trim().slice(0, 120),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedBy: state.user ? state.user.uid : null
        };
        $("cfgStatus").textContent = "Saving…";
        db().collection("system").doc("limits").set(payload, { merge: true }).then(function () {
          $("cfgStatus").textContent = "Saved. Free CBT trials are now " + payload.cbtTrialsFree + " (students pick this up on next CBT load).";
          writeAudit("limits_update", { collection: "system/limits" }, {
            cbtTrialsFree: payload.cbtTrialsFree,
            promoNote: payload.promoNote
          });
        }).catch(function (err) {
          $("cfgStatus").textContent = "Save failed: " + (err.message || err) + " — publish Firestore rules for system/limits.";
        });
      };
    });
  };

  MODULES.audit = function (root) {
    return db().collection("admin_audit").orderBy("createdAt", "desc").limit(40).get().then(function (snap) {
      var rows = [];
      snap.forEach(function (d) { rows.push(d.data()); });
      root.innerHTML =
        '<div class="ws-header"><div><h1>Audit log</h1><p>Sensitive admin actions.</p></div></div>' +
        '<div class="card"><div class="card-bd">' +
        (rows.length ? rows.map(function (a) {
          return '<div class="list-item"><div class="ico">' + icons("list") + '</div><div class="body"><b>' + esc(a.action) + '</b><span>' +
            esc(a.adminName || a.adminEmail || "") +
            (a.meta && a.meta.reason ? " · " + esc(a.meta.reason) : "") +
            '</span></div><time>' + esc(fmtDate(a.createdAt)) + " " + esc(fmtTime(a.createdAt)) + '</time></div>';
        }).join("") : '<div class="empty"><span>No audit events yet.</span></div>') +
        '</div></div>';
    }).catch(function (err) {
      root.innerHTML = '<div class="empty"><b>Audit log</b><span>' + esc(err.message || "Deploy rules for admin_audit") + '</span></div>';
    });
  };

  /* ── Boot ───────────────────────────────────────────────── */
  function showGate(mode, message) {
    $("appShell").classList.add("hidden");
    $("gate").classList.remove("hidden");
    $("gateTitle").textContent = mode === "denied" ? "Access denied" : "Admin Command Center";
    $("gateMsg").textContent = message || "";
    $("gateAction").textContent = mode === "denied" ? "Back to Codex Hub" : "Sign in";
    $("gateAction").onclick = function () {
      if (mode === "denied") {
        window.location.href = "../app/home.html";
      } else {
        window.location.href = "../login.html?next=admin";
      }
    };
  }

  function showApp() {
    $("gate").classList.add("hidden");
    $("appShell").classList.remove("hidden");
    var name = (state.profile && (state.profile.fullName || state.profile.displayName)) || state.user.displayName || "Admin";
    $("adminName").textContent = name;
    $("adminRole").textContent = roleLabel(state.role);
        var photo = "";
    if (state.profile) {
      photo = state.profile.photoURL || state.profile.avatarUrl || state.profile.photo || "";
    }
    if (!photo && state.user) photo = state.user.photoURL || "";
    var av = $("adminAvatar");
    if (photo && /^https?:\/\//i.test(photo)) {
      av.innerHTML = "";
      var img = document.createElement("img");
      img.src = photo;
      img.alt = "";
      img.style.cssText = "width:32px;height:32px;border-radius:50%;object-fit:cover";
      img.onerror = function () { av.textContent = (name || "A").charAt(0); };
      av.appendChild(img);
    } else {
      av.innerHTML = avatarHtml(name, "");
    }
    db().collection("public_profiles").doc(state.user.uid).get().then(function (snap) {
      if (!snap.exists) return;
      var url = (snap.data() || {}).photoURL || (snap.data() || {}).avatarUrl || "";
      if (!url || !/^https?:\/\//i.test(url)) return;
      av.innerHTML = "";
      var img2 = document.createElement("img");
      img2.src = url;
      img2.alt = "";
      img2.style.cssText = "width:32px;height:32px;border-radius:50%;object-fit:cover";
      av.appendChild(img2);
    }).catch(function () {});

    renderNav();
    navigate("overview");
    writeAudit("admin_login", { uid: state.user.uid }, { role: state.role });
  }

  function boot() {
    if (typeof firebase === "undefined") {
      showGate("login", "Firebase failed to load.");
      return;
    }
    firebase.auth().onAuthStateChanged(function (user) {
      if (!user) {
        showGate("login", "Sign in with an administrator account to continue.");
        return;
      }
      state.user = user;
      Promise.all([resolveAdminRole(user), loadProfile(user.uid)]).then(function (pair) {
        state.role = pair[0];
        state.profile = pair[1] || {};
        if (!state.role) {
          showGate("denied", "This account is not an administrator. Contact a SUPER ADMIN if you need access.");
          return;
        }
        showApp();
      });
    });

    $("menuToggle").onclick = function () {
      $("sidebar").classList.add("open");
      $("sidebarBackdrop").classList.add("show");
    };
    $("sidebarBackdrop").onclick = closeMobileNav;
    $("btnCloseDrawer").onclick = closeDrawer;
    $("drawerBackdrop").onclick = closeDrawer;
    $("btnLogout").onclick = function () {
      firebase.auth().signOut().then(function () {
        window.location.href = "../login.html";
      });
    };
    $("globalSearch").onkeydown = function (e) {
      if (e.key !== "Enter") return;
      var q = ($("globalSearch").value || "").trim();
      if (!q) return;
      navigate("students");
      setTimeout(function () {
        var inp = $("studentSearch");
        if (inp) { inp.value = q; $("btnLoadStudents").click(); }
      }, 200);
    };
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
