/* global React, Icon */

/* ============================================================
   Cross-device sync via a cloud-synced folder (OneDrive / Dropbox / …)

   The whole app persists to localStorage under the `schoolwork:` prefix
   (data, accounts, session, terms, tweaks). This module mirrors that
   namespace to ONE JSON snapshot file inside a folder the OS already syncs
   between machines. The model is "last full snapshot wins":

     • on launch  → PULL: if the snapshot is newer than what we last saw,
                    load it into localStorage *before* React reads it.
     • on change  → PUSH: debounced full-snapshot write (skipped when the
                    snapshot is byte-identical to what's already there).
     • on hide    → PUSH immediately, so closing the laptop flushes.
     • on focus / "Sync now" → PULL-IF-NEWER, prompting before reloading
                    so an in-progress edit is never silently lost.

   Google tokens live in encrypted per-machine files (not localStorage), so
   credentials intentionally stay device-local and never travel in the snapshot.
   ============================================================ */

const SyncBridge = (() => {
  const api = (typeof window !== "undefined" && window.schoolworkAPI && window.schoolworkAPI.sync) || null;
  const PREFIX = "schoolwork:";
  const META_KEY = "swSyncMeta"; // machine-local bookkeeping; deliberately NOT under the synced prefix

  const available = () => !!api;

  const readMeta = () => { try { return JSON.parse(localStorage.getItem(META_KEY) || "{}"); } catch { return {}; } };
  const writeMeta = (m) => { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch {} };

  /* ---- snapshot helpers ---- */
  function snapshot() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) data[k] = localStorage.getItem(k);
    }
    return data;
  }
  // Order-independent equality so re-persisting identical state on launch
  // doesn't churn the snapshot (which would needlessly wake the other device).
  const norm = (o) => JSON.stringify(Object.keys(o || {}).sort().map(k => [k, o[k]]));
  const sameData = (a, b) => norm(a) === norm(b);

  let applying = false; // guards the localStorage patch while a pull writes keys

  // Mirror a remote snapshot onto this device: set every remote key, then drop
  // any local `schoolwork:` key the remote no longer has (so deletions sync too).
  function applyRemote(remote) {
    applying = true;
    try {
      const incoming = remote.data || {};
      const localKeys = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(PREFIX)) localKeys.push(k); }
      localKeys.forEach(k => { if (!(k in incoming)) localStorage.removeItem(k); });
      Object.keys(incoming).forEach(k => localStorage.setItem(k, incoming[k]));
      writeMeta({ lastSyncedUpdatedAt: remote.updatedAt || "" });
    } finally { applying = false; }
  }

  // Only apply a snapshot that's real (carries the accounts key) and strictly
  // newer than the last snapshot this device wrote or pulled.
  function isRealSnapshot(remote) {
    return !!(remote && remote.data && typeof remote.data === "object" && (PREFIX + "accounts" in remote.data));
  }
  function isNewer(remote) {
    const seen = readMeta().lastSyncedUpdatedAt || "";
    return String((remote && remote.updatedAt) || "") > seen;
  }

  async function getConfig() { try { return await api.getConfig(); } catch { return null; } }
  async function isEnabled() { const c = await getConfig(); return !!(c && c.enabled && c.dir); }

  /* ---- pull (startup) ---- */
  async function pullOnStartup() {
    if (!available() || !(await isEnabled())) return false;
    let remote = null;
    try { remote = await api.read(); } catch { remote = null; }
    if (isRealSnapshot(remote) && isNewer(remote)) { applyRemote(remote); return true; }
    return false;
  }

  /* ---- push (debounced) ---- */
  let pushTimer = null;
  async function doPush() {
    if (!available() || !(await isEnabled())) return;
    const data = snapshot();
    let remote = null;
    try { remote = await api.read(); } catch {}
    // Nothing changed since the file was written → just record we're current.
    if (remote && remote.data && sameData(remote.data, data)) {
      if (remote.updatedAt) writeMeta({ lastSyncedUpdatedAt: remote.updatedAt });
      return;
    }
    const updatedAt = new Date().toISOString();
    try {
      await api.write({ version: 1, updatedAt, data });
      writeMeta({ lastSyncedUpdatedAt: updatedAt });
    } catch { /* folder offline / no permission — keep local, retry on next change */ }
  }
  function schedulePush(delay = 1500) {
    if (!available() || applying) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(doPush, delay);
  }
  function flushPush() { clearTimeout(pushTimer); return doPush(); }

  // Catch every write to the synced namespace without touching call sites,
  // and flush when the window is hidden/closed so switching machines is safe.
  function installAutoPush() {
    if (!available() || installAutoPush._done) return;
    installAutoPush._done = true;
    const origSet = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (k, v) { origSet(k, v); if (!applying && typeof k === "string" && k.startsWith(PREFIX)) schedulePush(); };
    const origRemove = localStorage.removeItem.bind(localStorage);
    localStorage.removeItem = function (k) { origRemove(k); if (!applying && typeof k === "string" && k.startsWith(PREFIX)) schedulePush(); };

    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushPush(); });
    window.addEventListener("pagehide", () => { flushPush(); });

    // When the window regains focus, offer to load anything the other device
    // saved while we were away (only prompts when there's genuinely newer data).
    let lastFocusCheck = 0;
    window.addEventListener("focus", () => {
      const now = Date.now();
      if (now - lastFocusCheck < 4000) return; // debounce rapid alt-tabbing
      lastFocusCheck = now;
      pullIfNewer({ confirmFirst: true });
    });
  }

  /* ---- pull at runtime (focus / Sync now): apply + reload so React re-reads ---- */
  async function pullIfNewer({ confirmFirst = false } = {}) {
    if (!available() || !(await isEnabled())) return { applied: false, reason: "disabled" };
    let remote = null;
    try { remote = await api.read(); } catch {}
    if (!isRealSnapshot(remote) || !isNewer(remote)) return { applied: false, reason: "current" };
    if (confirmFirst) {
      const when = remote.updatedAt ? new Date(remote.updatedAt).toLocaleString() : "another device";
      const ok = window.confirm(
        "Newer Schoolwork data was found (saved by " + (remote.device || "another device") + " at " + when + ").\n\n" +
        "Load it onto this device now? Any unsaved edits on the current screen will be lost."
      );
      if (!ok) return { applied: false, reason: "declined" };
    }
    applyRemote(remote);
    location.reload();
    return { applied: true };
  }

  // Manual "Sync now": prefer pulling newer remote work, otherwise push ours.
  async function syncNow() {
    if (!available()) return { ok: false, reason: "web" };
    if (!(await isEnabled())) return { ok: false, reason: "disabled" };
    let remote = null;
    try { remote = await api.read(); } catch {}
    if (isRealSnapshot(remote) && isNewer(remote)) { applyRemote(remote); location.reload(); return { ok: true, pulled: true }; }
    await flushPush();
    return { ok: true, pulled: false };
  }

  // Turning sync on: if the folder already holds a real snapshot, the caller
  // must decide whether to LOAD it or OVERWRITE it — returned as `existing`.
  async function enable(dir) {
    if (!available()) return { ok: false };
    await api.setConfig({ enabled: true, dir });
    let remote = null;
    try { remote = await api.read(); } catch {}
    if (isRealSnapshot(remote)) return { ok: true, existing: true, remote };
    await flushPush(); // fresh folder → seed it with this device's data
    return { ok: true, existing: false };
  }
  function loadExisting(remote) { applyRemote(remote); location.reload(); }

  /* ============================================================
     Settings panel — lives under Settings → "Sync devices"
     ============================================================ */
  const SyncPanel = ({ pushToast }) => {
    const { useState, useEffect, useCallback } = React;
    const [cfg, setCfg] = useState(null);     // { enabled, dir, defaultDir, device }
    const [remote, setRemote] = useState(null);
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
      const c = await getConfig();
      setCfg(c);
      let r = null; try { r = await api.read(); } catch {}
      setRemote(r);
    }, []);
    useEffect(() => { if (available()) refresh(); }, [refresh]);

    const Section = ({ title, subtitle, children }) => (
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--fg-primary)" }}>{title}</h2>
        {subtitle && <p style={{ margin: "4px 0 16px", fontSize: 13, color: "var(--fg-secondary)" }}>{subtitle}</p>}
        {children}
      </section>
    );

    if (!available()) {
      return (
        <Section title="Sync across devices" subtitle="Keep your laptop and desktop in step.">
          <div className="empty" style={{ background: "var(--bg-surface)", border: "1px solid var(--bd-default)", borderRadius: 6, padding: "var(--s-8)" }}>
            <div className="empty-icon"><Icon name="refresh" /></div>
            <h3>Only available in the desktop app</h3>
            <p>Folder sync writes to your computer's file system, so it runs in the installed Schoolwork app — not in a browser.</p>
          </div>
        </Section>
      );
    }
    if (!cfg) return null;

    const folder = cfg.dir || cfg.defaultDir;
    const lastSaved = remote && remote.updatedAt ? new Date(remote.updatedAt).toLocaleString() : null;

    const onToggle = async () => {
      if (cfg.enabled) {
        await api.setConfig({ enabled: false, dir: cfg.dir });
        await refresh();
        pushToast?.({ tone: "warning", title: "Sync turned off", body: "This device will stop reading and writing the shared folder." });
        return;
      }
      setBusy(true);
      try {
        const res = await enable(cfg.dir || cfg.defaultDir);
        if (res.existing) {
          const when = res.remote.updatedAt ? new Date(res.remote.updatedAt).toLocaleString() : "an earlier session";
          const load = window.confirm(
            "This folder already contains Schoolwork data (saved by " + (res.remote.device || "another device") + " at " + when + ").\n\n" +
            "OK — load that data onto this device.\n" +
            "Cancel — keep this device's data and overwrite the folder."
          );
          if (load) { pushToast?.({ tone: "success", title: "Loading shared data…" }); loadExisting(res.remote); return; }
          await flushPush();
          pushToast?.({ tone: "warning", title: "Folder overwritten", body: "The shared copy now matches this device." });
        } else {
          pushToast?.({ tone: "success", title: "Sync turned on", body: "Saved this device's data to " + (cfg.dir || cfg.defaultDir) });
        }
        await refresh();
      } finally { setBusy(false); }
    };

    const onPick = async () => {
      const dir = await api.pickFolder();
      if (!dir) return;
      await api.setConfig({ enabled: cfg.enabled, dir });
      if (cfg.enabled) await flushPush();
      await refresh();
      pushToast?.({ tone: "success", title: "Sync folder set", body: dir });
    };

    const onSyncNow = async () => {
      setBusy(true);
      try {
        const r = await syncNow();
        if (r.ok && !r.pulled) pushToast?.({ tone: "success", title: "Synced", body: "Your latest changes were saved to the shared folder." });
        // a successful pull reloads the page, so no toast is needed there
      } finally { setBusy(false); }
    };

    return (
      <>
        <Section
          title="Sync across devices"
          subtitle="Mirror your subjects, assignments, notes and settings through a cloud-synced folder (OneDrive, Dropbox, Google Drive Desktop). Each device reads the latest on launch and saves its changes back — last save wins.">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--bd-subtle)" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Sync this device</div>
              <div style={{ fontSize: 11, color: "var(--fg-tertiary)" }}>{cfg.enabled ? "On — reading and writing the shared folder." : "Off — your data stays on this device only."}</div>
            </div>
            <button role="switch" aria-checked={cfg.enabled} className={"toggle " + (cfg.enabled ? "on" : "")} disabled={busy} onClick={onToggle}><span /></button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 16, alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--bd-subtle)" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Shared folder</div>
              <div style={{ fontSize: 11, color: "var(--fg-tertiary)", marginTop: 2 }}>Pick the same cloud folder on each computer.</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", maxWidth: 460 }}>
              <input className="input" readOnly value={folder} title={folder} style={{ flex: 1, fontSize: 12 }} />
              <button className="btn btn-secondary btn-sm" onClick={onPick}><Icon name="link" size={13} /> Change…</button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <button className="btn btn-primary" disabled={!cfg.enabled || busy} onClick={onSyncNow}><Icon name="refresh" size={14} /> Sync now</button>
          </div>
        </Section>

        <Section title="Status">
          <dl className="dl">
            <dt>This device</dt><dd>{cfg.device || "—"}</dd>
            <dt>Sync</dt><dd>{cfg.enabled ? "On" : "Off"}</dd>
            <dt>Last saved to folder</dt><dd>{lastSaved ? lastSaved + (remote && remote.device ? " · by " + remote.device : "") : "No snapshot yet"}</dd>
          </dl>
          <p style={{ fontSize: 12, color: "var(--fg-tertiary)", marginTop: 12, lineHeight: 1.6 }}>
            Tip: keep the app closed on a computer you're not using. If both are open and you edit each at once, whichever saves last wins.
            Your Google sign-in is intentionally <b>not</b> synced — connect it separately on each device.
          </p>
        </Section>
      </>
    );
  };

  return { available, pullOnStartup, installAutoPush, schedulePush, flushPush, syncNow, pullIfNewer, enable, loadExisting, SyncPanel };
})();

if (typeof window !== "undefined") window.SyncBridge = SyncBridge;
