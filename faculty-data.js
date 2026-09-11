/**
 * faculty-data.js
 * SINGLE SOURCE OF TRUTH for faculties, departments, and levels.
 * Used by: signup.html, chooseFaculty.html, profile.html
 * (and any future page that needs this list — never hardcode it again).
 *
 * Faculty/programme names are sourced directly from the official NUC CCMAS
 * (Core Curriculum & Minimum Academic Standards) documents — this is the
 * real national curriculum, not an invented list.
 *
 * hasContent: true  -> Codex Hub currently has question-bank content for
 *                       this department's courses.
 * hasContent: false -> Real, CCMAS-accurate programme, but no question
 *                       content built yet. Still selectable (so a student's
 *                       profile is accurate to their real programme), but
 *                       the UI visibly marks it "Coming soon" rather than
 *                       silently showing an empty subject list.
 *
 * To add a new faculty/department later, or flip hasContent to true once
 * a programme's course bank is built: edit ONLY this file.
 */

const LEVELS = ["100", "200", "300", "400", "500", "600"];
// 500 added: Law's real 500L catalog is built.
// 600 added: Veterinary Medicine is a genuine 6-year programme with a real
// 600L clinical year (Clinics I, Clinical Seminars, Research Project, Rural
// Posting) confirmed directly in its CCMAS document — not a placeholder.
// If another faculty needs 500/600 removed from view until its own catalog
// is ready, filter by faculty in the UI rather than removing here.

