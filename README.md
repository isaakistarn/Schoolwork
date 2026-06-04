# Schoolwork — Desktop Study Planner

A desktop study planner for Senior Secondary students. Implements the
`Schoolwork Dashboard` design handed off from Claude Design and wraps it in
Electron so it can ship as a Windows `.exe`. Includes a Google Calendar
connector that pushes assignments and your weekly timetable to a synced
calendar, and **cross-device sync** that keeps multiple computers in step
through a cloud-synced folder (OneDrive / Dropbox / Google Drive Desktop).

```
Schoolwork/
├── package.json              electron + electron-builder + googleapis
├── main.js                   Electron main process (IPC handlers, lifecycle)
├── preload.js                contextBridge → window.schoolworkAPI
├── google-calendar.js        OAuth + Calendar API (main-process module)
├── google-drive.js           OAuth + Drive API (main-process module)
├── logo.svg / logo.ico       app logo (SVG source + generated Windows icon)
├── tools/make-icon.js        regenerates logo.ico from logo.svg
├── app/
│   ├── index.html            entry point — loads vendored React + Babel
│   ├── vendor/               vendored React 18.3.1, ReactDOM, Babel 7.29.0
│   ├── store.jsx             account/term-scoped state, persisted to localStorage
│   ├── sync.jsx              cross-device sync via a cloud-synced folder
│   ├── *.jsx / styles.css    the rest of the design implementation
│   └── google-connector.jsx  renderer-side connector UI
└── README.md                 this file
```

## 1. Run in development

```powershell
npm install
npm start
```

`npm install` pulls Electron + `googleapis`. `npm start` launches the desktop
window pointing at `app/index.html`. Babel transpiles JSX in the browser at
runtime (the React/Babel bundles are vendored under `app/vendor/` so the app
works offline).

## 2. Build the desktop binaries

```powershell
npm run build:win        # NSIS installer + portable .exe (run on Windows)
npm run build:portable   # portable single-file .exe only
npm run build:mac        # .dmg for arm64 + x64       (run on macOS only)
```

Output lands in `dist/`:

```
dist/
├── Schoolwork-Setup-0.2.0-x64.exe        ← Windows NSIS installer
├── Schoolwork-Portable-0.2.0-x64.exe     ← Windows portable single-file
├── Schoolwork-0.2.0-arm64.dmg            ← macOS Apple Silicon
└── Schoolwork-0.2.0-x64.dmg              ← macOS Intel
```

`electron-builder` reads the `build` block in `package.json`. The Windows build
targets x64, the installer is non-silent (user picks the install directory),
and creates Start Menu + Desktop shortcuts. The macOS build produces a `.dmg`
per architecture under hardened-runtime entitlements (ready for notarization
when you have an Apple Developer ID).

> **mac builds need a Mac.** electron-builder's mac targets use macOS-only
> tools (`hdiutil`, code-signing, icon conversion); they cannot be
> cross-compiled from Windows. Run `npm run build:mac` on a Mac, or in a
> `macos-latest` GitHub Actions runner.

App icons: `logo.ico` (Windows, `build.win.icon`) and `build/icon.png` (macOS,
which electron-builder converts to `.icns` at build time). Regenerate both
from `logo.svg` with `node tools/make-icon.js` (after
`npm install --no-save sharp png-to-ico`).

To sign the Windows `.exe`, add `win.certificateFile` + `CSC_KEY_PASSWORD` or
use Azure Trusted Signing. To sign + notarize the macOS `.dmg`, set
`CSC_LINK`/`CSC_KEY_PASSWORD` for the Developer ID cert and
`APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID` for notarization.
None are wired up yet — unsigned local builds work for personal use.

> **First-build gotcha (Windows):** electron-builder's `winCodeSign` helper is
> a `.7z` containing macOS symlinks, and extracting it fails with *"A required
> privilege is not held by the client"* unless you **enable Developer Mode**
> (Settings → Privacy & security → For developers) or run the build from an
> **elevated** terminal.

## 3. Connect a Google Calendar

The connector lives in **Settings → Connectors**. It uses your own Google
Cloud OAuth client so your data never proxies through a third-party server.

