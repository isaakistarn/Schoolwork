/*
 * Google Calendar integration — runs in the Electron main process.
 *
 * Uses the "installed application" OAuth 2.0 flow with a loopback redirect
 * (https://developers.google.com/identity/protocols/oauth2/native-app).
 *
 * Required Google Cloud setup (one-time, per developer):
 *   1. Create a project at https://console.cloud.google.com
 *   2. Enable the "Google Calendar API"
 *   3. Create an OAuth 2.0 Client ID of type "Desktop app"
 *   4. Copy the client_id + client_secret into Settings → Connectors → Google
 */

const http = require('node:http');
const crypto = require('node:crypto');
const { google } = require('googleapis');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive.readonly', // Drive connector (read-only: browse + preview + import)
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
];

function newOAuthClient(cfg, redirectUri) {
  return new google.auth.OAuth2(cfg.client_id, cfg.client_secret, redirectUri);
}

function pkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/* ---------- OAuth: loopback redirect flow ---------- */
async function runOAuthFlow(cfg, openExternal) {
  return new Promise((resolve, reject) => {
    const state = crypto.randomBytes(16).toString('hex');
    const { verifier, challenge } = pkcePair();

    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, `http://127.0.0.1`);
        if (url.pathname !== '/oauth2callback') {
          res.writeHead(404).end();
          return;
        }
        const code = url.searchParams.get('code');
        const returnedState = url.searchParams.get('state');
        const err = url.searchParams.get('error');
        if (err) throw new Error(err);
        if (!code) throw new Error('Missing authorisation code');
        if (returnedState !== state) throw new Error('OAuth state mismatch');

        const port = server.address().port;
        const oauth = newOAuthClient(cfg, `http://127.0.0.1:${port}/oauth2callback`);
        const { tokens } = await oauth.getToken({ code, codeVerifier: verifier });
        oauth.setCredentials(tokens);

        // Best-effort: enrich with the account email.
        try {
          const userinfo = google.oauth2({ auth: oauth, version: 'v2' });
          const me = await userinfo.userinfo.get();
          tokens.email = me.data.email;
        } catch { /* keep going without email */ }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><meta charset="utf-8">
          <title>Schoolwork — connected</title>
          <style>body{font:14px/1.5 -apple-system,Segoe UI,sans-serif;padding:40px;color:#1B1E22;background:#FBFBFC}
          .card{max-width:420px;border:1px solid #D9DCE0;border-radius:6px;padding:24px}
          h1{font-size:18px;margin:0 0 8px}</style>
          <div class="card"><h1>Schoolwork is connected</h1>
          <p>Your Google account is now linked. You can close this tab and return to the Schoolwork app.</p></div>`);

        setTimeout(() => server.close(), 200);
        resolve(tokens);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Authorisation failed: ' + e.message);
        setTimeout(() => server.close(), 200);
        reject(e);
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const oauth = newOAuthClient(cfg, `http://127.0.0.1:${port}/oauth2callback`);
      const authUrl = oauth.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: SCOPES,
        state,
        code_challenge_method: 'S256',
        code_challenge: challenge,
      });
      openExternal({ url: authUrl });
    });

    server.on('error', reject);
    // Safety timeout (5 min)
    setTimeout(() => {
      try { server.close(); } catch {}
      reject(new Error('Authorisation timed out after 5 minutes'));
    }, 5 * 60 * 1000);
  });
}

/* ---------- Helpers ---------- */
function withCreds(cfg, tokens, onRefresh) {
  const oauth = newOAuthClient(cfg, 'http://127.0.0.1/oauth2callback');
  oauth.setCredentials(tokens);
  oauth.on('tokens', (next) => onRefresh?.(next));
  return oauth;
}

