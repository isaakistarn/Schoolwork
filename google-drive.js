/*
 * Google Drive integration — runs in the Electron main process.
 *
 * Shares the same OAuth connection as the Calendar connector (the consent
 * screen requests a read-only Drive scope), so a single "Connect Google"
 * covers both. This module only READS Drive — it never modifies your files.
 *
 * All queries span My Drive, "Shared with me", and shared drives (Team
 * Drives), which matters for school Google Workspace accounts where most
 * material lives in shared drives.
 */

const { google } = require('googleapis');

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const MAX_BYTES = 12 * 1024 * 1024; // in-app preview / import ceiling

const EXPORT_AS = {
  'application/vnd.google-apps.document': 'application/pdf',
  'application/vnd.google-apps.spreadsheet': 'application/pdf',
  'application/vnd.google-apps.presentation': 'application/pdf',
  'application/vnd.google-apps.drawing': 'image/png',
};
const TEXTY = /^(text\/|application\/(json|xml|javascript|x-yaml))/;

function drive(cfg, tokens, onRefresh) {
  const oauth = new google.auth.OAuth2(cfg.client_id, cfg.client_secret, 'http://127.0.0.1/oauth2callback');
  oauth.setCredentials(tokens);
  oauth.on('tokens', (next) => onRefresh && onRefresh(next));
  return google.drive({ version: 'v3', auth: oauth });
}

const mapFile = (f) => ({
  id: f.id,
  name: f.name,
  mimeType: f.mimeType,
  isFolder: f.mimeType === FOLDER_MIME,
  modifiedTime: f.modifiedTime,
  webViewLink: f.webViewLink,
  iconLink: f.iconLink,
  size: f.size ? Number(f.size) : null,
  owner: (f.owners && f.owners[0] && f.owners[0].displayName) || '',
  shared: !!f.shared,
});

/*
 * listFolder — children of `folderId` (default the root "My Drive"), the
 * "Shared with me" view (folderId 'shared'), or a name search across every
 * drive the user can see (when `q` is given). Folders sort first.
 *
 * At the My Drive root we also surface "Shared with me" and each shared drive
 * as top-level folders so they're reachable by browsing, not just search.
 */
async function listFolder(cfg, tokens, { folderId, q } = {}, onRefresh) {
  const d = drive(cfg, tokens, onRefresh);
  const isSearch = !!(q && q.trim());
  const isShared = !isSearch && folderId === 'shared';
  const isRoot = !isSearch && !isShared && (!folderId || folderId === 'root');

  let query;
  if (isSearch) query = `name contains '${q.trim().replace(/'/g, "\\'")}' and trashed = false`;
  else if (isShared) query = 'sharedWithMe = true and trashed = false';
  else query = `'${folderId || 'root'}' in parents and trashed = false`;

  const params = {
    q: query,
    pageSize: 300,
    spaces: 'drive',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    fields: 'files(id,name,mimeType,modifiedTime,webViewLink,iconLink,size,owners(displayName),shared)',
  };
  // "allDrives" lets a search/browse reach shared drives; the sharedWithMe
  // view is a user-corpus concept, so leave corpora at its default there.
  if (!isShared) params.corpora = 'allDrives';

  const { data } = await d.files.list(params);
  let out = (data.files || []).map(mapFile);
  out.sort((a, b) => (a.isFolder === b.isFolder ? String(a.name).localeCompare(String(b.name)) : (a.isFolder ? -1 : 1)));

  if (isRoot) {
    const heads = [{ id: 'shared', name: 'Shared with me', mimeType: FOLDER_MIME, isFolder: true, virtual: true }];
    try {
      const dr = await d.drives.list({ pageSize: 100, fields: 'drives(id,name)' });
      (dr.data.drives || []).forEach(x => heads.push({ id: x.id, name: x.name, mimeType: FOLDER_MIME, isFolder: true, sharedDrive: true }));
    } catch { /* consumer accounts have no shared drives */ }
    out = [...heads, ...out];
  }
  return out;
}

/*
 * getFileContent — returns a renderer-friendly payload:
 *   { body, mimeType, kind:'text' }              for text-like files
 *   { dataUrl, mimeType, kind:'image'|'pdf' }    for images / PDFs / exported docs
 *   { tooBig:true } | { unsupported:true }       when no in-app preview is possible
 */
async function getFileContent(cfg, tokens, { fileId, mimeType, size } = {}, onRefresh) {
  const d = drive(cfg, tokens, onRefresh);
  if (size && Number(size) > MAX_BYTES) return { tooBig: true };

  if (mimeType && mimeType.startsWith('application/vnd.google-apps')) {
    const exportMime = EXPORT_AS[mimeType];
    if (!exportMime) return { unsupported: true };
    const res = await d.files.export({ fileId, mimeType: exportMime }, { responseType: 'arraybuffer' });
    const b64 = Buffer.from(res.data).toString('base64');
    return { dataUrl: `data:${exportMime};base64,${b64}`, mimeType: exportMime, kind: exportMime === 'application/pdf' ? 'pdf' : 'image' };
  }

  const res = await d.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
  const buf = Buffer.from(res.data);
  if (buf.length > MAX_BYTES) return { tooBig: true };
  if (TEXTY.test(mimeType || '')) return { body: buf.toString('utf8'), mimeType, kind: 'text' };
  const kind = (mimeType || '').startsWith('image/') ? 'image' : (mimeType === 'application/pdf' ? 'pdf' : 'binary');
  if (kind === 'binary') return { unsupported: true };
  return { dataUrl: `data:${mimeType};base64,${buf.toString('base64')}`, mimeType, kind };
}

module.exports = { listFolder, getFileContent };
