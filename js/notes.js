/**
 * Codex Hub 2.0 — Study Notes
 * Entry: notes.html?code=BIO101[&topic=...]
 * Data: questions/{code}.notes  { topicName: "html/text" }
 * Progress: users/{uid}/reading/{code} { topic, updatedAt }
 * Media: course-media.js + optional course_media/{code}
 */
(function () {
  "use strict";

  if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
  var auth = firebase.auth();
  var db = firebase.firestore();

  var state = {
    user: null,
    code: "",
    title: "",
    notesMap: {}, // topic -> string
    topics: [],
    topic: "",
    media: null,
    reading: null
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
    setTimeout(function () { t.classList.remove("show"); }, 2200);
  }
  function qs(name) {
    var m = new URLSearchParams(location.search).get(name);
    return m ? String(m).trim() : "";
  }

  function show(id) {
    var desk = window.matchMedia("(min-width: 900px)").matches;
    document.body.classList.toggle("notes-desk", desk);
    document.body.classList.toggle("mode-read", id === "screenRead");
    ["screenLoad", "screenTopics", "screenRead", "screenEmpty"].forEach(function (s) {
      var el = $(s);
      if (!el) return;
      if (desk && id === "screenRead") {
        // Desktop: keep topic list + reader visible together
        el.classList.toggle("hidden", s === "screenLoad" || s === "screenEmpty");
      } else {
        el.classList.toggle("hidden", s !== id);
      }
    });
  }

  function isHtmlish(s) {
    return /<[a-z][\s\S]*>/i.test(s || "") && !/\*\*|\$\$|\\\[|\\\(/.test(s || "");
  }

  function inlineMarkup(text) {
    var safe = esc(text);
    safe = safe.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    safe = safe.replace(/(^|[^\*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    return safe;
  }

  function formatMathSafeText(text) {
    var parts = String(text).split(
      /(\\\[.*?\\\]|\\\(.*?\\\)|\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g
    );
    return parts.map(function (part) {
      if (
        part.indexOf("\\[") === 0 ||
        part.indexOf("\\(") === 0 ||
        part.indexOf("$$") === 0 ||
        (part.charAt(0) === "$" && part.charAt(part.length - 1) === "$")
      ) {
        return part;
      }
      return inlineMarkup(part);
    }).join("");
  }

  function isFormulaLine(trimmed) {
    return (
      trimmed.indexOf("$$") === 0 ||
      trimmed.indexOf("\\[") === 0 ||
      (
        trimmed.indexOf("=") !== -1 &&
        /\\(?:frac|sqrt|sum|int|times|cdot|pm|Delta|alpha|beta|gamma|theta|lambda|mu|sigma|Omega|omega)\b/.test(trimmed)
      )
    );
  }

  function normalizeFormula(trimmed) {
    if (trimmed.indexOf("$$") === 0 && trimmed.lastIndexOf("$$") === trimmed.length - 2) {
      return "\\[" + trimmed.slice(2, -2) + "\\]";
    }
    if (trimmed.indexOf("\\[") === 0 && trimmed.lastIndexOf("\\]") === trimmed.length - 2) {
      return trimmed;
    }
    return "\\[" + trimmed + "\\]";
  }

  function formatBody(raw) {
    if (!raw) return "<p class='muted'>No notes for this topic yet.</p>";
    var text = String(raw).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (isHtmlish(text) && text.indexOf("<p") !== -1) return text;

    var lines = text.split("\n");
    var html = "";
    for (var i = 0; i < lines.length; i++) {
      var original = lines[i];
      var trimmed = original.trim();
      if (!trimmed) {
        html += '<div style="height:8px"></div>';
        continue;
      }
      var headingMatch = trimmed.match(/^#{1,6}\s+(.+)$/);
      if (headingMatch) {
        html +=
          '<div class="section-heading">' +
          inlineMarkup(headingMatch[1].trim()) +
          "</div>";
        continue;
      }
      if (/^(?:[-*•›])\s+/.test(trimmed)) {
        var bullet = trimmed.replace(/^(?:[-*•›])\s+/, "");
        html +=
          '<div class="note-bullet"><span class="b">›</span><span>' +
          formatMathSafeText(bullet) +
          "</span></div>";
        continue;
      }
      var numbered = trimmed.match(/^(\d+)\.\s+(.+)$/);
      if (numbered) {
        html +=
          '<div class="note-num"><span class="n">' +
          esc(numbered[1]) +
          "</span><span>" +
          formatMathSafeText(numbered[2]) +
          "</span></div>";
        continue;
      }
      if (isFormulaLine(trimmed)) {
        html += '<div class="formula-block">' + normalizeFormula(trimmed) + "</div>";
        continue;
      }
      if (/^(example|worked example|example:|worked example:)\b/i.test(trimmed)) {
        html += '<div class="example-block">' + formatMathSafeText(trimmed) + "</div>";
        continue;
      }
      html +=
        '<p class="note-p">' + formatMathSafeText(trimmed) + "</p>";
    }
    return html || "<p class='muted'>No notes for this topic yet.</p>";
  }

  function typesetMath() {
    if (window.MathJax && MathJax.typesetPromise) {
      var el = $("notesBody");
      if (el) MathJax.typesetPromise([el]).catch(function () {});
    }
  }

  async function loadNotesDoc(code) {
    var snap = await db.collection("questions").doc(code).get();
    if (!snap.exists) return null;
    var data = snap.data() || {};
    var notes = data.notes;
    var map = {};
    if (notes && typeof notes === "object" && !Array.isArray(notes)) {
      Object.keys(notes).forEach(function (t) {
        var v = notes[t];
        if (v == null) return;
        map[t] = typeof v === "string" ? v : (v.text || v.content || JSON.stringify(v));
      });
    }
    var topics = Object.keys(map);
    // fallback: topic names from questions bank even if notes empty
    if (!topics.length && data.questions && typeof data.questions === "object") {
      topics = Object.keys(data.questions);
      topics.forEach(function (t) {
        if (!map[t]) map[t] = "";
      });
    }
    return {
      map: map,
      topics: topics,
      title: data.title || data.courseTitle || code
    };
  }

  async function loadReading(uid, code) {
    try {
      var snap = await db.collection("users").doc(uid).collection("reading").doc(code).get();
      if (snap.exists) return snap.data() || null;
    } catch (e) {
      console.warn("reading", e);
    }
    return null;
  }

  async function saveReading(topic) {
    if (!state.user || !state.code || !topic) return;
    try {
      await db.collection("users").doc(state.user.uid).collection("reading").doc(state.code).set(
        {
          topic: topic,
          code: state.code,
          title: state.title,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    } catch (e) {
      console.warn("save reading", e);
    }
  }

  function renderTopicList() {
    $("listTitle").textContent = state.title || state.code;
    $("listSub").textContent = state.topics.length
      ? state.topics.length + " topic" + (state.topics.length === 1 ? "" : "s")
      : "No topics yet";

    var mediaWrap = $("mediaBanner");
    if (state.media && (state.media.playlistUrl || state.media.playlistId)) {
      mediaWrap.classList.remove("hidden");
      $("mediaTitle").textContent = state.media.title || "Lecture playlist";
      $("btnPlaylist").href = window.CodexCourseMedia
        ? CodexCourseMedia.playlistUrl(state.media)
        : state.media.playlistUrl || "#";
    } else {
      mediaWrap.classList.add("hidden");
    }

    var cont = $("continueCard");
    if (state.reading && state.reading.topic && state.notesMap[state.reading.topic] !== undefined) {
      cont.classList.remove("hidden");
      $("continueTopic").textContent = state.reading.topic;
      $("btnContinue").onclick = function () { openTopic(state.reading.topic); };
    } else {
      cont.classList.add("hidden");
    }

    var list = $("topicList");
    if (!state.topics.length) {
      list.innerHTML =
        '<div class="empty-inline">Notes for this course are not uploaded yet. You can still practice CBT when questions are live.</div>';
      return;
    }

    list.innerHTML = state.topics
      .map(function (t, i) {
        var has = !!(state.notesMap[t] && String(state.notesMap[t]).trim());
        var last = state.reading && state.reading.topic === t;
        return (
          '<button type="button" class="topic-row' +
          (last ? " last" : "") +
          '" data-topic="' +
          esc(t) +
          '">' +
          '<span class="num">' +
          (i + 1) +
          "</span>" +
          '<span class="name">' +
          esc(t) +
          "</span>" +
          (has
            ? '<span class="badge ready">Notes</span>'
            : '<span class="badge soon">Soon</span>') +
          (last ? '<span class="badge cont">Continue</span>' : "") +
          '<span class="chev" aria-hidden="true">›</span>' +
          "</button>"
        );
      })
      .join("");

    list.onclick = function (e) {
      var btn = e.target.closest(".topic-row");
      if (!btn) return;
      openTopic(btn.getAttribute("data-topic"));
    };
  }

  function openTopic(topic) {
    state.topic = topic;
    show("screenRead");
    $("readCode").textContent = state.code;
    $("readTopic").textContent = topic;
    $("notesBody").innerHTML = formatBody(state.notesMap[topic]);
    typesetMath();
    saveReading(topic);
    try {
      document.querySelectorAll(".topic-row").forEach(function (row) {
        row.classList.toggle("active", row.getAttribute("data-topic") === topic);
      });
    } catch (e) {}
    // update URL without reload
    try {
      var u = new URL(location.href);
      u.searchParams.set("code", state.code);
      u.searchParams.set("topic", topic);
      history.replaceState(null, "", u.pathname + u.search);
    } catch (e) {}
    window.scrollTo(0, 0);
    updateTopicProgressUI();
  }

  function topicIndex() {
    return state.topics.indexOf(state.topic);
  }

  function isTopicRead(topic) {
    try {
      var key = "codex_notes_read_" + (state.user && state.user.uid || "x") + "_" + state.code;
      var raw = localStorage.getItem(key);
      var map = raw ? JSON.parse(raw) : {};
      return !!(map && map[topic]);
    } catch (e) { return false; }
  }

  function markTopicRead(topic) {
    try {
      var key = "codex_notes_read_" + (state.user && state.user.uid || "x") + "_" + state.code;
      var raw = localStorage.getItem(key);
      var map = raw ? JSON.parse(raw) : {};
      map[topic] = true;
      localStorage.setItem(key, JSON.stringify(map));
    } catch (e) {}
    // also persist a flag on the reading doc when possible
    if (state.user && state.code && topic) {
      db.collection("users").doc(state.user.uid).collection("reading").doc(state.code).set(
        { topic: topic, readTopics: firebase.firestore.FieldValue.arrayUnion(topic), updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      ).catch(function () {});
    }
  }

  function updateTopicProgressUI() {
    var markBtn = $("btnMarkRead");
    var nextBtn = $("btnNextTopic");
    if (!markBtn || !nextBtn) return;
    var idx = topicIndex();
    var hasNext = idx >= 0 && idx < state.topics.length - 1;
    var read = isTopicRead(state.topic);
    if (read) {
      markBtn.classList.add("done");
      markBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l5 5L20 7"/></svg> Read';
    } else {
      markBtn.classList.remove("done");
      markBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l5 5L20 7"/></svg> Mark as read';
    }
    // Next is always available when there is a next topic (do not force mark-as-read)
    nextBtn.disabled = !hasNext;
    nextBtn.textContent = hasNext ? "Next topic" : "Last topic";
    if (hasNext) {
      nextBtn.innerHTML = 'Next topic <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>';
    }
  }

  function plainTextFromBody() {
    var el = $("notesBody");
    return el ? el.innerText || el.textContent || "" : "";
  }

  function bindActions() {
    $("btnBackTopics").onclick = function () {
      show("screenTopics");
      try {
        var u = new URL(location.href);
        u.searchParams.delete("topic");
        history.replaceState(null, "", u.pathname + u.search);
      } catch (e) {}
    };

    var markBtn = $("btnMarkRead");
    if (markBtn) {
      markBtn.onclick = function () {
        if (!state.topic) return;
        markTopicRead(state.topic);
        updateTopicProgressUI();
        toast("Marked as read");
      };
    }
    var nextBtn = $("btnNextTopic");
    if (nextBtn) {
      nextBtn.onclick = function () {
        var idx = topicIndex();
        if (idx < 0 || idx >= state.topics.length - 1) return;
        // soft-auto mark current when moving on
        if (state.topic && !isTopicRead(state.topic)) markTopicRead(state.topic);
        openTopic(state.topics[idx + 1]);
      };
    }
    $("btnBackLib").onclick = function () {
      location.href = "course-library.html?mode=notes";
    };
    $("btnBackLib2").onclick = function () {
      location.href = "course-library.html?mode=notes";
    };

    $("btnCopy").onclick = function () {
      var text = state.topic + "\n\n" + plainTextFromBody();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () { toast("Copied"); },
          function () { fallbackCopy(text); }
        );
      } else fallbackCopy(text);
    };

    $("btnShare").onclick = async function () {
      var text = state.code + " · " + state.topic + "\n\n" + plainTextFromBody().slice(0, 1500);
      if (navigator.share) {
        try {
          await navigator.share({ title: state.code + " notes", text: text });
          return;
        } catch (e) {}
      }
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        toast("Copied — paste anywhere to share");
      }
    };

    $("btnDownload").onclick = function () {
      var html =
        "<!DOCTYPE html><html><head><meta charset='utf-8'><title>" +
        esc(state.code) +
        " — " +
        esc(state.topic) +
        "</title>" +
        "<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;line-height:1.65;color:#0f172a}" +
        "h1{font-size:1.25rem} h2{font-size:1.05rem;color:#64748b}</style></head><body>" +
        "<h1>" +
        esc(state.code) +
        "</h1><h2>" +
        esc(state.topic) +
        "</h2>" +
        formatBody(state.notesMap[state.topic]) +
        "<p style='margin-top:32px;font-size:12px;color:#94a3b8'>Exported from Codex Hub</p></body></html>";
      var blob = new Blob([html], { type: "text/html" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (state.code + "_" + state.topic).replace(/[^\w\-]+/g, "_").slice(0, 80) + ".html";
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      toast("Download started");
    };

    $("btnSpeak").onclick = function () {
      if (!window.speechSynthesis) {
        toast("Read aloud not supported here");
        return;
      }
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(plainTextFromBody().slice(0, 4000));
      u.rate = 0.95;
      window.speechSynthesis.speak(u);
      toast("Reading…");
    };

    $("btnStopSpeak").onclick = function () {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    };

    $("btnNova").onclick = function () {
      var body = plainTextFromBody().slice(0, 2500);
      var q =
        "Please give a detailed explanation of this topic and expand on the notes.\n\n" +
        "Course: " + state.code + "\nTopic: " + state.topic + "\n\nNotes:\n" + body;
      try {
        sessionStorage.setItem("novaNotesContext", JSON.stringify({
          code: state.code, topic: state.topic, notes: plainTextFromBody().slice(0, 6000)
        }));
        sessionStorage.setItem("novaPrefill", q);
        sessionStorage.setItem("nova_prefill", q);
      } catch (e) {}
      location.href = "nova.html?prefill=" + encodeURIComponent(q.slice(0, 1800));
    };

    $("btnOnline").onclick = function () {
      var q = encodeURIComponent(state.code + " " + state.topic + " university lecture notes");
      window.open("https://www.google.com/search?q=" + q, "_blank", "noopener");
    };

    $("btnYt").onclick = function () {
      if (!state.media) {
        toast("No lecture playlist linked yet");
        return;
      }
      var url = CodexCourseMedia.playlistUrl(state.media);
      if (!url) {
        toast("No lecture playlist linked yet");
        return;
      }
      window.open(url, "_blank", "noopener");
    };
  }

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      toast("Copied");
    } catch (e) {
      toast("Copy failed");
    }
    document.body.removeChild(ta);
  }

  async function boot() {
    bindActions();
    state.code = qs("code");
    if (!state.code) {
      location.href = "course-library.html?mode=notes";
      return;
    }

    show("screenLoad");
    $("loadLabel").textContent = "Loading " + state.code + "…";

    auth.onAuthStateChanged(async function (user) {
      if (!user) {
        location.href = "../login.html";
        return;
      }
      state.user = user;
      try {
        var bank = await loadNotesDoc(state.code);
        if (!bank || !bank.topics.length) {
          show("screenEmpty");
          $("emptyCode").textContent = state.code;
          return;
        }
        state.notesMap = bank.map;
        state.topics = bank.topics;
        state.title = bank.title;
        if ($("topCode")) $("topCode").textContent = state.code;
        if ($("topTitle")) $("topTitle").textContent = state.title || "Study notes";

        if (window.CodexCourseMedia) {
          state.media = await CodexCourseMedia.resolve(state.code, db);
        }
        state.reading = await loadReading(user.uid, state.code);

        var want = qs("topic");
        if (want && state.notesMap[want] !== undefined) {
          openTopic(want);
        } else {
          show("screenTopics");
          renderTopicList();
        }

        // show YT on reader when media exists
        var yt = $("btnYt");
        if (yt) yt.classList.toggle("hidden", !(state.media && (state.media.playlistUrl || state.media.playlistId)));
      } catch (e) {
        console.error(e);
        show("screenEmpty");
        $("emptyCode").textContent = state.code;
        $("emptyMsg").textContent =
          e && e.code === "permission-denied"
            ? "You don’t have permission to read these notes. Sign in again."
            : "Could not load notes. Check your connection and try again.";
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
