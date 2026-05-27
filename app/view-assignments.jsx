/* global React, Icon */

/* ============================================================
   Assignments — enterprise table view
   ============================================================ */
const { useState, useMemo } = React;

const FILTERS = [
  { id: "due_week",   label: "Due this week" },
  { id: "in_progress",label: "In progress" },
  { id: "high",       label: "High priority" },
  { id: "graded",     label: "Graded" },
];

const TYPE_OPTS = ["All types", "Essay", "Lab", "Problem Set", "Homework", "Quiz", "Exam", "Project", "Discussion", "Response"];
const STATUS_OPTS = [
  { v: "all", label: "All statuses" },
  { v: "not_started", label: "Not started" },
  { v: "in_progress", label: "In progress" },
  { v: "in_review",   label: "In review" },
  { v: "submitted",   label: "Submitted" },
  { v: "graded",      label: "Graded" },
];

const AssignmentsView = ({ onOpen, onOpenWorkArea, onDelete, onNew, selected, setSelected, pushToast }) => {
  const { useStore, Editable } = window.Store;
  const store = useStore();
  const { assignments: ASSIGNMENTS, courses: COURSES, courseById, updateAssignment, removeAssignment } = store;
  const { STATUS_LABEL } = window.SchoolworkData;
  const { fmt, Checkbox, Priority, StatusBadge, Badge } = window.UI;

  const [sortKey, setSortKey] = useState("due");
  const [sortDir, setSortDir] = useState("asc");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("All types");
  const [courseFilter, setCourseFilter] = useState("all");
  const [activeChips, setActiveChips] = useState([]);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const toggleChip = (id) =>
    setActiveChips(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id]);

  const sorted = useMemo(() => {
    let rows = ASSIGNMENTS.slice();
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter(r =>
        r.title.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        courseById(r.course).code.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") rows = rows.filter(r => r.status === statusFilter);
    if (typeFilter !== "All types") rows = rows.filter(r => r.type === typeFilter);
    if (courseFilter !== "all") rows = rows.filter(r => r.course === courseFilter);
    if (activeChips.includes("due_week")) {
      const now = new Date("2026-05-26T00:00");
      const wk = new Date(now); wk.setDate(now.getDate() + 7);
      rows = rows.filter(r => {
        const d = new Date(r.due);
        return d >= now && d <= wk;
      });
    }
    if (activeChips.includes("in_progress")) rows = rows.filter(r => r.status === "in_progress");
    if (activeChips.includes("high"))        rows = rows.filter(r => r.priority === "high");
    if (activeChips.includes("graded"))      rows = rows.filter(r => r.status === "graded");

    const dir = sortDir === "asc" ? 1 : -1;
    const getter = {
      title:    r => r.title.toLowerCase(),
      course:   r => courseById(r.course).code,
      type:     r => r.type,
      due:      r => new Date(r.draftDue || r.due).getTime(),
      priority: r => ({ high: 0, med: 1, low: 2 }[r.priority]),
      status:   r => Object.keys(STATUS_LABEL).indexOf(r.status),
      weight:   r => r.weight,
    }[sortKey] || (r => r.title);
    return rows.sort((a, b) => {
      const av = getter(a), bv = getter(b);
      return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
    });
  }, [ASSIGNMENTS, query, sortKey, sortDir, statusFilter, typeFilter, courseFilter, activeChips]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);

  // Reset to page 1 when filters change to a smaller set
  useMemo(() => { if (page > totalPages) setPage(1); }, [totalPages]);

  const handleSort = (k) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  };

  const allSelected = pageRows.length > 0 && pageRows.every(r => selected.includes(r.id));
  const someSelected = pageRows.some(r => selected.includes(r.id)) && !allSelected;
  const toggleAll = () => {
    if (allSelected) setSelected(selected.filter(id => !pageRows.find(r => r.id === id)));
    else setSelected([...new Set([...selected, ...pageRows.map(r => r.id)])]);
  };
  const toggleOne = (id) =>
    setSelected(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);

  const Hdr = ({ k, children, num }) => (
    <th
      className={"sortable" + (sortKey === k ? " active" : "") + (num ? " num" : "")}
      onClick={() => handleSort(k)}
      scope="col"
    >
      {children}
      <span className="sort-ind">
        {sortKey === k ? (sortDir === "asc" ? "▲" : "▼") : "▲▼"}
      </span>
    </th>
  );

  return (
    <>
      <div className="page-header">
        <div>
          <div className="breadcrumb">Workspace · {store.workspaceName}</div>
          <h1>Assignments</h1>
        </div>
        <div className="actions">
          <button className="btn btn-tertiary" onClick={() => {
            const rows = sorted.map(a => [a.id, a.title, courseById(a.course)?.code, a.type, a.due, a.status, a.weight, a.earned ?? "", a.points].join(","));
            const blob = new Blob(["id,title,course,type,due,status,weight,earned,points\n" + rows.join("\n")], { type: "text/csv" });
            const url = URL.createObjectURL(blob); const el = document.createElement("a"); el.href = url; el.download = "assignments.csv"; el.click(); URL.revokeObjectURL(url);
            pushToast?.({ tone: "success", title: "Exported", body: "assignments.csv" });
          }}><Icon name="export" size={14} /> Export</button>
          {selected.length > 0 && (
            <button className="btn btn-secondary" style={{ color: "var(--error)" }} onClick={() => {
              if (!confirm("Delete " + selected.length + " selected assignment" + (selected.length === 1 ? "" : "s") + "?")) return;
              selected.forEach(id => onDelete ? onDelete(id) : removeAssignment(id));
              setSelected([]);
            }}><Icon name="trash" size={14} /> Delete ({selected.length})</button>
          )}
          <button className="btn btn-primary" onClick={onNew}><Icon name="plus" size={14} /> New assignment</button>
        </div>
      </div>

      <div className="toolbar">
        <div className="toolbar-group">
          <div className="searchbar" style={{ width: 280, height: 28 }}>
            <Icon name="search" size={13} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter by title, ID, course…" />
          </div>
          <select className="select" style={{ width: 160, height: 28 }}
            value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            {STATUS_OPTS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
          <select className="select" style={{ width: 140, height: 28 }}
            value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            {TYPE_OPTS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="select" style={{ width: 160, height: 28 }}
            value={courseFilter} onChange={e => setCourseFilter(e.target.value)}>
            <option value="all">All courses</option>
            {COURSES.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
          </select>
          {FILTERS.map(f => (
            <button
              key={f.id}
              className={"filter-chip" + (activeChips.includes(f.id) ? " active" : "")}
              onClick={() => toggleChip(f.id)}
            >
              {f.label}
              {activeChips.includes(f.id) && <Icon name="close" size={10} className="x" />}
            </button>
          ))}
        </div>
        <div className="toolbar-group">
          <span style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>
            {sorted.length} of {ASSIGNMENTS.length} shown
          </span>
        </div>
      </div>

      <div className="content">
        <div className="table-wrap">
          <table className="data" role="grid">
            <colgroup>
              <col style={{ width: 32 }} />
              <col />
              <col style={{ width: 90 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 132 }} />
              <col style={{ width: 116 }} />
              <col style={{ width: 92 }} />
              <col style={{ width: 60 }} />
              <col style={{ width: 76 }} />
              <col style={{ width: 64 }} />
            </colgroup>
            <thead>
              <tr>
                <th>
                  <Checkbox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} label="Select all rows on this page" />
                </th>
                <Hdr k="title">Assignment</Hdr>
                <Hdr k="course">Course</Hdr>
                <Hdr k="type">Type</Hdr>
                <Hdr k="due">Due</Hdr>
                <Hdr k="status">Status</Hdr>
                <Hdr k="priority">Priority</Hdr>
                <Hdr k="weight" num>Weight</Hdr>
                <th className="num">Score</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={10}>
                    <div className="empty">
                      <div className="empty-icon"><Icon name="filter" /></div>
                      <h3>No assignments match these filters</h3>
                      <p>Try removing a filter, broadening the date range, or clearing your search query.</p>
                      <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }}
                        onClick={() => { setQuery(""); setActiveChips([]); setStatusFilter("all"); setTypeFilter("All types"); setCourseFilter("all"); }}
                      >Clear all filters</button>
                    </div>
                  </td>
                </tr>
              )}
              {pageRows.map(row => {
                const c = courseById(row.course);
                const done = row.status === "graded" || row.status === "submitted";
                // When a draft milestone is set, show it as the due date with a
                // "(D)" marker — it's the deadline you're working toward next.
                const isDraft = !!row.draftDue;
                const dueIso = row.draftDue || row.due;
                const du = fmt.daysUntil(dueIso, done);
                const isSel = selected.includes(row.id);
                return (
                  <tr
                    key={row.id}
                    className={isSel ? "selected" : ""}
                    onClick={() => onOpen(row.id)}
                    aria-selected={isSel}
                  >
                    <td onClick={e => e.stopPropagation()}>
                      <Checkbox checked={isSel} onChange={() => toggleOne(row.id)} label={"Select " + row.title} />
                    </td>
                    <td title={row.title} onClick={() => onOpen(row.id)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Editable
                          value={row.title}
                          onChange={(v) => updateAssignment(row.id, { title: v })}
                          style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", display: "inline-block", maxWidth: "100%" }}
                        />
                      </div>
                      <div style={{ fontSize: 11, color: "var(--fg-tertiary)", marginTop: 2 }}>{row.id}</div>
                    </td>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                        <span className="dot" style={{ background: c.color }} />
                        {c.code}
                      </span>
                    </td>
                    <td className="muted">
                      {row.type}
                      {row.assessment && <div style={{ marginTop: 3 }}><Badge tone="accent">{row.assessment}</Badge></div>}
                    </td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt.dateLong(dueIso)}{isDraft && <span style={{ color: "var(--fg-tertiary)" }} title="Draft due date"> (D)</span>}</span>
                        <span style={{ fontSize: 11, color: "var(--fg-tertiary)" }}>
                          {fmt.time(dueIso)}{du.label && <> · <span style={{ color: du.tone === "error" ? "var(--error)" : du.tone === "warning" ? "var(--warning)" : "var(--fg-tertiary)" }}>{du.label}</span></>}
                        </span>
                      </div>
                    </td>
                    <td><StatusBadge status={row.status} /></td>
                    <td><Priority level={row.priority} /></td>
                    <td className="num muted">{row.weight}%</td>
                    <td className="num">
                      {row.earned != null
                        ? <span><b>{row.earned}</b><span style={{ color: "var(--fg-tertiary)" }}>/{row.points}</span></span>
                        : <span style={{ color: "var(--fg-tertiary)" }}>—/{row.points}</span>}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 2 }}>
                        <button className="iconbtn" aria-label="Open work area" style={{ width: 24, height: 24 }} onClick={() => onOpenWorkArea && onOpenWorkArea(row.id)} title="Open work area">
                          <Icon name="link" size={14} />
                        </button>
                        <button className="iconbtn" aria-label="Delete assignment" style={{ width: 24, height: 24 }} title="Delete"
                          onClick={() => { if (confirm("Delete “" + row.title + "”?")) (onDelete ? onDelete(row.id) : removeAssignment(row.id)); }}>
                          <Icon name="trash" size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="table-footer">
            <div>
              {selected.length > 0
                ? <span>{selected.length} selected · <a href="#" onClick={(e)=>{e.preventDefault();setSelected([]);}}>clear</a></span>
                : <span>Showing {(page-1)*pageSize + 1}–{Math.min(page*pageSize, sorted.length)} of {sorted.length}</span>}
            </div>
            <div className="pager">
              <button disabled={page === 1} onClick={() => setPage(1)} aria-label="First page">«</button>
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} aria-label="Previous"><Icon name="chevron-left" size={12} /></button>
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  className={page === i + 1 ? "active" : ""}
                  onClick={() => setPage(i + 1)}
                >{i + 1}</button>
              ))}
              <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} aria-label="Next"><Icon name="chevron-right" size={12} /></button>
              <button disabled={page === totalPages} onClick={() => setPage(totalPages)} aria-label="Last page">»</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

window.AssignmentsView = AssignmentsView;
