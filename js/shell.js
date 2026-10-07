/* Classic script — works on file://. Shell mounts IMMEDIATELY (no auth wait). */
(function (w) {
  "use strict";
  /* Global theme + reduced-motion — apply ASAP so header/nav never flash white */
  try {
    if (localStorage.getItem("codex_dark") === "1") {
      document.documentElement.classList.add("theme-dark");
    } else {
      document.documentElement.classList.remove("theme-dark");
    }
    if (localStorage.getItem("codex_reduce_motion") === "1") {
      document.documentElement.classList.add("reduce-motion");
    }
  } catch (e) {}

  /* PWA: every app/*.html page loads shell.js, so this is the one place that
     guarantees the manifest is linked and the service worker is registered
     app-wide, without having to touch every individual tool/page file. */
  try {
    // Every page that loads shell.js does so as "../js/shell.js" (app/ and
    // admin/ are always exactly one level under the site root), so the
    // matching relative path back to root is always "../" from here — this
    // keeps things working whether the site is hosted at a domain root or a
    // subpath (e.g. a GitHub Pages project page).
    if (!document.querySelector('link[rel="manifest"]')) {
      var manifestLink = document.createElement("link");
      manifestLink.rel = "manifest";
      manifestLink.href = "../manifest.json";
      document.head.appendChild(manifestLink);
    }
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("../service-worker.js", { scope: "../" }).catch(function () {});
      });
    }
  } catch (e) {}
  var OLD = "../../codex-hub/Codex-hub-prime-question-pipeline/";
  var RESOURCE_PAGE = "resources.html";

  var NAV = [
    { id: "ai", href: "ai-lab.html", label: "AI Lab", icon: "spark" },
    { id: "chats", href: "chats.html", label: "Chats", icon: "chat" },
    { id: "home", href: "home.html", label: "Home", icon: "home", center: true },
    { id: "board", href: "leaderboard.html", label: "Ranks", icon: "board" },
    { id: "profile", href: "profile.html", label: "Profile", icon: "user" }
  ];

  /* Desktop sidebar links (full app map) */
  var SIDE = [
    { id: "home", href: "home.html", label: "Home", icon: "home" },
    { id: "cbt", href: "course-library.html?mode=cbt", label: "CBT", icon: "cbt" },
    { id: "notes", href: "course-library.html?mode=notes", label: "Notes", icon: "notes" },
    { id: "pdf", href: RESOURCE_PAGE, label: "PDF Library", icon: "pdf" },
    { id: "todo", href: "todo.html", label: "Study Planner", icon: "check" },
    { id: "stats", href: "stats.html", label: "Stats", icon: "board" },
    { id: "ai", href: "ai-lab.html", label: "Nova AI", icon: "spark" },
    { id: "chats", href: "chats.html", label: "Chats", icon: "chat" },
    { id: "tools", href: "student-tools.html", label: "Tools", icon: "tools" },
    { id: "profile", href: "profile.html", label: "Settings", icon: "user" }
  ];

  var ICONS = {
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l1.4 5.2L18 9.6l-4.6 1.4L12 16l-1.4-5-4.6-1.4 4.6-1.4z"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 6h14v10H8l-3 3z"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 11l8-7 8 7v9H4z"/></svg>',
    board: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 19V10M12 19V5M18 19v-7"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3"/><path d="M5 19c1.5-3 4-4.5 7-4.5S17.5 16 19 19"/></svg>',
    menu: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 7h14M5 12h14M5 17h10"/></svg>',
    bell: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 9a6 6 0 0112 0c0 7 2 7 2 9H4c0-2 2-2 2-9"/><path d="M10 20a2 2 0 004 0"/></svg>',
    cbt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 20h8"/></svg>',
    notes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 4h9l3 3v13H6z"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 3h7l4 4v14H7z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 12.5l4 4L19 7"/></svg>',
    tools: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 7l3 3-8 8H6v-3z"/></svg>',
    search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3-3"/></svg>'
  };

  function initialsOf(name) {
    return (name || "Student").split(" ").map(function (p) { return p[0]; }).slice(0, 2).join("").toUpperCase() || "ST";
  }

  
  var _lastProfile = null;

  function avatarHtml(initials, profile) {
    profile = profile || _lastProfile || {};
    if (window.CodexMedia && CodexMedia.resolveAvatar) {
      return CodexMedia.resolveAvatar(profile, initials);
    }
    return '<span class="avatar-ini">' + String(initials || "ST") + '</span>';
  }

  /** Update every avatar chip (mobile topbar + desktop desk-user). */
  function paintAvatars(initials, profile) {
    var html = avatarHtml(initials, profile);
    document.querySelectorAll(".avatar, .desk-user .avatar, a.avatar").forEach(function (av) {
      av.innerHTML = html;
    });
  }

  /** Merge public_profiles photo/avatarKey when users doc is missing them. */
  function enrichProfileAvatar(profile, uid) {
    profile = profile || {};
    if ((profile.photoURL || profile.avatarUrl || profile.photo || profile.avatarKey) && !uid) {
      return Promise.resolve(profile);
    }
    if (!uid || !window.firebase || !firebase.firestore) return Promise.resolve(profile);
    if (profile.photoURL || profile.avatarUrl || profile.photo || profile.avatarKey) {
      return Promise.resolve(profile);
    }
    return firebase.firestore().collection("public_profiles").doc(uid).get()
      .then(function (snap) {
        if (!snap.exists) return profile;
        var p = snap.data() || {};
        if (p.photoURL && !profile.photoURL) profile.photoURL = p.photoURL;
        if (p.avatarUrl && !profile.avatarUrl) profile.avatarUrl = p.avatarUrl;
        if (p.avatarKey && !profile.avatarKey) profile.avatarKey = p.avatarKey;
        if (p.displayName && !profile.fullName) profile.fullName = p.displayName;
        return profile;
      })
      .catch(function () { return profile; });
  }

  function applyShellUser(opts) {
    opts = opts || {};
    var profile = opts.profile || _lastProfile || {};
    if (opts.profile) _lastProfile = opts.profile;
    var user = opts.user || {};
    var name = user.fullName || profile.fullName || profile.displayName || "Student";
    var initials = initialsOf(name);
    var sub = user.subline || "";
    paintAvatars(initials, profile);
    var du = document.querySelector(".drawer-user");
    if (du) du.textContent = name;
    var pu = document.querySelector(".desk-user-name");
    if (pu) pu.textContent = name;
    var ps = document.querySelector(".desk-user-sub");
    if (ps && sub) ps.textContent = sub;
    document.querySelectorAll(".top-brand strong").forEach(function (el) {
      if (opts.title) el.textContent = opts.title;
    });
  }

  
  function injectAdminEntry(user) {
    if (!user || !user.uid || !window.firebase || !firebase.firestore) return;
    var existing = document.getElementById("codexAdminEntry");
    if (existing) return;
    var email = (user.email || "").toLowerCase();
    var bootstrap = email === "codexhub16@gmail.com";
    function addLink() {
      var drawer = document.querySelector(".drawer, aside.drawer, #drawerNav, .drawer-nav");
      var host = drawer || document.querySelector(".drawer-body, .drawer-content, .nav-drawer");
      if (!host) {
        // fallback: floating chip near avatar area
        var top = document.querySelector(".top-bar, .topbar, header");
        if (!top || document.getElementById("codexAdminEntry")) return;
        var a = document.createElement("a");
        a.id = "codexAdminEntry";
        a.href = "../admin/admin.html";
        a.textContent = "Admin";
        a.style.cssText = "margin-left:8px;font-size:.72rem;font-weight:800;padding:6px 10px;border-radius:999px;background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#fff;text-decoration:none";
        top.appendChild(a);
        return;
      }
      if (document.getElementById("codexAdminEntry")) return;
      var a = document.createElement("a");
      a.id = "codexAdminEntry";
      a.href = (location.pathname.indexOf("/app/") >= 0 ? "../admin/admin.html" : "admin/admin.html");
      a.className = "drawer-link admin-link";
      a.innerHTML = "<strong>Admin</strong><span>Command Center</span>";
      a.style.cssText = "display:flex;flex-direction:column;gap:2px;padding:12px 14px;margin:8px 10px;border-radius:12px;background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#fff;text-decoration:none;font-size:.86rem";
      host.insertBefore(a, host.firstChild);
    }
    firebase.firestore().collection("admins").doc(user.uid).get().then(function (snap) {
      if (snap.exists && snap.data() && snap.data().active !== false) addLink();
      else if (bootstrap) addLink();
    }).catch(function () {
      if (bootstrap) addLink();
    });
  }


  
  function ensureCodexModal() {
    if (window.CodexModal) return;
    if (document.getElementById("codex-modal-src")) return;
    var s = document.createElement("script");
    s.id = "codex-modal-src";
    s.src = (function () {
      var scripts = document.getElementsByTagName("script");
      for (var i = 0; i < scripts.length; i++) {
        var src = scripts[i].src || "";
        if (src.indexOf("shell.js") >= 0) return src.replace(/shell\.js(\?.*)?$/, "codex-modal.js");
      }
      return "../js/codex-modal.js";
    })();
    document.head.appendChild(s);
  }
  ensureCodexModal();

  function ensureOnboarding() {
    function run() {
      try {
        if (window.CodexOnboarding && CodexOnboarding.start) CodexOnboarding.start();
      } catch (e) {}
    }
    if (window.CodexOnboarding) { run(); return; }
    if (document.getElementById("codex-onboarding-src")) { run(); return; }
    var s = document.createElement("script");
    s.id = "codex-onboarding-src";
    s.src = (function () {
      var scripts = document.getElementsByTagName("script");
      for (var i = 0; i < scripts.length; i++) {
        var src = scripts[i].src || "";
        if (src.indexOf("shell.js") >= 0) return src.replace(/shell\.js(\?.*)?$/, "onboarding.js");
      }
      return "../js/onboarding.js";
    })();
    s.onload = run;
    s.onerror = function () {};
    document.head.appendChild(s);
  }

  function mountShell(opts) {
    opts = opts || {};
    if (opts.profile) _lastProfile = opts.profile;
    var page = opts.page || "home";
    var title = opts.title || "Codex Hub";
    var user = opts.user || {};
    var name = user.fullName || (opts.profile && (opts.profile.fullName || opts.profile.displayName)) || "Student";
    var initials = initialsOf(name);
    var sub = user.subline || "";
    var uid = (opts.user && opts.user.uid) || (opts.profile && opts.profile.uid) || null;
    try {
      if (!uid && window.firebase && firebase.auth && firebase.auth().currentUser) {
        uid = firebase.auth().currentUser.uid;
      }
    } catch (e) {}

    if (document.querySelector(".topbar") || document.querySelector(".desk-topbar")) {
      applyShellUser(opts);
      // Fill missing avatar from public_profiles if needed
      enrichProfileAvatar(opts.profile || _lastProfile, uid).then(function (p) {
        try { injectAdminEntry(opts.user || user); } catch (e) {}
        try { ensureOnboarding(); } catch (e2) {}

        if (p) {
          _lastProfile = Object.assign({}, _lastProfile || {}, p);
          applyShellUser({ profile: _lastProfile, user: user, title: title });
        }
      });
      return;
    }

    /* —— Mobile topbar —— */
    var top = document.createElement("header");
    top.className = "topbar";
    top.innerHTML =
      '<button class="icon-btn" id="menuBtn" aria-label="Open menu">' + ICONS.menu + '</button>' +
      '<a class="top-brand" href="home.html" aria-label="Home">' +
        '<img src="../assets/logo.png" alt="" width="28" height="28">' +
        '<strong>' + title + '</strong></a>' +
      '<div class="top-actions">' +
        '<button class="icon-btn bell-btn" id="notifBtn" aria-label="Notifications" type="button">' +
          ICONS.bell + '<span class="bell-dot" id="notifDot" hidden></span></button>' +
        '<a class="avatar" href="profile.html" aria-label="Profile">' + avatarHtml(initials, opts.profile || _lastProfile) + '</a></div>';

    /* —— Mobile bottom nav —— */
    var nav = document.createElement("nav");
    nav.className = "bottom-nav";
    nav.setAttribute("aria-label", "Primary");
    nav.innerHTML = NAV.map(function (item) {
      var active = item.id === page ? " active" : "";
      var cls = item.center ? "nav-item center" : "nav-item";
      return '<a class="' + cls + active + '" href="' + item.href + '" data-nav-id="' + item.id + '">' +
        '<span class="nav-ico' + (item.center ? " dot" : "") + '">' + ICONS[item.icon] + (item.id === 'chats' ? '<span class="chat-nav-badge" hidden></span>' : '') + '</span>' +
        '<span class="nav-label">' + item.label + '</span></a>';
    }).join("");

    /* —— Drawer (mobile) —— */
    var backdrop = document.createElement("div");
    backdrop.className = "drawer-backdrop";
    var drawer = document.createElement("aside");
    drawer.className = "drawer";
    var di = {
      home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
      cbt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 20h8"/></svg>',
      notes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 4h9l3 3v13H6z"/><path d="M9 12h6M9 16h4"/></svg>',
      pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5"/></svg>',
      plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/></svg>',
      tools: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 7l3 3-8 8H6v-3z"/><path d="M12 5l2-2 5 5-2 2"/></svg>',
      ai: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/><circle cx="12" cy="19" r="1.5"/></svg>',
      nova: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/></svg>',
      lab: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 3h6v6l4 8a3 3 0 01-2.7 4H7.7A3 3 0 015 17l4-8V3z"/><path d="M9 3h6"/></svg>',
      chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6a3 3 0 013-3h10a3 3 0 013 3v8a3 3 0 01-3 3H10l-4 3v-3H7a3 3 0 01-3-3V6z"/></svg>',
      ranks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0V4z"/><path d="M7 4H4v2a3 3 0 003 3M17 4h3v2a3 3 0 01-3 3"/></svg>',
      stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V5M10 19V9M16 19v-6M22 19H2"/></svg>',
      profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5"/></svg>',
      settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
      lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>',
      upgrade: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3z"/></svg>',
      about: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></svg>'
    };
    function dlink(href, icon, label) {
      return '<a class="drawer-link" href="' + href + '"><span class="dico">' + icon + '</span><span>' + label + '</span></a>';
    }
    drawer.innerHTML =
      '<div class="logo-lockup"><img src="../assets/logo.png" alt=""><span>Codex Hub</span></div>' +
      '<p class="drawer-user">' + name + '</p>' +
      '<div class="drawer-acc open" data-acc="home">' +
        '<button type="button" class="drawer-acc-btn" data-acc-toggle="home"><span>Home &amp; quick access</span><span class="acc-chev">▼</span></button>' +
        '<div class="drawer-acc-body">' +
          dlink("home.html", di.home, "Home dashboard") +
          dlink("course-library.html?mode=cbt", di.cbt, "Start CBT") +
          dlink("course-library.html?mode=notes", di.notes, "Notes") +
          dlink("resources.html", di.pdf, "PDF library") +
          dlink("todo.html", di.plan, "Study planner") +
          dlink("student-tools.html", di.tools, "Student tools") +
        '</div></div>' +
      '<div class="drawer-acc open" data-acc="ai">' +
        '<button type="button" class="drawer-acc-btn" data-acc-toggle="ai"><span>AI Lab</span><span class="acc-chev">▼</span></button>' +
        '<div class="drawer-acc-body">' +
          dlink("ai-lab.html", di.ai, "AI Lab home") +
          dlink("nova.html", di.nova, "Nova AI") +
          dlink("study-lab.html", di.lab, "Study Lab") +
        '</div></div>' +
      '<div class="drawer-acc" data-acc="social">' +
        '<button type="button" class="drawer-acc-btn" data-acc-toggle="social"><span>Social</span><span class="acc-chev">▼</span></button>' +
        '<div class="drawer-acc-body">' +
          dlink("chats.html", di.chat, "Chats") +
          dlink("leaderboard.html", di.ranks, "Leaderboard") +
          dlink("stats.html", di.stats, "Statistics") +
        '</div></div>' +
      '<div class="drawer-acc" data-acc="account">' +
        '<button type="button" class="drawer-acc-btn" data-acc-toggle="account"><span>Account</span><span class="acc-chev">▼</span></button>' +
        '<div class="drawer-acc-body">' +
          dlink("profile.html", di.profile, "Profile") +
          dlink("settings.html", di.settings, "Settings") +
          dlink("change-password.html", di.lock, "Change password") +
          dlink("pricing.html", di.upgrade, "Upgrade plan") +
          dlink("about.html", di.about, "About us") +
        '</div></div>' +
      '<button class="linkish" id="signOutBtn" type="button">Sign out</button>';

    /* —— Desktop sidebar + top strip —— */
    var deskSide = document.createElement("aside");
    deskSide.className = "desk-sidebar";
    deskSide.innerHTML =
      '<a class="desk-brand" href="home.html"><img src="../assets/logo.png" alt=""><span>Codex Hub</span></a>' +
      '<nav class="desk-nav">' +
      SIDE.map(function (item) {
        var active = item.id === page ? " active" : "";
        return '<a class="desk-link' + active + '" href="' + item.href + '" data-nav-id="' + item.id + '">' +
          '<span style="position:relative;display:inline-flex">' + (ICONS[item.icon] || ICONS.home) + (item.id === 'chats' ? '<span class="chat-nav-badge" hidden></span>' : '') + '</span><span>' + item.label + '</span></a>';
      }).join("") +
      '</nav>' +
      '<div class="desk-side-foot"><p>Keep going!</p><span>Your future self will thank you.</span></div>';

    var deskTop = document.createElement("header");
    deskTop.className = "desk-topbar" + (page === "home" ? " desk-search-home" : " desk-search-hidden");
    deskTop.innerHTML =
      '<div class="desk-search" role="button" tabindex="0" aria-label="Search courses">' + ICONS.search +
        '<input type="search" placeholder="Search courses…" aria-label="Search courses" readonly></div>' +
      '<div class="desk-top-right">' +
        '<button class="icon-btn bell-btn" id="notifBtnDesk" type="button" aria-label="Notifications">' +
          ICONS.bell + '<span class="bell-dot" hidden></span></button>' +
        '<a class="desk-user" href="profile.html">' +
          '<span class="avatar">' + avatarHtml(initials, opts.profile || _lastProfile) + '</span>' +
          '<span class="desk-user-meta"><strong class="desk-user-name">' + name + '</strong>' +
          '<span class="desk-user-sub">' + (sub || "Student") + '</span></span></a></div>';

    document.body.prepend(deskSide);
    document.body.prepend(deskTop);
    // Async enrich avatar (character / photo) after first paint
    enrichProfileAvatar(opts.profile || _lastProfile, uid).then(function (p) {
      if (!p) return;
      _lastProfile = Object.assign({}, _lastProfile || {}, p, opts.profile || {});
      applyShellUser({ profile: _lastProfile, user: Object.assign({}, user, { fullName: name, subline: sub }), title: title });
    });
    var deskSearch = deskTop.querySelector(".desk-search");
    if (deskSearch) {
      var goCourseSearch = function () { location.href = "course-library.html?mode=search"; };
      deskSearch.addEventListener("click", goCourseSearch);
      deskSearch.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goCourseSearch(); } });
    }
    document.body.prepend(top);
    document.body.append(nav, backdrop, drawer);

    drawer.querySelectorAll("[data-acc-toggle]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-acc-toggle");
        var block = drawer.querySelector('[data-acc="' + id + '"]');
        if (block) block.classList.toggle("open");
      });
    });


    function open(on) {
      backdrop.classList.toggle("open", on);
      drawer.classList.toggle("open", on);
      document.body.style.overflow = on ? "hidden" : "";
    }
    document.getElementById("menuBtn").onclick = function () { open(true); };
    backdrop.onclick = function () { open(false); };
    document.getElementById("signOutBtn").onclick = function () {
      if (w.CodexAuth && w.CodexAuth.auth) {
        w.CodexAuth.auth.signOut().then(function () { location.href = "../login.html"; });
      } else {
        location.href = "../login.html";
      }
    };
    
    function notifCol() {
      var me = firebase.auth().currentUser;
      if (!me) return null;
      return firebase.firestore().collection("notifications").doc(me.uid).collection("items");
    }
    function markNotifRead(id) {
      var col = notifCol();
      if (!col || !id) return Promise.resolve();
      return col.doc(id).set({ read: true, readAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }).catch(function () {});
    }
    function markAllNotifsRead() {
      var col = notifCol();
      if (!col) return Promise.resolve();
      return col.get().then(function (snap) {
        if (snap.empty) return null;
        var batch = firebase.firestore().batch();
        var n = 0;
        snap.forEach(function (d) {
          if (!(d.data() || {}).read) {
            batch.set(d.ref, { read: true, readAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
            n++;
          }
        });
        return n ? batch.commit() : null;
      });
    }
    function refreshNotifBadge() {
      var col = notifCol();
      if (!col) return;
      var me = firebase.auth().currentUser;
      Promise.all([
        col.get(),
        me ? firebase.firestore().collection("announcements").where("status", "==", "active").limit(25).get() : Promise.resolve({ docs: [] }),
        me ? firebase.firestore().collection("announcement_reads").doc(me.uid).get() : Promise.resolve({ exists:false })
      ]).then(function (results) {
        var personal = 0;
        results[0].forEach(function (d) { if (!(d.data() || {}).read) personal++; });
        var readStates = results[2].exists ? ((results[2].data() || {}).states || {}) : {};
        var now = Date.now(), announcements = 0;
        results[1].docs.forEach(function (d) {
          var a = d.data() || {};
          var start = a.startAt && a.startAt.toMillis ? a.startAt.toMillis() : 0;
          var expiry = a.expiresAt && a.expiresAt.toMillis ? a.expiresAt.toMillis() : 0;
          if ((!start || start <= now) && (!expiry || now < expiry) && !readStates[d.id]) announcements++;
        });
        var unread = personal + announcements;
        ["notifBtn", "notifBtnDesk"].forEach(function (id) {
          var btn = document.getElementById(id);
          if (!btn) return;
          var dot = btn.querySelector(".bell-dot") || btn.querySelector("[data-bell-count]");
          if (!dot) { dot = document.createElement("span"); dot.className="bell-dot"; dot.setAttribute("data-bell-count","1"); btn.style.position="relative"; btn.appendChild(dot); }
          dot.hidden = unread <= 0; dot.textContent = unread > 9 ? "9+" : String(unread);
        });
      }).catch(function () {});
    }

    function openNotifPanel() {
      var existing = document.getElementById("codexNotifPanel");
      if (existing) {
        existing.classList.toggle("open");
        return;
      }
      var panel = document.createElement("div");
      panel.id = "codexNotifPanel";
      panel.innerHTML =
        '<div class="codex-notif-backdrop"></div>' +
        '<div class="codex-notif-sheet">' +
          '<div class="codex-notif-head"><strong>Notifications</strong>' +
          '<button type="button" class="codex-notif-close" aria-label="Close">×</button></div>' +
          '<div class="codex-notif-actions"><button type="button" id="codexNotifMarkAll">Mark all as read</button></div>' +
          '<div class="codex-notif-list" id="codexNotifList"><p class="codex-notif-empty">Loading…</p></div>' +
          '<a class="codex-notif-footer" href="announcements.html">View announcements →</a>' +
          '<a class="codex-notif-footer" href="chats.html">Open Requests / Chats →</a>' +
        '</div>';
      document.body.appendChild(panel);
      // styles once
      if (!document.getElementById("codexNotifStyle")) {
        var st = document.createElement("style");
        st.id = "codexNotifStyle";
        st.textContent =
          "#codexNotifPanel{position:fixed;inset:0;z-index:200;display:none;align-items:flex-start;justify-content:flex-end;padding:56px 12px 12px}" +
          "#codexNotifPanel.open{display:flex}" +
          ".codex-notif-backdrop{position:absolute;inset:0;background:rgba(15,23,42,.35)}" +
          ".codex-notif-sheet{position:relative;width:min(360px,100%);max-height:min(70vh,480px);background:#fff;border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,.2);display:flex;flex-direction:column;overflow:hidden;z-index:1}" +
          ".codex-notif-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #E2E8F0;font:800 .95rem system-ui}" +
          ".codex-notif-close{border:0;background:transparent;font-size:1.4rem;line-height:1;cursor:pointer;color:#64748B}" +
          ".codex-notif-list{flex:1;overflow-y:auto;padding:8px}" +
          ".codex-notif-item{display:block;width:100%;text-align:left;border:0;background:#F8FAFC;border-radius:12px;padding:12px;margin:0 0 8px;cursor:pointer;font:500 .85rem system-ui;color:#0F172A}" +
          ".codex-notif-item strong{display:block;font-weight:800;margin-bottom:4px}" +
          ".codex-notif-item span{color:#64748B;font-size:.78rem}" +
          ".codex-notif-empty{text-align:center;color:#94A3B8;padding:24px;font:500 .9rem system-ui}" +
          ".codex-notif-footer{display:block;text-align:center;padding:12px;border-top:1px solid #E2E8F0;font:700 .85rem system-ui;color:#4F46E5;text-decoration:none}" +
          ".bell-dot:not([hidden]){display:inline-flex!important;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#EF4444;color:#fff;font:800 10px/1 system-ui;position:absolute;top:2px;right:2px}" +
          ".chat-nav-badge{position:absolute;top:-5px;right:-7px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:#EF4444;color:#fff;font:800 9px/16px system-ui;text-align:center;z-index:2}.codex-nav-badge{position:absolute;top:2px;right:calc(50% - 22px);min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:#EF4444;color:#fff;font:800 9px/16px system-ui;text-align:center;display:none}" +
          ".codex-notif-actions{display:flex;gap:8px;padding:8px 12px;border-bottom:1px solid #E2E8F0}" +
          ".codex-notif-actions button{flex:1;border:0;background:#EEF2FF;color:#4338CA;font:700 .75rem system-ui;padding:8px;border-radius:10px;cursor:pointer}" +
          ".codex-notif-item.read{opacity:.55}";
        document.head.appendChild(st);
      }
      panel.classList.add("open");
      var markAllBtn = document.getElementById("codexNotifMarkAll");
      if (markAllBtn) {
        markAllBtn.onclick = function () {
          markAllNotifsRead().then(function () {
            refreshNotifBadge();
            loadNotifList();
          });
        };
      }
      refreshNotifBadge();
      panel.querySelector(".codex-notif-backdrop").onclick = function () { panel.classList.remove("open"); };
      panel.querySelector(".codex-notif-close").onclick = function () { panel.classList.remove("open"); };
      loadNotifList();
    }

    function notifTypeLabel(t) {
      if (t === "friend_request") return "Friend request";
      if (t === "referral_joined") return "Referral invite";
      if (t === "group_invite") return "Group invite";
      if (t === "friend_accepted") return "Friend accepted";
      if (t === "group_join_request") return "Group join request";
      if (t === "group_invite") return "Group invite";
      if (t === "group_join_accepted") return "Joined group";
      return "Update";
    }

    async function loadNotifList() {
      var list = document.getElementById("codexNotifList");
      if (!list) return;
      try {
        var me = firebase.auth().currentUser;
        if (!me) { list.innerHTML = '<p class="codex-notif-empty">Sign in to see updates</p>'; return; }
        var personalSnap = await firebase.firestore().collection("notifications").doc(me.uid).collection("items").orderBy("createdAt", "desc").limit(40).get();
        var annSnap = await firebase.firestore().collection("announcements").where("status", "==", "active").limit(10).get();
        var readSnap = await firebase.firestore().collection("announcement_reads").doc(me.uid).get();
        var readStates = readSnap.exists ? ((readSnap.data() || {}).states || {}) : {};
        var now = Date.now(), rows = [];
        annSnap.forEach(function(d){
          var a=d.data()||{}, st=a.startAt&&a.startAt.toMillis?a.startAt.toMillis():0, ex=a.expiresAt&&a.expiresAt.toMillis?a.expiresAt.toMillis():0;
          if((!st||st<=now)&&(!ex||now<ex)) rows.push({kind:"announcement",id:d.id,title:a.title||"Announcement",message:a.description||"New update from Codex Hub.",read:!!readStates[d.id],data:a});
        });
        personalSnap.forEach(function(d){
          var x=d.data()||{};
          if (x.read) return; // hide read — Mark all / tap removes them from the list
          rows.push({kind:"personal",id:d.id,title:notifTypeLabel(x.type),message:x.message||"",read:false,data:x});
        });
        // announcements: only unread
        rows = rows.filter(function(x){ return !x.read; });
        rows.sort(function(a,b){var am=a.data.createdAt&&a.data.createdAt.toMillis?a.data.createdAt.toMillis():0,bm=b.data.createdAt&&b.data.createdAt.toMillis?b.data.createdAt.toMillis():0;return bm-am;});
        if(!rows.length){list.innerHTML='<p class="codex-notif-empty">No new notifications</p>';return;}
        list.innerHTML=rows.slice(0,30).map(function(x){return '<button type="button" class="codex-notif-item" data-kind="'+x.kind+'" data-nid="'+encodeURIComponent(String(x.id))+'" data-read="0"><strong>'+String(x.title).replace(/</g,"&lt;")+'</strong><span>'+String(x.message||"Tap to open").replace(/</g,"&lt;")+'</span></button>';}).join("");
        list.querySelectorAll(".codex-notif-item").forEach(function(btn){
          btn.onclick=function(){
            var kind=btn.getAttribute("data-kind"), id=decodeURIComponent(btn.getAttribute("data-nid") || "");
            if(kind==="announcement"){location.href="announcements.html";return;}
            if(kind==="personal"){
              markNotifRead(id).then(function(){
                btn.remove();
                refreshNotifBadge();
                if (!list.querySelector(".codex-notif-item")) list.innerHTML='<p class="codex-notif-empty">No new notifications</p>';
              });
              // friend request / accepted → open chats requests
              var t = (btn.querySelector("strong") && btn.querySelector("strong").textContent) || "";
              if (/friend|request|group/i.test(t)) {
                setTimeout(function(){ location.href = "chats.html?tab=requests"; }, 180);
              }
              return;
            }
          };
        });
      } catch(e){ console.warn("notification panel",e); list.innerHTML='<p class="codex-notif-empty">Could not load updates.</p>'; }
    }

    function paintChatBadge(total) {
      var onChatsPage = /(?:^|\/)chats\.html(?:$|[?#])/.test(location.pathname + location.search);
      document.querySelectorAll(".chat-nav-badge").forEach(function (b) {
        // The global badge is useful everywhere else. Once inside Chats,
        // the conversation-level pills are the source of truth.
        if (onChatsPage) { b.hidden = true; b.textContent = ""; return; }
        if (total > 0) { b.hidden = false; b.textContent = total > 99 ? "99+" : String(total); }
        else { b.hidden = true; b.textContent = ""; }
      });
    }

    function refreshChatBadge() {
      var me = firebase.auth().currentUser;
      if (!me) { paintChatBadge(0); return; }
      var unreadMsgs = 0;
      var pendingReqs = 0;
      Promise.all([
        firebase.firestore().collection("conversations")
          .where("participants", "array-contains", me.uid).limit(100).get()
          .catch(function () { return { forEach: function () {} }; }),
        firebase.firestore().collection("friend_requests")
          .where("to", "==", me.uid).where("status", "==", "pending").limit(40).get()
          .catch(function () { return { size: 0, forEach: function () {} }; })
      ]).then(function (pair) {
        var snap = pair[0];
        var reqs = pair[1];
        if (snap && snap.forEach) {
          snap.forEach(function (d) {
            var x = d.data() || {};
            var u = x.unreadCount || x.unread || {};
            if (typeof u === "number") unreadMsgs += u;
            else if (u && typeof u === "object") unreadMsgs += Number(u[me.uid] || 0) || 0;
          });
        }
        pendingReqs = (reqs && reqs.size) || 0;
        paintChatBadge(unreadMsgs + pendingReqs);
        // Also surface requests on the Chats page Requests tab if present
        try {
          var tab = document.querySelector('[data-tab="requests"], .tab-requests, button[data-view="requests"]');
          if (tab && pendingReqs > 0) {
            var b = tab.querySelector(".req-tab-badge");
            if (!b) {
              b = document.createElement("span");
              b.className = "req-tab-badge";
              b.style.cssText = "margin-left:6px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#EF4444;color:#fff;font:800 10px/18px system-ui;display:inline-block;text-align:center;vertical-align:middle";
              tab.appendChild(b);
            }
            b.textContent = pendingReqs > 99 ? "99+" : String(pendingReqs);
            b.hidden = false;
          } else if (tab) {
            var b2 = tab.querySelector(".req-tab-badge");
            if (b2) b2.hidden = true;
          }
        } catch (eTab) {}
      }).catch(function () { paintChatBadge(0); });
    }

    function listenChatBadge() {
      try {
        var me = firebase.auth().currentUser;
        if (!me) return;
        setInterval(refreshChatBadge, 45000);
        refreshChatBadge();
      } catch (e) {}
    }
    setTimeout(listenChatBadge, 1000);

    
    var chatBadgeUnsub = null;
    function startChatBadgeListener() {
      refreshChatBadge();
      try {
        var me = firebase.auth().currentUser;
        if (!me) return;
        if (chatBadgeUnsub) { try { chatBadgeUnsub(); } catch (e0) {} }
        // Realtime on conversations; friend requests polled via refreshChatBadge
        chatBadgeUnsub = firebase.firestore().collection("conversations")
          .where("participants", "array-contains", me.uid).limit(100)
          .onSnapshot(function () {
            refreshChatBadge(); // includes unread + pending friend requests
          }, function () { refreshChatBadge(); });
        setInterval(refreshChatBadge, 12000);
      } catch (e) {
        setInterval(refreshChatBadge, 5000);
      }
    }

    function notif() { openNotifPanel(); }
    var nb = document.getElementById("notifBtn");
    var nd = document.getElementById("notifBtnDesk");
    if (nb) nb.onclick = notif;
    if (nd) nd.onclick = notif;
    w.refreshChatBadge = refreshChatBadge;
    startChatBadgeListener();
    try { setTimeout(refreshNotifBadge, 800); } catch (e) {}
    // Start the real-time notification badge listener.
    // Keep this separate from refreshNotifBadge so the initial fetch still works offline.
    var notifBadgeUnsubs = [];
    function listenNotifBadge() {
      try {
        notifBadgeUnsubs.forEach(function (u) { try { u(); } catch (e) {} });
        notifBadgeUnsubs = [];
        var me = firebase.auth().currentUser;
        if (!me) return;
        var db = firebase.firestore();
        var personal = 0, announcements = 0, readStates = {};
        function paint() {
          var unread = personal + announcements;
          ["notifBtn", "notifBtnDesk"].forEach(function (id) {
            var btn = document.getElementById(id);
            if (!btn) return;
            var dot = btn.querySelector(".bell-dot") || btn.querySelector("[data-bell-count]");
            if (!dot) {
              dot = document.createElement("span");
              dot.className = "bell-dot";
              dot.setAttribute("data-bell-count", "1");
              btn.style.position = "relative";
              btn.appendChild(dot);
            }
            dot.hidden = unread <= 0;
            dot.textContent = unread > 9 ? "9+" : String(unread);
          });
        }
        function recalcAnnouncements(snap) {
          var now = Date.now(), count = 0;
          snap.forEach(function (d) {
            var a = d.data() || {};
            var start = a.startAt && a.startAt.toMillis ? a.startAt.toMillis() : 0;
            var expiry = a.expiresAt && a.expiresAt.toMillis ? a.expiresAt.toMillis() : 0;
            if ((!start || start <= now) && (!expiry || now < expiry) && !readStates[d.id]) count++;
          });
          announcements = count;
          paint();
        }
        var personalCol = db.collection("notifications").doc(me.uid).collection("items");
        notifBadgeUnsubs.push(personalCol.onSnapshot(function (snap) {
          personal = 0;
          snap.forEach(function (d) { if (!(d.data() || {}).read) personal++; });
          paint();
        }, function () { refreshNotifBadge(); }));
        var annCol = db.collection("announcements").where("status", "==", "active").limit(25);
        var annSnap = null;
        notifBadgeUnsubs.push(annCol.onSnapshot(function (snap) { annSnap = snap; recalcAnnouncements(snap); }, function () { refreshNotifBadge(); }));
        notifBadgeUnsubs.push(db.collection("announcement_reads").doc(me.uid).onSnapshot(function (snap) {
          readStates = snap.exists ? ((snap.data() || {}).states || {}) : {};
          if (annSnap) recalcAnnouncements(annSnap);
          else paint();
        }, function () { refreshNotifBadge(); }));
      } catch (e) {
        try { refreshNotifBadge(); } catch (e2) {}
      }
    }
    setTimeout(listenNotifBadge, 800);

    // Smooth leave when navigating inside the app
    document.body.addEventListener("click", function (e) {
      var a = e.target.closest("a[href]");
      if (!a) return;
      var href = a.getAttribute("href") || "";
      if (!href || href.charAt(0) === "#" || href.indexOf("javascript:") === 0) return;
      if (a.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey) return;
      // only same-folder / relative app links
      if (/^https?:/i.test(href)) return;
      e.preventDefault();
      document.body.classList.add("is-leaving");
      setTimeout(function () { location.href = href; }, 180);
    });
  }

  function updateUser(user) {
    if (!user) return;
    mountShell({ user: user, page: (document.body.dataset.page || "home") });
    // Global online presence (any Codex page)
    try {
      if (window.CodexChat && CodexChat.touchPresence) {
        CodexChat.touchPresence();
        setInterval(function () { try { CodexChat.touchPresence(); } catch (e) {} }, 30000);
        document.addEventListener("visibilitychange", function () {
          try {
            if (document.hidden && CodexChat.setPresenceOffline) CodexChat.setPresenceOffline();
            else CodexChat.touchPresence();
          } catch (e) {}
        });
        window.addEventListener("pagehide", function () {
          try { if (CodexChat.setPresenceOffline) CodexChat.setPresenceOffline(); } catch (e) {}
        });
        window.addEventListener("beforeunload", function () {
          try { if (CodexChat.setPresenceOffline) CodexChat.setPresenceOffline(); } catch (e) {}
        });
      }
    } catch (e) {}
  }

  w.CodexShell = {
    paintAvatars: paintAvatars,
    applyShellUser: applyShellUser, mountShell: mountShell, updateUser: updateUser };
})(window);
