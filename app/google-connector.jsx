/* global React, Icon */

/* ============================================================
   Google Calendar connector — renderer side
   ----------------------------------------------------------------
   Talks to the Electron main process over the contextBridge in
   preload.js (window.schoolworkAPI.google). In a normal web
   browser (no Electron) the API is absent and the panel renders
   a "desktop only" notice instead.
   ============================================================ */

const GoogleConnector = (() => {
  const { useState, useEffect, useCallback, useMemo } = React;
  const api = (typeof window !== 'undefined') ? window.schoolworkAPI : null;
  const isDesktop = !!api?.isDesktop;

  /* -------------------------------------------------------- */
  /* Mapping: Schoolwork → Google Calendar events             */
  /* -------------------------------------------------------- */

  // Course → Google colorId (1..11) — restrained palette
  const COURSE_COLOR_ID = { CHM: '7', MAM: '3', ENG: '6', SOR: '10', DSL: '5' };

  // Schoolwork stores naive local datetimes (no zone) and the student is in
  // Queensland, so every Google push is pinned to AEST (UTC+10, no DST) — the
  // resulting events are correct regardless of the machine's own time zone.
  const AEST = 'Australia/Brisbane';
  const AEST_MS = 10 * 3600e3;
  const naiveToInstant = (s) => new Date(/Z$|[+]\d\d:\d\d$/.test(s) ? s : (s.length <= 16 ? s + ':00+10:00' : s + '+10:00'));
  const toAest = (instant) => new Date(instant.getTime() + AEST_MS).toISOString().replace(/\.\d{3}Z$/, '+10:00');

  // Convert one assignment into a Google Calendar event.
  // `reminderMinutes` controls the pop-up reminder lead time (null = none).
  function assignmentToEvent(a, course, reminderMinutes) {
    const due = naiveToInstant(a.due);
    const minutes = Math.max(15, Number(a.est) || 60);
    const start = new Date(due.getTime() - minutes * 60 * 1000);
    return {
      schoolworkId: a.id,
      summary: `${course?.code || a.course} — ${a.title}`,
      description: [
        `Schoolwork assignment ${a.id}`,
        course ? `Subject: ${course.title} (${course.code})` : null,
        `Type: ${a.type}`,
        `Weight: ${a.weight}%   Points: ${a.points}${a.earned != null ? `   Earned: ${a.earned}` : ''}`,
        `Priority: ${a.priority}`,
        '',
        a.notes || '',
      ].filter(Boolean).join('\n'),
      start: toAest(start),
      end:   toAest(due),
      timeZone: AEST,
      colorId: COURSE_COLOR_ID[a.course],
      reminderMinutes: reminderMinutes,
      location: course?.room || '',
    };
  }

  // A separate "draft due" milestone for essays that carry a draftDue date.
  function draftToEvent(a, course, reminderMinutes) {
    const draft = naiveToInstant(a.draftDue);
    const start = new Date(draft.getTime() - 30 * 60 * 1000);
    return {
      schoolworkId: a.id + ':draft',
      summary: `DRAFT — ${course?.code || a.course} — ${a.title}`,
      description: `Draft milestone for Schoolwork assignment ${a.id}.\nFinal due: ${naiveToInstant(a.due).toLocaleString('en-AU', { timeZone: AEST })}`,
      start: toAest(start),
      end: toAest(draft),
      timeZone: AEST,
      colorId: COURSE_COLOR_ID[a.course],
      reminderMinutes,
      location: course?.room || '',
    };
  }

  // Convert one Schoolwork calendar event (one-off, dated) into a Google event.
  function calEventToGoogle(e, calName, reminderMinutes) {
    const start = naiveToInstant(`${e.date}T${e.start || '12:00'}`);
    const end = naiveToInstant(`${e.date}T${e.end || e.start || '13:00'}`);
    return {
      schoolworkId: 'E-' + e.id,
      summary: e.title,
      description: [`Schoolwork event`, calName ? `Calendar: ${calName}` : null, '', e.notes || ''].filter(Boolean).join('\n'),
      start: toAest(start),
      end: toAest(end),
      timeZone: AEST,
      reminderMinutes,
      location: '',
    };
  }

  // Selectable push scopes (classes are intentionally NEVER pushed —
  // your timetable already lives in Google).
  const SCOPES = [
    { id: 'open',   label: 'All open assignments',        match: (a) => a.status !== 'graded' && a.status !== 'submitted' },
    { id: 'week',   label: 'Due within 7 days',           match: (a, now) => a.status !== 'graded' && (new Date(a.due) - now) <= 7 * 864e5 && (new Date(a.due) - now) >= -864e5 },
    { id: 'month',  label: 'Due within 30 days',          match: (a, now) => a.status !== 'graded' && (new Date(a.due) - now) <= 30 * 864e5 && (new Date(a.due) - now) >= -864e5 },
    { id: 'overdue',label: 'Overdue only',                match: (a, now) => a.status !== 'graded' && a.status !== 'submitted' && new Date(a.due) < now },
    { id: 'subject',label: 'A specific subject',          match: (a, now, subj) => a.course === subj && a.status !== 'graded' },
    { id: 'all',    label: 'Every assignment (incl. graded)', match: () => true },
  ];

  const REMINDERS = [
    { v: 0,    label: 'At the due time' },
    { v: 60,   label: '1 hour before' },
    { v: 180,  label: '3 hours before' },
    { v: 1440, label: '1 day before' },
    { v: 2880, label: '2 days before' },
    { v: 10080,label: '1 week before' },
    { v: -1,   label: 'No reminder' },
  ];

  /* -------------------------------------------------------- */
  /* Settings panel UI                                         */
  /* -------------------------------------------------------- */
  const Panel = ({ pushToast }) => {
    const { useStore } = window.Store;
    const { courses, assignments } = useStore();
    const { account } = window.Auth.useAuth();
    const seed = window.SchoolworkData;

    const [status, setStatus]       = useState({ connected: false, hasClientConfig: false, email: null });
    const [clientId, setClientId]   = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [calendars, setCalendars] = useState([]);
    const [calendarId, setCalendarId] = useState('primary');
    const [busy, setBusy]           = useState(false);
    const [lastResult, setLastResult] = useState(null);
    const [scope, setScope]         = useState('open');
    const [subject, setSubject]     = useState(courses[0]?.id || '');
    const [reminder, setReminder]   = useState(1440);

    const refreshStatus = useCallback(async () => {
      if (!api) return;
      try {
        await api.setAccount?.(account?.id);
        const s = await api.google.status();
        setStatus(s);
        if (s.connected) {
          try { setCalendars(await api.google.listCalendars()); } catch {}
        } else {
          setCalendars([]);
        }
        const cfg = await api.google.getClient();
        if (cfg) {
          setClientId(cfg.client_id || '');
          setClientSecret(cfg.client_secret || '');
        }
      } catch (e) { /* main process not ready / not desktop — leave defaults */ }
    }, [account]);

    useEffect(() => { refreshStatus(); }, [refreshStatus]);

    const saveClient = async () => {
      if (!clientId || !clientSecret) {
        pushToast?.({ tone: 'warning', title: 'Missing fields', body: 'Add both client ID and client secret.' });
        return;
      }
      await api.google.setClient({ client_id: clientId.trim(), client_secret: clientSecret.trim() });
      pushToast?.({ tone: 'success', title: 'Google client saved' });
      await refreshStatus();
    };

    const connect = async () => {
      setBusy(true);
      try {
        await api.google.connect();
        pushToast?.({ tone: 'success', title: 'Google account connected' });
        await refreshStatus();
      } catch (e) {
        pushToast?.({ tone: 'warning', title: 'Connection failed', body: e.message });
      } finally { setBusy(false); }
    };

    const disconnect = async () => {
      setBusy(true);
      try {
        await api.google.disconnect();
        pushToast?.({ tone: 'success', title: 'Disconnected' });
        await refreshStatus();
      } finally { setBusy(false); }
    };

    const selectedAssignments = () => {
      const now = new Date();
      const sc = SCOPES.find(s => s.id === scope) || SCOPES[0];
      return assignments.filter(a => sc.match(a, now, subject));
    };

    const pushAssignments = async () => {
      setBusy(true);
      try {
        const chosen = selectedAssignments();
        if (chosen.length === 0) { pushToast?.({ tone: 'warning', title: 'Nothing to push', body: 'No assignments match that selection.' }); return; }
        const remMin = reminder === -1 ? null : reminder;
        // For every assignment push the final-due event; if it also has a
        // draftDue milestone, push that as a SEPARATE event (own schoolworkId,
        // suffixed ":draft") so both deadlines land in Google Calendar.
        const events = [];
        let drafts = 0;
        for (const a of chosen) {
          const course = courses.find(c => c.id === a.course);
          events.push(assignmentToEvent(a, course, remMin));
          if (a.draftDue) { events.push(draftToEvent(a, course, remMin)); drafts++; }
        }
        const res = await api.google.pushEvents(calendarId, events);
        setLastResult({ kind: 'assignments', res });
        pushToast?.({ tone: 'success', title: 'Calendar updated', body: `${chosen.length} assignment${chosen.length === 1 ? '' : 's'} pushed` + (drafts ? ` · ${drafts} draft milestone${drafts === 1 ? '' : 's'} included` : '') + '.' });
      } catch (e) {
        pushToast?.({ tone: 'warning', title: 'Sync failed', body: e.message });
      } finally { setBusy(false); }
    };

    const purge = async () => {
      if (!confirm('Remove every Schoolwork-created event from this calendar? Your own (non-Schoolwork) events are untouched.')) return;
      setBusy(true);
      try {
        const res = await api.google.purgeEvents(calendarId);
        setLastResult(null);
        pushToast?.({ tone: 'success', title: 'Calendar cleaned', body: `${res.removed} Schoolwork event${res.removed === 1 ? '' : 's'} removed.` });
      } catch (e) {
        pushToast?.({ tone: 'warning', title: 'Cleanup failed', body: e.message });
      } finally { setBusy(false); }
    };

    if (!isDesktop) {
      return (
        <div className="empty" style={{ background: 'var(--bg-surface)', border: '1px solid var(--bd-default)', borderRadius: 6, padding: 'var(--s-10)' }}>
          <div className="empty-icon"><Icon name="calendar" /></div>
          <h3>Available in the desktop app only</h3>
          <p>
            Google Calendar sync runs through the desktop runtime so OAuth credentials and refresh tokens stay
            off the web. Install the packaged Schoolwork application to use this feature.
          </p>
        </div>
      );
    }

    const statusBadge = status.connected
      ? <span className="badge success">Connected{status.email ? ` · ${status.email}` : ''}</span>
      : <span className="badge neutral">Not connected</span>;

    return (
      <>
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Google Calendar</h2>
          <p style={{ margin: '4px 0 16px', fontSize: 13, color: 'var(--fg-secondary)' }}>
            Push assignment due dates to a calendar of your choice. Re-syncing updates existing events instead
            of duplicating them. Classes are never pushed — your timetable already lives in Google.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--bd-subtle)' }}>
            <Icon name="calendar" size={18} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>Connection</div>
              <div style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>OAuth tokens are encrypted at rest with the OS keychain.</div>
            </div>
            <div>{statusBadge}</div>
            {status.connected
              ? <button className="btn btn-tertiary" onClick={disconnect} disabled={busy}>Disconnect</button>
              : <button className="btn btn-primary" onClick={connect} disabled={busy || !status.hasClientConfig}>{busy ? 'Working…' : 'Connect Google'}</button>}
          </div>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>OAuth client</h2>
          <p style={{ margin: '4px 0 16px', fontSize: 13, color: 'var(--fg-secondary)' }}>
            Schoolwork uses your own Google Cloud OAuth client so the app never proxies your data through
            a third party. Create a <em>Desktop app</em> OAuth client at console.cloud.google.com, enable the
            Google Calendar API, and paste the credentials below.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--bd-subtle)' }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Client ID</div>
            <input className="input" placeholder="123-abc.apps.googleusercontent.com" value={clientId} onChange={e => setClientId(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--bd-subtle)' }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Client secret</div>
            <input className="input" type="password" placeholder="GOCSPX-…" value={clientSecret} onChange={e => setClientSecret(e.target.value)} />
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={saveClient}>Save client</button>
            <a className="btn btn-tertiary" href="#" onClick={(e) => { e.preventDefault(); api?.openExternal('https://console.cloud.google.com/apis/credentials'); }}>Open Google Cloud Console</a>
          </div>
        </section>

        {status.connected && (
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Target calendar</h2>
            <p style={{ margin: '4px 0 16px', fontSize: 13, color: 'var(--fg-secondary)' }}>
              Pick which calendar receives Schoolwork events. Choose a dedicated calendar (e.g. "School") to
              keep deadlines out of your personal calendar.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--bd-subtle)' }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Calendar</div>
              <select className="select" value={calendarId} onChange={e => setCalendarId(e.target.value)}>
                <option value="primary">Primary calendar</option>
                {calendars.filter(c => c.accessRole === 'owner' || c.accessRole === 'writer').map(c => (
                  <option key={c.id} value={c.id}>{c.summary}{c.primary ? ' (primary)' : ''}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--bd-subtle)' }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>What to push</div>
              <select className="select" value={scope} onChange={e => setScope(e.target.value)}>
                {SCOPES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            {scope === 'subject' && (
              <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--bd-subtle)' }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Subject</div>
                <select className="select" value={subject} onChange={e => setSubject(e.target.value)}>
                  {courses.length === 0 && <option value="">No subjects yet</option>}
                  {courses.map(c => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
                </select>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--bd-subtle)' }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Reminder</div>
              <select className="select" value={String(reminder)} onChange={e => setReminder(Number(e.target.value))}>
                {REMINDERS.map(r => <option key={r.v} value={r.v}>{r.label}</option>)}
              </select>
            </div>

            <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={pushAssignments} disabled={busy}>
                <Icon name="export" size={14} /> Push {selectedAssignments().length} assignment{selectedAssignments().length === 1 ? '' : 's'}
              </button>
              <button className="btn btn-tertiary" style={{ color: 'var(--error)', marginLeft: 'auto' }} onClick={purge} disabled={busy}>
                <Icon name="trash" size={14} /> Remove all Schoolwork events
              </button>
            </div>

            {lastResult && (
              <div style={{ marginTop: 16, fontSize: 12, color: 'var(--fg-secondary)' }}>
                Last push: {lastResult.res.length} event{lastResult.res.length === 1 ? '' : 's'} ·{' '}
                {lastResult.res.filter(r => r.action === 'created').length} created,{' '}
                {lastResult.res.filter(r => r.action === 'updated').length} updated.
              </div>
            )}
          </section>
        )}

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>How it works</h2>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--fg-secondary)', lineHeight: 1.6 }}>
            <li>Each Schoolwork item carries a stable <code>schoolworkId</code> stored in the Google event's
            private <code>extendedProperties</code>. Re-syncing patches the existing event instead of duplicating.</li>
            <li>Tokens are encrypted with <code>safeStorage</code> (DPAPI on Windows, Keychain on macOS) before
            being written to your user-data folder.</li>
            <li>Disconnecting calls Google's revoke endpoint and removes the local token. Existing events stay
            on your calendar — delete them in Google Calendar if you want a clean slate.</li>
          </ul>
        </section>
      </>
    );
  };

  /* -------------------------------------------------------- */
  /* Google Drive connector — in-app folder browser + preview  */
  /* -------------------------------------------------------- */
  const FOLDER_MIME = 'application/vnd.google-apps.folder';
  const driveKind = (mime) => {
    if (!mime) return 'doc';
    if (mime.startsWith('image/')) return 'image';
    if (mime.includes('pdf')) return 'pdf';
    if (mime.includes('spreadsheet') || mime.includes('excel') || mime.endsWith('csv')) return 'sheet';
    if (mime.startsWith('text/') || mime.includes('json') || mime.includes('xml')) return 'md';
    if (mime.includes('document') || mime.includes('word')) return 'doc';
    return 'doc';
  };
  const friendlyDriveError = (raw) => {
    const m = String(raw || '');
    if (/has not been used in project|accessNotConfigured|Drive API has not been|SERVICE_DISABLED/i.test(m))
      return "The Google Drive API isn't enabled in your Google Cloud project. Open the API Library, enable “Google Drive API”, wait ~1 minute, then try again.";
    if (/insufficient|scope|Insufficient Permission|invalid_grant|unauthorized|forbidden/i.test(m))
      return "Your Google connection doesn't include Drive file access yet. In the Google Calendar section above, click Disconnect, then Connect again to grant read access to Drive.";
    return m.replace(/^Error invoking remote method '[^']+':\s*/, '');
  };

  // Reusable Drive browser — used both in Settings and inside the Library
  // (rooted at a saved folder). Folders and files can be opened/imported.
  const DriveBrowser = ({ root, pushToast, courseId }) => {
    const { useStore } = window.Store;
    const { addLibraryFile: addLibraryFileRaw } = useStore();
    // When opened from a Subject page, tag every import with that course so it
    // lands in the subject's library rather than the general term library.
    const addLibraryFile = (file) => addLibraryFileRaw(courseId ? { ...file, course: courseId } : file);
    const { account } = window.Auth.useAuth();
    const startRoot = root || { id: 'root', name: 'My Drive' };

    const [status, setStatus] = useState({ connected: false });
    const [path, setPath] = useState([startRoot]);
    const [items, setItems] = useState([]);
    const [query, setQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [preview, setPreview] = useState(null);

    const refresh = useCallback(async () => {
      if (!api) return;
      try { await api.setAccount?.(account?.id); setStatus(await api.google.status()); } catch {}
    }, [account]);
    useEffect(() => { refresh(); }, [refresh]);

    const loadFolder = useCallback(async (folderId) => {
      setBusy(true); setError(null); setSearching(false);
      try { setItems(await api.drive.list({ folderId })); }
      catch (e) { const msg = friendlyDriveError(e.message); setError(msg); pushToast?.({ tone: 'warning', title: 'Drive error', body: msg }); }
      finally { setBusy(false); }
    }, [pushToast]);

    useEffect(() => { if (status.connected) loadFolder(startRoot.id); }, [status.connected, loadFolder]);

    const openFolder = (f) => { setPath(p => [...p, { id: f.id, name: f.name }]); setQuery(''); loadFolder(f.id); };
    const goCrumb = (i) => { const next = path.slice(0, i + 1); setPath(next); setQuery(''); loadFolder(next[i].id); };

    const runSearch = async () => {
      if (!query.trim()) { goCrumb(path.length - 1); return; }
      setBusy(true); setError(null);
      try { setItems(await api.drive.list({ q: query })); setSearching(true); }
      catch (e) { const msg = friendlyDriveError(e.message); setError(msg); pushToast?.({ tone: 'warning', title: 'Drive error', body: msg }); }
      finally { setBusy(false); }
    };

    // Search as you type (debounced); spans My Drive, Shared with me, shared drives.
    useEffect(() => {
      if (!status.connected) return;
      const t = query.trim();
      const id = setTimeout(() => {
        if (t) runSearch();
        else if (searching) goCrumb(path.length - 1);
      }, 350);
      return () => clearTimeout(id);
    }, [query, status.connected]);

    const fetchContent = async (f) => api.drive.get({ fileId: f.id, mimeType: f.mimeType, name: f.name, size: f.size });

    const openFile = async (f) => {
      setPreview({ file: f, loading: true });
      try { setPreview({ file: f, content: await fetchContent(f) }); }
      catch (e) { setPreview(null); const msg = friendlyDriveError(e.message); setError(msg); pushToast?.({ tone: 'warning', title: "Couldn't open file", body: msg }); }
    };

    const addToLibrary = async (f) => {
      pushToast?.({ tone: 'info', title: 'Importing…', body: f.name });
      try {
        const c = await fetchContent(f);
        const base = { name: f.name, summary: 'Imported from Google Drive', link: f.webViewLink };
        if (c && (c.tooBig || c.unsupported)) addLibraryFile({ ...base, kind: driveKind(f.mimeType), summary: c.tooBig ? 'Large Google Drive file (open in Drive)' : 'Google Drive file' });
        else if (c && c.body != null) addLibraryFile({ ...base, kind: 'md', body: c.body });
        else if (c && c.dataUrl) addLibraryFile({ ...base, kind: c.kind || driveKind(c.mimeType), dataUrl: c.dataUrl });
        else addLibraryFile({ ...base, kind: driveKind(f.mimeType) });
        pushToast?.({ tone: 'success', title: 'Added to Library', body: f.name });
      } catch (e) {
        addLibraryFile({ name: f.name, kind: driveKind(f.mimeType), summary: 'Google Drive file', link: f.webViewLink });
        pushToast?.({ tone: 'warning', title: 'Saved as link', body: friendlyDriveError(e.message) });
      }
    };

    const addFolderToLibrary = (f) => {
      addLibraryFile({ name: f.name, kind: 'folder', driveId: f.id, link: f.webViewLink, summary: 'Google Drive folder' });
      pushToast?.({ tone: 'success', title: 'Folder added to Library', body: f.name });
    };

    if (!isDesktop) {
      return (
        <div className="empty" style={{ background: 'var(--bg-surface)', border: '1px solid var(--bd-default)', borderRadius: 6, padding: 'var(--s-8)' }}>
          <div className="empty-icon"><Icon name="library" /></div>
          <h3>Available in the desktop app only</h3>
          <p>The Google Drive connector runs through the desktop runtime so your tokens stay off the web.</p>
        </div>
      );
    }
    if (!status.connected) {
      return (
        <div className="empty" style={{ background: 'var(--bg-surface)', border: '1px solid var(--bd-default)', borderRadius: 6, padding: 'var(--s-8)' }}>
          <div className="empty-icon"><Icon name="link" /></div>
          <h3>Not connected</h3>
          <p>Connect your Google account in <b>Settings → Connectors</b> (Google Calendar section), then come back to browse Drive.</p>
        </div>
      );
    }

    const folders = items.filter(f => f.isFolder);
    const files = items.filter(f => !f.isFolder);

    return (
      <>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div className="searchbar" style={{ flex: 1, height: 32 }}>
            <Icon name="search" size={14} />
            <input value={query} placeholder="Search all of Drive by name…" onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') runSearch(); }} />
          </div>
          <button className="btn btn-secondary" onClick={runSearch} disabled={busy}>{busy ? 'Working…' : 'Search'}</button>
        </div>

        {!searching && (
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 10, fontSize: 13 }}>
            {path.map((c, i) => (
              <span key={c.id + ':' + i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {i > 0 && <Icon name="chevron-right" size={11} />}
                <button className="btn btn-tertiary btn-sm" style={{ height: 24, opacity: i === path.length - 1 ? 1 : 0.7 }} disabled={i === path.length - 1} onClick={() => goCrumb(i)}>{c.name}</button>
              </span>
            ))}
          </div>
        )}
        {searching && (
          <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--fg-tertiary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            Search results for “{query}”.
            <button className="btn btn-tertiary btn-sm" onClick={() => { setQuery(''); goCrumb(path.length - 1); }}><Icon name="chevron-left" size={11} /> Back to folders</button>
          </div>
        )}

        {error && (
          <div className="auth-error" role="alert" style={{ marginBottom: 12, alignItems: 'flex-start' }}>
            <Icon name="circle-warn" size={14} /> <span>{error}</span>
          </div>
        )}

        <div style={{ border: '1px solid var(--bd-default)', borderRadius: 6, overflow: 'hidden', maxHeight: 420, overflowY: 'auto' }}>
          {busy && <div style={{ padding: 16, fontSize: 13, color: 'var(--fg-tertiary)' }}>Loading…</div>}
          {!busy && items.length === 0 && !error && <div style={{ padding: 16, fontSize: 13, color: 'var(--fg-tertiary)' }}>This folder is empty.</div>}
          {!busy && folders.map((f, i) => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: i ? '1px solid var(--bd-subtle)' : 'none', fontSize: 13 }}>
              <button onClick={() => openFolder(f)} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, background: 'transparent', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                <Icon name="archive" size={15} />
                <span style={{ flex: 1, minWidth: 0, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              </button>
              {!f.virtual && <button className="btn btn-tertiary btn-sm" onClick={() => addFolderToLibrary(f)} title="Add this folder to your Library">Add to Library</button>}
              <Icon name="chevron-right" size={13} />
            </div>
          ))}
          {!busy && files.map((f, i) => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: (i || folders.length) ? '1px solid var(--bd-subtle)' : 'none', fontSize: 13 }}>
              <Icon name="paperclip" size={15} />
              <button onClick={() => openFile(f)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent', cursor: 'pointer', padding: 0 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--accent)' }}>{f.name}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{f.owner ? f.owner + ' · ' : ''}{f.modifiedTime ? 'modified ' + new Date(f.modifiedTime).toLocaleDateString() : ''}</div>
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => addToLibrary(f)}>Add to Library</button>
            </div>
          ))}
        </div>

        {preview && (
          <div className="modal-overlay" onClick={() => setPreview(null)} role="dialog" aria-modal="true">
            <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 760, maxWidth: '92vw', height: '82vh', display: 'flex', flexDirection: 'column' }}>
              <div className="modal-h">
                <div style={{ minWidth: 0 }}><h2 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview.file.name}</h2></div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-tertiary btn-sm" onClick={() => api.openExternal(preview.file.webViewLink)} disabled={!preview.file.webViewLink}>Open in Drive</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => addToLibrary(preview.file)}>Add to Library</button>
                  <button className="iconbtn" onClick={() => setPreview(null)} aria-label="Close"><Icon name="close" /></button>
                </div>
              </div>
              <div className="modal-b" style={{ flex: 1, overflow: 'auto', padding: 0, display: 'flex' }}>
                {preview.loading && <div className="empty" style={{ margin: 'auto' }}><p>Loading preview…</p></div>}
                {!preview.loading && preview.content && (() => {
                  const c = preview.content;
                  if (c.tooBig) return <div className="empty" style={{ margin: 'auto' }}><div className="empty-icon"><Icon name="library" /></div><h3>File is large</h3><p>This file is over the in-app preview limit. Use “Open in Drive”.</p></div>;
                  if (c.unsupported) return <div className="empty" style={{ margin: 'auto' }}><div className="empty-icon"><Icon name="library" /></div><h3>No in-app preview</h3><p>This file type can't be previewed here. Use “Open in Drive”.</p></div>;
                  if (c.kind === 'image' && c.dataUrl) return <img src={c.dataUrl} alt={preview.file.name} style={{ maxWidth: '100%', maxHeight: '100%', margin: 'auto', objectFit: 'contain' }} />;
                  if (c.kind === 'pdf' && c.dataUrl) return <window.UI.PdfFrame dataUrl={c.dataUrl} title={preview.file.name} style={{ width: '100%', height: '100%', border: 0 }} />;
                  if (c.body != null) return <pre className="wa-code" style={{ margin: 0, padding: 16, width: '100%', whiteSpace: 'pre-wrap' }}>{c.body}</pre>;
                  return <div className="empty" style={{ margin: 'auto' }}><div className="empty-icon"><Icon name="library" /></div><h3>No in-app preview</h3><p>Use “Open in Drive” to view this file.</p></div>;
                })()}
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  const DrivePanel = ({ pushToast }) => (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Google Drive</h2>
      <p style={{ margin: '4px 0 16px', fontSize: 13, color: 'var(--fg-secondary)' }}>
        Browse My Drive, “Shared with me”, and shared drives right here — preview files in-app, and add files or
        whole folders to your Library. Folders stay browsable inside the Library. Uses the same connection as Google Calendar above.
      </p>
      <DriveBrowser root={{ id: 'root', name: 'My Drive' }} pushToast={pushToast} />
    </section>
  );

  /* -------------------------------------------------------- */
  /* Calendar-page push: a button + modal to pick exactly      */
  /* which items go to Google, right from the Calendar screen. */
  /* -------------------------------------------------------- */
  const CalendarPush = ({ pushToast }) => {
    const { useStore } = window.Store;
    const { assignments, events, courses, calendars, courseById } = useStore();
    const { account } = window.Auth.useAuth();
    const seed = window.SchoolworkData;

    const [open, setOpen] = useState(false);
    const [status, setStatus] = useState({ connected: false });
    const [gcals, setGcals] = useState([]);
    const [calendarId, setCalendarId] = useState('primary');
    const [reminder, setReminder] = useState(1440);
    const [selected, setSelected] = useState([]);
    const [busy, setBusy] = useState(false);

    // Everything that can be pushed from the calendar, as selectable rows.
    const items = useMemo(() => {
      const now = new Date();
      const out = [];
      assignments.filter(a => a.status !== 'graded' && a.status !== 'submitted').forEach(a => {
        const course = courses.find(c => c.id === a.course);
        out.push({ id: 'a:' + a.id, label: a.title, sub: (courseById(a.course)?.code || '') + ' · due ' + new Date(a.due).toLocaleDateString(), build: (rem) => assignmentToEvent(a, course, rem) });
        if (a.draftDue) {
          out.push({ id: 'd:' + a.id, label: 'Draft — ' + a.title, sub: 'draft due ' + new Date(a.draftDue).toLocaleDateString(), build: (rem) => draftToEvent(a, course, rem) });
        }
      });
      events.filter(e => new Date(e.date + 'T' + (e.end || e.start || '23:59')) >= now).forEach(e => {
        const calName = calendars.find(c => c.id === e.calendarId)?.name;
        out.push({ id: 'e:' + e.id, label: e.title, sub: (calName || 'Event') + ' · ' + new Date(e.date).toLocaleDateString(), build: (rem) => calEventToGoogle(e, calName, rem) });
      });
      return out;
    }, [assignments, events, courses, calendars]);

    const openModal = async () => {
      if (!isDesktop) { pushToast?.({ tone: 'warning', title: 'Desktop only', body: 'Google sync runs in the desktop app.' }); return; }
      setOpen(true);
      setSelected(items.map(it => it.id)); // default: everything checked
      try {
        await api.setAccount?.(account?.id);
        const s = await api.google.status(); setStatus(s);
        if (s.connected) { try { setGcals(await api.google.listCalendars()); } catch {} }
      } catch {}
    };

    const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

    const push = async () => {
      const chosen = items.filter(it => selected.includes(it.id));
      if (chosen.length === 0) { pushToast?.({ tone: 'warning', title: 'Nothing selected' }); return; }
      setBusy(true);
      try {
        const rem = reminder === -1 ? null : reminder;
        const evs = chosen.map(it => it.build(rem));
        const res = await api.google.pushEvents(calendarId, evs);
        pushToast?.({ tone: 'success', title: 'Pushed to Google', body: `${res.length} item${res.length === 1 ? '' : 's'} synced.` });
        setOpen(false);
      } catch (e) {
        pushToast?.({ tone: 'warning', title: 'Sync failed', body: e.message });
      } finally { setBusy(false); }
    };

    return (
      <>
        <button className="btn btn-secondary" onClick={openModal} title="Push selected items to Google Calendar">
          <Icon name="export" size={14} /> Push to Google
        </button>
        {open && (
          <div className="modal-overlay" onClick={() => setOpen(false)} role="dialog" aria-modal="true">
            <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 520, maxHeight: '82vh', display: 'flex', flexDirection: 'column' }}>
              <div className="modal-h">
                <div><h2>Push to Google Calendar</h2><div style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>Tick the deadlines and events you want on your Google calendar.</div></div>
                <button className="iconbtn" onClick={() => setOpen(false)} aria-label="Close"><Icon name="close" /></button>
              </div>
              {!status.connected ? (
                <div className="modal-b">
                  <div className="empty" style={{ padding: 'var(--s-8)' }}>
                    <div className="empty-icon"><Icon name="link" /></div>
                    <h3>Not connected</h3>
                    <p>Connect your Google account in <b>Settings → Connectors</b> first, then come back to push.</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="modal-b" style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div className="field"><label>Target calendar</label>
                        <select className="select" value={calendarId} onChange={e => setCalendarId(e.target.value)}>
                          <option value="primary">Primary calendar</option>
                          {gcals.filter(c => c.accessRole === 'owner' || c.accessRole === 'writer').map(c => <option key={c.id} value={c.id}>{c.summary}</option>)}
                        </select>
                      </div>
                      <div className="field"><label>Reminder</label>
                        <select className="select" value={String(reminder)} onChange={e => setReminder(Number(e.target.value))}>
                          {REMINDERS.map(r => <option key={r.v} value={r.v}>{r.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>{selected.length} of {items.length} selected</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-tertiary btn-sm" onClick={() => setSelected(items.map(it => it.id))}>Select all</button>
                        <button className="btn btn-tertiary btn-sm" onClick={() => setSelected([])}>Clear</button>
                      </div>
                    </div>
                    <div style={{ border: '1px solid var(--bd-default)', borderRadius: 6, overflow: 'hidden' }}>
                      {items.length === 0 && <div style={{ padding: 16, fontSize: 13, color: 'var(--fg-tertiary)' }}>Nothing to push — no open deadlines or upcoming events in this term.</div>}
                      {items.map((it, i) => (
                        <label key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: i ? '1px solid var(--bd-subtle)' : 'none', fontSize: 13, cursor: 'pointer' }}>
                          <input type="checkbox" checked={selected.includes(it.id)} onChange={() => toggle(it.id)} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</div>
                            <div style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{it.sub}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="modal-f">
                    <button className="btn btn-tertiary" onClick={() => setOpen(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={push} disabled={busy || selected.length === 0}>
                      <Icon name="export" size={14} /> Push {selected.length} item{selected.length === 1 ? '' : 's'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </>
    );
  };

  return { Panel, DrivePanel, DriveBrowser, CalendarPush, isDesktop };
})();

window.GoogleConnector = GoogleConnector;
