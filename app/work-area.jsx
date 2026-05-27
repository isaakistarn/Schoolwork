/* global React, Icon */

const { useState, useMemo, useEffect } = React;

/* ============================================================
   Work Area — the file bank dialog for an assignment.
   Opens from the Inspector's "Open work area" button.
   ============================================================ */

const FILE_KIND_LABEL = { pdf: "PDF", doc: "DOCX", sheet: "XLSX", image: "PNG", md: "MD", code: "PY" };
const FILE_KIND_PILL  = { pdf: "PDF", doc: "DOC", sheet: "XLS", image: "IMG", md: "MD", code: "PY" };

const FileIcon = ({ kind }) => (
  <div className={"wa-file-icon " + kind} aria-hidden="true">{FILE_KIND_PILL[kind] || "FILE"}</div>
);

const PdfishPreview = ({ file, assignment }) => (
  <div className="wa-doc pdf-look" data-screen-label={"file:" + file.id}>
    <div className="doc-meta">
      <span>{file.name}</span><span>·</span>
      <span>{file.owner}</span><span>·</span>
      <span>Last modified {new Date(file.modified).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: false })}</span>
    </div>
    <h1>{file.name.replace(/\.[a-z]+$/i, "")}</h1>
    {file.summary && <p style={{ color: "var(--fg-secondary)", fontStyle: "italic", borderLeft: "2px solid var(--bd-default)", paddingLeft: 12 }}>{file.summary}</p>}
    <h2>Overview</h2>
    <p>
      This document supports the <b>{assignment.title}</b> task ({assignment.type}) for {assignment.id}.
      Reference it alongside the marking rubric when finalising your submission.
    </p>
    <h2>Document body</h2>
    <p>{previewBody(file, assignment, 0)}</p>
    <p>{previewBody(file, assignment, 1)}</p>
    <p>{previewBody(file, assignment, 2)}</p>
    <h2>Notes for the student</h2>
    <p>Open in your preferred reader for a full version. Markup, comments, and any embedded references travel with the file.</p>
  </div>
);

function previewBody(file, assignment, idx) {
  const seeds = {
    pdf: [
      "Use this document as the authoritative reference for the task. Annotations and embedded comments will appear in the full reader; the preview here shows the document outline only.",
      "The marking guide lists the criteria and weightings used to assess your submission. Familiarise yourself before you start so each section of your response can map to a specific criterion.",
      "If the file references external sources, cite them in your final document using the style required by your subject (Author–Date for the sciences, MLA for English where indicated)."
    ],
    doc: [
      "This is your working draft. Edits made here will be saved to the file the next time you sync.",
      "Track-changes are stored alongside the document and re-applied automatically when you reopen it in your word processor.",
      "Use the comments panel to leave context for yourself or for a peer reviewer; comments do not appear in the final exported PDF."
    ],
    sheet: [
      "Raw experimental data. Each row corresponds to a single trial; column headers list the controlled and measured variables.",
      "A summary sheet derives means, standard deviations, and a linear regression for the rate-vs-concentration plot.",
      "Open the workbook to access the formula bar; cells reference the data tables on the second sheet rather than embedding values directly."
    ],
    md: [
      "Plain-text notes. The renderer below shows them with standard Markdown formatting.",
      "Headings, lists, and inline code render as expected; LaTeX math uses single-dollar inline delimiters and double-dollar for display equations.",
      "Use these notes as a study aid — the file is small, searchable, and version-controlled with your other coursework."
    ],
    code: [
      "Source listing for the project component referenced by this assignment.",
      "Indentation is significant; the file is meant to be opened in a code editor with monospace rendering and syntax highlighting.",
      "Run the program with the command listed at the bottom of the file; tests live in the adjacent tests/ directory and can be run with pytest."
    ],
    image: [
      "Image attachment — preview shown to the right.",
      "Click the file again to download a full-resolution copy.",
      "Captions and figure numbers are stored in the assignment's reference document."
    ]
  };
  return (seeds[file.kind] || seeds.pdf)[idx];
}

