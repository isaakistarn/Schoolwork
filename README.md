# Schoolwork — Desktop Study Planner

A desktop study planner for Senior Secondary students. Implements the
`Schoolwork Dashboard` design handed off from Claude Design and wraps it in
Electron so it can ship as a Windows `.exe`. Includes a Google Calendar
connector that pushes assignments and your weekly timetable to a synced
calendar.

```
Schoolwork/
├── package.json              electron + electron-builder + googleapis
├── main.js                   Electron main process (IPC handlers, lifecycle)
├── preload.js                contextBridge → window.schoolworkAPI
├── google-calendar.js        OAuth + Calendar API (main-process module)
├── google-drive.js           OAuth + Drive API (main-process module)
├── logo.svg                  app logo
├── app/
│   ├── index.html            entry point — loads vendored React + Babel
│   ├── vendor/               vendored React 18.3.1, ReactDOM, Babel 7.29.0
│   ├── *.jsx / styles.css    the design implementation
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

## 2. Build the `.exe`

```powershell
npm run build:win        # NSIS installer + portable .exe (recommended)
npm run build:portable   # portable single-file .exe only
```

Output lands in `dist/`:

```
dist/
├── Schoolwork-0.1.0-x64.exe              ← portable
└── Schoolwork Setup 0.1.0.exe            ← NSIS installer
```

`electron-builder` reads the `build` block in `package.json`. The build
targets x64, the installer is non-silent (the user picks the install
directory), and creates Start Menu + Desktop shortcuts. To sign the
executable, add `win.certificateFile` + `CSC_KEY_PASSWORD` or use Azure
Trusted Signing — neither is wired up yet.

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
- **Push this week's classes** — every entry in the seed `SCHEDULE` array,
  anchored to the current Monday.

### How re-syncing avoids duplicates

Each event we create carries the Schoolwork id in
`event.extendedProperties.private.schoolworkId`. Re-syncing looks up that
property and patches the existing event instead of creating a new one — so
you can mash the button repeatedly without filling your calendar with
duplicates.

### Where credentials live

| Artifact          | Location                                         | Encryption |
| ----------------- | ------------------------------------------------ | ---------- |
| OAuth client id/secret | `%APPDATA%\Schoolwork\google-client.json` | plain JSON |
| Refresh / access tokens | `%APPDATA%\Schoolwork\google-token.enc` | `safeStorage` (DPAPI on Windows, Keychain on macOS) |
| App state mirror | `%APPDATA%\Schoolwork\schoolwork-state.json` | plain JSON |

`safeStorage.isEncryptionAvailable()` is checked at runtime; if it returns
false (e.g. on a freshly installed Linux box with no keyring) the token
file falls back to plain JSON — Electron will log a warning in dev mode.

## 4. Cloud sync between devices — recommended architecture

The desktop app today is single-device: state lives in React `useState` plus
a JSON mirror in `%APPDATA%`. To sync across devices, here is the path I'd
take, ordered cheapest → most flexible.

### Option A — Firebase (fastest path to multi-device)

- **Auth**: Firebase Auth with Google provider (reuses the OAuth client you
  already set up for Calendar).
- **Data**: Cloud Firestore. Model: one document per assignment, note,
  course. Top-level path `users/{uid}/assignments/{id}` etc.
- **Live sync**: Firestore's snapshot listeners drop changes into the
  renderer in real time (~250 ms median). No backend code to write.
- **Conflict resolution**: last-writer-wins by default, which is fine for a
  single-user multi-device study app. If two devices edit the same field at
  the same second you lose one edit — acceptable for this workload.
- **Offline**: Firestore caches locally and replays writes on reconnect.
- **Cost**: free tier comfortably covers a single student.

```js
// renderer pseudo-code
import { onSnapshot, collection, doc, setDoc } from 'firebase/firestore';
onSnapshot(collection(db, `users/${uid}/assignments`), snap => {
  store.replaceAssignments(snap.docs.map(d => d.data()));
});
// on edit:
setDoc(doc(db, `users/${uid}/assignments/${id}`), patch, { merge: true });
```

### Option B — Supabase (open-source, Postgres-backed)

Same architectural shape as Firebase: row-level-security gives you
per-user isolation, Realtime channels deliver live updates. Choose this if
you want to own your data and can run a Postgres database. Costs a little
engineering ($5/mo + your time) vs. Firebase's $0 free tier.

### Option C — CRDT layer (Yjs / Automerge) over any transport

For true multi-device editing with offline-first conflict-free merges,
model state as a CRDT and ship updates over any backend (WebSocket relay,
y-websocket, Liveblocks, etc.). Highest ceiling for collaborative editing;
overkill for a personal study planner.

### Option D — Cloud-storage file (Dropbox / Google Drive / iCloud Drive)

Store the entire app state JSON in the user's cloud-drive folder. Watch
the file for changes (`fs.watch`) on the renderer side and re-hydrate the
store. Trivial to ship, but conflict resolution is "newest file wins" —
you'll lose edits if both devices write at once.

### Recommendation for this app

Start with **Firebase Firestore**. Wire it under the existing store
(`app/store.jsx`):

1. Add a `useFirestoreSync(uid)` hook that subscribes to the user's
   collections and dispatches updates to React state.
2. Mirror every `update*` action through a `setDoc(...{ merge: true })`.
3. Reuse the Google OAuth token Schoolwork already obtained for Calendar to
   authenticate Firebase Auth (`signInWithCredential`).
4. Keep the `%APPDATA%\schoolwork-state.json` mirror as an offline cache —
   Firestore's built-in cache covers most cases, but the JSON file is your
   escape hatch if the user is offline for days.

This keeps the existing UI untouched: the components stay backed by the
in-memory store, the store quietly mirrors to Firestore in the background,
and the connector you already have for Google Calendar becomes the auth
entry-point for sync too.

## 5. What's intentionally not done

- **Code signing.** `electron-builder` will produce an unsigned `.exe`.
  Windows SmartScreen will warn first-run users until you sign with an EV
  or OV certificate, or migrate to Azure Trusted Signing.
- **Auto-update.** Wire `electron-updater` to a GitHub Releases feed when
  you're ready to ship updates without rebuilding installers.
- **Production React/Babel bundle.** Babel transpiles JSX at runtime which
  costs ~300 ms on launch. For shipping at scale, run a one-shot Vite or
  esbuild step in CI that outputs pre-compiled JS, and drop `babel.min.js`
  from `app/vendor/`.
- **Multi-user backend.** Cloud sync is documented above but not
  implemented in this drop.
