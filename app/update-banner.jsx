/* global React, Icon */

/* ============================================================
   Update banner — polls the GitHub Releases API on launch and shows a
   non-intrusive bottom-right prompt if a newer version exists, with a
   "Download" button that opens the release page in the user's browser.

   This is deliberately NOT a silent in-place auto-update: that would need
   Apple Developer ID signing to work end-to-end on macOS. The polling +
   notify approach is cross-platform-honest and requires no signing.

   The snooze marker lives under "swUpdateSnooze:<version>" — deliberately
   outside the synced "schoolwork:" namespace — so dismissing on one machine
   doesn't hide the prompt on the other.
   ============================================================ */
const UpdateBanner = (() => {
  const { useState, useEffect } = React;

  const SNOOZE_KEY = (v) => "swUpdateSnooze:" + v;

  const S = {
    box: {
      position: "fixed", right: 16, bottom: 40,
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 12px", maxWidth: 380,
      background: "var(--bg-surface)", border: "1px solid var(--bd-default)",
      borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      fontSize: 12, color: "var(--fg-secondary)", zIndex: 200,
    },
    text: { flex: 1, minWidth: 0 },
    title: { fontSize: 13, fontWeight: 500, color: "var(--fg-primary)" },
    sub: { fontSize: 11, color: "var(--fg-tertiary)", marginTop: 2 },
  };

  const Banner = () => {
    const [info, setInfo] = useState(null);   // { current, latest, url, name, available }
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
      const api = window.schoolworkAPI && window.schoolworkAPI.updates;
      if (!api || !api.check) return;     // web build: no IPC, no check
      let cancelled = false;
      (async () => {
        try {
          const r = await api.check();
          if (cancelled || !r || !r.available) return;
          try { if (localStorage.getItem(SNOOZE_KEY(r.latest))) return; } catch {}
          setInfo(r);
        } catch { /* offline / rate-limited — stay quiet */ }
      })();
      return () => { cancelled = true; };
    }, []);

    if (!info || hidden) return null;

    const onDownload = () => { window.schoolworkAPI?.openExternal?.(info.url); onDismiss(); };
    const onDismiss = () => {
      try { localStorage.setItem(SNOOZE_KEY(info.latest), "1"); } catch {}
      setHidden(true);
    };

    return (
      <div style={S.box} role="status" aria-live="polite">
        <Icon name="bell" size={16} />
        <div style={S.text}>
          <div style={S.title}>Update available — {info.name || ("v" + info.latest)}</div>
          <div style={S.sub}>You're on v{info.current}. Click Download to get the latest installer.</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={onDownload}>Download</button>
        <button className="iconbtn" style={{ width: 22, height: 22 }} onClick={onDismiss} aria-label="Dismiss">
          <Icon name="close" size={12} />
        </button>
      </div>
    );
  };

  return { Banner };
})();

if (typeof window !== "undefined") window.UpdateBanner = UpdateBanner;
