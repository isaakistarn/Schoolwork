/* global React, Icon */

/* ============================================================
   Update banner — drives the in-app auto-update lifecycle.

   States:
     • idle / null   — no update available (or check still running)
     • available     — newer version exists; user can Download or Snooze
     • downloading   — progress bar, can't dismiss mid-download
     • ready         — installer is on disk; "Restart to install" runs the
                       NSIS wizard (Windows) or the user opens the DMG
                       (macOS unsigned fallback)
     • error         — surfaces the failure and lets the user retry

   On macOS without code-signing the main process returns mode:"browser"
   from `updates.check`, so we fall back to the original "open the release
   page in your browser" flow that was here before.

   Snooze marker:  swUpdateSnooze:<version>  (outside the synced
   "schoolwork:" namespace so dismissing on one machine doesn't hide the
   prompt on the other).
   ============================================================ */
const UpdateBanner = (() => {
  const { useState, useEffect, useRef } = React;

  const SNOOZE_KEY = (v) => "swUpdateSnooze:" + v;

  const fmtSize = (b) => {
    if (!b || b < 1024) return (b || 0) + " B";
    if (b < 1024 * 1024) return (b / 1024).toFixed(0) + " KB";
    if (b < 1024 * 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + " MB";
    return (b / 1024 / 1024 / 1024).toFixed(2) + " GB";
  };

  const S = {
    box: {
      position: "fixed", right: 16, bottom: 40,
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 12px", maxWidth: 420, minWidth: 320,
      background: "var(--bg-surface)", border: "1px solid var(--bd-default)",
      borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      fontSize: 12, color: "var(--fg-secondary)", zIndex: 200,
    },
    text:   { flex: 1, minWidth: 0 },
    title:  { fontSize: 13, fontWeight: 500, color: "var(--fg-primary)" },
    sub:    { fontSize: 11, color: "var(--fg-tertiary)", marginTop: 2 },
    bar:    { width: "100%", height: 4, background: "var(--bd-subtle)", borderRadius: 2, marginTop: 6, overflow: "hidden" },
    barFill:(pct) => ({ width: pct + "%", height: "100%", background: "var(--accent)", transition: "width 200ms linear" }),
    error:  { fontSize: 11, color: "var(--error)", marginTop: 2 },
  };

  const Banner = () => {
    const [info, setInfo] = useState(null);     // { current, latest, name, url?, mode }
    const [phase, setPhase] = useState("idle"); // idle | available | downloading | ready | error
    const [progress, setProgress] = useState({ percent: 0, transferred: 0, total: 0 });
    const [errorMsg, setErrorMsg] = useState("");
    const [hidden, setHidden] = useState(false);
    const teardownRefs = useRef([]);

    // Initial check + subscribe to lifecycle events.
    useEffect(() => {
      const api = window.schoolworkAPI && window.schoolworkAPI.updates;
      if (!api || !api.check) return;
      let cancelled = false;

      (async () => {
        try {
          const r = await api.check();
          if (cancelled || !r || !r.available) return;
          try { if (localStorage.getItem(SNOOZE_KEY(r.latest))) return; } catch {}
          setInfo(r);
          setPhase("available");
        } catch { /* offline / rate-limited — stay quiet */ }
      })();

      if (api.on) {
        teardownRefs.current.push(api.on("updates:progress", (p) => {
          setPhase("downloading");
          setProgress({ percent: p.percent || 0, transferred: p.transferred || 0, total: p.total || 0 });
        }));
        teardownRefs.current.push(api.on("updates:ready", (p) => {
          setPhase("ready");
          setInfo((cur) => cur ? { ...cur, latest: p.latest || cur.latest } : { latest: p.latest });
        }));
        teardownRefs.current.push(api.on("updates:error", (p) => {
          setPhase("error");
          setErrorMsg(p && p.message ? p.message : "Update failed.");
        }));
        // `updates:available` arrives if the main-process timer fires the
        // check before the renderer does. Treat it the same as a successful
        // explicit check.
        teardownRefs.current.push(api.on("updates:available", (p) => {
          try { if (localStorage.getItem(SNOOZE_KEY(p.latest))) return; } catch {}
          setInfo((cur) => ({ current: cur?.current, latest: p.latest, name: p.name, mode: cur?.mode || "inplace" }));
          setPhase((cur) => cur === "idle" ? "available" : cur);
        }));
      }

      return () => {
        cancelled = true;
        teardownRefs.current.forEach(fn => { try { fn && fn(); } catch {} });
        teardownRefs.current = [];
      };
    }, []);

    if (hidden || phase === "idle") return null;

    const isBrowserMode = info && info.mode === "browser";

    const onSnooze = () => {
      try { if (info?.latest) localStorage.setItem(SNOOZE_KEY(info.latest), "1"); } catch {}
      setHidden(true);
    };

    const onPrimary = async () => {
      const api = window.schoolworkAPI && window.schoolworkAPI.updates;
      if (!api) return;

      if (phase === "available") {
        // macOS unsigned fallback — open the release page so the user can
        // grab the DMG themselves. Same UX the old banner had.
        if (isBrowserMode) {
          window.schoolworkAPI?.openExternal?.(info.url);
          onSnooze();
          return;
        }
        // Windows in-place — kick off the download. The "downloading" phase
        // is driven by the progress events.
        setPhase("downloading");
        setProgress({ percent: 0, transferred: 0, total: 0 });
        const r = await api.download?.();
        if (r && !r.ok) {
          setPhase("error");
          setErrorMsg(r.reason === "not-supported" ? "Auto-update isn't available in this build." : (r.reason || "Couldn't start the download."));
        }
        return;
      }

      if (phase === "ready") {
        // Quit-and-install. NSIS oneClick:false will show its wizard; the
        // app reopens once the user clicks through.
        await api.install?.();
        return;
      }

      if (phase === "error") {
        // Retry the whole thing from the top.
        setErrorMsg("");
        setPhase("available");
        return;
      }
    };

    const primaryLabel = () => {
      if (phase === "available") return isBrowserMode ? "Download" : "Update now";
      if (phase === "ready")     return "Restart to install";
      if (phase === "error")     return "Retry";
      return null;
    };
    const title = () => {
      if (phase === "downloading") return "Downloading update…";
      if (phase === "ready")       return "Update ready — " + (info?.name || ("v" + info?.latest));
      if (phase === "error")       return "Update failed";
      return "Update available — " + (info?.name || ("v" + info?.latest));
    };
    const sub = () => {
      if (phase === "downloading") {
        const pct = Math.max(0, Math.min(100, progress.percent || 0));
        const size = progress.total ? (fmtSize(progress.transferred) + " of " + fmtSize(progress.total)) : "";
        return pct + "% " + size;
      }
      if (phase === "ready")   return "Click Restart to install v" + info?.latest + " and reopen Schoolwork.";
      if (phase === "error")   return errorMsg;
      // available
      if (isBrowserMode)       return "You're on v" + info?.current + ". The DMG will open in your browser.";
      return "You're on v" + info?.current + ". Schoolwork will download the update, then prompt you to install.";
    };

    return (
      <div style={S.box} role="status" aria-live="polite">
        <Icon name={phase === "error" ? "circle-warn" : (phase === "ready" ? "circle-check" : "bell")} size={16} />
        <div style={S.text}>
          <div style={S.title}>{title()}</div>
          <div style={S.sub}>{sub()}</div>
          {phase === "downloading" && (
            <div style={S.bar} aria-label={"Download " + (progress.percent || 0) + " percent complete"}>
              <div style={S.barFill(progress.percent || 0)} />
            </div>
          )}
        </div>
        {primaryLabel() && (
          <button className="btn btn-primary btn-sm" onClick={onPrimary}>{primaryLabel()}</button>
        )}
        {phase !== "downloading" && (
          <button className="iconbtn" style={{ width: 22, height: 22 }} onClick={onSnooze} aria-label="Dismiss">
            <Icon name="close" size={12} />
          </button>
        )}
      </div>
    );
  };

  return { Banner };
})();

if (typeof window !== "undefined") window.UpdateBanner = UpdateBanner;
