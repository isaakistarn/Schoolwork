const { app, BrowserWindow, ipcMain, shell, safeStorage, Menu, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const https = require('node:https');
const { autoUpdater } = require('electron-updater');
const GoogleCalendar = require('./google-calendar');
const GoogleDrive = require('./google-drive');

const isDev = !app.isPackaged;
const userDataPath = () => app.getPath('userData');

// Google OAuth client + tokens are scoped PER ACCOUNT so each sign-in starts
// with no credentials of its own — a new account must enter its own keys.
let activeAccount = 'default';
const sanitizeAcct = (id) => (String(id || 'default').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'default');
const tokenPath = () => path.join(userDataPath(), 'google-token-' + activeAccount + '.enc');
const configPath = () => path.join(userDataPath(), 'google-client-' + activeAccount + '.json');
const openaiConfigPath = () => path.join(userDataPath(), 'openai-config-' + activeAccount + '.enc');

let mainWindow = null;

// macOS needs a real application menu or the standard Cmd+Q / Cmd+W / Cmd+C /
// Cmd+V / Cmd+X / Cmd+A shortcuts stop working. Windows/Linux keep the
// menuless look (autoHideMenuBar handles the title bar).
function buildAppMenu() {
  if (process.platform !== 'darwin') return null;
  return Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ]);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1120,
    minHeight: 700,
    backgroundColor: '#1B1E22',
    show: false,
    title: 'Schoolwork',
    icon: path.join(__dirname, 'logo.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      plugins: true, // enable Chromium's built-in PDF viewer for in-app previews
    },
  });

  Menu.setApplicationMenu(buildAppMenu());

  mainWindow.loadFile(path.join(__dirname, 'app', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Single-instance lock: a second launch focuses the existing window instead of
// starting a competing process that would fight over the same local data.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}

/* ---------- Secure token storage ---------- */
function saveTokens(tokens) {
  const json = JSON.stringify(tokens);
  if (safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(tokenPath(), safeStorage.encryptString(json));
  } else {
    fs.writeFileSync(tokenPath(), json, 'utf8');
  }
}
function loadTokens() {
  if (!fs.existsSync(tokenPath())) return null;
  const buf = fs.readFileSync(tokenPath());
  try {
    const json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8');
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}
function clearTokens() { try { fs.unlinkSync(tokenPath()); } catch {} }

function saveClientConfig(cfg) { fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2)); }
function loadClientConfig() {
  if (!fs.existsSync(configPath())) return null;
  try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch { return null; }
}

/* ---------- IPC: active account (scopes Google credentials) ---------- */
ipcMain.handle('app:set-account', (_e, id) => { activeAccount = sanitizeAcct(id); return activeAccount; });

/* ---------- IPC: Google client config ---------- */
ipcMain.handle('google:get-client', () => loadClientConfig());
ipcMain.handle('google:set-client', (_e, cfg) => { saveClientConfig(cfg); return true; });

/* ---------- OpenAI config (API key + model), scoped per account ----------
 *
 * The API key is a secret, so — exactly like the Google tokens — it is
 * encrypted at rest with the OS keychain (DPAPI on Windows) and never
 * leaves the main process. The renderer only ever learns whether a key is
 * present and which model is selected. All OpenAI network calls run here,
 * so the renderer's CSP never has to allow api.openai.com.
 */
function saveOpenAIConfig(cfg) {
  const json = JSON.stringify(cfg);
  if (safeStorage.isEncryptionAvailable()) fs.writeFileSync(openaiConfigPath(), safeStorage.encryptString(json));
  else fs.writeFileSync(openaiConfigPath(), json, 'utf8');
}
function loadOpenAIConfig() {
  if (!fs.existsSync(openaiConfigPath())) return null;
  try {
    const buf = fs.readFileSync(openaiConfigPath());
    const json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8');
    return JSON.parse(json);
  } catch { return null; }
}
function clearOpenAIConfig() { try { fs.unlinkSync(openaiConfigPath()); } catch {} }

// Minimal OpenAI REST helper over node:https (no SDK dependency).
function openaiRequest(method, apiPath, apiKey, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.openai.com',
      path: apiPath,
      method,
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
      timeout: 90000,
    }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        let json = null; try { json = JSON.parse(buf); } catch {}
        if (res.statusCode >= 200 && res.statusCode < 300) { resolve(json); return; }
        const msg = (json && json.error && json.error.message) || ('OpenAI request failed (HTTP ' + res.statusCode + ')');
        reject(new Error(msg));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('OpenAI request timed out')));
    if (data) req.write(data);
    req.end();
  });
}

