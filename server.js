/* Turon TZ — production-style local MVP server.
   No external dependencies. Start: node server.js or start.bat */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const zlib = require('zlib');
const Parser = require('./parser_engine');
const Files = require('./lib/files');
const Schedule = require('./lib/schedule');
const { buildReport } = require('./lib/report');

const ROOT = __dirname;
// Optional .env next to server.js (KEY=VALUE lines, # comments). Real environment variables win; empty values are skipped.
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    const quoted = m[2].match(/^(['"])(.*)\1$/);
    const value = quoted ? quoted[2] : m[2].replace(/\s+#.*$/, '');
    if (value) process.env[m[1]] = value;
  }
} catch (e) {}

// 3456 can be occupied by the desktop preview runtime, so the local app uses a stable free port.
const PORT = process.env.PORT || 3457;
const DB_FILE = process.env.TURON_DB_FILE || path.join(ROOT, 'db.json');
const UPLOAD_DIR = process.env.TURON_UPLOAD_DIR || path.join(ROOT, 'uploads');
const MIN_PASSWORD = 6;
const TOKEN_TTL_MS = Number(process.env.TOKEN_TTL_DAYS || 30) * 864e5;
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB || 300) * 1024 * 1024;
const SUPABASE_MAX_FILE_BYTES = Number(process.env.SUPABASE_MAX_FILE_MB || 8) * 1024 * 1024;
const BACKUP_HOUR = Number(process.env.BACKUP_HOUR || 21); // daily Telegram backup, team time
const LOW_DISK_BYTES = Number(process.env.LOW_DISK_GB || 2) * 1024 ** 3;
// Behind a hosting proxy (Render) the client address arrives in X-Forwarded-For.
const TRUST_PROXY = /^(1|true|yes)$/i.test(process.env.TRUST_PROXY || '');

// AI providers:
// - Ollama runs on this computer and is free / keyless.
// - Claude stays optional for teams that later decide to use a paid API.
// - The built-in parser is always available as a safe fallback.
function readAiKey() {
  let k = (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '').trim();
  if (!k) { try { k = fs.readFileSync(path.join(ROOT, 'ai_key.txt'), 'utf8').trim(); } catch (e) {} }
  return k.startsWith('sk-') ? k : '';
}
const CLAUDE_MODEL = (process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001').trim();
const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const OLLAMA_MODEL = (process.env.OLLAMA_MODEL || 'qwen2.5:7b').trim();
const AI_PROVIDER = (process.env.AI_PROVIDER || 'auto').trim().toLowerCase();
// Optional free-cloud persistence. The key is used only on the server;
// it is never sent to the browser. Without these variables Turon TZ stays local.
const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const SUPABASE_STATE_TABLE = (process.env.SUPABASE_STATE_TABLE || 'turon_tz_state').replace(/[^a-zA-Z0-9_]/g, '') || 'turon_tz_state';
const SUPABASE_STORAGE_BUCKET = (process.env.SUPABASE_STORAGE_BUCKET || 'turon-tz-files').replace(/[^a-zA-Z0-9_-]/g, '') || 'turon-tz-files';
const MAX_BODY = 12 * 1024 * 1024;
const ROLES = ['smm', 'admin', 'video', 'edit', 'design'];
const SELF_REGISTER_ROLES = ['smm', 'video', 'edit', 'design'];
const EXECUTOR_ROLES = ['video', 'edit', 'design'];
const STATUS = ['draft', 'new', 'clarify', 'work', 'waiting', 'submitted', 'revision', 'approved', 'published', 'archived'];
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.mov': 'video/quicktime'
};

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const defaultProjects = [
  { id: 'p_telecom', name: 'Turon Telecom', aliases: ['turon', 'telecom', 'турон', 'турон телеком'], color: '#4F46E5', platformDefaults: ['Instagram', 'Telegram', 'YouTube'], brand: 'Белый + синий, акцент orange. CTA: 1132, Direct, kommentariyada +.', createdAt: new Date().toISOString() },
  { id: 'p_market', name: 'Turon Market', aliases: ['market', 'turon market', 'turonmarket', 'маркет'], color: '#10B981', platformDefaults: ['Telegram', 'Instagram'], brand: 'Qaynoq chegirmalar, mahsulot + narx + CTA Turon365/Turon Market.', createdAt: new Date().toISOString() },
  { id: 'p_tv', name: 'Turon TV', aliases: ['tv', 'turon tv', 'турон тв'], color: '#F97316', platformDefaults: ['Telegram', 'Instagram'], brand: 'TV xizmatlari, aniq instruksiya, ixcham va ishonchli tone.', createdAt: new Date().toISOString() },
];

const defaultTemplates = [
  {
    id: 'tpl_reels', name: 'Reels / short video', icon: '🎬',
    description: 'Video, montaj, hook va CTA bilan qisqa rolik.',
    brief: 'Instagram Reels uchun {project} mavzusida 20–35 soniyali video kerak. Birinchi 2 soniyada kuchli hook, oxirida CTA bo‘lsin.',
    roles: ['video', 'edit'], platform: 'Instagram', format: 'Reels 9:16 · 20–35 soniya', priority: 'med', createdAt: new Date().toISOString()
  },
  {
    id: 'tpl_design', name: 'Social media design', icon: '🎨',
    description: 'Post yoki story uchun brendga mos maket.',
    brief: '{project} uchun Instagram posti kerak. Brend ranglari va logotip qoidalariga amal qiling, CTA qo‘shing.',
    roles: ['design'], platform: 'Instagram', format: 'Post 4:5', priority: 'med', createdAt: new Date().toISOString()
  },
  {
    id: 'tpl_campaign', name: 'Kampaniya paketi', icon: '🚀',
    description: 'Video, montaj va dizayn birga ishlaydigan kampaniya.',
    brief: '{project} uchun promo-kampaniya: Reels, cover va stories kerak. Taklif, muddat va CTA aniq ko‘rsatilishi shart.',
    roles: ['video', 'edit', 'design'], platform: 'Instagram', format: 'Reels + cover + stories', priority: 'high', createdAt: new Date().toISOString()
  },
];

function normalizeDb(candidate) {
  const base = { users: [], tokens: {}, projects: defaultProjects, tasks: [], notifications: [], templates: defaultTemplates, recurring: [], meta: {} };
  const next = Object.assign(base, candidate || {});
  if (!Array.isArray(next.projects) || !next.projects.length) next.projects = defaultProjects;
  if (!Array.isArray(next.notifications)) next.notifications = [];
  if (!Array.isArray(next.templates) || !next.templates.length) next.templates = defaultTemplates;
  if (!Array.isArray(next.users)) next.users = [];
  if (!Array.isArray(next.tasks)) next.tasks = [];
  if (!Array.isArray(next.recurring)) next.recurring = [];
  if (!next.tokens || typeof next.tokens !== 'object') next.tokens = {};
  if (!next.meta || typeof next.meta !== 'object') next.meta = {};
  // Signs short-lived file links; never leaves the server.
  if (!next.meta.fileSecret) next.meta.fileSecret = crypto.randomBytes(32).toString('hex');
  next.users.forEach(u => { if (u.active === undefined) u.active = true; });
  // Files used to be public under /uploads/…; they are now served only through the access check.
  next.tasks.forEach(t => (Array.isArray(t.files) ? t.files : []).forEach(f => {
    if (String(f.url || '').startsWith('/uploads/')) {
      if (!f.localName) f.localName = path.basename(f.url);
      f.url = `/api/files/${t.id}/${f.id}`;
    }
  }));
  return next;
}

// Local backups of db.json: one on every start and every few hours, the newest 30 are kept.
const BACKUP_DIR = process.env.TURON_BACKUP_DIR || path.join(path.dirname(DB_FILE), 'backups');
function readDbFile(file) { return normalizeDb(JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''))); }
function backupFiles() {
  try { return fs.readdirSync(BACKUP_DIR).filter(f => /^db-.*\.json$/.test(f)).sort().reverse().map(f => path.join(BACKUP_DIR, f)); } catch (e) { return []; }
}
function writeBackup() {
  try {
    if (!fs.existsSync(DB_FILE)) return;
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    fs.copyFileSync(DB_FILE, path.join(BACKUP_DIR, `db-${stamp}.json`));
    backupFiles().slice(30).forEach(f => { try { fs.unlinkSync(f); } catch (e) {} });
  } catch (e) { console.error('Не удалось сделать резервную копию базы:', e.message); }
}

let db = normalizeDb();
if (fs.existsSync(DB_FILE)) {
  try {
    db = readDbFile(DB_FILE);
    writeBackup();
  } catch (e) {
    // Never start from an empty base silently: keep the damaged file and fall back to the newest readable backup.
    const broken = path.join(path.dirname(DB_FILE), `db.broken-${Date.now()}.json`);
    try { fs.copyFileSync(DB_FILE, broken); } catch (err) {}
    const restored = backupFiles().find(f => { try { db = readDbFile(f); return true; } catch (err) { return false; } });
    if (restored) { try { persistNow(); } catch (err) {} }
    console.error('\n!!! db.json повреждён (' + e.message + '). Копия сохранена: ' + broken);
    console.error(restored ? '!!! База восстановлена из резервной копии: ' + restored + '\n' : '!!! Резервной копии нет — сервер начал с пустой базы. Сообщите разработчику.\n');
  }
}
setInterval(writeBackup, 6 * 3600e3).unref();

let supabaseConnected = false;
function hasSupabase() { return !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY); }
function storageUsesSupabase() { return hasSupabase() && supabaseConnected && !!SUPABASE_STORAGE_BUCKET; }
function remotePath(...parts) { return parts.map(x => String(x).split('/').map(encodeURIComponent).join('/')).join('/'); }
function supabaseRequest(pathname, method = 'GET', body = null, extraHeaders = {}, timeout = 20000) {
  return new Promise((resolve, reject) => {
    if (!hasSupabase()) return reject(new Error('Supabase sozlanmagan'));
    let endpoint;
    try { endpoint = new URL(SUPABASE_URL + pathname); } catch (e) { return reject(new Error('Supabase URL noto‘g‘ri')); }
    const raw = body === null ? null : (Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body)));
    const client = endpoint.protocol === 'https:' ? https : http;
    const headers = {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
      ...extraHeaders,
    };
    if (raw) {
      if (!headers['content-type']) headers['content-type'] = Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json';
      headers['content-length'] = raw.length;
    }
    const req = client.request({ hostname: endpoint.hostname, port: endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80), path: endpoint.pathname + endpoint.search, method, headers, timeout }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', e => { supabaseConnected = false; reject(e); });
    req.on('timeout', () => req.destroy(new Error('Supabase javob bermadi')));
    if (raw) req.write(raw);
    req.end();
  });
}
async function supabaseJson(pathname, method = 'GET', body = null, extraHeaders = {}, timeout = 20000) {
  const res = await supabaseRequest(pathname, method, body, { accept: 'application/json', ...extraHeaders }, timeout);
  if (res.status < 200 || res.status >= 300) throw new Error(`Supabase javobi: ${res.status} ${res.body.toString('utf8').slice(0, 300)}`);
  supabaseConnected = true;
  if (!res.body.length) return {};
  try { return JSON.parse(res.body.toString('utf8')); } catch (e) { return {}; }
}
function stateSnapshot() {
  const snapshot = JSON.parse(JSON.stringify(db));
  // Sessions are deliberately local and short-lived. User/task data is durable.
  snapshot.tokens = {};
  return snapshot;
}
async function saveStateToSupabase() {
  if (!hasSupabase()) return;
  await supabaseJson(`/rest/v1/${SUPABASE_STATE_TABLE}?on_conflict=id`, 'POST', { id: 'main', data: stateSnapshot(), updated_at: new Date().toISOString() }, { Prefer: 'resolution=merge-duplicates,return=minimal' });
}
async function hydrateFromSupabase() {
  if (!hasSupabase()) return false;
  const rows = await supabaseJson(`/rest/v1/${SUPABASE_STATE_TABLE}?id=eq.main&select=data`, 'GET');
  const remote = Array.isArray(rows) && rows[0] ? rows[0].data : null;
  if (remote && typeof remote === 'object') {
    db = normalizeDb(remote);
    db.tokens = {};
    persistNow();
    return true;
  }
  await saveStateToSupabase();
  return false;
}

