# Schoolwork — user-friendliness audit (no codebase input required)

This is the audit you asked for: everything a non-technical user needs to run
the app end-to-end without touching code, what was changed to get there, and
the few things that still need *your* input (Google credentials, an icon).

Legend: ✅ done in this pass · ⚠️ needs a one-time action from you · 🔭 future.

---

## 1. Getting in — accounts & sign-in
- ✅ **Login / sign-up screen** with an entrance animation (splash → reveal).
- ✅ **Local accounts** — sign up with name/email/password; sessions persist so
  the app reopens already signed in.
- ✅ **Unlimited accounts** hard-wired for `isaak.simpson@gmail.com` and
  `6simpsis@nudgee.qld.edu.au` — they bypass every cap automatically. Just sign
  up/sign in with either address.
- ✅ **Rate limiting** on free accounts (per term): 20 assignments, 15 notes,
  8 subjects, 3 calendars, 40 events, 12 library files. Hitting a cap shows a
  clear "limit reached" dialog instead of silently failing.
- ✅ **Log out** from the user menu (top-right) or Settings → Account.

## 2. Window chrome
- ✅ Removed the fake in-app title bar (the non-working min/maximise/close row).
  The real OS window frame already provides working controls. The app menu bar
  is hidden for a clean desktop look.

## 3. Term / year profiles
- ✅ **Assignments, notes, classes, calendars and library files are unique to
  each (year, term) profile.** Switching the term in the top-left switches the
  entire workspace. Nothing bleeds between terms.
- ✅ Each profile **persists to disk** (localStorage) per account — edits are
  saved automatically and survive restarts.
- ✅ `Year 12 — Term 2, 2026` ships fully populated as a demo; other Year 12
  terms carry the same subjects with fresh work; Year 11 terms start blank.

## 4. Editing everything
- ✅ Global **Edit mode** (top bar or Ctrl+E) makes titles, codes, instructors,
  notes, statuses, due dates, weights, points, etc. inline-editable.
- ✅ **Assignments**: create (Quick add / New assignment / Add assignment),
  edit inline, **delete** (row trash icon, inspector, or multi-select → Delete).
- ✅ **Subjects**: add (Subjects → Add subject), edit, **delete** (card trash
  icon or Course detail → Remove).
- ✅ **Notes**: create, edit, duplicate, export, **delete**.
- ✅ **Classes** (recurring timetable): add/edit/delete from the Calendar.
- ✅ **Calendar events** (one-off): add/edit/delete; **calendars** can be
  created and toggled on/off.
- ✅ **Library files**: name editable on creation; delete anytime.

## 5. Calendar — fully functional
- ✅ Real **Day / Week / Month** views with working prev / Today / next.
- ✅ Recurring **classes**, one-off **events**, and **assignment due dates** all
  render; click a class/event to edit or delete; click an empty slot to add.
- ✅ Multiple named **calendars** with colour coding and show/hide chips.

## 6. Library — holds real files & info
- ✅ Resources is now a working **Library**: upload files (drag the Upload
  button), create text/markdown files in-app, preview (images, PDFs, text/code),
  download, and delete. Files are scoped to the current term.
- ✅ The per-assignment **Work area** now supports real **upload / download /
  delete** of attachments (previously dead buttons).
- Note: files are embedded in local storage; very large files (>1.5 MB) are
  kept by reference (metadata only) to stay within the local-storage budget.
  Cloud file storage is the upgrade path (README §4).

## 7. Google Calendar
- ✅ Connector lives in **Settings → Connectors**; pushes assignments and the
  weekly timetable, de-duplicating on re-sync.
- ⚠️ **You must create a Google Cloud OAuth client once** (Desktop type) and
  paste the client ID/secret — full steps are in the chat above and README §3.
  This is the only Google step that can't be pre-done for you.

## 8. Polish / safety
- ✅ Empty states everywhere (no subjects, no notes, no library, missing course)
  so blank terms never look broken or crash.
- ✅ Verified: all 11 scripts compile, the app boots, and every view +
  empty-profile renders with **zero console errors** (automated Electron smoke
  test, run during this build then removed).

---

## Still needs your input
| # | Item | Why | Effort |
|---|------|-----|--------|
| ⚠️ | Google OAuth client ID/secret | Google requires you own the app credentials | ~10 min, one-time (README §3) |
| ⚠️ | App icon | `electron-builder` ships a default Electron icon until you add `build/icon.ico` | drop in a 256×256 `.ico` |
| 🔭 | Code signing | Removes the Windows SmartScreen warning on first install | needs a paid certificate |
| 🔭 | Cloud sync across devices | Currently single-device (local). Architecture written up in README §4 (recommend Firebase) | a follow-up build |

## How to run / package (recap)
```powershell
cd "C:\Users\IsaaksPC\Desktop\study app"
npm start            # run it
npm run build:win    # produce dist\Schoolwork Setup 0.2.0.exe + portable .exe
```
First launch shows the splash, then the sign-in screen. Create an account with
one of the unlimited emails and you're in with no caps.