const FACULTY_DATA = {

  science: {
    label: "Sciences",
    departments: [
      { name: "Mathematics", hasContent: true },
      { name: "Physics", hasContent: true },
      { name: "Chemistry", hasContent: true },
      { name: "Biology", hasContent: true },
      { name: "Statistics", hasContent: true },
      { name: "Biochemistry", hasContent: false },
      { name: "Microbiology", hasContent: false },
      { name: "Forensic Science", hasContent: false },
      { name: "Botany", hasContent: false },
      { name: "Zoology", hasContent: false },
      { name: "Applied Geophysics", hasContent: false },
      { name: "Biotechnology", hasContent: false },
      { name: "Brewing Science and Technology", hasContent: false },
      { name: "Environmental Management and Toxicology", hasContent: false },
      { name: "Geology", hasContent: false },
      { name: "Industrial Chemistry", hasContent: false },
      { name: "Industrial Mathematics", hasContent: false },
      { name: "Industrial Physics", hasContent: false },
      { name: "Marine Science", hasContent: false },
      { name: "Maritime Science", hasContent: false },
      { name: "Medical Physics", hasContent: false },
      { name: "Medicinal Chemistry", hasContent: false },
      { name: "Meteorology", hasContent: false },
      { name: "Petroleum Chemistry", hasContent: false },
      { name: "Physics with Electronics", hasContent: false },
      { name: "Science Laboratory Technology", hasContent: false },
      { name: "Other", hasContent: false }
    ]
  },

  social_sciences: {
    label: "Social Sciences",
    departments: [
      { name: "Economics", hasContent: true },
      { name: "Political Science", hasContent: true },
      { name: "Psychology", hasContent: true },
      { name: "Sociology", hasContent: false },
      { name: "Banking and Finance", hasContent: true },
      { name: "Cooperative and Rural Development", hasContent: true },
      { name: "Tourism", hasContent: true },
      { name: "Social Studies", hasContent: true },
      { name: "Mass Communication", hasContent: true },
      { name: "Criminology and Security Studies", hasContent: false },
      { name: "Demography and Social Statistics", hasContent: false },
      { name: "Development Studies", hasContent: false },
      { name: "International Relations", hasContent: false },
      { name: "Peace and Conflict Resolution", hasContent: false },
      { name: "Petroleum Economics and Policy Studies", hasContent: false },
      { name: "Other", hasContent: false }
    ]
  },

  education: {
    label: "Education",
    departments: [
      { name: "Education (General)", hasContent: true },
      { name: "Guidance and Counselling", hasContent: true },
      { name: "Adult Education", hasContent: true },
      { name: "Science Education (STED)", hasContent: true },
      { name: "Computer Science Education", hasContent: false },
      { name: "Physics Education", hasContent: false },
      { name: "Chemistry Education", hasContent: false },
      { name: "Biology Education", hasContent: false },
      { name: "Mathematical Education", hasContent: false },
      { name: "Other", hasContent: false }
    ]
  },

  arts: {
    label: "Arts",
    departments: [
      { name: "French", hasContent: true },
      { name: "Theatre Arts", hasContent: true },
      { name: "English Language", hasContent: false },
      { name: "History", hasContent: false },
      { name: "History and Diplomatic Studies", hasContent: false },
      { name: "Philosophy", hasContent: false },
      { name: "Linguistics", hasContent: false },
      { name: "Literature in English", hasContent: false },
      { name: "African Traditional Religion", hasContent: false },
      { name: "Christian Religious Studies", hasContent: false },
      { name: "Christian Theology", hasContent: false },
      { name: "Islamic Studies", hasContent: false },
      { name: "Religious Studies", hasContent: false },
      { name: "Arabic Studies", hasContent: false },
      { name: "Archaeology", hasContent: false },
      { name: "Chinese Language", hasContent: false },
      { name: "Classics", hasContent: false },
      { name: "Folklore", hasContent: false },
      { name: "German", hasContent: false },
      { name: "Music", hasContent: false },
      { name: "Yoruba", hasContent: false },
      { name: "Igbo", hasContent: false },
      { name: "Hausa", hasContent: false },
      { name: "Other", hasContent: false }
    ]
  },

  administration_and_management: {
    label: "Administration and Management",
    departments: [
      { name: "Business Administration", hasContent: true },
      { name: "Accounting", hasContent: false },
      { name: "Actuarial Science", hasContent: false },
      { name: "Aviation Management", hasContent: false },
      { name: "Finance", hasContent: false },
      { name: "Business Information Technology", hasContent: false },
      { name: "Employment and Human Resource Management", hasContent: false },
      { name: "Entrepreneurship", hasContent: false },
      { name: "Hospitality and Tourism Management", hasContent: false },
      { name: "Information Resource Management", hasContent: false },
      { name: "Insurance", hasContent: false },
      { name: "Local Government and Development Studies", hasContent: false },
      { name: "Logistics and Supply Chain Management", hasContent: false },
      { name: "Marketing", hasContent: false },
      { name: "Office and Information Management", hasContent: false },
      { name: "Project Management", hasContent: false },
      { name: "Procurement Management", hasContent: false },
      { name: "Public Administration", hasContent: false },
      { name: "Securities and Investments Management", hasContent: false },
      { name: "Taxation", hasContent: false },
      { name: "Transport Management", hasContent: false },
      { name: "Other", hasContent: false }
    ]
  },

  law: {
    label: "Law",
    departments: [
      { name: "Law", hasContent: false },
      { name: "Other", hasContent: false }
    ]
  },

  // ── The faculties below are new — added from the official CCMAS but with
  //    no Codex Hub content yet. They previously had no home at all in this
  //    app (e.g. Engineering/Medicine/Agriculture/Computing were miscategorized
  //    as "Science" departments). This gives every real Nigerian university
  //    faculty an accurate home, even before content is built for it.

  computing: {
    label: "Computing",
    departments: [
      { name: "Computer Science", hasContent: true },
      { name: "Cybersecurity", hasContent: false },
      { name: "Data Science", hasContent: false },
      { name: "Information and Communication Technology", hasContent: false },
      { name: "Information Systems", hasContent: false },
      { name: "Information Technology", hasContent: false },
      { name: "Software Engineering", hasContent: false },
      { name: "Other", hasContent: false }
    ]
  },

  engineering_and_technology: {
    label: "Engineering and Technology",
    departments: [
      { name: "Aerospace Engineering", hasContent: true },
      { name: "Agricultural and Biosystems Engineering", hasContent: true },
      { name: "Automotive Engineering", hasContent: true },
      { name: "Biomedical Engineering/Technology", hasContent: true },
      { name: "Chemical Engineering", hasContent: true },
      { name: "Civil Engineering", hasContent: true },
      { name: "Computer Engineering", hasContent: true },
      { name: "Electrical Engineering", hasContent: true },
      { name: "Electrical and Electronics Engineering", hasContent: true },
      { name: "Electronics Engineering", hasContent: true },
      { name: "Environmental Engineering", hasContent: true },
      { name: "Food Engineering", hasContent: true },
      { name: "Industrial and Production Engineering", hasContent: true },
      { name: "Information and Communication Engineering", hasContent: true },
      { name: "Marine and Offshore Engineering", hasContent: true },
      { name: "Materials Engineering", hasContent: false },
      { name: "Materials and Metallurgical Engineering", hasContent: true },
      { name: "Mechanical Engineering", hasContent: true },
      { name: "Mechatronics Engineering", hasContent: true },
      { name: "Metallurgical Engineering", hasContent: true },
      { name: "Petroleum and Gas Engineering", hasContent: true },
      { name: "Petrochemical Engineering", hasContent: true },
      { name: "Mining Engineering", hasContent: true },
      { name: "Nuclear Engineering", hasContent: true },
      { name: "Railway Engineering", hasContent: true },
      { name: "Wood Products Engineering", hasContent: true },
      { name: "Other", hasContent: false }
    ]
  },

  agriculture: {
    label: "Agriculture",
    departments: [
      { name: "Agribusiness", hasContent: false },
      { name: "Agricultural Economics", hasContent: false },
      { name: "Agricultural Extension", hasContent: false },
      { name: "Animal Science", hasContent: false },
      { name: "Crop Science", hasContent: false },
      { name: "Family and Consumer Sciences", hasContent: false },
      { name: "Fisheries and Aquaculture", hasContent: false },
      { name: "Food Science and Technology", hasContent: false },
      { name: "Other", hasContent: false }
    ]
  },

  allied_health_sciences: {
    label: "Allied Health Sciences",
    departments: [
      { name: "Anatomy", hasContent: true },
      { name: "Biochemistry", hasContent: true },
      { name: "Medical Laboratory Science", hasContent: true },
      { name: "Human Nutrition", hasContent: true },
      { name: "Nursing Science", hasContent: true },
      { name: "Optometry", hasContent: true },
      { name: "Physiology", hasContent: true },
      { name: "Pathology", hasContent: true },
      { name: "Pharmacology", hasContent: true },
      { name: "Physiotherapy", hasContent: true },
      { name: "Psychiatry", hasContent: false },
      { name: "Radiography and Radiation Science", hasContent: true },
      { name: "Audiology", hasContent: true },
      { name: "Speech-Language Therapy", hasContent: true },
      { name: "Dental Technology and Therapy", hasContent: true },
      { name: "Environmental Health", hasContent: true },
      { name: "Health Information Management", hasContent: true },
      { name: "Health Services Management", hasContent: true },
      { name: "Occupational Therapy", hasContent: true },
      { name: "Prosthetics and Orthotics", hasContent: true },
      { name: "Public Health", hasContent: true },
      { name: "Complementary and Alternative Medicine", hasContent: true },
      { name: "Other", hasContent: false }
    ]
  },

  basic_medical_sciences: {
    label: "Basic Medical Sciences",
    departments: [
      { name: "Human Anatomy", hasContent: false },
      { name: "Physiology", hasContent: false },
      { name: "Other", hasContent: false }
    ]
  },

  medicine_and_dentistry: {
    label: "Medicine and Dentistry",
    departments: [
      { name: "Medicine", hasContent: false },
      { name: "Dentistry", hasContent: false },
      { name: "Other", hasContent: false }
    ]
  },

  pharmacy: {
    label: "Pharmacy and Pharmaceutical Sciences",
    departments: [
      { name: "Pharmacy", hasContent: false },
      { name: "Other", hasContent: false }
    ]
  },

  architecture: {
    label: "Architecture",
    departments: [
      { name: "Architecture", hasContent: false },
      { name: "Architectural Science Technology", hasContent: false },
      { name: "Furniture Design", hasContent: false },
      { name: "Interior Architecture Design", hasContent: false },
      { name: "Landscape Architecture", hasContent: false },
      { name: "Naval Architecture", hasContent: false },
      { name: "Other", hasContent: false }
    ]
  },

  environmental_sciences: {
    label: "Environmental Sciences",
    departments: [
      { name: "Building", hasContent: false },
      { name: "Clothing and Textile", hasContent: false },
      { name: "Estate Management", hasContent: false },
      { name: "Environmental Management", hasContent: false },
      { name: "Environmental Standards", hasContent: false },
      { name: "Fashion Design", hasContent: false },
      { name: "Fine Arts", hasContent: false },
      { name: "Geography", hasContent: false },
      { name: "Industrial Design", hasContent: false },
      { name: "Quantity Surveying", hasContent: false },
      { name: "Surveying and Geoinformatics", hasContent: false },
      { name: "Urban and Regional Planning", hasContent: false },
      { name: "Other", hasContent: false }
    ]
  },

  communication_and_media_studies: {
    label: "Communication and Media Studies",
    departments: [
      { name: "Advertising", hasContent: false },
      { name: "Broadcasting", hasContent: false },
      { name: "Development Communication Studies", hasContent: false },
      { name: "Film and Multimedia", hasContent: false },
      { name: "Information and Media Studies", hasContent: false },
      { name: "Journalism and Media Studies", hasContent: false },
      { name: "Mass Communication", hasContent: true },
      { name: "Public Relations", hasContent: false },
      { name: "Strategic Communication", hasContent: false },
      { name: "Other", hasContent: false }
    ]
  },

  veterinary_medicine: {
    label: "Veterinary Medicine",
    departments: [
      { name: "Veterinary Medicine", hasContent: true },
      { name: "Other", hasContent: false }
    ]
  }

};

