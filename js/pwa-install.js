/* Codex Hub — PWA install helper.
 * Registers the service worker once per visit and reveals any
 * #btnInstallApp button on the current page only when the browser has
 * actually signaled the app is installable (beforeinstallprompt). On iOS
 * Safari, which never fires that event, we instead show a short "Add to
 * Home Screen" instruction the first time, since the only install path
 * there is the native Share sheet — nothing this script can trigger.
 */
(function (w, d) {
  "use strict";
  if (w.__codexPwaInstallBooted) return;
  w.__codexPwaInstallBooted = true;

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      // Relative to this script's own page (index.html, at the site root),
      // so this keeps working whether the site is hosted at a domain root
      // or a subpath (e.g. a GitHub Pages project page).
      navigator.serviceWorker.register("service-worker.js", { scope: "./" }).catch(function () {});
    });
  }

  var deferredPrompt = null;
  var isStandalone = w.matchMedia && w.matchMedia("(display-mode: standalone)").matches ||
    w.navigator.standalone === true;

  function showButtons() {
    d.querySelectorAll("#btnInstallApp, .btn-install-app").forEach(function (btn) {
      btn.hidden = false;
      btn.style.display = "";
    });
  }
  function hideButtons() {
    d.querySelectorAll("#btnInstallApp, .btn-install-app").forEach(function (btn) {
      btn.hidden = true;
      btn.style.display = "none";
    });
  }

  if (isStandalone) {
    // Already installed and running from the home screen — nothing to offer.
    d.addEventListener("DOMContentLoaded", hideButtons);
  } else {
    w.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferredPrompt = e;
      showButtons();
    });
    w.addEventListener("appinstalled", function () {
      deferredPrompt = null;
      hideButtons();
    });
  }

  function isIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent || "") && !w.MSStream;
  }

  function wireClick() {
    d.querySelectorAll("#btnInstallApp, .btn-install-app").forEach(function (btn) {
      if (btn.__codexWired) return;
      btn.__codexWired = true;
      btn.addEventListener("click", async function () {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          try { await deferredPrompt.userChoice; } catch (e) {}
          deferredPrompt = null;
          hideButtons();
          return;
        }
        if (isIos()) {
          alert("To install: tap the Share icon in Safari, then \u201cAdd to Home Screen\u201d.");
          return;
        }
        alert("Your browser doesn't support one-tap install here yet — you can still open Codex Hub from your browser bookmarks.");
      });
    });
  }

  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", wireClick);
  else wireClick();

  // Buttons start hidden (except iOS, where we can't detect install-readiness
  // via an event, so we offer the Share-sheet instructions proactively).
  d.addEventListener("DOMContentLoaded", function () {
    if (!isStandalone && isIos()) showButtons();
  });
})(window, document);