let saveTimer = null, remoteSaving = false, remoteSaveQueued = false;
// Write to a temp file first: if the disk is full, the old db.json stays intact instead of being truncated.
function persistNow() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
async function queueRemoteSave() {
  if (!hasSupabase()) return;
  remoteSaveQueued = true;
  if (remoteSaving) return;
  remoteSaving = true;
  while (remoteSaveQueued) {
    remoteSaveQueued = false;
    try { await saveStateToSupabase(); } catch (e) { console.error('Supabase save failed:', e.message); }
  }
  remoteSaving = false;
}
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { persistNow(); } catch (e) { console.error(e); }
    queueRemoteSave();
  }, 50);
}
function uid(p) { return p + Date.now().toString(36) + crypto.randomBytes(4).toString('hex'); }
function hashPw(pw, salt) { return crypto.scryptSync(String(pw), salt, 32).toString('hex'); }
function checkPw(user, pw) {
  const a = Buffer.from(hashPw(String(pw || ''), user.salt), 'hex'), b = Buffer.from(String(user.pass || ''), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function setPassword(user, pw) { user.salt = crypto.randomBytes(16).toString('hex'); user.pass = hashPw(pw, user.salt); }
function passwordError(pw) { return String(pw || '').length < MIN_PASSWORD ? `Пароль — минимум ${MIN_PASSWORD} символов` : ''; }
function pubUser(u) { return { id: u.id, name: u.name, login: u.login, role: u.role, active: u.active !== false, pending: !!u.pending, createdAt: u.createdAt, avatar: u.avatar || '', telegramLinked: !!u.telegramChatId, mustChangePassword: !!u.mustChangePassword, backupToTelegram: !!u.backupToTelegram }; }
function send(res, code, obj) { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); }
function sendText(res, code, txt) { res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' }); res.end(txt); }
function sanitizeStr(v, n = 300) { return String(v || '').trim().slice(0, n); }
function safeArr(a) { return Array.isArray(a) ? a : []; }
function canManage(user) { return user && ['smm', 'admin'].includes(user.role) && user.active !== false; }
// Executors see tasks addressed to them by name, or to their whole role when nobody is named.
function canSeeTask(user, t) {
  if (canManage(user)) return true;
  if (t.status === 'draft') return false;
  if (safeArr(t.assigneeIds).length) return safeArr(t.assigneeIds).includes(user.id);
  return safeArr(t.roles).includes(user.role);
}
// Only links a person can open from a browser tab; "instagram.com/…" gets https:// in front.
function safeUrl(v) {
  const s = sanitizeStr(v, 500);
  if (/^https?:\/\/[^\s]+$/i.test(s)) return s;
  if (/^(?:www\.)?[\p{L}\d-]+(?:\.[\p{L}\d-]+)+(?:[/?#][^\s]*)?$/u.test(s)) return 'https://' + s;
  return '';
}
function isoOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

// File links carry a signature instead of the session token, so a token never ends up in a URL.
// The expiry is rounded to a 6-hour step to keep links stable between refreshes (the browser can cache them).
function fileSignature(taskId, fileId, userId, exp) {
  return crypto.createHmac('sha256', db.meta.fileSecret).update(`${taskId}|${fileId}|${userId}|${exp}`).digest('hex').slice(0, 40);
}
function signedFileUrl(t, f, user) {
  const step = 6 * 3600e3;
  const exp = (Math.floor(Date.now() / step) + 2) * step;
  return `/api/files/${encodeURIComponent(t.id)}/${encodeURIComponent(f.id)}?u=${encodeURIComponent(user.id)}&e=${exp}&s=${fileSignature(t.id, f.id, user.id, exp)}`;
}
// What a person receives about a task: internal storage details stay on the server.
function presentTask(t, user) {
  const copy = JSON.parse(JSON.stringify(t));
  delete copy.reminders;
  copy.files = safeArr(copy.files).map(f => {
    const { storageKey, localName, ...rest } = f;
    const inline = Files.INLINE_TYPES[Files.fileExt(f.name)] || '';
    const preview = /^(image|video|audio)\//.test(inline) ? inline.split('/')[0] : '';
    return { ...rest, type: Files.fileTypeFor(f.name), preview, href: signedFileUrl(t, f, user) };
  });
  return copy;
}
function findProject(id) { return db.projects.find(p => p.id === id) || db.projects[0]; }
function projectBrandContext(project) {
  const p = project || {};
  const b = p.brandSettings || {};
  const pieces = [
    p.brand,
    b.toneOfVoice ? `Tone: ${b.toneOfVoice}` : '',
    b.cta ? `CTA: ${b.cta}` : '',
    safeArr(b.colors).length ? `Colors: ${safeArr(b.colors).join(', ')}` : '',
    b.font ? `Font: ${b.font}` : '',
    safeArr(b.defaultFormats).length ? `Default formats: ${safeArr(b.defaultFormats).join(', ')}` : '',
  ].filter(Boolean);
  return sanitizeStr(pieces.join(' | '), 1800);
}
function addActivity(t, user, action, detail = '') {
  t.activity = t.activity || [];
  t.activity.push({ id: uid('a'), userId: user ? user.id : 'system', action, detail: sanitizeStr(detail, 500), at: new Date().toISOString() });
}
const STATUS_RU = { draft: 'Черновик', new: 'Новое', clarify: 'Нужны уточнения', work: 'В работе', waiting: 'Ждёт материалы', submitted: 'На проверке', revision: 'Правки', approved: 'Одобрено', published: 'Опубликовано', archived: 'Архив' };
// Who hears about a task: its author plus the named assignees, or everyone in its roles when nobody is named.
function taskAudience(t, actor, extra = []) {
  const people = safeArr(t.assigneeIds).length ? safeArr(t.assigneeIds) : usersForRoles(safeArr(t.roles));
  return uniq([t.createdBy, ...people, ...extra]).filter(id => id !== (actor && actor.id));
}
function notifyUsers(userIds, title, text, taskId = null, icon = '🔔') {
  const ids = uniq(userIds);
  ids.forEach(userId => db.notifications.unshift({ id: uid('n'), userId, title: sanitizeStr(title, 120), text: sanitizeStr(text, 400), taskId, read: false, at: new Date().toISOString() }));
  if (db.notifications.length > 3000) db.notifications.length = 3000;
  const t = taskId ? db.tasks.find(x => x.id === taskId) : null;
  const lines = [`${icon} <b>${escHtml(title)}</b>`, escHtml(text)];
  if (t) {
    const p = findProject(t.projectId);
    const due = t.deadline ? 'дедлайн ' + new Date(t.deadline).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    const meta = [p && p.name, due].filter(Boolean).join(' · ');
    if (meta) lines.push(`<i>${escHtml(meta)}</i>`);
    const base = appBaseUrl();
    if (base) lines.push(`<a href="${base}/#task=${encodeURIComponent(t.id)}">Открыть задачу</a>`);
  }
  const html = lines.join('\n');
  ids.forEach(id => { const u = db.users.find(x => x.id === id); if (u && u.telegramChatId && u.active !== false) tgSend(u.telegramChatId, html); });
}

// --- Telegram bot (optional): the same notifications on the phone.
// Token: env TELEGRAM_BOT_TOKEN or telegram.json, which an SMM manager saves from the app. It never reaches the browser.
const TG_FILE = process.env.TURON_TELEGRAM_FILE || path.join(ROOT, 'telegram.json');
const tg = { token: '', username: '', error: '', generation: 0, offset: 0, codes: new Map(), drafts: new Map() };
// Overridable only so tests can talk to a fake Telegram.
const TG_API = new URL(process.env.TELEGRAM_API_URL || 'https://api.telegram.org');
function tgHttp(options, onResponse) {
  const client = TG_API.protocol === 'http:' ? http : https;
  return client.request({ hostname: TG_API.hostname, port: TG_API.port || undefined, ...options }, onResponse);
}
function escHtml(v) { return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function loadTelegramToken() {
  let token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) { try { token = String(JSON.parse(fs.readFileSync(TG_FILE, 'utf8')).token || '').trim(); } catch (e) {} }
  return token;
}
function tgRequest(token, method, body, contentType, timeout) {
  return new Promise((resolve, reject) => {
    const req = tgHttp({ path: `/bot${token}/${method}`, method: 'POST', timeout, headers: { 'content-type': contentType, 'content-length': body.length } }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        let j; try { j = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { return reject(new Error('Telegram вернул некорректный ответ')); }
        if (j.ok) resolve(j.result); else reject(Object.assign(new Error(j.description || 'Ошибка Telegram'), { code: j.error_code }));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Telegram не отвечает')));
    req.write(body); req.end();
  });
}
function tgApi(token, method, payload = {}, timeout = 15000) {
  return tgRequest(token, method, Buffer.from(JSON.stringify(payload)), 'application/json', timeout);
}
// sendDocument needs multipart/form-data; used for the daily database backup.
function tgSendDocument(chatId, filename, buffer, caption) {
  const boundary = '----turontz' + crypto.randomBytes(8).toString('hex');
  const field = (name, value) => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
  const body = Buffer.concat([
    field('chat_id', String(chatId)),
    field('caption', caption),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return tgRequest(tg.token, 'sendDocument', body, `multipart/form-data; boundary=${boundary}`, 120000);
}
// Downloads a photo or document someone sent to the bot (Telegram allows bots up to 20 MB).
async function tgDownload(fileId) {
  const info = await tgApi(tg.token, 'getFile', { file_id: fileId });
  if (!info.file_path) throw new Error('Telegram не отдал файл');
  const buffer = await new Promise((resolve, reject) => {
    const req = tgHttp({ path: `/file/bot${tg.token}/${info.file_path}`, method: 'GET', timeout: 60000 }, res => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('Telegram: ' + res.statusCode)); }
      const chunks = []; let size = 0;
      res.on('data', c => { size += c.length; if (size > 20 * 1024 * 1024) res.destroy(new Error('Файл больше 20 МБ')); else chunks.push(c); });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Telegram не отвечает')));
    req.end();
  });
  return { buffer, filePath: info.file_path };
}
async function startTelegram(token) {
  const gen = ++tg.generation;
  Object.assign(tg, { token: token || '', username: '', error: '' });
  if (!tg.token) return;
  try { tg.username = (await tgApi(tg.token, 'getMe')).username; }
  catch (e) { tg.error = e.message; console.error('Telegram-бот не подключён:', e.message); return; }
  console.log('Telegram-бот подключён: @' + tg.username);
  (async () => {
    while (gen === tg.generation) {
      try {
        const updates = await tgApi(tg.token, 'getUpdates', { offset: tg.offset, timeout: 25, allowed_updates: ['message', 'callback_query'] }, 35000);
        for (const u of updates) {
          tg.offset = u.update_id + 1;
          if (gen !== tg.generation) continue;
          const work = u.callback_query ? handleTelegramCallback(u.callback_query) : handleTelegramMessage(u.message);
          await work.catch(e => console.error('Telegram:', e.message));
        }
        tg.error = '';
      } catch (e) {
        if (gen !== tg.generation) return;
        if (e.code === 401 || e.code === 404) { tg.error = 'Токен бота больше не действует — подключите бота заново'; tg.username = ''; return; }
        tg.error = e.code === 409 ? 'Этот бот уже запущен на другом компьютере' : 'Нет связи с Telegram: ' + e.message;
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  })();
}
function tgSend(chatId, html, extra = {}) {
  if (!tg.token || !tg.username || !chatId) return Promise.resolve();
  return tgApi(tg.token, 'sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true, ...extra }).catch(e => {
    if (e.code === 403) { // the person blocked the bot
      const u = db.users.find(x => x.telegramChatId === chatId);
      if (u) { delete u.telegramChatId; delete u.telegramName; persist(); }
    } else console.error('Telegram: не отправлено —', e.message);
  });
}

const ROLE_RU = { video: 'видеограф', edit: 'монтажёр', design: 'дизайнер' };
const PRIORITY_RU = { high: 'срочно', med: 'обычный', low: 'не срочно' };
const TG_MANAGER_HELP = 'Отправьте сюда текст ТЗ — так, как написали бы исполнителю. Бот разберёт его и покажет черновик: проект, исполнители, дедлайн. Фото или файл с подписью станут референсом.\n\n🎙 Голосовые сообщения бот пока не распознаёт: нажмите микрофон на клавиатуре телефона (диктовка) и отправьте текстом.\n\n/stop — отключить уведомления.';
function tgDateTime(iso) {
  return iso ? new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
}
function tgDraftHtml(p, files) {
  const project = findProject(p.projectId);
  const people = safeArr(p.assigneeIds).map(id => (db.users.find(u => u.id === id) || {}).name).filter(Boolean);
  const lines = [
    '📝 <b>Черновик ТЗ</b>',
    `<b>${escHtml(p.title)}</b>`,
    escHtml([project && project.name, p.platform, p.format].filter(Boolean).join(' · ')),
    `👤 ${escHtml(people.length ? people.join(', ') : safeArr(p.roles).map(r => ROLE_RU[r] || r).join(', ') + ' (все с этой ролью)')}`,
  ];
  if (p.deadline) lines.push(`⏰ Дедлайн: ${escHtml(tgDateTime(p.deadline))}`);
  if (p.publishDate) lines.push(`📣 Публикация: ${escHtml(tgDateTime(p.publishDate))}`);
  lines.push(`⚡ Приоритет: ${PRIORITY_RU[p.priority] || p.priority}`);
  if (files.length) lines.push(`📎 Референсов: ${files.length}`);
  if (safeArr(p.missing).length) lines.push('', '<i>Стоит уточнить:</i>', ...safeArr(p.missing).slice(0, 4).map(x => '• ' + escHtml(x)));
  lines.push('', 'Отправить исполнителям? Поправить детали можно в приложении — кнопка «В черновик».');
  return lines.join('\n');
}
async function handleTelegramMessage(msg) {
  if (!msg || !msg.chat || msg.chat.type !== 'private') return;
  const chatId = msg.chat.id;
  const text = String(msg.text || msg.caption || '').trim();
  const start = text.match(/^\/start(?:\s+([A-Za-z0-9_-]{6,64}))?/);
  if (start && start[1]) {
    const entry = tg.codes.get(start[1]);
    tg.codes.delete(start[1]);
    if (!entry || entry.expires < Date.now()) return tgSend(chatId, 'Ссылка устарела. Откройте Turon TZ → Профиль → «Подключить Telegram» ещё раз.');
    const user = db.users.find(u => u.id === entry.userId);
    if (!user) return;
    db.users.forEach(u => { if (u.telegramChatId === chatId && u.id !== user.id) { delete u.telegramChatId; delete u.telegramName; } });
    const from = msg.from || {};
    user.telegramChatId = chatId;
    user.telegramName = from.username ? '@' + from.username : [from.first_name, from.last_name].filter(Boolean).join(' ');
    persist();
    const extra = canManage(user) ? '\n\n' + TG_MANAGER_HELP : '\nОтключить: /stop';
    return tgSend(chatId, `✅ Готово, ${escHtml(user.name)}! Уведомления Turon TZ будут приходить сюда.${extra}`);
  }
  if (/^\/stop/.test(text)) {
    const user = db.users.find(u => u.telegramChatId === chatId);
    if (user) { delete user.telegramChatId; delete user.telegramName; persist(); }
    return tgSend(chatId, 'Уведомления отключены. Подключить снова можно в профиле Turon TZ.');
  }
  const linked = db.users.find(u => u.telegramChatId === chatId && u.active !== false);
  if (!linked) return tgSend(chatId, 'Это бот уведомлений Turon TZ. Чтобы подключиться, откройте приложение → Профиль → «Подключить Telegram».');
  if (!canManage(linked)) return tgSend(chatId, `Вы подключены как ${escHtml(linked.name)}. Сюда приходят уведомления о задачах. Отключить: /stop`);

  // An SMM manager writes a TZ to the bot: parse it and show a draft with buttons.
  if (msg.voice || msg.audio || msg.video_note) return tgSend(chatId, '🎙 Голосовые сообщения бот пока не распознаёт. Нажмите микрофон на клавиатуре телефона (диктовка) — текст появится сам, — и отправьте его сюда.');
  const files = [];
  if (Array.isArray(msg.photo) && msg.photo.length) files.push({ fileId: msg.photo[msg.photo.length - 1].file_id, name: `photo-${msg.message_id}.jpg` });
  if (msg.document) files.push({ fileId: msg.document.file_id, name: sanitizeStr(msg.document.file_name, 180) || `file-${msg.message_id}` });
  if (text.startsWith('/') || text.length < 10) {
    return tgSend(chatId, files.length && !text ? 'Добавьте к файлу подпись с описанием задачи — тогда бот соберёт ТЗ.' : TG_MANAGER_HELP);
  }
  const parsed = await aiParse(sanitizeStr(text, 4000), '', 'telegram', '');
  for (const [key, d] of tg.drafts) if (d.expires < Date.now()) tg.drafts.delete(key);
  const id = crypto.randomBytes(6).toString('base64url');
  tg.drafts.set(id, { userId: linked.id, parsed, files, expires: Date.now() + 2 * 3600e3 });
  return tgSend(chatId, tgDraftHtml(parsed, files), { reply_markup: { inline_keyboard: [
    [{ text: '✅ Отправить исполнителям', callback_data: `tz:send:${id}` }],
    [{ text: '📝 В черновик', callback_data: `tz:draft:${id}` }, { text: '✖️ Отмена', callback_data: `tz:cancel:${id}` }],
  ] } });
}
async function handleTelegramCallback(cq) {
  const answer = text => tgApi(tg.token, 'answerCallbackQuery', { callback_query_id: cq.id, text }).catch(() => {});
  const m = String(cq.data || '').match(/^tz:(send|draft|cancel):([\w-]+)$/);
  if (!m) return answer('');
  const chatId = cq.message && cq.message.chat && cq.message.chat.id;
  const messageId = cq.message && cq.message.message_id;
  const edit = html => tgApi(tg.token, 'editMessageText', { chat_id: chatId, message_id: messageId, text: html, parse_mode: 'HTML', disable_web_page_preview: true }).catch(() => {});
  const draft = tg.drafts.get(m[2]);
  if (!draft || draft.expires < Date.now()) { tg.drafts.delete(m[2]); await answer('Черновик устарел'); return edit('⌛ Черновик устарел — отправьте текст ТЗ ещё раз.'); }
  const user = db.users.find(u => u.telegramChatId === (cq.from && cq.from.id) && u.active !== false);
  if (!user || user.id !== draft.userId || !canManage(user)) return answer('Нет доступа');
  tg.drafts.delete(m[2]);
  if (m[1] === 'cancel') { await answer('Отменено'); return edit('✖️ ТЗ отменено.'); }
  const asDraft = m[1] === 'draft';
  const task = createTask({ ...draft.parsed, status: asDraft ? 'draft' : 'new', source: 'telegram' }, user);
  await answer(asDraft ? 'Сохранено в черновик' : 'Отправлено ✓');
  for (const f of draft.files) {
    try { const { buffer, filePath } = await tgDownload(f.fileId); await attachFile(task, user, { name: f.name || path.basename(filePath), buffer, kind: 'reference', quiet: true }); }
    catch (e) { console.error('Telegram: референс не сохранён —', e.message); }
  }
  const base = appBaseUrl();
  return edit(`${asDraft ? '📝 Сохранено как черновик' : '✅ ТЗ отправлено исполнителям'}: <b>${escHtml(task.title)}</b>${base ? `\n<a href="${base}/#task=${encodeURIComponent(task.id)}">Открыть в Turon TZ</a>` : ''}`);
}
// Address the team opens from Telegram: PUBLIC_URL once on a domain, otherwise this computer in the office Wi-Fi.
function appBaseUrl() {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === 'IPv4' && !i.internal) ips.push(i.address);
  const ip = ips.find(a => a.startsWith('192.168.')) || ips.find(a => a.startsWith('10.')) || ips[0];
  return ip ? `http://${ip}:${PORT}` : '';
}
function uniq(a) { return [...new Set((a || []).filter(Boolean))]; }
function usersForRoles(roles) { return db.users.filter(u => u.active !== false && roles.includes(u.role)).map(u => u.id); }

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { req.destroy(); reject(new Error('too_large')); } else chunks.push(c); });
    // Chunks are joined before decoding, so a Cyrillic letter split between two chunks stays intact.
    req.on('end', () => { const d = Buffer.concat(chunks).toString('utf8'); try { resolve(d ? JSON.parse(d) : {}); } catch (e) { resolve({}); } });
    req.on('error', reject);
  });
}
// Brute-force guard: too many failed logins (or sign-ups) from one address are paused for a while.
const attempts = new Map();
// The proxy in front (Caddy on the VPS, Render) puts the real client address last in X-Forwarded-For.
function clientIp(req) {
  const direct = req.socket.remoteAddress || '';
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean).pop() || '';
  const fromLocalProxy = /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(direct);
  return (fromLocalProxy || TRUST_PROXY) && fwd ? fwd : direct;
}
function tooManyAttempts(key, limit, windowMs) {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || now - a.first > windowMs) return false;
  return a.count >= limit;
}
function countAttempt(key) {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || now - a.first > 30 * 60e3) attempts.set(key, { count: 1, first: now });
  else a.count++;
  if (attempts.size > 5000) attempts.clear();
}

