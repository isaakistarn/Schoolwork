/* global React, Icon */

/* ============================================================
   Legal — in-app viewer for the Privacy Policy and Terms.
   The canonical text lives in PRIVACY.md / TERMS.md at the project
   root and is read at runtime via the preload bridge, so there is a
   single source of truth. In a plain browser (no desktop bridge) we
   show a short pointer to the bundled files.
   ============================================================ */

const Legal = (() => {
  const { useState, useEffect } = React;

  // Minimal, safe Markdown-ish renderer (headings, lists, quotes, rules, bold).
  const renderInline = (text, keyBase) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) =>
      /^\*\*[^*]+\*\*$/.test(p)
        ? <b key={keyBase + "-" + i}>{p.slice(2, -2)}</b>
        : <React.Fragment key={keyBase + "-" + i}>{p}</React.Fragment>
    );
  };

  const Markdown = ({ text }) => {
    const lines = (text || "").split("\n");
    const out = [];
    let list = null;
    const flush = () => { if (list) { out.push(<ul key={"ul" + out.length}>{list}</ul>); list = null; } };
    lines.forEach((ln, i) => {
      if (/^\s*[-*]\s+/.test(ln)) { (list = list || []).push(<li key={i}>{renderInline(ln.replace(/^\s*[-*]\s+/, ""), "li" + i)}</li>); return; }
      flush();
      if (ln.startsWith("# ")) out.push(<h1 key={i}>{ln.slice(2)}</h1>);
      else if (ln.startsWith("## ")) out.push(<h2 key={i}>{ln.slice(3)}</h2>);
      else if (ln.startsWith("### ")) out.push(<h3 key={i}>{ln.slice(4)}</h3>);
      else if (ln.startsWith("> ")) out.push(<blockquote key={i}>{renderInline(ln.slice(2), "q" + i)}</blockquote>);
      else if (/^---+$/.test(ln.trim())) out.push(<hr key={i} />);
      else if (ln.trim().startsWith("|")) out.push(<div key={i} className="legal-table-row">{ln}</div>);
      else if (ln.trim() === "") out.push(<div key={i} style={{ height: 6 }} />);
      else out.push(<p key={i}>{renderInline(ln, "p" + i)}</p>);
    });
    flush();
    return <div className="legal-doc">{out}</div>;
  };

  const TITLES = { privacy: "Privacy Policy", terms: "Terms & Conditions" };
  const FALLBACK = (doc) => "The full " + TITLES[doc] + " is included with the app as " +
    (doc === "privacy" ? "PRIVACY.md" : "TERMS.md") + " in the application folder.";

  const LegalModal = ({ doc, onClose }) => {
    const [text, setText] = useState("Loading…");
    useEffect(() => {
      const api = (typeof window !== "undefined") ? window.schoolworkAPI : null;
      if (api?.legal?.read) api.legal.read(doc).then(t => setText(t || FALLBACK(doc))).catch(() => setText(FALLBACK(doc)));
      else setText(FALLBACK(doc));
      const h = (e) => { if (e.key === "Escape") onClose(); };
      window.addEventListener("keydown", h);
      return () => window.removeEventListener("keydown", h);
    }, [doc]);

    return (
      <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={TITLES[doc]}>
        <div className="modal legal-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-h">
            <h2>{TITLES[doc]}</h2>
            <button className="iconbtn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
          </div>
          <div className="modal-b legal-body">
            <Markdown text={text} />
          </div>
          <div className="modal-f"><button className="btn btn-primary" onClick={onClose}>Close</button></div>
        </div>
      </div>
    );
  };

  return { LegalModal, TITLES };
})();

window.Legal = Legal;
