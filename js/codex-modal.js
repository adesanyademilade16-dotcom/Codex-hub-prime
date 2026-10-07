/**
 * Codex Hub — branded confirm / alert modals (Pulse-aware)
 */
(function (w) {
  "use strict";
  if (w.CodexModal) return;

  function injectCss() {
    if (document.getElementById("codex-modal-css")) return;
    var s = document.createElement("style");
    s.id = "codex-modal-css";
    s.textContent = [
      "#codexModalRoot{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;",
      "padding:16px;background:rgba(15,23,42,.55);backdrop-filter:blur(6px);font-family:\"Plus Jakarta Sans\",system-ui,sans-serif}",
      "#codexModalRoot .card{width:min(360px,100%);background:#fff;border-radius:20px;overflow:hidden;",
      "box-shadow:0 24px 60px rgba(15,23,42,.28);animation:cmIn .22s ease}",
      "@keyframes cmIn{from{transform:scale(.94);opacity:0}to{transform:none;opacity:1}}",
      "#codexModalRoot .head{display:flex;gap:12px;align-items:center;padding:18px 18px 0}",
      "#codexModalRoot .pulse{width:48px;height:48px;border-radius:14px;flex-shrink:0;",
      "background:linear-gradient(145deg,#EEF2FF,#E0E7FF);display:grid;place-items:center;overflow:hidden}",
      "#codexModalRoot .pulse img{width:40px;height:40px;object-fit:contain}",
      "#codexModalRoot .pulse .emoji{font-size:1.4rem}",
      "#codexModalRoot h3{margin:0;font-size:1.05rem;font-weight:800;color:#0F172A;letter-spacing:-.02em}",
      "#codexModalRoot .body{padding:10px 18px 6px;font-size:.9rem;line-height:1.5;color:#475569}",
      "#codexModalRoot .foot{display:flex;gap:8px;justify-content:flex-end;padding:12px 16px 16px}",
      "#codexModalRoot button{min-height:42px;padding:0 16px;border-radius:12px;border:0;font-weight:800;font-size:.86rem;cursor:pointer;font-family:inherit}",
      "#codexModalRoot .cancel{background:#F1F5F9;color:#334155}",
      "#codexModalRoot .ok{background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#fff}",
      "#codexModalRoot .ok.danger{background:linear-gradient(135deg,#DC2626,#B91C1C)}"
    ].join("");
    document.head.appendChild(s);
  }

  function pulseHtml() {
    var src = "../assets/img/nova.png";
    return '<div class="pulse"><img src="' + src + '" alt="" onerror="this.parentNode.innerHTML=\'<span class=emoji>🤖</span>\'"></div>';
  }

  function open(opts) {
    opts = opts || {};
    injectCss();
    var prev = document.getElementById("codexModalRoot");
    if (prev) prev.remove();
    var root = document.createElement("div");
    root.id = "codexModalRoot";
    root.setAttribute("role", "dialog");
    root.innerHTML =
      '<div class="card">' +
      '<div class="head">' + pulseHtml() + "<div><h3>" + (opts.title || "Codex Hub") + "</h3></div></div>" +
      '<div class="body">' + (opts.message || "") + "</div>" +
      '<div class="foot">' +
      (opts.showCancel !== false ? '<button type="button" class="cancel" data-a="cancel">' + (opts.cancelText || "Cancel") + "</button>" : "") +
      '<button type="button" class="ok' + (opts.danger ? " danger" : "") + '" data-a="ok">' + (opts.okText || "OK") + "</button>" +
      "</div></div>";
    document.body.appendChild(root);
    return new Promise(function (resolve) {
      function done(v) {
        root.remove();
        resolve(v);
      }
      root.addEventListener("click", function (e) {
        var a = e.target.getAttribute && e.target.getAttribute("data-a");
        if (a === "ok") done(true);
        if (a === "cancel") done(false);
        if (e.target === root && opts.dismissBackdrop) done(false);
      });
    });
  }

  function confirm(message, title) {
    return open({
      title: title || "Just checking",
      message: message,
      okText: "OK",
      cancelText: "Cancel",
      showCancel: true
    });
  }

  function alert(message, title) {
    return open({
      title: title || "Codex Hub",
      message: message,
      okText: "Got it",
      showCancel: false
    });
  }

  w.CodexModal = { open: open, confirm: confirm, alert: alert };
})(window);