ipcMain.handle('openai:get-config', () => {
  const c = loadOpenAIConfig();
  return { hasKey: !!(c && c.apiKey), model: (c && c.model) || 'gpt-4o-mini' };
});
ipcMain.handle('openai:set-config', (_e, { apiKey, model } = {}) => {
  const cur = loadOpenAIConfig() || {};
  const key = (apiKey != null && String(apiKey).trim() !== '') ? String(apiKey).trim() : cur.apiKey;
  if (!key) throw new Error('Enter an OpenAI API key.');
  const next = { apiKey: key, model: model || cur.model || 'gpt-4o-mini' };
  saveOpenAIConfig(next);
  return { hasKey: true, model: next.model };
});
ipcMain.handle('openai:clear', () => { clearOpenAIConfig(); return { hasKey: false }; });

ipcMain.handle('openai:list-models', async () => {
  const c = loadOpenAIConfig();
  if (!c || !c.apiKey) throw new Error('No OpenAI API key saved.');
  const r = await openaiRequest('GET', '/v1/models', c.apiKey, null);
  return ((r && r.data) || [])
    .map((m) => m.id)
    .filter((id) => /^(gpt-|o\d|chatgpt)/i.test(id))
    .sort();
});

ipcMain.handle('openai:analyze', async (_e, { system, prompt, model } = {}) => {
  const c = loadOpenAIConfig();
  if (!c || !c.apiKey) throw new Error('No OpenAI API key saved. Add one in Settings → Connectors.');
  const useModel = model || c.model || 'gpt-4o-mini';
  const r = await openaiRequest('POST', '/v1/chat/completions', c.apiKey, {
    model: useModel,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: String(prompt || '') },
    ],
    temperature: 0.4,
  });
  const text = (r && r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content) || '';
  const u = r && r.usage;
  const usage = u ? { prompt: u.prompt_tokens || 0, completion: u.completion_tokens || 0, total: u.total_tokens || 0 } : null;
  return { text, model: useModel, usage };
});

/* ---------- IPC: OAuth ---------- */
ipcMain.handle('google:status', () => {
  const tokens = loadTokens();
  const cfg = loadClientConfig();
  return {
    connected: !!tokens,
    hasClientConfig: !!cfg,
    email: tokens?.email || null,
    expiresAt: tokens?.expiry_date || null,
  };
});

ipcMain.handle('google:connect', async () => {
  const cfg = loadClientConfig();
  if (!cfg?.client_id || !cfg?.client_secret) {
    throw new Error('Missing Google OAuth client. Add a Desktop OAuth client ID/secret in Settings → Connectors first.');
  }
  const tokens = await GoogleCalendar.runOAuthFlow(cfg, ({ url }) => shell.openExternal(url));
  saveTokens(tokens);
  return { connected: true, email: tokens.email };
});

ipcMain.handle('google:disconnect', async () => {
  const tokens = loadTokens();
  const cfg = loadClientConfig();
  if (tokens && cfg) {
    try { await GoogleCalendar.revoke(cfg, tokens); } catch {}
  }
  clearTokens();
  return { connected: false };
});

/* ---------- IPC: Calendar push ---------- */
ipcMain.handle('google:list-calendars', async () => {
  const cfg = loadClientConfig();
  const tokens = loadTokens();
  if (!cfg || !tokens) throw new Error('Not connected.');
  return GoogleCalendar.listCalendars(cfg, tokens, (next) => saveTokens({ ...tokens, ...next }));
});

ipcMain.handle('google:push-events', async (_e, { calendarId, events }) => {
  const cfg = loadClientConfig();
  const tokens = loadTokens();
  if (!cfg || !tokens) throw new Error('Not connected.');
  return GoogleCalendar.upsertEvents(cfg, tokens, calendarId, events, (next) => saveTokens({ ...tokens, ...next }));
});

ipcMain.handle('google:remove-event', async (_e, { calendarId, eventId }) => {
  const cfg = loadClientConfig();
  const tokens = loadTokens();
  if (!cfg || !tokens) throw new Error('Not connected.');
  return GoogleCalendar.deleteEvent(cfg, tokens, calendarId, eventId, (next) => saveTokens({ ...tokens, ...next }));
});

