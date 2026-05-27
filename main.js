const { app, BrowserWindow, ipcMain, shell, safeStorage, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1120,
    minHeight: 700,
    backgroundColor: '#1B1E22',
    show: false,
    title: 'Schoolwork',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      plugins: true, // enable Chromium's built-in PDF viewer for in-app previews
    },
  });

  Menu.setApplicationMenu(null);

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
