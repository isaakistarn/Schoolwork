# Privacy Policy — Schoolwork

**Last updated: 26 May 2026**

> **Important – not legal advice.** This document is a thorough, good-faith
> privacy policy template tailored to how the Schoolwork application actually
> works. It is **not** legal advice and is **not guaranteed to be complete or
> enforceable** in your jurisdiction. No privacy policy is ever "airtight."
> Before you publish or distribute this application, have a qualified lawyer in
> your jurisdiction review and adapt this document — especially because the app
> may be used by **students who are minors**, which triggers additional
> obligations.

This Privacy Policy explains how the Schoolwork desktop application ("**Schoolwork**",
the "**App**", "**we**", "**us**") handles information when you use it. By
installing or using the App you acknowledge the practices described here.

---

## 1. Who we are

Schoolwork is a desktop study-planning application that runs locally on your own
device. The operator of this distribution of Schoolwork (the "**Operator**") is
the individual or organisation that compiled and gave you this build. If you are
the Operator, insert your legal name, contact email, and (if applicable) ABN here
before distributing:

- **Operator:** _[Your legal name / entity]_
- **Contact:** _[contact email]_
- **Jurisdiction:** Queensland, Australia

## 2. The short version

- Schoolwork is **local-first**. Your account, subjects, assignments, notes,
  calendar entries, and uploaded files are stored **on your own device**, not on
  our servers. We do not operate a server that receives your study data.
- We do **not** sell, rent, or share your personal information with advertisers.
- The **only** time your data leaves your device is when **you** explicitly
  connect your own Google account and press a button to push assignment due
  dates to **your** Google Calendar. That transfer goes directly from your
  device to Google under your own Google credentials.
- You can delete all of your data at any time from within the App or by removing
  the App's data folder.

## 3. Information the App stores locally

The App stores the following **on your device only** (in the operating system's
per-user application data store and browser local storage):

| Category | Examples | Where |
| --- | --- | --- |
| Account profile | Display name, email address, a salted hash of your password, plan tier, notification preferences | Local storage |
| Study content | Subjects, assignments, notes, calendar events, weekly class times, library files you create or upload | Local storage |
| App settings | Theme, accent colour, density, sidebar state | Local storage |
| Google credentials (only if you connect Google) | OAuth client ID/secret you provide, and OAuth access/refresh tokens | Encrypted at rest using your operating system's secure storage (DPAPI on Windows, Keychain on macOS) where available |

**Passwords.** Local account passwords are stored only as a salted hash, never
in plain text. This local login is a convenience gate; it is **not** a
bank-grade authentication system and is unrelated to your real Google or school
password. Do not reuse an important password.

We do **not** collect analytics, telemetry, advertising identifiers, location
data, or browsing history.

## 4. Information shared with Google (optional integration)

If — and only if — you choose to connect a Google account in
**Settings → Connectors**:

- You supply your **own** Google Cloud OAuth client. The App uses Google's
  standard OAuth 2.0 "installed application" flow with a local loopback
  redirect. Your Google sign-in happens in your own browser, on Google's pages.
- The App requests the scopes needed to read your calendar list and create or
  update calendar events (Google Calendar API) and to read your account email
  address (to display which account is connected).
- When you press a push button, the App sends the selected **assignment**
  details (title, subject, due date/time, type, weight, points, priority, and
  your notes for that assignment) **directly from your device to Google** so
  that Google can create matching calendar events. **Class/timetable entries are
  never sent to Google.**
- Google's handling of that data is governed by **Google's Privacy Policy**
  (<https://policies.google.com/privacy>) and the permissions on your Google
  account. We are not responsible for Google's processing.
- You can disconnect at any time. Disconnecting revokes the token with Google
  and deletes the locally stored token. You can also remove all
  Schoolwork-created events from your calendar using the "Remove all Schoolwork
  events" button.

We never receive a copy of your Google data on any server we control.

## 5. How we use information

Because data stays on your device, the App uses your information solely to
provide the App's features to you: displaying your planner, computing due-date
reminders, rendering grades, and (optionally) syncing to your own Google
Calendar. We do not profile you, target advertising, or perform automated
decision-making that produces legal effects.

## 6. Legal bases (where applicable)

Where data protection law applies (e.g. the Australian Privacy Act 1988 (Cth)
and the Australian Privacy Principles, or the EU/UK GDPR for users in those
regions), our processing relies on: (a) **your consent** (for the optional
Google integration); and (b) **performance of our agreement** with you to
provide the App's local functionality. Because processing is local, most data
never comes into our custody.

## 7. Children's and students' privacy

Schoolwork is designed for senior-secondary students, **some of whom may be
minors**. The App is intended to be installed and used under the supervision of
the student and, where appropriate, a parent, guardian, or school. The Operator
does not knowingly collect personal information from children on any server,
because the App does not transmit personal information to the Operator at all.

If you are under the age of majority in your jurisdiction, use the App only with
the consent and supervision of a parent, guardian, or your school. Schools
deploying this App are responsible for obtaining any consents required under
applicable education and privacy laws.

## 8. Data retention and deletion

Your data persists on your device until you delete it. You can:

- Delete individual items (assignments, notes, subjects, files, events) in the App.
- Reset a whole term from **Settings → Data & storage → Reset this term**.
- Disconnect Google and revoke tokens in **Settings → Connectors**.
- Remove **all** App data by deleting the App's per-user data folder
  (`%APPDATA%\Schoolwork` on Windows) and uninstalling the App.

## 9. Security

We use your operating system's secure storage to encrypt OAuth tokens where
available, store passwords only as salted hashes, and keep your study data on
your device rather than in the cloud. However, **no method of storage is
perfectly secure.** Data on your device is only as safe as your device: keep your
operating system account password-protected, encrypted (e.g. BitLocker/FileVault),
and free of malware. You are responsible for the security of the device on which
you run the App.

## 10. Your rights

Depending on your jurisdiction you may have rights to access, correct, delete,
export, or restrict processing of your personal information. Because your data
lives on your device, you can exercise most of these rights directly within the
App (view, edit, export to JSON/CSV, and delete). For anything you cannot do in
the App, contact the Operator at the address in Section 1.

## 11. International users

The App runs locally, so your study data is processed in the location of your
device. If you use the optional Google integration, your data is transmitted to
Google and may be processed by Google in other countries under Google's terms.

## 12. Third-party services

The only third-party service the App can transmit your data to is **Google**
(Calendar and account email), and only at your initiative. The App's React and
Babel libraries are bundled locally and make no network calls. The App does not
include advertising, analytics, or tracking SDKs.

## 13. Changes to this policy

We may update this Privacy Policy. The "Last updated" date reflects the latest
version. Material changes will be reflected in the App's About screen. Continued
use after an update constitutes acceptance of the revised policy.

## 14. Contact

Questions about this policy or your data: contact the Operator at the details in
Section 1.