// Sessions: token → { userId, createdAt, seenAt }. A session unused for TOKEN_TTL_DAYS expires.
function bearer(req) { return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim(); }
function issueToken(user) {
  const token = crypto.randomBytes(28).toString('hex');
  const now = new Date().toISOString();
  db.tokens[token] = { userId: user.id, createdAt: now, seenAt: now };
  return token;
}
function revokeTokens(userId, keep = '') {
  Object.keys(db.tokens).forEach(key => { const s = db.tokens[key]; if (key !== keep && (s === userId || (s && s.userId === userId))) delete db.tokens[key]; });
}
function pruneTokens() {
  const now = Date.now();
  Object.keys(db.tokens).forEach(key => { const s = db.tokens[key]; if (s && typeof s === 'object' && now - new Date(s.seenAt).getTime() > TOKEN_TTL_MS) delete db.tokens[key]; });
}
function authUser(req) {
  const token = bearer(req);
  if (!token) return null;
  let s = db.tokens[token];
  if (!s) return null;
  const now = Date.now();
  if (typeof s === 'string') s = db.tokens[token] = { userId: s, createdAt: new Date(now).toISOString(), seenAt: new Date(now).toISOString() }; // sessions from older versions
  if (now - new Date(s.seenAt).getTime() > TOKEN_TTL_MS) { delete db.tokens[token]; persist(); return null; }
  if (now - new Date(s.seenAt).getTime() > 3600e3) { s.seenAt = new Date(now).toISOString(); persist(); }
  const user = db.users.find(u => u.id === s.userId) || null;
  return user && user.active !== false ? user : null;
}

