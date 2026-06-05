/* global React, Icon */

/* ============================================================
   Dashboard / Courses / Calendar / Notes / Grades views
   ============================================================ */
const { useState, useMemo, useEffect, useRef } = React;

/* -------------------- DASHBOARD -------------------- */
const Dashboard = ({ onOpen, onNavigate, onQuickAdd }) => {
  const { useStore, Editable } = window.Store;
  const { assignments: ASSIGNMENTS, courses: COURSES, courseById, userName, setUserName, workspaceName, schedule, events } = useStore();
  const { fmt, StatusBadge, Priority, Progress, Badge } = window.UI;
  const { prefs } = window.Auth.useAuth();

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";
  const dateLabel = now.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const upcoming = ASSIGNMENTS
    .filter(a => new Date(a.due) >= now && a.status !== "graded")
    .sort((a, b) => new Date(a.due) - new Date(b.due))
    .slice(0, 6);

  const open = (a) => a.status !== "graded" && a.status !== "submitted";
  const within = (a, ms) => { const diff = new Date(a.due) - now; return diff >= 0 && diff <= ms; };
  const dueThisWeek = ASSIGNMENTS.filter(a => open(a) && within(a, 7 * 864e5)).length;
  const within48 = ASSIGNMENTS.filter(a => open(a) && within(a, 2 * 864e5)).length;
  const inProgressList = ASSIGNMENTS.filter(a => a.status === "in_progress");
  const inProgress = inProgressList.length;
  const inProgressCourses = new Set(inProgressList.map(a => a.course)).size;
  const overdue = ASSIGNMENTS.filter(a => open(a) && new Date(a.due) < now).length;
  const gradedCount = ASSIGNMENTS.filter(a => a.status === "graded").length;

  /* ---- in-app digest (replaces the old email digest) ---- */
  const digestOn = prefs?.digest !== "off";
  const digestKind = prefs?.digest === "evening" ? "Evening" : "Morning";
  const todayIdx = (now.getDay() + 6) % 7;
  const todayStr = isoDate(now);
  const todaysClasses = (schedule || []).filter(s => s.day === todayIdx).sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  const todaysEvents = (events || []).filter(e => e.date === todayStr);
  const overdueList = ASSIGNMENTS.filter(a => open(a) && new Date(a.due) < now).sort((a, b) => new Date(a.due) - new Date(b.due));
  const dueTodayList = ASSIGNMENTS.filter(a => open(a) && isoDate(new Date(a.due)) === todayStr && new Date(a.due) >= now);
  const attention = [...overdueList, ...dueTodayList].slice(0, 4);
  const sep = (arr) => arr.reduce((acc, el, i) => i === 0 ? [el] : [...acc, <span key={"s" + i} style={{ color: "var(--fg-tertiary)" }}> · </span>, el], []);
  const DigestItem = ({ a, tone }) => (
    <button onClick={() => onOpen(a.id)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", background: "transparent", padding: "5px 0", fontSize: 13, cursor: "pointer" }}>
      <span className="dot" style={{ background: courseById(a.course)?.color || "var(--accent)" }} />
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</span>
      <span style={{ fontSize: 11, color: tone, whiteSpace: "nowrap" }}>{courseById(a.course)?.code} · {fmt.daysUntil(a.due).label}</span>
    </button>
  );

  return (
    <>
      <div className="page-header">
        <div>
          <div className="breadcrumb">Workspace · {workspaceName}</div>
          <h1>{greeting}, <Editable value={(userName || "").split(" ")[0]} onChange={(v) => setUserName(v + " " + ((userName || "").split(" ")[1] || ""))} /></h1>
        </div>
        <div className="actions">
          <button className="btn btn-tertiary" onClick={() => onNavigate("calendar")}><Icon name="calendar" size={14} /> {dateLabel}</button>
          <button className="btn btn-primary" onClick={onQuickAdd}><Icon name="plus" size={14} /> Quick add</button>
        </div>
      </div>

      <div className="content">
        {digestOn && (
          <div className="panel" style={{ marginBottom: "var(--s-4)" }}>
            <div className="panel-h">
              <h2>{digestKind} digest · {now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</h2>
              <a href="#" onClick={(e) => { e.preventDefault(); onNavigate("assignments"); }} style={{ fontSize: 12 }}>View all →</a>
            </div>
            <div className="panel-b" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 13, color: "var(--fg-secondary)" }}>
                {sep([
                  ...(overdue > 0 ? [<span key="o" style={{ color: "var(--error)", fontWeight: 600 }}>{overdue} overdue</span>] : []),
                  <span key="w"><b>{dueThisWeek}</b> due this week</span>,
                  <span key="48"><b>{within48}</b> within 48h</span>,
                  <span key="g"><b>{gradedCount}</b> graded</span>,
                ])}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-tertiary)", marginBottom: 4 }}>Needs attention</div>
                  {attention.length === 0
                    ? <div style={{ fontSize: 13, color: "var(--fg-tertiary)" }}>Nothing overdue or due today — nice work.</div>
                    : attention.map(a => <DigestItem key={a.id} a={a} tone={new Date(a.due) < now ? "var(--error)" : "var(--warning)"} />)}
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-tertiary)", marginBottom: 4 }}>Today</div>
                  {todaysClasses.length === 0 && todaysEvents.length === 0
                    ? <div style={{ fontSize: 13, color: "var(--fg-tertiary)" }}>No classes or events scheduled today.</div>
                    : <>
                        {todaysClasses.map((s, i) => (
                          <div key={"c" + i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 13 }}>
                            <span className="dot" style={{ background: courseById(s.course)?.color || "var(--accent)" }} />
                            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
                            <span style={{ fontSize: 11, color: "var(--fg-tertiary)" }}>{s.start}{s.room ? " · " + s.room : ""}</span>
                          </div>
                        ))}
                        {todaysEvents.map(e => (
                          <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 13 }}>
                            <span className="dot" style={{ background: "var(--accent)" }} />
                            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</span>
                            <span style={{ fontSize: 11, color: "var(--fg-tertiary)" }}>{e.start}</span>
                          </div>
                        ))}
                      </>}
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="dash-row">
          <div className="stat">
            <span className="stat-label">Due this week</span>
            <span className="stat-value">{dueThisWeek}</span>
            <span className={"stat-delta" + (within48 > 0 ? " neg" : "")}>{within48 > 0 ? <><Icon name="circle-warn" size={12} /> {within48} within 48 hours</> : "Nothing within 48 hours"}</span>
          </div>
          <div className="stat">
            <span className="stat-label">In progress</span>
            <span className="stat-value">{inProgress}</span>
            <span className="stat-delta">{inProgressCourses > 0 ? "across " + inProgressCourses + " subject" + (inProgressCourses === 1 ? "" : "s") : "none started"}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Overdue</span>
            <span className="stat-value">{overdue}</span>
            <span className={"stat-delta" + (overdue > 0 ? " neg" : " pos")}>{overdue > 0 ? <><Icon name="circle-warn" size={12} /> needs attention</> : <><Icon name="check" size={12} /> none overdue</>}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Graded</span>
            <span className="stat-value">{gradedCount}</span>
            <span className="stat-delta">of {ASSIGNMENTS.length} this term</span>
          </div>
        </div>

        <div className="dash-grid">
          {/* Upcoming */}
          <div className="panel">
            <div className="panel-h">
              <h2>Upcoming deadlines</h2>
              <a href="#" onClick={(e) => { e.preventDefault(); onNavigate("assignments"); }} style={{ fontSize: 12 }}>View all assignments →</a>
            </div>
            <table className="data">
              <colgroup>
                <col />
                <col style={{ width: 110 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 80 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Assignment</th>
                  <th>Course</th>
                  <th>Due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map(a => {
                  const c = courseById(a.course);
                  const done = a.status === "graded" || a.status === "submitted";
                  // Show the draft milestone as the next deadline while it's still
                  // ahead AND hasn't been submitted yet. Otherwise fall back to
                  // the final due date.
                  const useDraft = a.draftDue && !a.draftSubmittedAt && new Date(a.draftDue) >= now;
                  const dueIso = useDraft ? a.draftDue : a.due;
                  const du = fmt.daysUntil(dueIso, done);
                  return (
                    <tr key={a.id} onClick={() => onOpen(a.id)}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{a.title}</div>
                        <div style={{ fontSize: 11, color: "var(--fg-tertiary)" }}>
                          {a.type} · {a.weight}% weight
                        </div>
                      </td>
                      <td>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                          <span className="dot" style={{ background: c.color }} />
                          {c.code}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontVariantNumeric: "tabular-nums" }}>{fmt.dateLong(dueIso)}{useDraft && <span style={{ color: "var(--fg-tertiary)" }} title="Draft due date"> (D)</span>}</div>
                        {du.label && (
                          <div style={{ fontSize: 11, color: du.tone === "error" ? "var(--error)" : du.tone === "warning" ? "var(--warning)" : "var(--fg-tertiary)" }}>
                            {du.label}
                          </div>
                        )}
                      </td>
                      <td><StatusBadge status={a.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
            <div className="panel">
              <div className="panel-h">
                <h2>Subject progress</h2>
                <span className="panel-sub">{COURSES.length} subject{COURSES.length === 1 ? "" : "s"}</span>
              </div>
              <div className="panel-b" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {COURSES.length === 0 && <div style={{ fontSize: 13, color: "var(--fg-tertiary)" }}>Add the subjects you take to track progress here.</div>}
                {COURSES.map(c => {
                  const total = ASSIGNMENTS.filter(a => a.course === c.id).length;
                  const done = ASSIGNMENTS.filter(a => a.course === c.id && (a.status === "graded" || a.status === "submitted")).length;
                  const pct = total ? Math.round((done / total) * 100) : 0;
                  return (
                    <div key={c.id}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                          <span className="dot" style={{ background: c.color }} />
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{c.code}</span>
                        </div>
                        <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", color: "var(--fg-secondary)" }}>
                          {done}/{total} · {pct}%
                        </span>
                      </div>
                      <Progress value={pct} />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="panel">
              <div className="panel-h">
                <h2>Recently graded</h2>
              </div>
              <div className="panel-b" style={{ padding: 0 }}>
                {(() => {
                  const graded = ASSIGNMENTS.filter(a => a.status === "graded" && a.earned != null)
                    .sort((a, b) => new Date(b.due) - new Date(a.due)).slice(0, 5);
                  if (graded.length === 0) return <div style={{ padding: "12px 16px", fontSize: 12, color: "var(--fg-tertiary)" }}>Grades will appear here once your work is marked.</div>;
                  return graded.map((a, i) => {
                    const c = courseById(a.course);
                    const pct = a.points ? Math.round((a.earned / a.points) * 100) : 0;
                    return (
                      <div key={a.id} onClick={() => onOpen(a.id)} style={{ display: "flex", gap: 12, padding: "10px 16px", borderTop: i === 0 ? "none" : "1px solid var(--bd-subtle)", fontSize: 13, cursor: "pointer" }}>
                        <span style={{ width: 6, height: 6, marginTop: 7, borderRadius: 3, background: c?.color || "var(--fg-tertiary)", flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</div>
                          <div style={{ fontSize: 11, color: "var(--fg-tertiary)", marginTop: 2 }}>{c?.code} · {a.earned}/{a.points} · {pct}%</div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

/* -------------------- COURSES -------------------- */
/* A small single-field dialog — replaces window.prompt(), which Electron disables. */
const PromptModal = ({ title, label, placeholder, defaultValue = "", submitLabel = "Add", onSubmit, onClose }) => {
  const [val, setVal] = useState(defaultValue);
  useEffect(() => { const h = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  const submit = () => { const v = val.trim(); if (!v) return; onSubmit(v); onClose(); };
  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 420 }}>
        <div className="modal-h"><h2>{title}</h2><button className="iconbtn" onClick={onClose} aria-label="Close"><Icon name="close" /></button></div>
        <div className="modal-b"><div className="field"><label>{label}</label>
          <input className="input" autoFocus value={val} placeholder={placeholder} onChange={e => setVal(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submit(); }} /></div></div>
        <div className="modal-f"><button className="btn btn-tertiary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={!val.trim()}>{submitLabel}</button></div>
      </div>
    </div>
  );
};

const SUBJECT_COLORS = ["#2E5AAC", "#7A4FAA", "#A8551A", "#2F7A4D", "#2E6B7A", "#9F6A11", "#B23A48", "#4B5563"];
const AddSubjectModal = ({ onAdd, onClose }) => {
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [color, setColor] = useState(SUBJECT_COLORS[0]);
  useEffect(() => { const h = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  const submit = () => { const c = code.trim(); if (!c) return; onAdd({ code: c, title: (title || c).trim(), color }); onClose(); };
  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 440 }}>
        <div className="modal-h"><h2>Add subject</h2><button className="iconbtn" onClick={onClose} aria-label="Close"><Icon name="close" /></button></div>
        <div className="modal-b" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="field"><label>Subject</label><input className="input" autoFocus value={code} placeholder="e.g. Chemistry" onChange={e => setCode(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submit(); }} /></div>
          <div className="field"><label>Full name (optional)</label><input className="input" value={title} placeholder="e.g. Chemistry (General)" onChange={e => setTitle(e.target.value)} /></div>
          <div className="field"><label>Colour</label>
            <div className="onboard-swatches">{SUBJECT_COLORS.map(col => <button key={col} type="button" className={"onboard-swatch" + (color === col ? " active" : "")} style={{ background: col }} onClick={() => setColor(col)} aria-label={"colour " + col} />)}</div>
          </div>
        </div>
        <div className="modal-f"><button className="btn btn-tertiary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={!code.trim()}>Add subject</button></div>
      </div>
    </div>
  );
};

const CoursesView = ({ onNavigate, pushToast }) => {
  const { useStore, Editable } = window.Store;
  const { courses: COURSES, updateCourse, addCourse, removeCourse, workspaceName } = useStore();

  const [addOpen, setAddOpen] = useState(false);
  const handleAdd = (row) => {
    const created = addCourse(row);
    if (created) { pushToast?.({ tone: "success", title: "Subject added", body: "Open it to edit details, then turn on Edit mode." }); onNavigate("course:" + created.id); }
  };

  return (
    <>
      {addOpen && <AddSubjectModal onAdd={handleAdd} onClose={() => setAddOpen(false)} />}
      <div className="page-header">
        <div>
          <div className="breadcrumb">Workspace · {workspaceName}</div>
          <h1>Subjects</h1>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => setAddOpen(true)}><Icon name="plus" size={14} /> Add subject</button>
        </div>
      </div>

      <div className="content">
        {COURSES.length === 0 && (
          <div className="empty" style={{ background: "var(--bg-surface)", border: "1px solid var(--bd-default)", borderRadius: 6, padding: "var(--s-10)" }}>
            <div className="empty-icon"><Icon name="courses" /></div>
            <h3>No subjects in this term</h3>
            <p>Add the subjects you're enrolled in for {workspaceName}. Assignments, notes and grades all hang off these.</p>
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setAddOpen(true)}><Icon name="plus" size={14} /> Add your first subject</button>
          </div>
        )}
        <div className="course-grid">
          {COURSES.map(c => (
            <div className="course-card" key={c.id} role="button" tabIndex={0} onClick={() => onNavigate("course:" + c.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate("course:" + c.id); } }}>
              <div className="cc-top">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="cc-code"><span className="dot" style={{ background: c.color, marginRight: 6 }} /><Editable value={c.code} onChange={(v) => updateCourse(c.id, { code: v })} /></div>
                  <div className="cc-title"><Editable value={c.title} onChange={(v) => updateCourse(c.id, { title: v })} /></div>
                </div>
                <button className="iconbtn" style={{ width: 22, height: 22 }} aria-label="Remove subject" title="Remove subject"
                  onClick={(e) => { e.stopPropagation(); if (confirm("Remove " + c.code + " from this term?")) { removeCourse(c.id); pushToast?.({ tone: "warning", title: "Subject removed" }); } }}>
                  <Icon name="trash" size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

/* -------------------- CALENDAR (functional) -------------------- */
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pad2 = (n) => String(n).padStart(2, "0");
const isoDate = (d) => d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
const mondayOf = (date) => { const d = new Date(date); const off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off); d.setHours(0,0,0,0); return d; };
const addDays = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d; };
const hourOf = (t) => parseInt((t || "0").split(":")[0], 10);

const CalEditor = ({ mode, data, onClose, pushToast }) => {
  const { useStore } = window.Store;
  const { courses, calendars, addClass, updateClass, removeClass, addEvent, updateEvent, removeEvent } = useStore();
  const isEdit = !!data?.id;
  const [form, setForm] = useState(() => mode === "class"
    ? { day: data?.day ?? 0, start: data?.start || "09:00", end: data?.end || "10:00", title: data?.title || "", course: data?.course || courses[0]?.id || "", kind: data?.kind || "lecture", room: data?.room || "" }
    : { date: data?.date || isoDate(new Date()), start: data?.start || "12:00", end: data?.end || "13:00", title: data?.title || "", calendarId: data?.calendarId || calendars[0]?.id, course: data?.course || "", notes: data?.notes || "" }
  );
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const save = () => {
    if (mode === "class") {
      if (isEdit) updateClass(data.id, form); else addClass(form);
    } else {
      if (isEdit) updateEvent(data.id, form); else addEvent(form);
    }
    pushToast?.({ tone: "success", title: isEdit ? "Saved" : (mode === "class" ? "Class added" : "Event added") });
    onClose();
  };
  const del = () => {
    if (mode === "class") removeClass(data.id); else removeEvent(data.id);
    pushToast?.({ tone: "warning", title: mode === "class" ? "Class removed" : "Event removed" });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 460 }}>
        <div className="modal-h">
          <h2>{isEdit ? "Edit " : "New "}{mode === "class" ? "class" : "event"}</h2>
          <button className="iconbtn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <div className="modal-b" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="field"><label>Title</label>
            <input className="input" autoFocus value={form.title} onChange={e => set("title", e.target.value)} placeholder={mode === "class" ? "Chemistry — Lecture" : "Study session"} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {mode === "class" ? (
              <div className="field"><label>Day</label>
                <select className="select" value={form.day} onChange={e => set("day", Number(e.target.value))}>
                  {DOW.map((d, i) => <option key={d} value={i}>{["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][i]}</option>)}
                </select>
              </div>
            ) : (
              <div className="field"><label>Date</label>
                <input className="input" type="date" value={form.date} onChange={e => set("date", e.target.value)} />
              </div>
            )}
            {mode === "class" ? (
              <div className="field"><label>Kind</label>
                <select className="select" value={form.kind} onChange={e => set("kind", e.target.value)}>
                  <option value="lecture">Lecture</option><option value="lab">Lab / Practical</option>
                  <option value="study">Study block</option><option value="office">Office hours</option>
                </select>
              </div>
            ) : (
              <div className="field"><label>Calendar</label>
                <select className="select" value={form.calendarId} onChange={e => set("calendarId", e.target.value)}>
                  {calendars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div className="field"><label>Start</label><input className="input" type="time" value={form.start} onChange={e => set("start", e.target.value)} /></div>
            <div className="field"><label>End</label><input className="input" type="time" value={form.end} onChange={e => set("end", e.target.value)} /></div>
            <div className="field"><label>Subject {mode === "event" && "(optional)"}</label>
              <select className="select" value={form.course} onChange={e => set("course", e.target.value)}>
                {mode === "event" && <option value="">— none —</option>}
                {courses.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
              </select>
            </div>
            {mode === "class" && <div className="field"><label>Room</label><input className="input" value={form.room} onChange={e => set("room", e.target.value)} placeholder="Lab S2-04" /></div>}
          </div>
          {mode === "event" && <div className="field"><label>Notes</label><textarea className="textarea" value={form.notes} onChange={e => set("notes", e.target.value)} /></div>}
        </div>
        <div className="modal-f">
          {isEdit && <button className="btn btn-tertiary" style={{ color: "var(--error)", marginRight: "auto" }} onClick={del}><Icon name="trash" size={14} /> Delete</button>}
          <button className="btn btn-tertiary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>{isEdit ? "Save" : "Add"}</button>
        </div>
      </div>
    </div>
  );
};

const CalendarView = ({ pushToast }) => {
  const { useStore } = window.Store;
  const { assignments, schedule, events, calendars, courseById, workspaceName, addCalendar, removeCalendar } = useStore();

  const [viewMode, setViewMode] = useState("week");
  const [cursor, setCursor] = useState(() => new Date());
  const [editor, setEditor] = useState(null); // { mode, data }
  const [schedOpen, setSchedOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [hidden, setHidden] = useState({}); // calendarId -> true (hidden)
  const today = new Date(); const todayStr = isoDate(today);

  const calColor = (id) => calendars.find(c => c.id === id)?.color || "#2E5AAC";
  const courseColor = (cid) => courseById(cid)?.color || "#2E5AAC";

  // Build normalized items for a given column date
  const itemsForDate = (date) => {
    const dStr = isoDate(date);
    const dayIdx = (date.getDay() + 6) % 7;
    const out = [];
    schedule.forEach((s, i) => {
      if (s.day === dayIdx) out.push({ key: "cl" + (s.id || i), kind: "class", title: s.title, start: s.start, end: s.end, color: courseColor(s.course), sub: courseById(s.course)?.code, ref: { ...s, id: s.id || "i" + i } });
    });
    events.forEach(e => {
      if (e.date === dStr && !hidden[e.calendarId]) out.push({ key: "ev" + e.id, kind: "event", title: e.title, start: e.start, end: e.end, color: calColor(e.calendarId), sub: calendars.find(c => c.id === e.calendarId)?.name, ref: e });
    });
    if (!hidden["cal-due"]) assignments.forEach(a => {
      if (isoDate(new Date(a.due)) === dStr) {
        const t = new Date(a.due); out.push({ key: "due" + a.id, kind: "due", title: a.title + " — due", start: pad2(t.getHours()) + ":" + pad2(t.getMinutes()), end: null, color: "#A8551A", sub: courseById(a.course)?.code });
      }
      if (a.draftDue && !a.draftSubmittedAt && isoDate(new Date(a.draftDue)) === dStr) {
        const t = new Date(a.draftDue); out.push({ key: "draft" + a.id, kind: "due", title: a.title + " — draft due", start: pad2(t.getHours()) + ":" + pad2(t.getMinutes()), end: null, color: "#7A4FAA", sub: courseById(a.course)?.code });
      }
    });
    return out;
  };

  const move = (dir) => setCursor(c => viewMode === "month" ? new Date(c.getFullYear(), c.getMonth() + dir, 1) : addDays(c, (viewMode === "day" ? 1 : 7) * dir));
  const goToday = () => setCursor(new Date());

  const START_H = 5, END_H = 23, HOUR_H = 56;            // 56px per hour row, 24h labels
  const hours = Array.from({ length: END_H - START_H }, (_, i) => i + START_H); // 5–22
  const HOURS_COUNT = hours.length;
  const columns = viewMode === "day" ? [new Date(cursor)] : Array.from({ length: 7 }, (_, i) => addDays(mondayOf(cursor), i));

  // Minutes from the top of the visible day (07:00). Used to position events
  // by their actual start/end times instead of bucketing them into hour cells.
  const minsFromStart = (t) => {
    if (!t) return 0;
    const [hh, mm] = String(t).split(":");
    return (parseInt(hh, 10) - START_H) * 60 + (parseInt(mm || "0", 10) || 0);
  };
  const clampMins = (m) => Math.max(0, Math.min(HOURS_COUNT * 60, m));

  // Lane allocation: cluster items that overlap in time, then divide width
  // evenly across the lanes inside each cluster so simultaneous classes
  // sit side-by-side instead of stacking on top of each other.
  const layoutColumn = (items) => {
    const span = (it) => {
      const s = clampMins(minsFromStart(it.start));
      const eRaw = it.end ? minsFromStart(it.end) : s + 25;     // due markers get a fixed 25min footprint for layout
      const e = clampMins(Math.max(eRaw, s + 18));              // floor at ~18min so tiny events still get a clickable strip
      return { s, e };
    };
    const sorted = items.map(it => ({ it, ...span(it) })).sort((a, b) => a.s - b.s || a.e - b.e);
    const out = [];
    let cluster = [], clusterEnd = -1;
    const flush = () => {
      if (!cluster.length) return;
      const laneEnd = []; // lane index -> end minute of last item in that lane
      cluster.forEach(x => {
        let lane = laneEnd.findIndex(end => end <= x.s);
        if (lane === -1) { lane = laneEnd.length; laneEnd.push(0); }
        laneEnd[lane] = x.e; x.lane = lane;
      });
      const lanes = laneEnd.length;
      cluster.forEach(x => out.push({ ...x, lanes }));
      cluster = [];
    };
    sorted.forEach(x => {
      if (x.s >= clusterEnd) flush();
      cluster.push(x);
      if (x.e > clusterEnd) clusterEnd = x.e;
    });
    flush();
    return out;
  };

  const rangeLabel = viewMode === "month"
    ? cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : viewMode === "day"
      ? cursor.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
      : (() => { const s = mondayOf(cursor), e = addDays(s, 6); return s.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + " – " + e.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); })();

  // Click on empty space in a day column → open the New event modal pre-filled
  // with the time the user clicked on, snapped to the nearest 15 min.
  const onColClick = (e, d) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const minsRaw = (y / HOUR_H) * 60;
    const snapped = Math.max(0, Math.min((HOURS_COUNT - 1) * 60, Math.floor(minsRaw / 15) * 15));
    const hh = START_H + Math.floor(snapped / 60);
    const mm = snapped % 60;
    setEditor({ mode: "event", data: { date: isoDate(d), start: pad2(hh) + ":" + pad2(mm), end: pad2(hh + 1) + ":" + pad2(mm) } });
  };

  const renderHourGrid = () => (
    <div className={"cal cal-precise" + (viewMode === "day" ? " day" : "")}
         style={{ gridTemplateColumns: viewMode === "day" ? "56px 1fr" : "56px repeat(7, 1fr)" }}>
      <div className="cal-h corner" />
      {columns.map((d, i) => (
        <div key={i} className={"cal-h" + (isoDate(d) === todayStr ? " today" : "")}>
          <div>{DOW[(d.getDay() + 6) % 7]}</div>
          <div className="dnum">{d.getDate()}</div>
        </div>
      ))}

      <div className="cal-gutter" style={{ height: HOURS_COUNT * HOUR_H }}>
        {hours.map(h => <div key={h} className="cal-hour-label" style={{ height: HOUR_H }}>{pad2(h)}:00</div>)}
      </div>

      {columns.map((d, di) => {
        const placed = layoutColumn(itemsForDate(d));
        return (
          <div key={di} className="cal-col" style={{ height: HOURS_COUNT * HOUR_H }} onClick={(e) => onColClick(e, d)}>
            {hours.map(h => <div key={h} className="cal-row-line" style={{ top: (h - START_H + 1) * HOUR_H }} />)}
            {placed.map(({ it, s, e, lane, lanes }) => {
              const top = s * (HOUR_H / 60);
              const height = it.end ? Math.max(20, (e - s) * (HOUR_H / 60) - 2) : 22;
              const widthPct = 100 / lanes;
              const leftPct = lane * widthPct;
              return (
                <div
                  key={it.key}
                  className={"cal-event abs" + (it.kind === "due" ? " warning" : "")}
                  style={{
                    top, height,
                    left: `calc(${leftPct}% + 2px)`,
                    width: `calc(${widthPct}% - 4px)`,
                    ...(it.kind !== "due" ? { borderLeftColor: it.color, background: it.color + "1A" } : {}),
                    cursor: it.kind === "class" || it.kind === "event" ? "pointer" : "default",
                  }}
                  onClick={(ev) => { ev.stopPropagation(); if (it.kind === "class") setEditor({ mode: "class", data: it.ref }); else if (it.kind === "event") setEditor({ mode: "event", data: it.ref }); }}
                  title={it.title + " · " + it.start + (it.end ? "–" + it.end : "")}
                >
                  <div className="ev-title">{it.title}</div>
                  <div className="ev-time">{it.start}{it.end ? "–" + it.end : ""}{it.sub ? " · " + it.sub : ""}</div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  const renderMonth = () => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = mondayOf(first);
    const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
    return (
      <div className="cal-month">
        {DOW.map(d => <div key={d} className="cm-dow">{d}</div>)}
        {cells.map((d, i) => {
          const items = itemsForDate(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          return (
            <div key={i} className={"cm-cell" + (inMonth ? "" : " out") + (isoDate(d) === todayStr ? " today" : "")}
              onClick={() => { setCursor(new Date(d)); setViewMode("day"); }}>
              <div className="cm-num">{d.getDate()}</div>
              <div className="cm-items">
                {items.slice(0, 3).map(it => (
                  <div key={it.key} className="cm-item" style={{ background: it.color + "22", borderLeft: "2px solid " + it.color }}>{it.title}</div>
                ))}
                {items.length > 3 && <div className="cm-more">+{items.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="breadcrumb">Workspace · {workspaceName}</div>
          <h1>Calendar</h1>
        </div>
        <div className="actions">
          <div className="segmented">
            {["day", "week", "month"].map(m => (
              <button key={m} className={viewMode === m ? "active" : ""} onClick={() => setViewMode(m)} style={{ textTransform: "capitalize" }}>{m}</button>
            ))}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => move(-1)} aria-label="Previous"><Icon name="chevron-left" size={12} /></button>
          <button className="btn btn-secondary" onClick={goToday}>Today</button>
          <button className="btn btn-secondary btn-sm" onClick={() => move(1)} aria-label="Next"><Icon name="chevron-right" size={12} /></button>
          <button className="btn btn-secondary" onClick={() => setSchedOpen(true)}><Icon name="clock" size={14} /> Weekly schedule</button>
          {window.GoogleConnector?.CalendarPush && <window.GoogleConnector.CalendarPush pushToast={pushToast} />}
          <button className="btn btn-secondary" onClick={() => setEditor({ mode: "class", data: null })}><Icon name="plus" size={14} /> Class</button>
          <button className="btn btn-primary" onClick={() => setEditor({ mode: "event", data: { date: isoDate(cursor) } })}><Icon name="plus" size={14} /> Event</button>
        </div>
      </div>

      <div className="cal-legend">
        <span className="cal-range">{rangeLabel}</span>
        <span style={{ flex: 1 }} />
        {calendars.map(c => (
          <button key={c.id} className={"cal-chip" + (hidden[c.id] ? " off" : "")} onClick={() => setHidden(h => ({ ...h, [c.id]: !h[c.id] }))} title={hidden[c.id] ? "Show" : "Hide"}>
            <span className="dot" style={{ background: c.color }} /> {c.name}
          </button>
        ))}
        <button className="cal-chip" onClick={() => setCalOpen(true)} title="Add calendar"><Icon name="plus" size={11} /> Calendar</button>
      </div>

      <div className="content">
        {viewMode === "month" ? renderMonth() : renderHourGrid()}
      </div>

      {schedOpen && <WeeklyScheduleModal onClose={() => setSchedOpen(false)} onEdit={(e) => setEditor(e)} pushToast={pushToast} />}
      {calOpen && <PromptModal title="New calendar" label="Calendar name" placeholder="e.g. Exams, Personal" submitLabel="Create" onSubmit={(n) => { addCalendar({ name: n }); pushToast?.({ tone: "success", title: "Calendar added", body: n }); }} onClose={() => setCalOpen(false)} />}
      {editor && <CalEditor mode={editor.mode} data={editor.data} onClose={() => setEditor(null)} pushToast={pushToast} />}
    </>
  );
};

/* -------------------- NOTES -------------------- */
const NotesView = ({ pushToast }) => {
  const { useStore, Editable, EditableSelect, useEdit } = window.Store;
  const { notes: NOTES, courses, courseById, updateNote, addNote, removeNote, workspaceName, setDirty } = useStore();
  const { fmt } = window.UI;
  const { editMode, setEditMode } = useEdit();
  const [activeId, setActiveId] = useState(NOTES[0]?.id || null);
  const [query, setQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [courseMenuOpen, setCourseMenuOpen] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [bodyDraft, setBodyDraft] = useState("");
  const [noteDirty, setNoteDirty] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const menuRef = useRef(null);
  const courseMenuRef = useRef(null);
  const saveTimer = useRef(null);

  useEffect(() => {
    if (!courseMenuOpen && !actionMenuOpen) return;
    const h = (e) => {
      if (courseMenuRef.current && !courseMenuRef.current.contains(e.target)) setCourseMenuOpen(false);
      if (menuRef.current && !menuRef.current.contains(e.target)) setActionMenuOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [courseMenuOpen, actionMenuOpen]);

  const filtered = useMemo(() => {
    let rows = NOTES.slice();
    if (courseFilter !== "all") rows = rows.filter(n => n.course === courseFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter(n =>
        n.title.toLowerCase().includes(q) ||
        (typeof n.body === "string" ? n.body : (n.body || []).join(" ")).toLowerCase().includes(q)
      );
    }
    return rows;
  }, [NOTES, query, courseFilter]);

  const active = filtered.find(n => n.id === activeId) || filtered[0] || NOTES[0] || null;
  const c = active ? courseById(active.course) : null;
  const snippetOf = (n) => {
    const body = typeof n.body === "string" ? n.body : (n.body || []).join(" ");
    return body.replace(/\s+/g, " ").slice(0, 140);
  };
  const bodyString = (n) => n ? (typeof n.body === "string" ? n.body : (n.body || []).join("\n\n")) : "";

  // Sync the editable draft when the selected note changes
  useEffect(() => {
    setBodyDraft(bodyString(active));
    setNoteDirty(false); setSavedOnce(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, [active?.id]);

  const saveBody = () => {
    if (!active) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    updateNote(active.id, { body: bodyDraft });
    setNoteDirty(false); setSavedOnce(true); setDirty?.(false);
  };
  const onBodyChange = (v) => {
    setBodyDraft(v);
    setNoteDirty(true); setSavedOnce(false); setDirty?.(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {           // debounced autosave
      if (active) { updateNote(active.id, { body: v }); setNoteDirty(false); setSavedOnce(true); setDirty?.(false); }
    }, 1200);
  };

  if (!active) {
    return (
      <>
        <div className="page-header">
          <div><div className="breadcrumb">Workspace · {workspaceName}</div><h1>Notes</h1></div>
          <div className="actions">
            <button className="btn btn-primary" onClick={() => { const n = addNote({ course: courses[0]?.id }); if (n) { setActiveId(n.id); setEditMode(true); } }}><Icon name="plus" size={14} /> New note</button>
          </div>
        </div>
        <div className="content">
          <div className="empty" style={{ background: "var(--bg-surface)", border: "1px solid var(--bd-default)", borderRadius: 6, padding: "var(--s-10)" }}>
            <div className="empty-icon"><Icon name="notes" /></div>
            <h3>No notes in this term yet</h3>
            <p>Capture lecture summaries, essay scaffolds, and revision points. Notes are scoped to {workspaceName}.</p>
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => { const n = addNote({ course: courses[0]?.id }); if (n) { setActiveId(n.id); setEditMode(true); } }}><Icon name="plus" size={14} /> Create your first note</button>
          </div>
        </div>
      </>
    );
  }

  const onNewNote = () => {
    const seed = courseFilter === "all" ? "CHM" : courseFilter;
    const note = addNote({ course: seed });
    setActiveId(note.id);
    setEditMode(true);
    pushToast?.({ tone: "success", title: "Note created", body: "Edit mode is on — type a title and body." });
  };
  const onDelete = () => {
    if (!confirm("Delete this note? This cannot be undone.")) return;
    const next = filtered.find(n => n.id !== active.id) || NOTES.find(n => n.id !== active.id);
    removeNote(active.id);
    if (next) setActiveId(next.id);
    pushToast?.({ tone: "warning", title: "Note deleted", body: "\u201C" + active.title + "\u201D removed." });
    setActionMenuOpen(false);
  };
  const onDuplicate = () => {
    const note = addNote({ title: active.title + " (copy)", course: active.course,
      body: typeof active.body === "string" ? active.body : (active.body || []).join("\n\n") });
    setActiveId(note.id);
    pushToast?.({ tone: "success", title: "Note duplicated" });
    setActionMenuOpen(false);
  };

  const courseLabel = courseFilter === "all" ? "All subjects" : courseById(courseFilter)?.code;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="breadcrumb">Workspace · {workspaceName}</div>
          <h1>Notes</h1>
        </div>
        <div className="actions">
          <div className="searchbar" style={{ width: 240, height: 28 }}>
            <Icon name="search" size={13} />
            <input
              placeholder={"Search " + NOTES.length + " notes…"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button className="iconbtn" style={{ width: 22, height: 22 }} aria-label="Clear search" onClick={() => setQuery("")}>
                <Icon name="close" size={11} />
              </button>
            )}
          </div>
          <div style={{ position: "relative" }} ref={courseMenuRef}>
            <button className="btn btn-secondary" onClick={() => setCourseMenuOpen(o => !o)}>
              <Icon name="filter" size={14} /> {courseLabel} <Icon name="chevron-down" size={12} className="caret" />
            </button>
            {courseMenuOpen && (
              <div className="workspace-menu" style={{ width: 200, right: 0, left: "auto", top: "calc(100% + 4px)" }} role="listbox">
                <button
                  className={"workspace-menu-item" + (courseFilter === "all" ? " active" : "")}
                  onClick={() => { setCourseFilter("all"); setCourseMenuOpen(false); }}
                >
                  <span className="wm-term">All subjects</span>
                  <span className="wm-dates">{NOTES.length} notes</span>
                </button>
                {courses.map(co => {
                  const count = NOTES.filter(n => n.course === co.id).length;
                  return (
                    <button
                      key={co.id}
                      className={"workspace-menu-item" + (courseFilter === co.id ? " active" : "")}
                      onClick={() => { setCourseFilter(co.id); setCourseMenuOpen(false); }}
                    >
                      <span className="wm-term" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className="dot" style={{ background: co.color }} /> {co.code}
                      </span>
                      <span className="wm-dates">{count} note{count === 1 ? "" : "s"}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button className="btn btn-primary" onClick={onNewNote}><Icon name="plus" size={14} /> New note</button>
        </div>
      </div>

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "320px 1fr", overflow: "hidden" }}>
        <div className="notes-list">
          {filtered.length === 0 && (
            <div className="empty" style={{ padding: "var(--s-6) var(--s-4)" }}>
              <div className="empty-icon"><Icon name="search" /></div>
              <h3>No notes match</h3>
              <p>Try clearing the search or course filter, or start a new note.</p>
            </div>
          )}
          {filtered.map(n => {
            const nc = courseById(n.course);
            return (
              <div
                key={n.id}
                className={"note-row" + (n.id === active.id ? " active" : "")}
                onClick={() => setActiveId(n.id)}
              >
                <div className="nr-title">{n.title}</div>
                <div className="nr-snip">{snippetOf(n)}</div>
                <div className="nr-meta">
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <span className="dot" style={{ background: nc.color, width: 6, height: 6 }} />
                    {nc.code}
                  </span>
                  <span>·</span>
                  <span>{fmt.dateLong(n.updated)} {fmt.time(n.updated)}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="note-editor">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--fg-tertiary)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span className="dot" style={{ background: c.color, width: 6, height: 6 }} />
                <EditableSelect
                  value={active.course}
                  options={courses.map(o => ({ value: o.id, label: o.code + " · " + o.title }))}
                  onChange={(v) => updateNote(active.id, { course: v })}
                  render={() => <span>{c.code} · {c.title}</span>}
                />
              </div>
              <h2><Editable value={active.title} onChange={(v) => updateNote(active.id, { title: v })} /></h2>
            </div>
            <div style={{ display: "flex", gap: 4, position: "relative", alignItems: "center" }} ref={menuRef}>
              {editMode && (
                <button className="btn btn-primary btn-sm" onClick={saveBody} disabled={!noteDirty} style={{ marginRight: 4 }} title="Save (autosaves after a pause)">
                  <Icon name="check" size={13} /> {noteDirty ? "Save" : "Saved"}
                </button>
              )}
              <button
                className={"iconbtn" + (editMode ? " active" : "")}
                style={editMode ? { background: "var(--accent-soft)", color: "var(--accent)" } : undefined}
                aria-label={editMode ? "Stop editing" : "Edit"}
                title={editMode ? "Stop editing (Esc)" : "Edit this note"}
                onClick={() => { if (editMode && noteDirty) saveBody(); setEditMode(!editMode); }}
              ><Icon name="edit" /></button>
              <button
                className="iconbtn"
                aria-label="Attach file"
                title="Attach file"
                onClick={() => pushToast?.({ tone: "info", title: "Attach a file", body: "Drop a file here or use Upload from the toolbar." })}
              ><Icon name="paperclip" /></button>
              <button
                className="iconbtn"
                aria-label="Export"
                title="Export as Markdown"
                onClick={() => {
                  const body = typeof active.body === "string" ? active.body : (active.body || []).join("\n\n");
                  const blob = new Blob(["# " + active.title + "\n\n" + body], { type: "text/markdown" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url; a.download = active.title.replace(/[^a-z0-9 _-]/gi, "_") + ".md"; a.click();
                  URL.revokeObjectURL(url);
                  pushToast?.({ tone: "success", title: "Exported", body: a.download });
                }}
              ><Icon name="export" /></button>
              <button
                className="iconbtn"
                aria-label="More actions"
                title="More"
                onClick={() => setActionMenuOpen(o => !o)}
              ><Icon name="more" /></button>
              {actionMenuOpen && (
                <div className="workspace-menu" style={{ width: 200, right: 0, left: "auto", top: "calc(100% + 6px)" }}>
                  <button className="workspace-menu-item" onClick={onDuplicate}>
                    <span className="wm-term">Duplicate note</span>
                    <span className="wm-dates">Creates a copy in the same subject</span>
                  </button>
                  <button className="workspace-menu-item" onClick={() => { navigator.clipboard?.writeText(active.title + "\n\n" + (typeof active.body === "string" ? active.body : (active.body || []).join("\n\n"))); pushToast?.({ tone: "success", title: "Copied to clipboard" }); setActionMenuOpen(false); }}>
                    <span className="wm-term">Copy to clipboard</span>
                    <span className="wm-dates">Title + body as plain text</span>
                  </button>
                  <button className="workspace-menu-item" style={{ color: "var(--error)" }} onClick={onDelete}>
                    <span className="wm-term">Delete note</span>
                    <span className="wm-dates">Cannot be undone</span>
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="meta-row">
            <span>Updated {fmt.dateLong(active.updated)} at {fmt.time(active.updated)}</span>
            <span>·</span>
            <span>{(typeof active.body === "string" ? active.body : (active.body || []).join(" ")).split(/\s+/).filter(Boolean).length} words</span>
            {noteDirty && <><span>·</span><span style={{ color: "var(--warning)" }}>Unsaved</span></>}
            {!noteDirty && savedOnce && <><span>·</span><span style={{ color: "var(--success)" }}>Saved</span></>}
          </div>
          {editMode ? (
            <textarea
              className="note-textarea"
              value={bodyDraft}
              onChange={(e) => onBodyChange(e.target.value)}
              onBlur={saveBody}
              placeholder="Start writing… changes autosave, or hit Save."
            />
          ) : (
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
              {bodyString(active) || <span style={{ color: "var(--fg-tertiary)" }}>This note is empty. Click the pencil (or Ctrl E) to start writing.</span>}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

/* -------------------- GRADES -------------------- */
const GradesView = () => {
  const { useStore } = window.Store;
  const { courses: COURSES, assignments: ASSIGNMENTS, courseById, workspaceName } = useStore();
  const { fmt, Badge } = window.UI;

  const { classGrade } = window.SchoolworkData;
  const graded = ASSIGNMENTS.filter(a => a.status === "graded" && a.earned != null && a.points);
  // A subject's class grade comes from its summative IA/EA results (falling
  // back to any graded work when none are tagged yet).
  const courseGrade = (cid) => classGrade(ASSIGNMENTS.filter(a => a.course === cid));
  // Term average = the mean of each subject's class grade.
  const overallNum = useMemo(() => {
    const gs = COURSES.map(c => courseGrade(c.id)).filter(g => g != null);
    return gs.length ? gs.reduce((s, g) => s + g, 0) / gs.length : null;
  }, [ASSIGNMENTS, COURSES]);
  const overall = overallNum != null ? overallNum.toFixed(1) : "—";
  const pending = ASSIGNMENTS.filter(a => a.status === "submitted" || a.status === "in_review").length;

  const letter = (n) =>
    n >= 93 ? "A" : n >= 90 ? "A−" : n >= 87 ? "B+" : n >= 83 ? "B" : n >= 80 ? "B−" :
    n >= 77 ? "C+" : n >= 73 ? "C" : n >= 70 ? "C−" : n >= 60 ? "D" : "F";

  return (
    <>
      <div className="page-header">
        <div>
          <div className="breadcrumb">Workspace · {workspaceName}</div>
          <h1>Grades</h1>
        </div>
        <div className="actions">
          <button className="btn btn-tertiary" onClick={() => {
            const rows = graded.map(a => [a.title, courseById(a.course)?.code, a.earned, a.points, ((a.earned/a.points)*100).toFixed(1)+"%"].join(","));
            const blob = new Blob(["title,course,earned,points,percent\n" + rows.join("\n")], { type: "text/csv" });
            const url = URL.createObjectURL(blob); const el = document.createElement("a"); el.href = url; el.download = "grades.csv"; el.click(); URL.revokeObjectURL(url);
          }}><Icon name="export" size={14} /> Export transcript</button>
        </div>
      </div>

      <div className="content">
        <div className="dash-row">
          <div className="stat">
            <span className="stat-label">Term average</span>
            <span className="stat-value">{overall}{overall !== "—" && <span style={{ fontSize: 14, color: "var(--fg-tertiary)", fontWeight: 400 }}> %</span>}</span>
            <span className="stat-delta">{graded.length ? "across " + graded.length + " graded item" + (graded.length === 1 ? "" : "s") : "no graded items yet"}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Letter grade</span>
            <span className="stat-value">{overallNum != null ? letter(overallNum) : "—"}</span>
            <span className="stat-delta">weighted by task</span>
          </div>
          <div className="stat">
            <span className="stat-label">Graded items</span>
            <span className="stat-value">{graded.length}</span>
            <span className="stat-delta">of {ASSIGNMENTS.length} this term</span>
          </div>
          <div className="stat">
            <span className="stat-label">Pending grading</span>
            <span className="stat-value">{pending}</span>
            <span className="stat-delta">submitted, awaiting marks</span>
          </div>
        </div>

        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-h">
            <h2>By subject</h2>
            <span className="panel-sub">Class grade from IA1–IA3 &amp; EA</span>
          </div>
          {COURSES.length === 0 ? (
            <div className="panel-b"><p style={{ fontSize: 13, color: "var(--fg-tertiary)" }}>No subjects yet. Add subjects to see grade breakdowns here.</p></div>
          ) : (
          <table className="data">
            <colgroup>
              <col style={{ width: 120 }} />
              <col />
              <col style={{ width: 160 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 240 }} />
              <col style={{ width: 90 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Code</th>
                <th>Subject</th>
                <th>Teacher</th>
                <th className="num">Grade</th>
                <th>Distribution</th>
                <th>Letter</th>
              </tr>
            </thead>
            <tbody>
              {COURSES.map(c => {
                const g = courseGrade(c.id);
                return (
                  <tr key={c.id}>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 500 }}>
                        <span className="dot" style={{ background: c.color }} />
                        {c.code}
                      </span>
                    </td>
                    <td>{c.title}</td>
                    <td className="muted">{c.instructor}</td>
                    <td className="num"><b>{g != null ? g.toFixed(1) : "—"}</b></td>
                    <td>
                      {g != null ? (
                        <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: "var(--bg-app)" }}>
                          <span style={{ flex: g, background: g >= 85 ? "var(--success)" : g >= 78 ? "var(--accent)" : "var(--warning)" }} />
                          <span style={{ flex: 100 - g }} />
                        </div>
                      ) : <span style={{ fontSize: 11, color: "var(--fg-tertiary)" }}>no graded work</span>}
                    </td>
                    <td>
                      {g != null ? <Badge tone={g >= 85 ? "success" : g >= 78 ? "accent" : "warning"}>{letter(g)}</Badge> : <span style={{ color: "var(--fg-tertiary)" }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          )}
        </div>

        <div className="panel">
          <div className="panel-h">
            <h2>Graded assignments</h2>
            <span className="panel-sub">{graded.length} items</span>
          </div>
          <table className="data">
            <colgroup>
              <col />
              <col style={{ width: 110 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 80 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Assignment</th>
                <th>Course</th>
                <th>Type</th>
                <th>Assessment</th>
                <th>Graded</th>
                <th className="num">Weight</th>
                <th className="num">Score</th>
                <th className="num">%</th>
              </tr>
            </thead>
            <tbody>
              {graded.map(a => {
                const c = courseById(a.course);
                const pct = (a.earned / a.points) * 100;
                return (
                  <tr key={a.id}>
                    <td>{a.title}</td>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                        <span className="dot" style={{ background: c.color }} /> {c.code}
                      </span>
                    </td>
                    <td className="muted">{a.type}</td>
                    <td>{a.assessment ? <Badge tone="accent">{a.assessment}</Badge> : <span style={{ color: "var(--fg-tertiary)" }}>—</span>}</td>
                    <td className="muted">{fmt.dateLong(a.due)}</td>
                    <td className="num muted">{a.weight}%</td>
                    <td className="num"><b>{a.earned}</b>/{a.points}</td>
                    <td className="num" style={{ color: pct >= 90 ? "var(--success)" : pct >= 80 ? "var(--accent)" : "var(--warning)" }}>
                      <b>{pct.toFixed(0)}%</b>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

/* -------------------- COURSE DETAIL -------------------- */
/* One self-contained, auto-saving note card used on the Subject page. */
const CourseNoteCard = ({ note, updateNote, removeNote, setDirty, pushToast }) => {
  const { Editable } = window.Store;
  const initial = typeof note.body === "string" ? note.body : (note.body || []).join("\n\n");
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(true);
  const timer = useRef(null);
  useEffect(() => { setDraft(typeof note.body === "string" ? note.body : (note.body || []).join("\n\n")); setSaved(true); }, [note.id]);
  const onChange = (v) => {
    setDraft(v); setSaved(false); setDirty?.(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { updateNote(note.id, { body: v }); setSaved(true); setDirty?.(false); }, 900);
  };
  return (
    <div className="panel" style={{ marginBottom: 12 }}>
      <div className="panel-h">
        <h2 style={{ fontSize: 14 }}><Editable value={note.title} onChange={(v) => updateNote(note.id, { title: v })} /></h2>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="panel-sub">{saved ? "Saved" : "Saving…"}</span>
          <button className="iconbtn" style={{ width: 24, height: 24 }} aria-label="Delete note"
            onClick={() => { if (confirm("Delete this note?")) { removeNote(note.id); pushToast?.({ tone: "warning", title: "Note deleted" }); } }}>
            <Icon name="trash" size={13} />
          </button>
        </div>
      </div>
      <textarea
        style={{ width: "100%", minHeight: 120, border: "none", borderTop: "1px solid var(--bd-default)", resize: "vertical", padding: "10px 14px", background: "transparent", color: "var(--fg-primary)", font: "inherit", lineHeight: 1.55, outline: "none", boxSizing: "border-box" }}
        value={draft} onChange={(e) => onChange(e.target.value)} placeholder="Write your notes for this subject…" />
    </div>
  );
};

const CourseDetail = ({ courseId, onNavigate, pushToast }) => {
  const { useStore, Editable } = window.Store;
  const { courseById, updateCourse, removeCourse, setDirty,
          notes: NOTES, addNote, updateNote, removeNote,
          library, addLibraryFile, removeLibraryFile } = useStore();
  const c = courseById(courseId);

  const [preview, setPreview] = useState(null);
  const [folderView, setFolderView] = useState(null);
  const [driveOpen, setDriveOpen] = useState(false);
  const fileRef = useRef(null);

  if (!c) {
    return (
      <>
        <div className="page-header"><div><div className="breadcrumb">Subjects</div><h1>Subject not found</h1></div></div>
        <div className="content"><div className="empty"><div className="empty-icon"><Icon name="courses" /></div><h3>This subject is no longer in the workspace</h3><p>It may have been removed. Pick another subject from the sidebar.</p><button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => onNavigate?.("courses")}>Back to Subjects</button></div></div>
      </>
    );
  }

  const courseNotes = NOTES.filter(n => n.course === courseId);
  const courseFiles = library.filter(f => f.course === courseId);

  const onPick = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(f => {
      const isText = LIB_TEXT_EXT.includes(extOf(f.name));
      const reader = new FileReader();
      reader.onload = () => {
        const tooBig = f.size > 1.5 * 1048576;
        addLibraryFile({
          name: f.name, kind: kindOf(f.name), size: humanSize(f.size), course: courseId,
          body: isText ? String(reader.result) : undefined,
          dataUrl: !isText && !tooBig ? String(reader.result) : undefined,
          summary: tooBig ? "File stored by reference (too large to embed). Keep the original on disk." : undefined,
        });
      };
      if (isText) reader.readAsText(f); else reader.readAsDataURL(f);
    });
    if (files.length) pushToast?.({ tone: "success", title: files.length + " file" + (files.length === 1 ? "" : "s") + " added" });
    e.target.value = "";
  };

  const download = (f) => {
    let url, revoke = false;
    if (f.dataUrl) url = f.dataUrl;
    else { const blob = new Blob([f.body || f.summary || ""], { type: "text/plain" }); url = URL.createObjectURL(blob); revoke = true; }
    const a = document.createElement("a"); a.href = url; a.download = f.name; a.click();
    if (revoke) URL.revokeObjectURL(url);
  };

  const KindPill = ({ kind }) => <span className={"wa-file-icon " + kind} style={{ width: 34, height: 34, fontSize: 10 }}>{({pdf:"PDF",doc:"DOC",sheet:"XLS",image:"IMG",md:"MD",code:"PY"})[kind] || "FILE"}</span>;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="breadcrumb">Subjects · {c.term}</div>
          <h1>
            <span className="dot" style={{ background: c.color, marginRight: 8, width: 10, height: 10, display: "inline-block" }} />
            <Editable value={c.code} onChange={(v) => updateCourse(c.id, { code: v })} /> — <Editable value={c.title} onChange={(v) => updateCourse(c.id, { title: v })} />
          </h1>
        </div>
        <div className="actions">
          <button className="btn btn-tertiary"><Editable value={c.instructor} onChange={(v) => updateCourse(c.id, { instructor: v })} /></button>
          <button className="btn btn-secondary" style={{ color: "var(--error)" }} onClick={() => { if (confirm("Remove " + c.code + " and all its assignments & notes from this term?")) { removeCourse(c.id); pushToast?.({ tone: "warning", title: "Subject removed" }); onNavigate?.("courses"); } }}><Icon name="trash" size={14} /> Remove</button>
        </div>
      </div>

      <div className="content">
        {/* ---------------- Notes ---------------- */}
        <div className="panel-h" style={{ background: "transparent", border: "none", padding: "0 0 8px" }}>
          <h2>Notes</h2>
          <button className="btn btn-secondary btn-sm" onClick={() => { const n = addNote({ course: courseId, title: "New note" }); if (n) pushToast?.({ tone: "success", title: "Note added" }); }}><Icon name="plus" size={14} /> New note</button>
        </div>
        {courseNotes.length === 0 ? (
          <div className="empty" style={{ background: "var(--bg-surface)", border: "1px solid var(--bd-default)", borderRadius: 6, padding: "var(--s-8)", marginBottom: 18 }}>
            <div className="empty-icon"><Icon name="notes" /></div>
            <h3>No notes for {c.code} yet</h3>
            <p>Capture lecture summaries, essay scaffolds, and revision points for this subject.</p>
            <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={() => addNote({ course: courseId, title: "New note" })}><Icon name="plus" size={14} /> Add a note</button>
          </div>
        ) : (
          <div style={{ marginBottom: 18 }}>
            {courseNotes.map(n => <CourseNoteCard key={n.id} note={n} updateNote={updateNote} removeNote={removeNote} setDirty={setDirty} pushToast={pushToast} />)}
          </div>
        )}

        {/* ---------------- Library ---------------- */}
        <div className="panel-h" style={{ background: "transparent", border: "none", padding: "0 0 8px" }}>
          <h2>Library</h2>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setDriveOpen(true)}><Icon name="library" size={14} /> Add from Google Drive</button>
            <button className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()}><Icon name="plus" size={14} /> Upload</button>
            <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={onPick} />
          </div>
        </div>
        {courseFiles.length === 0 ? (
          <div className="empty" style={{ background: "var(--bg-surface)", border: "1px solid var(--bd-default)", borderRadius: 6, padding: "var(--s-8)" }}>
            <div className="empty-icon"><Icon name="library" /></div>
            <h3>No files for this subject</h3>
            <p>Upload syllabuses, past papers and rubrics, or import them straight from Google Drive.</p>
          </div>
        ) : (
          <div className="lib-grid">
            {courseFiles.map(f => {
              const isFolder = f.kind === "folder";
              return (
                <div className="lib-card" key={f.id} onClick={() => isFolder ? setFolderView(f) : setPreview(f)}>
                  <div className="lib-card-top">
                    {isFolder
                      ? <span className="wa-file-icon" style={{ width: 34, height: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--accent-soft)", color: "var(--accent)", borderRadius: 6 }}><Icon name="archive" size={17} /></span>
                      : <KindPill kind={f.kind} />}
                    <button className="iconbtn" style={{ width: 24, height: 24 }} aria-label={isFolder ? "Remove folder" : "Delete file"}
                      onClick={(e) => { e.stopPropagation(); if (confirm((isFolder ? "Remove folder “" : "Delete “") + f.name + "”?")) { removeLibraryFile(f.id); pushToast?.({ tone: "warning", title: isFolder ? "Folder removed" : "File deleted" }); } }}>
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                  <div className="lib-name" title={f.name}>{f.name}</div>
                  <div className="lib-meta">{isFolder ? "Google Drive folder" : <>{f.size} · {new Date(f.modified).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</>}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {preview && (
        <div className="modal-overlay" onClick={() => setPreview(null)} role="dialog" aria-modal="true">
          <div className="workarea-modal" onClick={e => e.stopPropagation()}>
            <div className="workarea-h">
              <div className="wa-title"><h2>{preview.name}</h2><div className="wa-sub">{preview.size} · {preview.owner}</div></div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-secondary" onClick={() => download(preview)}><Icon name="download" size={14} /> Download</button>
                <button className="btn btn-tertiary" style={{ color: "var(--error)" }} onClick={() => { if (confirm("Delete this file?")) { removeLibraryFile(preview.id); setPreview(null); pushToast?.({ tone: "warning", title: "File deleted" }); } }}><Icon name="trash" size={14} /></button>
                <button className="iconbtn" onClick={() => setPreview(null)} aria-label="Close"><Icon name="close" /></button>
              </div>
            </div>
            <div className="wa-preview-body" style={{ display: "flex" }}>
              <LibraryFilePreview file={preview} />
            </div>
          </div>
        </div>
      )}

      {folderView && (
        <div className="modal-overlay" onClick={() => setFolderView(null)} role="dialog" aria-modal="true">
          <div className="workarea-modal" onClick={e => e.stopPropagation()}>
            <div className="workarea-h">
              <div className="wa-title"><h2>{folderView.name}</h2><div className="wa-sub">Google Drive folder · browse subfolders &amp; files</div></div>
              <div style={{ display: "flex", gap: 6 }}>
                {folderView.link && <button className="btn btn-secondary" onClick={() => (window.schoolworkAPI?.openExternal ? window.schoolworkAPI.openExternal(folderView.link) : window.open(folderView.link, "_blank"))}><Icon name="link" size={14} /> Open in Drive</button>}
                <button className="btn btn-tertiary" style={{ color: "var(--error)" }} onClick={() => { if (confirm("Remove this folder from this subject?")) { removeLibraryFile(folderView.id); setFolderView(null); pushToast?.({ tone: "warning", title: "Folder removed" }); } }}><Icon name="trash" size={14} /></button>
                <button className="iconbtn" onClick={() => setFolderView(null)} aria-label="Close"><Icon name="close" /></button>
              </div>
            </div>
            <div className="wa-preview-body" style={{ display: "block", padding: 16, overflow: "auto" }}>
              {window.GoogleConnector?.DriveBrowser
                ? <window.GoogleConnector.DriveBrowser key={folderView.driveId} root={{ id: folderView.driveId, name: folderView.name }} courseId={courseId} pushToast={pushToast} />
                : <div className="empty"><p>The Drive browser isn't available in this build.</p></div>}
            </div>
          </div>
        </div>
      )}

      {driveOpen && (
        <div className="modal-overlay" onClick={() => setDriveOpen(false)} role="dialog" aria-modal="true">
          <div className="workarea-modal" onClick={e => e.stopPropagation()}>
            <div className="workarea-h">
              <div className="wa-title"><h2>Add to {c.code} from Google Drive</h2><div className="wa-sub">Imported files attach to this subject's library</div></div>
              <button className="iconbtn" onClick={() => setDriveOpen(false)} aria-label="Close"><Icon name="close" /></button>
            </div>
            <div className="wa-preview-body" style={{ display: "block", padding: 16, overflow: "auto" }}>
              {window.GoogleConnector?.DriveBrowser
                ? <window.GoogleConnector.DriveBrowser courseId={courseId} pushToast={pushToast} />
                : <div className="empty"><p>The Drive browser isn't available in this build.</p></div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

/* -------------------- INSPECTOR (right panel) -------------------- */
const Inspector = ({ assignmentId, onClose, onOpenWorkArea, onDelete, pushToast }) => {
  const { useStore, Editable, EditableSelect, EditableDateTime, EditableNumber, useEdit } = window.Store;
  const { assignments, courses, attachments, courseById, updateAssignment, setAssignmentAttachments } = useStore();
  const attachRef = useRef(null);
  const { STATUS_LABEL, PRIORITY_LABEL, TYPES_BY_COURSE, ASSESSMENT_KINDS, ASSESSMENT_FULL, isSummative } = window.SchoolworkData;
  const { fmt, StatusBadge, Priority, Progress, Badge } = window.UI;
  const { editMode, setEditMode } = useEdit();

  if (!assignmentId) {
    return (
      <>
        <div className="inspector-header">
          <h3>Inspector</h3>
          <button className="iconbtn" onClick={onClose} aria-label="Close inspector"><Icon name="close" /></button>
        </div>
        <div className="empty" style={{ flex: 1 }}>
          <div className="empty-icon"><Icon name="layout-right" /></div>
          <h3>No item selected</h3>
          <p>Select an assignment from the table to view its details, attachments, and grading rubric here.</p>
        </div>
      </>
    );
  }
  const a = assignments.find(x => x.id === assignmentId);
  if (!a) return null;
  const c = courseById(a.course);
  const du = fmt.daysUntil(a.due, a.status === "graded" || a.status === "submitted");
  const files = attachments[a.id] || [];
  const fileKindIcon = (k) => k === "image" ? "paperclip" : k === "code" ? "paperclip" : "paperclip";

  const statusOptions = Object.entries(STATUS_LABEL).map(([v, label]) => ({ value: v, label }));
  const priorityOptions = Object.entries(PRIORITY_LABEL).map(([v, label]) => ({ value: v, label }));
  const courseOptions = courses.map(co => ({ value: co.id, label: co.code }));
  const typeOptions = (TYPES_BY_COURSE[a.course] || []).map(t => ({ value: t, label: t }));
  const assessmentOptions = [{ value: "", label: "Not a summative assessment" },
    ...ASSESSMENT_KINDS.map(k => ({ value: k, label: k + " — " + ASSESSMENT_FULL[k] }))];

  return (
    <>
      <div className="inspector-header">
        <h3>Assignment details</h3>
        <div style={{ display: "flex", gap: 2 }}>
          <button
            className="iconbtn"
            aria-label={editMode ? "Stop editing" : "Edit"}
            title={editMode ? "Stop editing" : "Edit this assignment"}
            onClick={() => setEditMode(!editMode)}
            style={editMode ? { background: "var(--accent-soft)", color: "var(--accent)" } : undefined}
          ><Icon name="edit" /></button>
          <button className="iconbtn" aria-label="Open in new window" onClick={() => onOpenWorkArea && onOpenWorkArea(a.id)} title="Open work area"><Icon name="link" /></button>
          <button className="iconbtn" aria-label="Delete assignment" title="Delete assignment" onClick={() => { if (confirm("Delete “" + a.title + "”?")) onDelete && onDelete(a.id); }}><Icon name="trash" /></button>
          <button className="iconbtn" onClick={onClose} aria-label="Close inspector"><Icon name="close" /></button>
        </div>
      </div>

      <div className="inspector-body">
        <div style={{ fontSize: 11, color: "var(--fg-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span>{a.id}</span>
          <EditableSelect
            value={a.type}
            options={typeOptions.length ? typeOptions : [{ value: a.type, label: a.type }]}
            onChange={(v) => updateAssignment(a.id, { type: v })}
            render={() => <span>{a.type}</span>}
          />
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.35, marginBottom: 12 }}>
          <Editable value={a.title} onChange={(v) => updateAssignment(a.id, { title: v })} />
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
          <EditableSelect
            value={a.status}
            options={statusOptions}
            onChange={(v) => updateAssignment(a.id, { status: v })}
            render={() => <StatusBadge status={a.status} />}
          />
          <EditableSelect
            value={a.course}
            options={courseOptions}
            onChange={(v) => updateAssignment(a.id, { course: v })}
            render={() => (
              <Badge tone="neutral">
                <span className="dot" style={{ background: c.color, width: 6, height: 6 }} />
                {c.code}
              </Badge>
            )}
          />
          <EditableSelect
            value={a.priority}
            options={priorityOptions}
            onChange={(v) => updateAssignment(a.id, { priority: v })}
            render={() => a.priority === "high" ? <Badge tone="error">High priority</Badge> : a.priority === "med" ? <Badge tone="warning">Medium priority</Badge> : <Badge tone="info">Low priority</Badge>}
          />
          <EditableSelect
            value={a.assessment || ""}
            options={assessmentOptions}
            onChange={(v) => updateAssignment(a.id, { assessment: v })}
            render={() => a.assessment ? <Badge tone="accent" title={ASSESSMENT_FULL[a.assessment] + " · counts toward the class grade"}>{a.assessment}</Badge> : null}
          />
        </div>

        <dl className="dl">
          {a.draftDue && (
            <>
              <dt>Draft due</dt>
              <dd>
                <EditableDateTime value={a.draftDue} onChange={(v) => updateAssignment(a.id, { draftDue: v })} render={(v) => <span>{fmt.dateLong(v)} at {fmt.time(v)}</span>} />
                <div style={{ fontSize: 11, color: "var(--fg-tertiary)", marginTop: 2 }}>
                  Draft milestone
                  {a.draftSubmittedAt && <> · <Badge tone="success">Draft submitted {fmt.dateLong(a.draftSubmittedAt)}</Badge></>}
                  {!editMode && !a.draftSubmittedAt && <> · <a href="#" onClick={(e) => { e.preventDefault(); updateAssignment(a.id, { draftDue: null }); }}>remove</a></>}
                </div>
              </dd>
            </>
          )}
          <dt>{a.draftDue ? "Final due" : "Due"}</dt>
          <dd>
            <EditableDateTime
              value={a.due}
              onChange={(v) => updateAssignment(a.id, { due: v })}
              render={(v) => <span>{fmt.dateLong(v)} at {fmt.time(v)}</span>}
            />
            {du.label && (
              <div style={{ fontSize: 11, color: du.tone === "error" ? "var(--error)" : du.tone === "warning" ? "var(--warning)" : "var(--fg-tertiary)", marginTop: 2 }}>
                {du.label}
              </div>
            )}
          </dd>
          {!a.draftDue && editMode && (
            <>
              <dt>Draft due</dt>
              <dd><button className="btn btn-tertiary btn-sm" onClick={() => updateAssignment(a.id, { draftDue: new Date(new Date(a.due).getTime() - 7 * 864e5).toISOString().replace("Z", "") })}>Add draft date</button></dd>
            </>
          )}
          <dt>Course</dt>
          <dd>{c.title}<div style={{ fontSize: 11, color: "var(--fg-tertiary)" }}>{c.instructor}</div></dd>
          <dt>Weight</dt>
          <dd><EditableNumber value={a.weight} suffix="%" min={0} max={100} onChange={(v) => updateAssignment(a.id, { weight: v })} /> {isSummative(a) ? "of the class grade" : "of final grade"}</dd>
          <dt>Points</dt>
          <dd>
            <EditableNumber value={a.earned ?? 0} onChange={(v) => updateAssignment(a.id, { earned: v })} /> / <EditableNumber value={a.points} onChange={(v) => updateAssignment(a.id, { points: v })} />
          </dd>
          <dt>Est. time</dt>
          <dd><EditableNumber value={a.est ?? 0} suffix=" min" onChange={(v) => updateAssignment(a.id, { est: v })} /></dd>
          <dt>Priority</dt>
          <dd><Priority level={a.priority} /></dd>
        </dl>

        {a.notes != null && (
          <>
            <hr style={{ border: 0, borderTop: "1px solid var(--bd-subtle)", margin: "20px 0" }} />
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
              Notes
            </div>
            <div style={{ fontSize: 13, color: "var(--fg-secondary)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
              <Editable
                as="div" multiline
                value={a.notes}
                onChange={(v) => updateAssignment(a.id, { notes: v })}
                placeholder="Add notes — context, plan, sketch of an answer…"
              />
            </div>
          </>
        )}

        <hr style={{ border: 0, borderTop: "1px solid var(--bd-subtle)", margin: "20px 0" }} />

        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
          Progress
        </div>
        <Progress value={a.status === "graded" || a.status === "submitted" ? 100 : a.status === "in_review" ? 90 : a.status === "in_progress" ? 45 : 0} />
        <div style={{ fontSize: 11, color: "var(--fg-tertiary)", marginTop: 6 }}>
          {STATUS_LABEL[a.status] || a.status}
          {a.status === "graded" && a.earned != null ? " · " + a.earned + "/" + a.points : ""}
        </div>

        <hr style={{ border: 0, borderTop: "1px solid var(--bd-subtle)", margin: "20px 0" }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Attachments ({files.length})
          </div>
          <button className="iconbtn" style={{ width: 22, height: 22 }} aria-label="Add attachment" title="Add" onClick={() => attachRef.current?.click()}><Icon name="plus" size={12} /></button>
          <input ref={attachRef} type="file" multiple style={{ display: "none" }} onChange={(e) => {
            const picked = Array.from(e.target.files || []); if (!picked.length) return;
            const ext = (n) => (n.split(".").pop() || "").toLowerCase();
            const kindOf = (n) => { const x = ext(n); return ["png","jpg","jpeg","gif","webp","svg"].includes(x) ? "image" : ["pdf"].includes(x) ? "pdf" : ["xlsx","xls","csv"].includes(x) ? "sheet" : ["doc","docx"].includes(x) ? "doc" : ["py","js","ts","c","cpp","java"].includes(x) ? "code" : ["md","txt","json","html","css"].includes(x) ? "md" : "doc"; };
            const textExt = ["md","txt","json","js","py","csv","html","css","ts"];
            const hSize = (b) => b < 1024 ? b + " B" : b < 1048576 ? (b/1024).toFixed(0) + " KB" : (b/1048576).toFixed(1) + " MB";
            let pending = picked.length; const added = [];
            picked.forEach(f => { const isText = textExt.includes(ext(f.name)); const r = new FileReader();
              r.onload = () => { const big = f.size > 1.5*1048576;
                added.push({ id: "F-" + Date.now().toString(36) + Math.floor(Math.random()*99), name: f.name, kind: kindOf(f.name), size: hSize(f.size), modified: new Date().toISOString(), owner: "Me", body: isText ? String(r.result) : undefined, dataUrl: !isText && !big ? String(r.result) : undefined, summary: big ? "Stored by reference." : undefined });
                if (--pending === 0) { setAssignmentAttachments(a.id, [...(attachments[a.id] || []), ...added]); pushToast?.({ tone: "success", title: picked.length + " file" + (picked.length === 1 ? "" : "s") + " attached" }); } };
              if (isText) r.readAsText(f); else r.readAsDataURL(f); });
            e.target.value = "";
          }} />
        </div>
        {files.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>No attachments yet.</div>
        )}
        {files.slice(0, 5).map(f => (
          <button
            key={f.id}
            onClick={() => onOpenWorkArea && onOpenWorkArea(a.id, f.id)}
            style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
              padding: "6px 8px", border: "1px solid var(--bd-subtle)",
              borderRadius: 4, fontSize: 12, marginBottom: 6,
              color: "var(--fg-secondary)", background: "var(--bg-surface)",
              cursor: "pointer", transition: "background var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease)"
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-hover)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "var(--bg-surface)"}
          >
            <Icon name={fileKindIcon(f.kind)} size={14} />
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
            <span style={{ fontSize: 10, color: "var(--fg-tertiary)" }}>{f.size}</span>
          </button>
        ))}
        {files.length > 5 && (
          <button
            onClick={() => onOpenWorkArea && onOpenWorkArea(a.id)}
            style={{
              fontSize: 11, color: "var(--accent)", background: "transparent",
              padding: "2px 4px", marginTop: 2
            }}
          >View all {files.length} files →</button>
        )}

        <hr style={{ border: 0, borderTop: "1px solid var(--bd-subtle)", margin: "20px 0" }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => onOpenWorkArea && onOpenWorkArea(a.id)}>
            <Icon name="link" size={14} /> Open work area
          </button>

          {/* Draft and final submissions are tracked independently. The draft
              button only appears when the assignment has a draftDue — ticking
              it stamps `draftSubmittedAt` but leaves `status` alone so the
              final-due tracking and grade flow are unaffected. */}
          {a.draftDue && (
            a.draftSubmittedAt ? (
              <button
                className="btn btn-tertiary"
                style={{ width: "100%" }}
                title={"Marked submitted " + fmt.dateLong(a.draftSubmittedAt) + " at " + fmt.time(a.draftSubmittedAt)}
                onClick={() => updateAssignment(a.id, { draftSubmittedAt: null })}
              >
                <Icon name="refresh" size={14} /> Re-open draft
              </button>
            ) : (
              <button
                className="btn btn-secondary"
                style={{ width: "100%" }}
                onClick={() => updateAssignment(a.id, { draftSubmittedAt: new Date().toISOString() })}
              >
                <Icon name="check" size={14} /> Submit draft
              </button>
            )
          )}

          <button
            className="btn btn-secondary"
            style={{ width: "100%" }}
            onClick={() => updateAssignment(a.id, { status: a.status === "submitted" || a.status === "graded" ? "in_progress" : "submitted" })}
          >
            {a.status === "submitted" || a.status === "graded"
              ? "Re-open for edits"
              : (a.draftDue ? "Submit final" : "Mark as submitted")}
          </button>
        </div>
      </div>
    </>
  );
};

/* -------------------- LIBRARY -------------------- */
const LIB_TEXT_EXT = ["md", "txt", "json", "js", "py", "csv", "html", "css", "ts"];
const extOf = (name) => (name.split(".").pop() || "").toLowerCase();
const kindOf = (name) => {
  const e = extOf(name);
  if (["png","jpg","jpeg","gif","webp","svg"].includes(e)) return "image";
  if (["xlsx","xls","csv"].includes(e)) return "sheet";
  if (["doc","docx"].includes(e)) return "doc";
  if (["pdf"].includes(e)) return "pdf";
  if (["py","js","ts","java","c","cpp","cs","rb","go"].includes(e)) return "code";
  if (["md","txt","json","html","css"].includes(e)) return "md";
  return "doc";
};
const humanSize = (bytes) => bytes < 1024 ? bytes + " B" : bytes < 1048576 ? (bytes/1024).toFixed(0) + " KB" : (bytes/1048576).toFixed(1) + " MB";

const LibraryFilePreview = ({ file }) => {
  if (!file) return null;
  if (file.dataUrl && file.kind === "image") return <div className="lib-prev-img"><img src={file.dataUrl} alt={file.name} /></div>;
  if (file.dataUrl && file.kind === "pdf") return <window.UI.PdfFrame className="lib-prev-frame" dataUrl={file.dataUrl} title={file.name} />;
  if (file.body != null) return <pre className="wa-code" style={{ margin: 0 }}>{file.body}</pre>;
  return (
    <div className="empty" style={{ margin: "auto" }}>
      <div className="empty-icon"><Icon name="library" /></div>
      <h3>{file.name}</h3>
      <p>{file.link ? "Linked from Google Drive." : (file.summary || "No inline preview available for this file type. Download it to open in its native app.")}</p>
      {file.link && (
        <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }}
          onClick={() => (window.schoolworkAPI?.openExternal ? window.schoolworkAPI.openExternal(file.link) : window.open(file.link, "_blank"))}>
          <Icon name="link" size={14} /> Open in Google Drive
        </button>
      )}
    </div>
  );
};

const LibraryView = ({ pushToast }) => {
  const { useStore } = window.Store;
  const { library, addLibraryFile, removeLibraryFile, workspaceName } = useStore();
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState(null);
  const [folderView, setFolderView] = useState(null);
  const [newTextOpen, setNewTextOpen] = useState(false);
  const fileRef = useRef(null);

  const filtered = library.filter(f =>
    !query.trim() ||
    f.name.toLowerCase().includes(query.toLowerCase()) ||
    (f.tags || []).join(" ").toLowerCase().includes(query.toLowerCase())
  );

  const onPick = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(f => {
      const kind = kindOf(f.name);
      const reader = new FileReader();
      const isText = LIB_TEXT_EXT.includes(extOf(f.name));
      reader.onload = () => {
        const tooBig = f.size > 1.5 * 1048576;
        addLibraryFile({
          name: f.name, kind, size: humanSize(f.size),
          body: isText ? String(reader.result) : undefined,
          dataUrl: !isText && !tooBig ? String(reader.result) : undefined,
          summary: tooBig ? "File stored by reference (too large to embed). Keep the original on disk." : undefined,
        });
      };
      if (isText) reader.readAsText(f); else reader.readAsDataURL(f);
    });
    pushToast?.({ tone: "success", title: files.length + " file" + (files.length === 1 ? "" : "s") + " added" });
    e.target.value = "";
  };

  const onNewText = (name) => {
    const file = addLibraryFile({ name, kind: kindOf(name), body: "", size: "0 B" });
    if (file) setPreview(file);
  };

  const download = (f) => {
    let url, revoke = false;
    if (f.dataUrl) url = f.dataUrl;
    else { const blob = new Blob([f.body || f.summary || ""], { type: "text/plain" }); url = URL.createObjectURL(blob); revoke = true; }
    const a = document.createElement("a"); a.href = url; a.download = f.name; a.click();
    if (revoke) URL.revokeObjectURL(url);
  };

  const KindPill = ({ kind }) => <span className={"wa-file-icon " + kind} style={{ width: 34, height: 34, fontSize: 10 }}>{({pdf:"PDF",doc:"DOC",sheet:"XLS",image:"IMG",md:"MD",code:"PY"})[kind] || "FILE"}</span>;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="breadcrumb">Workspace · {workspaceName}</div>
          <h1>Library</h1>
        </div>
        <div className="actions">
          <div className="searchbar" style={{ width: 240, height: 28 }}>
            <Icon name="search" size={13} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder={"Search " + library.length + " files…"} />
          </div>
          <button className="btn btn-secondary" onClick={() => setNewTextOpen(true)}><Icon name="notes" size={14} /> New text file</button>
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()}><Icon name="plus" size={14} /> Upload</button>
          <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={onPick} />
        </div>
      </div>

      <div className="content">
        {library.length === 0 ? (
          <div className="empty" style={{ background: "var(--bg-surface)", border: "1px solid var(--bd-default)", borderRadius: 6, padding: "var(--s-10)" }}>
            <div className="empty-icon"><Icon name="library" /></div>
            <h3>Your library is empty</h3>
            <p>Upload syllabuses, past papers, rubrics and references, or create a quick text file. Files live in this term's workspace.</p>
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => fileRef.current?.click()}><Icon name="plus" size={14} /> Upload a file</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty"><div className="empty-icon"><Icon name="search" /></div><h3>No files match</h3><p>Try a different search term.</p></div>
        ) : (
          <div className="lib-grid">
            {filtered.map(f => {
              const isFolder = f.kind === "folder";
              return (
              <div className="lib-card" key={f.id} onClick={() => isFolder ? setFolderView(f) : setPreview(f)}>
                <div className="lib-card-top">
                  {isFolder
                    ? <span className="wa-file-icon" style={{ width: 34, height: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--accent-soft)", color: "var(--accent)", borderRadius: 6 }}><Icon name="archive" size={17} /></span>
                    : <KindPill kind={f.kind} />}
                  <button className="iconbtn" style={{ width: 24, height: 24 }} aria-label={isFolder ? "Remove folder" : "Delete file"}
                    onClick={(e) => { e.stopPropagation(); if (confirm((isFolder ? "Remove folder “" : "Delete “") + f.name + "”?")) { removeLibraryFile(f.id); pushToast?.({ tone: "warning", title: isFolder ? "Folder removed" : "File deleted" }); } }}>
                    <Icon name="trash" size={13} />
                  </button>
                </div>
                <div className="lib-name" title={f.name}>{f.name}</div>
                <div className="lib-meta">{isFolder ? "Google Drive folder" : <>{f.size} · {new Date(f.modified).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</>}</div>
                {(f.tags || []).length > 0 && <div className="lib-tags">{f.tags.map(t => <span key={t} className="lib-tag">{t}</span>)}</div>}
              </div>
              );
            })}
          </div>
        )}
      </div>

      {preview && (
        <div className="modal-overlay" onClick={() => setPreview(null)} role="dialog" aria-modal="true">
          <div className="workarea-modal" onClick={e => e.stopPropagation()}>
            <div className="workarea-h">
              <div className="wa-title"><h2>{preview.name}</h2><div className="wa-sub">{preview.size} · {preview.owner}</div></div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-secondary" onClick={() => download(preview)}><Icon name="download" size={14} /> Download</button>
                <button className="btn btn-tertiary" style={{ color: "var(--error)" }} onClick={() => { if (confirm("Delete this file?")) { removeLibraryFile(preview.id); setPreview(null); pushToast?.({ tone: "warning", title: "File deleted" }); } }}><Icon name="trash" size={14} /></button>
                <button className="iconbtn" onClick={() => setPreview(null)} aria-label="Close"><Icon name="close" /></button>
              </div>
            </div>
            <div className="wa-preview-body" style={{ display: "flex" }}>
              <LibraryFilePreview file={preview} />
            </div>
          </div>
        </div>
      )}

      {folderView && (
        <div className="modal-overlay" onClick={() => setFolderView(null)} role="dialog" aria-modal="true">
          <div className="workarea-modal" onClick={e => e.stopPropagation()}>
            <div className="workarea-h">
              <div className="wa-title"><h2>{folderView.name}</h2><div className="wa-sub">Google Drive folder · browse subfolders &amp; files</div></div>
              <div style={{ display: "flex", gap: 6 }}>
                {folderView.link && <button className="btn btn-secondary" onClick={() => (window.schoolworkAPI?.openExternal ? window.schoolworkAPI.openExternal(folderView.link) : window.open(folderView.link, "_blank"))}><Icon name="link" size={14} /> Open in Drive</button>}
                <button className="btn btn-tertiary" style={{ color: "var(--error)" }} onClick={() => { if (confirm("Remove this folder from your library?")) { removeLibraryFile(folderView.id); setFolderView(null); pushToast?.({ tone: "warning", title: "Folder removed" }); } }}><Icon name="trash" size={14} /></button>
                <button className="iconbtn" onClick={() => setFolderView(null)} aria-label="Close"><Icon name="close" /></button>
              </div>
            </div>
            <div className="wa-preview-body" style={{ display: "block", padding: 16, overflow: "auto" }}>
              {window.GoogleConnector?.DriveBrowser
                ? <window.GoogleConnector.DriveBrowser key={folderView.driveId} root={{ id: folderView.driveId, name: folderView.name }} pushToast={pushToast} />
                : <div className="empty"><p>The Drive browser isn't available in this build.</p></div>}
            </div>
          </div>
        </div>
      )}

      {newTextOpen && <PromptModal title="New text file" label="File name" placeholder="Study plan.md" defaultValue="Untitled.md" submitLabel="Create" onSubmit={onNewText} onClose={() => setNewTextOpen(false)} />}
    </>
  );
};

/* -------------------- SETTINGS -------------------- */
const SettingsView = ({ tweaks, setTweak, pushToast, onLogout }) => {
  const { useStore, Editable } = window.Store;
  const { userName, setUserName, workspaceName, setWorkspaceName, courses, assignments, notes, library, usage, limits, terms, setTerms, schedule, copyFromTerm } = useStore();
  const [subjCopyFrom, setSubjCopyFrom] = useState("");
  const [subjCopyReplace, setSubjCopyReplace] = useState(false);
  const { account, tier, isUnlimited, FREE_LIMITS, prefs, setPrefs } = window.Auth.useAuth();
  const { termState, termWeeks, termDatesLabel, SCHOOLS, termsForSchool } = window.SchoolworkData;
  const [tab, setTab] = useState("account");
  const [legal, setLegal] = useState(null);

  /* ---- editable academic terms ---- */
  const dataKeyFor = (k) => "schoolwork:data:" + (account?.id || "anon") + ":" + k;
  const commitTerm = (i, patch) => {
    const prevRow = terms[i];
    const t = { ...prevRow, ...patch };
    const yr = (t.end || t.start || "2026").slice(0, 4);
    const newKey = (t.year || "Year") + " — " + (t.term || "Term") + ", " + yr;
    const oldKey = prevRow.key;
    if (newKey !== oldKey && !terms.some((x, j) => j !== i && x.key === newKey)) {
      try {  // carry this term's saved work over to the new key
        const v = localStorage.getItem(dataKeyFor(oldKey));
        if (v != null) { localStorage.setItem(dataKeyFor(newKey), v); localStorage.removeItem(dataKeyFor(oldKey)); }
      } catch {}
      t.key = newKey;
    }
    setTerms(terms.map((x, j) => (j === i ? t : x)));
    if (t.key !== oldKey && workspaceName === oldKey) setWorkspaceName(t.key);
  };
  const addTerm = () => {
    let n = terms.length + 1, key = "New term " + n;
    while (terms.some(t => t.key === key)) { n++; key = "New term " + n; }
    setTerms([...terms, { key, year: "Year 12", term: "Term", start: "", end: "" }]);
  };
  const removeTerm = (i) => {
    if (terms.length <= 1) { pushToast?.({ tone: "warning", title: "Keep at least one term" }); return; }
    if (!confirm("Remove “" + terms[i].key + "” from the term list? Its saved work stays on disk and reappears if you re-add it.")) return;
    const removingActive = terms[i].key === workspaceName;
    const next = terms.filter((_, j) => j !== i);
    setTerms(next);
    if (removingActive) setWorkspaceName(next[0].key);
  };
  const tabs = [
    { id: "account",    label: "Account",      icon: "user" },
    { id: "appearance", label: "Appearance",   icon: "sun" },
    { id: "academic",   label: "Academic year",icon: "calendar" },
    { id: "subjects",   label: "Subjects",     icon: "courses" },
    { id: "notifications", label: "Notifications", icon: "bell" },
    { id: "connectors", label: "Connectors",   icon: "link" },
    { id: "sync",       label: "Sync devices", icon: "refresh" },
    { id: "shortcuts",  label: "Shortcuts",    icon: "command" },
    { id: "storage",    label: "Data & storage", icon: "archive" },
    { id: "about",      label: "About",        icon: "help" },
  ];

  const ACCENT_PRESETS = [
    { hex: "#2E5AAC", name: "Slate blue" },
    { hex: "#1E5F4F", name: "Forest" },
    { hex: "#7A4FAA", name: "Plum" },
    { hex: "#A8551A", name: "Burnt sienna" },
    { hex: "#2E6B7A", name: "Muted teal" },
  ];

  const initials = (userName || "").split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <>
      <div className="page-header">
        <div>
          <div className="breadcrumb">Schoolwork · Preferences</div>
          <h1>Settings</h1>
        </div>
        <div className="actions">
          <button className="btn btn-tertiary" onClick={() => pushToast?.({ tone: "success", title: "Preferences exported", body: "settings.json downloaded" })}>
            <Icon name="export" size={14} /> Export
          </button>
        </div>
      </div>

      <div className="content" style={{ padding: 0, display: "grid", gridTemplateColumns: "220px 1fr", overflow: "hidden" }}>
        <nav className="settings-nav" aria-label="Settings categories">
          {tabs.map(t => (
            <button
              key={t.id}
              className={"nav-item" + (tab === t.id ? " active" : "")}
              onClick={() => setTab(t.id)}
              style={{ margin: "1px 6px", width: "calc(100% - 12px)" }}
            >
              <span className="ni-icon"><Icon name={t.icon} size={15} /></span>
              <span className="ni-label">{t.label}</span>
            </button>
          ))}
        </nav>

        <div className="settings-body" style={{ padding: "var(--s-5) var(--s-6)", overflowY: "auto" }}>
          {tab === "account" && (
            <>
              <SettingsSection title="Account" subtitle="Personal details shown across the app and on exported documents.">
                <div className="settings-account">
                  <div className="settings-avatar">{initials}</div>
                  <div className="settings-fields">
                    <SettingsField label="Display name" hint="Shown across the application and on exported documents.">
                      <input className="input" value={userName} onChange={(e) => setUserName(e.target.value)} />
                    </SettingsField>
                    <SettingsField label="Email" hint="The address you signed in with.">
                      <input className="input" value={account?.email || ""} readOnly />
                    </SettingsField>
                    <SettingsField label="Plan" hint="Unlimited access — no caps on this account.">
                      <span className="badge accent" style={{ fontSize: 13 }}>Unlimited</span>
                    </SettingsField>
                  </div>
                </div>
              </SettingsSection>
              <SettingsSection title="Session">
                <SettingsField label="Sign out" hint="Return to the sign-in screen. Your data stays saved on this device.">
                  <button className="btn btn-secondary" style={{ color: "var(--error)" }} onClick={() => onLogout?.()}>Log out</button>
                </SettingsField>
              </SettingsSection>
            </>
          )}

          {tab === "appearance" && (
            <>
              <SettingsSection title="Theme" subtitle="Light theme during the day, dark theme for evening study.">
                <div className="settings-tile-group">
                  {["light", "dark"].map(t => (
                    <button
                      key={t}
                      className={"settings-tile" + (tweaks.theme === t ? " active" : "")}
                      onClick={() => setTweak("theme", t)}
                    >
                      <div className={"theme-preview " + t} aria-hidden="true">
                        <div className="tp-bar" /><div className="tp-body"><div className="tp-side" /><div className="tp-main" /></div>
                      </div>
                      <div className="tile-meta"><b style={{ textTransform: "capitalize" }}>{t}</b></div>
                    </button>
                  ))}
                </div>
              </SettingsSection>
              <SettingsSection title="Accent colour" subtitle="One restrained accent is applied to interactive elements only.">
                <div className="settings-swatches">
                  {ACCENT_PRESETS.map(a => (
                    <button
                      key={a.hex}
                      className={"swatch" + (tweaks.accent === a.hex ? " active" : "")}
                      onClick={() => setTweak("accent", a.hex)}
                      title={a.name}
                    >
                      <span className="swatch-color" style={{ background: a.hex }} />
                      <span className="swatch-name">{a.name}</span>
                    </button>
                  ))}
                </div>
              </SettingsSection>
              <SettingsSection title="Density" subtitle="Compact fits more on screen; comfortable is easier on the eyes during long study sessions.">
                <div className="segmented" role="radiogroup">
                  <button className={tweaks.density === "compact" ? "active" : ""} onClick={() => setTweak("density", "compact")}>Compact</button>
                  <button className={tweaks.density === "comfortable" ? "active" : ""} onClick={() => setTweak("density", "comfortable")}>Comfortable</button>
                </div>
              </SettingsSection>
            </>
          )}

          {tab === "academic" && (
            <>
              <SettingsSection title="Academic year" subtitle="The active term controls which assignments, notes and subjects are visible across the workspace.">
                <SettingsField label="Active term">
                  <select className="select" value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)}>
                    {terms.map(t => <option key={t.key} value={t.key}>{t.key}</option>)}
                  </select>
                </SettingsField>
              </SettingsSection>
              <SettingsSection title="Terms & dates" subtitle="Give each term its own start and end date — terms can be different lengths. Current / complete / upcoming is worked out from these dates automatically.">
                <SettingsField label="Load school preset" hint="Replaces the dates below with your school's 2026 term dates.">
                  <select className="select" value="" onChange={(e) => { const id = e.target.value; if (!id) return; const sc = SCHOOLS.find(s => s.id === id); if (confirm("Replace all term dates with the " + (sc ? sc.name : id) + " 2026 preset?")) { setTerms(termsForSchool(id)); pushToast?.({ tone: "success", title: "Term dates updated", body: sc ? sc.name : id }); } }}>
                    <option value="">Choose a school…</option>
                    {(SCHOOLS || []).filter(s => s.id !== "generic").map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </SettingsField>
                <table className="data" style={{ marginTop: 4 }}>
                  <colgroup><col style={{ width: 92 }} /><col style={{ width: 92 }} /><col style={{ width: 150 }} /><col style={{ width: 150 }} /><col style={{ width: 120 }} /><col style={{ width: 40 }} /></colgroup>
                  <thead><tr><th>Year</th><th>Term</th><th>Starts</th><th>Ends</th><th>Length / state</th><th></th></tr></thead>
                  <tbody>
                    {terms.map((t, i) => {
                      const wk = termWeeks(t);
                      const st = termState(t);
                      return (
                        <tr key={i} className={t.key === workspaceName ? "selected" : ""}>
                          <td><input className="input" style={{ height: 28 }} value={t.year || ""} onChange={(e) => commitTerm(i, { year: e.target.value })} /></td>
                          <td><input className="input" style={{ height: 28 }} value={t.term || ""} onChange={(e) => commitTerm(i, { term: e.target.value })} /></td>
                          <td><input className="input" style={{ height: 28 }} type="date" value={t.start || ""} onChange={(e) => commitTerm(i, { start: e.target.value })} /></td>
                          <td><input className="input" style={{ height: 28 }} type="date" value={t.end || ""} onChange={(e) => commitTerm(i, { end: e.target.value })} /></td>
                          <td>
                            <span className={"badge " + (st === "current" ? "success" : st === "complete" ? "neutral" : "info")} style={{ textTransform: "capitalize" }}>{st}</span>
                            {wk != null && <span style={{ fontSize: 11, color: "var(--fg-tertiary)", marginLeft: 6 }}>{wk} wk{wk === 1 ? "" : "s"}</span>}
                          </td>
                          <td><button className="iconbtn" style={{ width: 24, height: 24 }} aria-label="Remove term" title="Remove term" onClick={() => removeTerm(i)}><Icon name="trash" size={13} /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <button className="btn btn-tertiary btn-sm" style={{ marginTop: 10 }} onClick={addTerm}><Icon name="plus" size={13} /> Add a term</button>
                <p style={{ fontSize: 12, color: "var(--fg-tertiary)", marginTop: 10 }}>Editing a term's year, name, or end date renames its workspace and carries its saved assignments, notes and files across automatically.</p>
              </SettingsSection>
            </>
          )}

          {tab === "subjects" && (
            <>
            <SettingsSection title="Copy from another term" subtitle="Bring across the subjects (and optionally the weekly schedule) from a different term so you don't have to re-enter them.">
              {(() => {
                const sources = (terms || []).filter(t => t.key !== workspaceName).map(t => {
                  let cc = 0, sc = 0;
                  try {
                    for (let i = 0; i < localStorage.length; i++) {
                      const k = localStorage.key(i);
                      if (k && k.startsWith("schoolwork:data:") && k.endsWith(":" + t.key)) {
                        const v = JSON.parse(localStorage.getItem(k) || "{}");
                        cc = Math.max(cc, (v.courses  || []).length);
                        sc = Math.max(sc, (v.schedule || []).length);
                      }
                    }
                  } catch {}
                  return { ...t, courseCount: cc, scheduleCount: sc };
                });
                const onCopy = (alsoSchedule) => {
                  if (!subjCopyFrom) return;
                  if (subjCopyReplace) {
                    const pieces = [];
                    if (courses.length)               pieces.push(courses.length  + " subject" + (courses.length  === 1 ? "" : "s"));
                    if (alsoSchedule && schedule.length) pieces.push(schedule.length + " class"   + (schedule.length === 1 ? "" : "es"));
                    if (pieces.length && !confirm("Replace " + pieces.join(" and ") + " in " + workspaceName + " with the ones from " + subjCopyFrom + "?")) return;
                  }
                  const r = copyFromTerm(subjCopyFrom, { includeCourses: true, includeSchedule: alsoSchedule, replace: subjCopyReplace });
                  if (!r.ok) {
                    pushToast?.({ tone: "warning", title: "Nothing to copy", body: r.reason === "empty" ? "That term has nothing saved." : "Pick a different term." });
                    return;
                  }
                  const bits = [];
                  if (r.addedSubjects) bits.push(r.addedSubjects + " subject" + (r.addedSubjects === 1 ? "" : "s"));
                  if (r.addedClasses)  bits.push(r.addedClasses  + " class"   + (r.addedClasses  === 1 ? "" : "es"));
                  pushToast?.({ tone: "success", title: "Copied from " + subjCopyFrom, body: (bits.join(" and ") || "Already up to date") + (bits.length ? " added" : "") });
                  setSubjCopyFrom("");
                };
                return (
                  <>
                    <SettingsField label="Source term" hint="Which term to copy from. The counts show what each term has saved.">
                      <select className="select" value={subjCopyFrom} onChange={(e) => setSubjCopyFrom(e.target.value)}>
                        <option value="">Choose a term…</option>
                        {sources.map(t => {
                          const lbl = t.courseCount || t.scheduleCount
                            ? " (" + (t.courseCount ? t.courseCount + " subj" : "") + (t.courseCount && t.scheduleCount ? ", " : "") + (t.scheduleCount ? t.scheduleCount + " class" + (t.scheduleCount === 1 ? "" : "es") : "") + ")"
                            : " (empty)";
                          return <option key={t.key} value={t.key}>{t.key}{lbl}</option>;
                        })}
                      </select>
                    </SettingsField>
                    <SettingsField label="Replace current" hint="Wipe this term's existing subjects (and classes when included) before copying.">
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                        <input type="checkbox" checked={subjCopyReplace} onChange={(e) => setSubjCopyReplace(e.target.checked)} /> Replace existing
                      </label>
                    </SettingsField>
                    <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      <button className="btn btn-secondary" disabled={!subjCopyFrom} onClick={() => onCopy(false)}><Icon name="export" size={14} /> Copy subjects only</button>
                      <button className="btn btn-primary"   disabled={!subjCopyFrom} onClick={() => onCopy(true)}><Icon name="export" size={14} /> Copy subjects &amp; classes</button>
                    </div>
                  </>
                );
              })()}
            </SettingsSection>
            <SettingsSection title="Subjects" subtitle="Enrolled subjects for this term. Edit names, codes, instructors or colour-coding.">
              <table className="data" style={{ marginTop: 8 }}>
                <colgroup><col style={{ width: 32 }} /><col style={{ width: 140 }} /><col /><col style={{ width: 160 }} /><col style={{ width: 80 }} /></colgroup>
                <thead><tr><th></th><th>Code</th><th>Title</th><th>Teacher</th><th className="num">Credits</th></tr></thead>
                <tbody>
                  {courses.map(c => (
                    <tr key={c.id}>
                      <td><span className="dot" style={{ background: c.color }} /></td>
                      <td><Editable value={c.code} onChange={() => {}} /></td>
                      <td>{c.title}</td>
                      <td className="muted">{c.instructor}</td>
                      <td className="num">{c.credits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: 12, color: "var(--fg-tertiary)", marginTop: 12 }}>Turn on Edit mode in the top bar to change codes, titles, and teachers.</p>
            </SettingsSection>
            </>
          )}

          {tab === "notifications" && (
            <>
              <SettingsSection title="Reminders" subtitle="The notifications bell shows open assignments due within this window.">
                <SettingsField label="Lead time" hint="How far ahead the bell starts reminding you.">
                  <select className="select" value={String(prefs.leadTimeHours)} onChange={(e) => setPrefs({ leadTimeHours: Number(e.target.value) })}>
                    <option value="4">4 hours</option>
                    <option value="24">24 hours</option>
                    <option value="48">48 hours</option>
                    <option value="72">3 days</option>
                    <option value="168">1 week</option>
                  </select>
                </SettingsField>
                <SettingsField label="Daily digest" hint="Shows a summary at the top of your Dashboard. “Off” hides it.">
                  <div className="segmented" role="radiogroup">
                    {["morning", "evening", "off"].map(d => (
                      <button key={d} className={prefs.digest === d ? "active" : ""} style={{ textTransform: "capitalize" }} onClick={() => setPrefs({ digest: d })}>{d}</button>
                    ))}
                  </div>
                </SettingsField>
              </SettingsSection>
              <SettingsSection title="Channels">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--bd-subtle)" }}>
                  <div><div style={{ fontSize: 13, fontWeight: 500 }}>In-app notifications</div><div style={{ fontSize: 11, color: "var(--fg-tertiary)" }}>Pop-up toasts and the bell badge.</div></div>
                  <button role="switch" aria-checked={prefs.inApp} className={"toggle " + (prefs.inApp ? "on" : "")} onClick={() => setPrefs({ inApp: !prefs.inApp })}><span /></button>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--bd-subtle)" }}>
                  <div><div style={{ fontSize: 13, fontWeight: 500 }}>Calendar sync</div><div style={{ fontSize: 11, color: "var(--fg-tertiary)" }}>Push due dates to Google Calendar — set up in Connectors.</div></div>
                  <button role="switch" aria-checked={prefs.calendarSync} className={"toggle " + (prefs.calendarSync ? "on" : "")} onClick={() => setPrefs({ calendarSync: !prefs.calendarSync })}><span /></button>
                </div>
                <p style={{ fontSize: 12, color: "var(--fg-tertiary)", marginTop: 12 }}>The daily digest appears in-app on your Dashboard — no email account needed.</p>
              </SettingsSection>
            </>
          )}

          {tab === "connectors" && (
            <>
              <window.GoogleConnector.Panel pushToast={pushToast} />
              <window.GoogleConnector.DrivePanel pushToast={pushToast} />
            </>
          )}

          {tab === "sync" && (
            window.SyncBridge?.SyncPanel
              ? <window.SyncBridge.SyncPanel pushToast={pushToast} />
              : <SettingsSection title="Sync across devices" subtitle="Sync module unavailable." />
          )}

          {tab === "shortcuts" && (
            <SettingsSection title="Keyboard shortcuts" subtitle="A small set of consistent shortcuts — modelled on Microsoft conventions.">
              <table className="data">
                <colgroup><col /><col style={{ width: 160 }} /></colgroup>
                <thead><tr><th>Action</th><th>Shortcut</th></tr></thead>
                <tbody>
                  <tr><td>Focus search</td><td><span className="kbd">Ctrl K</span></td></tr>
                  <tr><td>New assignment</td><td><span className="kbd">Ctrl N</span></td></tr>
                  <tr><td>Toggle edit mode</td><td><span className="kbd">Ctrl E</span></td></tr>
                  <tr><td>Open settings</td><td><span className="kbd">Ctrl ,</span></td></tr>
                  <tr><td>Close dialog / exit edit</td><td><span className="kbd">Esc</span></td></tr>
                  <tr><td>Cycle workspace tabs</td><td><span className="kbd">Ctrl Tab</span></td></tr>
                </tbody>
              </table>
            </SettingsSection>
          )}

          {tab === "storage" && (
            <>
              <SettingsSection title="Usage this term" subtitle="Your account has unlimited capacity.">
                <div className="settings-stats">
                  {[["Assignments", usage.assignments, limits.assignments], ["Notes", usage.notes, limits.notes], ["Subjects", usage.courses, limits.courses], ["Library files", usage.library, limits.library]].map(([label, used, cap]) => (
                    <div className="stat" key={label}>
                      <span className="stat-label">{label}</span>
                      <span className="stat-value">{used}{cap !== Infinity && <span style={{ fontSize: 13, color: "var(--fg-tertiary)", fontWeight: 400 }}> / {cap}</span>}</span>
                      <span className="stat-delta">{cap === Infinity ? "Unlimited" : (cap - used) + " remaining"}</span>
                    </div>
                  ))}
                </div>
              </SettingsSection>
              <SettingsSection title="Backup & reset" subtitle="Everything is stored locally in your browser/app profile.">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn btn-secondary" onClick={() => {
                    const payload = { workspace: workspaceName, courses, assignments, notes, library, exportedAt: new Date().toISOString() };
                    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "schoolwork-" + workspaceName.replace(/\W+/g, "-") + ".json"; a.click(); URL.revokeObjectURL(url);
                    pushToast?.({ tone: "success", title: "Backup exported" });
                  }}><Icon name="download" size={14} /> Export this term (JSON)</button>
                  <button className="btn btn-secondary" style={{ color: "var(--error)" }} onClick={() => {
                    if (!confirm("Reset " + workspaceName + " to its starting state? This clears your edits for this term only.")) return;
                    try { Object.keys(localStorage).filter(k => k.includes(":data:") && k.endsWith(workspaceName)).forEach(k => localStorage.removeItem(k)); } catch {}
                    setWorkspaceName(workspaceName);
                    pushToast?.({ tone: "warning", title: "Term reset", body: "Reloaded the starting data for this term." });
                  }}><Icon name="refresh" size={14} /> Reset this term</button>
                </div>
              </SettingsSection>
            </>
          )}

          {tab === "about" && (
            <>
              <SettingsSection title="About Schoolwork" subtitle="A desktop study planner for Senior Secondary students.">
                <dl className="dl">
                  <dt>Version</dt><dd>{(typeof window !== "undefined" && window.schoolworkAPI && window.schoolworkAPI.appVersion) || "—"}</dd>
                  <dt>Storage</dt><dd>Local (this device)</dd>
                  <dt>Signed in as</dt><dd>{account?.email}</dd>
                  <dt>Plan</dt><dd>Unlimited</dd>
                </dl>
              </SettingsSection>
              <SettingsSection title="Legal" subtitle="Please read these before relying on the app.">
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-secondary" onClick={() => setLegal("privacy")}>Privacy Policy</button>
                  <button className="btn btn-secondary" onClick={() => setLegal("terms")}>Terms &amp; Conditions</button>
                </div>
                <p style={{ fontSize: 12, color: "var(--fg-tertiary)", marginTop: 16 }}>© 2026 Schoolwork. Your data is stored locally on this device.</p>
              </SettingsSection>
            </>
          )}
        </div>
      </div>
      {legal && <window.Legal.LegalModal doc={legal} onClose={() => setLegal(null)} />}
    </>
  );
};

const SettingsSection = ({ title, subtitle, children }) => (
  <section style={{ marginBottom: 32 }}>
    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--fg-primary)" }}>{title}</h2>
    {subtitle && <p style={{ margin: "4px 0 16px", fontSize: 13, color: "var(--fg-secondary)" }}>{subtitle}</p>}
    {children}
  </section>
);
const SettingsField = ({ label, hint, children }) => (
  <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 16, alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--bd-subtle)" }}>
    <div>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
      {hint && <div style={{ fontSize: 11, color: "var(--fg-tertiary)", marginTop: 2 }}>{hint}</div>}
    </div>
    <div style={{ maxWidth: 360 }}>{children}</div>
  </div>
);

/* -------------------- ONBOARDING -------------------- */
const ONBOARD_COLORS = ["#2E5AAC", "#7A4FAA", "#A8551A", "#2F7A4D", "#2E6B7A", "#9F6A11", "#B23A48", "#4B5563"];
const Onboarding = ({ pushToast, onNavigate }) => {
  const { useStore } = window.Store;
  const { addCourse, workspaceName } = useStore();
  const { useAuth } = window.Auth;
  const { userName } = useStore();
  const [rows, setRows] = useState([{ code: "", title: "", color: ONBOARD_COLORS[0] }]);

  const setRow = (i, patch) => setRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r));
  const addRow = () => setRows(rs => [...rs, { code: "", title: "", color: ONBOARD_COLORS[rs.length % ONBOARD_COLORS.length] }]);
  const removeRow = (i) => setRows(rs => rs.length > 1 ? rs.filter((_, j) => j !== i) : rs);

  const finish = (thenSchedule) => {
    const valid = rows.filter(r => r.code.trim());
    if (valid.length === 0) { pushToast?.({ tone: "warning", title: "Add at least one subject" }); return; }
    valid.forEach(r => addCourse({ code: r.code.trim(), title: (r.title || r.code).trim(), color: r.color }));
    pushToast?.({ tone: "success", title: valid.length + " subject" + (valid.length === 1 ? "" : "s") + " added" });
    onNavigate?.(thenSchedule ? "calendar" : "assignments");
  };

  return (
    <div className="onboard">
      <div className="onboard-card">
        <div className="onboard-mark">
          <img className="brand-img" src="logo.svg" width="48" height="48" alt="" aria-hidden="true" />
        </div>
        <h1>Welcome{userName ? ", " + (userName.split(" ")[0]) : ""} 👋</h1>
        <p className="onboard-sub">Let's set up <b>{workspaceName}</b>. Add the subjects you're taking this term — you can edit or add more later.</p>

        <div className="onboard-rows">
          {rows.map((r, i) => (
            <div className="onboard-row" key={i}>
              <div className="onboard-swatches">
                {ONBOARD_COLORS.map(col => (
                  <button key={col} className={"onboard-swatch" + (r.color === col ? " active" : "")} style={{ background: col }} onClick={() => setRow(i, { color: col })} aria-label={"colour " + col} />
                ))}
              </div>
              <input className="input" placeholder="Subject (e.g. Chemistry)" value={r.code} onChange={e => setRow(i, { code: e.target.value })} autoFocus={i === 0} />
              <input className="input" placeholder="Full name (optional)" value={r.title} onChange={e => setRow(i, { title: e.target.value })} />
              <button className="iconbtn" aria-label="Remove" onClick={() => removeRow(i)}><Icon name="close" size={14} /></button>
            </div>
          ))}
        </div>
        <button className="btn btn-tertiary" onClick={addRow} style={{ alignSelf: "flex-start" }}><Icon name="plus" size={14} /> Add another subject</button>

        <div className="onboard-actions">
          <button className="btn btn-secondary" onClick={() => finish(true)}>Save &amp; set class times</button>
          <button className="btn btn-primary" onClick={() => finish(false)}>Save &amp; continue</button>
        </div>
        <p className="onboard-foot">Free plan: up to 8 subjects per term. Everything is saved locally to this term.</p>
      </div>
    </div>
  );
};

/* -------------------- WEEKLY SCHEDULE (recurring class times) -------------------- */
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WeeklyScheduleModal = ({ onClose, onEdit, pushToast }) => {
  const { useStore } = window.Store;
  const { schedule, courses, courseById, removeClass, terms, workspaceName, copyFromTerm } = useStore();
  const [copyFrom, setCopyFrom] = useState("");
  const [copyReplace, setCopyReplace] = useState(false);
  const [copySubjects, setCopySubjects] = useState(true);
  const [copyClasses, setCopyClasses] = useState(true);
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  const byDay = (d) => schedule.map((s, i) => ({ ...s, id: s.id || "i" + i })).filter(s => s.day === d).sort((a, b) => a.start.localeCompare(b.start));

  // Source candidates: any term other than this one. For each, count both
  // subjects and schedule rows in localStorage so the picker can label empties.
  const sources = (terms || []).filter(t => t.key !== workspaceName).map(t => {
    let courseCount = 0, scheduleCount = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("schoolwork:data:") && k.endsWith(":" + t.key)) {
          const v = JSON.parse(localStorage.getItem(k) || "{}");
          courseCount  = Math.max(courseCount,  (v.courses  || []).length);
          scheduleCount = Math.max(scheduleCount, (v.schedule || []).length);
        }
      }
    } catch {}
    return { ...t, courseCount, scheduleCount };
  });
  const onCopy = () => {
    if (!copyFrom) return;
    if (!copySubjects && !copyClasses) { pushToast?.({ tone: "warning", title: "Pick something to copy", body: "Tick Subjects, Classes, or both." }); return; }
    if (copyReplace) {
      const pieces = [];
      if (copySubjects && courses.length)   pieces.push(courses.length  + " subject" + (courses.length  === 1 ? "" : "s"));
      if (copyClasses  && schedule.length)  pieces.push(schedule.length + " class"   + (schedule.length === 1 ? "" : "es"));
      if (pieces.length && !confirm("Replace " + pieces.join(" and ") + " in " + workspaceName + " with the ones from " + copyFrom + "?")) return;
    }
    const r = copyFromTerm(copyFrom, { includeCourses: copySubjects, includeSchedule: copyClasses, replace: copyReplace });
    if (!r.ok) {
      const reasonMsg = r.reason === "empty" ? "That term has no subjects or classes saved."
                       : r.reason === "nothing-selected" ? "Tick Subjects, Classes, or both."
                       : "Pick a different term.";
      pushToast?.({ tone: "warning", title: "Nothing to copy", body: reasonMsg });
      return;
    }
    const bits = [];
    if (r.addedSubjects) bits.push(r.addedSubjects + " subject" + (r.addedSubjects === 1 ? "" : "s"));
    if (r.addedClasses)  bits.push(r.addedClasses  + " class"   + (r.addedClasses  === 1 ? "" : "es"));
    pushToast?.({ tone: "success", title: "Copied from " + copyFrom, body: (bits.join(" and ") || "Already up to date") + (bits.length ? " added" : "") });
    setCopyFrom("");
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 560, maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <div className="modal-h">
          <div><h2>Weekly schedule</h2><div style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>These class times repeat every week — scoped to {workspaceName}.</div></div>
          <button className="iconbtn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <div className="modal-b" style={{ overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 0 12px", borderBottom: "1px solid var(--bd-subtle)", marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: "var(--fg-secondary)", marginRight: 4 }}>Copy from</span>
            <select className="select" style={{ height: 30, minWidth: 220 }} value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
              <option value="">Choose a term…</option>
              {sources.map(t => {
                const label = t.courseCount || t.scheduleCount
                  ? " (" + (t.courseCount ? t.courseCount + " subj" : "") + (t.courseCount && t.scheduleCount ? ", " : "") + (t.scheduleCount ? t.scheduleCount + " class" + (t.scheduleCount === 1 ? "" : "es") : "") + ")"
                  : " (empty)";
                return <option key={t.key} value={t.key}>{t.key}{label}</option>;
              })}
            </select>
            <label style={{ fontSize: 12, color: "var(--fg-secondary)", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={copySubjects} onChange={(e) => setCopySubjects(e.target.checked)} /> Subjects
            </label>
            <label style={{ fontSize: 12, color: "var(--fg-secondary)", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={copyClasses} onChange={(e) => setCopyClasses(e.target.checked)} /> Classes
            </label>
            <label style={{ fontSize: 12, color: "var(--fg-secondary)", display: "inline-flex", alignItems: "center", gap: 6 }} title="Clear this term's existing entries for the ticked slices before copying.">
              <input type="checkbox" checked={copyReplace} onChange={(e) => setCopyReplace(e.target.checked)} /> Replace current
            </label>
            <button className="btn btn-secondary btn-sm" onClick={onCopy} disabled={!copyFrom || (!copySubjects && !copyClasses)}><Icon name="export" size={12} /> Copy</button>
          </div>
          {DAY_NAMES.map((name, d) => (
            <div key={d} className="sched-day">
              <div className="sched-day-h">
                <span>{name}</span>
                <button className="btn btn-tertiary btn-sm" onClick={() => onEdit({ mode: "class", data: { day: d } })}><Icon name="plus" size={12} /> Add</button>
              </div>
              {byDay(d).length === 0 && <div className="sched-empty">No classes</div>}
              {byDay(d).map(s => {
                const c = courseById(s.course);
                return (
                  <div key={s.id} className="sched-row" onClick={() => onEdit({ mode: "class", data: s })}>
                    <span className="dot" style={{ background: c?.color || "var(--accent)" }} />
                    <span className="sched-time">{s.start}–{s.end}</span>
                    <span className="sched-title">{s.title}{s.room ? " · " + s.room : ""}</span>
                    <button className="iconbtn" style={{ width: 24, height: 24 }} aria-label="Remove class" onClick={(e) => { e.stopPropagation(); removeClass(s.id); pushToast?.({ tone: "warning", title: "Class removed" }); }}><Icon name="trash" size={13} /></button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="modal-f"><button className="btn btn-primary" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
};

/* ============================================================
   Total Grades — a cross-term gradebook.

   Unlike GradesView (which only ever sees the active term's store),
   this view reads EVERY term's saved profile straight off localStorage
   — the same `schoolwork:data:<accountId>:<profileKey>` keys the store
   persists to — and uses the live store slices for whichever term is
   currently active (so unsaved edits are reflected too). It then keeps
   only the QCE summative instruments (IA1, IA2, IA3, EA), regardless of
   which year/term they belong to, and compiles them into one sheet with
   averages, % complete and a per-instrument breakdown by subject.
   ============================================================ */
const letterGrade = (n) =>
  n >= 93 ? "A" : n >= 90 ? "A−" : n >= 87 ? "B+" : n >= 83 ? "B" : n >= 80 ? "B−" :
  n >= 77 ? "C+" : n >= 73 ? "C" : n >= 70 ? "C−" : n >= 60 ? "D" : "F";

const TotalGradesView = () => {
  const { useStore } = window.Store;
  const store = useStore();
  const { terms, workspaceName, assignments: liveAssignments, courses: liveCourses } = store;
  const { account } = window.Auth.useAuth();
  const accountId = account?.id || "anon";
  const { isSummative, ASSESSMENT_KINDS, STATUS_LABEL, STATUS_BADGE } = window.SchoolworkData;
  const { Badge } = window.UI;

  // Pull every summative task from every term. The active term comes from the
  // live store; all other terms are read from their persisted localStorage
  // profile so nothing is missed just because it isn't the open workspace.
  const rows = useMemo(() => {
    const out = [];
    (terms || []).forEach(t => {
      let courses, assignments;
      if (t.key === workspaceName) {
        courses = liveCourses; assignments = liveAssignments;
      } else {
        try {
          const v = localStorage.getItem("schoolwork:data:" + accountId + ":" + t.key);
          const d = v ? JSON.parse(v) : null;
          courses = (d && d.courses) || [];
          assignments = (d && d.assignments) || [];
        } catch { courses = []; assignments = []; }
      }
      (assignments || []).filter(isSummative).forEach(a => {
        const c = (courses || []).find(x => x.id === a.course);
        const pts = Number(a.points) || 0;
        const graded = a.status === "graded" && a.earned != null && pts > 0;
        out.push({
          rid: t.key + ":" + a.id,
          termKey: t.key, year: t.year || "", term: t.term || "",
          title: a.title || "Untitled",
          code: c?.code || "—", subject: c?.title || "Unknown subject", color: c?.color || "var(--accent)",
          assessment: a.assessment, weight: Number(a.weight) || 0,
          status: a.status || "not_started",
          earned: a.earned, points: pts,
          pct: graded ? (a.earned / pts) * 100 : null,
          graded, due: a.due,
        });
      });
    });
    // Newest term first, then by instrument order (IA1→EA).
    const order = (k) => ASSESSMENT_KINDS.indexOf(k);
    out.sort((a, b) => b.termKey.localeCompare(a.termKey) || order(a.assessment) - order(b.assessment));
    return out;
  }, [terms, workspaceName, liveAssignments, liveCourses, accountId]);

  // ---- headline figures ----
  const gradedRows = rows.filter(r => r.graded);
  const pct = (n, d) => (d > 0 ? (n / d) * 100 : null);
  const weighted = (list) => {
    const g = list.filter(r => r.graded);
    const wsum = g.reduce((s, r) => s + (r.weight || 1), 0);
    if (!wsum) return null;
    return g.reduce((s, r) => s + r.pct * (r.weight || 1), 0) / wsum;
  };
  const overallNum = weighted(rows);
  const overall = overallNum != null ? overallNum.toFixed(1) : "—";
  const completeNum = pct(gradedRows.length, rows.length);
  const pendingCount = rows.filter(r => r.status === "submitted" || r.status === "in_review").length;

  // ---- group by subject code (across every term) ----
  const bySubject = useMemo(() => {
    const map = new Map();
    rows.forEach(r => {
      if (!map.has(r.code)) map.set(r.code, { code: r.code, subject: r.subject, color: r.color, items: [] });
      map.get(r.code).items.push(r);
    });
    return [...map.values()].map(s => {
      const cells = {};
      ASSESSMENT_KINDS.forEach(k => {
        const inst = s.items.filter(r => r.assessment === k && r.graded);
        cells[k] = inst.length ? inst.reduce((a, r) => a + r.pct, 0) / inst.length : null;
      });
      const gradedN = s.items.filter(r => r.graded).length;
      return { ...s, cells, grade: weighted(s.items), gradedN, total: s.items.length, complete: pct(gradedN, s.items.length) };
    }).sort((a, b) => a.code.localeCompare(b.code));
  }, [rows]);

  const exportCsv = () => {
    const head = ["term", "subject_code", "subject", "task", "assessment", "weight", "status", "earned", "points", "percent"];
    const esc = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
    const lines = rows.map(r => [
      r.year + " " + r.term, r.code, r.subject, r.title, r.assessment, r.weight + "%",
      STATUS_LABEL[r.status] || r.status, r.earned ?? "", r.points || "",
      r.pct != null ? r.pct.toFixed(1) + "%" : "",
    ].map(esc).join(","));
    const blob = new Blob([head.join(",") + "\n" + lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a"); el.href = url; el.download = "total-grades.csv"; el.click();
    URL.revokeObjectURL(url);
  };

  const cellPct = (v) => v == null
    ? <span style={{ color: "var(--fg-tertiary)" }}>—</span>
    : <span style={{ color: v >= 85 ? "var(--success)" : v >= 78 ? "var(--accent)" : "var(--warning)" }}><b>{v.toFixed(0)}</b></span>;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="breadcrumb">Workspace · All terms</div>
          <h1>Total grades</h1>
        </div>
        <div className="actions">
          <button className="btn btn-tertiary" onClick={exportCsv} disabled={!rows.length}>
            <Icon name="export" size={14} /> Export compiled sheet
          </button>
        </div>
      </div>

      <div className="content">
        <div className="dash-row">
          <div className="stat">
            <span className="stat-label">Overall average</span>
            <span className="stat-value">{overall}{overall !== "—" && <span style={{ fontSize: 14, color: "var(--fg-tertiary)", fontWeight: 400 }}> %</span>}</span>
            <span className="stat-delta">{overallNum != null ? "letter " + letterGrade(overallNum) + " · weighted by task" : "no graded summative work yet"}</span>
          </div>
          <div className="stat">
            <span className="stat-label">% complete</span>
            <span className="stat-value">{completeNum != null ? completeNum.toFixed(0) : "—"}{completeNum != null && <span style={{ fontSize: 14, color: "var(--fg-tertiary)", fontWeight: 400 }}> %</span>}</span>
            <span className="stat-delta">{gradedRows.length} of {rows.length} summative graded</span>
          </div>
          <div className="stat">
            <span className="stat-label">Summative tasks</span>
            <span className="stat-value">{rows.length}</span>
            <span className="stat-delta">IA1–IA3 &amp; EA · all terms</span>
          </div>
          <div className="stat">
            <span className="stat-label">Pending grading</span>
            <span className="stat-value">{pendingCount}</span>
            <span className="stat-delta">submitted, awaiting marks</span>
          </div>
        </div>

        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-h">
            <h2>By subject</h2>
            <span className="panel-sub">Averaged across every term · IA &amp; EA only</span>
          </div>
          {bySubject.length === 0 ? (
            <div className="panel-b"><p style={{ fontSize: 13, color: "var(--fg-tertiary)" }}>No summative tasks tagged yet. Tag assignments as IA1–IA3 or EA in any term and they'll be compiled here.</p></div>
          ) : (
          <table className="data">
            <colgroup>
              <col style={{ width: 110 }} /><col />
              <col style={{ width: 64 }} /><col style={{ width: 64 }} /><col style={{ width: 64 }} /><col style={{ width: 64 }} />
              <col style={{ width: 80 }} /><col style={{ width: 200 }} /><col style={{ width: 70 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Code</th><th>Subject</th>
                <th className="num">IA1</th><th className="num">IA2</th><th className="num">IA3</th><th className="num">EA</th>
                <th className="num">Grade</th><th>Complete</th><th>Letter</th>
              </tr>
            </thead>
            <tbody>
              {bySubject.map(s => (
                <tr key={s.code}>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 500 }}>
                      <span className="dot" style={{ background: s.color }} /> {s.code}
                    </span>
                  </td>
                  <td>{s.subject}</td>
                  <td className="num">{cellPct(s.cells.IA1)}</td>
                  <td className="num">{cellPct(s.cells.IA2)}</td>
                  <td className="num">{cellPct(s.cells.IA3)}</td>
                  <td className="num">{cellPct(s.cells.EA)}</td>
                  <td className="num"><b>{s.grade != null ? s.grade.toFixed(1) : "—"}</b></td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: "var(--bg-app)" }}>
                        <span style={{ flex: s.complete || 0, background: "var(--accent)" }} />
                        <span style={{ flex: 100 - (s.complete || 0) }} />
                      </div>
                      <span style={{ fontSize: 11, color: "var(--fg-tertiary)", minWidth: 52 }}>{s.gradedN}/{s.total}</span>
                    </div>
                  </td>
                  <td>{s.grade != null ? <Badge tone={s.grade >= 85 ? "success" : s.grade >= 78 ? "accent" : "warning"}>{letterGrade(s.grade)}</Badge> : <span style={{ color: "var(--fg-tertiary)" }}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>

        <div className="panel">
          <div className="panel-h">
            <h2>All summative tasks</h2>
            <span className="panel-sub">{rows.length} item{rows.length === 1 ? "" : "s"} across all terms</span>
          </div>
          {rows.length === 0 ? (
            <div className="panel-b"><p style={{ fontSize: 13, color: "var(--fg-tertiary)" }}>Nothing to compile yet.</p></div>
          ) : (
          <table className="data">
            <colgroup>
              <col style={{ width: 150 }} /><col style={{ width: 100 }} /><col />
              <col style={{ width: 90 }} /><col style={{ width: 70 }} /><col style={{ width: 120 }} />
              <col style={{ width: 90 }} /><col style={{ width: 70 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Term</th><th>Subject</th><th>Task</th>
                <th>Assessment</th><th className="num">Weight</th><th>Status</th>
                <th className="num">Score</th><th className="num">%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.rid}>
                  <td className="muted">{r.year}{r.term ? " · " + r.term : ""}</td>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                      <span className="dot" style={{ background: r.color }} /> {r.code}
                    </span>
                  </td>
                  <td>{r.title}</td>
                  <td><Badge tone="accent">{r.assessment}</Badge></td>
                  <td className="num muted">{r.weight}%</td>
                  <td><Badge tone={STATUS_BADGE[r.status] || "neutral"}>{STATUS_LABEL[r.status] || r.status}</Badge></td>
                  <td className="num">{r.earned != null ? <><b>{r.earned}</b>/{r.points}</> : <span style={{ color: "var(--fg-tertiary)" }}>—</span>}</td>
                  <td className="num" style={{ color: r.pct == null ? "var(--fg-tertiary)" : r.pct >= 90 ? "var(--success)" : r.pct >= 80 ? "var(--accent)" : "var(--warning)" }}>
                    {r.pct != null ? <b>{r.pct.toFixed(0)}%</b> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      </div>
    </>
  );
};

window.Views = { Dashboard, CoursesView, CalendarView, NotesView, GradesView, TotalGradesView, CourseDetail, Inspector, SettingsView, LibraryView, Onboarding };
