/* Turon TZ — production-style local MVP server.
   No external dependencies. Start: node server.js or start.bat */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const Parser = require('./parser_engine');

// 3456 can be occupied by the desktop preview runtime, so the local app uses a stable free port.
const PORT = process.env.PORT || 3457;
const ROOT = __dirname;
const DB_FILE = process.env.TURON_DB_FILE || path.join(ROOT, 'db.json');
const UPLOAD_DIR = process.env.TURON_UPLOAD_DIR || path.join(ROOT, 'uploads');

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
  const base = { users: [], tokens: {}, projects: defaultProjects, tasks: [], notifications: [], templates: defaultTemplates };
  const next = Object.assign(base, candidate || {});
  if (!Array.isArray(next.projects) || !next.projects.length) next.projects = defaultProjects;
  if (!Array.isArray(next.notifications)) next.notifications = [];
  if (!Array.isArray(next.templates) || !next.templates.length) next.templates = defaultTemplates;
  if (!Array.isArray(next.users)) next.users = [];
  if (!Array.isArray(next.tasks)) next.tasks = [];
  if (!next.tokens || typeof next.tokens !== 'object') next.tokens = {};
  next.users.forEach(u => { if (u.active === undefined) u.active = true; });
  return next;
}

// Local backups of db.json: one on every start and every few hours, the newest 30 are kept.
const BACKUP_DIR = path.join(ROOT, 'backups');
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
    const broken = path.join(ROOT, `db.broken-${Date.now()}.json`);
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
function pubUser(u) { return { id: u.id, name: u.name, login: u.login, role: u.role, active: u.active !== false, pending: !!u.pending, createdAt: u.createdAt, avatar: u.avatar || '', telegramLinked: !!u.telegramChatId }; }
function send(res, code, obj) { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); }
function sendText(res, code, txt) { res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' }); res.end(txt); }
function sanitizeStr(v, n = 300) { return String(v || '').trim().slice(0, n); }
function safeArr(a) { return Array.isArray(a) ? a : []; }
function stripPrivateTask(t) { return JSON.parse(JSON.stringify(t)); }
function canManage(user) { return user && ['smm', 'admin'].includes(user.role) && user.active !== false; }
function canSeeTask(user, t) { return canManage(user) || safeArr(t.roles).includes(user.role) || safeArr(t.assigneeIds).includes(user.id); }
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
const TG_FILE = path.join(ROOT, 'telegram.json');
const tg = { token: '', username: '', error: '', generation: 0, offset: 0, codes: new Map() };
function escHtml(v) { return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function loadTelegramToken() {
  let token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) { try { token = String(JSON.parse(fs.readFileSync(TG_FILE, 'utf8')).token || '').trim(); } catch (e) {} }
  return token;
}
function tgApi(token, method, payload = {}, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request({ hostname: 'api.telegram.org', path: `/bot${token}/${method}`, method: 'POST', timeout, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        let j; try { j = JSON.parse(d); } catch (e) { return reject(new Error('Telegram вернул некорректный ответ')); }
        if (j.ok) resolve(j.result); else reject(Object.assign(new Error(j.description || 'Ошибка Telegram'), { code: j.error_code }));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Telegram не отвечает')));
    req.write(body); req.end();
  });
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
        const updates = await tgApi(tg.token, 'getUpdates', { offset: tg.offset, timeout: 25, allowed_updates: ['message'] }, 35000);
        for (const u of updates) {
          tg.offset = u.update_id + 1;
          if (gen === tg.generation) await handleTelegramMessage(u.message).catch(e => console.error('Telegram:', e.message));
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
function tgSend(chatId, html) {
  if (!tg.token || !tg.username || !chatId) return Promise.resolve();
  return tgApi(tg.token, 'sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true }).catch(e => {
    if (e.code === 403) { // the person blocked the bot
      const u = db.users.find(x => x.telegramChatId === chatId);
      if (u) { delete u.telegramChatId; delete u.telegramName; persist(); }
    } else console.error('Telegram: не отправлено —', e.message);
  });
}
async function handleTelegramMessage(msg) {
  if (!msg || !msg.chat || msg.chat.type !== 'private') return;
  const chatId = msg.chat.id;
  const text = String(msg.text || '').trim();
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
    return tgSend(chatId, `✅ Готово, ${escHtml(user.name)}! Уведомления Turon TZ будут приходить сюда.\nОтключить: /stop`);
  }
  if (/^\/stop/.test(text)) {
    const user = db.users.find(u => u.telegramChatId === chatId);
    if (user) { delete user.telegramChatId; delete user.telegramName; persist(); }
    return tgSend(chatId, 'Уведомления отключены. Подключить снова можно в профиле Turon TZ.');
  }
  const linked = db.users.find(u => u.telegramChatId === chatId);
  return tgSend(chatId, linked
    ? `Вы подключены как ${escHtml(linked.name)}. Сюда приходят уведомления о задачах. Отключить: /stop`
    : 'Это бот уведомлений Turon TZ. Чтобы подключиться, откройте приложение → Профиль → «Подключить Telegram».');
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
    let d = '';
    req.on('data', c => { d += c; if (d.length > MAX_BODY) { req.destroy(); reject(new Error('too_large')); } });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { resolve({}); } });
    req.on('error', reject);
  });
}
// Brute-force guard: too many failed logins (or sign-ups) from one address are paused for a while.
const attempts = new Map();
function clientIp(req) {
  const direct = req.socket.remoteAddress || '';
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(direct) && fwd ? fwd : direct;
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
function authUser(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || new URL(req.url, 'http://localhost').searchParams.get('access_token') || '';
  const id = db.tokens[token];
  const user = db.users.find(u => u.id === id) || null;
  return user && user.active !== false ? user : null;
}

function safeMime(v) { return sanitizeStr(v, 100).replace(/[^a-zA-Z0-9.+\-/]/g, '') || 'application/octet-stream'; }
async function storeUploadedFile(task, fileId, fileName, buffer, type) {
  const ext = path.extname(fileName).replace(/[^.a-zA-Z0-9]/g, '').slice(0, 10) || '.' + (safeMime(type).split('/')[1] || 'bin').split(';')[0];
  if (storageUsesSupabase()) {
    const storageKey = `tasks/${task.id}/${fileId}${ext}`;
    const remote = await supabaseRequest(`/storage/v1/object/${remotePath(SUPABASE_STORAGE_BUCKET, storageKey)}`, 'POST', buffer, { 'content-type': safeMime(type), 'x-upsert': 'true' }, 60000);
    if (remote.status < 200 || remote.status >= 300) throw new Error(`Supabase Storage javobi: ${remote.status} ${remote.body.toString('utf8').slice(0, 240)}`);
    supabaseConnected = true;
    return { url: `/api/files/${task.id}/${fileId}`, storageKey, localName: null };
  }
  const localName = fileId + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, localName), buffer);
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
async function sendStoredFile(res, task, file) {
  if (file.storageKey && hasSupabase()) {
    const remote = await supabaseRequest(`/storage/v1/object/authenticated/${remotePath(SUPABASE_STORAGE_BUCKET, file.storageKey)}`, 'GET', null, {}, 60000);
    if (remote.status < 200 || remote.status >= 300) return sendText(res, remote.status || 404, 'File not found');
    supabaseConnected = true;
    res.writeHead(200, { 'content-type': safeMime(file.type), 'content-length': remote.body.length, 'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.name || 'file')}`, 'cache-control': 'private, max-age=300' });
    return res.end(remote.body);
  }
  const localName = sanitizeStr(file.localName || path.basename(String(file.url || '')), 220);
  if (!localName || !/^[a-zA-Z0-9._-]+$/.test(localName)) return sendText(res, 404, 'File not found');
  fs.readFile(path.join(UPLOAD_DIR, localName), (err, data) => {
    if (err) return sendText(res, 404, 'File not found');
    res.writeHead(200, { 'content-type': safeMime(file.type), 'content-length': data.length, 'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.name || 'file')}`, 'cache-control': 'private, max-age=300' });
    res.end(data);
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
  if (refUrl) base.refs.unshift({ url: sanitizeStr(refUrl, 500), note: 'Референс — адаптировать под бренд' });
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
    deadline: body.deadline === null ? null : (body.deadline || existing.deadline || null),
    publishDate: body.publishDate === null ? null : (body.publishDate || existing.publishDate || null),
    priority: ['high','med','low'].includes(body.priority) ? body.priority : (existing.priority || 'med'),
    roles: roles.length ? roles : (existing.roles || ['design']),
    assigneeIds: body.assigneeIds === undefined
      ? safeArr(existing.assigneeIds)
      : uniq(safeArr(body.assigneeIds).filter(id => db.users.some(u => u.id === id && u.active !== false))),
    description: sanitizeStr(body.description || existing.description || '', 1500),
    bullets: safeArr(body.bullets || existing.bullets).map(x => sanitizeStr(x, 400)).filter(Boolean).slice(0, 12),
    checklist: safeArr(body.checklist || existing.checklist).map(x => typeof x === 'string' ? { id: uid('c'), text: sanitizeStr(x, 250), done: false } : { id: x.id || uid('c'), text: sanitizeStr(x.text, 250), done: !!x.done }).filter(x => x.text).slice(0, 16),
    refs: safeArr(body.refs || existing.refs).map(r => ({ url: sanitizeStr(r.url, 500), note: sanitizeStr(r.note, 240) })).filter(r => r.url).slice(0, 10),
    ideas: safeArr(body.ideas || existing.ideas).map(x => sanitizeStr(x, 360)).filter(Boolean).slice(0, 10),
    missing: safeArr(body.missing || existing.missing).map(x => sanitizeStr(x, 260)).filter(Boolean).slice(0, 8),
    hook: sanitizeStr(body.hook || existing.hook || '', 240),
    cta: sanitizeStr(body.cta || existing.cta || '', 200),
  };
}

async function handleApi(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  const m = req.method;
  const user = authUser(req);
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
    if (password.length < 4) return send(res, 400, { error: 'Parol minimum 4 belgi' });
    if (!SELF_REGISTER_ROLES.includes(role)) return send(res, 400, { error: 'Rolni tanlang' });
    if (db.users.some(u => u.login === login)) return send(res, 409, { error: 'Bu login band' });
    const regKey = 'reg|' + clientIp(req);
    if (tooManyAttempts(regKey, 5, 60 * 60e3)) return send(res, 429, { error: 'Слишком много заявок с этого адреса. Попробуйте позже.' });
    countAttempt(regKey);
    const salt = crypto.randomBytes(8).toString('hex');
    const first = !db.users.length;
    const nu = { id: uid('u'), name, login, role, active: first, pending: !first, salt, pass: hashPw(password, salt), createdAt: new Date().toISOString() };
    db.users.push(nu);
    if (!first) {
      notifyUsers(db.users.filter(u => canManage(u)).map(u => u.id), 'Новая заявка на вход', `${name} (${login}) хочет войти как «${role}». Подтвердите в разделе «Команда».`, null, '👤');
      persist();
      return send(res, 200, { pending: true, message: 'Заявка отправлена. Войти можно будет после подтверждения SMM-менеджером.' });
    }
    const token = crypto.randomBytes(28).toString('hex'); db.tokens[token] = nu.id;
    persist();
    return send(res, 200, { token, user: pubUser(nu) });
  }

  if (p === '/api/login' && m === 'POST') {
    const login = sanitizeStr(body.login, 40).toLowerCase();
    const loginKey = 'login|' + clientIp(req) + '|' + login;
    if (tooManyAttempts(loginKey, 8, 15 * 60e3)) return send(res, 429, { error: 'Слишком много неудачных попыток. Подождите 15 минут.' });
    const x = db.users.find(u => u.login === login);
    if (!x || hashPw(String(body.password || ''), x.salt) !== x.pass) { countAttempt(loginKey); return send(res, 401, { error: 'Неверный логин или пароль' }); }
    attempts.delete(loginKey);
    if (x.active === false) return send(res, 403, { error: x.pending ? 'Аккаунт ждёт подтверждения SMM-менеджера' : 'Доступ отключён. Обратитесь к SMM-менеджеру.' });
    const token = crypto.randomBytes(28).toString('hex'); db.tokens[token] = x.id; persist();
    return send(res, 200, { token, user: pubUser(x) });
  }

  if (!user) return send(res, 401, { error: 'Avval tizimga kiring' });

  if (p === '/api/logout' && m === 'POST') {
    const t = String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''); delete db.tokens[t]; persist(); return send(res, 200, { ok: true });
  }
  if (p === '/api/me' && m === 'GET') return send(res, 200, { ...pubUser(user), ...(await getAiStatus()) });
  if (p === '/api/me' && m === 'PATCH') {
    if (body.name !== undefined) { const name = sanitizeStr(body.name, 80); if (name.length < 2) return send(res, 400, { error: 'Ism juda qisqa' }); user.name = name; }
    if (body.newPassword) { if (hashPw(String(body.oldPassword || ''), user.salt) !== user.pass) return send(res, 400, { error: 'Eski parol noto‘g‘ri' }); user.pass = hashPw(String(body.newPassword), user.salt); }
    persist(); return send(res, 200, pubUser(user));
  }

  if (p === '/api/users' && m === 'GET') return send(res, 200, db.users.map(pubUser));

  if (p === '/api/admin/summary' && m === 'GET') {
    if (!canManage(user)) return send(res, 403, { error: 'Boshqaruv faqat SMM uchun' });
    const now = Date.now();
    const tasksByUser = db.users.map(u => {
      const assigned = db.tasks.filter(t => safeArr(t.assigneeIds).includes(u.id) || (!safeArr(t.assigneeIds).length && safeArr(t.roles).includes(u.role)));
      const active = assigned.filter(t => !['approved', 'published', 'archived'].includes(t.status));
      const overdue = active.filter(t => t.deadline && new Date(t.deadline).getTime() < now);
      return { user: pubUser(u), active: active.length, overdue: overdue.length, review: active.filter(t => t.status === 'submitted').length };
    });
    const activeTasks = db.tasks.filter(t => !['approved', 'published', 'archived'].includes(t.status));
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
      lateTasks: activeTasks.filter(t => t.deadline && new Date(t.deadline).getTime() < now).sort((a, b) => new Date(a.deadline) - new Date(b.deadline)).slice(0, 20),
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
    if (password.length < 4) return send(res, 400, { error: 'Vaqtinchalik parol minimum 4 belgi' });
    if (!ROLES.includes(role)) return send(res, 400, { error: 'Rolni tanlang' });
    if (db.users.some(u => u.login === login)) return send(res, 409, { error: 'Bu login band' });
    const salt = crypto.randomBytes(8).toString('hex');
    const nu = { id: uid('u'), name, login, role, active: true, salt, pass: hashPw(password, salt), createdAt: new Date().toISOString() };
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
      if (!target.active) Object.keys(db.tokens).forEach(key => { if (db.tokens[key] === target.id) delete db.tokens[key]; });
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

  const storedFileMatch = p.match(/^\/api\/files\/([^/]+)\/([^/]+)$/);
  if (storedFileMatch && m === 'GET') {
    const task = db.tasks.find(t => t.id === storedFileMatch[1]);
    if (!task || !canSeeTask(user, task)) return send(res, 404, { error: 'Файл не найден' });
    const file = safeArr(task.files).find(f => f.id === storedFileMatch[2]);
    if (!file) return send(res, 404, { error: 'Файл не найден' });
    return sendStoredFile(res, task, file);
  }

  if (p === '/api/tasks' && m === 'GET') {
    const result = db.tasks.filter(t => canSeeTask(user, t)).map(stripPrivateTask);
    return send(res, 200, result);
  }

  if (p === '/api/tasks' && m === 'POST') {
    if (!canManage(user)) return send(res, 403, { error: 'TZ yaratish huquqi faqat SMMda' });
    const data = normalizeTaskBody(body);
    const now = new Date().toISOString();
    const t = Object.assign({ id: uid('t'), status: body.status && STATUS.includes(body.status) ? body.status : 'new', createdAt: now, updatedAt: now, createdBy: user.id, source: body.source || 'text', files: [], chat: [], activity: [] }, data);
    addActivity(t, user, 'created', 'TZ yaratildi va ijrochilarga yuborildi');
    db.tasks.unshift(t);
    const target = uniq(t.assigneeIds.length ? t.assigneeIds : usersForRoles(t.roles));
    notifyUsers(target, 'Новое ТЗ', t.title, t.id, '🆕');
    persist(); return send(res, 200, t);
  }

  const taskMatch = p.match(/^\/api\/tasks\/([^/]+)(?:\/(chat|files|checklist))?$/);
  if (taskMatch) {
    const t = db.tasks.find(x => x.id === taskMatch[1]);
    const sub = taskMatch[2];
    if (!t || !canSeeTask(user, t)) return send(res, 404, { error: 'TZ topilmadi' });

    if (!sub && m === 'PATCH') {
      const oldStatus = t.status;
      if (body.status !== undefined) {
        if (!STATUS.includes(body.status)) return send(res, 400, { error: 'Noto‘g‘ri status' });
        if (!canManage(user) && !executorCanSetStatus(t.status, body.status)) return send(res, 403, { error: 'Bu statusni faqat SMM o‘zgartira oladi' });
        t.status = body.status;
      }
      if (canManage(user)) Object.assign(t, normalizeTaskBody(body, t));
      if (body.ideas && Array.isArray(body.ideas)) t.ideas = body.ideas.map(x => sanitizeStr(x, 360)).slice(0, 10);
      t.updatedAt = new Date().toISOString();
      if (oldStatus !== t.status) {
        addActivity(t, user, 'status', `${oldStatus} → ${t.status}`);
        notifyUsers(taskAudience(t, user), 'Статус: ' + (STATUS_RU[t.status] || t.status), `${t.title} — ${user.name}`, t.id, '🔄');
      } else addActivity(t, user, 'updated', 'TZ yangilandi');
      persist(); return send(res, 200, t);
    }

    if (!sub && m === 'DELETE') {
      if (!canManage(user)) return send(res, 403, { error: 'Faqat SMM o‘chira oladi' });
      db.tasks = db.tasks.filter(x => x.id !== t.id); persist(); return send(res, 200, { ok: true });
    }

    if (sub === 'chat' && m === 'POST') {
      const text = sanitizeStr(body.text, 1000);
      if (!text) return send(res, 400, { error: 'Xabar bo‘sh' });
      const msg = { id: uid('m'), userId: user.id, text, at: new Date().toISOString() };
      t.chat.push(msg); t.updatedAt = msg.at;
      addActivity(t, user, 'comment', text.slice(0, 80));
      notifyUsers(taskAudience(t, user), 'Комментарий: ' + user.name, `${t.title}: «${text.slice(0, 160)}»`, t.id, '💬');
      persist(); return send(res, 200, t);
    }

    if (sub === 'files' && m === 'POST') {
      const name = sanitizeStr(body.name, 180) || 'file';
      const type = sanitizeStr(body.type, 80) || 'application/octet-stream';
      const dataUrl = String(body.dataUrl || '');
      const mdata = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!mdata) return send(res, 400, { error: 'Неверный формат файла' });
      const buf = Buffer.from(mdata[2], 'base64');
      if (buf.length > 8 * 1024 * 1024) return send(res, 400, { error: 'Файл больше 8 МБ — уменьшите размер' });
      const id = uid('f');
      const stored = await storeUploadedFile(t, id, name, buf, type);
      const version = (t.files || []).length + 1;
      const kind = sanitizeStr(body.kind, 20) === 'reference' ? 'reference' : 'work';
      const f = { id, name, type, size: buf.length, url: stored.url, storageKey: stored.storageKey, localName: stored.localName, uploadedBy: user.id, uploadedAt: new Date().toISOString(), version, kind, status: 'pending' };
      t.files.push(f); t.updatedAt = f.uploadedAt;
      addActivity(t, user, 'file', `${name} · v${version}`);
      if (kind !== 'reference' && !canManage(user) && !['submitted', 'approved', 'published'].includes(t.status)) {
        const oldStatus = t.status; t.status = 'submitted';
        if (oldStatus !== t.status) addActivity(t, user, 'status', `${oldStatus} → submitted`);
      }
      notifyUsers(taskAudience(t, user), 'Загружен файл', `${t.title}: ${name} (v${version}) — ${user.name}`, t.id, '📎');
      persist(); return send(res, 200, t);
    }

    if (sub === 'files' && m === 'PATCH') {
      const f = (t.files || []).find(x => x.id === body.fileId);
      if (!f) return send(res, 404, { error: 'Файл не найден' });
      const action = sanitizeStr(body.action, 20);
      if (action === 'delete') {
        if (f.uploadedBy !== user.id && !canManage(user)) return send(res, 403, { error: 'Удалить может автор файла или SMM' });
        await removeStoredFile(f);
        t.files = t.files.filter(x => x.id !== f.id);
        addActivity(t, user, 'file', `удалён ${f.name}`);
        persist(); return send(res, 200, t);
      }
      if (!canManage(user)) return send(res, 403, { error: 'Утверждать файлы может только SMM' });
      if (action === 'approve') {
        t.files.forEach(x => { if (x.status === 'approved') x.status = 'pending'; });
        f.status = 'approved';
        const oldStatus = t.status; t.status = 'approved';
        addActivity(t, user, 'approve', `${f.name} v${f.version} утверждён`);
        if (oldStatus !== t.status) addActivity(t, user, 'status', `${oldStatus} → approved`);
        notifyUsers(taskAudience(t, user, [f.uploadedBy]), 'Работа утверждена', `${t.title}: ${f.name} v${f.version}`, t.id, '✅');
      } else if (action === 'revision') {
        f.status = 'revision';
        const note = sanitizeStr(body.note, 500);
        const oldStatus = t.status; t.status = 'revision';
        if (note) t.chat.push({ id: uid('m'), userId: user.id, text: 'Правки к v' + f.version + ': ' + note, at: new Date().toISOString() });
        addActivity(t, user, 'revision', `${f.name} v${f.version} — на доработку`);
        if (oldStatus !== t.status) addActivity(t, user, 'status', `${oldStatus} → revision`);
        notifyUsers(taskAudience(t, user, [f.uploadedBy]), 'Нужны правки', `${t.title}: ${note || f.name + ' v' + f.version}`, t.id, '✏️');
      } else return send(res, 400, { error: 'Неизвестное действие' });
      t.updatedAt = new Date().toISOString();
      persist(); return send(res, 200, t);
    }

    if (sub === 'checklist' && m === 'PATCH') {
      const item = t.checklist.find(x => x.id === body.id);
      if (!item) return send(res, 404, { error: 'Пункт чек-листа не найден' });
      item.done = !!body.done; t.updatedAt = new Date().toISOString();
      addActivity(t, user, 'checklist', item.text + (item.done ? ' ✓' : ''));
      persist(); return send(res, 200, t);
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

// Only the app itself is public: db.json, backups, keys and tokens in this folder are never served.
const PUBLIC_FILES = new Set(['/index.html', '/app.js', '/styles.css', '/creative-os.css', '/favicon.ico']);
function serveStatic(req, res) {
  let file;
  try { file = decodeURIComponent(req.url.split('?')[0]); } catch (e) { return sendText(res, 400, 'Bad request'); }
  if (file === '/') file = '/index.html';
  if (!PUBLIC_FILES.has(file) && !/^\/uploads\/[a-zA-Z0-9._-]+$/.test(file)) return sendText(res, 404, 'Not found');
  const full = path.join(ROOT, path.normalize(file));
  if (!full.startsWith(ROOT)) return sendText(res, 403, 'Forbidden');
  fs.readFile(full, (err, data) => {
    if (err) return sendText(res, 404, 'Not found');
    const ext = path.extname(full).toLowerCase();
    const headers = { 'content-type': MIME[ext] || 'application/octet-stream' };
    if (ext === '.html' || ext === '.js' || ext === '.css') headers['cache-control'] = 'no-store';
    res.writeHead(200, headers);
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (req.url.startsWith('/api/')) {
    handleApi(req, res).catch(e => {
      console.error(e);
      send(res, e.message === 'too_large' ? 413 : 500, { error: e.message === 'too_large' ? 'Ma’lumot juda katta' : 'Server xatosi' });
    });
  } else serveStatic(req, res);
});

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
}
start();