ipcMain.handle('google:purge-events', async (_e, { calendarId }) => {
  const cfg = loadClientConfig();
  const tokens = loadTokens();
  if (!cfg || !tokens) throw new Error('Not connected.');
  return GoogleCalendar.purgeEvents(cfg, tokens, calendarId, (next) => saveTokens({ ...tokens, ...next }));
});

/* ---------- IPC: Google Drive ---------- */
ipcMain.handle('drive:list', async (_e, opts) => {
  const cfg = loadClientConfig();
  const tokens = loadTokens();
  if (!cfg || !tokens) throw new Error('Not connected.');
  return GoogleDrive.listFolder(cfg, tokens, opts || {}, (next) => saveTokens({ ...tokens, ...next }));
});

ipcMain.handle('drive:get', async (_e, opts) => {
  const cfg = loadClientConfig();
  const tokens = loadTokens();
  if (!cfg || !tokens) throw new Error('Not connected.');
  return GoogleDrive.getFileContent(cfg, tokens, opts || {}, (next) => saveTokens({ ...tokens, ...next }));
});

/* ---------- IPC: PDF text extraction ----------
 *
 * The renderer holds task sheets / scaffolds as base64 data URLs. Pulling
 * the text out needs a PDF parser, which only runs in Node — so the renderer
 * hands the data URL (or bare base64) over here and gets plain text back for
 * the Study view's AI analysis. `pdf-parse` injects "-- N of M --" page
 * separators; we strip those and bound the output so a huge PDF can't blow up
 * the prompt.
 */
ipcMain.handle('pdf:extract', async (_e, dataUrlOrB64) => {
  if (!dataUrlOrB64) return { text: '', pages: 0 };
  let b64 = String(dataUrlOrB64);
  const comma = b64.indexOf(',');
  if (b64.startsWith('data:') && comma !== -1) b64 = b64.slice(comma + 1);
  const buf = Buffer.from(b64, 'base64');
  if (!buf.length) return { text: '', pages: 0 };
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const res = await parser.getText();
    const text = (res.text || '').replace(/\n*-- \d+ of \d+ --\n*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return { text: text.slice(0, 20000), pages: res.total || 0 };
  } finally { try { await parser.destroy(); } catch {} }
});

/* ---------- IPC: open external links from the renderer ---------- */
ipcMain.handle('shell:open', (_e, url) => shell.openExternal(url));

/* ---------- IPC: read bundled legal documents ---------- */
ipcMain.handle('legal:read', (_e, which) => {
  const file = which === 'terms' ? 'TERMS.md' : 'PRIVACY.md';
  try { return fs.readFileSync(path.join(__dirname, file), 'utf8'); }
  catch { return null; }
});

/* ---------- IPC: cross-device sync via a cloud-synced folder ----------
 *
 * The renderer mirrors its entire `schoolwork:` localStorage namespace into
 * ONE JSON snapshot living in a folder the OS already syncs between machines
 * (OneDrive on Windows, Dropbox, Google Drive Desktop, …). The model is
 * "last full snapshot wins"; this side just does the file I/O and folder
 * picking. The sync config (folder + on/off) is machine-level — it lives in
 * userData, NOT in the synced snapshot — so each device keeps its own path.
 */
const SYNC_FILE = 'schoolwork-sync.json';
const syncConfigPath = () => path.join(userDataPath(), 'sync-config.json');
const syncFilePath = (dir) => path.join(dir, SYNC_FILE);

// Best-guess default: on Windows the OneDrive env var; on macOS the first
// recognised cloud-storage folder (OneDrive in CloudStorage, the legacy
// ~/OneDrive, iCloud Drive, then Dropbox); falling back to Documents either
// way. The user can override via the folder picker — this is only the starting
// suggestion.
function defaultSyncDir() {
  if (process.platform === 'darwin') {
    const home = os.homedir();
    const candidates = [];
    const cs = path.join(home, 'Library', 'CloudStorage');
    try {
      for (const name of fs.readdirSync(cs)) {
        if (/^(OneDrive|GoogleDrive)/i.test(name)) candidates.push(path.join(cs, name));
      }
    } catch {}
    candidates.push(path.join(home, 'OneDrive'));
    candidates.push(path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs')); // iCloud Drive
    candidates.push(path.join(home, 'Dropbox'));
    const base = candidates.find(p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } });
    return path.join(base || path.join(home, 'Documents'), 'Schoolwork');
  }
  const od = process.env.OneDrive || process.env.OneDriveConsumer || process.env.OneDriveCommercial;
  let base;
  try { base = od || app.getPath('documents'); } catch { base = od || os.homedir(); }
  return path.join(base, 'Schoolwork');
}
function loadSyncConfig() {
  try { const c = JSON.parse(fs.readFileSync(syncConfigPath(), 'utf8')); return { enabled: !!c.enabled, dir: String(c.dir || '') }; }
  catch { return { enabled: false, dir: '' }; }
}
function saveSyncConfig(cfg) {
  const next = { enabled: !!(cfg && cfg.enabled), dir: String((cfg && cfg.dir) || '') };
  fs.writeFileSync(syncConfigPath(), JSON.stringify(next, null, 2));
  return next;
}