// Stores an upload from memory (buffer) or from a finished temp file (tmpPath).
async function storeUploadedFile(task, fileId, fileName, { buffer, tmpPath }) {
  const ext = Files.fileExt(fileName);
  if (storageUsesSupabase()) {
    const data = buffer || fs.readFileSync(tmpPath);
    if (tmpPath) fs.unlink(tmpPath, () => {});
    const storageKey = `tasks/${task.id}/${fileId}${ext}`;
    const remote = await supabaseRequest(`/storage/v1/object/${remotePath(SUPABASE_STORAGE_BUCKET, storageKey)}`, 'POST', data, { 'content-type': Files.fileTypeFor(fileName), 'x-upsert': 'true' }, 10 * 60e3);
    if (remote.status < 200 || remote.status >= 300) throw new Error(`Supabase Storage javobi: ${remote.status} ${remote.body.toString('utf8').slice(0, 240)}`);
    supabaseConnected = true;
    return { url: `/api/files/${task.id}/${fileId}`, storageKey, localName: null };
  }
  const localName = fileId + ext;
  if (tmpPath) fs.renameSync(tmpPath, path.join(UPLOAD_DIR, localName));
  else fs.writeFileSync(path.join(UPLOAD_DIR, localName), buffer);
  return { url: `/api/files/${task.id}/${fileId}`, storageKey: null, localName };
}
async function removeStoredFile(file) {
  if (file.storageKey && hasSupabase()) {
    const remote = await supabaseRequest(`/storage/v1/object/${remotePath(SUPABASE_STORAGE_BUCKET)}`, 'DELETE', { prefixes: [file.storageKey] });
    if (remote.status < 200 || remote.status >= 300) throw new Error(`Supabase Storage javobi: ${remote.status}`);
    supabaseConnected = true;
    return;
  }
  const localName = sanitizeStr(file.localName || path.basename(String(file.url || '')), 220);
  if (localName && /^[a-zA-Z0-9._-]+$/.test(localName)) { try { fs.unlinkSync(path.join(UPLOAD_DIR, localName)); } catch (e) {} }
}
async function sendStoredFile(req, res, task, file) {
  if (file.storageKey && hasSupabase()) {
    const remote = await supabaseRequest(`/storage/v1/object/authenticated/${remotePath(SUPABASE_STORAGE_BUCKET, file.storageKey)}`, 'GET', null, {}, 60000);
    if (remote.status < 200 || remote.status >= 300) return sendText(res, remote.status || 404, 'File not found');
    supabaseConnected = true;
    res.writeHead(200, Files.fileHeaders(file.name, remote.body.length));
    return res.end(remote.body);
  }
  const localName = sanitizeStr(file.localName || path.basename(String(file.url || '')), 220);
  if (!localName || !/^[a-zA-Z0-9._-]+$/.test(localName)) return sendText(res, 404, 'File not found');
  const full = path.join(UPLOAD_DIR, localName);
  let stat;
  try { stat = fs.statSync(full); } catch (e) { return sendText(res, 404, 'File not found'); }
  // Streamed with Range support: phones (Safari) only play video that can be fetched in parts.
  const range = req.headers.range ? Files.parseRange(req.headers.range, stat.size) : null;
  if (req.headers.range && !range) { res.writeHead(416, { 'content-range': `bytes */${stat.size}` }); return res.end(); }
  const headers = Files.fileHeaders(file.name, range ? range.end - range.start + 1 : stat.size);
  if (range) headers['content-range'] = `bytes ${range.start}-${range.end}/${stat.size}`;
  res.writeHead(range ? 206 : 200, headers);
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(full, range || {}).on('error', () => res.destroy()).pipe(res);
}
// The file-link signature (see signedFileUrl) or a regular session header.
function fileRequestUser(req, url, t, f) {
  const u = url.searchParams.get('u'), e = Number(url.searchParams.get('e')), s = url.searchParams.get('s') || '';
  if (u && e && s) {
    const expected = fileSignature(t.id, f.id, u, e);
    const ok = e > Date.now() && s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected));
    const user = ok ? db.users.find(x => x.id === u && x.active !== false) : null;
    if (user) return user;
  }
  return authUser(req);
}

// Adds a stored upload to a task: version, activity, auto-"submitted" for executors and notifications.
async function attachFile(t, user, { name, buffer, tmpPath, size, kind, quiet = false }) {
  const id = uid('f');
  const stored = await storeUploadedFile(t, id, name, { buffer, tmpPath });
  const isRef = kind === 'reference';
  const version = isRef ? null : safeArr(t.files).filter(f => f.kind !== 'reference').length + 1;
  const f = { id, name, type: Files.fileTypeFor(name), size: buffer ? buffer.length : size, url: stored.url, storageKey: stored.storageKey, localName: stored.localName, uploadedBy: user.id, uploadedAt: new Date().toISOString(), version, kind: isRef ? 'reference' : 'work', status: 'pending' };
  t.files = safeArr(t.files); t.files.push(f); t.updatedAt = f.uploadedAt;
  addActivity(t, user, 'file', `${name}${version ? ' · v' + version : ''}`);
  if (!isRef && !canManage(user) && !['submitted', 'approved', 'published'].includes(t.status)) {
    const oldStatus = t.status; t.status = 'submitted';
    addActivity(t, user, 'status', `${oldStatus} → submitted`);
  }
  if (!quiet) notifyUsers(taskAudience(t, user), isRef ? 'Добавлен референс' : 'Загружен файл', `${t.title}: ${name}${version ? ` (v${version})` : ''} — ${user.name}`, t.id, '📎');
  persist();
  return f;
}
// Raw (not base64) upload streamed to disk, so large videos never sit in memory.
function receiveUpload(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > limit) return reject(Object.assign(new Error('too_large'), { status: 413 }));
    const tmpPath = path.join(UPLOAD_DIR, `.upload-${crypto.randomBytes(8).toString('hex')}.part`);
    const out = fs.createWriteStream(tmpPath);
    let size = 0, failed = false;
    const fail = err => { if (failed) return; failed = true; out.destroy(); fs.unlink(tmpPath, () => {}); reject(err); };
    req.on('data', c => { size += c.length; if (size > limit) { req.unpipe(out); req.destroy(); fail(Object.assign(new Error('too_large'), { status: 413 })); } });
    req.on('close', () => { if (!req.complete) fail(new Error('Загрузка прервана')); });
    req.on('error', fail);
    out.on('error', fail);
    out.on('finish', () => { if (!failed) resolve({ tmpPath, size }); });
    req.pipe(out);
  });
}

function normalizeProject(body, existing = {}) {
  const colors = safeArr(body.brandSettings?.colors ?? existing.brandSettings?.colors).map(x => sanitizeStr(x, 32)).filter(Boolean).slice(0, 6);
  const socialLinks = safeArr(body.brandSettings?.socialLinks ?? existing.brandSettings?.socialLinks).map(x => sanitizeStr(x, 320)).filter(Boolean).slice(0, 8);
  const defaultFormats = safeArr(body.brandSettings?.defaultFormats ?? existing.brandSettings?.defaultFormats).map(x => sanitizeStr(x, 100)).filter(Boolean).slice(0, 8);
  return {
    id: existing.id || uid('p'),
    name: sanitizeStr(body.name ?? existing.name, 80),
    aliases: safeArr(body.aliases ?? existing.aliases).map(x => sanitizeStr(x, 60)).filter(Boolean).slice(0, 16),
    color: sanitizeStr(body.color ?? existing.color, 20) || '#4F46E5',
    platformDefaults: safeArr(body.platformDefaults ?? existing.platformDefaults).map(x => sanitizeStr(x, 40)).filter(Boolean).slice(0, 8),
    brand: sanitizeStr(body.brand ?? existing.brand, 1400),
    brandSettings: {
      logo: sanitizeStr(body.brandSettings?.logo ?? existing.brandSettings?.logo, 320),
      colors,
      font: sanitizeStr(body.brandSettings?.font ?? existing.brandSettings?.font, 100),
      toneOfVoice: sanitizeStr(body.brandSettings?.toneOfVoice ?? existing.brandSettings?.toneOfVoice, 500),
      cta: sanitizeStr(body.brandSettings?.cta ?? existing.brandSettings?.cta, 400),
      socialLinks,
      defaultFormats,
    },
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function executorCanSetStatus(current, next) {
  const transitions = {
    new: ['work', 'clarify'],
    clarify: ['work'],
    revision: ['work'],
    work: ['waiting', 'submitted', 'clarify'],
    waiting: ['work', 'clarify'],
  };
  return safeArr(transitions[current]).includes(next);
}

// --- Claude AI parsing (optional) ---
function callClaude(apiKey, prompt) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-length': Buffer.byteLength(payload) },
      timeout: 20000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (j.error) return reject(new Error(j.error.message || 'Claude API error'));
          const text = (j.content || []).map(b => b.text || '').join('');
          resolve(text);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.write(payload); req.end();
  });
}

let ollamaStatusCache = { checkedAt: 0, value: null };

function ollamaRequest(pathname, method = 'GET', payload = null, timeout = 15000) {
  return new Promise((resolve, reject) => {
    let endpoint;
    try { endpoint = new URL(OLLAMA_URL + pathname); } catch (e) { return reject(new Error('Неверный адрес Ollama')); }
    const body = payload === null ? '' : JSON.stringify(payload);
    const client = endpoint.protocol === 'https:' ? https : http;
    const req = client.request({
      hostname: endpoint.hostname,
      port: endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80),
      path: endpoint.pathname + endpoint.search,
      method,
      timeout,
      headers: body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {},
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`Ollama ответил: ${res.statusCode}`));
        try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(new Error('Ollama вернул некорректный ответ')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Ollama не отвечает')));
    if (body) req.write(body);
    req.end();
  });
}

async function getOllamaStatus(force = false) {
  const now = Date.now();
  if (!force && ollamaStatusCache.value && now - ollamaStatusCache.checkedAt < 5000) return ollamaStatusCache.value;
  let value;
  try {
    const tags = await ollamaRequest('/api/tags', 'GET', null, 1200);
    const models = safeArr(tags.models).map(m => m.name || '').filter(Boolean);
    const ready = models.some(name => name === OLLAMA_MODEL || name.startsWith(OLLAMA_MODEL + ':') || OLLAMA_MODEL.startsWith(name + ':'));
    value = { installed: true, modelReady: ready, model: OLLAMA_MODEL, models };
  } catch (e) {
    value = { installed: false, modelReady: false, model: OLLAMA_MODEL, models: [] };
  }
  ollamaStatusCache = { checkedAt: now, value };
  return value;
}

async function callOllama(prompt, maxTokens = 1400) {
  const response = await ollamaRequest('/api/generate', 'POST', {
    model: OLLAMA_MODEL,
    prompt,
    format: 'json',
    stream: false,
    keep_alive: '5m',
    options: { temperature: 0.3, num_predict: maxTokens },
  }, 120000);
  if (!response.response) throw new Error('Ollama не вернул текст');
  return response.response;
}

