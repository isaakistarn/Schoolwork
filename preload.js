const { contextBridge, ipcRenderer } = require('electron');

const pkg = require('./package.json');

contextBridge.exposeInMainWorld('schoolworkAPI', {
  // Detect that we're in Electron (renderer code falls back to web-only mode otherwise)
  isDesktop: true,
  platform: process.platform,
  appVersion: pkg.version,

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

  // In-app update check (polls GitHub Releases — no silent install).
  updates: {
    check: () => ipcRenderer.invoke('updates:check'),
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