ipcMain.handle('sync:get-config', () => ({ ...loadSyncConfig(), defaultDir: defaultSyncDir(), device: os.hostname() }));
ipcMain.handle('sync:set-config', (_e, cfg) => saveSyncConfig(cfg));

ipcMain.handle('sync:pick-folder', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose a cloud-synced folder for Schoolwork',
    buttonLabel: 'Use this folder',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: loadSyncConfig().dir || defaultSyncDir(),
  });
  return (res.canceled || !res.filePaths || !res.filePaths[0]) ? null : res.filePaths[0];
});

// Returns the parsed snapshot, or null when there's no folder / no file yet.
ipcMain.handle('sync:read', () => {
  const { dir } = loadSyncConfig();
  if (!dir) return null;
  try { return JSON.parse(fs.readFileSync(syncFilePath(dir), 'utf8')); }
  catch { return null; }
});

// Atomic-ish write: a temp file then rename, so a half-written snapshot is
// never visible to the cloud client (or the other machine) mid-flush.
ipcMain.handle('sync:write', (_e, payload) => {
  const { dir } = loadSyncConfig();
  if (!dir) throw new Error('No sync folder configured.');
  fs.mkdirSync(dir, { recursive: true });
  const full = { ...(payload || {}), device: os.hostname() };
  const tmp = path.join(dir, '.' + SYNC_FILE + '.tmp');
  fs.writeFileSync(tmp, JSON.stringify(full, null, 2), 'utf8');
  fs.renameSync(tmp, syncFilePath(dir));
  return { ok: true, updatedAt: full.updatedAt, device: full.device };
});

// Lightweight status for the Settings panel (does the folder/file exist yet?).
ipcMain.handle('sync:status', () => {
  const { enabled, dir } = loadSyncConfig();
  let folderExists = false, fileExists = false, mtime = null;
  try { folderExists = fs.statSync(dir).isDirectory(); } catch {}
  try { const st = fs.statSync(syncFilePath(dir)); fileExists = true; mtime = st.mtime.toISOString(); } catch {}
  return { enabled, dir, folderExists, fileExists, mtime, device: os.hostname() };
});

/* ---------- IPC: in-app update flow (electron-updater + GitHub Releases) ----------
 *
 * The renderer drives the lifecycle through IPC:
 *
 *   1. `updates:check`   → look at the publish channel (GitHub) for a newer
 *                          tag. Returns { available, current, latest, url, name }.
 *                          On macOS without a Developer ID-signed build,
 *                          electron-updater can't install in place, so we
 *                          fall back to the GitHub Releases API and pass the
 *                          release URL back to the renderer to open in the
 *                          browser — same UX as the old banner.
 *   2. `updates:download` → start the binary download (Windows NSIS). Progress
 *                          and completion are broadcast as `updates:progress`
 *                          and `updates:ready` to every renderer window.
 *   3. `updates:install`  → `quitAndInstall(true, true)` — quits the app and
 *                          runs the NSIS wizard (oneClick: false), then
 *                          relaunches once the user clicks through.
 *
 * We deliberately keep autoDownload OFF so nothing happens behind the user's
 * back. The banner asks before starting the download, and again before
 * restarting to install.
 *
 * Change UPDATE_REPO if the repo is renamed or forked.
 */
const UPDATE_REPO = 'isaakistarn/Schoolwork';

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.allowDowngrade = false;
// `app.isPackaged` is false in `npm start` — dev runs would 404 on the
// publish channel and clutter the console with errors. The renderer just
// won't see any update events in dev, which is the right behaviour.
autoUpdater.forceDevUpdateConfig = false;

const broadcast = (channel, payload) => {
  BrowserWindow.getAllWindows().forEach((w) => {
    try { w.webContents.send(channel, payload); } catch {}
  });
};

