/* global React, Icon */

/* ============================================================
   Cross-device sync via a cloud-synced folder (OneDrive / Dropbox / …)

   MANUAL model:
     • localStorage IS the device's "temp" workspace — edits never leave
       this machine until the user clicks **Push to OneDrive**.
     • **Pull from OneDrive** is also manual — clicking it overwrites the
       local workspace with the snapshot currently in the shared folder.
     • Nothing is mirrored automatically on writes, focus, or window hide;
       startup only does a passive check so the panel can flag "OneDrive
       has newer data" without applying anything behind your back.

   On disk:
     • shared folder    → schoolwork-sync.json   (one full snapshot)
     • this machine     → swSyncMeta in localStorage  (last push/pull bookkeeping)

   Google tokens stay machine-local in encrypted files — they intentionally
   never travel in the snapshot.
   ============================================================ */

const SyncBridge = (() => {
  const api = (typeof window !== "undefined" && window.schoolworkAPI && window.schoolworkAPI.sync) || null;
  const PREFIX = "schoolwork:";
  const META_KEY = "swSyncMeta"; // machine-local bookkeeping; deliberately NOT under the synced prefix

  const available = () => !!api;

  const readMeta = () => { try { return JSON.parse(localStorage.getItem(META_KEY) || "{}"); } catch { return {}; } };
  const writeMeta = (patch) => {
    try { localStorage.setItem(META_KEY, JSON.stringify({ ...readMeta(), ...patch })); } catch {}
  };

  /* ---- snapshot helpers ---- */
  function snapshot() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) data[k] = localStorage.getItem(k);
    }
    return data;
  }
  // Order-independent equality so re-persisting identical state doesn't
  // churn the file (which would needlessly wake the other device).
  const norm = (o) => JSON.stringify(Object.keys(o || {}).sort().map(k => [k, o[k]]));
  const sameData = (a, b) => norm(a) === norm(b);

  // Cheap per-key hash so we can show "n local changes since last push"
  // without keeping a full copy of the last snapshot around.
  const hashStr = (s) => {
    let h = 5381;
    for (let i = 0; i < (s || "").length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return h.toString(36);
  };
  function fingerprint(data) {
    const fp = {}; Object.keys(data).forEach(k => { fp[k] = hashStr(data[k]); }); return fp;
  }
  function diffCount(currentFp, savedFp) {
    if (!savedFp || typeof savedFp !== "object") return Object.keys(currentFp).length; // never pushed → everything is pending
    let n = 0;
    const all = new Set([...Object.keys(currentFp), ...Object.keys(savedFp)]);
    all.forEach(k => { if (currentFp[k] !== savedFp[k]) n += 1; });
    return n;
  }

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
      writeMeta({
        lastPulledAt: new Date().toISOString(),
        lastSyncedUpdatedAt: remote.updatedAt || "",
        lastPushedFingerprint: fingerprint(incoming), // post-pull state matches remote → no pending changes
      });
    } finally { applying = false; }
  }

  // Only treat a remote as real when it carries the accounts key (so an empty
  // or partial file isn't mistaken for a valid snapshot to apply).
  function isRealSnapshot(remote) {
    return !!(remote && remote.data && typeof remote.data === "object" && (PREFIX + "accounts" in remote.data));
  }
  function isNewerThanLastPull(remote) {
    const seen = readMeta().lastSyncedUpdatedAt || "";
    return String((remote && remote.updatedAt) || "") > seen;
  }

  async function getConfig() { try { return await api.getConfig(); } catch { return null; } }
  async function isEnabled() { const c = await getConfig(); return !!(c && c.enabled && c.dir); }

  /* ---- startup: passive check only (never auto-applies) ----
     Caches the "remote is newer" flag so the Sync panel and any future
     banner can call out that there's work to pull. Returns the cached
     state so callers can react if they want to. */
  let startupState = { checked: false, remote: null, remoteIsNewer: false };
  async function checkOnStartup() {
    if (!available() || !(await isEnabled())) { startupState = { checked: true, remote: null, remoteIsNewer: false }; return startupState; }
    let remote = null;
    try { remote = await api.read(); } catch {}
    startupState = { checked: true, remote, remoteIsNewer: isRealSnapshot(remote) && isNewerThanLastPull(remote) };
    return startupState;
  }

  /* ---- manual push ----
     Writes the current local snapshot to the shared folder. No timers,
     no debouncing — fires exactly when the user asks for it. */
  async function pushNow() {
    if (!available()) return { ok: false, reason: "web" };
    if (!(await isEnabled())) return { ok: false, reason: "disabled" };
    const data = snapshot();
    let remote = null;
    try { remote = await api.read(); } catch {}
    if (remote && remote.data && sameData(remote.data, data)) {
      // Identical to what's already there — just refresh bookkeeping.
      writeMeta({ lastPushedAt: new Date().toISOString(), lastPushedFingerprint: fingerprint(data), lastSyncedUpdatedAt: remote.updatedAt || readMeta().lastSyncedUpdatedAt });
      return { ok: true, unchanged: true };
    }
    const updatedAt = new Date().toISOString();
    try {
      await api.write({ version: 1, updatedAt, data });
      writeMeta({ lastPushedAt: updatedAt, lastSyncedUpdatedAt: updatedAt, lastPushedFingerprint: fingerprint(data) });
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: "write-failed", error: String(e && e.message || e) };
    }
  }

  /* ---- manual pull ----
     Replaces the local snapshot with whatever's currently in the folder.
     Always confirms first — pulling is destructive to any in-progress
     edits that haven't been pushed back. */
  async function pullNow({ confirmFirst = true } = {}) {
    if (!available()) return { ok: false, reason: "web" };
    if (!(await isEnabled())) return { ok: false, reason: "disabled" };
    let remote = null;
    try { remote = await api.read(); } catch {}
    if (!isRealSnapshot(remote)) return { ok: false, reason: "no-snapshot" };
    if (confirmFirst) {
      const when = remote.updatedAt ? new Date(remote.updatedAt).toLocaleString() : "an earlier session";
      const pending = pendingChangeCount();
      const pendingNote = pending ? "\n\nThere are " + pending + " local change" + (pending === 1 ? "" : "s") + " on this device that haven't been pushed yet — they will be overwritten." : "";
      const ok = window.confirm(
        "Pull the snapshot saved by " + (remote.device || "another device") + " at " + when + " onto this computer?" + pendingNote
      );
      if (!ok) return { ok: false, reason: "declined" };
    }
    applyRemote(remote);
    location.reload();   // remount React so it re-reads the freshly-replaced localStorage
    return { ok: true };
  }

  /* ---- enabling sync turns it on but doesn't push or pull behind the user ----
     If the folder already holds a snapshot we hand it back so the caller can
     ask whether to Pull or Push. Empty folder = nothing happens until the
     user explicitly pushes. */
  async function enable(dir) {
    if (!available()) return { ok: false };
    await api.setConfig({ enabled: true, dir });
    let remote = null;
    try { remote = await api.read(); } catch {}
    return { ok: true, existing: isRealSnapshot(remote), remote };
  }
  async function disable() {
    if (!available()) return;
    const cfg = await getConfig();
    await api.setConfig({ enabled: false, dir: cfg?.dir || "" });
  }

  function pendingChangeCount() {
    return diffCount(fingerprint(snapshot()), readMeta().lastPushedFingerprint);
  }
  function lastPushedAt() { return readMeta().lastPushedAt || null; }
  function lastPulledAt() { return readMeta().lastPulledAt || null; }
  function getStartupState() { return startupState; }

  /* ============================================================
     Settings panel — lives under Settings → "Sync devices"
     ============================================================ */
  const SyncPanel = ({ pushToast }) => {
    const { useState, useEffect, useCallback } = React;
    const [cfg, setCfg] = useState(null);     // { enabled, dir, defaultDir, device }
    const [remote, setRemote] = useState(null);
    const [busy, setBusy] = useState(false);
    const [pending, setPending] = useState(0);
    const [, force] = useState(0);
    const bump = () => force(x => x + 1);

    const refresh = useCallback(async () => {
      const c = await getConfig();
      setCfg(c);
      let r = null; try { r = await api.read(); } catch {}
      setRemote(r);
      setPending(pendingChangeCount());
    }, []);
    useEffect(() => { if (available()) refresh(); }, [refresh]);

    // Recount pending changes every few seconds so the indicator stays
    // honest while the user edits other parts of the app in the background.
    useEffect(() => {
      if (!available()) return;
      const t = setInterval(() => setPending(pendingChangeCount()), 4000);
      return () => clearInterval(t);
    }, []);

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
    const lastPushedLocal = lastPushedAt() ? new Date(lastPushedAt()).toLocaleString() : null;
    const lastPulledLocal = lastPulledAt() ? new Date(lastPulledAt()).toLocaleString() : null;
    const remoteIsNewer = isRealSnapshot(remote) && isNewerThanLastPull(remote);

    const onToggle = async () => {
      if (cfg.enabled) {
        await disable();
        await refresh();
        pushToast?.({ tone: "warning", title: "Sync turned off", body: "Your data stays on this device until you turn sync back on." });
        return;
      }
      setBusy(true);
      try {
        const res = await enable(cfg.dir || cfg.defaultDir);
        if (res.existing) {
          const when = res.remote.updatedAt ? new Date(res.remote.updatedAt).toLocaleString() : "an earlier session";
          pushToast?.({ tone: "success", title: "Sync turned on", body: "The shared folder already holds a snapshot from " + (res.remote.device || "another device") + " (" + when + "). Use Pull or Push when you're ready." });
        } else {
          pushToast?.({ tone: "success", title: "Sync turned on", body: "Use Push to OneDrive when you want to save this device's data to the folder." });
        }
        await refresh();
      } finally { setBusy(false); }
    };

    const onPick = async () => {
      const dir = await api.pickFolder();
      if (!dir) return;
      await api.setConfig({ enabled: cfg.enabled, dir });
      await refresh();
      pushToast?.({ tone: "success", title: "Sync folder set", body: dir });
    };

    const onPush = async () => {
      setBusy(true);
      try {
        const r = await pushNow();
        if (r.ok) pushToast?.({ tone: "success", title: r.unchanged ? "Already up to date" : "Pushed to OneDrive", body: r.unchanged ? "The shared folder already matches this device." : "Your latest changes are now in the shared folder." });
        else pushToast?.({ tone: "warning", title: "Push failed", body: r.reason === "disabled" ? "Turn sync on first." : (r.error || "Couldn't write to the shared folder.") });
        await refresh();
        bump();
      } finally { setBusy(false); }
    };
    const onPull = async () => {
      setBusy(true);
      try {
        const r = await pullNow({ confirmFirst: true });
        if (!r.ok && r.reason !== "declined") {
          pushToast?.({ tone: "warning", title: "Nothing to pull", body: r.reason === "no-snapshot" ? "The shared folder has no Schoolwork snapshot yet." : "Sync isn't enabled on this device." });
        }
        // a successful pull triggers location.reload() — no further UI to update here
      } finally { setBusy(false); }
    };

    return (
      <>
        <Section
          title="Sync across devices"
          subtitle="Edits stay on this device until you push them to the shared folder. Pulling overwrites this device with whatever's currently in the folder. Nothing happens automatically.">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--bd-subtle)" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Sync this device</div>
              <div style={{ fontSize: 11, color: "var(--fg-tertiary)" }}>{cfg.enabled ? "On — Push and Pull buttons read/write the shared folder." : "Off — your data stays on this device only."}</div>
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

          {(pending > 0 || remoteIsNewer) && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", marginTop: 12, background: "var(--warning-soft)", border: "1px solid var(--warning)", borderRadius: 6, fontSize: 12, color: "var(--fg-primary)" }}>
              <Icon name="circle-warn" size={13} />
              <div style={{ flex: 1 }}>
                {pending > 0 && <div><b>{pending}</b> local change{pending === 1 ? "" : "s"} not yet pushed to OneDrive.</div>}
                {remoteIsNewer && <div>OneDrive has newer data from <b>{remote?.device || "another device"}</b> ({lastSaved}).</div>}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <button className="btn btn-primary" disabled={!cfg.enabled || busy || pending === 0} onClick={onPush}>
              <Icon name="export" size={14} /> Push to OneDrive{pending > 0 ? " (" + pending + ")" : ""}
            </button>
            <button className="btn btn-secondary" disabled={!cfg.enabled || busy} onClick={onPull}>
              <Icon name="download" size={14} /> Pull from OneDrive
            </button>
          </div>
        </Section>

        <Section title="Status">
          <dl className="dl">
            <dt>This device</dt><dd>{cfg.device || "—"}</dd>
            <dt>Sync</dt><dd>{cfg.enabled ? "On (manual)" : "Off"}</dd>
            <dt>Pending changes here</dt><dd>{pending === 0 ? "None — local matches last push" : pending + " key" + (pending === 1 ? "" : "s") + " changed since last push"}</dd>
            <dt>Last push from here</dt><dd>{lastPushedLocal || "Never"}</dd>
            <dt>Last pull to here</dt><dd>{lastPulledLocal || "Never"}</dd>
            <dt>Latest snapshot in folder</dt><dd>{lastSaved ? lastSaved + (remote && remote.device ? " · by " + remote.device : "") : "No snapshot yet"}</dd>
          </dl>
          <p style={{ fontSize: 12, color: "var(--fg-tertiary)", marginTop: 12, lineHeight: 1.6 }}>
            Push writes this device's full workspace into one JSON file in the shared folder. Pull replaces this device's workspace with the file's contents — anything unpushed is lost. Your Google sign-in is <b>not</b> synced; connect it separately on each device.
          </p>
        </Section>
      </>
    );
  };

  return {
    available,
    // startup
    checkOnStartup, getStartupState,
    // manual actions
    pushNow, pullNow,
    // config helpers (used by the panel; safe to expose)
    enable, disable,
    // status helpers
    pendingChangeCount, lastPushedAt, lastPulledAt,
    // UI
    SyncPanel,
  };
})();

if (typeof window !== "undefined") window.SyncBridge = SyncBridge;
