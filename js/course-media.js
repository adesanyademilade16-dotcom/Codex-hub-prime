/**
 * Codex Hub — course media map (YouTube playlists / lecture links)
 * Static defaults for known OOU GST/GES playlists.
 * Admin dashboard can override via Firestore course_media/{CODE}:
 *   { playlistUrl, playlistId, title, videos: [{ title, videoId, topic? }] }
 */
(function (global) {
  "use strict";

  var STATIC = {
    GST111: {
      title: "GST111 · Use of English / Communication",
      playlistId: "PLsG8KxGSGT6JxHRidwWXQUPWDXGuAPScC",
      playlistUrl: "https://www.youtube.com/playlist?list=PLsG8KxGSGT6JxHRidwWXQUPWDXGuAPScC"
    },
    GST112: {
      title: "GST112 · Nigerian People and Culture",
      playlistId: "PLsG8KxGSGT6IFRwLxO-yMFg0w8MJakNxZ",
      playlistUrl: "https://www.youtube.com/playlist?list=PLsG8KxGSGT6IFRwLxO-yMFg0w8MJakNxZ"
    },
    GES151: {
      title: "GES151 · Modern Agriculture and Rural Development",
      playlistId: "PLsG8KxGSGT6IWv5TMhqg2Tk9_tLfjY_45",
      playlistUrl: "https://www.youtube.com/playlist?list=PLsG8KxGSGT6IWv5TMhqg2Tk9_tLfjY_45"
    },
    "OOU-GES151": {
      title: "OOU-GES 151 · Modern Agriculture",
      playlistId: "PLsG8KxGSGT6IWv5TMhqg2Tk9_tLfjY_45",
      playlistUrl: "https://www.youtube.com/playlist?list=PLsG8KxGSGT6IWv5TMhqg2Tk9_tLfjY_45"
    },
    "GES 151": {
      title: "GES 151 · Modern Agriculture",
      playlistId: "PLsG8KxGSGT6IWv5TMhqg2Tk9_tLfjY_45",
      playlistUrl: "https://www.youtube.com/playlist?list=PLsG8KxGSGT6IWv5TMhqg2Tk9_tLfjY_45"
    }
  };

  function norm(code) {
    return String(code || "").trim().toUpperCase().replace(/\s+/g, "");
  }

  /**
   * Resolve media for a course code. Prefers Firestore course_media/{code}
   * when db is provided; falls back to STATIC map.
   */
  async function resolveCourseMedia(code, db) {
    var key = norm(code);
    var aliases = [key, String(code || "").trim()];
    var fromStatic = null;
    aliases.forEach(function (a) {
      if (!fromStatic && STATIC[a]) fromStatic = STATIC[a];
      var n = norm(a);
      Object.keys(STATIC).forEach(function (k) {
        if (!fromStatic && norm(k) === n) fromStatic = STATIC[k];
      });
    });

    if (db) {
      try {
        var snap = await db.collection("course_media").doc(String(code).trim()).get();
        if (!snap.exists) {
          snap = await db.collection("course_media").doc(key).get();
        }
        if (snap.exists) {
          var d = snap.data() || {};
          return {
            title: d.title || (fromStatic && fromStatic.title) || code,
            playlistId: d.playlistId || (fromStatic && fromStatic.playlistId) || "",
            playlistUrl: d.playlistUrl || (fromStatic && fromStatic.playlistUrl) || "",
            videos: Array.isArray(d.videos) ? d.videos : [],
            source: "firestore"
          };
        }
      } catch (e) {
        console.warn("[course-media] firestore", e);
      }
    }

    if (fromStatic) {
      return {
        title: fromStatic.title,
        playlistId: fromStatic.playlistId,
        playlistUrl: fromStatic.playlistUrl,
        videos: [],
        source: "static"
      };
    }
    return null;
  }

  function playlistWatchUrl(media) {
    if (!media) return "";
    if (media.playlistUrl) return media.playlistUrl;
    if (media.playlistId) {
      return "https://www.youtube.com/playlist?list=" + encodeURIComponent(media.playlistId);
    }
    return "";
  }

  function videoWatchUrl(videoId) {
    if (!videoId) return "";
    return "https://www.youtube.com/watch?v=" + encodeURIComponent(videoId);
  }

  global.CodexCourseMedia = {
    STATIC: STATIC,
    resolve: resolveCourseMedia,
    playlistUrl: playlistWatchUrl,
    videoUrl: videoWatchUrl,
    norm: norm
  };
})(typeof window !== "undefined" ? window : this);
