/**
 * Codex Hub — one-time welcome cards (simple text, not heavy tours).
 */
(function (w) {
  "use strict";
  var KEY_PREFIX = "codex_tour_";
  var VERSION = "v1";

  function storageKey(id) {
    return KEY_PREFIX + id + "_" + VERSION;
  }

  function hasSeen(id) {
    try { return localStorage.getItem(storageKey(id)) === "1"; } catch (e) { return false; }
  }

  function markSeen(id) {
    try { localStorage.setItem(storageKey(id), "1"); } catch (e) {}
  }

  function clearSeen(id) {
    try {
      if (id) localStorage.removeItem(storageKey(id));
      else {
        Object.keys(localStorage).forEach(function (k) {
          if (k.indexOf(KEY_PREFIX) === 0) localStorage.removeItem(k);
        });
      }
    } catch (e) {}
  }

  function injectStyles() {
    if (document.getElementById("codex-onboard-css")) return;
    var s = document.createElement("style");
    s.id = "codex-onboard-css";
    s.textContent = [
      ".codex-ob-back{position:fixed;inset:0;background:rgba(15,23,42,.4);z-index:9998;}",
      ".codex-ob-card{position:fixed;left:50%;bottom:max(20px,env(safe-area-inset-bottom));transform:translateX(-50%);",
      "width:min(420px,calc(100% - 28px));background:#fff;border-radius:18px;padding:18px 16px 14px;",
      "box-shadow:0 16px 48px rgba(15,23,42,.22);z-index:9999;border:1px solid #E2E8F0;}",
      "html.theme-dark .codex-ob-card{background:#1E293B;border-color:#334155;color:#F8FAFC;}",
      ".codex-ob-card h3{margin:0 0 6px;font-size:1.02rem;font-weight:800;}",
      ".codex-ob-card p{margin:0 0 14px;font-size:.88rem;line-height:1.55;color:#64748B;}",
      "html.theme-dark .codex-ob-card p{color:#94A3B8;}",
      ".codex-ob-actions{display:flex;gap:10px;justify-content:flex-end;align-items:center;}",
      ".codex-ob-actions button{appearance:none;border:0;border-radius:12px;padding:10px 16px;font-weight:800;",
      "font-size:.84rem;cursor:pointer;font-family:inherit;}",
      ".codex-ob-skip{background:transparent;color:#64748B;}",
      ".codex-ob-next{background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#fff;}"
    ].join("");
    document.head.appendChild(s);
  }

  /** Multi-step (rarely used). Prefer welcome(). */
  function start(id, steps, opts) {
    opts = opts || {};
    if (!steps || !steps.length) return;
    if (!opts.force && hasSeen(id)) return;
    injectStyles();
    var i = 0;
    var back = document.createElement("div");
    back.className = "codex-ob-back";
    var card = document.createElement("div");
    card.className = "codex-ob-card";
    card.setAttribute("role", "dialog");

    function close(done) {
      try { back.remove(); card.remove(); } catch (e) {}
      if (done) markSeen(id);
    }

    function paint() {
      var step = steps[i];
      var multi = steps.length > 1;
      card.innerHTML =
        (multi ? '<div style="font-size:.72rem;font-weight:700;color:#94A3B8;margin-bottom:8px">Tip ' + (i + 1) + " of " + steps.length + "</div>" : "") +
        "<h3>" + (step.title || "Welcome") + "</h3>" +
        "<p>" + (step.body || "") + "</p>" +
        '<div class="codex-ob-actions">' +
          (multi ? '<button type="button" class="codex-ob-skip">Skip</button>' : "") +
          '<button type="button" class="codex-ob-next">' +
            (i === steps.length - 1 ? "Got it" : "Next") +
          "</button>" +
        "</div>";
      var skip = card.querySelector(".codex-ob-skip");
      if (skip) skip.onclick = function () { close(true); };
      card.querySelector(".codex-ob-next").onclick = function () {
        if (i >= steps.length - 1) close(true);
        else { i++; paint(); }
      };
      back.onclick = function () { close(true); };
    }

    document.body.appendChild(back);
    document.body.appendChild(card);
    paint();
  }

  /** One-shot welcome card for a page */
  function welcome(id, title, body, force) {
    start(id, [{ title: title, body: body }], { force: !!force });
  }

  var COPY = {
    home: {
      title: "Welcome to Codex Hub",
      body: "This is your home base. Use Quick Access for Course library, CBT exams, Notes, and PDFs. Stats show your streak, level, rank, and CBT trials left. Switch semester on the purple card anytime."
    },
    chats: {
      title: "Welcome to Chats",
      body: "Message classmates and groups here. Open a chat from the list. Long-press a message to Reply, Copy, or Delete. Tap ⋮ in a chat for Search, Mute, Clear, and more."
    },
    "course-library": {
      title: "Welcome to Course library",
      body: "Browse courses for your programme. Tap a course to see details and add it to My Library. Use filters and search to find codes quickly."
    },
    "my-library": {
      title: "Welcome to My Library",
      body: "Courses you added live here. Switch 1st / 2nd semester above. Restore programme courses fills your curriculum; Clear library removes everything you added."
    },
    cbt: {
      title: "Welcome to CBT Exam",
      body: "Pick a course from your library, choose practice or exam mode, then start. Free and Regular plans use limited trials — watch the counter so you don’t run out mid-revision."
    },
    notes: {
      title: "Welcome to Notes",
      body: "Read notes by topic for courses in your library. Open a course, pick a topic, and study offline-friendly summaries when available."
    },
    resources: {
      title: "Welcome to PDF library",
      body: "Download past questions and course PDFs. Filter by faculty or course, open a file, and save what you need for offline reading."
    },
    "student-tools": {
      title: "Welcome to Student tools",
      body: "Helpers for code, flowcharts, diagrams, scan-and-solve, and more. Pick a tool, follow the short instructions on that screen, and export or copy your result."
    },
    "study-lab": {
      title: "Welcome to Study Lab",
      body: "A focused workspace for docs and study sessions. Open a lab activity and use the editor tools to organise your work."
    },
    "ai-lab": {
      title: "Welcome to AI Lab",
      body: "Jump into Nova or specialised AI tools from here. Nova is best for explanations, quizzes, and study plans; tools handle diagrams and code."
    },
    stats: {
      title: "Welcome to Stats",
      body: "See how you’re doing on CBTs — average score, sessions, weak courses, and recent history. Use it to decide what to revise next."
    },
    ranks: {
      title: "Welcome to Ranks",
      body: "Leaderboard by XP from study activity. Filter by level or semester. Top three get gold, silver, and bronze highlights."
    },
    todo: {
      title: "Welcome to Study Planner",
      body: "Create study plans and tasks with due dates and reminders. Add tasks, save the plan, and check them off as you go."
    },
    profile: {
      title: "Welcome to Profile",
      body: "Your public student card — plan, streak, friends, and referral code. Edit profile to update name, bio, and photo; remember to tap Save."
    },
    settings: {
      title: "Your control centre",
      body: "Theme, notifications, Nova voice, semester default, and privacy. Changes apply across Home, chats, and tools."
    },
    "edit-profile": {
      title: "Remember to save",
      body: "After you change name, bio, or photo, tap Save changes at the bottom before you leave — or your edits won’t stick."
    }
  };

  function welcomePage(id, force) {
    var c = COPY[id];
    if (!c) return;
    welcome(id, c.title, c.body, force);
  }

  function startChatsTour(force) {
    welcomePage("chats", force);
  }

  /** Auto-run after short delay (layout settles) */
  function auto(id, delay) {
    setTimeout(function () {
      try { welcomePage(id); } catch (e) {}
    }, typeof delay === "number" ? delay : 600);
  }

  w.CodexOnboarding = {
    hasSeen: hasSeen,
    markSeen: markSeen,
    clearSeen: clearSeen,
    start: start,
    welcome: welcome,
    welcomePage: welcomePage,
    startChatsTour: startChatsTour,
    auto: auto,
    COPY: COPY
  };
})(window);
