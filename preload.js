const { contextBridge, ipcRenderer } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const pkg = require('./package.json');

// Supabase publishable URL + key live next to package.json (gitignored, but
// bundled into the asar via the build.files list). Safe to ship to the
// renderer — RLS on the DB gates actual data access.
function readSupabaseConfig() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'supabase-config.json'), 'utf8');
    const cfg = JSON.parse(raw);
    if (cfg && typeof cfg.url === 'string' && typeof cfg.key === 'string') return cfg;
  } catch {}
  return null;
}

contextBridge.exposeInMainWorld('schoolworkAPI', {
  // Detect that we're in Electron (renderer code falls back to web-only mode otherwise)
  isDesktop: true,
  platform: process.platform,
  appVersion: pkg.version,
  supabaseConfig: readSupabaseConfig(),

  // Scope Google credentials to the signed-in account.
  setAccount: (id) => ipcRenderer.invoke('app:set-account', id),

  drive: {
    list: (opts) => ipcRenderer.invoke('drive:list', opts),
    get:  (opts) => ipcRenderer.invoke('drive:get', opts),
  },

  google: {
    getClient:        ()                          => ipcRenderer.invoke('google:get-client'),
    setClient:        (cfg)                       => ipcRenderer.invoke('google:set-client', cfg),
    status:           ()                          => ipcRenderer.invoke('google:status'),
    connect:          ()                          => ipcRenderer.invoke('google:connect'),
    disconnect:       ()                          => ipcRenderer.invoke('google:disconnect'),
    listCalendars:    ()                          => ipcRenderer.invoke('google:list-calendars'),
    pushEvents:       (calendarId, events)        => ipcRenderer.invoke('google:push-events', { calendarId, events }),
    removeEvent:      (calendarId, eventId)       => ipcRenderer.invoke('google:remove-event', { calendarId, eventId }),
    purgeEvents:      (calendarId)                 => ipcRenderer.invoke('google:purge-events', { calendarId }),
  },

  openExternal: (url) => ipcRenderer.invoke('shell:open', url),

  legal: {
    read: (which) => ipcRenderer.invoke('legal:read', which),
  },

  // In-app update lifecycle. On Windows: download → click-through NSIS wizard →
  // app relaunches. On macOS (unsigned) `check()` returns mode:"browser" and the
  // banner falls back to opening the release page in the user's browser.
  updates: {
    check:    ()                  => ipcRenderer.invoke('updates:check'),
    download: ()                  => ipcRenderer.invoke('updates:download'),
    install:  ()                  => ipcRenderer.invoke('updates:install'),
    on:       (channel, listener) => {
      const allowed = new Set(['updates:available', 'updates:none', 'updates:progress', 'updates:ready', 'updates:error']);
      if (!allowed.has(channel)) return () => {};
      const wrapped = (_e, payload) => listener(payload);
      ipcRenderer.on(channel, wrapped);
      return () => ipcRenderer.removeListener(channel, wrapped); // teardown for React effects
    },
  },

  // Cross-device sync via a cloud-synced folder (OneDrive/Dropbox/…).
  sync: {
    getConfig:  ()        => ipcRenderer.invoke('sync:get-config'),
    setConfig:  (cfg)     => ipcRenderer.invoke('sync:set-config', cfg),
    pickFolder: ()        => ipcRenderer.invoke('sync:pick-folder'),
    read:       ()        => ipcRenderer.invoke('sync:read'),
    write:      (payload) => ipcRenderer.invoke('sync:write', payload),
    status:     ()        => ipcRenderer.invoke('sync:status'),
  },
});
