/**
 * Codex Study Resources — core data helpers (Firestore + Cloudinary + PDF.js preview).
 * Isolated module. Does not modify CBT / Notes / Chat.
 */
(function (w) {
  "use strict";

  var CATEGORIES = [
    "Lecture Notes",
    "Course Materials",
    "Past Questions",
    "Revision Guides",
    "Assignments",
    "Handouts",
    "Recommended Reading",
    "Study Guides",
    "Other"
  ];

  var ALLOWED_EXT = { pdf: true, doc: true, docx: true };
  var MAX_BYTES = 25 * 1024 * 1024; // 25 MB

  /** Safe init so admin pages work even without app-auth.js */
  function ensureFirebase() {
    if (!w.firebase) throw new Error("Firebase SDK not loaded");
    if (!w.firebase.apps || !w.firebase.apps.length) {
      if (!w.FIREBASE_CONFIG) throw new Error("FIREBASE_CONFIG missing");
      w.firebase.initializeApp(w.FIREBASE_CONFIG);
    }
  }

  function db() {
    ensureFirebase();
    return firebase.firestore();
  }
  function uid() {
    ensureFirebase();
    var u = firebase.auth().currentUser;
    return u ? u.uid : null;
  }
  function isAdminEmail(email) {
    return String(email || "").toLowerCase() === "codexhub16@gmail.com";
  }
  function ts() {
    return firebase.firestore.FieldValue.serverTimestamp();
  }

  function sanitizeTitle(s) {
    return String(s || "").trim().slice(0, 160);
  }

  function fileExt(name) {
    var m = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : "";
  }

  function formatBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  /** Load PDF.js from CDN once */
  var pdfjsReady = null;
  function ensurePdfJs() {
    if (pdfjsReady) return pdfjsReady;
    pdfjsReady = new Promise(function (resolve, reject) {
      if (w.pdfjsLib) {
        resolve(w.pdfjsLib);
        return;
      }
      var s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      s.onload = function () {
        if (!w.pdfjsLib) {
          reject(new Error("PDF.js failed to load"));
          return;
        }
        w.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        resolve(w.pdfjsLib);
      };
      s.onerror = function () { reject(new Error("Could not load PDF.js")); };
      document.head.appendChild(s);
    });
    return pdfjsReady;
  }

  /**
   * Render PDF page 1 to a JPEG blob for thumbnail.
   * Returns { blob, pageCount } or null on failure.
   */
  async function renderPdfThumbnail(fileOrUrl, opts) {
    opts = opts || {};
    var scale = opts.scale || 1.15;
    var lib = await ensurePdfJs();
    var data;
    if (typeof fileOrUrl === "string") {
      data = { url: fileOrUrl };
    } else {
      var buf = await fileOrUrl.arrayBuffer();
      data = { data: buf };
    }
    var pdf = await lib.getDocument(data).promise;
    var pageCount = pdf.numPages || 1;
    var page = await pdf.getPage(1);
    var viewport = page.getViewport({ scale: scale });
    var canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    var ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    var blob = await new Promise(function (res) {
      canvas.toBlob(function (b) { res(b); }, "image/jpeg", 0.82);
    });
    return { blob: blob, pageCount: pageCount };
  }

  async function uploadThumbnailBlob(blob, folder) {
    if (!w.CodexMedia || !CodexMedia.uploadToCloudinary) throw new Error("Media helper missing");
    var file = new File([blob], "preview_" + Date.now() + ".jpg", { type: "image/jpeg" });
    return CodexMedia.uploadToCloudinary(file, { folder: folder || "codex_resources/thumbs" });
  }

  async function uploadResourceFile(file) {
    if (!w.CodexMedia || !CodexMedia.uploadToCloudinary) throw new Error("Media helper missing");
    var ext = fileExt(file.name);
    if (!ALLOWED_EXT[ext]) throw new Error("Only PDF, DOC, and DOCX are allowed");
    if (file.size > MAX_BYTES) throw new Error("File must be under 25 MB");
    return CodexMedia.uploadToCloudinary(file, { folder: "codex_resources/files" });
  }

  async function getUserCredits(userId) {
    var id = userId || uid();
    if (!id) return 0;
    var snap = await db().collection("users").doc(id).get();
    if (!snap.exists) return 0;
    var n = Number((snap.data() || {}).downloadCredits);
    return isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  /**
   * Student-safe credit decrement: only decrease by 1.
   * Rules must enforce this; UI still guards.
   * Retries once on failed-precondition (concurrent taps).
   */
  async function consumeDownloadCredit() {
    var me = uid();
    if (!me) throw new Error("Sign in required");
    var ref = db().collection("users").doc(me);
    var attempts = 0;
    while (attempts < 3) {
      attempts++;
      try {
        await db().runTransaction(async function (tx) {
          var snap = await tx.get(ref);
          var data = snap.exists ? (snap.data() || {}) : {};
          var credits = Number(data.downloadCredits);
          if (!isFinite(credits) || credits < 1) {
            throw new Error("INSUFFICIENT_CREDITS");
          }
          // Only touch downloadCredits + updatedAt (rules-enforced)
          tx.update(ref, {
            downloadCredits: credits - 1,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        });
        return;
      } catch (e) {
        if (e && e.message === "INSUFFICIENT_CREDITS") throw e;
        var code = (e && e.code) || "";
        var msg = String((e && e.message) || e || "");
        if (attempts < 3 && (/failed-precondition/i.test(code) || /failed-precondition/i.test(msg))) {
          await new Promise(function (r) { setTimeout(r, 120 * attempts); });
          continue;
        }
        throw e;
      }
    }
  }

  /** Admin-only grant (+3) — also used after approve in admin UI */
  async function grantCredits(userId, amount) {
    amount = Math.max(0, Math.floor(Number(amount) || 0));
    if (!userId || !amount) return;
    var ref = db().collection("users").doc(userId);
    await db().runTransaction(async function (tx) {
      var snap = await tx.get(ref);
      var data = snap.exists ? (snap.data() || {}) : {};
      var credits = Number(data.downloadCredits) || 0;
      tx.set(ref, {
        downloadCredits: credits + amount,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });
  }


  /** Map old pdfs/{id} docs into the unified resource card shape */
  function normalizeLegacyPdf(id, d) {
    d = d || {};
    var url = d.url || d.fileUrl || "";
    var ft = guessFileType(url, d.fileType);
    var thumb = "";
    if (ft === "pdf" && !isGoogleDriveUrl(url)) {
      thumb = d.thumbnailUrl || cloudinaryPdfThumb(url) || "";
    }
    return {
      id: id,
      source: "legacy",
      legacyCollection: "pdfs",
      title: d.title || "Untitled",
      description: d.description || ("Legacy resource · " + (d.subject || d.category || "")),
      courseCode: String(d.courseCode || d.subject || "").toUpperCase().slice(0, 24),
      courseTitle: d.courseTitle || d.subject || "",
      category: d.category || "Other",
      level: String(d.level || ""),
      semester: d.semester || "",
      faculty: d.faculty || "",
      department: d.department || "",
      fileType: ft,
      mimeType: d.mimeType || "",
      fileSize: Number(d.fileSize) || 0,
      pageCount: Number(d.pageCount) || 0,
      fileUrl: url,
      thumbnailUrl: thumb,
      previewStatus: thumb ? "ready" : "failed",
      uploadedBy: d.uploadedBy || null,
      uploaderName: d.uploader || d.uploaderName || "Student",
      uploadedAt: d.createdAt || d.uploadedAt || null,
      status: d.status === "hidden" || d.status === "rejected" ? d.status : "approved",
      visibility: d.visibility === "private" ? "private" : "public",
      verified: d.verified === true,
      accessTier: d.accessTier === "pro" || d.accessTier === "regular" ? d.accessTier : (d.accessTier || "free"),
      featured: !!d.featured,
      views: Number(d.views) || 0,
      likes: Number(d.likes) || 0,
      downloads: Number(d.downloads) || 0,
      validation: { overall: "pass", legacy: true },
      creditsAwarded: 0
    };
  }

  function isGoogleDriveUrl(url) {
    return /docs\.google\.com|drive\.google\.com/i.test(String(url || ""));
  }

  function canPreviewOnline(res) {
    if (!res || !res.fileUrl) return false;
    if (isGoogleDriveUrl(res.fileUrl)) return false;
    var ft = String(res.fileType || guessFileType(res.fileUrl, "")).toLowerCase();
    return ft === "pdf";
  }

  function guessFileType(url, explicit) {
    if (explicit) return String(explicit).toLowerCase();
    var u = String(url || "").toLowerCase();
    if (isGoogleDriveUrl(u)) {
      if (/document/.test(u)) return "gdoc";
      if (/spreadsheet/.test(u)) return "gsheet";
      if (/presentation/.test(u)) return "gslides";
      return "gdrive";
    }
    if (/\.docx($|\?)/.test(u)) return "docx";
    if (/\.doc($|\?)/.test(u)) return "doc";
    if (/\.pptx?($|\?)/.test(u)) return "ppt";
    if (/\.pdf($|\?)/.test(u)) return "pdf";
    return "pdf";
  }

  /** Cloudinary raw PDF → first-page JPG transform (same idea as old pdf_resources) */
  function cloudinaryPdfThumb(url) {
    if (!url || String(url).indexOf("cloudinary.com") < 0) return "";
    // Never invent a PDF page thumb for Word/Google links
    var ft = guessFileType(url, "");
    if (ft !== "pdf") return "";
    try {
      var u = String(url);
      if (u.indexOf("/raw/upload/") >= 0) {
        return u.replace("/raw/upload/", "/image/upload/f_jpg,pg_1,w_480,q_auto,c_limit/");
      }
      if (u.indexOf("/upload/") >= 0) {
        return u.replace(/\/upload\/(?:v\d+\/)?/, "/upload/f_jpg,pg_1,w_480,q_auto,c_limit/");
      }
    } catch (e) {}
    return "";
  }

  function resourceRef(id) {
    return db().collection("resources").doc(id);
  }

  async function createPendingResource(meta, fileInfo, validation) {
    var me = uid();
    if (!me) throw new Error("Sign in required");
    var user = firebase.auth().currentUser;
    var doc = {
      title: sanitizeTitle(meta.title),
      description: String(meta.description || "").trim().slice(0, 2000),
      courseCode: String(meta.courseCode || "").toUpperCase().trim().slice(0, 24),
      courseTitle: String(meta.courseTitle || "").trim().slice(0, 120),
      category: CATEGORIES.indexOf(meta.category) >= 0 ? meta.category : "Other",
      level: String(meta.level || "").trim().slice(0, 16),
      semester: String(meta.semester || "").trim().slice(0, 16),
      faculty: String(meta.faculty || "").trim().slice(0, 80),
      department: String(meta.department || "").trim().slice(0, 80),

      fileType: fileInfo.fileType || "pdf",
      mimeType: fileInfo.mimeType || "",
      fileSize: Number(fileInfo.fileSize) || 0,
      pageCount: Number(fileInfo.pageCount) || 0,
      fileUrl: fileInfo.fileUrl || "",
      filePublicId: fileInfo.publicId || "",
      thumbnailUrl: fileInfo.thumbnailUrl || "",
      previewStatus: fileInfo.thumbnailUrl ? "ready" : (fileInfo.previewStatus || "failed"),

      uploadedBy: me,
      uploaderName: (user && (user.displayName || user.email)) || "Student",
      uploadedAt: ts(),

      status: "pending",
      visibility: "private",
      verified: false,
      accessTier: "free",
      featured: false,
      source: "student",

      views: 0,
      likes: 0,
      downloads: 0,

      validation: validation || { overall: "pass" },
      creditsAwarded: 0,
      reviewMessage: "",
      moderatedAt: null,
      moderatedBy: null
    };
    var ref = await db().collection("resources").add(doc);
    return ref.id;
  }

  async function createAdminResource(meta, fileInfo) {
    var me = uid();
    var user = firebase.auth().currentUser;
    if (!user || !isAdminEmail(user.email)) throw new Error("Admin only");
    var doc = {
      title: sanitizeTitle(meta.title),
      description: String(meta.description || "").trim().slice(0, 2000),
      courseCode: String(meta.courseCode || "").toUpperCase().trim().slice(0, 24),
      courseTitle: String(meta.courseTitle || "").trim().slice(0, 120),
      category: CATEGORIES.indexOf(meta.category) >= 0 ? meta.category : "Other",
      level: String(meta.level || "").trim().slice(0, 16),
      semester: String(meta.semester || "").trim().slice(0, 16),
      faculty: String(meta.faculty || "").trim().slice(0, 80),
      department: String(meta.department || "").trim().slice(0, 80),
      fileType: fileInfo.fileType || "pdf",
      mimeType: fileInfo.mimeType || "",
      fileSize: Number(fileInfo.fileSize) || 0,
      pageCount: Number(fileInfo.pageCount) || 0,
      fileUrl: fileInfo.fileUrl || "",
      filePublicId: fileInfo.publicId || "",
      thumbnailUrl: fileInfo.thumbnailUrl || "",
      previewStatus: fileInfo.thumbnailUrl ? "ready" : "failed",
      uploadedBy: me,
      uploaderName: "Codex Admin",
      uploadedAt: ts(),
      status: "approved",
      visibility: "public",
      verified: !!meta.verified,
      accessTier: meta.accessTier === "pro" || meta.accessTier === "regular" ? meta.accessTier : "free",
      featured: !!meta.featured,
      source: "admin",
      views: 0,
      likes: 0,
      downloads: 0,
      validation: { overall: "pass", adminUpload: true },
      creditsAwarded: 0,
      reviewMessage: "",
      moderatedAt: ts(),
      moderatedBy: me
    };
    var ref = await db().collection("resources").add(doc);
    return ref.id;
  }

  /**
   * List approved public resources with optional filters.
   * Pagination via startAfter snapshot.
   */
  async function listResources(opts) {
    opts = opts || {};
    var limit = Math.min(Number(opts.limit) || 24, 48);
    var items = [];
    var lastDoc = null;
    var hasMore = false;

    // 1) New moderated resources (index-safe fallbacks)
    try {
      var snap;
      try {
        // Preferred: composite index status+visibility+uploadedAt
        var q = db().collection("resources")
          .where("status", "==", "approved")
          .where("visibility", "==", "public")
          .orderBy("uploadedAt", "desc")
          .limit(limit);
        if (opts.startAfter) q = q.startAfter(opts.startAfter);
        snap = await q.get();
      } catch (idxErr) {
        // No composite index yet — single-field query, filter client-side
        console.warn("resources composite index missing, using fallback", idxErr && idxErr.message);
        snap = await db().collection("resources")
          .where("status", "==", "approved")
          .limit(Math.min(limit * 3, 80))
          .get();
      }
      items = snap.docs.map(function (d) {
        var x = d.data() || {};
        x.id = d.id;
        x.source = x.source || "student";
        return x;
      }).filter(function (x) {
        if (x.visibility && x.visibility !== "public") return false;
        if (opts.courseCode && String(x.courseCode || "").toUpperCase() !== String(opts.courseCode).toUpperCase()) return false;
        if (opts.category && x.category !== opts.category) return false;
        if (opts.level && String(x.level) !== String(opts.level)) return false;
        return true;
      });
      lastDoc = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
      hasMore = snap.docs.length >= limit;
    } catch (eNew) {
      console.warn("resources list", eNew);
    }

    // 2) Legacy pdfs collection (former Codex Hub) — always include on first page
    if (!opts.startAfter) {
      try {
        var legSnap = await db().collection("pdfs").orderBy("createdAt", "desc").limit(80).get();
        legSnap.docs.forEach(function (d) {
          var row = normalizeLegacyPdf(d.id, d.data());
          if (row.status !== "approved" || row.visibility !== "public") return;
          if (opts.courseCode) {
            var code = String(opts.courseCode).toUpperCase();
            var hay = (row.courseCode + " " + row.courseTitle + " " + (d.data().subject || "")).toUpperCase();
            if (hay.indexOf(code) < 0) return;
          }
          if (opts.category && row.category !== opts.category) return;
          if (opts.level && String(row.level) !== String(opts.level)) return;
          items.push(row);
        });
      } catch (eLeg) {
        console.warn("legacy pdfs list", eLeg);
      }
    }

    // Dedupe by id
    var seen = {};
    items = items.filter(function (r) {
      if (seen[r.id]) return false;
      seen[r.id] = true;
      return true;
    });

    if (opts.q) {
      var needle = String(opts.q).toLowerCase();
      items = items.filter(function (r) {
        return [r.title, r.courseCode, r.courseTitle, r.category, r.description, r.uploaderName]
          .join(" ").toLowerCase().indexOf(needle) >= 0;
      });
    }
    if (opts.sort === "views") items.sort(function (a, b) { return (b.views || 0) - (a.views || 0); });
    else if (opts.sort === "likes") items.sort(function (a, b) { return (b.likes || 0) - (a.likes || 0); });
    else if (opts.sort === "downloads") items.sort(function (a, b) { return (b.downloads || 0) - (a.downloads || 0); });
    else {
      // recent: prefer uploadedAt / createdAt millis
      items.sort(function (a, b) {
        function ms(x) {
          var t = x.uploadedAt;
          if (t && t.toMillis) return t.toMillis();
          if (t && t.seconds) return t.seconds * 1000;
          if (t instanceof Date) return t.getTime();
          return 0;
        }
        return ms(b) - ms(a);
      });
    }

    return { items: items, lastDoc: lastDoc, hasMore: hasMore };
  }

  function pickFileUrl(d) {
    if (!d) return "";
    var u = d.fileUrl || d.url || d.link || d.file_url || d.downloadUrl || d.src || "";
    return String(u || "").trim();
  }

  async function getResource(id) {
    if (!id) return null;
    var student = null;
    // New collection first — catch permission-denied when doc is missing
    try {
      var snap = await resourceRef(id).get();
      if (snap.exists) {
        var x = snap.data() || {};
        x.id = snap.id;
        x.source = x.source || "student";
        x.fileUrl = pickFileUrl(x);
        // Only trust student doc if it has a real http(s) link
        if (x.fileUrl && /^https?:\/\//i.test(x.fileUrl)) {
          if (!x.status) x.status = "approved";
          if (!x.visibility) x.visibility = "public";
          return x;
        }
        student = x; // keep — may merge title later
      }
    } catch (eRes) {
      console.warn("resources get", eRes && eRes.message);
    }
    // Legacy Codex Hub uploads in pdfs/ (field is usually `url`)
    try {
      var leg = await db().collection("pdfs").doc(id).get();
      if (leg.exists) {
        var legacy = normalizeLegacyPdf(leg.id, leg.data());
        // Prefer legacy URL if student doc was incomplete
        if (legacy && legacy.fileUrl) return legacy;
      }
    } catch (e) {
      console.warn("legacy pdf read", e);
    }
    // Last resort: return student doc even without URL (caller shows re-upload message)
    if (student) return student;
    return null;
  }

  async function listMyContributions() {
    var me = uid();
    if (!me) return [];
    var snap;
    try {
      snap = await db().collection("resources")
        .where("uploadedBy", "==", me)
        .orderBy("uploadedAt", "desc")
        .limit(50)
        .get();
    } catch (idxErr) {
      // Index missing: uploadedBy + uploadedAt — fall back without orderBy
      console.warn("listMyContributions index fallback", idxErr && idxErr.message);
      snap = await db().collection("resources")
        .where("uploadedBy", "==", me)
        .limit(50)
        .get();
    }
    var rows = snap.docs.map(function (d) {
      var x = d.data() || {};
      x.id = d.id;
      return x;
    });
    rows.sort(function (a, b) {
      function ms(t) {
        if (!t) return 0;
        if (t.toMillis) return t.toMillis();
        if (t.seconds) return t.seconds * 1000;
        return 0;
      }
      return ms(b.uploadedAt) - ms(a.uploadedAt);
    });
    return rows;
  }

  async function listPendingForAdmin() {
    var snap;
    try {
      snap = await db().collection("resources")
        .where("status", "==", "pending")
        .orderBy("uploadedAt", "asc")
        .limit(50)
        .get();
    } catch (idxErr) {
      console.warn("listPending index fallback", idxErr && idxErr.message);
      snap = await db().collection("resources")
        .where("status", "==", "pending")
        .limit(50)
        .get();
    }
    return snap.docs.map(function (d) {
      var x = d.data() || {};
      x.id = d.id;
      return x;
    });
  }

  async function listReportsPending() {
    var snap;
    try {
      snap = await db().collection("resource_reports")
        .where("status", "==", "open")
        .orderBy("createdAt", "desc")
        .limit(40)
        .get();
    } catch (idxErr) {
      console.warn("listReports index fallback", idxErr && idxErr.message);
      snap = await db().collection("resource_reports")
        .where("status", "==", "open")
        .limit(40)
        .get();
    }
    return snap.docs.map(function (d) {
      var x = d.data() || {};
      x.id = d.id;
      return x;
    });
  }

  async function recordView(resourceId) {
    var me = uid();
    if (!me || !resourceId) return;
    var viewId = me + "_" + resourceId;
    var vref = db().collection("resource_views").doc(viewId);
    try {
      var existing = await vref.get();
      if (existing.exists) {
        var last = existing.data().lastAt;
        var lastMs = last && last.toMillis ? last.toMillis() : 0;
        if (Date.now() - lastMs < 6 * 60 * 60 * 1000) return; // 6h de-dupe
      }
      await vref.set({ uid: me, resourceId: resourceId, lastAt: ts() }, { merge: true });
      try {
        await resourceRef(resourceId).update({
          views: firebase.firestore.FieldValue.increment(1)
        });
      } catch (eR) {
        try {
          await db().collection("pdfs").doc(resourceId).update({
            views: firebase.firestore.FieldValue.increment(1)
          });
        } catch (eL) {}
      }
    } catch (e) {
      console.warn("view record", e);
    }
  }

  async function bumpLikes(resourceId, delta) {
    var val = firebase.firestore.FieldValue.increment(delta);
    try {
      await resourceRef(resourceId).update({ likes: val });
      return;
    } catch (e1) {}
    try {
      await db().collection("pdfs").doc(resourceId).update({ likes: val });
    } catch (e2) {}
  }

  async function toggleLike(resourceId) {
    var me = uid();
    if (!me) throw new Error("Sign in required");
    var likeRef = db().collection("resource_likes").doc(resourceId).collection("uids").doc(me);
    var snap = await likeRef.get();
    if (snap.exists) {
      await likeRef.delete();
      await bumpLikes(resourceId, -1);
      return false;
    }
    await likeRef.set({ uid: me, createdAt: ts() });
    await bumpLikes(resourceId, 1);
    return true;
  }

  async function hasLiked(resourceId) {
    var me = uid();
    if (!me) return false;
    var snap = await db().collection("resource_likes").doc(resourceId).collection("uids").doc(me).get();
    return snap.exists;
  }

  async function reportResource(resourceId, reason, note) {
    var me = uid();
    if (!me) throw new Error("Sign in required");
    await db().collection("resource_reports").add({
      resourceId: resourceId,
      reason: String(reason || "Other").slice(0, 80),
      note: String(note || "").slice(0, 500),
      reportedBy: me,
      status: "open",
      createdAt: ts()
    });
  }

  /**
   * Download rules:
   * - Admin (codexhub16@gmail.com) = unlimited, never spends credits
   * - Students = 1 credit only when a real file blob is saved to the device
   * - Opening a tab / broken link does NOT spend credits
   * - View online is free and does not call this
   */
  var _downloadLock = {};

  function currentUserIsAdmin() {
    try {
      var u = firebase.auth().currentUser;
      return !!(u && isAdminEmail(u.email));
    } catch (e) {
      return false;
    }
  }

  function cloudinaryAttachmentUrl(url) {
    var u = String(url || "");
    if (!/cloudinary\.com/i.test(u) || u.indexOf("/upload/") < 0) return u;
    if (/fl_attachment/.test(u)) return u;
    return u.replace("/upload/", "/upload/fl_attachment/");
  }

  function safeDownloadFilename(title, fileType) {
    var base = String(title || "resource").replace(/[^\w\s\-_.]+/g, "").replace(/\s+/g, "_").slice(0, 80) || "resource";
    var ext = String(fileType || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
    if (ext === "gdoc" || ext === "gdrive" || ext === "gsheet" || ext === "gslides") ext = "pdf";
    if (!/\.[a-z0-9]+$/i.test(base)) base += "." + ext;
    return base;
  }

  /** Real device save via blob (requires CORS — works on http://localhost and https) */
  async function forceBlobDownload(url, filename) {
    var candidates = [cloudinaryAttachmentUrl(url)];
    if (candidates[0] !== url) candidates.push(url);
    var lastErr = null;
    for (var i = 0; i < candidates.length; i++) {
      try {
        var r = await fetch(candidates[i], { mode: "cors", credentials: "omit", cache: "no-store" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        var blob = await r.blob();
        if (!blob || blob.size < 64) throw new Error("Empty file");
        var bUrl = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = bUrl;
        a.download = filename || "resource.pdf";
        a.rel = "noopener";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { try { URL.revokeObjectURL(bUrl); } catch (e) {} }, 6000);
        return { ok: true, bytes: blob.size };
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("fetch failed");
  }

  /** Navigate to Cloudinary attachment URL (often starts a download on mobile) */
  function openAttachmentTab(url) {
    var dl = cloudinaryAttachmentUrl(url);
    var a = document.createElement("a");
    a.href = dl;
    a.target = "_blank";
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function downloadResource(resourceId) {
    var me = uid();
    if (!me) throw new Error("Sign in required");
    if (_downloadLock[resourceId]) {
      throw new Error("Download already in progress — wait a moment");
    }
    _downloadLock[resourceId] = true;
    try {
      var res = await getResource(resourceId);
      if (!res || res.status !== "approved" || res.visibility !== "public") {
        throw new Error("Resource not available");
      }
      var fileUrl = String(res.fileUrl || "").trim();
      if (!fileUrl || !/^https?:\/\//i.test(fileUrl)) {
        throw new Error("This file has no valid download link (broken or local path). Ask admin to re-upload.");
      }

      var admin = currentUserIsAdmin();
      if (!admin) {
        var have = 0;
        try {
          have = await getUserCredits(me);
        } catch (eC) {
          have = 0;
        }
        if (have < 1) {
          throw new Error("INSUFFICIENT_CREDITS");
        }
      }

      var filename = safeDownloadFilename(res.title, res.fileType);
      var via = null;
      var bytes = 0;

      if (isGoogleDriveUrl(fileUrl)) {
        // Cannot blob-download Drive links; open only. Free for admin; students still 1 credit (access).
        window.open(fileUrl, "_blank", "noopener");
        via = "gdrive";
        if (!admin) {
          try {
            await consumeDownloadCredit();
          } catch (e) {
            if (e && e.message === "INSUFFICIENT_CREDITS") throw e;
            throw new Error("INSUFFICIENT_CREDITS");
          }
        }
      } else {
        // Prefer real blob save — only then charge students
        try {
          var got = await forceBlobDownload(fileUrl, filename);
          via = "blob";
          bytes = got.bytes || 0;
          if (!admin) {
            try {
              await consumeDownloadCredit();
            } catch (e) {
              if (e && e.message === "INSUFFICIENT_CREDITS") throw e;
              var msg = String((e && e.message) || "");
              if (/permission|insufficient/i.test(msg)) throw new Error("INSUFFICIENT_CREDITS");
              throw new Error(msg || "Download failed");
            }
          }
        } catch (eFetch) {
          console.warn("blob download failed", eFetch);
          // Free open fallback for everyone (especially admin testing) — NO credit charge
          try {
            openAttachmentTab(fileUrl);
          } catch (eOpen) {}
          throw new Error(
            "Could not save the file to your device (network/CORS). " +
            "We opened the link in a new tab instead — long-press / use the browser download if needed. " +
            "No credit was used."
          );
        }
      }

      try {
        if (res.source === "legacy") {
          await db().collection("pdfs").doc(resourceId).update({
            downloads: firebase.firestore.FieldValue.increment(1)
          });
        } else {
          await resourceRef(resourceId).update({
            downloads: firebase.firestore.FieldValue.increment(1)
          });
        }
      } catch (e) {
        console.warn("download counter", e);
      }
      try {
        await db().collection("resource_downloads").add({
          resourceId: resourceId,
          uid: me,
          source: res.source || "resources",
          tier: String(res.accessTier || "free").toLowerCase(),
          via: via,
          bytes: bytes || 0,
          adminFree: admin,
          createdAt: ts()
        });
      } catch (e) {
        console.warn("download log", e);
      }
      return { ok: true, via: via, fileUrl: fileUrl, adminFree: admin, bytes: bytes };
    } finally {
      delete _downloadLock[resourceId];
    }
  }

  /** Admin: permanently remove a resource doc (Firestore). Cloudinary files need dashboard cleanup. */
  async function deleteResourcePermanent(resourceId, source) {
    ensureFirebase();
    var user = firebase.auth().currentUser;
    if (!user || !isAdminEmail(user.email)) throw new Error("Admin only");
    if (!resourceId) throw new Error("Missing id");
    if (source === "legacy") {
      await db().collection("pdfs").doc(resourceId).delete();
    } else {
      try {
        await resourceRef(resourceId).delete();
      } catch (e1) {
        await db().collection("pdfs").doc(resourceId).delete();
      }
    }
    return true;
  }

  /** Polite modal when the student has 0 download credits */
  function showOutOfCreditsModal() {
    var existing = document.getElementById("resCreditModal");
    if (existing) existing.remove();
    var wrap = document.createElement("div");
    wrap.id = "resCreditModal";
    wrap.className = "res-credit-modal-backdrop";
    wrap.innerHTML =
      '<div class="res-credit-modal" role="dialog" aria-modal="true" aria-labelledby="resCreditTitle">' +
      '<button type="button" class="res-credit-close" id="resCreditClose" aria-label="Close">×</button>' +
      '<div class="res-credit-icon" aria-hidden="true">' + ICONS.credit + "</div>" +
      '<h3 id="resCreditTitle">You\'re out of download credits</h3>' +
      "<p>Unfortunately you have no download credits left, so this file can\'t be saved to your device yet.</p>" +
      "<p><strong>Upload one useful educational resource</strong> (lecture notes or past questions). " +
      "When it\'s approved, you earn <strong>+3 download credits</strong>.</p>" +
      "<p class=\"res-credit-hint\">You can still <strong>view PDFs online</strong> for free — download is what uses credits.</p>" +
      '<div class="res-credit-actions">' +
      '<a class="res-btn res-btn-primary" href="resource-upload.html">Upload a resource</a>' +
      '<button type="button" class="res-btn res-btn-ghost" id="resCreditOk">Maybe later</button>' +
      "</div></div>";
    document.body.appendChild(wrap);
    function close() {
      wrap.remove();
    }
    wrap.addEventListener("click", function (e) {
      if (e.target === wrap) close();
    });
    document.getElementById("resCreditClose").onclick = close;
    document.getElementById("resCreditOk").onclick = close;
  }

  /** Admin: set free / regular / pro (and hide) on a legacy pdfs doc without re-upload */
  async function updateLegacyAccess(pdfId, patch) {
    var user = firebase.auth().currentUser;
    if (!user || !isAdminEmail(user.email)) throw new Error("Admin only");
    patch = patch || {};
    var data = {};
    if (patch.accessTier === "free" || patch.accessTier === "regular" || patch.accessTier === "pro") {
      data.accessTier = patch.accessTier;
    }
    if (typeof patch.verified === "boolean") data.verified = patch.verified;
    if (typeof patch.featured === "boolean") data.featured = patch.featured;
    if (patch.status === "hidden" || patch.status === "approved" || patch.status === "rejected") {
      data.status = patch.status;
      data.visibility = patch.status === "approved" ? "public" : "private";
    }
    if (patch.title) data.title = String(patch.title).slice(0, 160);
    data.moderatedAt = ts();
    data.moderatedBy = uid();
    await db().collection("pdfs").doc(pdfId).set(data, { merge: true });
    return true;
  }

  async function listLegacyPdfsForAdmin() {
    ensureFirebase();
    var user = firebase.auth().currentUser;
    if (!user || !isAdminEmail(user.email)) throw new Error("Admin only");
    var snap;
    try {
      snap = await db().collection("pdfs").orderBy("createdAt", "desc").limit(120).get();
    } catch (e1) {
      console.warn("legacy orderBy fallback", e1 && e1.message);
      snap = await db().collection("pdfs").limit(120).get();
    }
    return snap.docs.map(function (d) { return normalizeLegacyPdf(d.id, d.data()); });
  }

  async function moderateResource(resourceId, action, opts) {
    opts = opts || {};
    var me = uid();
    var user = firebase.auth().currentUser;
    if (!user || !isAdminEmail(user.email)) throw new Error("Admin only");
    var res = await getResource(resourceId);
    if (!res) throw new Error("Not found");

    var patch = {
      moderatedAt: ts(),
      moderatedBy: me,
      reviewMessage: String(opts.message || "").slice(0, 500)
    };

    if (action === "approve") {
      patch.status = "approved";
      patch.visibility = "public";
      patch.verified = opts.verified !== false;
      patch.accessTier = opts.accessTier === "pro" || opts.accessTier === "regular" ? opts.accessTier : "free";
      patch.featured = !!opts.featured;
      // Grant +3 only once
      if (!res.creditsAwarded && res.source === "student" && res.uploadedBy) {
        patch.creditsAwarded = 3;
        await grantCredits(res.uploadedBy, 3);
      }
    } else if (action === "reject") {
      patch.status = "rejected";
      patch.visibility = "private";
      patch.verified = false;
    } else if (action === "hide") {
      patch.status = "hidden";
      patch.visibility = "private";
    } else if (action === "correction") {
      patch.status = "correction_required";
      patch.visibility = "private";
    } else if (action === "delete") {
      await resourceRef(resourceId).delete();
      return true;
    } else {
      throw new Error("Unknown action");
    }

    await resourceRef(resourceId).update(patch);
    return true;
  }

  async function relatedResources(res, limit) {
    if (!res) return [];
    limit = limit || 6;
    try {
      var q = db().collection("resources")
        .where("status", "==", "approved")
        .where("visibility", "==", "public")
        .where("courseCode", "==", res.courseCode || "")
        .limit(limit + 2);
      var snap = await q.get();
      return snap.docs
        .map(function (d) { var x = d.data() || {}; x.id = d.id; return x; })
        .filter(function (x) { return x.id !== res.id; })
        .slice(0, limit);
    } catch (e) {
      return [];
    }
  }

  // SVG icons (no emoji)
  var ICONS = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16V4m0 0l-4 4m4-4l4 4"/><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4v12m0 0l-4-4m4 4l4-4"/><path d="M4 18h16"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-4.5-9.5-9A5 5 0 0112 6a5 5 0 019.5 6c-2.5 4.5-9.5 9-9.5 9z"/></svg>',
    verified: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/></svg>',
    flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4v16M4 4h12l-2 4 2 4H4"/></svg>',
    credit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/></svg>',
    empty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 17h4"/></svg>'
  };

  function cardHtml(r) {
    var ft = String(r.fileType || guessFileType(r.fileUrl || "", "") || "pdf").toLowerCase();
    var isPdf = ft === "pdf" && !isGoogleDriveUrl(r.fileUrl || "");
    var rawThumb = r.thumbnailUrl || "";
    if (!rawThumb && isPdf && r.fileUrl) rawThumb = cloudinaryPdfThumb(r.fileUrl) || "";
    var safeThumb = String(rawThumb).replace(/"/g, "");
    var hue = hashStr(r.title || r.id || "x") % 360;
    var rid = encodeURIComponent(r.id || "");
    var idAttr = escapeHtml(r.id || "");
    var typeLabel = ft === "gdoc" || ft === "gdrive" ? "GOOGLE DOC"
      : ft === "gsheet" ? "SHEET"
      : ft === "gslides" ? "SLIDES"
      : String(ft || "FILE").toUpperCase();
    var titleBit = escapeHtml(String(r.title || "Document").slice(0, 48));
    var ph =
      '<div class="res-ph" style="--ph-h:' + hue + '">' +
      '<div class="res-ph-glow"></div>' + ICONS.doc +
      '<span class="res-ph-label">' + escapeHtml(typeLabel) + "</span>" +
      '<span class="res-ph-title-text">' + titleBit + "</span></div>";
    // Only use image thumbs for real PDFs; DOCX / Google links get the title card
    var media = (safeThumb && isPdf)
      ? '<img class="res-thumb" src="' + safeThumb + '" alt="" loading="lazy" onerror="this.style.display=\'none\';var p=this.nextElementSibling;if(p)p.style.display=\'flex\';">' +
        ph.replace('class="res-ph"', 'class="res-ph" style="display:none;--ph-h:' + hue + '"')
      : ph;
    var verified = r.verified
      ? '<span class="res-badge">' + ICONS.verified + " Verified</span>"
      : "";
    var tier = (r.accessTier || "free").toLowerCase();
    var pages = r.pageCount ? ('<span class="res-pages">' + r.pageCount + "</span>") : "";
    var likes = Number(r.likes) || 0;
    var dls = Number(r.downloads) || 0;
    var views = Number(r.views) || 0;
    var uploader = escapeHtml(String(r.uploaderName || r.uploader || "Student").slice(0, 40));
    // Single path: tap card → detail (preview / view online). One Download control.
    // Eye/heart/download numbers = stats only (not a second View button).
    return (
      '<article class="res-card" data-id="' + idAttr + '">' +
      '<a class="res-card-link" href="resource-view.html?id=' + rid + '">' +
      '<div class="res-card-preview">' + media + verified + pages +
      '<span class="res-tier ' + tier + '">' + tier + "</span></div>" +
      '<div class="res-card-body">' +
      '<div class="res-card-title">' + escapeHtml(r.title || "Untitled") + "</div>" +
      '<div class="res-card-meta">' + escapeHtml((r.courseCode || "") + (r.courseTitle ? " · " + r.courseTitle : "")) + "</div>" +
      '<div class="res-card-meta res-card-cat">' + escapeHtml(r.category || "Resource") +
      " · " + String(r.fileType || "pdf").toUpperCase() + "</div>" +
      '<div class="res-card-uploader">' + ICONS.doc + " " + uploader + "</div>" +
      "</div></a>" +
      '<div class="res-card-stats">' +
      '<span class="res-stat" title="Views">' + ICONS.eye + " <em data-stat=\"views\">" + views + "</em></span>" +
      '<button type="button" class="res-stat-btn" data-act="like" data-id="' + idAttr + '" title="Like">' +
        ICONS.heart + " <em data-stat=\"likes\">" + likes + "</em></button>" +
      '<button type="button" class="res-stat-btn res-dl-btn" data-act="dl" data-id="' + idAttr + '" title="Download">' +
        ICONS.download + " <em data-stat=\"downloads\">" + dls + "</em></button>" +
      "</div></article>"
    );
  }

  /** Paint persisted like state on cards (one heart per user, stays after refresh) */
  async function paintLikedCards(root) {
    var me = uid();
    if (!me) return;
    var scope = root || document;
    var btns = scope.querySelectorAll('.res-stat-btn[data-act="like"][data-id]');
    if (!btns.length) return;
    var ids = [];
    btns.forEach(function (b) {
      var id = b.getAttribute("data-id");
      if (id && ids.indexOf(id) < 0) ids.push(id);
    });
    // Limit parallel reads
    var chunk = ids.slice(0, 40);
    await Promise.all(chunk.map(async function (id) {
      try {
        var yes = await hasLiked(id);
        if (!yes) return;
        scope.querySelectorAll('.res-stat-btn[data-act="like"][data-id="' + id.replace(/"/g, "") + '"]').forEach(function (b) {
          b.classList.add("is-liked");
          b.setAttribute("aria-pressed", "true");
        });
      } catch (e) {}
    }));
  }

  /** Event delegation: Like / Download on cards without opening the detail page */
  var _cardActionsBound = false;
  function bindCardActions(root) {
    if (_cardActionsBound) return;
    _cardActionsBound = true;
    var scope = root || document;
    scope.addEventListener("click", function (e) {
      var btn = e.target.closest && e.target.closest("[data-act]");
      if (!btn || (!btn.classList.contains("res-stat-btn") && !btn.classList.contains("res-act-btn"))) return;
      e.preventDefault();
      e.stopPropagation();
      var act = btn.getAttribute("data-act");
      var id = btn.getAttribute("data-id");
      if (!id) return;
      if (act === "like") {
        if (btn.dataset.busy === "1") return;
        btn.dataset.busy = "1";
        // Optimistic UI — react on first tap
        var wasLiked = btn.classList.contains("is-liked");
        var em = btn.querySelector('[data-stat="likes"]');
        var n = em ? (parseInt(em.textContent, 10) || 0) : 0;
        var nextLiked = !wasLiked;
        btn.classList.toggle("is-liked", nextLiked);
        btn.setAttribute("aria-pressed", nextLiked ? "true" : "false");
        if (em) em.textContent = String(Math.max(0, n + (nextLiked ? 1 : -1)));
        toggleLike(id)
          .then(function (nowLiked) {
            if (nowLiked !== nextLiked) {
              btn.classList.toggle("is-liked", !!nowLiked);
              btn.setAttribute("aria-pressed", nowLiked ? "true" : "false");
              if (em) {
                var cur = parseInt(em.textContent, 10) || 0;
                em.textContent = String(Math.max(0, cur + (nowLiked ? 1 : -1) - (nextLiked ? 1 : -1)));
              }
            }
          })
          .catch(function (err) {
            // rollback
            btn.classList.toggle("is-liked", wasLiked);
            btn.setAttribute("aria-pressed", wasLiked ? "true" : "false");
            if (em) em.textContent = String(n);
            alert(err.message || "Could not update like");
          })
          .then(function () { btn.dataset.busy = "0"; });
      } else if (act === "dl") {
        btn.disabled = true;
        downloadResource(id)
          .then(function (result) {
            document.querySelectorAll('[data-id="' + id.replace(/"/g, "") + '"] [data-stat="downloads"]').forEach(function (em) {
              em.textContent = String((parseInt(em.textContent, 10) || 0) + 1);
            });
            if (result && !result.adminFree && (result.via === "blob" || result.via === "gdrive")) {
              try {
                var pill = document.getElementById("creditNum");
                if (pill) {
                  var c = parseInt(pill.textContent, 10);
                  if (!isNaN(c) && c > 0) pill.textContent = String(c - 1);
                }
              } catch (eC) {}
            }
          })
          .catch(function (err) {
            if (err && err.message === "INSUFFICIENT_CREDITS") {
              showOutOfCreditsModal();
            } else {
              alert((err && err.message) || "Download failed");
            }
          })
          .then(function () { btn.disabled = false; });
      }
    }, true);
  }

  function hashStr(s) {
    var h = 0;
    for (var i = 0; i < String(s).length; i++) h = ((h << 5) - h) + String(s).charCodeAt(i) | 0;
    return Math.abs(h);
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  w.CodexResources = {
    CATEGORIES: CATEGORIES,
    ALLOWED_EXT: ALLOWED_EXT,
    MAX_BYTES: MAX_BYTES,
    ICONS: ICONS,
    formatBytes: formatBytes,
    fileExt: fileExt,
    escapeHtml: escapeHtml,
    cardHtml: cardHtml,
    bindCardActions: bindCardActions,
    paintLikedCards: paintLikedCards,
    canPreviewOnline: canPreviewOnline,
    isGoogleDriveUrl: isGoogleDriveUrl,
    isAdminEmail: isAdminEmail,
    ensurePdfJs: ensurePdfJs,
    renderPdfThumbnail: renderPdfThumbnail,
    uploadThumbnailBlob: uploadThumbnailBlob,
    uploadResourceFile: uploadResourceFile,
    getUserCredits: getUserCredits,
    consumeDownloadCredit: consumeDownloadCredit,
    grantCredits: grantCredits,
    createPendingResource: createPendingResource,
    createAdminResource: createAdminResource,
    listResources: listResources,
    getResource: getResource,
    listMyContributions: listMyContributions,
    listPendingForAdmin: listPendingForAdmin,
    listReportsPending: listReportsPending,
    recordView: recordView,
    toggleLike: toggleLike,
    hasLiked: hasLiked,
    reportResource: reportResource,
    downloadResource: downloadResource,
    showOutOfCreditsModal: showOutOfCreditsModal,
    updateLegacyAccess: updateLegacyAccess,
    listLegacyPdfsForAdmin: listLegacyPdfsForAdmin,
    deleteResourcePermanent: deleteResourcePermanent,
    moderateResource: moderateResource,
    relatedResources: relatedResources
  };
})(window);