async function listCalendars(cfg, tokens, onRefresh) {
  const auth = withCreds(cfg, tokens, onRefresh);
  const cal = google.calendar({ version: 'v3', auth });
  const { data } = await cal.calendarList.list({ maxResults: 100 });
  return (data.items || []).map(c => ({
    id: c.id, summary: c.summary, primary: !!c.primary, accessRole: c.accessRole,
    backgroundColor: c.backgroundColor, timeZone: c.timeZone,
  }));
}

/*
 * upsertEvents — for each input event, create or patch the Google Calendar
 * event whose extendedProperties.private.schoolworkId matches the assignment/
 * schedule id. This gives us a stable mapping without an explicit local cache.
 *
 * Each input event:
 *   {
 *     schoolworkId: string,        // assignment id like "A-2041" or "S-mon-09:00"
 *     summary: string,
 *     description?: string,
 *     start: ISO string,
 *     end:   ISO string,
 *     colorId?: string,            // 1..11 (optional)
 *     reminderMinutes?: number,
 *     location?: string,
 *   }
 */
async function upsertEvents(cfg, tokens, calendarId, events, onRefresh) {
  const auth = withCreds(cfg, tokens, onRefresh);
  const cal = google.calendar({ version: 'v3', auth });
  const results = [];

  for (const ev of events) {
    const tz = ev.timeZone || 'Australia/Brisbane';
    const body = {
      summary: ev.summary,
      description: ev.description || '',
      location: ev.location || '',
      start: { dateTime: ev.start, timeZone: tz },
      end:   { dateTime: ev.end, timeZone: tz },
      colorId: ev.colorId,
      reminders: ev.reminderMinutes != null
        ? { useDefault: false, overrides: [{ method: 'popup', minutes: ev.reminderMinutes }] }
        : { useDefault: true },
      extendedProperties: { private: { schoolworkId: ev.schoolworkId, source: 'schoolwork-app' } },
    };

    // Find existing event by extendedProperties
    const existing = await cal.events.list({
      calendarId,
      privateExtendedProperty: `schoolworkId=${ev.schoolworkId}`,
      maxResults: 1,
      showDeleted: false,
    });

    if (existing.data.items && existing.data.items.length > 0) {
      const id = existing.data.items[0].id;
      const upd = await cal.events.patch({ calendarId, eventId: id, requestBody: body });
      results.push({ schoolworkId: ev.schoolworkId, action: 'updated', googleId: upd.data.id, htmlLink: upd.data.htmlLink });
    } else {
      const ins = await cal.events.insert({ calendarId, requestBody: body });
      results.push({ schoolworkId: ev.schoolworkId, action: 'created', googleId: ins.data.id, htmlLink: ins.data.htmlLink });
    }
  }
  return results;
}

async function deleteEvent(cfg, tokens, calendarId, eventId, onRefresh) {
  const auth = withCreds(cfg, tokens, onRefresh);
  const cal = google.calendar({ version: 'v3', auth });
  await cal.events.delete({ calendarId, eventId });
  return { deleted: true };
}

/* Remove every event this app created (tagged source=schoolwork-app). */
async function purgeEvents(cfg, tokens, calendarId, onRefresh) {
  const auth = withCreds(cfg, tokens, onRefresh);
  const cal = google.calendar({ version: 'v3', auth });
  let removed = 0, pageToken;
  do {
    const list = await cal.events.list({
      calendarId,
      privateExtendedProperty: 'source=schoolwork-app',
      maxResults: 250, pageToken, showDeleted: false,
    });
    const items = list.data.items || [];
    for (const ev of items) {
      try { await cal.events.delete({ calendarId, eventId: ev.id }); removed++; } catch {}
    }
    pageToken = list.data.nextPageToken;
  } while (pageToken);
  return { removed };
}

async function revoke(cfg, tokens) {
  const oauth = newOAuthClient(cfg, 'http://127.0.0.1/oauth2callback');
  oauth.setCredentials(tokens);
  try { await oauth.revokeCredentials(); } catch {}
}

module.exports = { runOAuthFlow, listCalendars, upsertEvents, deleteEvent, purgeEvents, revoke };
