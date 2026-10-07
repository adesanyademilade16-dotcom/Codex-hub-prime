/**
 * curriculum-loader.js
 * Reads CURRICULUM_DATA (from curriculum-data.js) and filters it by a
 * student's profile (level, semester, faculty, department).
 *
 * Load order required in HTML:
 *   <script src="faculty-data.js"></script>
 *   <script src="curriculum-data.js"></script>
 *   <script src="curriculum-loader.js"></script>
 *
 * This replaces every hardcoded SUBJECT_DATA array (subject_selection.html,
 * course_search.html) with ONE shared read of CURRICULUM_DATA. Editing a
 * course now means editing curriculum-data.js once — everywhere that shows
 * courses updates automatically.
 */

const CurriculumLoader = (function () {

  function allCourses() {
    return Object.values(CURRICULUM_DATA);
  }

  function normKey(s) {
    return String(s || '')
      .toLowerCase()
      .trim()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  function matchesFaculty(course, userFaculty) {
    if (!userFaculty) return true;
    const uf = normKey(userFaculty);
    const list = course.faculty || [];
    return list.some(function (f) {
      const k = normKey(f);
      return k === 'all' || k === uf;
    });
  }

  function matchesDept(course, userDept) {
    if (!userDept) return true;
    const ud = normKey(userDept);
    const list = course.dept || [];
    return list.some(function (d) {
      const k = normKey(d);
      return k === 'all' || k === ud || k.indexOf(ud) !== -1 || ud.indexOf(k) !== -1;
    });
  }

  /**
   * profile = { level, semester, faculty, department }
   * Returns the array of courses matching that profile.
   */
  function getCourses(profile) {
    const level = String(profile.level || '100');
    let semester = String(profile.semester || '1').toLowerCase();
    if (semester.indexOf('2') === 0 || semester === '2nd') semester = '2';
    else semester = '1';
    const faculty = profile.faculty || '';
    const department = profile.department || '';

    return allCourses().filter(c =>
      String(c.level) === level &&
      String(c.semester) === semester &&
      matchesFaculty(c, faculty) &&
      matchesDept(c, department)
    );
  }

  function getCourseByCode(code) {
    return CURRICULUM_DATA[code] || null;
  }

  /**
   * Cross-department search by code, title, or topic text — used by the
   * "Can't find your course?" flow in course_search.html.
   */
  function searchCourses(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) return [];
    return allCourses().filter(c => {
      if (c.code.toLowerCase().includes(q)) return true;
      if (c.title.toLowerCase().includes(q)) return true;
      if ((c.topics || []).some(t => t.toLowerCase().includes(q))) return true;
      return false;
    });
  }

  /**
   * Loads the detailed outline file for a course (course-outlines/CODE.json).
   * Returns null if the file doesn't exist yet — caller should fall back to
   * the inline `topics` array already present on the course object.
   */
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

  /**
   * Summary counts — useful for a stats bar ("42 courses, 18 ready,
   * 24 coming soon").
   */
  function getStats(profile) {
    const list = profile ? getCourses(profile) : allCourses();
    const ready = list.filter(c => c.hasContent).length;
    const totalUnits = list.reduce((sum, c) => sum + (c.units || 0), 0);
    return {
      total: list.length,
      ready,
      comingSoon: list.length - ready,
      totalUnits
    };
  }

  function getByLevel(level) {
    const lv = String(level || '');
    if (!lv || lv === 'all') return allCourses();
    return allCourses().filter(c => String(c.level) === lv);
  }

  function getReadyCourses() {
    return allCourses().filter(c => c.hasContent);
  }

  /** Lightweight list for catalog browsing (no full topic payloads needed for cards). */
  function catalogSlice(opts) {
    opts = opts || {};
    let list = allCourses();
    if (opts.level && opts.level !== 'all') {
      list = list.filter(c => String(c.level) === String(opts.level));
    }
    if (opts.semester && opts.semester !== 'all') {
      const sem = String(opts.semester);
      list = list.filter(c => String(c.semester) === sem || String(c.semester) === (sem === '1st' ? '1' : sem === '2nd' ? '2' : sem));
    }
    if (opts.readyOnly) list = list.filter(c => c.hasContent);
    if (opts.comingSoonOnly) list = list.filter(c => !c.hasContent);
    if (opts.q) {
      const q = opts.q.toLowerCase().trim();
      list = list.filter(c =>
        c.code.toLowerCase().includes(q) ||
        (c.title || '').toLowerCase().includes(q) ||
        (c.topics || []).some(t => String(t).toLowerCase().includes(q))
      );
    }
    // sort: ready first, then code
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
    searchCourses,
    loadOutline,
    hasContent,
    getStats,
    allCourses,
    getByLevel,
    getReadyCourses,
    catalogSlice
  };

})();
