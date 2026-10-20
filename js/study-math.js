/* Study Lab dynamic maths, queued so pagination and tabs cannot race MathJax. */
(function () {
  var queue = Promise.resolve(), timer;
  window.MathJax = {
    tex: { inlineMath: [["$", "$"], ["\\(", "\\)"]], displayMath: [["$$", "$$"], ["\\[", "\\]"]] },
    svg: { fontCache: "global" },
    startup: { typeset: false }
  };
  var script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js";
  script.defer = true;
  function paint() {
    if (!window.MathJax || !MathJax.typesetPromise) return;
    queue = queue.then(function () {
      var scopes = Array.from(document.querySelectorAll(".panel.on"));
      if (!scopes.length) return;
      MathJax.typesetClear(scopes);
      return MathJax.typesetPromise(scopes);
    }).catch(function () {});
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(paint, 80); }
  script.onload = function () {
    MathJax.startup.promise.then(schedule).catch(function () {});
  };
  window.CodexStudyMathSchedule = schedule;
  document.head.appendChild(script);
})();
