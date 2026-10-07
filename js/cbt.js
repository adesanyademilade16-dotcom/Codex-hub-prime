/**
 * Codex Hub 2.0 — CBT engine
 * Library → setup → exam → results
 * Free: 3 lifetime starts (users.cbtTrialsUsed / cbtTrialsLimit)
 * Regular/Pro: unlimited
 */
(function () {
  "use strict";

  if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
  var auth = firebase.auth();
  var db = firebase.firestore();
  try { auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); } catch (e) {}

  var state = {
    user: null,
    profile: null,
    code: "",
    title: "",
    bank: null, // { topic: [q,...] }
    topics: [],
    mode: "exam", // exam | topic
    topic: "",
    count: 15,
    minutes: 25,
    availableCounts: [],
    poolSize: 0,
    quiz: [],
    answers: [],
    marked: [],
    index: 0,
    timerId: null,
    endsAt: 0,
    startedAt: 0,
    durationSec: 0,
    result: null,
    trialsUsed: 0,
    trialsLimit: 3,
    trialConsumedThisSession: false,
    trialRefunded: false,
    plan: "free"
  };

  function $(id) { return document.getElementById(id); }
  function toast(msg) {
    var t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 2200);
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }
  function normPlan(p) {
    p = String(p || "free").toLowerCase();
    if (p.indexOf("pro") >= 0) return "pro";
    if (p.indexOf("regular") >= 0 || p.indexOf("premium") >= 0) return "regular";
    return "free";
  }
  function isPaid() {
    var email = (state.profile && state.profile.email) || (state.user && state.user.email) || "";
    if (String(email).toLowerCase() === "codexhub16@gmail.com") return true;
    var plan = String(state.plan || "free").toLowerCase();
    return plan.indexOf("pro") >= 0 || plan.indexOf("regular") >= 0 || plan === "paid";
  }
  function isAdminUser() {
    var email = (state.profile && state.profile.email) || (state.user && state.user.email) || "";
    try {
      if (!email && firebase.auth().currentUser) email = firebase.auth().currentUser.email || "";
    } catch (e) {}
    return String(email).toLowerCase() === "codexhub16@gmail.com";
  }
  function param(name) {
    try { return new URLSearchParams(location.search).get(name) || ""; }
    catch (e) { return ""; }
  }

  /* ── Question bank ── */
  function normalizeQ(raw, topic) {
    var opts = raw.options || raw.opts || [];
    if (typeof opts === "string") {
      try { opts = JSON.parse(opts); } catch (e) { opts = []; }
    }
    var ans = raw.answer != null ? raw.answer : (raw.ans != null ? raw.ans : raw.correct);
    return {
      q: raw.q || raw.question || raw.text || "",
      options: opts,
      answer: ans,
      explanation: raw.explanation || raw.explain || "",
      topic: topic || raw.topic || "General",
      image: raw.image || raw.img || ""
    };
  }

  function flattenBank(questionsMap) {
    var out = {};
    if (!questionsMap) return out;
    if (Array.isArray(questionsMap)) {
      out["General"] = questionsMap.map(function (q) { return normalizeQ(q, "General"); });
      return out;
    }
    Object.keys(questionsMap).forEach(function (topic) {
      var list = questionsMap[topic];
      if (!Array.isArray(list)) return;
      out[topic] = list.map(function (q) { return normalizeQ(q, topic); });
    });
    return out;
  }

  async function loadBank(code) {
    var snap = await db.collection("questions").doc(code).get();
    if (!snap.exists) return null;
    var data = snap.data() || {};
    var map = flattenBank(data.questions);
    var topics = Object.keys(map).filter(function (t) { return map[t].length; });
    if (!topics.length) return null;
    return { map: map, topics: topics, title: data.title || data.courseTitle || code };
  }

  function poolForMode() {
    if (!state.bank) return [];
    if (state.mode === "topic" && state.topic && state.bank.map[state.topic]) {
      return state.bank.map[state.topic].slice();
    }
    var all = [];
    state.bank.topics.forEach(function (t) {
      all = all.concat(state.bank.map[t] || []);
    });
    return all;
  }

  function refreshCountChips() {
    var pool = poolForMode();
    state.poolSize = pool.length;
    var maxExam = 25;
    var maxTopic = 10;
    var max = state.mode === "topic" ? Math.min(maxTopic, pool.length) : Math.min(maxExam, pool.length);
    var candidates = state.mode === "topic" ? [5, 8, 10] : [10, 15, 20, 25];
    var opts = candidates.filter(function (n) { return n <= max; });
    if (!opts.length && max > 0) opts = [max];
    state.availableCounts = opts;
    if (opts.indexOf(state.count) < 0) {
      state.count = opts.indexOf(15) >= 0 ? 15 : (opts[opts.length - 1] || max || 5);
    }
    var row = $("countChips");
    if (!row) return;
    if (!opts.length) {
      row.innerHTML = '<span style="font-size:.8rem;color:#64748B">No questions available for this selection.</span>';
      $("btnStart").disabled = true;
      return;
    }
    $("btnStart").disabled = false;
    row.innerHTML = opts.map(function (n) {
      return '<button type="button" class="chip' + (n === state.count ? " active" : "") + '" data-count="' + n + '">' + n + "</button>";
    }).join("");
  }

  function refreshTimeChips() {
    var times = state.mode === "topic" ? [5, 10, 15, 20] : [10, 15, 20, 25];
    if (times.indexOf(state.minutes) < 0) state.minutes = state.mode === "topic" ? 10 : 25;
    var row = $("timeChips");
    row.innerHTML = times.map(function (m) {
      return '<button type="button" class="chip' + (m === state.minutes ? " active" : "") + '" data-mins="' + m + '">' + m + " min</button>";
    }).join("");
  }

  function updateTrialsUI() {
    var el = $("trialsNote");
    if (!el) return;
    if (isPaid() && state.trialsLimit >= 999) {
      el.innerHTML = "Your <b>Pro</b> plan includes effectively unlimited CBT practice.";
      return;
    }
    var left = Math.max(0, state.trialsLimit - state.trialsUsed);
    var label = state.plan === "regular" ? "Regular" : (state.plan === "pro" ? "Pro" : "Free");
    el.innerHTML = label + " CBT sessions left: <b>" + left + "</b> of " + state.trialsLimit + " (account lifetime).";
  }

  /* ── Setup screen ── */
  async function showSetup() {
    $("screenSetup").classList.remove("hidden");
    $("screenExam").classList.add("hidden");
    $("screenResults").classList.add("hidden");
    $("timerPill").classList.add("hidden");
    $("btnCalc").classList.add("hidden");
    $("topTitle").textContent = "CBT Setup";
    $("topSub").textContent = state.code || "Course";
    $("setupLoading").classList.remove("hidden");
    $("setupBody").classList.add("hidden");

    try {
      var bank = await loadBank(state.code);
      if (!bank) {
        $("setupLoading").innerHTML =
          "<p><b>Content not ready</b></p><p style='margin-top:8px'>This course has no published questions yet.</p>" +
          '<p style="margin-top:16px"><a href="course-library.html?mode=cbt">Back to library</a></p>';
        return;
      }
      state.bank = bank;
      state.topics = bank.topics;
      state.title = bank.title || state.code;
      $("setupCourseTitle").textContent = state.code + (state.title && state.title !== state.code ? " · " + state.title : "");
      $("setupCourseSub").textContent = "Pick a mode, set questions and timer, then start.";
      $("topTitle").textContent = state.code;
      $("topSub").textContent = "Setup";

      var sel = $("topicSelect");
      sel.innerHTML = state.topics.map(function (t) {
        return '<option value="' + esc(t) + '">' + esc(t) + "</option>";
      }).join("");
      state.topic = state.topics[0] || "";

      setMode(state.mode);
      refreshTimeChips();
      updateTrialsUI();

      $("setupLoading").classList.add("hidden");
      $("setupBody").classList.remove("hidden");
    } catch (err) {
      console.error(err);
      $("setupLoading").textContent = "Could not load questions. Check your connection and try again.";
    }
  }

  function setMode(mode) {
    state.mode = mode === "topic" ? "topic" : "exam";
    $("modeExam").classList.toggle("active", state.mode === "exam");
    $("modeTopic").classList.toggle("active", state.mode === "topic");
    $("topicField").classList.toggle("hidden", state.mode !== "topic");
    if (state.mode === "exam") state.count = 15;
    else state.count = 10;
    refreshCountChips();
    refreshTimeChips();
  }

  /* ── Trials ── */
  async function loadTrialState() {
    if (!state.user) return;
    var snap = await db.collection("users").doc(state.user.uid).get();
    var d = snap.exists ? snap.data() : {};
    state.profile = d;
    state.plan = normPlan(d.plan || d.subscription || d.tier || "free");
    if (state.user && state.user.email && !d.email) d.email = state.user.email;
    state.trialsUsed = Number(d.cbtTrialsUsed) || 0;
    state.trialsBonus = Number(d.cbtTrialsBonus) || 0;
    // Global limits from system/limits (Admin → Configuration)
    var globalFree = 3, globalReg = 30, globalPro = 999;
    try {
      var limSnap = await db.collection("system").doc("limits").get();
      if (limSnap.exists) {
        var lim = limSnap.data() || {};
        if (Number(lim.cbtTrialsFree) >= 0) globalFree = Number(lim.cbtTrialsFree);
        if (Number(lim.cbtTrialsRegular) > 0) globalReg = Number(lim.cbtTrialsRegular);
        if (Number(lim.cbtTrialsPro) > 0) globalPro = Number(lim.cbtTrialsPro);
        state.promoNote = lim.promoNote || "";
      }
    } catch (e) { /* offline / rules */ }
    var personal = Number(d.cbtTrialsLimit) || 0;
    var bonus = Number(state.trialsBonus) || 0;
    var plan = state.plan || "free";
    var baseLimit = globalFree;
    if (plan === "pro") baseLimit = globalPro;
    else if (plan === "regular") baseLimit = globalReg;
    // Personal grant or admin bonus can only raise the cap
    state.trialsLimit = Math.max(baseLimit, personal) + bonus;
  }

  async function consumeTrial() {
    if (isAdminUser()) return true;
    // Pro with "unlimited" soft cap (>= 999) does not burn a trial slot
    if (isPaid() && state.trialsLimit >= 999) return true;
    if (state.trialsUsed >= state.trialsLimit) return false;
    state.trialsUsed += 1;
    state.trialConsumedThisSession = true;
    state.trialRefunded = false;
    try {
      await db.collection("users").doc(state.user.uid).set(
        {
          cbtTrialsUsed: state.trialsUsed,
          cbtTrialsLimit: state.trialsLimit,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    } catch (e) {
      console.warn("trial write", e);
    }
    return true;
  }

  /** Soft refund: if student abandons before submitting and answered < half, give the trial back */
  async function maybeRefundTrial(reason) {
    if (isAdminUser() || (isPaid() && state.trialsLimit >= 999)) return;
    if (!state.trialConsumedThisSession || state.trialRefunded) return;
    var answered = 0;
    (state.answers || []).forEach(function (a) {
      if (a != null && a !== "") answered++;
    });
    var total = (state.quiz && state.quiz.length) || 0;
    // Refund only if they barely started (answered fewer than half)
    if (total > 0 && answered >= Math.ceil(total / 2)) return;
    state.trialRefunded = true;
    state.trialConsumedThisSession = false;
    state.trialsUsed = Math.max(0, (Number(state.trialsUsed) || 1) - 1);
    try {
      await db.collection("users").doc(state.user.uid).set(
        {
          cbtTrialsUsed: state.trialsUsed,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      updateTrialsUI();
      if (reason !== "silent") toast("Practice session restored (you left early)");
    } catch (e) {
      console.warn("trial refund", e);
    }
  }

  /* ── Start exam ── */
  async function startExam() {
    if (!state.user) state.user = auth.currentUser;
    if (!state.user) {
      toast("Your login session is no longer available. Please sign in again.");
      return;
    }
    var pool = poolForMode();
    if (!pool.length) {
      toast("No questions for this selection.");
      return;
    }
    if (!(isPaid() && state.trialsLimit >= 999) && state.trialsUsed >= state.trialsLimit) {
      $("trialModal").classList.add("open");
      return;
    }
    var ok = await consumeTrial();
    if (!ok) {
      $("trialModal").classList.add("open");
      return;
    }
    updateTrialsUI();

    var n = Math.min(state.count, pool.length);
    state.quiz = shuffle(pool).slice(0, n);
    state.answers = state.quiz.map(function () { return null; });
    state.marked = state.quiz.map(function () { return false; });
    state.index = 0;
    state.durationSec = state.minutes * 60;
    state.startedAt = Date.now();
    state.endsAt = state.startedAt + state.durationSec * 1000;

    $("screenSetup").classList.add("hidden");
    $("screenExam").classList.remove("hidden");
    $("screenResults").classList.add("hidden");
    $("timerPill").classList.remove("hidden");
    $("btnCalc").classList.remove("hidden");
    $("topTitle").textContent = state.code;
    $("topSub").textContent = state.mode === "topic" ? state.topic : "Exam practice";

    // mobile submit visibility
    if (window.matchMedia("(max-width: 899px)").matches) {
      $("btnSubmitMob").style.display = "block";
    }

    buildNavigators();
    renderQuestion();
    startTimer();
  }

  function startTimer() {
    if (state.timerId) clearInterval(state.timerId);
    function tick() {
      var left = Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
      var m = Math.floor(left / 60);
      var s = left % 60;
      var text = m + ":" + (s < 10 ? "0" : "") + s;
      var pill = $("timerPill");
      pill.textContent = text;
      pill.classList.toggle("warn", left <= 120 && left > 30);
      pill.classList.toggle("danger", left <= 30);
      if (left <= 0) {
        clearInterval(state.timerId);
        state.timerId = null;
        finishExam(true);
      }
    }
    tick();
    state.timerId = setInterval(tick, 250);
  }

  function buildNavigators() {
    function cells(container) {
      if (!container) return;
      container.innerHTML = state.quiz.map(function (_, i) {
        return '<button type="button" data-i="' + i + '">' + (i + 1) + "</button>";
      }).join("");
      container.onclick = function (e) {
        var b = e.target.closest("[data-i]");
        if (!b) return;
        state.index = Number(b.getAttribute("data-i"));
        renderQuestion();
      };
    }
    cells($("deskNav"));
    cells($("mobileNav"));
  }

  function paintNav() {
    function paint(container) {
      if (!container) return;
      var btns = container.querySelectorAll("button");
      btns.forEach(function (b, i) {
        b.classList.toggle("cur", i === state.index);
        b.classList.toggle("answered", state.answers[i] != null && state.answers[i] !== "");
        b.classList.toggle("marked", !!state.marked[i]);
      });
    }
    paint($("deskNav"));
    paint($("mobileNav"));
    var total = state.quiz.length || 0;
    var done = state.answers.filter(function (a) { return a != null && a !== ""; }).length;
    var pctPos = total ? ((state.index + 1) / total) * 100 : 0;
    var pctDone = total ? (done / total) * 100 : 0;
    if ($("progBar")) $("progBar").style.width = pctPos + "%";
    if ($("attemptPill")) $("attemptPill").textContent = "Attempted " + done + "/" + total;
    if ($("attemptBar")) $("attemptBar").style.width = pctDone + "%";
  }

  function formatMathHtml(raw) {
    var s = String(raw == null ? "" : raw);
    // Prefer inline $...$ for short formulas so questions read as sentences
    // Only wrap long/display blocks. Keep sentence flow: "If $sin θ = 1/2$ and $θ$ is acute, find $cos θ$."
    var parts = s.split(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^$\n]+\$)/g);
    var html = parts.map(function (part) {
      if (!part) return "";
      var isDisp = part.indexOf("$$") === 0 || part.indexOf("\\[") === 0;
      var isInline = part.indexOf("\\(") === 0 ||
        (part.charAt(0) === "$" && part.charAt(part.length - 1) === "$" && part.indexOf("$$") !== 0);
      if (isDisp || isInline) {
        // Short display math → treat as inline so questions don't scatter
        if (isDisp) {
          var inner = part.replace(/^\$\$/, "").replace(/\$\$$/, "").replace(/^\\\[/, "").replace(/\\\]$/, "").trim();
          // short formula → inline; long formula → scrollable block
          if (inner.length < 48 && inner.indexOf("\n") < 0) {
            return '<span class="math-inline">$' + inner + "$</span>";
          }
          return '<div class="math-block">$$' + inner + "$$</div>";
        }
        return '<span class="math-inline">' + part + "</span>";
      }
      return part
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/\n+/g, " "); // keep as flowing sentence, not scattered lines
    }).join("");
    // collapse extra spaces from newline joins
    return html.replace(/\s{2,}/g, " ").trim();
  }
  function typesetMath(root) {
    try {
      if (window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetPromise(root ? [root] : undefined).catch(function () {});
      }
    } catch (e) {}
  }
  function renderQuestion() {
    var q = state.quiz[state.index];
    if (!q) return;
    $("qNum").textContent = "Question " + (state.index + 1) + " of " + state.quiz.length;
    $("qTopic").textContent = q.topic ? "Topic · " + q.topic : "";
    $("qText").innerHTML = formatMathHtml(q.q);
    var imgWrap = $("qImgWrap");
    imgWrap.innerHTML = "";
    if (q.image) {
      imgWrap.innerHTML = '<img class="q-img" src="' + esc(q.image) + '" alt="" />';
    }
    var selected = state.answers[state.index];
    $("optsList").innerHTML = (q.options || []).map(function (opt, i) {
      var letter = String.fromCharCode(65 + i);
      var sel = opt === selected ? " selected" : "";
      return (
        '<li class="opt' + sel + '" data-opt="' + esc(opt) + '">' +
        '<span class="letter">' + letter + "</span>" +
        '<span class="txt">' + formatMathHtml(opt) + "</span></li>"
      );
    }).join("");
    $("btnMark").classList.toggle("on", !!state.marked[state.index]);
    $("btnPrev").disabled = state.index === 0;
    $("btnNext").textContent = state.index === state.quiz.length - 1 ? "Review" : "Next";
    paintNav();
    typesetMath(document.getElementById("screenExam") || document.body);
  }

  function selectOption(val) {
    state.answers[state.index] = val;
    renderQuestion();
  }

  /* ── Finish & results ── */
  function finishExam(auto) {
    // Submitted = trial stays consumed (no refund)
    state.trialConsumedThisSession = false;
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
    var usedSec = Math.round((Date.now() - state.startedAt) / 1000);
    if (usedSec > state.durationSec) usedSec = state.durationSec;

    var correct = 0;
    var wrong = 0;
    var skipped = 0;
    var byTopic = {};
    var review = [];

    state.quiz.forEach(function (q, i) {
      var ua = state.answers[i];
      var ok = ua != null && ua !== "" && String(ua) === String(q.answer);
      if (ua == null || ua === "") skipped++;
      else if (ok) correct++;
      else wrong++;
      var t = q.topic || "General";
      if (!byTopic[t]) byTopic[t] = { correct: 0, total: 0 };
      byTopic[t].total++;
      if (ok) byTopic[t].correct++;
      review.push({
        q: q.q,
        topic: t,
        user: ua,
        correct: q.answer,
        ok: ok,
        explanation: q.explanation || "",
        options: q.options
      });
    });

    var total = state.quiz.length;
    var pct = total ? Math.round((correct / total) * 100) : 0;
    state.result = {
      code: state.code,
      title: state.title,
      mode: state.mode,
      topic: state.topic,
      score: correct,
      total: total,
      wrong: wrong,
      skipped: skipped,
      percentage: pct,
      duration: usedSec,
      byTopic: byTopic,
      review: review,
      timestamp: Date.now(),
      date: new Date().toISOString().slice(0, 10)
    };

    saveResult(state.result);
    showResults();
  }

  async function saveResult(result) {
    if (!state.user) return;
    var uid = state.user.uid;
    var entry = {
      code: result.code,
      subject: result.code,
      title: result.title || result.code,
      score: result.score,
      totalQuestions: result.total,
      percentage: result.percentage,
      duration: result.duration,
      mode: result.mode,
      topic: result.topic || "",
      date: result.date,
      timestamp: result.timestamp
    };
    try {
      var ref = db.collection("stats").doc(uid);
      var snap = await ref.get();
      if (snap.exists) {
        await ref.update({ history: firebase.firestore.FieldValue.arrayUnion(entry) });
      } else {
        await ref.set({ history: [entry] });
      }
    } catch (e) {
      console.warn("stats", e);
    }

    try {
      await db.collection("quiz_attempts").add({
        uid: uid,
        code: result.code,
        subject: result.code,
        title: result.title || result.code,
        score: result.score,
        total: result.total,
        totalQuestions: result.total,
        percentage: result.percentage,
        duration: result.duration,
        mode: result.mode || "exam",
        topic: result.topic || "",
        plan: (state.profile && (state.profile.plan || state.profile.subscription)) || state.plan || "free",
        email: (state.user && state.user.email) || (state.profile && state.profile.email) || "",
        fullName: (state.profile && (state.profile.fullName || state.profile.displayName)) || "",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        finishedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) {
      console.warn("quiz_attempts", e);
    }

    try {
      var name = (state.profile && (state.profile.fullName || state.profile.displayName || state.profile.username || state.profile.userName)) ||
        (state.user && (state.user.displayName || (state.user.email && state.user.email.split("@")[0]))) ||
        "Student";
      var photo = (state.profile && (state.profile.photoURL || state.profile.avatarUrl || state.profile.photo)) || "";
      var avatarKey = (state.profile && state.profile.avatarKey) || "";
      var level = (state.profile && state.profile.level) || "";
      var dept = (state.profile && state.profile.department) || "";
      var fac = (state.profile && state.profile.faculty) || "";
      var sem = (state.profile && (state.profile.semester || state.profile.selectedSemester)) || "";
      // XP: percentage-weighted + small session bonus
      var xpGain = Math.max(5, Math.round(result.percentage * 0.5) + Math.min(15, result.score));
      // 1) Per-course snapshot (optional analytics)
      await db.collection("leaderboard").doc(result.code + "_" + uid).set({
        uid: uid,
        displayName: name,
        userName: name,
        photoURL: photo,
        avatarKey: avatarKey,
        subject: result.code,
        code: result.code,
        score: result.percentage,
        xp: result.percentage,
        totalQuestions: result.total,
        percentage: result.percentage,
        duration: result.duration,
        level: level,
        department: dept,
        faculty: fac,
        semester: sem,
        date: result.date,
        timestamp: result.timestamp,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      // 2) User aggregate rank row (what the board ranks)
      var userRef = db.collection("leaderboard").doc(uid);
      var prev = await userRef.get();
      var prevXp = 0;
      var prevSessions = 0;
      if (prev.exists) {
        var pd = prev.data() || {};
        prevXp = Number(pd.score || pd.xp || 0) || 0;
        prevSessions = Number(pd.sessions || 0) || 0;
      }
      var newXp = prevXp + xpGain;
      await userRef.set({
        uid: uid,
        displayName: name,
        userName: name,
        photoURL: photo,
        avatarKey: avatarKey,
        score: newXp,
        xp: newXp,
        sessions: prevSessions + 1,
        lastCode: result.code,
        lastPercentage: result.percentage,
        level: level,
        department: dept,
        faculty: fac,
        semester: sem,
        date: result.date,
        timestamp: result.timestamp,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.warn("leaderboard", e);
    }
    // weak course signal on user
    try {
      if (result.percentage < 60) {
        await db.collection("users").doc(uid).set({
          weakCourses: firebase.firestore.FieldValue.arrayUnion(result.code),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
    } catch (e) {}
  }

  function fmtTime(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + "m " + (s < 10 ? "0" : "") + s + "s";
  }

  function showResults() {
    var r = state.result;
    $("screenExam").classList.add("hidden");
    $("screenSetup").classList.add("hidden");
    $("screenResults").classList.remove("hidden");
    $("timerPill").classList.add("hidden");
    $("btnCalc").classList.add("hidden");
    $("calc").classList.remove("open");
    $("topTitle").textContent = "Results";
    $("topSub").textContent = r.code;

    $("resPct").textContent = r.percentage + "%";
    $("resLabel").textContent =
      r.percentage >= 80 ? "Strong performance" :
      r.percentage >= 50 ? "Keep practising" : "Needs more work";
    $("resCourseLine").textContent =
      r.code + " · " + r.score + "/" + r.total + " · " + (r.mode === "topic" ? r.topic : "Exam");

    var name = (state.profile && (state.profile.fullName || state.profile.displayName)) || "Student";
    $("resName").textContent = name;
    var av = $("resAv");
    var photo = state.profile && (state.profile.photoURL || state.profile.avatarUrl);
    if (photo) av.innerHTML = '<img src="' + esc(photo) + '" alt="" />';
    else av.textContent = (name[0] || "?").toUpperCase();

    // pie
    var total = r.total || 1;
    var cPct = (r.score / total) * 100;
    var wPct = (r.wrong / total) * 100;
    var sPct = (r.skipped / total) * 100;
    $("pieChart").style.background =
      "conic-gradient(#10B981 0 " + cPct + "%, #EF4444 " + cPct + "% " + (cPct + wPct) + "%, #CBD5E1 " + (cPct + wPct) + "% 100%)";
    $("pieLegend").innerHTML =
      '<div><span style="background:#10B981"></span>Correct ' + r.score + "</div>" +
      '<div><span style="background:#EF4444"></span>Wrong ' + r.wrong + "</div>" +
      '<div><span style="background:#CBD5E1"></span>Skipped ' + r.skipped + "</div>";

    // topic bars
    var bars = $("topicBars");
    var topics = Object.keys(r.byTopic || {});
    if (!topics.length) bars.innerHTML = '<span style="color:#64748B">No topic data</span>';
    else {
      bars.innerHTML = topics.map(function (t) {
        var o = r.byTopic[t];
        var p = o.total ? Math.round((o.correct / o.total) * 100) : 0;
        return (
          '<div style="margin-bottom:10px">' +
          '<div style="display:flex;justify-content:space-between;font-weight:700;margin-bottom:4px">' +
          '<span>' + esc(t.length > 28 ? t.slice(0, 28) + "…" : t) + '</span><span>' + p + '%</span></div>' +
          '<div style="height:8px;background:#E2E8F0;border-radius:6px;overflow:hidden">' +
          '<div style="height:100%;width:' + p + '%;background:#2563EB;border-radius:6px"></div></div></div>'
        );
      }).join("");
    }

    $("stCorrect").textContent = r.score;
    $("stWrong").textContent = r.wrong;
    $("stTime").textContent = fmtTime(r.duration);
    $("stSpeed").textContent = r.total ? Math.round(r.duration / r.total) + "s" : "—";

    $("reviewList").innerHTML = r.review.map(function (item, i) {
      var userAns = item.user == null || item.user === "" ? "—" : item.user;
      return (
        '<div class="rev-item ' + (item.ok ? "ok" : "bad") + '">' +
        '<div class="rq">Q' + (i + 1) + ". " + formatMathHtml(item.q) + "</div>" +
        '<div class="ra">Your answer: <b>' + formatMathHtml(userAns) +
        "</b><br/>Correct: <b>" + formatMathHtml(item.correct) + "</b></div>" +
        (item.explanation
          ? '<div class="exp">' + formatMathHtml(item.explanation) + "</div>"
          : "") +
        "</div>"
      );
    }).join("");
    // MathJax after review HTML is in the DOM
    try { typesetMath($("screenResults")); } catch (eT2) {}
  }

  /* ── Share result card ── */
  function shareResult() {
    var r = state.result;
    if (!r) return;
    var canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 500;
    var ctx = canvas.getContext("2d");
    var g = ctx.createLinearGradient(0, 0, 900, 500);
    g.addColorStop(0, "#0F172A");
    g.addColorStop(0.5, "#1E3A8A");
    g.addColorStop(1, "#5B21B6");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 900, 500);
    ctx.fillStyle = "#fff";
    ctx.font = "700 28px system-ui,sans-serif";
    ctx.fillText("Codex Hub · CBT Result", 48, 64);
    ctx.font = "800 96px system-ui,sans-serif";
    ctx.fillText(r.percentage + "%", 48, 180);
    ctx.font = "600 24px system-ui,sans-serif";
    ctx.fillText(r.code + "  ·  " + r.score + " / " + r.total + " correct", 48, 230);
    var name = (state.profile && (state.profile.fullName || state.profile.displayName)) || "Student";
    ctx.font = "600 20px system-ui,sans-serif";
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.fillText(name + "  ·  " + r.date, 48, 280);
    ctx.fillText("Time " + fmtTime(r.duration), 48, 320);
    ctx.font = "600 16px system-ui,sans-serif";
    ctx.fillText("Practice smarter on Codex Hub", 48, 450);

    canvas.toBlob(function (blob) {
      if (!blob) return;
      var file = new File([blob], "codex-cbt-" + r.code + ".png", { type: "image/png" });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({
          files: [file],
          title: "My CBT result",
          text: r.code + " — " + r.percentage + "% on Codex Hub"
        }).catch(function () { downloadBlob(blob, file.name); });
      } else {
        downloadBlob(blob, file.name);
        toast("Result image downloaded");
      }
    }, "image/png");
  }

  function downloadBlob(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  function askNova() {
    var r = state.result;
    if (!r) return;
    var lines = [
      "I just finished a CBT on " + r.code + " (" + r.percentage + "% — " + r.score + "/" + r.total + ").",
      "Please explain the questions I got wrong in detail, and how to think about the correct answers.",
      ""
    ];
    r.review.forEach(function (item, i) {
      if (item.ok) return;
      lines.push("Q" + (i + 1) + ": " + item.q);
      lines.push("Options: " + (item.options || []).join(" | "));
      lines.push("My answer: " + (item.user || "—"));
      lines.push("Correct: " + item.correct);
      lines.push("");
    });
    try {
      sessionStorage.setItem("novaPrefill", lines.join("\n"));
      sessionStorage.setItem("nova_prefill", lines.join("\n"));
    } catch (e) {}
    location.href = "nova.html";
  }

  /* ── Calculator ── */
  function initCalc() {
    var keys = ["7","8","9","/","4","5","6","*","1","2","3","-","0",".","=","+","C","⌫"];
    var box = $("calcKeys");
    box.innerHTML = keys.map(function (k) {
      var cls = "op";
      if (k === "=") cls = "eq";
      if (k === "0") cls = "span2";
      if (k === "C" || k === "⌫") cls = "";
      return '<button type="button" data-k="' + k + '" class="' + cls + '">' + k + "</button>";
    }).join("");
    var expr = "";
    var disp = $("calcDisp");
    box.onclick = function (e) {
      var b = e.target.closest("[data-k]");
      if (!b) return;
      var k = b.getAttribute("data-k");
      if (k === "C") { expr = ""; disp.textContent = "0"; return; }
      if (k === "⌫") { expr = expr.slice(0, -1); disp.textContent = expr || "0"; return; }
      if (k === "=") {
        try {
          // eslint-disable-next-line no-new-func
          var v = Function('"use strict"; return (' + expr + ")")();
          disp.textContent = String(v);
          expr = String(v);
        } catch (err) {
          disp.textContent = "Error";
          expr = "";
        }
        return;
      }
      expr += k;
      disp.textContent = expr;
    };

    // drag
    var calc = $("calc");
    var drag = $("calcDrag");
    var ox = 0, oy = 0, dragging = false;
    function pos(e) {
      var t = e.touches ? e.touches[0] : e;
      return { x: t.clientX, y: t.clientY };
    }
    drag.addEventListener("mousedown", function (e) {
      dragging = true;
      var p = pos(e);
      var rect = calc.getBoundingClientRect();
      ox = p.x - rect.left; oy = p.y - rect.top;
      e.preventDefault();
    });
    drag.addEventListener("touchstart", function (e) {
      dragging = true;
      var p = pos(e);
      var rect = calc.getBoundingClientRect();
      ox = p.x - rect.left; oy = p.y - rect.top;
    }, { passive: true });
    function move(e) {
      if (!dragging) return;
      var p = pos(e);
      calc.style.left = Math.max(0, p.x - ox) + "px";
      calc.style.top = Math.max(0, p.y - oy) + "px";
      calc.style.right = "auto";
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("mouseup", function () { dragging = false; });
    window.addEventListener("touchend", function () { dragging = false; });

    $("btnCalc").onclick = function () {
      calc.classList.toggle("open");
    };
    $("calcClose").onclick = function () {
      calc.classList.remove("open");
    };
  }

  /* ── Bind ── */
  function bind() {
    $("btnBack").onclick = function () {
      if (!$("screenExam").classList.contains("hidden")) {
        $("submitModalText").textContent = "Leave this exam? Progress will be lost. (If you answered few questions, your free session may be restored.)";
        $("submitModal").classList.add("open");
        $("submitYes").onclick = function () {
          $("submitModal").classList.remove("open");
          if (state.timerId) clearInterval(state.timerId);
          maybeRefundTrial().then(function () {
            location.href = "course-library.html?mode=cbt";
          });
        };
        return;
      }
      location.href = "course-library.html?mode=cbt";
    };
    $("btnBackLib").onclick = function () {
      location.href = "course-library.html?mode=cbt";
    };
    $("modeExam").onclick = function () { setMode("exam"); };
    $("modeTopic").onclick = function () { setMode("topic"); };
    $("topicSelect").onchange = function () {
      state.topic = this.value;
      refreshCountChips();
    };
    $("countChips").onclick = function (e) {
      var b = e.target.closest("[data-count]");
      if (!b) return;
      state.count = Number(b.getAttribute("data-count"));
      refreshCountChips();
    };
    $("timeChips").onclick = function (e) {
      var b = e.target.closest("[data-mins]");
      if (!b) return;
      state.minutes = Number(b.getAttribute("data-mins"));
      refreshTimeChips();
    };
    $("btnStart").onclick = startExam;

    $("optsList").onclick = function (e) {
      var li = e.target.closest("[data-opt]");
      if (!li) return;
      selectOption(li.getAttribute("data-opt"));
    };
    $("btnPrev").onclick = function () {
      if (state.index > 0) { state.index--; renderQuestion(); }
    };
    $("btnNext").onclick = function () {
      if (state.index < state.quiz.length - 1) {
        state.index++;
        renderQuestion();
      } else {
        openSubmitModal();
      }
    };
    $("btnMark").onclick = function () {
      state.marked[state.index] = !state.marked[state.index];
      renderQuestion();
    };
    function openSubmitModal() {
      var unanswered = state.answers.filter(function (a) { return a == null || a === ""; }).length;
      $("submitModalText").textContent = unanswered
        ? "You have " + unanswered + " unanswered question" + (unanswered > 1 ? "s" : "") + ". Submit anyway?"
        : "Submit your answers and see results?";
      $("submitModal").classList.add("open");
      $("submitYes").onclick = function () {
        $("submitModal").classList.remove("open");
        finishExam(false);
      };
    }
    $("btnSubmitSide").onclick = openSubmitModal;
    $("btnSubmitMob").onclick = openSubmitModal;
    $("submitNo").onclick = function () {
      $("submitModal").classList.remove("open");
    };

    $("trialClose").onclick = function () {
      $("trialModal").classList.remove("open");
    };
    $("trialUpgrade").onclick = function () {
      location.href = "pricing.html";
    };

    $("btnShare").onclick = shareResult;
    $("btnRetry").onclick = function () {
      showSetup();
    };
    $("btnAskNova").onclick = askNova;

    initCalc();
  }

  auth.onAuthStateChanged(async function (user) {
    if (!user) {
      location.href = "../login.html";
      return;
    }
    state.user = user;
    state.code = (param("code") || "").toUpperCase();
    if (!state.code) {
      location.href = "course-library.html?mode=cbt";
      return;
    }
    bind();
    await loadTrialState();
    showSetup();
  });
})();