async function getAiStatus(force = false) {
  const ollama = await getOllamaStatus(force);
  const claudeEnabled = !!readAiKey();
  let activeProvider = 'offline';
  if (AI_PROVIDER === 'ollama') activeProvider = ollama.modelReady ? 'ollama' : 'offline';
  else if (AI_PROVIDER === 'claude') activeProvider = claudeEnabled ? 'claude' : 'offline';
  else if (AI_PROVIDER !== 'offline') activeProvider = ollama.modelReady ? 'ollama' : (claudeEnabled ? 'claude' : 'offline');
  return {
    activeProvider,
    preferredProvider: AI_PROVIDER,
    aiEnabled: activeProvider !== 'offline',
    ollama,
    claudeEnabled,
    claudeModel: CLAUDE_MODEL,
  };
}

async function pullOllamaModel() {
  const status = await getOllamaStatus(true);
  if (!status.installed) throw new Error('Сначала установите Ollama на этот компьютер');
  const response = await ollamaRequest('/api/pull', 'POST', { model: OLLAMA_MODEL, stream: false }, 30 * 60 * 1000);
  ollamaStatusCache = { checkedAt: 0, value: null };
  return response;
}

// Facts (dates, priority, people, platform, questions) come from the built-in analyzer instantly.
// A language model only polishes the creative part afterwards (see aiEnrich): local models invent dates and prices.
async function aiParse(text, refUrl, source, defaultProjectId) {
  const base = Parser.parse(text, { projects: db.projects, users: db.users.map(u => ({ id: u.id, name: u.name, role: u.role, active: u.active })), source: source || 'text', defaultProjectId });
  base.brandContext = projectBrandContext(findProject(base.projectId));
  if (safeUrl(refUrl)) base.refs.unshift({ url: safeUrl(refUrl), note: 'Референс — адаптировать под бренд' });
  const aiStatus = await getAiStatus();
  base.aiAvailable = aiStatus.aiEnabled;
  base.aiProvider = aiStatus.activeProvider;
  return base;
}

async function aiEnrich(text, parsed) {
  const aiStatus = await getAiStatus();
  if (!aiStatus.aiEnabled) throw new Error('AI не подключён');
  const project = findProject(parsed.projectId);
  const prompt =
`Ты — креативный ассистент SMM-команды Turon (телеком, Узбекистан). Ниже ТЗ от SMM-менеджера (может быть на русском или узбекском, надиктовано голосом, с ошибками распознавания) и уже извлечённые факты.
Верни СТРОГО валидный JSON без markdown, все тексты по-русски:
{"ideas": ["3 разных творческих приёма для этого ТЗ: что показать в кадре или на макете, как подать тему. Не слоганы и не призывы. Каждый до 15 слов"], "hook": "цепляющая первая фраза или первый кадр, до 12 слов", "questions": ["0–2 важных уточняющих вопроса, которых нет в списке ниже"]}

Правила: НЕ придумывай цены, проценты, скидки, даты, платформы, имена и факты, которых нет в ТЗ. Если тема ТЗ не указана — делай идеи общими для формата, а в questions спроси тему.

Проект: ${project.name}. Правила бренда: ${projectBrandContext(project) || 'не заданы'}
Формат: ${parsed.format}. Платформа: ${parsed.platform}. Исполнители: ${safeArr(parsed.roles).join(', ')}.
Уже заданные вопросы: ${safeArr(parsed.missing).join('; ') || 'нет'}
ТЗ: """${text}"""`;
  const raw = aiStatus.activeProvider === 'ollama' ? await callOllama(prompt, 350) : await callClaude(readAiKey(), prompt);
  const ai = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  const short = (x, len) => { const t = sanitizeStr(x, 1000); return t.length <= len ? t : t.slice(0, len).replace(/\s+\S*$/, '') + '…'; };
  const clean = (arr, n, len) => safeArr(arr).map(x => short(x, len)).filter(x => x.length > 3).slice(0, n);
  return {
    ideas: clean(ai.ideas, 3, 160),
    hook: short(ai.hook, 140),
    questions: clean(ai.questions, 2, 200),
    engine: aiStatus.activeProvider,
  };
}

function normalizeTaskBody(body, existing = {}) {
  const roles = uniq(safeArr(body.roles).filter(r => ROLES.includes(r) && r !== 'smm'));
  const projectId = db.projects.some(p => p.id === body.projectId) ? body.projectId : (existing.projectId || db.projects[0].id);
  const brandContext = projectBrandContext(findProject(projectId));
  return {
    title: sanitizeStr(body.title || existing.title || 'Новое ТЗ', 160),
    projectId,
    brandContext,
    platform: sanitizeStr(body.platform || existing.platform || 'Instagram', 60),
    format: sanitizeStr(body.format || existing.format || 'Свободный формат', 120),
    location: sanitizeStr(body.location || existing.location || '', 120),
    deadline: body.deadline === null ? null : isoOrNull(body.deadline || existing.deadline),
    publishDate: body.publishDate === null ? null : isoOrNull(body.publishDate || existing.publishDate),
    priority: ['high','med','low'].includes(body.priority) ? body.priority : (existing.priority || 'med'),
    roles: roles.length ? roles : (existing.roles || ['design']),
    assigneeIds: body.assigneeIds === undefined
      ? safeArr(existing.assigneeIds)
      : uniq(safeArr(body.assigneeIds).filter(id => db.users.some(u => u.id === id && u.active !== false))),
    description: sanitizeStr(body.description || existing.description || '', 1500),
    bullets: safeArr(body.bullets || existing.bullets).map(x => sanitizeStr(x, 400)).filter(Boolean).slice(0, 12),
    checklist: safeArr(body.checklist || existing.checklist).map(x => typeof x === 'string' ? { id: uid('c'), text: sanitizeStr(x, 250), done: false } : { id: x.id || uid('c'), text: sanitizeStr(x.text, 250), done: !!x.done }).filter(x => x.text).slice(0, 16),
    refs: safeArr(body.refs || existing.refs).map(r => ({ url: safeUrl(r && r.url), note: sanitizeStr(r && r.note, 240) })).filter(r => r.url).slice(0, 10),
    ideas: safeArr(body.ideas || existing.ideas).map(x => sanitizeStr(x, 360)).filter(Boolean).slice(0, 10),
    missing: safeArr(body.missing || existing.missing).map(x => sanitizeStr(x, 260)).filter(Boolean).slice(0, 8),
    hook: sanitizeStr(body.hook || existing.hook || '', 240),
    cta: sanitizeStr(body.cta || existing.cta || '', 200),
  };
}

const SOURCES = ['text', 'voice', 'telegram', 'recurring', 'template'];
// People a task is addressed to: the named assignees, or everyone active in its roles.
function newTaskAudience(t) { return uniq(safeArr(t.assigneeIds).length ? t.assigneeIds : usersForRoles(safeArr(t.roles))); }
function createTask(body, user, activityNote = '') {
  const data = normalizeTaskBody(body);
  const now = new Date().toISOString();
  const status = body.status && STATUS.includes(body.status) ? body.status : 'new';
  const t = Object.assign({ id: uid('t'), status, createdAt: now, updatedAt: now, createdBy: user.id, source: SOURCES.includes(body.source) ? body.source : 'text', files: [], chat: [], activity: [] }, data);
  addActivity(t, user, 'created', activityNote || (status === 'draft' ? 'Черновик ТЗ' : 'TZ yaratildi va ijrochilarga yuborildi'));
  db.tasks.unshift(t);
  if (status !== 'draft') notifyUsers(newTaskAudience(t), 'Новое ТЗ', t.title, t.id, '🆕');
  persist();
  return t;
}

async function handleRawUpload(req, res, url, user, taskId) {
  const t = db.tasks.find(x => x.id === taskId);
  if (!t || !canSeeTask(user, t)) { req.resume(); return send(res, 404, { error: 'TZ topilmadi' }); }
  const name = sanitizeStr(url.searchParams.get('name'), 180).replace(/[\\/]/g, '_') || 'file';
  const kind = url.searchParams.get('kind') === 'reference' ? 'reference' : 'work';
  const limit = storageUsesSupabase() ? Math.min(MAX_UPLOAD_BYTES, SUPABASE_MAX_FILE_BYTES) : MAX_UPLOAD_BYTES;
  let upload;
  try { upload = await receiveUpload(req, limit); }
  catch (e) {
    if (e.status !== 413) throw e;
    res.setHeader('connection', 'close');
    return send(res, 413, { error: `Файл больше ${Math.round(limit / 1048576)} МБ` });
  }
  if (!upload.size) { fs.unlink(upload.tmpPath, () => {}); return send(res, 400, { error: 'Пустой файл' }); }
  try { await attachFile(t, user, { name, tmpPath: upload.tmpPath, size: upload.size, kind }); }
  catch (e) { fs.unlink(upload.tmpPath, () => {}); throw e; }
  return send(res, 200, presentTask(t, user));
}

