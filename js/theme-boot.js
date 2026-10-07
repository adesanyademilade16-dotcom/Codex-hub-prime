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
