/* global React */

/* ============================================================
   Schoolwork — shared constants & helpers (window.SchoolworkData)

   This holds only app-wide constants and pure helpers. There is NO
   seed/demo content: every account and every (year, term) profile
   starts empty and is filled in by the user (see seedProfile).
   ============================================================ */

/* Assignment type suggestions, by QCE subject code. Used to populate the
   type dropdown in the inspector; unknown course codes fall back gracefully. */
const TYPES_BY_COURSE = {
  CHM: ["Practical", "Data Analysis", "IA Report", "Exam Practice", "Mock Exam"],
  MAM: ["Problem Set", "Topic Test", "IA Problem-Solving", "Homework", "Mock Exam"],
  ENG: ["Analytical Essay", "Imaginative Writing", "Spoken Persuasive", "Reading Response", "Mock Exam"],
  SOR: ["Investigation", "Comparative Essay", "Class Presentation", "Reading Response", "Mock Exam"],
  DSL: ["Investigation", "Project Portfolio", "Code Submission", "Test", "Mock Exam"],
};

/* ============== Status / priority vocabularies ============== */
const STATUS_LABEL = {
  not_started: "Not started",
  in_progress: "In progress",
  in_review:   "In review",
  submitted:   "Submitted",
  graded:      "Graded",
  late:        "Late",
};
const STATUS_BADGE = {
  not_started: "neutral",
  in_progress: "info",
  in_review:   "warning",
  submitted:   "accent",
  graded:      "success",
  late:        "error",
};
const PRIORITY_LABEL = { low: "Low", med: "Medium", high: "High" };

/* ============================================================
   Automatic priority rules
   - Anything graded or submitted drops to LOW (it needs no attention).
   - Essays ramp up as the deadline nears: LOW at 3 weeks out, MEDIUM at
     2 weeks, HIGH within the final week.
   Returns a priority string, or null when no rule applies (caller keeps
   whatever priority is already set).
   ============================================================ */
const isEssay = (type) => /essay/i.test(type || "");

/* Returns true when this assignment carries a draft deadline that hasn't
   been ticked off yet. Used to decide whether the draft date is still the
   "next deadline" or whether the row should switch to the final due date. */
const hasOpenDraft = (a) => !!(a && a.draftDue && !a.draftSubmittedAt);

/* ============================================================
   QCE summative assessment instruments.

   In Queensland a General subject's result comes from three internal
   assessments (IA1, IA2, IA3) plus one external assessment (EA). Only
   assignments tagged with one of these instruments count toward a
   subject's "class grade" — drafts, homework and practice tasks do not.
   Weightings default to an even 25% split and are editable per item
   (Maths/Science external exams are often heavier, e.g. EA 50%).
   ============================================================ */
const ASSESSMENT_KINDS = ["IA1", "IA2", "IA3", "EA"];
const ASSESSMENT_LABEL = { IA1: "IA1", IA2: "IA2", IA3: "IA3", EA: "EA" };
const ASSESSMENT_FULL = {
  IA1: "Internal Assessment 1", IA2: "Internal Assessment 2",
  IA3: "Internal Assessment 3", EA: "External Assessment",
};
const ASSESSMENT_DEFAULT_WEIGHT = { IA1: 25, IA2: 25, IA3: 25, EA: 25 };
const isSummative = (a) => ASSESSMENT_KINDS.includes(a && a.assessment);

/* Weighted class grade (%) for a set of one subject's assignments.
   Prefers the summative IA/EA items that have a result; if none are
   tagged yet it falls back to any graded item, so existing data still
   shows a grade. Returns null when there's nothing to average. */
function classGrade(items) {
  const scored = (a) => a.earned != null && a.points;
  let base = (items || []).filter(a => isSummative(a) && scored(a));
  if (!base.length) base = (items || []).filter(a => a.status === "graded" && scored(a));
  if (!base.length) return null;
  const wsum = base.reduce((s, a) => s + (a.weight || 1), 0);
  return base.reduce((s, a) => s + (a.earned / a.points) * 100 * (a.weight || 1), 0) / wsum;
}

function autoPriority(a, now = new Date()) {
  if (a.status === "graded" || a.status === "submitted") return "low";
  if (isEssay(a.type) && a.due) {
    const days = (new Date(a.due) - now) / 864e5;
    if (days <= 7) return "high";
    if (days <= 14) return "med";
    return "low";
  }
  return null;
}

/* ============================================================
   Default term profiles + dates (editable per account in Settings).
   State (complete / current / upcoming) is DERIVED from these dates
   relative to today — never hard-coded — so switching the active term
   always reflects reality.
   ============================================================ */