// --- Recurring tasks: a task is copied as a template and re-created on a weekly schedule.
const DAY_RU = ['', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
function normalizeSchedule(body) {
  const days = uniq(safeArr(body.days).map(Number).filter(d => Number.isInteger(d) && d >= 1 && d <= 7)).sort((a, b) => a - b);
  const time = Schedule.parseTime(body.time);
  if (!days.length) return { error: 'Выберите дни недели' };
  if (!time) return { error: 'Укажите время в формате ЧЧ:ММ' };
  const raw = body.deadlineHours;
  const deadlineHours = raw === null || raw === undefined || raw === '' ? null : Number(raw);
  if (deadlineHours !== null && !(deadlineHours >= 1 && deadlineHours <= 720)) return { error: 'Дедлайн: от 1 до 720 часов после создания' };
  const z = n => String(n).padStart(2, '0');
  return { schedule: { days, time: `${z(time.hh)}:${z(time.mi)}` }, deadlineHours };
}
function describeSchedule(s) { return (s.days.length === 7 ? 'каждый день' : s.days.map(d => DAY_RU[d]).join(', ')) + ' в ' + s.time; }
function recurringTemplate(t) {
  const tpl = {};
  ['title', 'projectId', 'platform', 'format', 'location', 'priority', 'roles', 'assigneeIds', 'description', 'bullets', 'refs', 'ideas', 'hook', 'cta']
    .forEach(k => { if (t[k] !== undefined) tpl[k] = JSON.parse(JSON.stringify(t[k])); });
  tpl.checklist = safeArr(t.checklist).map(c => c.text).filter(Boolean);
  return tpl;
}
function presentRecurring(r) {
  const next = r.active === false ? null : Schedule.nextRun(r, r.lastRunAt || r.createdAt);
  return {
    id: r.id, title: r.template.title, projectId: r.template.projectId, roles: safeArr(r.template.roles), assigneeIds: safeArr(r.template.assigneeIds),
    schedule: r.schedule, scheduleText: describeSchedule(r.schedule), deadlineHours: r.deadlineHours, active: r.active !== false,
    sourceTaskId: r.sourceTaskId, lastTaskId: r.lastTaskId, lastRunAt: r.lastRunAt, nextRunAt: next ? next.toISOString() : null, createdAt: r.createdAt,
  };
}
function runRecurring(rule, now) {
  // Missed runs collapse into one: the next run is counted from now.
  rule.lastRunAt = new Date(now).toISOString();
  const creator = [db.users.find(u => u.id === rule.createdBy), ...db.users].find(u => u && canManage(u));
  if (!creator) return null;
  const deadline = rule.deadlineHours ? new Date(now + rule.deadlineHours * 3600e3).toISOString() : null;
  const t = createTask({ ...rule.template, deadline, publishDate: null, status: 'new', source: 'recurring' }, creator, 'Создано автоматически: ' + describeSchedule(rule.schedule));
  rule.lastTaskId = t.id;
  return t;
}

// --- Scheduler: deadline reminders, recurring tasks and once-a-day jobs.
function sendReminder(t, kind) {
  const executors = newTaskAudience(t);
  if (kind === 'd24') notifyUsers(executors, 'Дедлайн через сутки', t.title, t.id, '⏰');
  if (kind === 'h2') notifyUsers(executors, 'Дедлайн через 2 часа', t.title, t.id, '⏳');
  if (kind === 'overdue') notifyUsers(uniq([...executors, t.createdBy]), 'Дедлайн просрочен', `${t.title} — ${STATUS_RU[t.status] || t.status}`, t.id, '🔥');
}
function schedulerTick(now = Date.now()) {
  let changed = false;
  for (const t of db.tasks) {
    const step = Schedule.reminderStep(t, t.reminders, now);
    if (JSON.stringify(step.state) !== JSON.stringify(t.reminders)) { t.reminders = step.state; changed = true; }
    if (step.send) sendReminder(t, step.send);
  }
  for (const rule of db.recurring) if (Schedule.dueRun(rule, now)) { runRecurring(rule, now); changed = true; }
  if (changed) persist();
  dailyJobs(now).catch(e => console.error('Ежедневные задачи:', e.message));
}
async function dailyJobs(now) {
  const local = Schedule.localParts(now);
  if (db.meta.dailyDate !== local.date) {
    db.meta.dailyDate = local.date;
    pruneTokens();
    checkDiskSpace();
    persist();
  }
  if (local.hh >= BACKUP_HOUR && db.meta.telegramBackupDate !== local.date) {
    db.meta.telegramBackupDate = local.date;
    persist();
    const recipients = db.users.filter(u => canManage(u) && u.backupToTelegram && u.telegramChatId);
    await sendTelegramBackup(recipients, local.date);
  }
}
// The whole database as a file in the managers' Telegram: a copy that survives losing the server.
async function sendTelegramBackup(recipients, date) {
  if (!tg.username || !recipients.length) return 0;
  const snapshot = stateSnapshot();
  snapshot.meta = { ...snapshot.meta, fileSecret: undefined };
  let data = Buffer.from(JSON.stringify(snapshot));
  let name = `turontz-db-${date}.json`;
  if (data.length > 40 * 1024 * 1024) { data = zlib.gzipSync(data); name += '.gz'; }
  const caption = `💾 Резервная копия Turon TZ за ${date}\nЗадач: ${db.tasks.length}, сотрудников: ${db.users.length}.\nСами файлы (видео, макеты) в копию не входят — они остаются на сервере. Как восстановить базу из этого файла — в deploy/README.md.`;
  let sent = 0;
  for (const u of recipients) {
    try { await tgSendDocument(u.telegramChatId, name, data, caption); sent++; }
    catch (e) { console.error('Telegram: резервная копия не отправлена —', e.message); }
  }
  return sent;
}
function checkDiskSpace() {
  let free;
  try { const st = fs.statfsSync(UPLOAD_DIR); free = st.bavail * st.bsize; } catch (e) { return; }
  if (free >= LOW_DISK_BYTES) return;
  notifyUsers(db.users.filter(u => canManage(u)).map(u => u.id), 'Мало места на сервере', `Свободно ${(free / 1024 ** 3).toFixed(1)} ГБ. Удалите старые файлы или увеличьте диск, иначе загрузки перестанут работать.`, null, '💽');
}

async function handleApi(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  const m = req.method;
  const user = authUser(req);
  // File links opened in a new tab carry a signature instead of the Authorization header.
  const storedFileMatch = p.match(/^\/api\/files\/([^/]+)\/([^/]+)$/);
  if (storedFileMatch && (m === 'GET' || m === 'HEAD')) {
    const task = db.tasks.find(t => t.id === storedFileMatch[1]);
    const file = task && safeArr(task.files).find(f => f.id === storedFileMatch[2]);
    const viewer = file && fileRequestUser(req, url, task, file);
    if (!viewer || !canSeeTask(viewer, task)) return send(res, 404, { error: 'Файл не найден' });
    return sendStoredFile(req, res, task, file);
  }

  const isPublic = ['/api/health', '/api/register', '/api/login'].includes(p);
  // Nobody can make the server read a large body without being signed in.
  if (!isPublic && !user) return send(res, 401, { error: 'Avval tizimga kiring' });

  // Raw file upload: streamed to disk before any JSON parsing.
  const uploadMatch = p.match(/^\/api\/tasks\/([^/]+)\/upload$/);
  if (uploadMatch && m === 'POST') return handleRawUpload(req, res, url, user, uploadMatch[1]);

  let body = {};
  if (['POST','PATCH','PUT'].includes(m)) body = await readBody(req);

  if (p === '/api/health' && m === 'GET') return send(res, 200, { ok: true, service: 'turon-tz', time: new Date().toISOString(), persistence: hasSupabase() ? (supabaseConnected ? 'supabase' : 'local-fallback') : 'local', storage: storageUsesSupabase() ? 'supabase' : 'local' });

  if (p === '/api/register' && m === 'POST') {
    const name = sanitizeStr(body.name, 80);
    const login = sanitizeStr(body.login, 40).toLowerCase();
    const password = String(body.password || '');
    const role = sanitizeStr(body.role, 20);
    if (name.length < 2) return send(res, 400, { error: 'Ismni kiriting' });
    if (!/^[a-z0-9_.@-]{3,40}$/.test(login)) return send(res, 400, { error: 'Login: latin harflari/raqamlar, minimum 3 belgi' });
    if (passwordError(password)) return send(res, 400, { error: passwordError(password) });
    if (!SELF_REGISTER_ROLES.includes(role)) return send(res, 400, { error: 'Rolni tanlang' });
    if (db.users.some(u => u.login === login)) return send(res, 409, { error: 'Bu login band' });
    const regKey = 'reg|' + clientIp(req);
    if (tooManyAttempts(regKey, 5, 60 * 60e3)) return send(res, 429, { error: 'Слишком много заявок с этого адреса. Попробуйте позже.' });
    countAttempt(regKey);
    const first = !db.users.length;
    const nu = { id: uid('u'), name, login, role, active: first, pending: !first, createdAt: new Date().toISOString() };
    setPassword(nu, password);
    db.users.push(nu);
    if (!first) {
      notifyUsers(db.users.filter(u => canManage(u)).map(u => u.id), 'Новая заявка на вход', `${name} (${login}) хочет войти как «${role}». Подтвердите в разделе «Команда».`, null, '👤');
      persist();
      return send(res, 200, { pending: true, message: 'Заявка отправлена. Войти можно будет после подтверждения SMM-менеджером.' });
    }
    const token = issueToken(nu);
    persist();
    return send(res, 200, { token, user: pubUser(nu) });
  }

  if (p === '/api/login' && m === 'POST') {
    const login = sanitizeStr(body.login, 40).toLowerCase();
    const loginKey = 'login|' + clientIp(req) + '|' + login;
    if (tooManyAttempts(loginKey, 8, 15 * 60e3)) return send(res, 429, { error: 'Слишком много неудачных попыток. Подождите 15 минут.' });
    const x = db.users.find(u => u.login === login);
    if (!x || !checkPw(x, body.password)) { countAttempt(loginKey); return send(res, 401, { error: 'Неверный логин или пароль' }); }
    attempts.delete(loginKey);
    if (x.active === false) return send(res, 403, { error: x.pending ? 'Аккаунт ждёт подтверждения SMM-менеджера' : 'Доступ отключён. Обратитесь к SMM-менеджеру.' });
    const token = issueToken(x); persist();
    return send(res, 200, { token, user: pubUser(x) });
  }

  if (!user) return send(res, 401, { error: 'Avval tizimga kiring' });

  if (p === '/api/logout' && m === 'POST') {
    delete db.tokens[bearer(req)]; persist(); return send(res, 200, { ok: true });
  }
  if (p === '/api/me' && m === 'GET') return send(res, 200, { ...pubUser(user), ...(await getAiStatus()) });
  if (p === '/api/me' && m === 'PATCH') {
    if (body.name !== undefined) { const name = sanitizeStr(body.name, 80); if (name.length < 2) return send(res, 400, { error: 'Ism juda qisqa' }); user.name = name; }
    if (body.newPassword !== undefined) {
      if (!checkPw(user, body.oldPassword)) return send(res, 400, { error: 'Текущий пароль неверный' });
      const pw = String(body.newPassword || '');
      if (passwordError(pw)) return send(res, 400, { error: passwordError(pw) });
      setPassword(user, pw);
      delete user.mustChangePassword;
      revokeTokens(user.id, bearer(req)); // other devices sign in again
    }
    if (body.backupToTelegram !== undefined) {
      if (!canManage(user)) return send(res, 403, { error: 'Только SMM-менеджер' });
      user.backupToTelegram = !!body.backupToTelegram;
    }
    persist(); return send(res, 200, pubUser(user));
  }

  if (p === '/api/users' && m === 'GET') return send(res, 200, db.users.map(pubUser));

  if (p === '/api/admin/summary' && m === 'GET') {
    if (!canManage(user)) return send(res, 403, { error: 'Boshqaruv faqat SMM uchun' });
    const now = Date.now();
    const tasksByUser = db.users.map(u => {
      const assigned = db.tasks.filter(t => safeArr(t.assigneeIds).includes(u.id) || (!safeArr(t.assigneeIds).length && safeArr(t.roles).includes(u.role)));
      const active = assigned.filter(t => !['draft', 'approved', 'published', 'archived'].includes(t.status));
      const overdue = active.filter(t => t.deadline && new Date(t.deadline).getTime() < now);
      return { user: pubUser(u), active: active.length, overdue: overdue.length, review: active.filter(t => t.status === 'submitted').length };
    });
    const activeTasks = db.tasks.filter(t => !['draft', 'approved', 'published', 'archived'].includes(t.status));
    return send(res, 200, {
      totals: {
        users: db.users.filter(u => u.active !== false).length,
        tasks: db.tasks.length,
        active: activeTasks.length,
        overdue: activeTasks.filter(t => t.deadline && new Date(t.deadline).getTime() < now).length,
        review: activeTasks.filter(t => t.status === 'submitted').length,
        unassigned: activeTasks.filter(t => !safeArr(t.assigneeIds).length).length,
      },
      workload: tasksByUser,
      lateTasks: activeTasks.filter(t => t.deadline && new Date(t.deadline).getTime() < now).sort((a, b) => new Date(a.deadline) - new Date(b.deadline)).slice(0, 20).map(t => ({ id: t.id, title: t.title, projectId: t.projectId, deadline: t.deadline, status: t.status })),
      recentActivity: db.tasks.flatMap(t => safeArr(t.activity).map(a => ({ ...a, taskId: t.id, taskTitle: t.title }))).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 30),
    });
  }

  if (p === '/api/admin/users' && m === 'POST') {
    if (!canManage(user)) return send(res, 403, { error: 'Jamoaga odam qo‘shish faqat SMM uchun' });
    const name = sanitizeStr(body.name, 80);
    const login = sanitizeStr(body.login, 40).toLowerCase();
    const password = String(body.password || '');
    const role = sanitizeStr(body.role, 20);
    if (name.length < 2) return send(res, 400, { error: 'Ismni kiriting' });
    if (!/^[a-z0-9_.@-]{3,40}$/.test(login)) return send(res, 400, { error: 'Login: latin harflari/raqamlar, minimum 3 belgi' });
    if (passwordError(password)) return send(res, 400, { error: passwordError(password) });
    if (!ROLES.includes(role)) return send(res, 400, { error: 'Rolni tanlang' });
    if (db.users.some(u => u.login === login)) return send(res, 409, { error: 'Bu login band' });
    // The temporary password is known to the manager, so the person sets their own at first sign-in.
    const nu = { id: uid('u'), name, login, role, active: true, mustChangePassword: true, createdAt: new Date().toISOString() };
    setPassword(nu, password);
    db.users.push(nu);
    persist();
    return send(res, 200, pubUser(nu));
  }

  const userMatch = p.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (userMatch && m === 'PATCH') {
    if (!canManage(user)) return send(res, 403, { error: 'Jamoani boshqarish faqat SMM uchun' });
    const target = db.users.find(u => u.id === userMatch[1]);
    if (!target) return send(res, 404, { error: 'Xodim topilmadi' });
    if (body.name !== undefined) {
      const name = sanitizeStr(body.name, 80);
      if (name.length < 2) return send(res, 400, { error: 'Ism juda qisqa' });
      target.name = name;
    }
    if (body.role !== undefined) {
      const role = sanitizeStr(body.role, 20);
      if (!ROLES.includes(role)) return send(res, 400, { error: 'Rol noto‘g‘ri' });
      target.role = role;
    }
    if (body.active !== undefined) {
      if (target.id === user.id && body.active === false) return send(res, 400, { error: 'O‘zingizni o‘chirib qo‘ya olmaysiz' });
      target.active = !!body.active;
      if (target.active) delete target.pending;
      if (!target.active) revokeTokens(target.id);
    }
    // Forgotten password: the manager sets a temporary one; the person changes it at next sign-in.
    if (body.password !== undefined) {
      const pw = String(body.password || '');
      if (passwordError(pw)) return send(res, 400, { error: passwordError(pw) });
      setPassword(target, pw);
      target.mustChangePassword = target.id !== user.id;
      revokeTokens(target.id, target.id === user.id ? bearer(req) : '');
    }
    persist();
    return send(res, 200, pubUser(target));
  }

  if (p === '/api/projects' && m === 'GET') return send(res, 200, db.projects);
  if (p === '/api/projects' && m === 'POST') {
    if (!canManage(user)) return send(res, 403, { error: 'Faqat SMM loyiha yaratadi' });
    const pr = normalizeProject(body);
    if (pr.name.length < 2) return send(res, 400, { error: 'Loyiha nomini kiriting' });
    db.projects.push(pr); persist(); return send(res, 200, pr);
  }

  const projectMatch = p.match(/^\/api\/projects\/([^/]+)$/);
  if (projectMatch && m === 'GET') {
    const project = db.projects.find(x => x.id === projectMatch[1]);
    return project ? send(res, 200, project) : send(res, 404, { error: 'Loyiha topilmadi' });
  }
  if (projectMatch && m === 'PATCH') {
    if (!canManage(user)) return send(res, 403, { error: 'Loyihani tahrirlash faqat SMM uchun' });
    const index = db.projects.findIndex(x => x.id === projectMatch[1]);
    if (index < 0) return send(res, 404, { error: 'Loyiha topilmadi' });
    const project = normalizeProject(body, db.projects[index]);
    if (project.name.length < 2) return send(res, 400, { error: 'Loyiha nomini kiriting' });
    db.projects[index] = project;
    persist();
    return send(res, 200, project);
  }

  if (p === '/api/templates' && m === 'GET') return send(res, 200, db.templates);
  if (p === '/api/templates' && m === 'POST') {
    if (!canManage(user)) return send(res, 403, { error: 'Shablon yaratish faqat SMM uchun' });
    const template = {
      id: uid('tpl'), name: sanitizeStr(body.name, 100), icon: sanitizeStr(body.icon, 8) || '📝',
      description: sanitizeStr(body.description, 300), brief: sanitizeStr(body.brief, 2200),
      roles: uniq(safeArr(body.roles).filter(r => EXECUTOR_ROLES.includes(r))),
      platform: sanitizeStr(body.platform, 60) || 'Instagram', format: sanitizeStr(body.format, 120) || 'Erkin format',
      priority: ['high', 'med', 'low'].includes(body.priority) ? body.priority : 'med', createdAt: new Date().toISOString(), createdBy: user.id,
    };
    if (template.name.length < 2 || template.brief.length < 8) return send(res, 400, { error: 'Shablon nomi va namunaviy matnini kiriting' });
    if (!template.roles.length) template.roles = ['design'];
    db.templates.unshift(template); persist(); return send(res, 200, template);
  }

  const templateMatch = p.match(/^\/api\/templates\/([^/]+)$/);
  if (templateMatch && m === 'PATCH') {
    if (!canManage(user)) return send(res, 403, { error: 'Shablonni tahrirlash faqat SMM uchun' });
    const template = db.templates.find(x => x.id === templateMatch[1]);
    if (!template) return send(res, 404, { error: 'Shablon topilmadi' });
    ['name', 'icon', 'description', 'brief', 'platform', 'format'].forEach(key => {
      if (body[key] !== undefined) template[key] = sanitizeStr(body[key], key === 'brief' ? 2200 : 300);
    });
    if (body.roles !== undefined) template.roles = uniq(safeArr(body.roles).filter(r => EXECUTOR_ROLES.includes(r)));
    if (body.priority !== undefined && ['high', 'med', 'low'].includes(body.priority)) template.priority = body.priority;
    if (template.name.length < 2 || template.brief.length < 8) return send(res, 400, { error: 'Shablon nomi va namunaviy matnini kiriting' });
    persist(); return send(res, 200, template);
  }
  if (templateMatch && m === 'DELETE') {
    if (!canManage(user)) return send(res, 403, { error: 'Shablonni o‘chirish faqat SMM uchun' });
    if (defaultTemplates.some(x => x.id === templateMatch[1])) return send(res, 400, { error: 'Standart shablonni o‘chirib bo‘lmaydi' });
    const before = db.templates.length;
    db.templates = db.templates.filter(x => x.id !== templateMatch[1]);
    if (db.templates.length === before) return send(res, 404, { error: 'Shablon topilmadi' });
    persist(); return send(res, 200, { ok: true });
  }

  if (p === '/api/ai/status' && m === 'GET') return send(res, 200, await getAiStatus(true));
  if (p === '/api/ai/ollama/pull' && m === 'POST') {
    if (!canManage(user)) return send(res, 403, { error: 'Установить AI-модель может только SMM-менеджер' });
    await pullOllamaModel();
    return send(res, 200, await getAiStatus(true));
  }

  if (p === '/api/ai/parse' && m === 'POST') {
    const text = sanitizeStr(body.text, 4000);
    if (text.length < 5) return send(res, 400, { error: 'Текст ТЗ слишком короткий' });
    const parsed = await aiParse(text, body.refUrl, body.source, sanitizeStr(body.defaultProjectId, 80));
    return send(res, 200, parsed);
  }
  if (p === '/api/ai/enrich' && m === 'POST') {
    if (!canManage(user)) return send(res, 403, { error: 'Только SMM-менеджер' });
    const text = sanitizeStr(body.text, 4000);
    if (text.length < 5) return send(res, 400, { error: 'Текст ТЗ слишком короткий' });
    try { return send(res, 200, await aiEnrich(text, body.parsed || {})); }
    catch (e) { console.error('AI enrich failed:', e.message); return send(res, 502, { error: 'AI не ответил: ' + e.message }); }
  }

  if (p === '/api/admin/report' && m === 'GET') {
    if (!canManage(user)) return send(res, 403, { error: 'Отчёт доступен SMM-менеджеру' });
    const from = Schedule.localDayStart(url.searchParams.get('from'));
    const toDay = Schedule.localDayStart(url.searchParams.get('to'));
    if (!from || !toDay || toDay < from) return send(res, 400, { error: 'Укажите период: from и to в формате ГГГГ-ММ-ДД' });
    return send(res, 200, buildReport(db, from, new Date(toDay.getTime() + 864e5)));
  }

  if (p === '/api/recurring' && m === 'GET') {
    if (!canManage(user)) return send(res, 403, { error: 'Только SMM-менеджер' });
    return send(res, 200, db.recurring.map(presentRecurring));
  }
  if (p === '/api/recurring' && m === 'POST') {
    if (!canManage(user)) return send(res, 403, { error: 'Только SMM-менеджер' });
    const source = db.tasks.find(t => t.id === body.taskId);
    if (!source) return send(res, 404, { error: 'ТЗ не найдено' });
    const schedule = normalizeSchedule(body);
    if (schedule.error) return send(res, 400, { error: schedule.error });
    const now = new Date().toISOString();
    const rule = { id: uid('r'), template: recurringTemplate(source), schedule: schedule.schedule, deadlineHours: schedule.deadlineHours, active: true, createdAt: now, createdBy: user.id, sourceTaskId: source.id, lastRunAt: now, lastTaskId: null };
    db.recurring.push(rule);
    addActivity(source, user, 'recurring', 'Настроен повтор: ' + describeSchedule(rule.schedule));
    persist(); return send(res, 200, presentRecurring(rule));
  }
  const recurringMatch = p.match(/^\/api\/recurring\/([^/]+)$/);
  if (recurringMatch) {
    if (!canManage(user)) return send(res, 403, { error: 'Только SMM-менеджер' });
    const rule = db.recurring.find(r => r.id === recurringMatch[1]);
    if (!rule) return send(res, 404, { error: 'Повтор не найден' });
    if (m === 'DELETE') { db.recurring = db.recurring.filter(r => r.id !== rule.id); persist(); return send(res, 200, { ok: true }); }
    if (m === 'PATCH') {
      if (body.days !== undefined || body.time !== undefined || body.deadlineHours !== undefined) {
        const schedule = normalizeSchedule({ days: body.days ?? rule.schedule.days, time: body.time ?? rule.schedule.time, deadlineHours: body.deadlineHours !== undefined ? body.deadlineHours : rule.deadlineHours });
        if (schedule.error) return send(res, 400, { error: schedule.error });
        rule.schedule = schedule.schedule; rule.deadlineHours = schedule.deadlineHours;
      }
      // Saved from the task itself: later copies follow the task's current text and people.
      const source = body.refreshTemplate && db.tasks.find(t => t.id === rule.sourceTaskId);
      if (source) rule.template = recurringTemplate(source);
      if (body.active !== undefined) {
        rule.active = !!body.active;
        // Resuming starts from now: the runs missed while paused are not created afterwards.
        if (rule.active) rule.lastRunAt = new Date().toISOString();
      }
      persist(); return send(res, 200, presentRecurring(rule));
    }
  }

  if (p === '/api/tasks' && m === 'GET') {
    const result = db.tasks.filter(t => canSeeTask(user, t)).map(t => presentTask(t, user));
    return send(res, 200, result);
  }

  if (p === '/api/tasks' && m === 'POST') {
    if (!canManage(user)) return send(res, 403, { error: 'TZ yaratish huquqi faqat SMMda' });
    return send(res, 200, presentTask(createTask(body, user), user));
  }

  const taskMatch = p.match(/^\/api\/tasks\/([^/]+)(?:\/(chat|files|checklist))?$/);
  if (taskMatch) {
    const t = db.tasks.find(x => x.id === taskMatch[1]);
    const sub = taskMatch[2];
    if (!t || !canSeeTask(user, t)) return send(res, 404, { error: 'TZ topilmadi' });
    const done = () => { persist(); return send(res, 200, presentTask(t, user)); };

    if (!sub && m === 'PATCH') {
      const oldStatus = t.status;
      if (body.status !== undefined) {
        if (!STATUS.includes(body.status)) return send(res, 400, { error: 'Noto‘g‘ri status' });
        if (!canManage(user) && !executorCanSetStatus(t.status, body.status)) return send(res, 403, { error: 'Bu statusni faqat SMM o‘zgartira oladi' });
        t.status = body.status;
      }
      if (canManage(user)) Object.assign(t, normalizeTaskBody(body, t));
      t.updatedAt = new Date().toISOString();
      if (oldStatus !== t.status) {
        addActivity(t, user, 'status', `${oldStatus} → ${t.status}`);
        // A draft that gets sent out is, for the executors, a new task.
        if (oldStatus === 'draft') notifyUsers(newTaskAudience(t), 'Новое ТЗ', t.title, t.id, '🆕');
        else if (t.status !== 'draft') notifyUsers(taskAudience(t, user), 'Статус: ' + (STATUS_RU[t.status] || t.status), `${t.title} — ${user.name}`, t.id, '🔄');
      } else addActivity(t, user, 'updated', 'TZ yangilandi');
      return done();
    }

    if (!sub && m === 'DELETE') {
      if (!canManage(user)) return send(res, 403, { error: 'Faqat SMM o‘chira oladi' });
      db.tasks = db.tasks.filter(x => x.id !== t.id);
      for (const f of safeArr(t.files)) await removeStoredFile(f).catch(e => console.error('Файл не удалён:', e.message));
      persist(); return send(res, 200, { ok: true });
    }

    if (sub === 'chat' && m === 'POST') {
      const text = sanitizeStr(body.text, 1000);
      if (!text) return send(res, 400, { error: 'Xabar bo‘sh' });
      const msg = { id: uid('m'), userId: user.id, text, at: new Date().toISOString() };
      t.chat.push(msg); t.updatedAt = msg.at;
      addActivity(t, user, 'comment', text.slice(0, 80));
      notifyUsers(taskAudience(t, user), 'Комментарий: ' + user.name, `${t.title}: «${text.slice(0, 160)}»`, t.id, '💬');
      return done();
    }

    // Older clients send small files as base64 JSON; the app now uses the streamed /upload endpoint.
    if (sub === 'files' && m === 'POST') {
      const name = sanitizeStr(body.name, 180) || 'file';
      const mdata = String(body.dataUrl || '').match(/^data:([^;]*);base64,(.+)$/);
      if (!mdata) return send(res, 400, { error: 'Неверный формат файла' });
      const buffer = Buffer.from(mdata[2], 'base64');
      if (buffer.length > 8 * 1024 * 1024) return send(res, 400, { error: 'Файл больше 8 МБ — обновите страницу, чтобы загружать большие файлы' });
      await attachFile(t, user, { name, buffer, kind: sanitizeStr(body.kind, 20) });
      return done();
    }

    if (sub === 'files' && m === 'PATCH') {
      const f = (t.files || []).find(x => x.id === body.fileId);
      if (!f) return send(res, 404, { error: 'Файл не найден' });
      const action = sanitizeStr(body.action, 20);
      const label = f.name + (f.version ? ' v' + f.version : '');
      if (action === 'delete') {
        if (f.uploadedBy !== user.id && !canManage(user)) return send(res, 403, { error: 'Удалить может автор файла или SMM' });
        await removeStoredFile(f);
        t.files = t.files.filter(x => x.id !== f.id);
        addActivity(t, user, 'file', `удалён ${f.name}`);
        return done();
      }
      if (!canManage(user)) return send(res, 403, { error: 'Утверждать файлы может только SMM' });
      if (action === 'approve') {
        t.files.forEach(x => { if (x.status === 'approved') x.status = 'pending'; });
        f.status = 'approved'; f.approvedAt = new Date().toISOString();
        const oldStatus = t.status; t.status = 'approved';
        addActivity(t, user, 'approve', `${label} утверждён`);
        if (oldStatus !== t.status) addActivity(t, user, 'status', `${oldStatus} → approved`);
        notifyUsers(taskAudience(t, user, [f.uploadedBy]), 'Работа утверждена', `${t.title}: ${label}`, t.id, '✅');
      } else if (action === 'revision') {
        f.status = 'revision';
        const note = sanitizeStr(body.note, 500);
        const oldStatus = t.status; t.status = 'revision';
        if (note) t.chat.push({ id: uid('m'), userId: user.id, text: 'Правки к ' + (f.version ? 'v' + f.version : f.name) + ': ' + note, at: new Date().toISOString() });
        addActivity(t, user, 'revision', `${label} — на доработку`);
        if (oldStatus !== t.status) addActivity(t, user, 'status', `${oldStatus} → revision`);
        notifyUsers(taskAudience(t, user, [f.uploadedBy]), 'Нужны правки', `${t.title}: ${note || label}`, t.id, '✏️');
      } else return send(res, 400, { error: 'Неизвестное действие' });
      t.updatedAt = new Date().toISOString();
      return done();
    }

    if (sub === 'checklist' && m === 'PATCH') {
      const item = t.checklist.find(x => x.id === body.id);
      if (!item) return send(res, 404, { error: 'Пункт чек-листа не найден' });
      item.done = !!body.done; t.updatedAt = new Date().toISOString();
      addActivity(t, user, 'checklist', item.text + (item.done ? ' ✓' : ''));
      return done();
    }
  }

  if (p === '/api/notifications' && m === 'GET') {
    return send(res, 200, db.notifications.filter(n => n.userId === user.id).slice(0, 100));
  }
  if (p === '/api/notifications/read' && m === 'POST') {
    db.notifications.filter(n => n.userId === user.id).forEach(n => n.read = true); persist(); return send(res, 200, { ok: true });
  }

  if (p === '/api/telegram/status' && m === 'GET') {
    return send(res, 200, { configured: !!tg.username, botUsername: tg.username, error: tg.error, linked: !!user.telegramChatId, linkedAs: user.telegramName || '' });
  }
  if (p === '/api/telegram/config' && m === 'POST') {
    if (!canManage(user)) return send(res, 403, { error: 'Подключить бота может только SMM-менеджер' });
    const token = sanitizeStr(body.token, 120);
    if (!/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(token)) return send(res, 400, { error: 'Это не похоже на токен бота. Скопируйте его из @BotFather целиком.' });
    try { await tgApi(token, 'getMe'); } catch (e) { return send(res, 400, { error: 'Telegram не принял токен: ' + e.message }); }
    fs.writeFileSync(TG_FILE, JSON.stringify({ token }, null, 2));
    await startTelegram(token);
    return send(res, 200, { configured: !!tg.username, botUsername: tg.username, error: tg.error });
  }
  if (p === '/api/telegram/config' && m === 'DELETE') {
    if (!canManage(user)) return send(res, 403, { error: 'Отключить бота может только SMM-менеджер' });
    try { fs.unlinkSync(TG_FILE); } catch (e) {}
    await startTelegram('');
    return send(res, 200, { configured: false });
  }
  if (p === '/api/telegram/backup' && m === 'POST') {
    if (!canManage(user)) return send(res, 403, { error: 'Только SMM-менеджер' });
    if (!tg.username) return send(res, 400, { error: 'Telegram-бот ещё не подключён' });
    if (!user.telegramChatId) return send(res, 400, { error: 'Сначала подключите свой Telegram в профиле' });
    const sent = await sendTelegramBackup([user], Schedule.localParts(Date.now()).date);
    return sent ? send(res, 200, { ok: true }) : send(res, 502, { error: 'Telegram не принял файл, попробуйте позже' });
  }
  if (p === '/api/telegram/link' && m === 'POST') {
    if (!tg.username) return send(res, 400, { error: 'Telegram-бот ещё не подключён' });
    const code = crypto.randomBytes(9).toString('base64url');
    tg.codes.set(code, { userId: user.id, expires: Date.now() + 15 * 60e3 });
    return send(res, 200, { url: `https://t.me/${tg.username}?start=${code}` });
  }
  if (p === '/api/telegram/unlink' && m === 'POST') {
    delete user.telegramChatId; delete user.telegramName; persist();
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'API topilmadi' });
}