/** Populates a <select id="levelSelectId"> with LEVELS. */
function populateLevels(levelSelectId) {
  const sel = document.getElementById(levelSelectId);
  if (!sel) return;
  sel.innerHTML = '<option value="" disabled selected>— Choose Level —</option>';
  LEVELS.forEach(lvl => {
    const o = document.createElement('option');
    o.value = lvl;
    o.textContent = lvl + " Level";
    sel.appendChild(o);
  });
}

/** Populates a <select id="facultySelectId"> with FACULTY_DATA keys. */
function populateFaculties(facultySelectId) {
  const sel = document.getElementById(facultySelectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">— Choose Faculty —</option>';
  Object.keys(FACULTY_DATA).forEach(key => {
    const o = document.createElement('option');
    o.value = key;
    o.textContent = FACULTY_DATA[key].label;
    sel.appendChild(o);
  });
}

/**
 * Populates a <select id="deptSelectId"> based on the faculty currently
 * selected in <select id="facultySelectId">. Departments with no question
 * content yet are labeled "(Coming soon)" but remain selectable, so a
 * student's profile always reflects their real programme.
 */
function populateDepartments(facultySelectId, deptSelectId) {
  const facultyVal = document.getElementById(facultySelectId).value;
  const deptSel = document.getElementById(deptSelectId);
  const entry = FACULTY_DATA[facultyVal];
  const list = entry ? entry.departments : [];

  deptSel.innerHTML = '<option value="">— Select Department —</option>';
  deptSel.disabled = !list.length;
  list.forEach(d => {
    const o = document.createElement('option');
    o.value = d.name.toLowerCase().replace(/[()]/g, '').replace(/\s+/g, '_');
    o.textContent = d.hasContent ? d.name : d.name + ' (Coming soon)';
    deptSel.appendChild(o);
  });
}
