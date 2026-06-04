/* global React */

/* ============================================================
   Store + EditMode context

   The store is now ACCOUNT- and PROFILE-aware:
   - Each (year, term) profile keeps its own courses / assignments /
     notes / schedule / calendars / events / library.
   - Everything persists to localStorage under
     `schoolwork:data:<accountId>:<profileKey>`.
   - Free-tier accounts hit rate limits (from window.Auth); the two
     unlimited emails bypass them.
   ============================================================ */

const { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } = React;

const StoreCtx = createContext(null);

const uid = (p) => p + "-" + Date.now().toString(36) + Math.floor(Math.random() * 1e3).toString(36);

const StoreProvider = ({ children }) => {
  const seed = window.SchoolworkData;
  const { account, limits, updateAccount } = window.Auth.useAuth();
  const accountId = account?.id || "anon";

  const lastKey = "schoolwork:lastProfile:" + accountId;
  const dataKey = (pk) => "schoolwork:data:" + accountId + ":" + pk;

  const loadProfile = useCallback((pk) => {
    try { const v = localStorage.getItem(dataKey(pk)); if (v) return normalize(JSON.parse(v)); } catch {}
    return normalize(seed.seedProfile(pk));
  }, [accountId]);

  // Ensure every slice exists even on older saved data, and apply the
  // automatic priority rules on every load (graded/submitted → low, essays
  // ramp by deadline) so priorities are always current.
  function normalize(d) {
    const now = new Date();
    const assignments = (d.assignments || []).map(a => {
      const auto = seed.autoPriority(a, now);
      return (auto && auto !== a.priority) ? { ...a, priority: auto } : a;
    });
    return {
      courses: d.courses || [],
      assignments,
      attachments: d.attachments || {},
      notes: d.notes || [],
      schedule: d.schedule || [],
      calendars: d.calendars || JSON.parse(JSON.stringify(seed.DEFAULT_CALENDARS)),
      events: d.events || [],
      library: d.library || [],
    };
  }

  const [workspaceName, _setWorkspaceName] = useState(() => {
    try { return localStorage.getItem(lastKey) || "Year 12 — Term 2, 2026"; } catch { return "Year 12 — Term 2, 2026"; }
  });
  const [data, setData] = useState(() => loadProfile(workspaceName));
  const [limitNotice, setLimitNotice] = useState(null);
  const [dirty, setDirty] = useState(false);

  /* ---------- configurable academic terms (per account) ---------- */
  const termsKey = "schoolwork:terms:" + accountId;
  const [terms, _setTerms] = useState(() => {
    const preset = seed.termsForSchool(account?.school);
    let saved = null;
    try { const v = localStorage.getItem(termsKey); if (v) saved = JSON.parse(v); } catch {}
    // New account: pre-fill term dates from the school chosen at sign-up.
    if (!saved || !saved.length) return preset;
    // Existing account: keep the user's terms and edits, but merge in any
    // preset terms they don't have yet (e.g. the Year 11 terms added in this
    // release) so both years always show. Matched by key; sorted by date.
    const have = new Set(saved.map(t => t.key));
    const merged = [...saved, ...preset.filter(t => !have.has(t.key))];
    merged.sort((a, b) => String(a.start || "").localeCompare(String(b.start || "")));
    return merged;
  });
  useEffect(() => { try { localStorage.setItem(termsKey, JSON.stringify(terms)); } catch {} }, [terms, accountId]);
  const setTerms = useCallback((next) => _setTerms(next), []);

  // Refresh = re-read this profile from storage (normalize re-applies the
  // automatic priority rules), discarding nothing that was already saved.
  const reloadProfile = useCallback(() => {
    const fresh = loadProfile(workspaceName);
    setData(fresh); setDirty(false);
    return fresh.assignments.length;
  }, [loadProfile, workspaceName]);

  // Persist current profile whenever it changes.
  useEffect(() => {
    try { localStorage.setItem(dataKey(workspaceName), JSON.stringify(data)); } catch {}
  }, [data, workspaceName, accountId]);

  const setWorkspaceName = useCallback((pk) => {
    try { localStorage.setItem(lastKey, pk); } catch {}
    _setWorkspaceName(pk);
    setData(loadProfile(pk));
  }, [loadProfile, lastKey]);

  /* ---------- rate-limit gate ---------- */
  const checkLimit = useCallback((kind, count) => {
    const cap = limits?.[kind] ?? Infinity;
    if (count >= cap) { setLimitNotice({ kind, cap }); return false; }
    return true;
  }, [limits]);
  const clearLimitNotice = useCallback(() => setLimitNotice(null), []);

  /* ---------- destructured slices ---------- */
  const { courses, assignments, attachments, notes, schedule, calendars, events, library } = data;

  const patch = (slice) => setData(d => ({ ...d, ...slice }));

  /* ---------- courses ---------- */
  const updateCourse = useCallback((id, p) => setData(d => ({ ...d, courses: d.courses.map(r => r.id === id ? { ...r, ...p } : r) })), []);
  const addCourse = useCallback((row = {}) => {
    let created = null;
    setData(d => {
      if (!checkLimit("courses", d.courses.length)) return d;
      created = {
        id: (row.code || "C").slice(0, 3).toUpperCase() + "-" + Math.floor(Math.random() * 900 + 100),
        code: row.code || "New subject", shortCode: (row.code || "NEW").slice(0, 3).toUpperCase(),
        title: row.title || "New subject", instructor: row.instructor || "—",
        color: row.color || "#2E5AAC", schedule: row.schedule || "—", room: row.room || "—",
        credits: row.credits || 4, term: workspaceName, grade: 0, completion: 0,
      };
      return { ...d, courses: [...d.courses, created] };
    });
    return created;
  }, [checkLimit, workspaceName]);
  const removeCourse = useCallback((id) => setData(d => ({
    ...d,
    courses: d.courses.filter(c => c.id !== id),
    assignments: d.assignments.filter(a => a.course !== id),
    notes: d.notes.filter(n => n.course !== id),
  })), []);

  /* ---------- assignments ---------- */
  // Any edit re-derives priority for graded/submitted items and essays so the
  // automatic rules stay in force when status, type, or due date changes.
  const updateAssignment = useCallback((id, p) => setData(d => ({
    ...d,
    assignments: d.assignments.map(r => {
      if (r.id !== id) return r;
      const merged = { ...r, ...p };
      // Tagging an item as a summative assessment (IA/EA) gives it the QCE
      // default weight, unless the user already set a non-default weight.
      if (p.assessment !== undefined && seed.isSummative(merged) && (r.weight == null || r.weight === 5)) {
        merged.weight = seed.ASSESSMENT_DEFAULT_WEIGHT[merged.assessment];
      }
      const auto = seed.autoPriority(merged);
      if (auto) merged.priority = auto;
      return merged;
    }),
  })), []);
  const addAssignment = useCallback((row = {}) => {
    let created = null;
    setData(d => {
      if (!checkLimit("assignments", d.assignments.length)) return d;
      const assessment = row.assessment || "";   // "" | IA1 | IA2 | IA3 | EA
      created = {
        id: "A-" + Math.floor(2100 + Math.random() * 900),
        title: row.title || "Untitled assignment",
        course: row.course || d.courses[0]?.id || "CHM",
        type: row.type || "Homework",
        assessment,                       // QCE instrument that counts toward the class grade
        due: row.due || new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 16),
        draftDue: row.draftDue || null,   // essays: optional earlier draft milestone
        status: row.status || "not_started",
        priority: row.priority || "med",
        weight: row.weight ?? (seed.ASSESSMENT_DEFAULT_WEIGHT[assessment] ?? 5),
        points: row.points ?? 50, earned: row.earned ?? null,
        est: row.est ?? 60, notes: row.notes ?? "",
      };
      const auto = seed.autoPriority(created);
      if (auto) created.priority = auto;
      return { ...d, assignments: [created, ...d.assignments] };
    });
    return created;
  }, [checkLimit]);
  const removeAssignment = useCallback((id) => setData(d => {
    const { [id]: _drop, ...restAtt } = d.attachments;
    return { ...d, assignments: d.assignments.filter(r => r.id !== id), attachments: restAtt };
  }), []);

  /* ---------- notes ---------- */
  const updateNote = useCallback((id, p) => setData(d => ({ ...d, notes: d.notes.map(r => r.id === id ? { ...r, ...p, updated: new Date().toISOString() } : r) })), []);
  const addNote = useCallback((s = {}) => {
    let note = null;
    setData(d => {
      if (!checkLimit("notes", d.notes.length)) return d;
      note = { id: uid("N"), title: s.title || "Untitled note", course: s.course || d.courses[0]?.id || "CHM", updated: new Date().toISOString(), body: s.body || "" };
      return { ...d, notes: [note, ...d.notes] };
    });
    return note;
  }, [checkLimit]);
  const removeNote = useCallback((id) => setData(d => ({ ...d, notes: d.notes.filter(r => r.id !== id) })), []);

  /* ---------- attachments (per assignment) ---------- */
  const setAssignmentAttachments = useCallback((assignmentId, files) => setData(d => ({ ...d, attachments: { ...d.attachments, [assignmentId]: files } })), []);

  /* ---------- schedule (recurring weekly classes) ---------- */
  const addClass = useCallback((row = {}) => {
    let created = null;
    setData(d => {
      created = { id: uid("CL"), day: row.day ?? 0, start: row.start || "09:00", end: row.end || "10:00", title: row.title || "New class", course: row.course || d.courses[0]?.id, kind: row.kind || "lecture", room: row.room || "" };
      return { ...d, schedule: [...d.schedule, created] };
    });
    return created;
  }, []);
  const updateClass = useCallback((id, p) => setData(d => ({ ...d, schedule: d.schedule.map((r, i) => (r.id || "i" + i) === id ? { ...r, ...p } : r) })), []);
  const removeClass = useCallback((id) => setData(d => ({ ...d, schedule: d.schedule.filter((r, i) => (r.id || "i" + i) !== id) })), []);

  /* ---------- copy subjects and/or the weekly schedule from another term ----------
     Reads the source term's saved profile straight off localStorage (it
     might not be the active one). Subjects matched by code (case-
     insensitive) are merged with what's already here; the rest are
     created. The weekly schedule is then rewritten through the resulting
     id map so every copied class still points at a valid subject.

     `includeCourses` / `includeSchedule` toggle which slice(s) come
     across. `replace` clears the active term's existing entries for the
     slices that are being copied. Either slice can legitimately be zero
     (e.g. a source term with subjects but no classes set up yet); only
     "both zero" is treated as nothing to do. */
  const copyFromTerm = useCallback((sourceKey, { includeCourses = true, includeSchedule = true, replace = false } = {}) => {
    if (!sourceKey || sourceKey === workspaceName) return { ok: false, reason: "same-term" };
    if (!includeCourses && !includeSchedule) return { ok: false, reason: "nothing-selected" };
    let src = null;
    try { const v = localStorage.getItem(dataKey(sourceKey)); if (v) src = JSON.parse(v); } catch {}
    const srcCourses = (src && src.courses) || [];
    const srcSchedule = (src && src.schedule) || [];
    if (!src || (!srcCourses.length && !srcSchedule.length)) return { ok: false, reason: "empty" };
    let addedClasses = 0, addedSubjects = 0;
    setData(d => {
      const idMap = new Map();
      let targetCourses = includeCourses && replace ? [] : [...d.courses];
      // Always *consider* every source subject so we can re-link the schedule,
      // even when the user only ticked Classes. When `includeCourses` is off
      // we only register existing matches and skip the create step.
      srcCourses.forEach(c => {
        const match = targetCourses.find(tc => (tc.code || "").toLowerCase() === (c.code || "").toLowerCase());
        if (match) { idMap.set(c.id, match.id); return; }
        if (!includeCourses) return; // subject doesn't exist here and we're not bringing them across
        const nid = (c.code || "C").slice(0, 3).toUpperCase() + "-" + Math.floor(Math.random() * 900 + 100);
        targetCourses.push({ ...c, id: nid, term: workspaceName, grade: 0, completion: 0 });
        idMap.set(c.id, nid);
        addedSubjects += 1;
      });

      let nextSchedule = d.schedule;
      if (includeSchedule) {
        const copied = srcSchedule.map(s => ({
          ...s,
          id: uid("CL"),
          course: idMap.get(s.course) || s.course,
        }));
        addedClasses = copied.length;
        nextSchedule = replace ? copied : [...d.schedule, ...copied];
      }
      return { ...d, courses: targetCourses, schedule: nextSchedule };
    });
    return { ok: true, addedClasses, addedSubjects };
  }, [workspaceName, accountId]);

  /* ---------- calendars ---------- */
  const addCalendar = useCallback((row = {}) => {
    let created = null;
    setData(d => {
      if (!checkLimit("calendars", d.calendars.length)) return d;
      created = { id: uid("cal"), name: row.name || "New calendar", color: row.color || "#7A4FAA" };
      return { ...d, calendars: [...d.calendars, created] };
    });
    return created;
  }, [checkLimit]);
  const updateCalendar = useCallback((id, p) => setData(d => ({ ...d, calendars: d.calendars.map(r => r.id === id ? { ...r, ...p } : r) })), []);
  const removeCalendar = useCallback((id) => setData(d => ({ ...d, calendars: d.calendars.filter(r => r.id !== id), events: d.events.filter(e => e.calendarId !== id) })), []);

  /* ---------- events (one-off, dated) ---------- */
  const addEvent = useCallback((row = {}) => {
    let created = null;
    setData(d => {
      if (!checkLimit("events", d.events.length)) return d;
      created = { id: uid("E"), calendarId: row.calendarId || d.calendars[0]?.id, title: row.title || "New event", date: row.date, start: row.start || "12:00", end: row.end || "13:00", course: row.course || null, notes: row.notes || "" };
      return { ...d, events: [...d.events, created] };
    });
    return created;
  }, [checkLimit]);
  const updateEvent = useCallback((id, p) => setData(d => ({ ...d, events: d.events.map(r => r.id === id ? { ...r, ...p } : r) })), []);
  const removeEvent = useCallback((id) => setData(d => ({ ...d, events: d.events.filter(r => r.id !== id) })), []);

  /* ---------- library ---------- */
  const addLibraryFile = useCallback((file = {}) => {
    let created = null;
    setData(d => {
      if (!checkLimit("library", d.library.length)) return d;
      created = { id: uid("L"), name: file.name || "Untitled", kind: file.kind || "doc", size: file.size || "—", modified: new Date().toISOString(), owner: account?.name || "Me", tags: file.tags || [], body: file.body, dataUrl: file.dataUrl, summary: file.summary, link: file.link, driveId: file.driveId };
      return { ...d, library: [created, ...d.library] };
    });
    return created;
  }, [checkLimit, account]);
  const updateLibraryFile = useCallback((id, p) => setData(d => ({ ...d, library: d.library.map(r => r.id === id ? { ...r, ...p } : r) })), []);
  const removeLibraryFile = useCallback((id) => setData(d => ({ ...d, library: d.library.filter(r => r.id !== id) })), []);

  const courseById = useCallback((id) => courses.find(c => c.id === id) || courses[0] || null, [courses]);

  /* ---------- account-backed identity ---------- */
  const userName = account?.name || "Student";
  const setUserName = useCallback((v) => updateAccount({ name: v }), [updateAccount]);

  const usage = useMemo(() => ({
    assignments: assignments.length, notes: notes.length, courses: courses.length,
    calendars: calendars.length, events: events.length, library: library.length,
  }), [assignments, notes, courses, calendars, events, library]);

  const value = {
    courses, assignments, attachments, notes, schedule, calendars, events, library,
    userName, setUserName, workspaceName, setWorkspaceName,
    updateAssignment, addAssignment, removeAssignment,
    updateCourse, addCourse, removeCourse,
    updateNote, addNote, removeNote,
    setAssignmentAttachments,
    addClass, updateClass, removeClass, copyFromTerm,
    addCalendar, updateCalendar, removeCalendar,
    addEvent, updateEvent, removeEvent,
    addLibraryFile, updateLibraryFile, removeLibraryFile,
    courseById,
    terms, setTerms,
    limits, usage, limitNotice, clearLimitNotice,
    dirty, setDirty, reloadProfile,
  };
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
};

