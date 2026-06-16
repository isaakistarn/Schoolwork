/* global React, ReactDOM, Icon */

const { useState, useEffect, useMemo, useCallback } = React;
const { AppBar, Sidebar, StatusBar } = window.Chrome;
const { Dashboard, CoursesView, CalendarView, NotesView, GradesView, TotalGradesView, CourseDetail, Inspector, LibraryView } = window.Views;
const AssignmentsView = window.AssignmentsView;

/* ============================================================
   Quick add modal — now actually creates the assignment
   ============================================================ */
const QuickAddModal = ({ open, onClose, onAdd }) => {
  const { useStore } = window.Store;
  const { courses } = useStore();
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState(courses[0]?.id || "");
  const [type, setType] = useState("Homework");
  const [assessment, setAssessment] = useState("");
  const [due, setDue] = useState("2026-06-02");
  const [time, setTime] = useState("23:59");
  const [draftDate, setDraftDate] = useState("");
  const [draftTime, setDraftTime] = useState("23:59");
  const [weight, setWeight] = useState(5);
  const [priority, setPriority] = useState("med");
  const [notes, setNotes] = useState("");
  const ASSESSMENT_KINDS = window.SchoolworkData?.ASSESSMENT_KINDS || [];

  const essay = window.SchoolworkData?.isEssay?.(type);

  // Reset the course only when the modal opens (depend on `open` alone, so a
  // re-render elsewhere can't reset the form or steal focus mid-entry).
  useEffect(() => {
    if (!open) return;
    setCourse(courses[0]?.id || "");
    setAssessment("");
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  if (!open) return null;
  const create = () => {
    onAdd && onAdd({
      title: title || "Untitled assignment", course, type, assessment,
      due: due + "T" + time,
      draftDue: draftDate ? draftDate + "T" + (draftTime || "23:59") : null,
      weight: Number(weight), priority, notes,
    });
    setTitle(""); setNotes(""); setDraftDate(""); setAssessment("");
    onClose();
  };
  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Quick add assignment">
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-h">
          <h2>New assignment</h2>
          <button className="iconbtn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <div className="modal-b" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="field">
            <label>Title</label>
            <input className="input" autoFocus placeholder="e.g. Problem Set 10" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="field">
              <label>Course</label>
              <select className="select" value={course} onChange={e => setCourse(e.target.value)}>
                {courses.map(c => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Type</label>
              <select className="select" value={type} onChange={e => setType(e.target.value)}>
                <option>Essay</option><option>Lab</option><option>Practical</option><option>Problem Set</option>
                <option>Homework</option><option>Quiz</option><option>Topic Test</option><option>Exam</option>
                <option>Project</option><option>Investigation</option><option>Response</option>
              </select>
            </div>
            <div className="field">
              <label>Assessment</label>
              <select className="select" value={assessment} title="QCE summative assessments (IA1–IA3, EA) count toward your class grade." onChange={e => {
                const v = e.target.value;
                setAssessment(v);
                const dw = window.SchoolworkData?.ASSESSMENT_DEFAULT_WEIGHT?.[v];
                if (dw != null && (Number(weight) === 5 || weight === "")) setWeight(dw);
              }}>
                <option value="">None (not assessed)</option>
                {ASSESSMENT_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Due date</label>
              <input className="input" type="date" value={due} onChange={e => setDue(e.target.value)} />
            </div>
            <div className="field">
              <label>Due time</label>
              <input className="input" type="time" value={time} onChange={e => setTime(e.target.value)} />
            </div>
            <div className="field">
              <label>Draft date (optional)</label>
              <input className="input" type="date" value={draftDate} onChange={e => setDraftDate(e.target.value)} />
            </div>
            <div className="field">
              <label>Draft time</label>
              <input className="input" type="time" value={draftTime} onChange={e => setDraftTime(e.target.value)} disabled={!draftDate} />
            </div>
            <div className="field">
              <label>Weight (%)</label>
              <input className="input" type="number" value={weight} onChange={e => setWeight(e.target.value)} />
            </div>
            <div className="field">
              <label>Priority</label>
              {essay ? (
                <input className="input" value="Set automatically" readOnly title="Essays ramp from low (3 weeks out) to high (final week)." />
              ) : (
                <select className="select" value={priority} onChange={e => setPriority(e.target.value)}>
                  <option value="low">Low</option>
                  <option value="med">Medium</option>
                  <option value="high">High</option>
                </select>
              )}
            </div>
          </div>
          {essay && (
            <div style={{ fontSize: 12, color: "var(--fg-tertiary)", marginTop: -4 }}>
              <Icon name="circle-warn" size={12} /> Essay priority is automatic: low 3 weeks out, medium 2 weeks, high in the final week.
            </div>
          )}
          <div className="field">
            <label>Notes (optional)</label>
            <textarea className="textarea" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add details, link sources, paste the assignment brief…" />
          </div>
        </div>
        <div className="modal-f">
          <button className="btn btn-tertiary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={create} disabled={!course}>Create assignment</button>
        </div>
      </div>
    </div>
  );
};

/* ============================================================
   Rate-limit notice modal
   ============================================================ */
const LimitModal = ({ notice, onClose }) => {
  if (!notice) return null;
  const labels = { assignments: "assignments", notes: "notes", courses: "subjects", calendars: "calendars", events: "calendar events", library: "library files" };
  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-h"><h2>Free plan limit reached</h2><button className="iconbtn" onClick={onClose}><Icon name="close" /></button></div>
        <div className="modal-b">
          <p style={{ fontSize: 14, color: "var(--fg-secondary)", lineHeight: 1.6 }}>
            Your plan allows up to <b>{notice.cap}</b> {labels[notice.kind] || notice.kind} per term. Delete one you
            no longer need, or sign in with an unlimited account to lift the cap.
          </p>
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--fg-tertiary)" }}>
            Unlimited access is granted to approved accounts. Contact your administrator to upgrade.
          </div>
        </div>
        <div className="modal-f"><button className="btn btn-primary" onClick={onClose}>Got it</button></div>
      </div>
    </div>
  );
};

/* ============================================================
   Toast host
   ============================================================ */
const ToastHost = ({ toasts, dismiss }) => (
  <div className="toast-host">
    {toasts.map(t => (
      <div key={t.id} className={"toast " + (t.tone || "")}>
        <Icon name={t.tone === "success" ? "circle-check" : t.tone === "warning" ? "circle-warn" : "bell"} size={16} />
        <div style={{ flex: 1 }}>
          <div className="t-title">{t.title}</div>
          {t.body && <div className="t-body">{t.body}</div>}
        </div>
        <button className="iconbtn" style={{ width: 22, height: 22 }} onClick={() => dismiss(t.id)} aria-label="Dismiss">
          <Icon name="close" size={12} />
        </button>
      </div>
    ))}
  </div>
);

/* ============================================================
   Tweaks defaults + accents
   ============================================================ */
const TWEAKS_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#2E5AAC",
  "theme": "dark",
  "density": "comfortable",
  "showInspector": true,
  "sidebarCollapsed": false
}/*EDITMODE-END*/;

const TWEAKS_KEY = "schoolwork:tweaks";
const loadTweaks = () => {
  try { return { ...TWEAKS_DEFAULTS, ...JSON.parse(localStorage.getItem(TWEAKS_KEY) || "{}") }; }
  catch { return { ...TWEAKS_DEFAULTS }; }
};

const ACCENT_PRESETS = [
  ["#2E5AAC", "Slate blue"],
  ["#1E5F4F", "Forest"],
  ["#7A4FAA", "Plum"],
  ["#A8551A", "Burnt sienna"],
  ["#2E6B7A", "Muted teal"],
];

/* ============================================================
   Root — auth gate + splash
   ============================================================ */
const App = () => (
  <window.Auth.AuthProvider>
    <window.Auth.Splash>
      <Gate />
    </window.Auth.Splash>
  </window.Auth.AuthProvider>
);

const Gate = () => {
  const { account } = window.Auth.useAuth();
  const [tweaks, setTweak] = useTweaks(loadTweaks());

  // Remember appearance choices across launches (dark is the default).
  useEffect(() => { try { localStorage.setItem(TWEAKS_KEY, JSON.stringify(tweaks)); } catch {} }, [tweaks]);

  // Apply theme + accent globally (covers the login screen too)
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", tweaks.theme);
    document.documentElement.setAttribute("data-density", tweaks.density);
    document.documentElement.style.setProperty("--accent", tweaks.accent);
    const c = tweaks.accent;
    document.documentElement.style.setProperty("--accent-hover", shade(c, -10));
    document.documentElement.style.setProperty("--accent-active", shade(c, -20));
    document.documentElement.style.setProperty("--accent-soft", tint(c, tweaks.theme === "dark" ? -70 : 88));
    document.documentElement.style.setProperty("--accent-line", tint(c, tweaks.theme === "dark" ? -40 : 60));
    document.documentElement.style.setProperty("--bg-selected", tint(c, tweaks.theme === "dark" ? -65 : 90));
  }, [tweaks.theme, tweaks.density, tweaks.accent]);

  if (!account) return <window.Auth.LoginScreen />;

  const { StoreProvider, EditProvider } = window.Store;
  return (
    <StoreProvider>
      <EditProvider>
        <AppInner tweaks={tweaks} setTweak={setTweak} />
      </EditProvider>
    </StoreProvider>
  );
};