// Only the app itself is public: db.json, backups, uploads, keys and tokens in this folder are never served.
// Uploaded files go through /api/files/…, which checks who is asking.
const PUBLIC_FILES = new Set(['/index.html', '/app.js', '/styles.css', '/creative-os.css', '/favicon.ico', '/manifest.webmanifest', '/sw.js', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png', '/icons/apple-touch-icon.png']);
// The page may run only its own scripts: injected markup or a javascript: link does nothing.
const APP_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; manifest-src 'self'; worker-src 'self'";
function serveStatic(req, res) {
  let file;
  try { file = decodeURIComponent(req.url.split('?')[0]); } catch (e) { return sendText(res, 400, 'Bad request'); }
  if (file === '/') file = '/index.html';
  if (!PUBLIC_FILES.has(file)) return sendText(res, 404, 'Not found');
  const full = path.join(ROOT, path.normalize(file));
  if (!full.startsWith(ROOT)) return sendText(res, 403, 'Forbidden');
  fs.readFile(full, (err, data) => {
    if (err) return sendText(res, 404, 'Not found');
    const ext = path.extname(full).toLowerCase();
    const headers = { 'content-type': file === '/manifest.webmanifest' ? 'application/manifest+json' : (MIME[ext] || 'application/octet-stream') };
    if (['.html', '.js', '.css', '.webmanifest'].includes(ext)) headers['cache-control'] = 'no-store';
    if (ext === '.html') headers['content-security-policy'] = APP_CSP;
    res.writeHead(200, headers);
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (/^https:/i.test(process.env.PUBLIC_URL || '')) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  if (req.url.startsWith('/api/')) {
    handleApi(req, res).catch(e => {
      console.error(e);
      send(res, e.message === 'too_large' ? 413 : 500, { error: e.message === 'too_large' ? 'Ma’lumot juda katta' : 'Server xatosi' });
    });
  } else serveStatic(req, res);
});

// Large videos over a slow connection take a while: allow up to an hour per request.
server.requestTimeout = 60 * 60e3;

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.log('');
    console.log('Turon TZ уже запущен в другом окне — второй раз запускать не нужно.');
    console.log('Откройте в браузере: http://localhost:' + PORT);
    console.log('Если приложение ведёт себя странно — закройте ВСЕ чёрные окна сервера и запустите start.bat один раз.');
  } else {
    console.error('Ошибка сервера:', e.message);
  }
});

async function start() {
  if (hasSupabase()) {
    try {
      const loaded = await hydrateFromSupabase();
      console.log(loaded ? 'Supabase: ma’lumotlar yuklandi.' : 'Supabase: yangi saqlash qatlami yaratildi.');
    } catch (e) {
      console.error('Supabase ulanmagan, local db ishlatiladi:', e.message);
    }
  }
  server.listen(PORT, process.env.HOST || '0.0.0.0', () => {
    console.log('\nTuron TZ ishga tushdi: http://localhost:' + PORT);
    for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === 'IPv4' && !i.internal) console.log('Wi‑Fi ichida ochish: http://' + i.address + ':' + PORT);
    console.log(hasSupabase() ? 'Saqlash: Supabase.' : 'Saqlash: local db.json.');
    console.log('Server oynasini yopmang.\n');
  });
  startTelegram(loadTelegramToken());
  const tick = () => { try { schedulerTick(); } catch (e) { console.error('Планировщик:', e); } };
  setTimeout(tick, 5000).unref();
  setInterval(tick, Number(process.env.TURON_SCHEDULER_MS || 60e3)).unref();
}
start();
