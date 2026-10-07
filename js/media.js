(function (w) {
  "use strict";
  var CLOUD_NAME = "dngom9ylf";
  var UPLOAD_PRESET = "codex_pdf";
  var FOLDER_AVATARS = "codex_hub/avatars";
  var FOLDER_DOCS = "codex_hub/study_lab";

  function avatarAsset(id) {
    /* Resolve from /assets regardless of whether page is /app/*.html or nested */
    try {
      var base = (document.querySelector('script[src*="media.js"]') || {}).src || "";
      if (base) {
        var u = new URL("../assets/avatars/" + id + ".png", base);
        return u.href;
      }
    } catch (e) {}
    return "../assets/avatars/" + id + ".png";
  }
  var PORTRAIT = {};
  for (var i = 1; i <= 18; i++) {
    var id = "char" + (i < 10 ? "0" + i : "" + i);
    PORTRAIT[id] = avatarAsset(id);
  }
  PORTRAIT.a1 = PORTRAIT.char01;
  PORTRAIT.a2 = PORTRAIT.char07;
  PORTRAIT.a3 = PORTRAIT.char09;
  PORTRAIT.a4 = PORTRAIT.char13;

  function isImageFile(file) {
    if (!file) return false;
    if (file.type && file.type.indexOf("image/") === 0) return true;
    return /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(file.name || "");
  }

  /**
   * Upload file to Cloudinary.
   * Images → image/upload
   * PDF / Word / PPT / TXT → raw/upload (docx/pptx are ZIP-based; image endpoint rejects them)
   */
  function uploadToCloudinary(file, opts) {
    opts = opts || {};
    var image = isImageFile(file);
    var video = !!(file && file.type && file.type.indexOf("video/") === 0);
    var endpoint = image ? "image/upload" : (video ? "video/upload" : "raw/upload");
    var folder = opts.folder || (image ? FOLDER_AVATARS : FOLDER_DOCS);
    var fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", UPLOAD_PRESET);
    fd.append("folder", folder);
    // Help Cloudinary keep original filename for docs
    if (!image && !video && file.name) {
      try {
        var base = String(file.name).replace(/\.[^.]+$/, "").replace(/[^\w\-]+/g, "_").slice(0, 60);
        if (base) fd.append("public_id", base + "_" + Date.now());
      } catch (e) {}
    }
    return fetch("https://api.cloudinary.com/v1_1/" + CLOUD_NAME + "/" + endpoint, {
      method: "POST",
      body: fd
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) {
          var msg = (data.error && data.error.message) ? data.error.message : "Upload failed";
          // Friendlier message for common cases
          if (/zip|format|invalid/i.test(msg)) {
            msg = "Could not upload this file type. Use PDF, Word (.docx), PowerPoint (.pptx), or TXT. (" + msg + ")";
          }
          throw new Error(msg);
        }
        return { url: data.secure_url, publicId: data.public_id, resourceType: data.resource_type };
      });
    });
  }

  function portraitSrc(key) {
    if (!key) return "";
    if (PORTRAIT[key]) return PORTRAIT[key];
    // fallback paths for different page depths
    return avatarAsset(key);
  }

  function resolveAvatar(profile, initials) {
    profile = profile || {};
    var ini = String(initials || "ST").slice(0, 2);
    var fallback = '<span class="avatar-ini">' + ini + "</span>";
    var url = profile.photoURL || profile.avatarUrl || profile.photo || profile.avatar || "";
    if (url && (String(url).indexOf("http") === 0 || String(url).indexOf("data:") === 0)) {
      return '<img class="avatar-img" alt="" src="' + String(url).replace(/"/g, "&quot;") + '" onerror="this.onerror=null;this.outerHTML=\'' + fallback.replace(/'/g, "") + '\'">';
    }
    var key = profile.avatarKey || profile.characterKey || profile.portraitId || "";
    if (key) {
      key = String(key).replace(/[^a-zA-Z0-9_]/g, "");
      var src = portraitSrc(key);
      return '<img class="avatar-img" alt="" src="' + src + '" onerror="this.onerror=null;this.style.display=\'none\';this.parentNode.innerHTML=\'' + fallback.replace(/'/g, "") + '\'">';
    }
    if (profile.novaCharacter && w.NovaCharacters && NovaCharacters.getById) {
      var ch = NovaCharacters.getById(profile.novaCharacter);
      if (ch && ch.svg) return ch.svg;
    }
    return fallback;
  }

  w.CodexMedia = {
    uploadToCloudinary: uploadToCloudinary,
    resolveAvatar: resolveAvatar,
    isImageFile: isImageFile,
    PORTRAIT: PORTRAIT
  };
})(window);
