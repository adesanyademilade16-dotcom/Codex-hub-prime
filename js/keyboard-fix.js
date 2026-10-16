/* Keep chat / Nova headers pinned when the phone keyboard opens.
 * Android Chrome: viewport meta interactive-widget=resizes-content shrinks
 * the layout instead of panning it. iOS / older WebViews: we track the
 * visual viewport height and stop the page from scrolling under the header. */
(function () {
  var root = document.documentElement;
  var vv = window.visualViewport;
  function apply() {
    var h = vv ? vv.height : window.innerHeight;
    root.style.setProperty("--vvh", Math.round(h) + "px");
    // The browser tries to scroll the whole page to reveal the input → undo it.
    if (window.scrollY !== 0) window.scrollTo(0, 0);
    if (vv && vv.offsetTop) window.scrollTo(0, 0);
  }
  apply();
  if (vv) {
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
  }
  window.addEventListener("resize", apply);
  document.addEventListener("focusin", function (e) {
    if (e.target && /^(TEXTAREA|INPUT)$/.test(e.target.tagName)) setTimeout(apply, 60);
  });
})();