// Year 11 (2025) — standard Queensland term dates, shared across presets and
// editable per account in Settings. A Year 12 student in 2026 sat Year 11 in
// 2025, so both years are always available in the term switcher.
const Y11_2025 = [
  { key: "Year 11 — Term 1, 2025", year: "Year 11", term: "Term 1", start: "2025-01-28", end: "2025-04-04" },
  { key: "Year 11 — Term 2, 2025", year: "Year 11", term: "Term 2", start: "2025-04-22", end: "2025-06-27" },
  { key: "Year 11 — Term 3, 2025", year: "Year 11", term: "Term 3", start: "2025-07-14", end: "2025-09-19" },
  { key: "Year 11 — Term 4, 2025", year: "Year 11", term: "Term 4", start: "2025-10-07", end: "2025-12-12" },
];
const DEFAULT_TERMS = [
  ...Y11_2025,
  { key: "Year 12 — Term 1, 2026", year: "Year 12", term: "Term 1", start: "2026-01-24", end: "2026-03-28" },
  { key: "Year 12 — Term 2, 2026", year: "Year 12", term: "Term 2", start: "2026-04-14", end: "2026-06-20" },
  { key: "Year 12 — Term 3, 2026", year: "Year 12", term: "Term 3", start: "2026-07-13", end: "2026-09-19" },
  { key: "Year 12 — Term 4, 2026", year: "Year 12", term: "Term 4", start: "2026-10-06", end: "2026-12-11" },
];
function termState(t, now = new Date()) {
  const start = t.start ? new Date(t.start + "T00:00") : null;
  const end = t.end ? new Date(t.end + "T23:59") : null;
  if (end && end < now) return "complete";
  if (start && start > now) return "upcoming";
  if (start && end) return "current";
  return "upcoming";
}
function termWeeks(t) {
  if (!t.start || !t.end) return null;
  const d = (new Date(t.end) - new Date(t.start)) / 864e5;
  return d > 0 ? Math.round(d / 7) : null;
}
function termDatesLabel(t) {
  if (!t.start || !t.end) return "Dates not set";
  const f = (s) => new Date(s + "T00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const yr = new Date(t.end + "T00:00").getFullYear();
  return `${f(t.start)} – ${f(t.end)} ${yr}`;
}

/* ============================================================
   School term presets (2026). Picked at sign-up to pre-fill term dates;
   also applicable later in Settings → Academic year.
   ============================================================ */
const SCHOOLS = [
  { id: "generic", name: "Other / set my own dates", terms: DEFAULT_TERMS },
  { id: "nudgee", name: "St Joseph's Nudgee College", terms: [
    ...Y11_2025,
    { key: "Year 12 — Term 1, 2026", year: "Year 12", term: "Term 1", start: "2026-01-29", end: "2026-04-01" },
    { key: "Year 12 — Term 2, 2026", year: "Year 12", term: "Term 2", start: "2026-04-21", end: "2026-06-18" },
    { key: "Year 12 — Term 3, 2026", year: "Year 12", term: "Term 3", start: "2026-07-14", end: "2026-09-17" },
    { key: "Year 12 — Term 4, 2026", year: "Year 12", term: "Term 4", start: "2026-10-06", end: "2026-11-20" },
  ] },
  { id: "aquinas", name: "Aquinas College", terms: [
    ...Y11_2025,
    { key: "Year 12 — Term 1, 2026", year: "Year 12", term: "Term 1", start: "2026-01-27", end: "2026-04-02" },
    { key: "Year 12 — Term 2, 2026", year: "Year 12", term: "Term 2", start: "2026-04-20", end: "2026-07-03" },
    { key: "Year 12 — Term 3, 2026", year: "Year 12", term: "Term 3", start: "2026-07-20", end: "2026-09-25" },
    { key: "Year 12 — Term 4, 2026", year: "Year 12", term: "Term 4", start: "2026-10-12", end: "2026-12-17" },
  ] },
];
function termsForSchool(id) {
  const s = SCHOOLS.find(x => x.id === id);
  return JSON.parse(JSON.stringify(s ? s.terms : DEFAULT_TERMS));
}

/* ============== Default calendars (named, colour-coded event groups) ============== */
const DEFAULT_CALENDARS = [
  { id: "cal-classes",  name: "Classes",   color: "#2E5AAC", builtin: true },
  { id: "cal-due",      name: "Deadlines", color: "#A8551A", builtin: true },
  { id: "cal-personal", name: "Personal",  color: "#2F7A4D" },
];

/* ============================================================
   Per-profile seed — every (year, term) profile, and every new account,
   starts EMPTY. The user fills in their own subjects via the onboarding
   screen. Only the structural default calendars are provided so one-off
   events have somewhere to live.
   ============================================================ */
function seedProfile() {
  return {
    courses: [], assignments: [], attachments: {}, notes: [],
    schedule: [], calendars: JSON.parse(JSON.stringify(DEFAULT_CALENDARS)), events: [], library: [],
  };
}

window.SchoolworkData = {
  DEFAULT_CALENDARS, DEFAULT_TERMS, SCHOOLS, termsForSchool,
  STATUS_LABEL, STATUS_BADGE, PRIORITY_LABEL, TYPES_BY_COURSE,
  termState, termWeeks, termDatesLabel,
  isEssay, autoPriority, hasOpenDraft,
  ASSESSMENT_KINDS, ASSESSMENT_LABEL, ASSESSMENT_FULL, ASSESSMENT_DEFAULT_WEIGHT,
  isSummative, classGrade,
  seedProfile,
};
