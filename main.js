const { app, BrowserWindow, ipcMain, shell, safeStorage, Menu, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
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
