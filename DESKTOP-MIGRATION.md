# Desktop Migration — old Schoolwork → cloud-syncing version

Step-by-step to upgrade your **desktop** from the old (single-device) build to
the new version that syncs through OneDrive.

> **Your laptop is the source of truth.** It already holds the master copy of
> your data (the snapshot `schoolwork-sync.json`, last written by
> `IsaaksLaptop`). This guide connects the desktop to the same OneDrive folder
> and **pulls the laptop's data down**, replacing whatever the desktop has
> locally. If the desktop has anything you want to keep, do **Step 1** first.

The shared folder both machines use:

```
…\OneDrive\Documents\OneDrive\Schoolwork\schoolwork-sync.json
```

On the laptop this is `C:\Users\isaak\OneDrive\Documents\OneDrive\Schoolwork`.
On the desktop the local path lives under that machine's OneDrive root — it's
the *same* cloud folder, so you'll just pick it with the folder button in Step 5.

---

## Step 1 — (optional) back up the desktop's current data

Only needed if the desktop has subjects/assignments you don't want to lose
(they'll be overwritten by the laptop's copy).

- **In the app:** Settings → Data & storage → *Export this term (JSON)* — once
  per term you care about.
- **Or copy the whole data folder** to somewhere safe. Press `Win+R` and paste
  whichever applies:
  - Old app run from the cloned repo (`npm start`): `%APPDATA%\schoolwork-dashboard`
  - Old app installed from an `.exe`: `%APPDATA%\Schoolwork`

---

## Step 2 — get the new version onto the desktop

**Path A — you run it from the cloned repo (developer mode):**

```powershell
cd <your Schoolwork repo folder>
git pull
npm install
```

(You'll launch it with `npm start` in Step 4.)

**Path B — you want the installed app:**

- Build it on the desktop: `git pull` → `npm install` → `npm run build:win`,
  then run `dist\Schoolwork-Setup-0.2.0-x64.exe`.
- *Or* copy the installer the laptop already built
  (`dist\Schoolwork-Setup-0.2.0-x64.exe`) to the desktop via USB/OneDrive and
  run it.
- If an **older Schoolwork is already installed**, uninstall it first
  (Settings → Apps), then run the new installer. Your data isn't in the install
  folder, so uninstalling won't delete it.

> Note: the installed app stores data in `%APPDATA%\Schoolwork`, while
> `npm start` uses `%APPDATA%\schoolwork-dashboard`. Pick one way to run it and
> stick with it — sync makes the difference invisible anyway.

---

## Step 3 — make sure the OneDrive file is actually downloaded

1. Open File Explorer → **OneDrive** → **Documents** → **OneDrive** →
   **Schoolwork**.
2. Confirm `schoolwork-sync.json` is there with a **green check** (downloaded),
   not a blue cloud (online-only). If it's cloud-only, right-click it →
   **Always keep on this device** (or just double-click it once).

If the folder/file isn't there yet, let OneDrive finish syncing before
continuing.

---

## Step 4 — launch and sign in

1. Start the new app (`npm start`, or the installed **Schoolwork**).
2. Sign in. Use the **same email** you use on the laptop if you remember it —
   but don't worry if the desktop's account differs: loading the snapshot in the
   next step brings the laptop's account across with the data.

---

## Step 5 — turn sync on and LOAD the laptop's data

1. Go to **Settings → Sync devices**.
2. Click **Change…** and select the OneDrive Schoolwork folder from Step 3.
3. Toggle **Sync this device** **ON**.
4. It will detect the existing snapshot (saved by `IsaaksLaptop`) and ask what
   to do. Choose **OK — load it onto this device**.
   - ✅ OK = pull the laptop's data here (what you want).
   - ❌ Cancel = overwrite the folder with the desktop's data (would clobber the
     laptop — only choose this if the desktop is actually the newer copy).
5. The app reloads and should now show your laptop's subjects, assignments,
   notes, terms, and settings.

---

## Step 6 — verify it's working

- Your laptop's data is visible on the desktop. ✔
- Make a tiny edit (e.g. add then delete a test assignment) and watch
  `…\OneDrive\…\Schoolwork\schoolwork-sync.json`'s *Modified* time update within
  a couple of seconds. ✔
- Settings → Sync devices → **Status** shows the last save time and device. ✔

---

## Step 7 — reconnect Google on the desktop (per-device)

Google sign-in is **not** synced (tokens are encrypted per-machine). If you use
the Calendar/Drive connector, redo it on the desktop:

- Settings → **Connectors** → paste your OAuth **Client ID/secret** →
  **Connect Google**.

---

## Everyday use after migration

- **Close the app on the machine you're leaving**, then open it on the other —
  the latest data loads on launch.
- Don't have it open and edited on **both** machines at once: it's
  *last-save-wins*, so simultaneous edits can lose one side.
- When you switch back to a machine that was left open, it'll prompt to load
  newer data if the other device saved something.

---

## Troubleshooting

- **"No snapshot found" / nothing loaded when enabling sync.** OneDrive hasn't
  downloaded `schoolwork-sync.json` yet, or you picked the wrong folder. Recheck
  Step 3 and the folder path.
- **The desktop overwrote the laptop's data.** You chose *Cancel/overwrite* in
  Step 5 instead of *OK/load*. As long as you haven't since edited on the
  desktop, reopen the laptop and pick **Sync now** — if it doesn't auto-restore,
  your laptop's localStorage still holds the data; re-enable/overwrite from the
  laptop. (Avoid this by always choosing **load** on the desktop.)
- **Two separate accounts after migrating.** Loading the snapshot makes the
  desktop use the laptop's account (accounts travel inside the synced data).
  Use that account from now on; you can ignore/delete the old desktop-only one.
- **Edits don't reach the other machine.** Confirm both machines point at the
  *same* OneDrive folder (Settings → Sync devices → Status), the toggle is
  **on**, and OneDrive itself is running and synced on both.
