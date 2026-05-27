# Schoolwork — Architecture & File Map

A reference for where everything lives: the code, the runtime pieces, and your
data on disk.

---

## 1. What it is

**Schoolwork** is a desktop study planner built with **Electron**. The UI is
**React 18 + Babel**, transpiled *in the browser at runtime* (no bundler / build
step for the UI). React, ReactDOM and Babel are vendored locally in
`app/vendor/` so the app works fully offline.

Three runtime layers:

| Layer | Runs in | Responsibility |
|---|---|---|
| **Main process** | Node.js (`main.js`) | Creates the window, owns all OS/secret access: Google OAuth, Drive/Calendar API calls, encrypted token storage, opening external links, reading the legal docs. |
| **Preload bridge** | Isolated context (`preload.js`) | Exposes a narrow, safe API to the UI as `window.schoolworkAPI` via `contextBridge`. The UI never touches Node directly. |
| **Renderer** | Chromium + React (`app/`) | The entire UI. Talks to the main process only through `window.schoolworkAPI`. Persists app data in the browser's `localStorage`. |

---

## 2. Repository layout

### Project root

| File | Role |
|---|---|
| `main.js` | Electron **main process**. Window creation; IPC handlers (`app:set-account`, `google:*`, `drive:*`, `shell:open`, `legal:read`); per-account OAuth token/client storage (encrypted with the OS keychain via `safeStorage`/DPAPI). |
| `preload.js` | `contextBridge` → `window.schoolworkAPI` (`setAccount`, `google.*`, `drive.*`, `openExternal`, `legal.read`). |
| `google-calendar.js` | Main-process Google **Calendar** integration: OAuth loopback + PKCE flow, list calendars, upsert/delete/purge events. Times are pinned to **AEST (Australia/Brisbane)**. |
| `google-drive.js` | Main-process Google **Drive** integration (read-only): browse folders / "Shared with me" / shared drives, search, and download/export file content for in-app preview. |
| `package.json` | App metadata, scripts (`start`, `build`), and the electron-builder config (what gets bundled into the installer). |
| `logo.svg` | The app icon/logo (graduation cap). A copy lives at `app/logo.svg` for the renderer to load. |
| `index.html` is under `app/` | (see below) |
| `PRIVACY.md`, `TERMS.md` | Legal documents, shown in-app by `legal.jsx` and bundled into the build. |
| `README.md` | Setup / run / Google-connector instructions. |
| `AUDIT.md` | Notes from the user-friendliness audit. |
| `ARCHITECTURE.md` | This document. |
| `_design_files/` | The original design bundle used as reference. **Not part of the running app or the build.** |
| `.gitignore`, `package-lock.json`, `node_modules/` | Standard tooling. |

### `app/` — the renderer (UI)

Scripts load in a fixed order from `index.html`. Each attaches its exports to a
`window.*` namespace (there is no module bundler).

| File | Exposes | Role |
|---|---|---|
| `index.html` | — | Entry point. Sets the Content-Security-Policy, default theme, and the **script load order**. |
| `styles.css` | — | All styling: design tokens, light/dark theming (`[data-theme]`), density (`[data-density]`), and the entrance **splash animation**. |
| `vendor/` | `React`, `ReactDOM`, `Babel` | Offline copies of React 18, ReactDOM, and Babel standalone. |
| `data.jsx` | `window.SchoolworkData` | App-wide constants & pure helpers: status/priority vocab, `TYPES_BY_COURSE`, default calendars, **term definitions + `termState`/`termWeeks`/`termDatesLabel`**, **`autoPriority`/`isEssay`**, and `seedProfile` (every profile starts empty). No demo data. |
| `ui.jsx` | `window.UI` | Shared primitives: `fmt` (date/time), `Badge`, `Priority`, `Checkbox`, `StatusBadge`, `Progress`, and **`PdfFrame`** (renders PDFs via a blob URL). |
| `icons.jsx` | `window.Icon` | The SVG icon set. |
| `store.jsx` | `window.Store` | **`StoreProvider`** — the data store, scoped per account **and** per (year, term) profile, persisted to `localStorage`; all CRUD (courses, assignments, notes, schedule, calendars, events, library), **configurable terms**, rate-limit gate, dirty-flag + `reloadProfile` (refresh). Also `EditProvider` and the inline `Editable*` editors. |
| `auth.jsx` | `window.Auth` | **`AuthProvider`** — local accounts (salted-hashed passwords), tiers & per-term limits, notification prefs, the two unlimited emails. Also the entrance **`Splash`** and the **`LoginScreen`**. |
| `chrome.jsx` | `window.Chrome` | App frame: **`AppBar`** (term switcher with derived state, search, notifications bell, refresh, account menu), **`Sidebar`**, **`StatusBar`** (density toggle). |
| `views.jsx` | `window.Views` | Most screens: `Dashboard`, `CoursesView`, `CalendarView` (+ `CalEditor`, `WeeklyScheduleModal`), `NotesView`, `GradesView`, `CourseDetail`, **`Inspector`**, `LibraryView` (+ `LibraryFilePreview`), **`SettingsView`** (account / appearance / academic-year / subjects / notifications / connectors / shortcuts / storage / about), and **`Onboarding`**. |
| `view-assignments.jsx` | `window.AssignmentsView` | The assignments table (filter, sort, paginate, bulk select/delete). |
| `work-area.jsx` | `window.WorkArea` | The per-assignment file workspace (attachments + preview). |
| `google-connector.jsx` | `window.GoogleConnector` | Renderer side of Google: **`Panel`** (Calendar connect + push), **`DriveBrowser`** (reusable folder browser + preview) and **`DrivePanel`**, and **`CalendarPush`** (the "Push to Google" button used on the Calendar page). |
| `legal.jsx` | `window.Legal` | `LegalModal` — renders `PRIVACY.md` / `TERMS.md` (read via `schoolworkAPI.legal.read`). |
| `tweaks-panel.jsx` | `window.useTweaks`, `window.TweaksPanel`, … | A generic floating "Tweaks" panel + the `useTweaks` hook used for live appearance controls. |
| `app.jsx` | — (mounts the app) | Root component: `App → Gate` (auth gate + theme/accent application) `→ AppInner` (layout, routing between views, keyboard shortcuts, toasts). Also `QuickAddModal`, `LimitModal`, `ToastHost`. Calls `ReactDOM.createRoot(...).render(<App/>)`. |

