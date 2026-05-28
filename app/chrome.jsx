/* global React, Icon */

/* ============================================================
   App chrome — App bar, Sidebar, Status bar
   (The fake Windows title bar with min/max/close was removed —
    the OS window frame already provides working controls.)
   ============================================================ */

const { useState, useEffect, useRef, useMemo, useCallback } = React;

/* ---------- App bar ---------- */
const AppBar = ({ sidebarCollapsed, onToggleSidebar, theme, onToggleTheme, onCommand, editMode, onToggleEdit, workspaceName, onChangeWorkspace, onOpenSettings, onLogout, onOpenItem, onNavigate, onRefresh, userName, tier, prefs }) => {
  const [termOpen, setTermOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const termRef = useRef(null);
  const userRef = useRef(null);
  const notifRef = useRef(null);
  const searchRef = useRef(null);

  const { useStore } = window.Store;
  const { assignments, notes, courses, library, courseById, terms } = useStore();
  const { fmt } = window.UI;
  const { termState, termDatesLabel } = window.SchoolworkData;

  // Global search across the active term's workspace.
  const q = query.trim().toLowerCase();
  const results = !q ? [] : (() => {
    const out = [];
    (courses || []).filter(c => ((c.code || "") + " " + (c.title || "")).toLowerCase().includes(q)).slice(0, 4)
      .forEach(c => out.push({ key: "c" + c.id, kind: "Subject", label: c.code, sub: c.title, icon: "courses", run: () => onNavigate?.("course:" + c.id) }));
    (assignments || []).filter(a => ((a.title || "") + " " + (a.id || "")).toLowerCase().includes(q)).slice(0, 6)
      .forEach(a => out.push({ key: "a" + a.id, kind: "Assignment", label: a.title, sub: courseById(a.course)?.code, icon: "assignments", run: () => onOpenItem?.(a.id) }));
    (notes || []).filter(n => ((n.title || "") + " " + (n.body || "")).toLowerCase().includes(q)).slice(0, 4)
      .forEach(n => out.push({ key: "n" + n.id, kind: "Note", label: n.title, sub: courseById(n.course)?.code, icon: "notes", run: () => onNavigate?.("notes") }));
    (library || []).filter(f => (f.name || "").toLowerCase().includes(q)).slice(0, 4)
      .forEach(f => out.push({ key: "l" + f.id, kind: "File", label: f.name, icon: "library", run: () => onNavigate?.("resources") }));
    return out.slice(0, 14);
  })();
  const runResult = (r) => { r.run(); setQuery(""); setSearchOpen(false); };

  // Notifications: open assignments that are overdue or due within the lead window
  const now = new Date();
  const leadMs = (prefs?.leadTimeHours ?? 24) * 3600e3;
  const notifs = assignments
    .filter(a => a.status !== "graded" && a.status !== "submitted")
    .map(a => ({ a, due: new Date(a.due) }))
    .filter(x => (x.due - now) <= leadMs)
    .sort((x, y) => x.due - y.due);
  const notifCount = notifs.length;

  useEffect(() => {
    if (!termOpen && !userOpen && !notifOpen && !searchOpen) return;
    const h = (e) => {
      if (termRef.current && !termRef.current.contains(e.target)) setTermOpen(false);
      if (userRef.current && !userRef.current.contains(e.target)) setUserOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [termOpen, userOpen, notifOpen, searchOpen]);

  // Term list comes from the user's configurable academic-year settings; the
  // complete / current / upcoming state is DERIVED from each term's dates
  // relative to today (reusing `now` above), so it always tracks the calendar.
  const TERMS = (terms || []).map(t => ({ ...t, state: termState(t, now), dates: termDatesLabel(t) }));
  const initials = (userName || "").split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <header className="appbar" role="banner">
      <div className="appbar-left">
        <button className="iconbtn" onClick={onToggleSidebar} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
          <Icon name={sidebarCollapsed ? "side-expand" : "side-collapse"} />
        </button>
        <div className="brand" aria-label="Schoolwork application">
          <img className="brand-img" src="logo.svg" width="24" height="24" alt="" aria-hidden="true" />
          <span>Schoolwork</span>
        </div>
        <div className="workspace-wrap" ref={termRef}>
          <button className={"workspace" + (termOpen ? " open" : "")} aria-haspopup="listbox" aria-expanded={termOpen} onClick={() => setTermOpen(o => !o)}>
            <span>{workspaceName}</span>
            <Icon name="chevron-down" size={12} />
          </button>
          {termOpen && (
            <div className="workspace-menu" role="listbox">
              <div className="workspace-menu-h">Switch term</div>
              {TERMS.map(t => (
                <button
                  key={t.key}
                  className={"workspace-menu-item" + (workspaceName === t.key ? " active" : "")}
                  role="option" aria-selected={workspaceName === t.key}
                  onClick={() => { onChangeWorkspace?.(t.key); setTermOpen(false); }}
                >
                  <div className="wm-row">
                    <span className="wm-year">{t.year}</span>
                    <span className={"wm-state " + t.state}>
                      {t.state === "current" ? "Current" : t.state === "complete" ? "Complete" : "Upcoming"}
                    </span>
                  </div>
                  <div className="wm-term">{t.term}</div>
                  <div className="wm-dates">{t.dates}</div>
                </button>
              ))}
              <div className="workspace-menu-f">
                <span className="wm-dates" style={{ padding: "2px 4px" }}>Each term keeps its own assignments, notes &amp; files.</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="appbar-center">
        <div className="search-wrap" ref={searchRef} style={{ position: "relative", width: "100%" }}>
          <div className="searchbar" role="search" style={{ width: "100%" }}>
            <Icon name="search" size={14} />
            <input
              value={query}
              placeholder="Search assignments, notes, subjects…"
              onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
              onFocus={() => { if (query.trim()) setSearchOpen(true); }}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setSearchOpen(false); e.currentTarget.blur(); }
                else if (e.key === "Enter") { e.preventDefault(); if (results[0]) runResult(results[0]); }
              }}
            />
            <span className="kbd">Ctrl K</span>
          </div>
          {searchOpen && q && (
            <div className="workspace-menu" role="listbox" style={{ left: 0, right: 0, width: "auto", top: "calc(100% + 6px)", maxHeight: 400, overflowY: "auto" }}>
              <div className="workspace-menu-h">Results for “{query.trim()}”</div>
              {results.length === 0 && <div className="notif-empty" style={{ color: "var(--fg-secondary)" }}>No matches in this term.</div>}
              {results.map(r => (
                <button key={r.key} className="workspace-menu-item" role="option" onMouseDown={(e) => e.preventDefault()} onClick={() => runResult(r)}>
                  <span className="wm-term" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Icon name={r.icon} size={13} /> {r.label}
                  </span>
                  <span className="wm-dates">{r.kind}{r.sub ? " · " + r.sub : ""}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="appbar-right">
        <button className={"editmode-btn" + (editMode ? " on" : "")} onClick={onToggleEdit} aria-pressed={editMode} title={editMode ? "Exit edit mode (Esc)" : "Enter edit mode"}>
          <span className="pulse" />
          {editMode ? "Editing" : "Edit"}
        </button>
        <button className="iconbtn" aria-label="Refresh" title="Refresh" onClick={onRefresh}>
          <Icon name="refresh" size={15} />
        </button>
        <div className="workspace-wrap" ref={notifRef}>
          <button className="iconbtn" aria-label="Notifications" title="Notifications" aria-haspopup="menu" aria-expanded={notifOpen} onClick={() => setNotifOpen(o => !o)}>
            <Icon name="bell" />
            {notifCount > 0 && prefs?.inApp !== false && <span className="badge">{notifCount}</span>}
          </button>
          {notifOpen && (
            <div className="workspace-menu" role="menu" style={{ right: 0, left: "auto", width: 320 }}>
              <div className="workspace-menu-h">Notifications {notifCount > 0 && "· " + notifCount}</div>
              {notifs.length === 0 && (
                <div className="notif-empty"><Icon name="circle-check" size={18} /> You're all caught up.</div>
              )}
              {notifs.map(({ a, due }) => {
                const c = courseById(a.course);
                const info = fmt.daysUntil(a.due);
                return (
                  <button key={a.id} className="workspace-menu-item" role="menuitem" onClick={() => { onOpenItem?.(a.id); setNotifOpen(false); }}>
                    <span className="wm-term" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span className="dot" style={{ background: c?.color || "var(--accent)" }} /> {a.title}
                    </span>
                    <span className="wm-dates" style={{ color: info.tone === "error" ? "var(--error)" : info.tone === "warning" ? "var(--warning)" : "var(--fg-tertiary)" }}>
                      {c?.code ? c.code + " · " : ""}{info.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button className="iconbtn" aria-label="Toggle theme" title={"Switch to " + (theme === "dark" ? "light" : "dark") + " mode"} onClick={onToggleTheme}>
          <Icon name={theme === "dark" ? "sun" : "moon"} />
        </button>
        <button className="iconbtn" aria-label="Settings" title="Settings (Ctrl ,)" onClick={onOpenSettings}>
          <Icon name="settings" />
        </button>
        <div className="workspace-wrap" ref={userRef}>
          <button className="user-chip" aria-haspopup="menu" aria-expanded={userOpen} onClick={() => setUserOpen(o => !o)}>
            <span className="avatar" aria-hidden="true">{initials || "U"}</span>
            <span className="uname">{userName}</span>
            <Icon name="chevron-down" size={12} />
          </button>
          {userOpen && (
            <div className="workspace-menu" role="menu" style={{ right: 0, left: "auto", width: 220 }}>
              <div className="user-menu-head">
                <span className="avatar lg" aria-hidden="true">{initials || "U"}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="um-name">{userName}</div>
                  <div className="um-tier"><span className="badge accent">Unlimited</span></div>
                </div>
              </div>
              <button className="workspace-menu-item" role="menuitem" onClick={() => { onOpenSettings(); setUserOpen(false); }}>
                <span className="wm-term">Settings</span>
                <span className="wm-dates">Account, appearance, connectors</span>
              </button>
              <button className="workspace-menu-item" role="menuitem" style={{ color: "var(--error)" }} onClick={() => { setUserOpen(false); onLogout?.(); }}>
                <span className="wm-term">Log out</span>
                <span className="wm-dates">Return to the sign-in screen</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

/* ---------- Sidebar ---------- */
const NAV_PRIMARY = [
  { id: "dashboard",   label: "Dashboard",   icon: "home" },
  { id: "assignments", label: "Assignments", icon: "assignments", count: "assignmentsOpen" },
  { id: "calendar",    label: "Calendar",    icon: "calendar" },
  { id: "notes",       label: "Notes",       icon: "notes", count: "notes" },
  { id: "grades",      label: "Grades",      icon: "grades" },
  { id: "courses",     label: "Subjects",    icon: "courses" },
];
const NAV_LIBRARY = [
  { id: "resources",   label: "Library",     icon: "library", count: "library" },
  { id: "archive",     label: "Archive",     icon: "archive" },
];

const Sidebar = ({ collapsed, active, onNavigate, onToggle }) => {
  const { useStore } = window.Store;
  const { courses, workspaceName, assignments, notes, library } = useStore();
  const counts = {
    assignmentsOpen: assignments.filter(a => a.status !== "graded" && a.status !== "submitted").length,
    notes: notes.length,
    library: library.length,
  };
  const renderItem = (it) => {
    const count = it.count ? counts[it.count] : null;
    return (
      <button
        key={it.id}
        className={"nav-item" + (active === it.id ? " active" : "")}
        onClick={() => onNavigate(it.id)}
        title={collapsed ? it.label : undefined}
        aria-current={active === it.id ? "page" : undefined}
      >
        <span className="ni-icon"><Icon name={it.icon} /></span>
        <span className="ni-label">{it.label}</span>
        {count != null && count > 0 && <span className="ni-count">{count}</span>}
      </button>
    );
  };

  return (
    <nav className={"sidebar" + (collapsed ? " collapsed" : "")} aria-label="Primary">
      <div className="sidebar-top">
        <span className="term">{workspaceName}</span>
        {!collapsed && (
          <button className="iconbtn" onClick={onToggle} aria-label="Collapse sidebar">
            <Icon name="side-collapse" size={14} />
          </button>
        )}
      </div>

      <div className="sidebar-nav">
        <div className="nav-group">
          {!collapsed && <div className="nav-label">Workspace</div>}
          {NAV_PRIMARY.map(renderItem)}
        </div>
        <div className="nav-group">
          {!collapsed && <div className="nav-label">Library</div>}
          {NAV_LIBRARY.map(renderItem)}
        </div>

        <div className="nav-group">
          {!collapsed && <div className="nav-label">Subjects</div>}
          {courses.length === 0 && !collapsed && (
            <div className="nav-empty">No subjects yet — add one in Subjects.</div>
          )}
          {courses.map(c => (
            <button
              key={c.id}
              className={"nav-item" + (active === "course:" + c.id ? " active" : "")}
              onClick={() => onNavigate("course:" + c.id)}
              title={collapsed ? c.code : undefined}
            >
              <span className="ni-icon"><span className="dot" style={{ background: c.color }} /></span>
              <span className="ni-label">{c.code}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-bottom">
        <button className={"nav-item" + (active === "settings" ? " active" : "")} onClick={() => onNavigate("settings")} title={collapsed ? "Settings" : undefined}>
          <span className="ni-icon"><Icon name="settings" /></span>
          <span className="ni-label">Settings</span>
        </button>
      </div>
    </nav>
  );
};

/* ---------- Status bar (bottom) ---------- */
const StatusBar = ({ selectionCount, syncTime, density, onDensity }) => {
  const { useStore } = window.Store;
  const { courses, workspaceName } = useStore();
  const credits = courses.reduce((s, c) => s + (c.credits || 0), 0);
  const yearLabel = (workspaceName || "").split(" — ")[0] || "Year 12";
  return (
    <footer className="statusbar" role="contentinfo">
      <div className="sb-group">
        <span className="sb-item"><span className="sb-dot" /> Saved locally · {syncTime}</span>
        <span className="sb-item">{yearLabel} · {courses.length} subject{courses.length === 1 ? "" : "s"} · {credits} credits</span>
        {selectionCount > 0 && (
          <span className="sb-item" style={{ color: "var(--accent)" }}>{selectionCount} selected</span>
        )}
      </div>
      <div className="sb-group">
        <span className="sb-item">Density:</span>
        <button className="sb-item" style={{ color: density === "compact" ? "var(--accent)" : undefined, cursor: "pointer" }} onClick={() => onDensity("compact")}>Compact</button>
        <button className="sb-item" style={{ color: density === "comfortable" ? "var(--accent)" : undefined, cursor: "pointer" }} onClick={() => onDensity("comfortable")}>Comfortable</button>
        <span className="sb-item">v0.2.0</span>
      </div>
    </footer>
  );
};

window.Chrome = { AppBar, Sidebar, StatusBar };