1. Open <https://console.cloud.google.com>, create a new project (or reuse
   one).
2. APIs & Services → **Enable APIs** → enable **Google Calendar API**.
3. APIs & Services → **OAuth consent screen** — pick `External`, fill in
   minimum fields, add your own Google account as a test user.
4. APIs & Services → **Credentials** → Create credentials → OAuth client ID.
   Application type: **Desktop app**.
5. Copy the **Client ID** and **Client secret** into Settings → Connectors.
6. Click **Connect Google** → a browser tab opens for consent → on success
   Schoolwork captures the tokens via a `127.0.0.1` loopback redirect.

### What gets pushed

- **Push assignments** — every assignment that isn't `submitted` or `graded`.
  Each event:
  - Title: `<COURSE_CODE> — <assignment title>`
  - Start: due time minus the assignment's estimated minutes
  - End: due time
  - Description: course, type, weight, priority, notes
  - 24-hour reminder
- **Push draft milestones** — when an assignment has a `draftDue` value (any
  type, not just essays), a second event is pushed alongside the final-due
  event. Title: `DRAFT — <COURSE_CODE> — <assignment title>`; ends at the
  draft due time. Stored under `schoolworkId = <assignment-id>:draft` so it
  upserts independently from the final-due event.
- **Push this week's classes** — every entry in the weekly schedule, anchored
  to the current Monday.

### How re-syncing avoids duplicates

Each event we create carries the Schoolwork id in
`event.extendedProperties.private.schoolworkId`. Re-syncing looks up that
property and patches the existing event instead of creating a new one — so
you can mash the button repeatedly without filling your calendar with
duplicates.

## 4. Sync between devices (cloud-synced folder)

Schoolwork keeps multiple computers (e.g. a laptop and a desktop) in step by
mirroring its data through a folder you already sync with **OneDrive, Dropbox,
or Google Drive Desktop**. That synced folder is the only requirement — no
account, server, or API keys.

**How it works** — the whole `schoolwork:` localStorage namespace (subjects,
assignments, notes, schedule, calendars, events, library, your account, terms,
and appearance) is mirrored to a single `schoolwork-sync.json` file in the
chosen folder. The model is *last full snapshot wins*:

- **On launch** — pulls the newest snapshot before the UI loads.
- **On change** — a debounced write-back, plus an immediate flush when the
  window is hidden/closed (so closing the laptop saves).
- **On focus / "Sync now"** — if the other device saved something newer, it
  prompts before reloading, so an in-progress edit isn't lost.
- **Turning sync on** — if the folder already holds a snapshot, it asks whether
  to *load* it onto this device or *overwrite* it with this device's data.

**Enable it** — Settings → **Sync devices**: point it at the cloud folder
(defaults to `…\OneDrive\Schoolwork`) and toggle it on. Repeat on every
computer, pointing each one at the *same* synced folder.

**Where the settings live** — the folder path + on/off are stored per-machine
in `%APPDATA%\<app>\sync-config.json` and are deliberately *not* synced, so
each device keeps its own path. Your Google sign-in is also **not** synced (the
tokens are encrypted per-machine files) — connect Google separately on each
device.

**Caveat** — last-write-wins: if the app is open on two machines and you edit
both at once, whichever saves last wins. Keep it closed on the machine you're
not using.

> Implementation: `app/sync.jsx` (the `SyncBridge` + the Settings panel) plus
> the `sync:*` IPC handlers in `main.js` / `preload.js`. New machine going from
> a pre-sync build to this one? See **DESKTOP-MIGRATION.md**.

### Going further (not implemented)

For real-time, multi-user, or conflict-free collaborative editing you'd move to
a backend — **Firebase Firestore** (fastest path), **Supabase** (Postgres, own
your data), or a **CRDT layer** (Yjs / Automerge). These are bigger lifts and
overkill for a single student syncing two personal machines; the cloud-folder
approach above covers that case with no infrastructure.

## 5. Where things are stored