---

## 3. Where your data is stored (on disk)

All user data lives in this app's Electron **userData** folder:

- **Running via `npm start` (dev):** `%APPDATA%\schoolwork-dashboard\`
  → `C:\Users\<you>\AppData\Roaming\schoolwork-dashboard\`
- **Installed (packaged) build:** `%APPDATA%\Schoolwork\`

> Note: Electron run as a bare script (e.g. ad-hoc test harnesses) defaults to a
> *separate* `%APPDATA%\Electron\` folder — that is **not** your real data.

Inside the userData folder:

| Path | Contents |
|---|---|
| `Local Storage\leveldb\` | **The bulk of your data** (a LevelDB, not hand-editable). Keys: `schoolwork:accounts`, `schoolwork:session`, `schoolwork:tweaks` (appearance), `schoolwork:terms:<accountId>` (term dates), `schoolwork:lastProfile:<accountId>` (active term), and `schoolwork:data:<accountId>:<term>` — each term's workspace: courses, assignments, notes, weekly schedule, calendars, events, and **Library files (embedded as base64)**. |
| `google-client-<accountId>.json` | Your Google OAuth **client ID/secret**, scoped per account. |
| `google-token-<accountId>.enc` | Your Google OAuth **tokens**, encrypted with the OS keychain (Windows DPAPI), scoped per account. |
| `Cache/`, `GPUCache/`, `Network/`, `Session Storage/`, … | Chromium internals — not your content. |

**Key idea — everything is namespaced by account + term:**

```
schoolwork:data:<accountId>:<term key>
                 │            └─ e.g. "Year 12 — Term 2, 2026"
                 └─ e.g. "U-mpmm8ynr"  (one per local account)
```

So switching the active term, or switching accounts, swaps in a completely
separate workspace. Google credentials are likewise per-account: a new account
starts with no keys until you enter them in Settings → Connectors.

---

## 4. How the pieces talk

```
┌─────────────────────────── Renderer (app/) ───────────────────────────┐
│  React UI  ──reads/writes──►  localStorage   (accounts, per-term data) │
│     │                                                                  │
│     └── window.schoolworkAPI ──IPC──►  Main process (main.js)          │
│                                          ├─ google-calendar.js  ──► Google Calendar API
│                                          ├─ google-drive.js     ──► Google Drive API
│                                          ├─ safeStorage         ──► google-token-*.enc
│                                          └─ shell.openExternal  ──► browser
└────────────────────────────────────────────────────────────────────────┘
```

- The UI persists app data itself, in `localStorage`.
- Anything needing secrets or the network (Google) goes through the preload
  bridge to the main process, which holds the encrypted tokens and makes the
  API calls. The active account is announced to the main process via
  `schoolworkAPI.setAccount(id)` so it reads the right per-account credentials.

---

## 5. Build & packaging

- **Run (dev):** `npm start` → `electron .`
- **Package:** `npm run build` → electron-builder produces an NSIS installer +
  portable `.exe` (Windows x64).
- **Bundled files** (from `package.json` → `build.files`): `main.js`,
  `preload.js`, `google-calendar.js`, `google-drive.js`, `PRIVACY.md`,
  `TERMS.md`, and everything under `app/**`. (`app/logo.svg` ships with `app/**`.)
- A packaged build expects an app icon at `build/icon.ico`.
