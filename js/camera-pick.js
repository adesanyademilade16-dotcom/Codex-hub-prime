/**
 * Codex Hub — reliable camera / gallery picker for mobile + installed PWA.
 * iOS/Android often ignore input.click() when the input is display:none.
 * This keeps a visually-hidden but "real" input and opens it on a direct user gesture.
 */
(function (global) {
  "use strict";

  function ensureInput(opts) {
    opts = opts || {};
    var id = opts.id || ("codexCam_" + (opts.capture ? "cap" : "gal"));
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement("input");
      el.type = "file";
      el.id = id;
      el.accept = opts.accept || "image/*";
      if (opts.capture) el.setAttribute("capture", opts.capture === true ? "environment" : String(opts.capture));
      if (opts.multiple) el.multiple = true;
      el.setAttribute("tabindex", "-1");
      el.setAttribute("aria-hidden", "true");
      // CRITICAL: not display:none — iOS Safari blocks programmatic click otherwise
      el.style.cssText = "position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0.01;overflow:hidden;z-index:0;pointer-events:none;";
      document.body.appendChild(el);
    } else {
      // repair display:none from older markup
      if (el.style.display === "none" || getComputedStyle(el).display === "none") {
        el.style.cssText = "position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0.01;overflow:hidden;z-index:0;pointer-events:none;";
      }
    }
    return el;
  }

  function pick(opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
      try {
        var el = ensureInput({
          id: opts.id,
          capture: opts.camera ? "environment" : false,
          accept: opts.accept || "image/*",
          multiple: !!opts.multiple
        });
        // reset so same file can be chosen again
        el.value = "";
        el.onchange = function () {
          var files = el.files ? Array.prototype.slice.call(el.files) : [];
          el.onchange = null;
          if (!files.length) {
            resolve([]);
            return;
          }
          resolve(files);
        };
        // must run inside the original click stack (user gesture)
        el.click();
      } catch (err) {
        reject(err);
      }
    });
  }

  function pickCamera(onFiles) {
    return pick({ camera: true, id: "codex_cam_input" }).then(function (files) {
      if (typeof onFiles === "function") onFiles(files);
      return files;
    });
  }

  function pickGallery(onFiles, multiple) {
    return pick({ camera: false, multiple: multiple !== false, id: "codex_gal_input" }).then(function (files) {
      if (typeof onFiles === "function") onFiles(files);
      return files;
    });
  }

  global.CodexCamera = { pick: pick, pickCamera: pickCamera, pickGallery: pickGallery, ensureInput: ensureInput };
})(typeof window !== "undefined" ? window : this);
