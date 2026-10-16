/* Apply theme before shell paints — include as first script in <head> */
(function () {
  try {
    if (localStorage.getItem("codex_dark") === "1") {
      document.documentElement.classList.add("theme-dark");
    }
    if (localStorage.getItem("codex_reduce_motion") === "1") {
      document.documentElement.classList.add("reduce-motion");
    }
  } catch (e) {}
})();

/* Clean URLs: show /home, /chats, /nova … instead of /app/home.html.
 * Server (vercel.json) already rewrites/redirects; this just avoids the extra
 * redirect hop on every tap so navigation stays instant. */
(function () {
  try {
    var ALIAS = { leaderboard: "leaderboard", "course-library": "course-library" };
    function clean(href) {
      if (!href) return null;
      var u;
      try { u = new URL(href, location.href); } catch (e) { return null; }
      if (u.origin !== location.origin) return null;
      var m = u.pathname.match(/^\/(?:app\/)?([A-Za-z0-9_-]+)\.html$/);
      if (!m) return null;
      if (/^\/(admin|guides)\//.test(u.pathname)) return null;
      var name = m[1];
      if (name === "index") return "/" + u.search + u.hash;
      return "/" + (ALIAS[name] || name) + u.search + u.hash;
    }
    // Tidy the address bar if we arrived through an old link
    var now = clean(location.href);
    if (now && history.replaceState) history.replaceState(history.state, "", now);
    // Intercept taps on .html links
    document.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      var a = e.target && e.target.closest && e.target.closest("a[href]");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      var c = clean(a.getAttribute("href"));
      if (c) a.setAttribute("href", c);
    }, true);
    window.CodexCleanUrl = clean;
  } catch (e) {}
})();