const FilePreview = ({ file, assignment }) => {
  if (!file) return (
    <div className="empty" style={{ flex: 1, alignSelf: "center", margin: "auto" }}>
      <div className="empty-icon"><Icon name="paperclip" /></div>
      <h3>No file selected</h3>
      <p>Pick a file from the bank on the left to preview it. You can edit drafts in place when Edit mode is on.</p>
    </div>
  );
  if (file.kind === "code") {
    return <pre className="wa-code" data-screen-label={"file:" + file.id}>{file.body || "# source preview not available offline"}</pre>;
  }
  if (file.kind === "md") {
    return (
      <div className="wa-doc" data-screen-label={"file:" + file.id} style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)", fontSize: 13 }}>
        <div className="doc-meta">
          <span>{file.name}</span><span>·</span><span>{file.owner}</span>
        </div>
        {file.body || file.summary || ""}
      </div>
    );
  }
  if (file.kind === "image") {
    return (
      <div className="wa-doc" data-screen-label={"file:" + file.id}>
        <div className="doc-meta">
          <span>{file.name}</span><span>·</span><span>{file.size}</span>
        </div>
        <div className="wa-image-frame">
          <div>
            <Icon name="paperclip" size={24} />
            <div style={{ marginTop: 12 }}>[ image preview · {file.size} ]</div>
            <div style={{ marginTop: 6, color: "var(--fg-secondary)", fontFamily: "inherit" }}>{file.summary}</div>
          </div>
        </div>
      </div>
    );
  }
  if (file.kind === "sheet") {
    return (
      <div className="wa-doc" data-screen-label={"file:" + file.id}>
        <div className="doc-meta">
          <span>{file.name}</span><span>·</span><span>{file.size}</span><span>·</span><span>{file.owner}</span>
        </div>
        <p style={{ color: "var(--fg-secondary)" }}>{file.summary}</p>
        <div className="wa-sheet" style={{ marginTop: 12 }}>
          <table>
            <thead><tr><th></th><th>0.10 M</th><th>0.25 M</th><th>0.50 M</th></tr></thead>
            <tbody>
              <tr><td>Trial 1 (s)</td><td>86.4</td><td>37.1</td><td>18.2</td></tr>
              <tr><td>Trial 2 (s)</td><td>83.9</td><td>35.6</td><td>17.4</td></tr>
              <tr><td>Trial 3 (s)</td><td>83.5</td><td>35.9</td><td>17.8</td></tr>
              <tr><td>Mean (s)</td><td>84.6</td><td>36.2</td><td>17.8</td></tr>
              <tr><td>1 / mean (s⁻¹)</td><td>0.0118</td><td>0.0276</td><td>0.0562</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  return <PdfishPreview file={file} assignment={assignment} />;
};

const TEXT_EXT = ["md", "txt", "json", "js", "py", "csv", "html", "css", "ts"];
const extOf = (name) => (name.split(".").pop() || "").toLowerCase();
const kindFromName = (name) => {
  const e = extOf(name);
  if (["png","jpg","jpeg","gif","webp","svg"].includes(e)) return "image";
  if (["xlsx","xls","csv"].includes(e)) return "sheet";
  if (["doc","docx"].includes(e)) return "doc";
  if (["pdf"].includes(e)) return "pdf";
  if (["py","js","ts","java","c","cpp"].includes(e)) return "code";
  if (["md","txt","json","html","css"].includes(e)) return "md";
  return "doc";
};
const hSize = (b) => b < 1024 ? b + " B" : b < 1048576 ? (b/1024).toFixed(0) + " KB" : (b/1048576).toFixed(1) + " MB";

const WorkArea = ({ assignmentId, onClose, pushToast }) => {
  const { useStore } = window.Store;
  const { assignments, attachments, courseById, setAssignmentAttachments } = useStore();
  const assignment = assignments.find(a => a.id === assignmentId);
  const files = attachments[assignmentId] || [];
  const [activeId, setActiveId] = useState(files[0]?.id || null);
  const fileRef = useRef(null);
  useEffect(() => { setActiveId((attachments[assignmentId] || [])[0]?.id || null); }, [assignmentId]);

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  if (!assignment) return null;
  const c = courseById(assignment.course);
  const active = files.find(f => f.id === activeId);

  const onUpload = (e) => {
    const picked = Array.from(e.target.files || []);
    let added = [];
    let pending = picked.length;
    if (!pending) return;
    picked.forEach(f => {
      const kind = kindFromName(f.name);
      const isText = TEXT_EXT.includes(extOf(f.name));
      const reader = new FileReader();
      reader.onload = () => {
        const tooBig = f.size > 1.5 * 1048576;
        added.push({
          id: "F-" + Date.now().toString(36) + Math.floor(Math.random()*99),
          name: f.name, kind, size: hSize(f.size), modified: new Date().toISOString(), owner: "Me",
          body: isText ? String(reader.result) : undefined,
          dataUrl: !isText && !tooBig ? String(reader.result) : undefined,
          summary: tooBig ? "Stored by reference (too large to embed)." : undefined,
        });
        if (--pending === 0) {
          const next = [...(attachments[assignmentId] || []), ...added];
          setAssignmentAttachments(assignmentId, next);
          setActiveId(added[0].id);
          pushToast?.({ tone: "success", title: picked.length + " file" + (picked.length === 1 ? "" : "s") + " added" });
        }
      };
      if (isText) reader.readAsText(f); else reader.readAsDataURL(f);
    });
    e.target.value = "";
  };

  const onDelete = (id) => {
    const next = (attachments[assignmentId] || []).filter(f => f.id !== id);
    setAssignmentAttachments(assignmentId, next);
    if (activeId === id) setActiveId(next[0]?.id || null);
    pushToast?.({ tone: "warning", title: "File removed" });
  };

  const onDownload = (f) => {
    if (!f) return;
    let url, revoke = false;
    if (f.dataUrl) url = f.dataUrl;
    else { const blob = new Blob([f.body || f.summary || ""], { type: "text/plain" }); url = URL.createObjectURL(blob); revoke = true; }
    const a = document.createElement("a"); a.href = url; a.download = f.name; a.click();
    if (revoke) URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Work area">
      <div className="workarea-modal" onClick={(e) => e.stopPropagation()} data-screen-label="workarea">
        <div className="workarea-h">
          <div className="wa-title">
            <h2>Work area — {assignment.title}</h2>
            <div className="wa-sub">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span className="dot" style={{ background: c?.color }} />
                {c?.code} · {assignment.type} · {assignment.id}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-tertiary" onClick={() => files.forEach(onDownload)} disabled={!files.length}><Icon name="download" size={14} /> Download all</button>
            <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}><Icon name="plus" size={14} /> Upload file</button>
            <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={onUpload} />
            <button className="iconbtn" onClick={onClose} aria-label="Close work area"><Icon name="close" /></button>
          </div>
        </div>

        <div className="workarea-body">
          <aside className="wa-files" aria-label="File bank">
            <div className="wa-files-h">
              <span>File bank · {files.length}</span>
              <button className="iconbtn" style={{ width: 22, height: 22 }} aria-label="Upload" onClick={() => fileRef.current?.click()}><Icon name="plus" size={12} /></button>
            </div>
            <div className="wa-files-list">
              {files.length === 0 && (
                <div style={{ padding: 16, fontSize: 12, color: "var(--fg-tertiary)" }}>
                  No files attached. Use Upload file to add a draft, brief, or reference.
                </div>
              )}
              {files.map(f => (
                <div
                  key={f.id}
                  className={"wa-file" + (f.id === activeId ? " active" : "")}
                  onClick={() => setActiveId(f.id)}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") setActiveId(f.id); }}
                >
                  <FileIcon kind={f.kind} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="wa-fname" title={f.name}>{f.name}</div>
                    <div className="wa-fmeta">{f.size} · {new Date(f.modified).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</div>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <section className="wa-preview" aria-label="File preview">
            <div className="wa-preview-h">
              <div className="wa-ph-info">
                {active ? (
                  <>
                    <FileIcon kind={active.kind} />
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <b>{active.name}</b>
                      <span style={{ fontSize: 11, color: "var(--fg-tertiary)" }}>
                        {FILE_KIND_LABEL[active.kind] || "FILE"} · {active.size} · {active.owner}
                      </span>
                    </div>
                  </>
                ) : <span style={{ color: "var(--fg-tertiary)" }}>Select a file</span>}
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button className="iconbtn" aria-label="Download" onClick={() => onDownload(active)} disabled={!active}><Icon name="download" /></button>
                <button className="iconbtn" aria-label="Delete" onClick={() => active && onDelete(active.id)} disabled={!active}><Icon name="trash" /></button>
              </div>
            </div>
            <div className="wa-preview-body">
              {active && (active.dataUrl && active.kind === "image")
                ? <div className="wa-doc"><div className="doc-meta"><span>{active.name}</span></div><div className="lib-prev-img"><img src={active.dataUrl} alt={active.name} /></div></div>
                : active && active.dataUrl && active.kind === "pdf"
                ? <window.UI.PdfFrame className="lib-prev-frame" dataUrl={active.dataUrl} title={active.name} />
                : <FilePreview file={active} assignment={assignment} />}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

window.WorkArea = WorkArea;