autoUpdater.on('update-available', (info) => {
  broadcast('updates:available', { latest: info.version, notes: info.releaseNotes || '', name: info.releaseName || ('v' + info.version) });
});
autoUpdater.on('update-not-available', () => broadcast('updates:none'));
autoUpdater.on('download-progress', (p) => broadcast('updates:progress', {
  percent: Math.round(p.percent || 0),
  transferred: p.transferred || 0,
  total: p.total || 0,
  bytesPerSecond: p.bytesPerSecond || 0,
}));
autoUpdater.on('update-downloaded', (info) => broadcast('updates:ready', { latest: info.version }));
autoUpdater.on('error', (err) => broadcast('updates:error', { message: String((err && err.message) || err || 'Update failed') }));

/* macOS fallback — when the app isn't Developer ID-signed, electron-updater
   can't install in place. Hit the GitHub Releases API directly so the
   renderer can still show "Update available" and route users to the DMG. */
function fetchLatestRelease() {
  return new Promise((resolve) => {
    const req = https.get({
      hostname: 'api.github.com',
      path: '/repos/' + UPDATE_REPO + '/releases/latest',
      headers: { 'User-Agent': 'Schoolwork-Updater', 'Accept': 'application/vnd.github+json' },
      timeout: 6000,
    }, (res) => {
      if (res.statusCode !== 200) { res.resume(); resolve(null); return; }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { const j = JSON.parse(body); resolve({ tag: j.tag_name, name: j.name, url: j.html_url }); }
        catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}
function isNewerVersion(latest, current) {
  const parts = (s) => String(s).replace(/^v/i, '').split('.').map((n) => Number(n) || 0);
  const a = parts(latest), b = parts(current);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

// Whether in-place install is feasible on this build.
// • Windows: always — NSIS auto-update works without code-signing.
// • macOS: only when the .app is Developer ID-signed, otherwise Squirrel.Mac
//   refuses to install. We can't introspect the signature easily from here,
//   so we treat unsigned macOS as "browser download" and let the user grab
//   the DMG themselves. Set FORCE_INPLACE_MAC=1 in env once you have signing.
const canInstallInPlace = () => {
  if (process.platform === 'win32') return true;
  if (process.platform === 'darwin') return !!process.env.FORCE_INPLACE_MAC;
  return false;
};

ipcMain.handle('updates:check', async () => {
  const current = app.getVersion();

  // macOS / unsigned → fall back to the old "open the release page" flow.
  if (!canInstallInPlace()) {
    const r = await fetchLatestRelease();
    if (!r || !r.tag) return { available: false, current, mode: 'browser' };
    const latest = String(r.tag).replace(/^v/i, '');
    return {
      available: isNewerVersion(latest, current),
      current, latest, url: r.url, name: r.name, mode: 'browser',
    };
  }

  // Windows in-place path → ask electron-updater.
  if (!app.isPackaged) return { available: false, current, mode: 'inplace', dev: true };
  try {
    const r = await autoUpdater.checkForUpdates();
    const info = r && r.updateInfo;
    if (!info || !info.version) return { available: false, current, mode: 'inplace' };
    const available = isNewerVersion(info.version, current);
    return {
      available,
      current,
      latest: info.version,
      name: info.releaseName || ('v' + info.version),
      notes: info.releaseNotes || '',
      mode: 'inplace',
    };
  } catch (e) {
    return { available: false, current, mode: 'inplace', error: String((e && e.message) || e) };
  }
});

ipcMain.handle('updates:download', async () => {
  if (!canInstallInPlace() || !app.isPackaged) return { ok: false, reason: 'not-supported' };
  try { await autoUpdater.downloadUpdate(); return { ok: true }; }
  catch (e) { return { ok: false, reason: String((e && e.message) || e) }; }
});

ipcMain.handle('updates:install', () => {
  if (!canInstallInPlace() || !app.isPackaged) return { ok: false, reason: 'not-supported' };
  // First arg: don't ignore "is silent" — let NSIS show its wizard so the user
  // can click through (oneClick: false). Second arg: force-runAfterFinish so
  // the app relaunches once the wizard completes.
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
  return { ok: true };
});

// Kick off a non-blocking check ~4s after launch so it doesn't race the
// renderer's first paint. The renderer is the source of truth for the UI;
// this just primes the events.
app.whenReady().then(() => {
  if (!canInstallInPlace() || !app.isPackaged) return;
  setTimeout(() => { autoUpdater.checkForUpdates().catch(() => {}); }, 4000);
});
