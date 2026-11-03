/* Codex Hub PWA install controls.
 * Works on Chromium browsers with beforeinstallprompt and gives platform-
 * appropriate manual instructions on iOS / browsers without the install API.
 *
 * Install detection is intentionally conservative:
 * - "Installed" is shown when running in standalone display mode or after
 *   appinstalled fires in this page session.
 * - Browsers do not expose a reliable cross-platform API to detect whether a
 *   user installed the PWA but is currently browsing the website, or later
 *   deleted it. In that case we show "Install app" rather than guessing.
 */
(function (w, d) {
  "use strict";
  if (w.__codexPwaInstallBooted) return;
  w.__codexPwaInstallBooted = true;

  var deferredPrompt = null;
  var installedThisSession = false;
  var standaloneQuery = w.matchMedia ? w.matchMedia("(display-mode: standalone)") : null;

  function isStandalone() {
    return !!((standaloneQuery && standaloneQuery.matches) || w.navigator.standalone === true);
  }

  function isIos() {
    return /iphone|ipad|ipod/i.test(w.navigator.userAgent || "") ||
      (w.navigator.platform === "MacIntel" && w.navigator.maxTouchPoints > 1);
  }

  function isSafari() {
    var ua = w.navigator.userAgent || "";
    return /safari/i.test(ua) && !/(crios|fxios|edgios|opios|chrome|android)/i.test(ua);
  }

  function buttons() {
    return Array.prototype.slice.call(d.querySelectorAll(".btn-install-app"));
  }

  function paintInstalled() {
    buttons().forEach(function (btn) {
      btn.hidden = false;
      btn.style.display = "";
      btn.textContent = "✓ Installed";
      btn.disabled = true;
      btn.classList.add("is-installed");
      btn.setAttribute("aria-label", "Codex Hub is installed on this device");
      btn.title = "Codex Hub is installed";
    });
  }

  function paintInstall() {
    buttons().forEach(function (btn) {
      btn.hidden = false;
      btn.style.display = "";
      btn.textContent = "↓ Install app";
      btn.disabled = false;
      btn.classList.remove("is-installed");
      btn.setAttribute("aria-label", "Install Codex Hub on this device");
      btn.removeAttribute("title");
    });
  }

  function refreshState() {
    if (isStandalone() || installedThisSession) paintInstalled();
    else paintInstall();
  }

  if ("serviceWorker" in navigator) {
    w.addEventListener("load", function () {
      navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(function (err) {
        console.warn("Codex Hub service worker registration:", err);
      });
    });
  }

  w.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    deferredPrompt = event;
    refreshState();
  });

  w.addEventListener("appinstalled", function () {
    installedThisSession = true;
    deferredPrompt = null;
    paintInstalled();
  });

  async function handleInstallClick() {
    if (isStandalone() || installedThisSession) {
      paintInstalled();
      return;
    }

    if (deferredPrompt) {
      var promptEvent = deferredPrompt;
      deferredPrompt = null;
      try {
        await promptEvent.prompt();
        var choice = await promptEvent.userChoice;
        if (choice && choice.outcome === "accepted") {
          // appinstalled will normally follow; don't claim success prematurely.
          buttons().forEach(function (btn) { btn.textContent = "Installing…"; });
        } else {
          paintInstall();
        }
      } catch (error) {
        console.warn("PWA install prompt failed:", error);
        paintInstall();
        showManualInstructions();
      }
      return;
    }

    showManualInstructions();
  }

  function showManualInstructions() {
    if (isIos()) {
      if (!isSafari()) {
        w.alert("To install Codex Hub on iPhone or iPad, open this page in Safari, tap Share, then choose “Add to Home Screen”.");
      } else {
        w.alert("To install Codex Hub: tap the Share icon in Safari, scroll down, choose “Add to Home Screen”, then tap “Add”.");
      }
      return;
    }

    var ua = w.navigator.userAgent || "";
    if (/android/i.test(ua)) {
      w.alert("To install Codex Hub, open your browser menu (⋮) and choose “Install app” or “Add to Home screen”. If the option is missing, try Chrome and make sure you are online.");
      return;
    }

    w.alert("To install Codex Hub, use your browser’s Install app option or Add to Home Screen option. The wording depends on your browser.");
  }

  function wireButtons() {
    buttons().forEach(function (btn) {
      if (btn.__codexPwaWired) return;
      btn.__codexPwaWired = true;
      btn.addEventListener("click", handleInstallClick);
    });
    refreshState();
  }

  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", wireButtons);
  else wireButtons();

  if (standaloneQuery && standaloneQuery.addEventListener) {
    standaloneQuery.addEventListener("change", refreshState);
  } else if (standaloneQuery && standaloneQuery.addListener) {
    standaloneQuery.addListener(refreshState);
  }

  // iOS has no beforeinstallprompt event, so the install control remains visible.
  // The same is true for Chromium when the prompt is temporarily unavailable:
  // the control still provides manual installation guidance.
})(window, document);