const useStore = () => useContext(StoreCtx);

/* ============================================================
   Edit mode
   ============================================================ */
const EditCtx = createContext({ editMode: false, setEditMode: () => {} });

const EditProvider = ({ children }) => {
  const [editMode, setEditMode] = useState(false);
  useEffect(() => {
    document.documentElement.setAttribute("data-edit", editMode ? "on" : "off");
  }, [editMode]);
  return <EditCtx.Provider value={{ editMode, setEditMode }}>{children}</EditCtx.Provider>;
};
const useEdit = () => useContext(EditCtx);

/* ============================================================
   <Editable> — inline text editor (unchanged behaviour).
   ============================================================ */
const Editable = ({ value, onChange, as: Tag = "span", multiline = false, className = "", placeholder = "—", style }) => {
  const { editMode } = useEdit();
  const store = useContext(StoreCtx);
  const ref = useRef(null);
  const [editing, setEditing] = useState(false);

  const commit = () => {
    if (!ref.current) return;
    const next = (multiline ? ref.current.innerText : ref.current.textContent).trim();
    if (next !== (value || "")) onChange?.(next);
    setEditing(false);
    store?.setDirty?.(false);
  };
  const cancel = () => {
    if (ref.current) ref.current.textContent = value || "";
    setEditing(false);
    store?.setDirty?.(false);
    ref.current?.blur();
  };

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      const r = document.createRange(); r.selectNodeContents(ref.current); r.collapse(false);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    }
  }, [editing]);

  if (!editMode) {
    return <Tag className={className} style={style}>{value || <span style={{ color: "var(--fg-tertiary)" }}>{placeholder}</span>}</Tag>;
  }

  return (
    <Tag
      ref={ref}
      className={"editable" + (editing ? " editing" : "") + (className ? " " + className : "")}
      style={style}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onFocus={() => { setEditing(true); store?.setDirty?.(true); }}
      onClick={(e) => e.stopPropagation()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !multiline) { e.preventDefault(); commit(); ref.current?.blur(); }
        if (e.key === "Escape") { e.preventDefault(); cancel(); }
      }}
    >
      {value || ""}
    </Tag>
  );
};

