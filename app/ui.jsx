/* global React, Icon */

const { useState, useMemo, useEffect } = React;

/* ============================================================
   Shared formatters & small UI primitives used across views
   ============================================================ */
const fmt = {
  date: (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  },
  dateLong: (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  },
  time: (iso) => {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: false });
  },
  // `done` (graded/submitted) suppresses urgency entirely — a finished task
  // is never "overdue" and needs no countdown.
  daysUntil: (iso, done) => {
    if (done) return { label: "", tone: "neutral" };
    const now = new Date();
    const due = new Date(iso);
    const diff = Math.round((due - now) / (1000 * 60 * 60 * 24));
    if (diff < 0) return { label: Math.abs(diff) + "d overdue", tone: "error" };
    if (diff === 0) return { label: "Today · " + fmt.time(iso), tone: "warning" };
    if (diff === 1) return { label: "Tomorrow · " + fmt.time(iso), tone: "warning" };
    if (diff <= 3) return { label: "in " + diff + " days", tone: "warning" };
    if (diff <= 7) return { label: "in " + diff + " days", tone: "info" };
    return { label: "in " + diff + " days", tone: "neutral" };
  },
  duration: (mins) => {
    if (mins == null) return "—";
    if (mins < 60) return mins + " min";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h + "h " + (m ? m + "m" : "").trim();
  }
};

const Badge = ({ tone = "neutral", children, dot }) => (
  <span className={"badge " + tone}>
    {dot && <span className="pill-dot" style={{ background: "currentColor", opacity: 0.85 }} />}
    {children}
  </span>
);

const Priority = ({ level }) => {
  const cls = level === "high" ? "high" : level === "med" ? "med" : "low";
  const label = level === "high" ? "High" : level === "med" ? "Medium" : "Low";
  return (
    <span className={"prio " + cls} title={label + " priority"}>
      <span className="bars">
        <span className="bar b1" />
        <span className="bar b2" />
        <span className="bar b3" />
      </span>
      <span style={{ color: "var(--fg-secondary)" }}>{label}</span>
    </span>
  );
};

const Checkbox = ({ checked, indeterminate, onChange, label }) => {
  const cls = "tbl-checkbox" + (checked ? " checked" : "") + (indeterminate ? " indeterminate" : "");
  return (
    <span
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label}
      tabIndex={0}
      className={cls}
      onClick={(e) => { e.stopPropagation(); onChange && onChange(!checked); }}
      onKeyDown={(e) => { if (e.key === " ") { e.preventDefault(); onChange && onChange(!checked); }}}
    >
      {indeterminate
        ? <Icon name="dash" size={10} />
        : checked && <Icon name="check" size={10} />}
    </span>
  );
};

const StatusBadge = ({ status }) => {
  const { STATUS_LABEL, STATUS_BADGE } = window.SchoolworkData;
  return <Badge tone={STATUS_BADGE[status]} dot>{STATUS_LABEL[status]}</Badge>;
};

const Progress = ({ value, tone }) => (
  <div className={"progress" + (tone ? " " + tone : "")} aria-valuenow={value} aria-valuemin="0" aria-valuemax="100" role="progressbar">
    <span style={{ width: Math.max(0, Math.min(100, value)) + "%" }} />
  </div>
);

/* PdfFrame — renders a PDF (or other framed file) from a data: URL by first
   converting it to a blob: URL. Chromium's PDF viewer renders blob: reliably
   (data: URLs in iframes are large/blocked by CSP), and we revoke on cleanup. */
const PdfFrame = ({ dataUrl, title, className, style }) => {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!dataUrl) { setUrl(null); return; }
    // Already a usable URL (blob:/file:/http) — pass through.
    if (!dataUrl.startsWith("data:")) { setUrl(dataUrl); return; }
    try {
      const comma = dataUrl.indexOf(",");
      const meta = dataUrl.slice(5, comma);
      const mime = (meta.split(";")[0]) || "application/pdf";
      const bin = atob(dataUrl.slice(comma + 1));
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const u = URL.createObjectURL(new Blob([arr], { type: mime }));
      setUrl(u);
      return () => URL.revokeObjectURL(u);
    } catch { setUrl(null); }
  }, [dataUrl]);
  if (!url) return <div className="empty" style={{ margin: "auto" }}><p>Preparing preview…</p></div>;
  return <iframe src={url} title={title} className={className} style={style} />;
};

window.UI = { fmt, Badge, Priority, Checkbox, StatusBadge, Progress, PdfFrame };
