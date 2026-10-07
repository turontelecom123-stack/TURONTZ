/* How uploaded files are named and served.
   The browser-supplied MIME type is never trusted: an executor could label an
   HTML page as "image/png" or upload "brief.html" and have it run as Turon TZ.
   The type comes from the extension, and only media and PDF open in the tab;
   everything else downloads. */

const path = require('path');

// Opened inline: browsers render these as media and never run them as a page.
const INLINE_TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf',
};
// Known work files that only download (SVG can carry scripts, so it is here too).
const DOWNLOAD_TYPES = {
  '.svg': 'image/svg+xml', '.heic': 'image/heic', '.psd': 'image/vnd.adobe.photoshop', '.ai': 'application/postscript',
  '.zip': 'application/zip', '.rar': 'application/vnd.rar', '.7z': 'application/x-7z-compressed',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain', '.csv': 'text/csv',
};

function fileExt(name) {
  return path.extname(String(name || '')).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
}

function fileTypeFor(name) {
  const ext = fileExt(name);
  return INLINE_TYPES[ext] || DOWNLOAD_TYPES[ext] || 'application/octet-stream';
}

// Headers for serving a stored file. Inline media also gets a sandbox CSP, so even a
// file that a browser mis-detects cannot run script on the Turon TZ origin.
function fileHeaders(name, size) {
  const ext = fileExt(name);
  const inline = INLINE_TYPES[ext];
  const headers = {
    'content-type': inline || 'application/octet-stream',
    'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(String(name || 'file'))}`,
    'cache-control': 'private, max-age=3600',
    'accept-ranges': 'bytes',
  };
  if (size !== undefined) headers['content-length'] = size;
  if (inline !== 'application/pdf') headers['content-security-policy'] = "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox";
  return headers;
}

// "bytes=START-END" → { start, end } within size, or null when the range is unusable.
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!m || (!m[1] && !m[2])) return null;
  let start, end;
  if (!m[1]) { start = Math.max(0, size - Number(m[2])); end = size - 1; }
  else { start = Number(m[1]); end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1; }
  if (!(start <= end) || start >= size) return null;
  return { start, end };
}

module.exports = { fileExt, fileTypeFor, fileHeaders, parseRange, INLINE_TYPES };
