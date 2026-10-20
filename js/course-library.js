/**
 * Course Library — catalog + My Library + demand + requests
 * Depends: firebase-config, curriculum-data, curriculum-loader, auth
 */
(function () {
  "use strict";

  if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
  var auth = firebase.auth();
  var db = firebase.firestore();

  var personalPage = document.body.dataset.libraryView === "personal";
  try { if (personalPage) setTimeout(function(){ if (typeof setMyLibSkel==="function") setMyLibSkel(true); }, 0); } catch(eSk) {}

  /** Navigate Hub pages on both local (/app/*.html) and clean URLs (/home). */
  
  function setMyLibSkel(on) {
    var sk = $("myLibSkel");
    var list = $("myLibList");
    if (sk) {
      if (on) sk.classList.add("is-loading");
      else sk.classList.remove("is-loading");
      sk.style.display = on ? "grid" : "none";
      sk.setAttribute("aria-hidden", on ? "false" : "true");
    }
    if (list && on) {
      list.innerHTML = "";
    }
  }

  function hubGo(name, query) {
    var pages = {
      home: { html: "home.html", clean: "/home" },
      courseLibrary: { html: "course-library.html", clean: "/course-library" },
      myLibrary: { html: "my-library.html", clean: "/my-library" },
      cbt: { html: "cbt.html", clean: "/cbt" },
      notes: { html: "notes.html", clean: "/notes" },
      login: { html: "../login.html", clean: "/login" }
    };
    var p = pages[name] || pages.home;
    var path = location.pathname || "";
    var useHtml = /\.html(\?|$)/.test(path) || path.indexOf("/app/") !== -1;
    var url = useHtml ? p.html : p.clean;
    if (query) {
      url += (url.indexOf("?") >= 0 ? "&" : "?") + String(query).replace(/^\?/, "");
    }
    try { location.assign(url); } catch (e1) {
      try { location.href = url; } catch (e2) {}
    }
  }

  function hubReplace(name, query) {
    var pages = {
      home: { html: "home.html", clean: "/home" },
      courseLibrary: { html: "course-library.html", clean: "/course-library" },
      myLibrary: { html: "my-library.html", clean: "/my-library" },
      cbt: { html: "cbt.html", clean: "/cbt" },
      notes: { html: "notes.html", clean: "/notes" }
    };
    var p = pages[name] || pages.home;
    var path = location.pathname || "";
    var useHtml = /\.html(\?|$)/.test(path) || path.indexOf("/app/") !== -1;
    var url = useHtml ? p.html : p.clean;
    if (query) url += (url.indexOf("?") >= 0 ? "&" : "?") + query.replace(/^\?/, "");
    location.replace(url);
  }


  var state = {
    user: null,
    profile: null,
    library: {}, // code -> { addedAt, source }
    level: "all",
    filter: "all",
    query: "",
    offset: 0,
    limit: 48,
    total: 0,
    selected: null,
    pendingAdd: null,
    librarySemester: "1",
    entryMode: "browse", // browse | cbt | notes
    sort: "default" // default | title | code
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toast(msg) {
    var t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._tm);
    toast._tm = setTimeout(function () { t.classList.remove("show"); }, 2800);
  }

  function prefixHue(code) {
    var p = String(code || "").replace(/[0-9]/g, "").slice(0, 3).toUpperCase();
    var map = {
      MTH: "live", PHY: "live", CHM: "live", BIO: "live", COS: "live", CSC: "live",
      GST: "live", STA: "live", ACC: "live", ECO: "live"
    };
    return map[p] || "soon";
  }

  function subjectSvg(code) {
    var prefix = String(code || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
    var paths = {
      MTH: '<path d="M5 7h14M7 3l10 18M5 17h14"/>',
      STA: '<path d="M5 20V11M12 20V4M19 20V8"/>',
      PHY: '<ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="4" ry="10"/><circle cx="12" cy="12" r="1"/>',
      CHM: '<path d="M9 3h6M10 3v7L4 20h16l-6-10V3M7 16h10"/>',
      BIO: '<path d="M5 20C5 9 9 4 20 4c0 11-5 16-15 16ZM5 20L16 9"/>',
      CSC: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M9 8l-3 3 3 3M15 8l3 3-3 3"/>',
      ACC: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 11h2M14 11h2M8 16h2M14 16h2"/>',
      ECO: '<path d="M3 19h18M4 15l6-6 4 3 6-8M16 4h4v4"/>',
      MED: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z"/>',
      LAW: '<path d="M12 3v18M5 21h14M4 7h16M6 7l-4 8h8ZM18 7l-4 8h8Z"/>'
    };
    if (prefix === "COS") prefix = "CSC";
    return '<svg aria-hidden="true" class="mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + (paths[prefix] || '<path d="M6 3h14v18H6a2 2 0 01-2-2V5a2 2 0 012-2ZM4 17h16"/>') + '</svg>';
  }

  function cardHtml(c) {
    var inLib = !!state.library[c.code];
    var live = !!c.hasContent;
    var artClass = live ? "live" : "soon";
    var statusClass = live ? " live-card" : " soon-card";
    if (inLib) statusClass += " inlib-card";
    var badge = live
      ? '<span class="badge live">Ready</span>'
      : '<span class="badge soon">Soon</span>';
    var addIcon = inLib
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>';
    var sem = c.semester == 2 || c.semester === "2" ? "2nd" : "1st";
    return (
      '<article class="ccard' + statusClass + '" data-code="' + esc(c.code) + '">' +
        '<div class="art ' + artClass + '">' +
          '<div class="code-lg">' + esc(c.code) + '</div>' + badge + subjectSvg(c.code) +
        '</div>' +
        '<div class="body">' +
          '<div class="title">' + esc(c.title) + '</div>' +
          '<div class="meta">' +
            '<span>' + esc(String(c.level)) + 'L</span>' +
            '<span>' + sem + '</span>' +
            (c.units ? '<span>' + esc(String(c.units)) + 'u</span>' : '') +
          '</div>' +
          '<div class="foot">' +
            '<span style="font-size:.65rem;color:#94A3B8;font-weight:600">' +
              (live ? "CBT · Notes" : "Content pending") +
            '</span>' +
            '<button type="button" class="add' + (inLib ? " in" : "") + '" data-add="' + esc(c.code) + '" aria-label="' + (inLib ? "In library" : "Add") + '">' +
              addIcon +
            '</button>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  function buildLevelChips() {
    var levels = ["all", "100", "200", "300", "400", "500", "600"];
    var el = $("levelChips");
    if (!el) return;
    el.innerHTML = levels.map(function (lv) {
      var label = lv === "all" ? "All levels" : lv + " Level";
      var active = state.level === lv ? " active" : "";
      return '<button type="button" class="chip' + active + '" data-level="' + lv + '">' + label + "</button>";
    }).join("");
  }

  function queryOpts() {
    var opts = {
      level: state.level,
      q: state.query,
      offset: state.offset,
      limit: state.limit,
      sort: state.sort || "default"
    };
    if (state.filter === "live") opts.readyOnly = true;
    if (state.filter === "soon") opts.comingSoonOnly = true;
    if (state.filter === "mine" && state.profile) {
      opts.level = String(state.profile.level || "100");
    }
    return opts;
  }


  function renderFeaturedRails() {
    var host = $("featuredRails");
    if (!host) return;
    // Hide when searching / filtering / my-lib mode entry
    if (state.query || state.filter !== "all" || state.entryMode === "cbt" || state.entryMode === "notes") {
      host.innerHTML = "";
      host.style.display = "none";
      return;
    }
    host.style.display = "block";
    var level = state.level || (state.profile && state.profile.level) || "100";
    var ready = CurriculumLoader.catalogSlice({ level: level, readyOnly: true, limit: 24, offset: 0 }).items || [];
    var soon = CurriculumLoader.catalogSlice({ level: level, comingSoonOnly: true, limit: 12, offset: 0 }).items || [];
    // "Popular" proxy: courses already in many libraries — we only know local library;
    // use ready courses as Featured / For your level until global stats exist.
    var inLib = ready.filter(function (c) { return !!state.library[c.code]; }).slice(0, 12);
    var featured = ready.slice(0, 12);
    var trending = ready.slice().sort(function () { return Math.random() - 0.5; }).slice(0, 12);

    function rail(title, items) {
      if (!items.length) return "";
      return (
        '<div class="feat-block"><h3>' + title + '</h3><div class="feat-rail">' +
        items.map(cardHtml).join("") +
        "</div></div>"
      );
    }

    host.innerHTML =
      rail("Popular · Ready for " + level + "L", featured) +
      (inLib.length ? rail("In your library", inLib) : "") +
      rail("Trending", trending) +
      (soon.length ? rail("Coming soon", soon.slice(0, 8)) : "");
  }

  function renderGrid(append) {
    if (personalPage) return;
    try {
    var result = CurriculumLoader.catalogSlice(queryOpts());
    state.total = result.total;
    $("sectionCount").textContent = result.total + " found";
    $("sectionTitle").textContent =
      state.filter === "mine" ? "For your level" :
      state.filter === "live" ? "Ready to study" :
      state.filter === "soon" ? "Coming soon" : "Browse courses";

    var grid = $("courseGrid");
    var html = result.items.map(cardHtml).join("");
    if (append) grid.insertAdjacentHTML("beforeend", html);
    else grid.innerHTML = html;

    var empty = !result.items.length && state.offset === 0;
    $("emptyState").style.display = empty ? "block" : "none";
    $("moreWrap").style.display = state.offset + result.items.length < result.total ? "block" : "none";

    // stats
    var all = CurriculumLoader.getStats();
    $("stTotal").textContent = all.total;
    $("stLive").textContent = all.ready;
    $("stSoon").textContent = all.comingSoon;
    $("stLib").textContent = Object.keys(state.library).length;
    try { renderFeaturedRails(); } catch (e) { console.warn("featured", e); }
    setCatalogReady(true);
    } catch (err) {
      console.error("renderGrid failed", err);
      try { setCatalogReady(true); } catch (e2) {}
      try {
        var grid = $("courseGrid");
        if (grid && !grid.innerHTML) {
          grid.innerHTML = '<div style="grid-column:1/-1;padding:24px;text-align:center;color:#64748B">Could not load courses. Pull to refresh or try again.</div>';
          grid.style.display = "";
        }
      } catch (e3) {}
    }
  }

  function setCatalogReady(ready) {
    var loadEl = $("catalogLoading");
    var grid = $("courseGrid");
    var empty = $("emptyState");
    var req = $("btnRequest");
    var section = document.querySelector(".section-head");
    if (loadEl) {
      loadEl.style.display = ready ? "none" : "block";
      loadEl.setAttribute("aria-busy", ready ? "false" : "true");
    }
    if (grid) grid.style.display = ready ? "grid" : "none";
    if (req) req.style.display = ready ? "" : "none";
    if (section) section.style.visibility = ready ? "visible" : "hidden";
    // Never show empty/request while still loading
    if (!ready && empty) empty.style.display = "none";
  }


  
  // When user opens catalog mid CBT/Notes setup, warn if they leave without adding a course
  function markSetupFlow(kind) {
    try { sessionStorage.setItem("codex_setup_flow", kind || "cbt"); } catch (e) {}
  }
  function clearSetupFlow() {
    try { sessionStorage.removeItem("codex_setup_flow"); } catch (e) {}
  }
  function setupFlowActive() {
    try { return sessionStorage.getItem("codex_setup_flow") || ""; } catch (e) { return ""; }
  }

  function practiceHref(code, kind) {
    var q = "code=" + encodeURIComponent(code);
    var path = location.pathname || "";
    var useHtml = /\.html(\?|$)/.test(path) || path.indexOf("/app/") !== -1;
    if (kind === "notes") return useHtml ? ("notes.html?" + q) : ("/notes?" + q);
    return useHtml ? ("cbt.html?" + q) : ("/cbt?" + q);
  }

  function openCourseAction(code) {
    if (state.entryMode === "notes") {
      clearSetupFlow();
      location.href = practiceHref(code, "notes");
      return;
    }
    if (state.entryMode === "cbt") {
      clearSetupFlow();
      location.href = practiceHref(code, "cbt");
      return;
    }
    // default from catalog: prefer CBT if ready
    location.href = practiceHref(code, "cbt");
  }

  function openDetail(code) {
    var c = CurriculumLoader.getCourseByCode(code);
    if (!c) return;
    // From Home CBT/Notes: skip sheet → activity
    if (c.hasContent && state.entryMode === "cbt") {
      location.href = practiceHref(code, "cbt");
      return;
    }
    if (c.hasContent && state.entryMode === "notes") {
      location.href = practiceHref(code, "notes");
      return;
    }
    state.selected = c;
    $("dCode").textContent = c.code;
    $("dTitle").textContent = c.title;
    var sem = c.semester == 2 || c.semester === "2" ? "2nd semester" : "1st semester";
    $("dSub").textContent =
      c.level + " Level · " + sem +
      (c.units ? " · " + c.units + " units" : "") +
      (c.hasContent ? " · Ready" : " · Coming soon");

    var body = "";
    if (!c.hasContent) {
      body +=
        '<div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:12px;padding:12px 14px;margin-bottom:12px;font-size:.84rem;color:#92400E;line-height:1.5">' +
        "<b>Coming soon.</b> You can still add this to your library. We’ll prioritise courses students add most." +
        "</div>";
    }
    body +=
      '<p class="desc">' +
      (c.hasContent
        ? "Practice CBT questions and read structured notes for this course when you open it from Home or My Library."
        : "CBT and notes for this course are not live yet. Adding it signals demand to the Codex team.") +
      "</p>";

    var topics = c.topics || [];
    if (topics.length) {
      body += "<h3>Course outline</h3><ul class=\"topic-list\">";
      topics.slice(0, 40).forEach(function (t) {
        body += "<li>" + esc(t) + "</li>";
      });
      if (topics.length > 40) {
        body += "<li style=\"color:#94A3B8\">+" + (topics.length - 40) + " more topics</li>";
      }
      body += "</ul>";
    } else {
      body += "<h3>Course outline</h3><p class=\"desc\">Outline will appear when content is published.</p>";
    }

    $("dBody").innerHTML = body;
    var inLib = !!state.library[c.code];
    var btn = $("dAdd");
    btn.textContent = inLib ? "Remove from library" : c.hasContent ? "Add to library" : "Add · notify team";
    btn.className = inLib ? "danger" : "primary";
    var previousActions = $("detailPrimaryBtns");
    if (previousActions) previousActions.remove();
    if (c.hasContent) {
      var wrap = document.createElement("div");
      wrap.id = "detailPrimaryBtns";
      wrap.innerHTML = '<button type="button" class="primary" id="btnPracticeCbt">Practice CBT</button>' +
        '<button type="button" class="ghost" id="btnReadNotes">Read notes</button>';
      $("dBody").appendChild(wrap);
      $("btnPracticeCbt").onclick = function () { location.href = practiceHref(c.code, "cbt"); };
      $("btnReadNotes").onclick = function () { location.href = practiceHref(c.code, "notes"); };
    }
    $("sheetBg").classList.add("open");
    $("detailSheet").classList.add("open");
  }

  function closeDetail() {
    $("sheetBg").classList.remove("open");
    $("detailSheet").classList.remove("open");
    state.selected = null;
  }

  async function loadLibrary() {
    if (!state.user) return;
    try { setMyLibSkel(false); } catch (e0) {}
    state.library = {};
    try {
      var snap = await db.collection("users").doc(state.user.uid).collection("library").get();
      snap.forEach(function (doc) {
        state.library[doc.id] = doc.data() || {};
      });
    } catch (e) {
      console.warn("library load", e);
    }
    if ($("stLib")) $("stLib").textContent = Object.keys(state.library).length;
  }

  async function recordDemand(course) {
    if (!course || course.hasContent) return;
    try {
      var ref = db.collection("course_demand").doc(course.code);
      await db.runTransaction(async function (tx) {
        var snap = await tx.get(ref);
        if (!snap.exists) {
          tx.set(ref, {
            code: course.code,
            title: course.title || "",
            level: String(course.level || ""),
            semester: course.semester || 1,
            count: 1,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        } else {
          tx.update(ref, {
            count: firebase.firestore.FieldValue.increment(1),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            title: course.title || snap.data().title || ""
          });
        }
      });
    } catch (e) {
      // non-fatal — library add still succeeds
      console.warn("demand", e);
    }
  }

  async function addToLibrary(course, force) {
    if (!state.user || !course) return;
    var userLevel = String((state.profile && state.profile.level) || "");
    var courseLevel = String(course.level || "");
    if (!force && userLevel && courseLevel && userLevel !== courseLevel) {
      state.pendingAdd = course;
      $("confirmTitle").textContent = "Different level";
      $("confirmMsg").textContent =
        course.code + " is a " + courseLevel + "-level course. You’re on " + userLevel +
        " level. Add it to your library anyway?";
      $("confirmBg").classList.add("open");
      return;
    }
    try {
      await db.collection("users").doc(state.user.uid).collection("library").doc(course.code).set({
        code: course.code,
        title: course.title || "",
        level: String(course.level || ""),
        semester: course.semester || 1,
        hasContent: !!course.hasContent,
        source: "manual",
        addedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      state.library[course.code] = {
        source: "manual",
        title: course.title,
        level: course.level,
        semester: course.semester || 1,
        hasContent: !!course.hasContent
      };
      await recordDemand(course);
      toast(course.hasContent ? course.code + " added to My Library" : course.code + " added · team notified");
      renderGrid(false);
      if (state.selected && state.selected.code === course.code) openDetail(course.code);
      renderMyLib();
    } catch (e) {
      console.error(e);
      toast(e.message || "Could not add course");
    }
  }

  async function removeFromLibrary(code) {
    if (!state.user || !code) return;
    try {
      await db.collection("users").doc(state.user.uid).collection("library").doc(code).delete();
      delete state.library[code];
      toast(code + " removed");
      renderGrid(false);
      if (state.selected && state.selected.code === code) openDetail(code);
      renderMyLib();
    } catch (e) {
      toast(e.message || "Could not remove");
    }
  }

  function renderMyLib() {
    applyLibTheme();
    var list = $("myLibList");
    if (!list) return;
    try { setMyLibSkel(false); } catch (e) {}
    var codes = Object.keys(state.library);
    var dept = (state.profile && (state.profile.department || "")) || "your department";
    var level = (state.profile && state.profile.level) || "—";
    var sem = currentSemester() === "2" ? "2nd" : "1st";
    var prog = programmeCourses(false);
    if (!prog.length) prog = programmeCourses(true);
    var missingProg = prog.filter(function (c) { return !state.library[c.code]; });
    if ($("myLibTitle")) {
      $("myLibTitle").textContent = codes.length
        ? (codes.length + " course" + (codes.length === 1 ? "" : "s") + " in your library")
        : "Your personal library";
    }
    if ($("myLibSub")) {
      $("myLibSub").textContent = dept + " · " + level + " Level · " + sem +
        " semester. Add more from Browse or remove ones you don’t need.";
    }
    if (!codes.length) {
      list.innerHTML =
        '<div class="mylib-empty-seed">No courses yet. Tap <b>Restore</b> to load defaults for ' +
        esc(dept) + ', or Browse the catalog.</div>';
      return;
    }
    var banner = "";
    if (missingProg.length >= 2) {
      banner =
        '<div class="mylib-banner">Programme usually has ' + prog.length +
        ' courses this semester. ' + missingProg.length +
        ' missing — tap <b>Restore</b>.</div>';
    }
    var semNow = currentSemester();
    var items = codes.map(function (code) {
      var meta = state.library[code] || {};
      var full = (window.CurriculumLoader && CurriculumLoader.getCourseByCode)
        ? CurriculumLoader.getCourseByCode(code) : null;
      return full || {
        code: code,
        title: meta.title || code,
        level: meta.level,
        semester: meta.semester,
        hasContent: meta.hasContent
      };
    }).filter(function (c) {
      var cs = courseSemesterOf(c);
      if (metaSemesterUnknown(c)) return true;
      return cs === semNow;
    }).sort(function (a, b) {
      if (!!b.hasContent !== !!a.hasContent) return a.hasContent ? -1 : 1;
      return String(a.code).localeCompare(String(b.code));
    });

    var otherCount = codes.length - items.length;
    if (otherCount > 0) {
      banner += '<div class="mylib-banner mylib-banner-info">' +
        otherCount + ' course' + (otherCount === 1 ? '' : 's') +
        ' in the other semester — switch above to view.</div>';
    }

    if (!items.length) {
      list.innerHTML = banner +
        '<div class="empty"><h3>No courses for ' + (semNow === "2" ? "2nd" : "1st") +
        ' semester</h3><p>Switch semester, Restore, or Browse.</p></div>';
      return;
    }
    /* banner is block-level; grid is separate so banner never becomes a column */
    list.innerHTML = banner + '<div class="mylib-grid">' + items.map(cardHtml).join("") + "</div>";
  }

  function metaSemesterUnknown(c) {
    if (!c) return true;
    if (c.semester === undefined || c.semester === null || c.semester === "") return true;
    return false;
  }

  function normalizeDept(d) {
    return String(d || "")
      .toLowerCase()
      .trim()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
  }

  function normalizeFaculty(f) {
    return String(f || "").toLowerCase().trim().replace(/\s+/g, "_");
  }

  function normalizeSemester(s) {
    s = String(s || "1").toLowerCase();
    if (s.indexOf("2") === 0 || s === "2nd") return "2";
    return "1";
  }


  function currentSemester() {
    var s = state.librarySemester
      || (state.profile && state.profile.semester)
      || localStorage.getItem("selectedSemester")
      || "1";
    return normalizeSemester(s);
  }

  function setLibrarySemester(sem) {
    state.librarySemester = normalizeSemester(sem);
    var label = state.librarySemester === "2" ? "2nd" : "1st";
    localStorage.setItem("selectedSemester", label);
    if (state.profile) state.profile.semester = label;
    try {
      var raw = localStorage.getItem("loggedInUser");
      if (raw) {
        var u = JSON.parse(raw);
        u.semester = label;
        localStorage.setItem("loggedInUser", JSON.stringify(u));
      }
    } catch (e0) {}
    // Persist for Home + other pages
    if (state.user) {
      db.collection("users").doc(state.user.uid).set(
        { semester: label, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      ).catch(function () {});
    }
    var s1 = $("sem1Btn"), s2 = $("sem2Btn");
    if (s1) s1.classList.toggle("active", state.librarySemester === "1");
    if (s2) s2.classList.toggle("active", state.librarySemester === "2");
    renderMyLib();
  }

  function courseSemesterOf(c) {
    var s = c && c.semester;
    if (s == 2 || s === "2" || s === "2nd") return "2";
    return "1";
  }

  function programmeCourses(includeComingSoon) {
    if (!state.profile) return [];
    var level = String(state.profile.level || "100");
    var semester = currentSemester();
    var faculty = normalizeFaculty(state.profile.facultyKey || state.profile.faculty);
    var department = normalizeDept(state.profile.departmentKey || state.profile.department);
    var courses = CurriculumLoader.getCourses({
      level: level,
      semester: semester,
      faculty: faculty,
      department: department
    });
    // Fallback: department only (some profiles store faculty label wrong)
    if (courses.length < 3 && department) {
      var byDept = CurriculumLoader.getCourses({
        level: level,
        semester: semester,
        faculty: "",
        department: department
      });
      if (byDept.length > courses.length) courses = byDept;
    }
    // Fallback: common CS under computing + science
    if (courses.length < 3 && department.indexOf("computer") !== -1) {
      ["computing", "science"].forEach(function (f) {
        var extra = CurriculumLoader.getCourses({
          level: level,
          semester: semester,
          faculty: f,
          department: "computer_science"
        });
        if (extra.length > courses.length) courses = extra;
      });
    }
    if (!includeComingSoon) {
      courses = courses.filter(function (c) { return c.hasContent; });
    }
    // de-dupe by code
    var seen = {};
    return courses.filter(function (c) {
      if (seen[c.code]) return false;
      seen[c.code] = true;
      return true;
    });
  }

  async function writeLibraryCourses(courses, source) {
    if (!state.user || !courses.length) return 0;
    var batch = db.batch();
    var uid = state.user.uid;
    var n = 0;
    courses.forEach(function (c) {
      var ref = db.collection("users").doc(uid).collection("library").doc(c.code);
      batch.set(ref, {
        code: c.code,
        title: c.title || "",
        level: String(c.level || ""),
        semester: c.semester || 1,
        hasContent: !!c.hasContent,
        source: source || "auto",
        addedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      state.library[c.code] = {
        source: source || "auto",
        title: c.title,
        level: c.level,
        semester: c.semester || 1,
        hasContent: !!c.hasContent
      };
      n++;
    });
    await batch.commit();
    return n;
  }

  async function seedLibraryIfEmpty() {
    // Always merge programme defaults for missing codes (safe if user already added BIO103 etc.)
    return ensureProgrammeCourses(false);
  }

  async function ensureProgrammeCourses(forceToast) {
    if (!state.user) return 0;
    if (!state.profile) {
      console.warn("[library] no profile — cannot seed programme courses");
      if (forceToast) toast("Profile not loaded. Re-open after signing in.");
      return 0;
    }
    var ready = programmeCourses(false);
    var list = ready.length ? ready : programmeCourses(true);
    console.log("[library] programme courses", {
      faculty: state.profile.faculty,
      department: state.profile.department,
      level: state.profile.level,
      semester: state.profile.semester,
      count: list.length,
      codes: list.map(function (c) { return c.code; })
    });
    if (!list.length) {
      if (forceToast) {
        toast("No default courses for " + (state.profile.department || "your dept") +
          " · " + (state.profile.level || "?") + "L. Browse catalog to add.");
      }
      return 0;
    }
    var missing = list.filter(function (c) { return !state.library[c.code]; });
    if (!missing.length) {
      if (forceToast) toast("Programme courses already in your library (" + list.length + ")");
      return 0;
    }
    try {
      var n = await writeLibraryCourses(missing, "auto");
      toast("Added " + n + " programme course" + (n === 1 ? "" : "s") +
        " (" + missing.map(function (c) { return c.code; }).slice(0, 6).join(", ") +
        (missing.length > 6 ? "…" : "") + ")");
      return n;
    } catch (e) {
      console.error("[library] seed failed", e);
      if (forceToast || true) {
        toast((e && e.code === "permission-denied")
          ? "Permission denied saving library — publish library Firestore rules"
          : (e.message || "Could not save programme courses"));
      }
      return 0;
    }
  }

  async function restoreProgrammeCourses() {
    if (!state.user) return;
    await ensureProgrammeCourses(true);
    renderMyLib();
    renderGrid(false);
  }

  async function clearLibrary() {
    if (!state.user) return;
    if (!confirm("Remove all courses from My Library? You can restore programme courses anytime.")) return;
    try {
      var snap = await db.collection("users").doc(state.user.uid).collection("library").get();
      var batch = db.batch();
      snap.forEach(function (doc) { batch.delete(doc.ref); });
      await batch.commit();
      state.library = {};
      toast("Library cleared");
      renderMyLib();
      renderGrid(false);
    } catch (e) {
      toast(e.message || "Clear failed");
    }
  }

  var LIB_THEMES = {
    default: {
      bg: "#F8FAFC",
      header: "#FFFFFF",
      hero: "linear-gradient(135deg,#1E3A5F,#312E81)"
    },
    ocean: {
      bg: "#F0FDFA",
      header: "#FFFFFF",
      hero: "linear-gradient(135deg,#0E7490,#0369A1)"
    },
    forest: {
      bg: "#F0FDF4",
      header: "#FFFFFF",
      hero: "linear-gradient(135deg,#047857,#065F46)"
    },
    sunset: {
      bg: "#FFF7ED",
      header: "#FFFFFF",
      hero: "linear-gradient(135deg,#C2410C,#9A3412)"
    },
    violet: {
      bg: "#F5F3FF",
      header: "#FFFFFF",
      hero: "linear-gradient(135deg,#6D28D9,#4C1D95)"
    }
  };

  function applyLibTheme(name) {
    name = name || localStorage.getItem("codex_lib_theme") || "default";
    var t = LIB_THEMES[name] || LIB_THEMES.default;
    var panel = $("myLibPanel");
    if (!panel) return;
    panel.style.setProperty("--lib-bg", t.bg);
    panel.style.setProperty("--lib-header", t.header);
    panel.style.setProperty("--lib-hero", t.hero);
    localStorage.setItem("codex_lib_theme", name);
    var row = $("themeRow");
    if (row) {
      Array.prototype.forEach.call(row.querySelectorAll(".theme-dot"), function (d) {
        d.classList.toggle("active", d.getAttribute("data-theme") === name);
      });
    }
  }


  async function submitRequest() {
    if (!state.user) return;
    var code = ($("reqCode").value || "").trim().toUpperCase();
    var title = ($("reqTitle").value || "").trim();
    var level = $("reqLevel").value;
    var sem = $("reqSem").value;
    var outline = ($("reqOutline").value || "").trim();
    if (!code && !title) {
      toast("Enter at least a course code or title");
      return;
    }
    $("reqSend").disabled = true;
    try {
      await db.collection("course_requests").add({
        uid: state.user.uid,
        email: state.user.email || "",
        displayName: (state.profile && (state.profile.fullName || state.profile.displayName)) || "",
        code: code,
        title: title,
        level: level,
        semester: Number(sem) || 1,
        outline: outline,
        university: (state.profile && state.profile.university) || "",
        department: (state.profile && state.profile.department) || "",
        status: "open",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      $("reqModal").classList.remove("open");
      $("reqCode").value = "";
      $("reqTitle").value = "";
      $("reqOutline").value = "";
      toast("Request sent — thank you");
    } catch (e) {
      console.error(e);
      toast(e.message || "Could not send request");
    } finally {
      $("reqSend").disabled = false;
    }
  }


    // Entry mode from Home: ?mode=cbt | ?mode=notes.
    // Keep this URL-driven so the Back button never gets trapped in a library/history loop.
    try {
      var _m = new URLSearchParams(location.search).get("mode");
      if (_m === "cbt" || _m === "notes") {
        if (!personalPage) {
          hubReplace("myLibrary", "mode=" + _m);
          return;
        }
        state.entryMode = _m;
      }
      if (_m === "search") state.searchOnOpen = true;
    } catch (e) {}

  function bind() {
    window.__codexLibSetSort = function (v) {
      state.sort = v || "default";
      state.offset = 0;
      try { renderGrid(false); } catch (e) {}
    };
    document.addEventListener("codex-lib-sort", function (ev) {
      try {
        state.sort = (ev.detail && ev.detail.sort) || "default";
        state.offset = 0;
        renderGrid(false);
      } catch (e) {}
    });

    function goHome(ev) {
      try { if (ev && ev.preventDefault) ev.preventDefault(); } catch (e) {}
      var flow = "";
      try { flow = (typeof setupFlowActive === "function") ? setupFlowActive() : ""; } catch (e) {}
      if (flow && !personalPage) {
        var msg = flow === "notes"
          ? "Leave without choosing a course? Your notes setup will be cancelled."
          : "Leave without choosing a course? Your CBT setup will be cancelled.";
        if (!window.confirm(msg)) return;
        try { clearSetupFlow(); } catch (e) {}
      }
      try { if (typeof hubGo === "function") { hubGo("home"); return; } } catch (e) {}
      try { location.assign("/home"); return; } catch (e) {}
      try { location.href = "home.html"; } catch (e) {}
      try { location.href = "/home"; } catch (e) {}
    }
    if ($("btnBack")) $("btnBack").onclick = goHome;
    if ($("myLibClose")) $("myLibClose").onclick = function () {
      if (personalPage) goHome();
      else if ($("myLibPanel")) $("myLibPanel").classList.remove("open");
    };

    try { buildLevelChips(); } catch (e) {}
    if (state.searchOnOpen) {
      setTimeout(function () { try { if ($("searchInput")) $("searchInput").focus(); } catch (e) {} }, 120);
    }
    if ($("levelChips")) {
      $("levelChips").onclick = function (e) {
        var b = e.target.closest("[data-level]");
        if (!b) return;
        state.level = b.getAttribute("data-level");
        state.offset = 0;
        buildLevelChips();
        renderGrid(false);
      };
    }
    if ($("filterChips")) {
      $("filterChips").onclick = function (e) {
        var b = e.target.closest("[data-f]");
        if (!b) return;
        state.filter = b.getAttribute("data-f");
        state.offset = 0;
        Array.prototype.forEach.call($("filterChips").querySelectorAll(".chip"), function (c) {
          c.classList.toggle("active", c.getAttribute("data-f") === state.filter);
        });
        if (state.filter === "mine" && state.profile && state.profile.level) {
          state.level = String(state.profile.level);
          buildLevelChips();
        }
        renderGrid(false);
      };
    }

    var searchTimer;
    if ($("searchInput")) {
      $("searchInput").oninput = function () {
        clearTimeout(searchTimer);
        var v = this.value;
        var box = $("searchBox");
        var hint = $("searchHint");
        if (box) box.classList.add("loading");
        if (hint) {
          hint.textContent = v.trim() ? "Searching…" : "";
          hint.classList.add("show");
        }
        searchTimer = setTimeout(function () {
          state.query = v;
          state.offset = 0;
          renderGrid(false);
          if (box) box.classList.remove("loading");
          if (hint) {
            if (!v.trim()) {
              hint.textContent = "";
              hint.classList.remove("show");
            } else {
              hint.textContent = state.total + " result" + (state.total === 1 ? "" : "s") + " for “" + v.trim() + "”";
              hint.classList.add("show");
            }
          }
        }, 280);
      };
    }
    if ($("btnHeroSearch") && $("searchInput")) {
      $("btnHeroSearch").onclick = function () {
        $("searchInput").dispatchEvent(new Event("input", { bubbles: true }));
      };
    }
    if ($("sortSelect")) {
      $("sortSelect").onchange = function () {
        state.sort = this.value || "default";
        state.offset = 0;
        renderGrid(false);
      };
    }

    if ($("btnMore")) {
      $("btnMore").onclick = function () {
        state.offset += state.limit;
        renderGrid(true);
      };
    }

    if ($("courseGrid")) {
      $("courseGrid").onclick = function (e) {
        var add = e.target.closest("[data-add]");
        if (add) {
          e.stopPropagation();
          var code = add.getAttribute("data-add");
          var c = CurriculumLoader.getCourseByCode(code);
          if (!c) return;
          if (state.library[code]) removeFromLibrary(code);
          else addToLibrary(c, false);
          return;
        }
        var card = e.target.closest("[data-code]");
        if (card) openDetail(card.getAttribute("data-code"));
      };
    }

    if ($("myLibList")) {
      $("myLibList").onclick = function (e) {
        var add = e.target.closest("[data-add]");
        if (add) {
          e.stopPropagation();
          var code = add.getAttribute("data-add");
          var c = CurriculumLoader.getCourseByCode(code) || state.library[code];
          if (!c) return;
          if (state.library[code]) removeFromLibrary(code);
          else {
            var full = CurriculumLoader.getCourseByCode(code);
            if (full) addToLibrary(full, false);
          }
          return;
        }
        var card = e.target.closest("[data-code]");
        if (!card) return;
        var code = card.getAttribute("data-code");
        var full = CurriculumLoader.getCourseByCode(code);
        var meta = state.library[code] || {};
        var ready = (full && full.hasContent) || !!meta.hasContent;
        if (ready && state.entryMode === "cbt") {
          location.href = practiceHref(code, "cbt");
          return;
        }
        if (ready && state.entryMode === "notes") {
          location.href = practiceHref(code, "notes");
          return;
        }
        openDetail(code);
      };
    }

    if ($("sheetBg")) $("sheetBg").onclick = closeDetail;
    if ($("sheetClose")) $("sheetClose").onclick = closeDetail;
    if ($("dClose2")) $("dClose2").onclick = closeDetail;
    if ($("dAdd")) {
      $("dAdd").onclick = function () {
        if (!state.selected) return;
        if (state.library[state.selected.code]) removeFromLibrary(state.selected.code);
        else addToLibrary(state.selected, false);
      };
    }

    if ($("btnMyLib")) {
      $("btnMyLib").onclick = function () { hubGo("myLibrary"); };
    }
    function goBrowse() {
      var mode = state.entryMode || "browse";
      if (mode === "cbt" || mode === "notes") markSetupFlow(mode);
      hubGo("courseLibrary");
    }
    if ($("btnBrowseFromLib")) $("btnBrowseFromLib").onclick = goBrowse;
    if ($("qaBrowse")) $("qaBrowse").onclick = goBrowse;

    if ($("btnReseed")) {
      $("btnReseed").onclick = function () { restoreProgrammeCourses(); };
    }
    if ($("btnClearLib")) {
      $("btnClearLib").onclick = function () { clearLibrary(); };
    }

    if ($("themeRow")) {
      $("themeRow").onclick = function (e) {
        var d = e.target.closest("[data-theme]");
        if (!d) return;
        applyLibTheme(d.getAttribute("data-theme"));
      };
    }
    if ($("sem1Btn")) {
      $("sem1Btn").onclick = function () { setLibrarySemester("1"); };
    }
    if ($("sem2Btn")) {
      $("sem2Btn").onclick = function () { setLibrarySemester("2"); };
    }

    if ($("reqSend")) $("reqSend").onclick = submitRequest;
    if ($("reqCancel") && $("reqModal")) {
      $("reqCancel").onclick = function () { $("reqModal").classList.remove("open"); };
    }
    if ($("btnRequest")) {
      $("btnRequest").onclick = function () {
        if ($("reqModal")) $("reqModal").classList.add("open");
      };
    }
    if ($("btnRequestEmpty")) {
      $("btnRequestEmpty").onclick = function () {
        if ($("reqModal")) $("reqModal").classList.add("open");
      };
    }

    if ($("confirmNo")) {
      $("confirmNo").onclick = function () {
        if ($("confirmBg")) $("confirmBg").classList.remove("open");
        state.pendingAdd = null;
      };
    }
    if ($("confirmYes")) {
      $("confirmYes").onclick = function () {
        if ($("confirmBg")) $("confirmBg").classList.remove("open");
        if (state.pendingAdd) addToLibrary(state.pendingAdd, true);
        state.pendingAdd = null;
      };
    }
  }

  async function loadProfile(uid) {
    state.profile = null;
    try {
      var snap = await db.collection("users").doc(uid).get();
      if (snap.exists) state.profile = snap.data();
    } catch (e) {
      console.warn("[library] users read failed", e);
    }
    try {
      var raw = localStorage.getItem("loggedInUser");
      if (raw) {
        var local = JSON.parse(raw);
        if (!state.profile) state.profile = local;
        else {
          // fill gaps from local
          ["faculty", "department", "level", "semester", "university", "fullName"].forEach(function (k) {
            if (!state.profile[k] && local[k]) state.profile[k] = local[k];
          });
        }
      }
    } catch (e2) {}
    console.log("[library] profile", state.profile && {
      faculty: state.profile.faculty,
      department: state.profile.department,
      level: state.profile.level,
      semester: state.profile.semester
    });
  }

  auth.onAuthStateChanged(async function (user) {
    if (!user) {
      hubGo("login");
      return;
    }
    state.user = user;
    try { setCatalogReady(false); } catch (e) {}
    try { bind(); } catch (eBind) { console.error("[library] bind failed", eBind); }
    try { await loadProfile(user.uid); } catch (eP) { console.warn("[library] profile", eP); }
    try { await loadLibrary(); } catch (eL) { console.warn("[library] library", eL); }
    try { await ensureProgrammeCourses(false); } catch (eS) { console.warn("[library] seed", eS); }
    if (state.profile && state.profile.level) {
      state.level = String(state.profile.level);
    }
    state.librarySemester = normalizeSemester(
      localStorage.getItem("selectedSemester") ||
      (state.profile && state.profile.semester) ||
      "1"
    );
    var s1 = $("sem1Btn"), s2 = $("sem2Btn");
    if (s1) s1.classList.toggle("active", state.librarySemester === "1");
    if (s2) s2.classList.toggle("active", state.librarySemester === "2");

    try { buildLevelChips(); } catch (e) {}
    try { renderGrid(false); } catch (eG) {
      console.error("[library] renderGrid", eG);
      try { setCatalogReady(true); } catch (e2) {}
    }

    if (personalPage || state.entryMode === "cbt" || state.entryMode === "notes") {
      document.title = (state.entryMode === "cbt" ? "CBT · " : state.entryMode === "notes" ? "Notes · " : "") + "My Library · Codex Hub";
      try { renderMyLib(); } catch (eM) { console.error("[library] renderMyLib", eM); }
      if ($("myLibPanel")) $("myLibPanel").classList.add("open");
      try { setMyLibSkel(false); } catch (eSk) {}
    } else {
      try { setCatalogReady(true); } catch (e) {}
    }
  });

})();