`<app>` below is `schoolwork-dashboard` in development (`npm start`) and
`Schoolwork` in the packaged/installed build — so the two run modes keep
**separate** local data. On macOS the equivalent of `%APPDATA%\<app>\` is
`~/Library/Application Support/<app>/`; everything else (the synced folder, the
`schoolwork:` localStorage namespace, encrypted tokens via Keychain) works the
same way.

| Artifact | Location | Encryption |
| -------- | -------- | ---------- |
| OAuth client id/secret | `%APPDATA%\<app>\google-client-<account>.json` | plain JSON |
| Refresh / access tokens | `%APPDATA%\<app>\google-token-<account>.enc` | `safeStorage` (DPAPI on Windows, Keychain on macOS) |
| App data (subjects, assignments, notes, …) | Electron `localStorage` in the user-data dir, keys `schoolwork:*` | per-OS |
| Sync folder + on/off | `%APPDATA%\<app>\sync-config.json` | plain JSON |
| Cloud sync snapshot | `<your cloud folder>\schoolwork-sync.json` | plain JSON |

`safeStorage.isEncryptionAvailable()` is checked at runtime; if it returns
false (e.g. on a freshly installed Linux box with no keyring) the token file
falls back to plain JSON — Electron will log a warning in dev mode.

## 6. Releasing a new version

The installed app uses **electron-updater** against **GitHub Releases**.
On launch (and when the user clicks the banner) it consults the
`latest.yml` / `latest-mac.yml` manifest the release workflow uploads
next to the installer, and — on Windows — downloads the new
`Schoolwork-Setup-…exe` directly in the background. The user is shown
a click-through banner with three states: *available* → *downloading*
→ *restart to install* (the last one runs the NSIS wizard, then the
app relaunches). On macOS the build is unsigned, so electron-updater
falls back to opening the DMG in the browser via the same banner.
See `app/update-banner.jsx` + the `updates:*` IPC in `main.js` and
`preload.js`. A release is just a tagged build with the artifacts
attached, produced by a GitHub Actions workflow:

1. Bump `version` in `package.json` (e.g. `0.2.0` → `0.3.0`) and commit.
2. Tag the commit and push it to GitHub:

   ```bash
   git tag v0.3.0
   git push origin main --tags
   ```

3. `.github/workflows/release.yml` fires on the tag push, builds
   `Schoolwork-Setup-…exe` and `Schoolwork-Portable-…exe` on a
   `windows-latest` runner and `Schoolwork-…dmg` (arm64 + x64) on a
   `macos-latest` runner in parallel, then attaches every artifact in
   `dist/` to a Release named after the tag.
4. Each installed copy sees the new release on its next launch.
   On Windows the banner downloads the installer in-app and asks the
   user to restart to install (NSIS wizard with `oneClick: false`).
   On macOS the banner opens the release page in the browser (until
   a Developer ID signing cert is configured — set `FORCE_INPLACE_MAC=1`
   in the env once it is, to switch macOS over to the in-place path).

To build a release without CI, run `npm run build:win` on Windows or
`npm run build:mac` on the Mac and upload the `dist/` artifacts to a new
Release on github.com by hand. The version comparison and notification work
either way — it's the **GitHub Release** the app watches, not how it got there.

## 7. What's intentionally not done

- **Code signing.** `electron-builder` will produce an unsigned `.exe`.
  Windows SmartScreen will warn first-run users until you sign with an EV
  or OV certificate, or migrate to Azure Trusted Signing.
- **Silent in-place auto-update.** The app polls GitHub Releases on launch
  and shows an in-app banner when a newer version exists (§6), but applying
  the update is still a manual reinstall. Silent in-place auto-update via
  `electron-updater` would need Apple Developer ID signing to work
  end-to-end on macOS, so it isn't wired up.
- **Production React/Babel bundle.** Babel transpiles JSX at runtime which
  costs ~300 ms on launch. For shipping at scale, run a one-shot Vite or
  esbuild step in CI that outputs pre-compiled JS, and drop `babel.min.js`
  from `app/vendor/`.
- **Real-time / multi-user backend.** Single-user device sync works via a
  cloud-synced folder (§4); a live multi-user backend (Firestore / Supabase /
  CRDT) is documented but not implemented.
