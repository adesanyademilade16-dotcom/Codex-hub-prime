/* Codex Hub — generic "scroll to results" helper for the AI study tools.
   Students were tapping Generate/Solve/Run and, because the result renders
   below the fold, assumed nothing happened and kept tapping. This listens
   (via delegation, so it works no matter when each tool's own script attaches
   its own click handler) for a known set of action-button ids across every
   tool page and smooth-scrolls to that button's result container shortly
   after the click — once while the loading state shows, and once again when
   the result actually finishes rendering (so the user lands on the content,
   not just the spinner). It never touches a page's own onclick/run logic. */
(function (w, d) {
  "use strict";

  // buttonId -> explicit result container id. Anything not listed here falls
  // back to the nearest .workspace / .canvas-box / #out / #output after it.
  var TARGETS = {
    btnRun: "notes",
    btnImprove: "notes",
    btnRunCode: "runPanel",
    btnSolve: "out",
    btnExplain: "out",
    btnAlt: "out",
    btnGen: "canvas",
    btnRegen: "canvas",
    btnUnderstand: "understand",
    btnStructure: "structure",
    btnReview: "review",
    genCards: "cardsBox",
    genQuiz: "quizBox"
  };

  // Buttons that only copy/download/share an existing result — never scroll for these.
  var IGNORE = /^(btnCopy|btnDl|btnPdf|btnPng|btnPrint|btnOpen|btnAdd|btnSaveRecent|btnCam|btnImg)/i;

  function findTarget(btn) {
    var id = btn.id || "";
    if (TARGETS[id]) {
      var byId = d.getElementById(TARGETS[id]);
      if (byId) return byId;
    }
    // Derive from id (e.g. btnUnderstand -> #understand) as a second guess.
    var derived = id.replace(/^btn/, "");
    if (derived) {
      derived = derived.charAt(0).toLowerCase() + derived.slice(1);
      var byDerived = d.getElementById(derived);
      if (byDerived) return byDerived;
    }
    // Generic fallback: nearest known result container after this button in the DOM.
    var all = d.querySelectorAll(".workspace, .canvas-box, #out, #output, #result");
    for (var i = 0; i < all.length; i++) {
      if (btn.compareDocumentPosition(all[i]) & Node.DOCUMENT_POSITION_FOLLOWING) return all[i];
    }
    return null;
  }

  function scrollTo(el) {
    if (!el || !el.scrollIntoView) return;
    try { el.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {}
  }

  function onClick(e) {
    var btn = e.target && e.target.closest ? e.target.closest("button[id]") : null;
    if (!btn || !btn.id) return;
    if (IGNORE.test(btn.id)) return;
    var isKnown = TARGETS.hasOwnProperty(btn.id) || /^btn(Gen|Run|Solve|Explain|Alt|Understand|Structure|Review)/.test(btn.id) || /^gen/i.test(btn.id);
    if (!isKnown) return;
    var target = findTarget(btn);
    if (!target) return;
    // First hop: land on the loading state right away so the user sees work has started.
    setTimeout(function () { scrollTo(target); }, 180);
    // Second hop: once content has actually streamed/rendered in, settle on it again.
    setTimeout(function () { scrollTo(target); }, 1400);
  }

  d.addEventListener("click", onClick, true);
})(window, document);
