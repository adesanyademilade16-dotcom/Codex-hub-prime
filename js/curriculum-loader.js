/**
 * curriculum-loader.js
 * Reads CURRICULUM_DATA (from curriculum-data.js = lightweight cards) and filters
 * by student profile. Topic lists live in curriculum-topics.js and load on demand.
 *
 * Load order:
 *   <script src="curriculum-data.js"></script>
 *   <script src="curriculum-loader.js"></script>
 * Topics are fetched only when open/search needs them.
 */
const CurriculumLoader = (function () {
  var topicsPromise = null;
  var topicsLoaded = false;

  function topicsSrc() {
    try {
      var scripts = document.getElementsByTagName("script");
      for (var i = 0; i < scripts.length; i++) {
        var s = scripts[i].src || "";
        if (/curriculum-data\.js/i.test(s)) {
          return s.replace(/curriculum-data\.js.*/i, "curriculum-topics.js");
        }
      }
    } catch (e) {}
    return "/js/curriculum-topics.js";
  }

  function ensureTopics() {
    if (topicsLoaded && typeof CURRICULUM_TOPICS !== "undefined") {
      return Promise.resolve(CURRICULUM_TOPICS);
    }
    if (topicsPromise) return topicsPromise;
    topicsPromise = new Promise(function (resolve) {
      if (typeof CURRICULUM_TOPICS !== "undefined") {
        topicsLoaded = true;
        mergeTopics(CURRICULUM_TOPICS);
        resolve(CURRICULUM_TOPICS);
        return;
      }
      var el = document.createElement("script");
      el.src = topicsSrc();
      el.async = true;
      el.onload = function () {
        topicsLoaded = true;
        try {
          if (typeof CURRICULUM_TOPICS !== "undefined") mergeTopics(CURRICULUM_TOPICS);
        } catch (e) {}
        resolve(typeof CURRICULUM_TOPICS !== "undefined" ? CURRICULUM_TOPICS : {});
      };
      el.onerror = function () {
        el.src = "../js/curriculum-topics.js";
        el.onerror = function () {
          resolve({});
        };
        document.head.appendChild(el.cloneNode(true));
      };
      document.head.appendChild(el);
    });
    return topicsPromise;
  }

  function mergeTopics(map) {
    if (!map || typeof CURRICULUM_DATA === "undefined") return;
    Object.keys(map).forEach(function (code) {
      if (CURRICULUM_DATA[code]) {
        CURRICULUM_DATA[code].topics = map[code] || [];
      }
    });
  }

  function allCourses() {
    return Object.values(CURRICULUM_DATA || {});
  }

  function normKey(s) {
    return String(s || "")
      .toLowerCase()
      .trim()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
  }

  function matchesFaculty(course, userFaculty) {
    if (!userFaculty) return true;
    const uf = normKey(userFaculty);
    const list = course.faculty || [];
    return list.some(function (f) {
      const k = normKey(f);
      return k === "all" || k === uf;
    });
  }

  function matchesDept(course, userDept) {
    if (!userDept) return true;
    const ud = normKey(userDept);
    const list = course.dept || [];
    return list.some(function (d) {
      const k = normKey(d);
      return k === "all" || k === ud || k.indexOf(ud) !== -1 || ud.indexOf(k) !== -1;
    });
  }

  function getCourses(profile) {
    const level = String(profile.level || "100");
    let semester = String(profile.semester || "1").toLowerCase();
    if (semester.indexOf("2") === 0 || semester === "2nd") semester = "2";
    else semester = "1";
    const faculty = profile.faculty || "";
    const department = profile.department || "";

    return allCourses().filter(
      (c) =>
        String(c.level) === level &&
        String(c.semester) === semester &&
        matchesFaculty(c, faculty) &&
        matchesDept(c, department)
    );
  }

  function getCourseByCode(code) {
    return (CURRICULUM_DATA && CURRICULUM_DATA[code]) || null;
  }

  async function getCourseWithTopics(code) {
    await ensureTopics();
    return getCourseByCode(code);
  }

  function searchCourses(query) {
    const q = (query || "").toLowerCase().trim();
    if (!q) return [];
    return allCourses().filter((c) => {
      if (c.code.toLowerCase().includes(q)) return true;
      if ((c.title || "").toLowerCase().includes(q)) return true;
      if ((c.topics || []).some((t) => String(t).toLowerCase().includes(q))) return true;
      return false;
    });
  }

  async function searchCoursesAsync(query) {
    await ensureTopics();
    return searchCourses(query);
  }

  async function loadOutline(code) {
    const course = getCourseByCode(code);
    if (!course || !course.outlineFile) return null;
    try {
      const res = await fetch(course.outlineFile);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  function hasContent(code) {
    const course = getCourseByCode(code);
    return !!(course && course.hasContent);
  }

  function getStats(profile) {
    const list = profile ? getCourses(profile) : allCourses();
    const ready = list.filter((c) => c.hasContent).length;
    const totalUnits = list.reduce((sum, c) => sum + (c.units || 0), 0);
    return {
      total: list.length,
      ready,
      comingSoon: list.length - ready,
      totalUnits
    };
  }

  function getByLevel(level) {
    const lv = String(level || "");
    if (!lv || lv === "all") return allCourses();
    return allCourses().filter((c) => String(c.level) === lv);
  }

  function getReadyCourses() {
    return allCourses().filter((c) => c.hasContent);
  }

  function catalogSlice(opts) {
    opts = opts || {};
    let list = allCourses();
    if (opts.level && opts.level !== "all") {
      list = list.filter((c) => String(c.level) === String(opts.level));
    }
    if (opts.semester && opts.semester !== "all") {
      const sem = String(opts.semester);
      list = list.filter(
        (c) =>
          String(c.semester) === sem ||
          String(c.semester) === (sem === "1st" ? "1" : sem === "2nd" ? "2" : sem)
      );
    }
    if (opts.readyOnly) list = list.filter((c) => c.hasContent);
    if (opts.comingSoonOnly) list = list.filter((c) => !c.hasContent);
    if (opts.q) {
      const q = opts.q.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.code.toLowerCase().includes(q) ||
          (c.title || "").toLowerCase().includes(q) ||
          (c.topics || []).some((t) => String(t).toLowerCase().includes(q))
      );
    }
    list = list.slice().sort((a, b) => {
      if (!!b.hasContent !== !!a.hasContent) return a.hasContent ? -1 : 1;
      return String(a.code).localeCompare(String(b.code));
    });
    const offset = opts.offset || 0;
    const limit = opts.limit || 60;
    return { total: list.length, items: list.slice(offset, offset + limit) };
  }

  return {
    getCourses,
    getCourseByCode,
    getCourseWithTopics,
    searchCourses,
    searchCoursesAsync,
    ensureTopics,
    loadOutline,
    hasContent,
    getStats,
    allCourses,
    getByLevel,
    getReadyCourses,
    catalogSlice
  };
})();