const AppInner = ({ tweaks, setTweak }) => {
  const { useStore, useEdit } = window.Store;
  const store = useStore();
  const { workspaceName, setWorkspaceName, userName, addAssignment, removeAssignment, limitNotice, clearLimitNotice } = store;
  const { editMode, setEditMode } = useEdit();
  const { account, logout, isUnlimited, tier, prefs } = window.Auth.useAuth();

  // Tell the desktop main process which account is active so Google
  // credentials/tokens are scoped per account (new accounts start with none).
  useEffect(() => { window.schoolworkAPI?.setAccount?.(account?.id); }, [account?.id]);

  const [active, setActive] = useState("dashboard");
  const [selectedRows, setSelectedRows] = useState([]);
  const [openId, setOpenId] = useState(store.assignments[0]?.id || null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [workArea, setWorkArea] = useState(null);
  const [toasts, setToasts] = useState([]);

  const prefsRef = useRef(prefs); prefsRef.current = prefs;
  const dismissToast = useCallback((id) => setToasts(t => t.filter(x => x.id !== id)), []);
  const pushToast = useCallback((t) => {
    if (prefsRef.current && prefsRef.current.inApp === false) return; // honour the in-app notifications toggle
    const id = Date.now() + Math.random();
    setToasts(rows => [...rows, { id, ...t }]);
    setTimeout(() => setToasts(rows => rows.filter(x => x.id !== id)), 3000); // auto-dismiss after 3s
  }, []);

  // Warn before closing the window with unsaved changes
  useEffect(() => {
    const h = (e) => { if (store.dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [store.dirty]);

  const guardLeave = () => {
    if (!store.dirty) return true;
    const ok = window.confirm("You have unsaved changes. Leave this screen without saving them?");
    if (ok) store.setDirty(false);
    return ok;
  };
  const navigate = (id) => {
    if (!guardLeave()) return;
    setActive(id);
    setInspectorOpen(id === "assignments");
  };

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); document.querySelector(".appbar-center input")?.focus(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "n") { e.preventDefault(); setQuickAddOpen(true); }
      if ((e.ctrlKey || e.metaKey) && e.key === "e") { e.preventDefault(); setEditMode(!editMode); }
      if ((e.ctrlKey || e.metaKey) && e.key === ",") { e.preventDefault(); setActive("settings"); }
      if (e.key === "Escape") {
        if (workArea) setWorkArea(null);
        else if (quickAddOpen) setQuickAddOpen(false);
        else if (editMode) setEditMode(false);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [editMode, quickAddOpen, workArea]);

  // Keep a valid selected assignment when the profile changes
  useEffect(() => {
    if (!store.assignments.find(a => a.id === openId)) setOpenId(store.assignments[0]?.id || null);
  }, [workspaceName, store.assignments.length]);

  const onOpenAssignment = (id) => { setOpenId(id); setInspectorOpen(true); setActive("assignments"); };
  const onOpenWorkArea = (assignmentId, fileId) => { setOpenId(assignmentId); setWorkArea({ assignmentId, fileId }); };
  const onDeleteAssignment = (id) => {
    const a = store.assignments.find(x => x.id === id);
    removeAssignment(id);
    if (openId === id) setOpenId(store.assignments.find(x => x.id !== id)?.id || null);
    setSelectedRows(rows => rows.filter(r => r !== id));
    pushToast({ tone: "warning", title: "Assignment deleted", body: a ? "“" + a.title + "” removed." : undefined });
  };
  const onQuickAdd = (row) => {
    const created = addAssignment(row);
    if (created) { setOpenId(created.id); setActive("assignments"); pushToast({ tone: "success", title: "Assignment created", body: "Added to " + workspaceName + "." }); }
  };

  const renderView = () => {
    // First-run / empty term: invite the user to add the subjects they take
    if (store.courses.length === 0 && (active === "dashboard" || active === "assignments")) {
      return <window.Views.Onboarding pushToast={pushToast} onNavigate={navigate} />;
    }
    if (active === "dashboard")   return <Dashboard onOpen={onOpenAssignment} onNavigate={setActive} onQuickAdd={() => setQuickAddOpen(true)} />;
    if (active === "assignments") return <AssignmentsView onOpen={onOpenAssignment} onOpenWorkArea={onOpenWorkArea} onDelete={onDeleteAssignment} onNew={() => setQuickAddOpen(true)} selected={selectedRows} setSelected={setSelectedRows} pushToast={pushToast} />;
    if (active === "calendar")    return <CalendarView pushToast={pushToast} />;
    if (active === "study")       return <window.Views.StudyView pushToast={pushToast} onOpen={onOpenAssignment} onNavigate={setActive} />;
    if (active === "ai-history")  return <window.Views.AiHistoryView pushToast={pushToast} onNavigate={setActive} />;
    if (active === "notes")       return <NotesView pushToast={pushToast} />;
    if (active === "grades")      return <GradesView />;
    if (active === "totals")      return <TotalGradesView />;
    if (active === "courses")     return <CoursesView onNavigate={setActive} pushToast={pushToast} />;
    if (active === "resources")   return <LibraryView pushToast={pushToast} />;
    if (active === "settings")    return <window.Views.SettingsView tweaks={tweaks} setTweak={setTweak} pushToast={pushToast} onLogout={logout} />;
    if (active === "archive") {
      return (
        <>
          <div className="page-header"><div><div className="breadcrumb">Workspace · {workspaceName}</div><h1>Archive</h1></div></div>
          <div className="content">
            <div className="empty" style={{ background: "var(--bg-surface)", border: "1px solid var(--bd-default)", borderRadius: 6, padding: "var(--s-10)" }}>
              <div className="empty-icon"><Icon name="archive" /></div>
              <h3>Archive is empty for this term</h3>
              <p>Graded assignments you archive will appear here. You can restore them at any time.</p>
            </div>
          </div>
        </>
      );
    }
    if (active.startsWith("course:")) {
      const cid = active.slice("course:".length);
      return <CourseDetail courseId={cid} pushToast={pushToast} onNavigate={setActive} />;
    }
    return null;
  };

  const showInspector = inspectorOpen && tweaks.showInspector && active === "assignments";
  const syncTime = new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });

  return (
    <div className="app no-titlebar">
      <AppBar
        sidebarCollapsed={tweaks.sidebarCollapsed}
        onToggleSidebar={() => setTweak("sidebarCollapsed", !tweaks.sidebarCollapsed)}
        theme={tweaks.theme}
        onToggleTheme={() => setTweak("theme", tweaks.theme === "dark" ? "light" : "dark")}
        onCommand={() => document.querySelector(".appbar-center input")?.focus()}
        editMode={editMode}
        onToggleEdit={() => setEditMode(!editMode)}
        workspaceName={workspaceName}
        onChangeWorkspace={(pk) => { if (guardLeave()) setWorkspaceName(pk); }}
        onOpenSettings={() => navigate("settings")}
        onLogout={() => { if (guardLeave()) logout(); }}
        onOpenItem={onOpenAssignment}
        onNavigate={navigate}
        onRefresh={() => { const n = store.reloadProfile(); pushToast({ tone: "success", title: "Refreshed", body: n + " assignment" + (n === 1 ? "" : "s") + " reloaded from storage." }); }}
        userName={userName}
        tier={tier}
        prefs={prefs}
      />
      <Sidebar
        collapsed={tweaks.sidebarCollapsed}
        active={active}
        onNavigate={navigate}
        onToggle={() => setTweak("sidebarCollapsed", !tweaks.sidebarCollapsed)}
      />
      <main className="main" data-screen-label={"main:" + active}>
        {renderView()}
      </main>
      <aside className={"inspector" + (showInspector ? "" : " closed")} aria-label="Details panel">
        {showInspector && <Inspector assignmentId={openId} onClose={() => setInspectorOpen(false)} onOpenWorkArea={onOpenWorkArea} onDelete={onDeleteAssignment} pushToast={pushToast} />}
      </aside>
      <StatusBar
        selectionCount={selectedRows.length}
        syncTime={syncTime}
        density={tweaks.density}
        onDensity={(d) => setTweak("density", d)}
      />

      <QuickAddModal open={quickAddOpen} onClose={() => setQuickAddOpen(false)} onAdd={onQuickAdd} />
      {workArea && <window.WorkArea assignmentId={workArea.assignmentId} onClose={() => setWorkArea(null)} pushToast={pushToast} />}
      <LimitModal notice={limitNotice} onClose={clearLimitNotice} />
      <ToastHost toasts={toasts} dismiss={dismissToast} />
      {window.UpdateBanner && <window.UpdateBanner.Banner />}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Appearance" />
        <TweakColor label="Accent colour" value={tweaks.accent} options={ACCENT_PRESETS.map(p => p[0])} onChange={(v) => setTweak("accent", v)} />
        <TweakRadio label="Density" value={tweaks.density}
          options={[{ value: "compact", label: "Compact" }, { value: "comfortable", label: "Comfortable" }]}
          onChange={(v) => setTweak("density", v)} />
        <TweakSection label="Layout" />
        <TweakToggle label="Collapse sidebar" value={tweaks.sidebarCollapsed} onChange={(v) => setTweak("sidebarCollapsed", v)} />
      </TweaksPanel>
    </div>
  );
};

/* Colour helpers */
function hexToRgb(h) { h = h.replace("#", ""); return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]; }
function rgbToHex(r,g,b) { return "#" + [r,g,b].map(x => Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,"0")).join(""); }
function shade(hex, pct) { const [r,g,b] = hexToRgb(hex); const f = (1 + pct/100); return rgbToHex(r*f, g*f, b*f); }
function tint(hex, pct) {
  const [r,g,b] = hexToRgb(hex);
  if (pct >= 0) { const m = pct / 100; return rgbToHex(r + (255 - r) * m, g + (255 - g) * m, b + (255 - b) * m); }
  const m = -pct / 100; return rgbToHex(r * (1 - m), g * (1 - m), b * (1 - m));
}

// Passively check whether the shared folder has newer data than this device
// has seen — the result is surfaced in Settings → Sync devices so the user
// can choose to pull it. We deliberately do NOT auto-apply anything: edits
// stay in localStorage on this device until the user clicks Push or Pull.
(async () => {
  try { await window.SyncBridge?.checkOnStartup?.(); }
  catch (e) { console.warn("Schoolwork sync: startup check failed", e); }
  ReactDOM.createRoot(document.getElementById("root")).render(<App />);
})();