const EditableSelect = ({ value, options, onChange, render, className = "", title }) => {
  const { editMode } = useEdit();
  if (!editMode) {
    const opt = options.find(o => o.value === value);
    return render ? render(opt) : <span className={className}>{opt ? opt.label : value}</span>;
  }
  return (
    <select
      className={"editable-select " + className}
      value={value}
      title={title}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
};

const EditableDateTime = ({ value, onChange, render, className = "" }) => {
  const { editMode } = useEdit();
  if (!editMode) return render(value);
  const d = new Date(value);
  const base = isNaN(d.getTime()) ? new Date() : d;   // never derive from an Invalid Date
  const pad = (n) => String(n).padStart(2, "0");
  const dateStr = base.getFullYear() + "-" + pad(base.getMonth()+1) + "-" + pad(base.getDate());
  const timeStr = pad(base.getHours()) + ":" + pad(base.getMinutes());
  // Store the naive wall-clock string directly (no UTC conversion). Guard the
  // native pickers' transient empty values so editing one part can't blank the
  // other and corrupt the date.
  const setPart = (datePart, timePart) => {
    const dp = datePart || dateStr;
    const tp = (timePart && /^\d{2}:\d{2}/.test(timePart)) ? timePart.slice(0, 5) : timeStr;
    onChange(dp + "T" + tp);
  };
  return (
    <span className={"editable-datetime " + className} onClick={(e) => e.stopPropagation()}>
      <input type="date" value={dateStr} onChange={(e) => setPart(e.target.value, timeStr)} />
      <input type="time" value={timeStr} onChange={(e) => setPart(dateStr, e.target.value)} />
    </span>
  );
};

const EditableNumber = ({ value, onChange, suffix = "", min, max, className = "", style }) => {
  const { editMode } = useEdit();
  if (!editMode) return <span className={className} style={style}>{value}{suffix}</span>;
  return (
    <span className={"editable-number " + className} style={style} onClick={(e) => e.stopPropagation()}>
      <input
        type="number" value={value} min={min} max={max}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {suffix && <span style={{ color: "var(--fg-tertiary)" }}>{suffix}</span>}
    </span>
  );
};

window.Store = { StoreProvider, useStore, EditProvider, useEdit, Editable, EditableSelect, EditableDateTime, EditableNumber };
