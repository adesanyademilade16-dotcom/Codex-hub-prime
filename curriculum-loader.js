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

  function matchesFaculty(course, userFaculty) {
    if (!userFaculty) return true;
    const list = course.faculty || [];
    return list.includes('all') || list.includes(userFaculty);
  }

  function matchesDept(course, userDept) {
    if (!userDept) return true;
    const list = course.dept || [];
    return list.includes('all') || list.includes(userDept);
  }

  /**
   * profile = { level, semester, faculty, department }
   * Returns the array of courses matching that profile.
   */
  function getCourses(profile) {
    const level = String(profile.level || '100');
    const semester = String(profile.semester || '1');
    const faculty = (profile.faculty || '').toLowerCase().trim();
    const department = (profile.department || '').toLowerCase().trim();

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

  return {
    getCourses,
    getCourseByCode,
    searchCourses,
    loadOutline,
    hasContent,
    getStats
  };

})();
