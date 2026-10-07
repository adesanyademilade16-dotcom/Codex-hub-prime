(function (w, d) {
  "use strict";
  if (sessionStorage.getItem("codex_splash_done")) return;
  var reduce = w.matchMedia && w.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var el = d.createElement("div");
  el.id = "codex-splash";
  el.setAttribute("role", "presentation");
  el.innerHTML = '<div class="cx-splash-inner"><div class="cx-splash-logo">CX</div><div class="cx-splash-name">Codex Hub</div><div class="cx-splash-sub">Study smarter</div></div>';
  var st = d.createElement("style");
  st.textContent = "#codex-splash{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#1e1b4b 0%,#4f46e5 45%,#7c3aed 100%);color:#fff;transition:opacity .45s ease}" +
    "#codex-splash.hide{opacity:0;pointer-events:none}" +
    ".cx-splash-inner{text-align:center}" +
    ".cx-splash-logo{width:72px;height:72px;margin:0 auto 14px;border-radius:20px;background:rgba(255,255,255,.15);display:grid;place-items:center;font-weight:900;font-size:1.5rem;backdrop-filter:blur(8px)}" +
    ".cx-splash-name{font-weight:800;font-size:1.45rem;letter-spacing:-.02em}" +
    ".cx-splash-sub{opacity:.85;margin-top:6px;font-size:.9rem}";
  d.head.appendChild(st);
  function mount() {
    d.body.appendChild(el);
    var t = reduce ? 200 : 1100;
    setTimeout(function () {
      el.classList.add("hide");
      sessionStorage.setItem("codex_splash_done", "1");
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 500);
    }, t);
  }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", mount);
  else mount();
})(window, document);
