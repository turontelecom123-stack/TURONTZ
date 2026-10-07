/* Turon TZ — full local MVP frontend */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const uid = p => p + Date.now().toString(36) + Math.random().toString(16).slice(2, 8);

const ROLES = { smm: 'SMM', admin: 'Администратор', video: 'Видеограф', edit: 'Монтажёр', design: 'Дизайнер' };
const ROLE_BADGE = { smm: 'SMM', admin: 'Админ', video: 'Видео', edit: 'Монтаж', design: 'Дизайн' };
const PRIORITY = { high: 'Срочно', med: 'Обычный', low: 'Не срочно' };
const STATUS = {
  draft: 'Черновик', new: 'Новое', clarify: 'Нужны уточнения', work: 'В работе', waiting: 'Ждёт материалы', submitted: 'На проверке', revision: 'Правки', approved: 'Одобрено', published: 'Опубликовано', archived: 'Архив'
};
const BOARD_COLUMNS = [
  ['new', 'Новые'], ['clarify', 'Уточнения'], ['work', 'В работе'], ['waiting', 'Ждёт материалы'], ['submitted', 'На проверке'], ['revision', 'Правки'], ['approved', 'Готово']
];
const ICONS = {
  plus:'<path d="M12 5v14M5 12h14"/>', board:'<rect x="4" y="5" width="6" height="14" rx="2"/><rect x="14" y="5" width="6" height="9" rx="2"/>', project:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>', cal:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 11h16"/>', bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>', user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6"/>', mic:'<rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M8 21h8M12 17v4"/>', spark:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18.5 15l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7z"/>', send:'<path d="M10 14 21 3"/><path d="M21 3l-6.5 18a.6.6 0 0 1-1.1 0L10 14l-7-3.5a.6.6 0 0 1 0-1.1z"/>', search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>', chat:'<path d="M8 9h8M8 13h5"/><path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4z"/>', file:'<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/>', link:'<path d="M9 15l6-6"/><path d="M11 6l.5-.5a3.5 3.5 0 0 1 5 5L16 11"/><path d="M13 18l-.5.5a3.5 3.5 0 0 1-5-5L8 13"/>', logout:'<path d="M14 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2"/><path d="M9 12h12l-3-3m0 6 3-3"/>', trash:'<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>', upload:'<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 20h16"/>', check:'<path d="m20 6-11 11-5-5"/>', edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>', play:'<path d="M7 4v16l13-8z"/>', pause:'<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>', rocket:'<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2c.9-.9.9-2.3 0-3.2a2.3 2.3 0 0 0-3 .2z"/><path d="M9 11a14 14 0 0 1 8-8c2 0 3 1 3 3a14 14 0 0 1-8 8l-3-3z"/><circle cx="15" cy="9" r="1.2"/>', help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 4.5 1.5c0 1.5-2 2-2 3"/><path d="M12 17h.01"/>'
};
Object.assign(ICONS, {
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  refresh: '<path d="M20 11a8 8 0 1 0 2 5"/><path d="M20 4v7h-7"/>',
  overview: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
  campaign: '<path d="M4 19V5"/><path d="M5 6c5-3 8 3 14 0v9c-6 3-9-3-14 0z"/>',
  factory: '<path d="M4 20V9l5 4V8l5 4V5l5 4v11z"/><path d="M3 20h18"/>',
  assets: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="10" r="1.5"/><path d="m4 17 5-4 3 2 3-3 5 5"/>',
  chart: '<path d="M4 20V4"/><path d="M4 20h17"/><path d="m7 16 4-4 3 2 6-7"/>',
  team: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><path d="M17 11c2.2 0 4-1.7 4-3.8S19.2 3.5 17 3.5"/><path d="M17 14.5c2.8.2 4 2.2 4 5.5"/>',
  arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  dots: '<circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 10h18"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.1 2.1-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-3v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-2.1-2.1.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1h-.2v-3h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2.1-2.1.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5v-.2h3v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.1 2.1-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2v3h-.2a1.7 1.7 0 0 0-1.5 1z"/>',
  template: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
});

const ROLE_HINT = {
  video: 'Снимите материал по ТЗ и загрузите черновой файл. Отметьте пункты чек-листа по мере съёмки.',
  edit: 'Смонтируйте по описанию и референсам. Загрузите версию — SMM проверит и утвердит или вернёт с правками.',
  design: 'Сделайте макет по бренду проекта. Загрузите файл, отметьте чек-лист. Вопросы — в комментариях.'
};
const svg = (n, s=20) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

let token = localStorage.getItem('turontz_token') || '';
let me = null, users = [], projects = [], tasks = [], notifications = [];
let page = localStorage.getItem('turontz_page') || 'dashboard';
let detailId = null;
let authMode = 'login';
let filters = { project: localStorage.getItem('turontz_project') || 'all', role: 'all', priority: 'all', q: '' };
let calCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let calMode = 'deadline';
let composing = { text: '', refUrl: '', parsed: null, files: [] };
let adminSummary = null, adminLoading = false;
let tgStatus = {}, seenNotifications = null;

function setToken(t) { token = t || ''; t ? localStorage.setItem('turontz_token', t) : localStorage.removeItem('turontz_token'); }
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, ms); }
async function api(path, method='GET', body) {
  let res;
  try { res = await fetch(path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); }
  catch(e) { throw new Error('Server ishlamayapti. start.bat ni oching.'); }
  let data = {}; try { data = await res.json(); } catch(e) {}
  if (res.status === 401 && token) { setToken(''); me = null; renderAuth(); throw new Error(data.error || 'Sessiya tugadi'); }
  if (!res.ok) throw new Error(data.error || 'Xatolik ' + res.status);
  return data;
}
async function refresh() {
  [users, projects, tasks, notifications, tgStatus] = await Promise.all([api('/api/users'), api('/api/projects'), api('/api/tasks'), api('/api/notifications'), api('/api/telegram/status').catch(() => ({}))]);
  const fresh = notifications.filter(n => !n.read && seenNotifications && !seenNotifications.has(n.id));
  if (fresh.length) toast('🔔 ' + fresh[0].title + (fresh.length > 1 ? ` и ещё ${fresh.length - 1}` : ''), 4500);
  seenNotifications = new Set(notifications.map(n => n.id));
  document.title = unreadCount() ? `(${unreadCount()}) Turon TZ` : 'Turon TZ';
}
// Links from Telegram look like /#task=ID and open that task right away.
function openTaskFromLink() {
  const m = location.hash.match(/^#task=([\w-]+)/);
  if (!m) return;
  history.replaceState(null, '', location.pathname);
  if (tasks.some(t => t.id === m[1])) { detailId = m[1]; if (!['board', 'dashboard', 'calendar'].includes(page)) page = 'board'; }
}
function go(p) { page = p; localStorage.setItem('turontz_page', p); detailId = null; render(); }
function userById(id) { return users.find(u => u.id === id) || { id, name: 'Сотрудник', role: 'smm' }; }
function projectById(id) { return projects.find(p => p.id === id) || projects[0] || { name: 'Project', color: '#4F46E5' }; }
function initials(name) { return String(name || '?').split(/\s+/).map(w => w[0]).slice(0,2).join('').toUpperCase(); }
function fmtTime(iso) { if (!iso) return '—'; return new Date(iso).toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' }); }
function fmtDate(iso) { if (!iso) return '—'; return new Date(iso).toLocaleDateString('ru-RU', { day:'numeric', month:'short' }); }
function fmtDateFull(iso) { if (!iso) return '—'; return new Date(iso).toLocaleDateString('ru-RU', { weekday:'short', day:'numeric', month:'long' }) + ', ' + fmtTime(iso); }
function inputDateTime(iso) { if (!iso) return ''; const d = new Date(iso), z = n => String(n).padStart(2,'0'); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; }
function fromInputDateTime(v) { return v ? new Date(v).toISOString() : null; }
function sameDay(a,b) { return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function deadlineInfo(iso, status) {
  if (!iso) return { text:'без дедлайна', cls:'muted' };
  const d = new Date(iso), now = new Date();
  const days = Math.round((new Date(d.getFullYear(),d.getMonth(),d.getDate()) - new Date(now.getFullYear(),now.getMonth(),now.getDate())) / 864e5);
  if (days < 0 && !['approved','published','archived'].includes(status)) return { text:'просрочено ' + (-days) + ' д', cls:'danger-txt' };
  if (days === 0) return { text:'сегодня, ' + fmtTime(iso), cls:'warn-txt' };
  if (days === 1) return { text:'завтра, ' + fmtTime(iso), cls:'warn-txt' };
  return { text: fmtDateFull(iso), cls:'muted' };
}
function rolePills(roles) { return (roles||[]).map(r => `<span class="pill role-${r}">${ROLE_BADGE[r] || r}</span>`).join(''); }
function priorityPill(p) { return `<span class="pill pr-${p}">${PRIORITY[p] || p}</span>`; }
function statusPill(s) { return `<span class="pill st-${s}">${STATUS[s] || s}</span>`; }
function assigneePicker(roles, selectedIds = []) {
  const selected = new Set(selectedIds || []);
  const people = users.filter(u => u.active !== false && (roles || []).includes(u.role));
  if (!people.length) return `<p class="muted assignee-empty">Активных исполнителей этой роли пока нет — ТЗ увидят все, кто будет добавлен с этой ролью.</p>`;
  return `<div class="assignee-picker">${people.map(u => `<label class="assignee-option"><input type="checkbox" data-assignee="${u.id}" ${selected.has(u.id) ? 'checked' : ''}><span class="avatar role-${u.role}">${initials(u.name)}</span><span><b>${esc(u.name)}</b><small>${ROLES[u.role]}</small></span></label>`).join('')}</div>`;
}
function unreadCount() { return notifications.filter(n => !n.read).length; }
function isSmm() { return me && ['smm', 'admin'].includes(me.role); }
function filteredTasks() {
  const q = filters.q.trim().toLowerCase();
  return tasks.filter(t =>
    (filters.project === 'all' || t.projectId === filters.project) &&
    (filters.role === 'all' || (t.roles || []).includes(filters.role)) &&
    (filters.priority === 'all' || t.priority === filters.priority) &&
    (!q || [t.title, t.description, t.platform, t.format, projectById(t.projectId).name].join(' ').toLowerCase().includes(q))
  );
}

function projectTasks() { return filters.project === 'all' ? tasks : tasks.filter(t => t.projectId === filters.project); }
function currentProject() { return filters.project === 'all' ? null : projects.find(p => p.id === filters.project) || null; }
function setProject(id) { filters.project = id; try { localStorage.setItem('turontz_project', id); } catch (e) {} }
function activeCount(list) { return list.filter(t => !['draft','approved','published','archived'].includes(t.status)).length; }
// One list of projects, used in the sidebar on desktop and as chips above the board on phones.
function projectSwitcher(cls) {
  const item = (id, name, mark, n) => `<button class="${cls} ${filters.project===id?'on':''}" data-project-pick="${id}">${mark}<span>${esc(name)}</span>${n?`<em>${n}</em>`:''}</button>`;
  return item('all', 'Все проекты', svg('overview',14), activeCount(tasks)) +
    projects.map(p => item(p.id, p.name, `<i style="background:${esc(p.color || '#4F46E5')}"></i>`, activeCount(tasks.filter(t => t.projectId === p.id)))).join('');
}

function layout(content) {
  const manager = isSmm();
  const nav = manager
    ? [['dashboard','Обзор','overview'], ['board','Задачи','board'], ['calendar','Календарь','cal'], ['notifications','Уведомления','bell'], ['admin','Команда','team']]
    : [['dashboard','Обзор','overview'], ['board','Мои задачи','board'], ['calendar','Календарь','cal'], ['notifications','Уведомления','bell'], ['profile','Профиль','user']];
  const mobileNav = manager
    ? [['dashboard','Обзор','overview'], ['board','Задачи','board'], ['newtz','Новое ТЗ','plus'], ['calendar','Календарь','cal'], ['notifications','Уведомления','bell']]
    : nav;
  const badge = k => k === 'notifications' && unreadCount() ? `<em>${unreadCount()}</em>` : '';
  return `<div class="shell ops-shell">
    <aside class="sidebar ops-sidebar">
      <button class="brand brand-button" data-nav="dashboard"><div class="brand-logo">T</div><div><b>Turon TZ</b><span>Turon Telecom</span></div></button>
      ${manager ? `<button class="side-new" data-nav="newtz">${svg('plus',17)} Новое ТЗ</button>` : ''}
      <nav class="primary-nav">${nav.map(([k,l,i]) => `<button class="side-link ${page===k?'on':''}" data-nav="${k}">${svg(i,18)}<span>${l}</span>${badge(k)}</button>`).join('')}</nav>
      <section class="side-projects"><div class="side-projects-head"><span>Проекты</span>${manager ? `<button data-nav="projects" title="Настройки брендов">${svg('settings',14)}</button><button id="side-add-project" title="Новый проект">${svg('plus',14)}</button>` : ''}</div><div class="side-projects-list">${projectSwitcher('side-project')}</div></section>
      <div class="side-user"><div class="avatar role-${me.role}">${initials(me.name)}</div><div><b>${esc(me.name)}</b><span>${ROLES[me.role]}</span></div><button class="side-user-open" data-nav="profile" title="Профиль">${svg('arrow',14)}</button></div>
    </aside>
    <div class="ops-workarea">
      <main class="main ops-main">${content}</main>
    </div>
    <nav class="mobile-tabs ops-mobile-tabs">${mobileNav.map(([k,l,i]) => `<button class="m-tab ${page===k?'on':''}" data-nav="${k}">${svg(i,20)}<span>${l}</span>${badge(k)}</button>`).join('')}</nav>
  </div>`;
}

function renderAuth() {
  document.body.className = 'auth-body';
  const reg = authMode === 'reg';
  $('#app').innerHTML = `<div class="auth-card">
    <div class="logo-xl">T</div>
    <h1>Turon TZ</h1>
    <p>AI yordamida SMM texnik topshiriqlarini ijrochilarga aniq qilib yuborish platformasi</p>
    <div class="seg"><button class="${!reg?'on':''}" id="login-mode">Вход</button><button class="${reg?'on':''}" id="reg-mode">Регистрация</button></div>
    <div class="form-card">
      ${reg?`<label>Имя и фамилия<input id="a-name" placeholder="Азиз Каримов"></label>
      <label>Роль<select id="a-role"><option value="smm">SMM — ставит задачи</option><option value="video">Видеограф</option><option value="edit">Монтажёр</option><option value="design">Дизайнер</option></select></label>`:''}
      <label>Логин<input id="a-login" autocapitalize="none" placeholder="aziz"></label>
      <label>Пароль<input id="a-pass" type="password" placeholder="••••"></label>
    </div>
    <button class="btn primary" id="auth-go">${reg?'Создать аккаунт':'Войти'}</button>
    <small>${reg?"Har bir ijrochi o'z roli bilan kiradi.":"Birinchi marta kirsangiz — регистрация."}</small>
  </div>`;
  $('#login-mode').onclick = () => { authMode = 'login'; renderAuth(); };
  $('#reg-mode').onclick = () => { authMode = 'reg'; renderAuth(); };
  const submit = async () => {
    try {
      const login = $('#a-login').value.trim(); const password = $('#a-pass').value;
      const data = reg ? await api('/api/register','POST',{ name: $('#a-name').value, role: $('#a-role').value, login, password }) : await api('/api/login','POST',{ login, password });
      if (data.pending) { authMode = 'login'; renderAuth(); toast(data.message, 7000); return; }
      setToken(data.token); me = await api('/api/me'); await refresh(); document.body.className = ''; page = isSmm() ? 'dashboard' : 'board'; localStorage.setItem('turontz_page', page); openTaskFromLink(); render(); toast('Добро пожаловать, ' + me.name.split(' ')[0]);
    } catch(e) { toast(e.message); }
  };
  $('#auth-go').onclick = submit; $('#a-pass').onkeydown = e => { if (e.key === 'Enter') submit(); };
}

const PAGES = ['dashboard', 'board', 'newtz', 'calendar', 'notifications', 'profile', 'admin', 'projects'];
function render() {
  if (!me) return renderAuth();
  document.body.className = '';
  if (!PAGES.includes(page)) page = 'board';
  if (filters.project !== 'all' && !projects.some(p => p.id === filters.project)) setProject('all');
  if (!isSmm() && ['newtz', 'admin', 'projects'].includes(page)) page = 'board';
  const html = page === 'dashboard' ? renderDashboard() : page === 'newtz' ? renderNewTZ() : page === 'projects' ? renderProjects() : page === 'admin' ? renderAdmin() : page === 'calendar' ? renderCalendar() : page === 'notifications' ? renderNotifications() : page === 'profile' ? renderProfile() : renderBoard();
  $('#app').innerHTML = layout(html) + (detailId ? renderTaskDrawer(detailId) : '');
  bindGlobal();
  if (page === 'dashboard') bindDashboard();
  if (page === 'newtz') bindNewTZ();
  if (page === 'board') bindBoard();
  if (page === 'projects') bindProjects();
  if (page === 'admin') bindAdmin();
  if (page === 'calendar') bindCalendar();
  if (page === 'notifications') bindNotifications();
  if (page === 'profile') bindProfile();
  if (detailId) bindTaskDrawer(detailId);
}
function bindGlobal() {
  $$('[data-nav]').forEach(b => b.onclick = () => go(b.dataset.nav));
  $$('[data-project-open]').forEach(b => b.onclick = e => { e.stopPropagation(); openProjectModal(b.dataset.projectOpen); });
  $$('[data-project-pick]').forEach(b => b.onclick = () => {
    setProject(b.dataset.projectPick);
    if (!['board', 'calendar'].includes(page)) { page = 'board'; localStorage.setItem('turontz_page', page); }
    detailId = null; render();
  });
  const addProject = $('#side-add-project'); if (addProject) addProject.onclick = () => openProjectModal();
}

function renderNewTZ() {
  if (!isSmm()) return `<div class="empty-big">Faqat SMM yangi TZ yarata oladi.</div>`;
  const parsed = composing.parsed;
  return `<section class="page-head"><div><h1>Новое ТЗ</h1><p>Скажите голосом или напишите текстом — AI сам оформит задание.</p></div></section>
  <div class="compose-grid">
    <section class="panel compose-panel">
      <textarea id="brief-text" placeholder="Masalan: Turon Market uchun router chegirmalari haqida post kerak, ertaga tushlikgacha. Mahsulot rasmlari bor, narxlarni katta qilib, CTA qo'shilsin…">${esc(composing.text)}</textarea>
      <div id="rec-line" class="rec-line" hidden><i></i> Запись идёт — говорите…</div>
      <div class="attach-row"><input id="ref-url" value="${esc(composing.refUrl)}" placeholder="instagram.com/reel/... — референс ссылка"><button class="btn light" id="pick-files">${svg('upload',16)} Файлы</button><input id="file-input" type="file" multiple hidden></div>
      <div class="file-preview">${composing.files.map((f,i)=>`<span>${svg('file',14)}${esc(f.name)} <button data-rmf="${i}">×</button></span>`).join('')}</div>
      <div class="compose-actions"><button class="mic-round" id="voice-btn">${svg('mic',28)}</button><button class="btn primary" id="parse-btn">${svg('spark',18)} Разобрать ТЗ</button></div>
      <div class="helper-pills"><span>Исполнители</span><span>Проект</span><span>Дедлайн</span><span>Формат</span><span>Приоритет</span><span>Checklist</span></div>
    </section>
    <aside class="panel ai-preview">
      ${parsed ? renderParsedPreview(parsed) : `<div class="empty-preview">${svg('spark',34)}<h3>AI Preview</h3><p>Здесь AI покажет заголовок, проект, дедлайн, чек-лист и вопросы. Проверьте и отправьте исполнителям.</p></div>`}
    </aside>
  </div>`;
}
function missingHtml(list) { return (list||[]).map(x=>`<li>${esc(x)}</li>`).join('') || '<li>Нет критичных вопросов</li>'; }
function ideasHtml(p) {
  const status = p.aiState === 'loading' ? `<small class="ai-state"><span class="spin dark"></span> AI дописывает идеи…</small>` : p.aiState === 'done' ? '<small class="ai-state">✓ дополнено AI</small>' : '';
  return `<b>${svg('spark',16)} Идеи ${status}</b>${(p.ideas||[]).map((x,i)=>`<p><em>${i+1}</em>${esc(x)}</p>`).join('')}`;
}
function hookCtaHtml(p) {
  if (!p.hook && !p.cta) return '';
  return `<div class="two-blocks">${p.hook?`<div><div class="section-label">Хук (начало)</div><p class="hint-box">${esc(p.hook)}</p></div>`:''}${p.cta?`<div><div class="section-label">CTA (призыв)</div><p class="hint-box">${esc(p.cta)}</p></div>`:''}</div>`;
}
// The analyzer answers instantly; a connected AI model then rewrites only the creative part in the background.
// Skips a model's question when it asks about the same thing as one already in the list.
function similarQuestion(q, list) {
  const stems = s => new Set((String(s).toLowerCase().match(/\p{L}{4,}/gu) || []).filter(w => !/^(как|кото|нужн|будет|можн|долж|этот|чтоб|тако)/.test(w)).map(w => w.slice(0, 4)));
  const a = stems(q);
  return list.some(x => [...stems(x)].some(w => a.has(w)));
}
async function enrichParsed(p, text) {
  p.aiState = 'loading';
  const ideasBox = $('#ai-ideas'); if (ideasBox) ideasBox.innerHTML = ideasHtml(p);
  try {
    const ai = await api('/api/ai/enrich', 'POST', { text, parsed: { projectId: p.projectId, format: p.format, platform: p.platform, roles: p.roles, missing: p.missing } });
    if (composing.parsed !== p) return;
    if (ai.ideas && ai.ideas.length) p.ideas = [...ai.ideas.slice(0, 3), ...(p.ideas||[]).slice(0, 1)];
    if (ai.hook) p.hook = ai.hook;
    if (ai.questions && ai.questions.length) p.missing = [...(p.missing||[]), ...ai.questions.filter(q => !similarQuestion(q, p.missing||[]))].slice(0, 5);
    p.aiState = 'done';
  } catch (e) {
    if (composing.parsed !== p) return;
    p.aiState = '';
  }
  const box = $('#ai-ideas'); if (box) box.innerHTML = ideasHtml(p);
  const hc = $('#ai-hookcta'); if (hc) hc.innerHTML = hookCtaHtml(p);
  const ms = $('#ai-missing'); if (ms) ms.innerHTML = missingHtml(p.missing);
}
function renderParsedPreview(p) {
  return `<h2>ТЗ разобрано</h2><p class="muted">Проверьте и при необходимости отредактируйте.</p>
    <div class="form-grid">
      <label>Заголовок<input id="p-title" value="${esc(p.title)}"></label>
      <label>Проект<select id="p-project">${projects.map(pr=>`<option value="${pr.id}" ${p.projectId===pr.id?'selected':''}>${esc(pr.name)}</option>`).join('')}</select></label>
      <label>Платформа<input id="p-platform" value="${esc(p.platform)}"></label>
      <label>Формат<input id="p-format" value="${esc(p.format)}"></label>
      <label>Дедлайн<input id="p-deadline" type="datetime-local" value="${inputDateTime(p.deadline)}"></label>
      <label>Публикация<input id="p-publish" type="datetime-local" value="${inputDateTime(p.publishDate)}"></label>
      <label>Приоритет<select id="p-priority">${Object.entries(PRIORITY).map(([k,v])=>`<option value="${k}" ${p.priority===k?'selected':''}>${v}</option>`).join('')}</select></label>
    </div>
    <div class="section-label">Исполнители</div><div class="chips role-pick">${['video','edit','design'].map(r=>`<button class="chip ${p.roles.includes(r)?'on':''}" data-role="${r}">${ROLES[r]}</button>`).join('')}</div>
    <div class="section-label">Кому отправить</div><p class="muted micro-copy">Выберите конкретных людей или оставьте пустым — ТЗ уйдёт всем активным исполнителям выбранных ролей.</p>${assigneePicker(p.roles, p.assigneeIds || [])}
    ${p.brandContext?`<div class="brand-context"><b>Правила бренда проекта</b><p>${esc(p.brandContext)}</p></div>`:''}
    <label class="wide-label">Описание<textarea id="p-desc">${esc(p.description || '')}</textarea></label>
    <div class="two-blocks"><div><div class="section-label">Checklist</div><ul class="clean-list">${(p.checklist||[]).map(x=>`<li>${esc(typeof x==='string'?x:x.text)}</li>`).join('')}</ul></div><div><div class="section-label">AI вопросы</div><ul class="clean-list warn" id="ai-missing">${missingHtml(p.missing)}</ul></div></div>
    <div class="ai-card small" id="ai-ideas">${ideasHtml(p)}</div>
    <div id="ai-hookcta">${hookCtaHtml(p)}</div>
    <button class="btn primary" id="create-task">${svg('send',17)} Отправить исполнителям</button>`;
}

let rec = null, recOn = false;
function bindNewTZ() {
  $('#brief-text').oninput = e => composing.text = e.target.value;
  $('#ref-url').oninput = e => composing.refUrl = e.target.value;
  $('#pick-files').onclick = () => $('#file-input').click();
  $('#file-input').onchange = e => { composing.files.push(...[...e.target.files].slice(0,5)); render(); };
  $$('[data-rmf]').forEach(b => b.onclick = () => { composing.files.splice(+b.dataset.rmf,1); render(); });
  $('#voice-btn').onclick = toggleRec;
  $('#parse-btn').onclick = parseTZ;
  $$('.role-pick .chip').forEach(b => b.onclick = () => b.classList.toggle('on'));
  const create = $('#create-task'); if (create) create.onclick = createTaskFromPreview;
}
function toggleRec() {
  if (recOn) return stopRec();
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return toast('Голосовой ввод работает в Chrome/Edge. Можно написать текстом.');
  const ta = $('#brief-text'); const base = ta.value;
  rec = new SR(); rec.lang = 'ru-RU'; rec.continuous = true; rec.interimResults = true;
  rec.onresult = e => { let fin='', interim=''; for (const r of e.results) (r.isFinal ? fin += r[0].transcript : interim += r[0].transcript); ta.value = (base + ' ' + fin + ' ' + interim).replace(/\s+/g,' ').trimStart(); composing.text = ta.value; };
  rec.onerror = e => { if (e.error !== 'no-speech') { toast('Микрофон недоступен: ' + e.error); stopRec(); } };
  rec.onend = () => { if (recOn) try { rec.start(); } catch(e) { stopRec(); } };
  try { rec.start(); } catch(e) { return toast('Микрофон включить не удалось'); }
  recOn = true; composing.voice = true; $('#voice-btn').classList.add('recording'); $('#rec-line').hidden = false;
}
function stopRec() { recOn = false; try { rec && rec.stop(); } catch(e) {} rec = null; const b=$('#voice-btn'), l=$('#rec-line'); if (b) b.classList.remove('recording'); if (l) l.hidden = true; }
async function parseTZ() {
  composing.text = $('#brief-text').value.trim(); composing.refUrl = $('#ref-url').value.trim();
  if (composing.text.length < 10) return toast('Опишите задание чуть подробнее');
  stopRec(); const btn = $('#parse-btn'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> AI разбирает…';
  try { composing.parsed = await api('/api/ai/parse','POST',{ text: composing.text, refUrl: composing.refUrl, source: composing.voice ? 'voice' : 'text', defaultProjectId: filters.project !== 'all' ? filters.project : '' }); render(); if (composing.parsed.aiAvailable) enrichParsed(composing.parsed, composing.text); }
  catch(e) { toast(e.message); btn.disabled = false; btn.innerHTML = svg('spark',18) + ' Разобрать ТЗ'; }
}
async function fileToDataUrl(file) { return await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); }); }
async function createTaskFromPreview() {
  const roles = $$('.role-pick .chip.on').map(b => b.dataset.role);
  const p = composing.parsed;
  const selectedRoles = roles.length ? roles : p.roles;
  const assigneeIds = $$('[data-assignee]:checked').map(b => b.dataset.assignee).filter(id => selectedRoles.includes(userById(id).role));
  const body = { ...p,
    title: $('#p-title').value.trim(), projectId: $('#p-project').value, platform: $('#p-platform').value.trim(), format: $('#p-format').value.trim(), deadline: fromInputDateTime($('#p-deadline').value), publishDate: fromInputDateTime($('#p-publish').value), priority: $('#p-priority').value, roles: selectedRoles, assigneeIds, description: $('#p-desc').value.trim(), source: 'text'
  };
  const btn = $('#create-task'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Создаём…';
  try {
    const task = await api('/api/tasks','POST', body);
    for (const f of composing.files) await api('/api/tasks/' + task.id + '/files','POST',{ name: f.name, type: f.type, dataUrl: await fileToDataUrl(f), kind:'reference' });
    composing = { text:'', refUrl:'', parsed:null, files:[] };
    await refresh(); if (filters.project !== 'all' && filters.project !== task.projectId) setProject(task.projectId); page = 'board'; detailId = task.id; render(); toast('ТЗ отправлено исполнителям ✓');
  } catch(e) { toast(e.message); btn.disabled = false; }
}

const STAGES = [
  ['intake', 'Новые', ['new','clarify'], '#8fa8c8'],
  ['production', 'В работе', ['work','waiting','revision'], '#64baff'],
  ['review', 'На проверке', ['submitted'], '#ba9dff'],
  ['delivered', 'Готово', ['approved','published'], '#66dda9'],
];
const isDone = t => ['approved','published'].includes(t.status);
const isOverdue = t => deadlineInfo(t.deadline, t.status).cls === 'danger-txt';
function stageBar(list) {
  if (!list.length) return '<div class="stage-bar empty"></div>';
  return `<div class="stage-bar">${STAGES.map(([, label, st, color]) => { const n = list.filter(t => st.includes(t.status)).length; return n ? `<i style="flex:${n};background:${color}" title="${label}: ${n}"></i>` : ''; }).join('')}</div>`;
}
function dashRow(t, note, cls) {
  const p = projectById(t.projectId);
  return `<button class="dash-row" data-open="${t.id}"><i style="background:${esc(p.color || '#4F46E5')}"></i><span><b>${esc(t.title)}</b><small>${esc(p.name)}${note ? ' · <em class="' + cls + '">' + esc(note) + '</em>' : ''}</small></span></button>`;
}
// Whole picture across every project: numbers, projects, what needs attention, dates and team load.
function renderDashboard() {
  const manager = isSmm();
  const live = tasks.filter(t => !['draft','archived'].includes(t.status));
  const active = live.filter(t => !isDone(t));
  const review = live.filter(t => t.status === 'submitted');
  const overdue = active.filter(isOverdue);
  const now = Date.now(), weekAhead = now + 7 * 864e5;
  const doneWeek = live.filter(t => isDone(t) && new Date(t.updatedAt || t.createdAt).getTime() >= now - 7 * 864e5);
  const byDate = f => (a, b) => new Date(a[f]) - new Date(b[f]);
  const soon = active.filter(t => t.deadline && !isOverdue(t) && new Date(t.deadline).getTime() <= weekAhead).sort(byDate('deadline')).slice(0, 7);
  const pubs = live.filter(t => t.publishDate && new Date(t.publishDate).getTime() >= now - 6 * 3600e3 && new Date(t.publishDate).getTime() <= weekAhead).sort(byDate('publishDate')).slice(0, 6);
  const seen = new Set();
  const attention = [
    ...overdue.map(t => [t, 'просрочено', 'danger-txt']),
    ...(manager ? review.map(t => [t, 'ждёт вашей проверки', 'review-txt']) : live.filter(t => t.status === 'revision').map(t => [t, 'вернули на правки', 'warn-txt'])),
    ...live.filter(t => t.status === 'clarify').map(t => [t, 'нужны уточнения', 'warn-txt']),
    ...live.filter(t => t.status === 'waiting').map(t => [t, 'ждёт материалы', 'warn-txt']),
    ...(manager ? [] : live.filter(t => t.status === 'new').map(t => [t, 'новое ТЗ — начните работу', 'review-txt'])),
  ].filter(([t]) => !seen.has(t.id) && seen.add(t.id)).slice(0, 8);
  const projectRows = projects.map(p => {
    const list = live.filter(t => t.projectId === p.id);
    const act = list.filter(t => !isDone(t));
    const od = act.filter(isOverdue).length;
    return `<button class="dash-project" data-project-pick="${p.id}"><span class="dash-project-name"><i style="background:${esc(p.color || '#4F46E5')}"></i><b>${esc(p.name)}</b></span>${stageBar(list)}<span class="dash-num">${act.length}<small>в работе</small></span><span class="dash-num">${list.filter(t => t.status === 'submitted').length}<small>проверка</small></span><span class="dash-num ${od ? 'danger-txt' : ''}">${od}<small>просрочено</small></span><span class="dash-num">${list.filter(isDone).length}<small>готово</small></span></button>`;
  }).join('') || '<p class="muted">Проектов пока нет.</p>';
  const team = users.filter(u => ['video','edit','design'].includes(u.role) && u.active !== false).map(u => {
    const mine = active.filter(t => (t.assigneeIds || []).length ? t.assigneeIds.includes(u.id) : (t.roles || []).includes(u.role));
    return { u, n: mine.length, od: mine.filter(isOverdue).length };
  }).sort((a, b) => b.n - a.n);
  const maxLoad = Math.max(1, ...team.map(x => x.n));
  const hello = new Date().getHours() < 12 ? 'Доброе утро' : new Date().getHours() < 18 ? 'Добрый день' : 'Добрый вечер';
  const today = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  const kpi = (n, label, cls = '') => `<article class="dash-kpi ${cls}"><b>${n}</b><span>${label}</span></article>`;
  return `<section class="ops-page-head"><div><h1>${hello}, ${esc(me.name.split(' ')[0])}</h1><p>${today[0].toUpperCase() + today.slice(1)} · все проекты</p></div><div class="ops-head-actions">${manager ? `<button class="btn primary" data-nav="newtz">${svg('plus',17)} Новое ТЗ</button>` : ''}<button class="dash-avatar mobile-only" data-nav="profile" title="Профиль">${initials(me.name)}</button></div></section>
  <section class="dash-kpis">${kpi(active.length, manager ? 'ТЗ в работе' : 'Мои задачи в работе')}${kpi(review.length, manager ? 'Ждут вашей проверки' : 'Сдано на проверку', review.length ? 'review' : '')}${kpi(overdue.length, 'Просрочено', overdue.length ? 'alert' : '')}${kpi(doneWeek.length, 'Готово за 7 дней', 'ok')}</section>
  <section class="dash-grid">
    <article class="ops-panel dash-panel dash-projects"><header><h2>Проекты</h2><div class="stage-legend">${STAGES.map(([, l, , c]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}</div></header>${projectRows}</article>
    <article class="ops-panel dash-panel"><header><h2>Требует внимания</h2><b class="dash-count">${attention.length}</b></header>${attention.map(([t, note, cls]) => dashRow(t, note, cls)).join('') || `<p class="dash-empty">${svg('check',16)} Всё под контролем</p>`}</article>
    <article class="ops-panel dash-panel"><header><h2>Дедлайны на неделю</h2></header>${soon.map(t => { const d = deadlineInfo(t.deadline, t.status); return dashRow(t, d.text, d.cls); }).join('') || '<p class="dash-empty">Ближайших дедлайнов нет</p>'}</article>
    <article class="ops-panel dash-panel"><header><h2>Публикации на неделю</h2></header>${pubs.map(t => dashRow(t, fmtDateFull(t.publishDate), 'muted')).join('') || '<p class="dash-empty">Публикаций не запланировано</p>'}</article>
    ${manager ? `<article class="ops-panel dash-panel"><header><h2>Нагрузка команды</h2></header>${team.map(x => `<div class="dash-load"><span class="avatar role-${x.u.role}">${initials(x.u.name)}</span><span class="dash-load-name"><b>${esc(x.u.name)}</b><small>${ROLES[x.u.role]}${x.od ? ' · <em class="danger-txt">' + x.od + ' просрочено</em>' : ''}</small></span><span class="dash-load-bar"><i style="width:${Math.round(x.n / maxLoad * 100)}%"></i></span><b class="dash-load-n">${x.n}</b></div>`).join('') || '<p class="dash-empty">Исполнителей пока нет — добавьте их в «Команде»</p>'}</article>` : ''}
  </section>`;
}
function bindDashboard() {
  $$('[data-open]').forEach(b => b.onclick = () => { detailId = b.dataset.open; render(); });
}

function renderBoard() {
  const manager = isSmm();
  const list = filteredTasks();
  const groups = [
    ['intake', 'Новые', ['new','clarify'], 'Новых ТЗ нет'],
    ['production', 'В работе', ['work','waiting','revision'], 'Сейчас ничего не в работе'],
    ['review', 'На проверке', ['submitted'], 'Нечего проверять'],
    ['delivered', 'Готово', ['approved','published'], 'Пока ничего не сдано']
  ];
  const scope = projectTasks();
  const cp = currentProject();
  const count = statuses => scope.filter(t => statuses.includes(t.status)).length;
  const overdue = scope.filter(t => deadlineInfo(t.deadline, t.status).cls === 'danger-txt').length;
  const heading = cp ? `<i class="head-dot" style="background:${esc(cp.color || '#4F46E5')}"></i>${esc(cp.name)}` : (manager ? 'Задачи' : 'Мои задачи');
  const caption = cp ? (manager ? 'Задачи проекта — от новых до готовых.' : 'Ваши задачи по этому проекту.') : (manager ? 'Все ТЗ команды — от новых до готовых.' : 'Задачи, которые вам поставили.');
  return `<div class="project-chips">${projectSwitcher('project-chip')}</div><section class="ops-page-head factory-head"><div><h1>${heading}</h1><p>${caption}</p></div>${manager ? `<div class="ops-head-actions"><button class="btn primary" data-nav="newtz">${svg('plus',17)} Новое ТЗ</button></div>` : ''}</section>
  <section class="factory-summary-strip"><article><span>${count(['new','clarify','work','waiting','revision'])}</span><small>В работе</small></article><article><span>${count(['submitted'])}</span><small>На проверке</small></article><article class="${overdue?'alert':''}"><span>${overdue}</span><small>Просрочено</small></article><article><span>${count(['approved','published'])}</span><small>Готово</small></article></section>
  <section class="factory-controls ops-panel">${manager ? `<select id="filter-role"><option value="all">Все исполнители</option>${['video','edit','design'].map(r=>`<option value="${r}" ${filters.role===r?'selected':''}>${esc(ROLES[r])}</option>`).join('')}</select>` : ''}<label class="factory-search">${svg('search',16)}<input id="filter-q" value="${esc(filters.q)}" placeholder="Поиск задачи"></label></section>
  <section class="factory-board">${groups.map(([key,label,statuses,empty])=>{const groupTasks=list.filter(t=>statuses.includes(t.status));return `<article class="factory-column ${key}"><header><div><h2>${label}</h2></div><b>${groupTasks.length}</b></header><div class="factory-card-stack">${groupTasks.map(taskCard).join('') || `<div class="factory-empty"><span>${svg(key==='review'?'check':'file',19)}</span><p>${empty}</p></div>`}</div></article>`;}).join('')}</section>`;
}
function taskCard(t) {
  const p = projectById(t.projectId); const dl = deadlineInfo(t.deadline, t.status);
  return `<article class="task-card" data-open="${t.id}"><div class="task-line"><span class="proj-dot" style="background:${esc(p.color)}"></span><span>${esc(p.name)} · ${esc(t.platform)}</span>${t.priority==='high'?priorityPill('high'):''}</div><h3>${esc(t.title)}</h3><div class="card-pills">${rolePills(t.roles)}${statusPill(t.status)}</div><div class="task-meta"><span class="${dl.cls}">${svg('clock',14)} ${dl.text}</span><span>${t.chat?.length?svg('chat',14)+' '+t.chat.length:''}</span><span>${t.files?.length?svg('file',14)+' '+t.files.length:''}</span></div></article>`;
}
function bindBoard() {
  const role = $('#filter-role'); if (role) role.onchange = e => { filters.role = e.target.value; render(); };
  $('#filter-q').oninput = e => {
    filters.q = e.target.value; clearTimeout(e.target._t);
    e.target._t = setTimeout(() => { render(); const q = $('#filter-q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 250);
  };
  $$('[data-open]').forEach(c => c.onclick = () => { detailId = c.dataset.open; render(); });
}

function fileHref(f) {
  const url = String(f.url || '');
  if (!url.startsWith('/api/files/')) return url;
  return url + (url.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(token);
}
function renderFileItem(f, canApprove) {
  const col = f.status === 'approved' ? 'green' : (f.status === 'revision' ? 'orange' : 'blue');
  const lbl = f.status === 'approved' ? '✓ Утверждён' : (f.status === 'revision' ? 'Правки' : 'На проверке');
  const ver = f.version ? 'v' + f.version : '';
  const href = fileHref(f);
  const isImage = String(f.type || '').startsWith('image/');
  const isVideo = String(f.type || '').startsWith('video/');
  const preview = isImage ? `<a class="media-preview image-preview" href="${esc(href)}" target="_blank" rel="noreferrer"><img src="${esc(href)}" alt="${esc(f.name)}"></a>` : (isVideo ? `<video class="media-preview video-preview" controls preload="metadata" src="${esc(href)}"></video>` : '');
  const kind = f.kind === 'reference' ? '<span class="badge badge-neutral">Референс</span>' : '';
  const stateBadge = f.kind === 'reference' ? '' : '<span class="badge badge-' + col + '">' + lbl + '</span>';
  let h = '<div class="file-item">' + preview + '<div class="file-header"><a href="' + esc(href) + '" target="_blank" rel="noreferrer">' + svg('file', 15) + '<span>' + esc(f.name) + '</span><small>' + ver + '</small></a>' + kind + stateBadge + '</div>';
  h += '<div class="file-meta"><small>' + Math.round((f.size || 0) / 1024) + ' KB · ' + esc(userById(f.uploadedBy).name) + '</small></div>';
  if (canApprove && f.kind !== 'reference') h += '<div class="file-actions"><button class="btn light small" data-approve="' + f.id + '">✓ Утвердить</button><button class="btn light small" data-revision="' + f.id + '">✎ На доработку</button><button class="btn light small danger" data-delfile="' + f.id + '">✕</button></div>';
  h += '</div>';
  return h;
}
function quickActions(t) {
  if (isSmm()) {
    if (t.status === 'submitted') return `<div class="quick-actions"><button class="qa-btn ok" data-quick="approved">${svg('check',17)} Принять работу</button><button class="qa-btn warn" data-quick="revision">${svg('edit',16)} Вернуть на правки</button></div>`;
    if (t.status === 'approved') return `<div class="quick-actions"><button class="qa-btn ok" data-quick="published">${svg('rocket',17)} Опубликовано</button></div>`;
    return '';
  }
  const btns = [];
  if (['new','clarify'].includes(t.status)) btns.push(`<button class="qa-btn go" data-quick="work">${svg('play',16)} Начать работу</button>`);
  if (t.status === 'revision') btns.push(`<button class="qa-btn go" data-quick="work">${svg('play',16)} Взять правки в работу</button>`);
  if (t.status === 'work') { btns.push(`<button class="qa-btn ok" data-quick="submitted">${svg('check',16)} Сдать работу</button>`); btns.push(`<button class="qa-btn warn" data-quick="waiting">${svg('pause',16)} Нужны материалы</button>`); }
  if (t.status === 'waiting') btns.push(`<button class="qa-btn go" data-quick="work">${svg('play',16)} Материалы есть, продолжить</button>`);
  if (['new','work','waiting'].includes(t.status)) btns.push(`<button class="qa-btn ask" data-quick="clarify">${svg('help',16)} Нужны уточнения</button>`);
  btns.push(`<button class="qa-btn ask" id="qa-ask">${svg('help',16)} Задать вопрос</button>`);
  return `<div class="quick-actions">${btns.join('')}</div>`;
}
function renderTaskDrawer(id) {
  const t = tasks.find(x => x.id === id); if (!t) return '';
  const p = projectById(t.projectId); const dl = deadlineInfo(t.deadline, t.status); const creator = userById(t.createdBy);
  const myRole = !isSmm() ? me.role : null;
  return `<div class="drawer-back"><aside class="drawer"><button class="drawer-close" id="drawer-close">×</button>
    <div class="crumb">${esc(p.name)} / ${esc(t.platform)}</div><h2>${esc(t.title)}</h2><div class="drawer-pills">${priorityPill(t.priority)}${rolePills(t.roles)}${statusPill(t.status)}</div>
    ${quickActions(t)}
    ${myRole && ROLE_HINT[myRole] && ['new','clarify','work','waiting','revision'].includes(t.status)?`<div class="role-hint"><b>${svg(myRole==='design'?'edit':(myRole==='video'?'mic':'board'),15)} Вам как ${ROLES[myRole].toLowerCase()}у:</b> ${ROLE_HINT[myRole]}</div>`:''}
    <div class="meta-grid"><div><span>Проект</span><b>${esc(p.name)}</b></div><div><span>Дедлайн</span><b class="${dl.cls}">${dl.text}</b></div><div><span>Формат</span><b>${esc(t.format)}</b></div><div><span>Автор</span><b>${esc(creator.name)}</b></div></div>
    ${isSmm() ? `<label class="status-row">Статус<select id="task-status">${Object.entries(STATUS).map(([k,v])=>`<option value="${k}" ${t.status===k?'selected':''}>${v}</option>`).join('')}</select></label>` : `<div class="status-row">Статус <span>${statusPill(t.status)}</span><small>Изменяйте его кнопками выше.</small></div>`}
    ${isSmm()?`<button class="btn light" id="edit-task">${svg('edit',16)} Редактировать</button>`:''}
    ${t.brandContext?`<section class="brand-context"><h3>Правила бренда</h3><p>${esc(t.brandContext)}</p></section>`:''}
    <section><h3>Задача</h3><p class="desc">${esc(t.description)}</p>${t.bullets?.length?`<ul class="bullets">${t.bullets.map(b=>`<li>${esc(b)}</li>`).join('')}</ul>`:''}</section>
    ${t.missing?.length?`<section class="warn-box"><b>AI уточнения</b>${t.missing.map(x=>`<p>${esc(x)}</p>`).join('')}</section>`:''}
    <section><h3>Checklist</h3><div class="check-list">${(t.checklist||[]).map(ch=>`<label><input type="checkbox" data-check="${ch.id}" ${ch.done?'checked':''}> <span>${esc(ch.text)}</span></label>`).join('') || '<p class="muted">Чек-лист пуст</p>'}</div></section>
    ${t.refs?.length?`<section><h3>Референсы</h3><div class="ref-list">${t.refs.map(r=>`<a href="${esc(r.url)}" target="_blank">${svg('link',14)} ${esc(r.url)}<small>${esc(r.note||'')}</small></a>`).join('')}</div></section>`:''}
    ${t.ideas?.length?`<section class="ai-card"><b>${svg('spark',16)} Идеи от AI</b>${t.ideas.map((x,i)=>`<p><em>${i+1}</em>${esc(x)}</p>`).join('')}</section>`:''}
    ${(t.hook||t.cta)?`<section><h3>Хук и CTA</h3>${t.hook?`<p class="hint-box"><b>Начало:</b> ${esc(t.hook)}</p>`:''}${t.cta?`<p class="hint-box"><b>Призыв:</b> ${esc(t.cta)}</p>`:''}</section>`:''}
    <section><h3>Файлы / версии</h3><div class="files">${(t.files||[]).map(f=>renderFileItem(f,isSmm())).join('') || '<p class="muted">Файлов нет</p>'}</div><div class="upload-inline"><input id="drawer-file" type="file"><button class="btn light" id="upload-file">${svg('upload',15)} Загрузить</button></div></section>
    <section class="chat-box"><h3>${svg('chat',16)} Вопросы / комментарии</h3><div class="messages">${(t.chat||[]).map(msgHtml).join('') || '<p class="muted">Вопросов нет</p>'}</div><div class="chat-input"><input id="chat-text" placeholder="Вопрос или комментарий…"><button id="chat-send">${svg('send',16)}</button></div></section>
    <section><h3>Activity</h3><div class="activity">${(t.activity||[]).slice().reverse().slice(0,8).map(a=>`<p><b>${esc(userById(a.userId).name || a.userId)}</b> ${esc(a.action)} <small>${fmtDateFull(a.at)}</small><br><span>${esc(a.detail||'')}</span></p>`).join('')}</div></section>
    ${isSmm()?`<button class="btn danger" id="delete-task">${svg('trash',16)} Удалить задачу</button>`:''}
  </aside></div>`;
}
function msgHtml(m) { const u = userById(m.userId); return `<div class="msg ${m.userId===me.id?'mine':''}"><div class="avatar role-${u.role}">${initials(u.name)}</div><div><p>${esc(m.text)}</p><small>${esc(u.name)} · ${fmtTime(m.at)}</small></div></div>`; }
function bindTaskDrawer(id) {
  $('#drawer-close').onclick = () => { detailId = null; render(); };
  $('.drawer-back').onclick = e => { if (e.target.classList.contains('drawer-back')) { detailId = null; render(); } };
  const taskStatus = $('#task-status'); if (taskStatus) taskStatus.onchange = async e => { try { await api('/api/tasks/'+id,'PATCH',{ status:e.target.value }); await refresh(); render(); toast('Статус обновлён'); } catch(err){ toast(err.message); } };
  $$('#delete-task').forEach(b => b.onclick = async () => { if (b.dataset.ok !== '1') { b.dataset.ok='1'; b.textContent='Точно удалить?'; return; } try { await api('/api/tasks/'+id,'DELETE'); await refresh(); detailId=null; render(); toast('Удалено'); } catch(e){ toast(e.message); } });
  $('#chat-send').onclick = () => sendChat(id); $('#chat-text').onkeydown = e => { if (e.key==='Enter') sendChat(id); };
  $$('#upload-file').forEach(b => b.onclick = () => uploadDrawerFile(id));
  $$('[data-check]').forEach(ch => ch.onchange = async () => { try { await api('/api/tasks/'+id+'/checklist','PATCH',{ id: ch.dataset.check, done: ch.checked }); await refresh(); render(); } catch(e){ toast(e.message); } });
  $$('[data-quick]').forEach(b => b.onclick = async () => { try { await api('/api/tasks/'+id,'PATCH',{ status: b.dataset.quick }); await refresh(); render(); toast('Статус: ' + STATUS[b.dataset.quick]); } catch(e){ toast(e.message); } });
  const ask = $('#qa-ask'); if (ask) ask.onclick = () => { const el = $('#chat-text'); if (el) { el.focus(); el.scrollIntoView({ behavior:'smooth', block:'center' }); } };
  $$('[data-approve]').forEach(b => b.onclick = async () => { try { await api('/api/tasks/'+id+'/files','PATCH',{ fileId: b.dataset.approve, action:'approve' }); await refresh(); render(); toast('Файл утверждён ✓'); } catch(e){ toast(e.message); } });
  $$('[data-revision]').forEach(b => b.onclick = () => { const fid = b.dataset.revision; modal(`<h2>Что поправить?</h2><textarea id="rev-note" placeholder="Например: сделать заголовок крупнее, поменять музыку…" style="width:100%;min-height:110px;border:1px solid var(--line);border-radius:12px;padding:11px;font-family:inherit;font-size:15px"></textarea><button class="btn primary" id="rev-send">Отправить на доработку</button>`); setTimeout(()=>{ const s=$('#rev-send'); if(s) s.onclick = async () => { try { await api('/api/tasks/'+id+'/files','PATCH',{ fileId: fid, action:'revision', note: $('#rev-note').value }); closeModal(); await refresh(); render(); toast('Отправлено на доработку'); } catch(e){ toast(e.message); } }; },0); });
  $$('[data-delfile]').forEach(b => b.onclick = async () => { if (b.dataset.ok !== '1') { b.dataset.ok='1'; b.textContent='Удалить?'; return; } try { await api('/api/tasks/'+id+'/files','PATCH',{ fileId: b.dataset.delfile, action:'delete' }); await refresh(); render(); toast('Файл удалён'); } catch(e){ toast(e.message); } });
  const ed = $('#edit-task'); if (ed) ed.onclick = () => openEditTask(id);
}
async function sendChat(id) { const inp=$('#chat-text'), text=inp.value.trim(); if(!text) return; try { await api('/api/tasks/'+id+'/chat','POST',{text}); await refresh(); render(); } catch(e){toast(e.message);} }
async function uploadDrawerFile(id) { const f = $('#drawer-file').files[0]; if(!f) return toast('Выберите файл'); try { await api('/api/tasks/'+id+'/files','POST',{ name:f.name, type:f.type, dataUrl: await fileToDataUrl(f) }); await refresh(); render(); toast('Файл загружен'); } catch(e){ toast(e.message); } }
function openEditTask(id) {
  const t = tasks.find(x=>x.id===id); if (!t) return;
  const selectable = users.filter(u => u.active !== false && ['video','edit','design'].includes(u.role));
  const selected = new Set(t.assigneeIds || []);
  modal(`<h2>Редактировать ТЗ</h2><div class="form-grid"><label>Заголовок<input id="e-title" value="${esc(t.title)}"></label><label>Проект<select id="e-project">${projects.map(p=>`<option value="${p.id}" ${t.projectId===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><label>Платформа<input id="e-platform" value="${esc(t.platform)}"></label><label>Формат<input id="e-format" value="${esc(t.format)}"></label><label>Дедлайн<input id="e-deadline" type="datetime-local" value="${inputDateTime(t.deadline)}"></label><label>Публикация<input id="e-publish" type="datetime-local" value="${inputDateTime(t.publishDate)}"></label><label>Приоритет<select id="e-priority">${Object.entries(PRIORITY).map(([k,v])=>`<option value="${k}" ${t.priority===k?'selected':''}>${v}</option>`).join('')}</select></label></div><div class="section-label">Исполнители</div><div class="chips edit-role-pick">${['video','edit','design'].map(r=>`<button class="chip ${t.roles.includes(r)?'on':''}" data-edit-role="${r}">${ROLES[r]}</button>`).join('')}</div><div class="section-label">Кому назначить</div><p class="muted micro-copy">Отметьте конкретных людей. Пустой список означает: все активные люди выбранных ролей.</p><div class="assignee-picker">${selectable.map(u=>`<label class="assignee-option"><input type="checkbox" data-edit-assignee="${u.id}" ${selected.has(u.id)?'checked':''}><span class="avatar role-${u.role}">${initials(u.name)}</span><span><b>${esc(u.name)}</b><small>${ROLES[u.role]}</small></span></label>`).join('') || '<p class="muted">Нет активных исполнителей.</p>'}</div><label class="wide-label">Описание<textarea id="e-desc">${esc(t.description)}</textarea></label><button class="btn primary" id="save-edit">Сохранить</button>`);
  $$('.edit-role-pick .chip').forEach(b => b.onclick = () => b.classList.toggle('on'));
  $('#save-edit').onclick = async () => {
    const roles = $$('.edit-role-pick .chip.on').map(b => b.dataset.editRole);
    const assigneeIds = $$('[data-edit-assignee]:checked').map(b => b.dataset.editAssignee).filter(id => roles.includes(userById(id).role));
    try {
      await api('/api/tasks/'+id,'PATCH',{ title:$('#e-title').value, projectId:$('#e-project').value, platform:$('#e-platform').value, format:$('#e-format').value, deadline:fromInputDateTime($('#e-deadline').value), publishDate:fromInputDateTime($('#e-publish').value), priority:$('#e-priority').value, roles:roles.length?roles:t.roles, assigneeIds, description:$('#e-desc').value });
      closeModal(); await refresh(); render();
    } catch(e){ toast(e.message); }
  };
}

function renderProjects() {
  return `<section class="page-head"><div><h1>Проекты</h1><p>Карточка бренда используется AI при разборе ТЗ и даёт исполнителям единые правила.</p></div>${isSmm()?`<button class="btn primary" id="new-project">${svg('plus',16)} Проект</button>`:''}</section><section class="project-grid">${projects.map(p=>{ const bs=p.brandSettings||{}; return `<article class="panel project-card" data-project-open="${p.id}"><div class="project-top"><span class="project-logo" style="background:${esc(p.color)}">${esc(p.name[0])}</span><div><h3>${esc(p.name)}</h3><p>${esc((p.platformDefaults||[]).join(' · ') || 'Платформы не заданы')}</p></div>${isSmm()?`<button class="project-edit" data-project-edit="${p.id}" title="Редактировать">${svg('edit',15)}</button>`:''}</div><div class="brand-note">${esc(p.brand||'Настройки бренда пока не заданы')}</div><div class="project-facts">${bs.toneOfVoice?`<span>Тон: ${esc(bs.toneOfVoice)}</span>`:''}${bs.cta?`<span>CTA: ${esc(bs.cta)}</span>`:''}</div><div class="alias-line">${(p.aliases||[]).map(a=>`<span>${esc(a)}</span>`).join('')}</div></article>`; }).join('')}</section>`;
}
function bindProjects() {
  $$('#new-project').forEach(add => add.onclick = () => openProjectModal());
  $$('[data-project-open]').forEach(card => card.onclick = () => openProjectModal(card.dataset.projectOpen));
  $$('[data-project-edit]').forEach(button => button.onclick = e => { e.stopPropagation(); openProjectModal(button.dataset.projectEdit); });
  $$('[data-open]').forEach(button => button.onclick = () => { detailId = button.dataset.open; render(); });
}
function openProjectModal(id = null) {
  const existing = id ? projects.find(p => p.id === id) : null;
  const p = existing || { name:'', aliases:[], color:'#4F46E5', platformDefaults:['Instagram','Telegram'], brand:'', brandSettings:{} };
  const bs = p.brandSettings || {};
  const disabled = !isSmm();
  modal(`<h2>${existing ? esc(p.name) : 'Новый проект'}</h2><p class="muted">Эти правила AI учитывает при разборе ТЗ, их видит вся команда.</p><div class="form-grid"><label>Название<input id="pr-name" value="${esc(p.name)}" ${disabled?'disabled':''}></label><label>Основной цвет<input id="pr-color" type="color" value="${esc(p.color || '#4F46E5')}" ${disabled?'disabled':''}></label></div><label class="wide-label">Псевдонимы через запятую<input id="pr-aliases" value="${esc((p.aliases||[]).join(', '))}" ${disabled?'disabled':''}></label><label class="wide-label">Платформы по умолчанию<input id="pr-platforms" value="${esc((p.platformDefaults||[]).join(', '))}" placeholder="Instagram, Telegram, YouTube" ${disabled?'disabled':''}></label><label class="wide-label">Краткие правила бренда<textarea id="pr-brand" ${disabled?'disabled':''} placeholder="Цвета, требования к логотипу, обязательные элементы…">${esc(p.brand||'')}</textarea></label><div class="section-label">Расширенные бренд-настройки</div><div class="form-grid"><label>Шрифт<input id="pr-font" value="${esc(bs.font||'')}" placeholder="Например: Inter" ${disabled?'disabled':''}></label><label>CTA по умолчанию<input id="pr-cta" value="${esc(bs.cta||'')}" placeholder="Напишите в Direct…" ${disabled?'disabled':''}></label></div><label class="wide-label">Тон общения<textarea id="pr-tone" ${disabled?'disabled':''} placeholder="Дружелюбный, короткий, уверенный…">${esc(bs.toneOfVoice||'')}</textarea></label><label class="wide-label">Фирменные цвета через запятую<input id="pr-colors" value="${esc((bs.colors||[]).join(', '))}" placeholder="#4F46E5, #FFFFFF" ${disabled?'disabled':''}></label><label class="wide-label">Социальные ссылки через запятую<input id="pr-social" value="${esc((bs.socialLinks||[]).join(', '))}" placeholder="instagram.com/..., t.me/..." ${disabled?'disabled':''}></label><label class="wide-label">Форматы по умолчанию через запятую<input id="pr-formats" value="${esc((bs.defaultFormats||[]).join(', '))}" placeholder="Reels 9:16, Post 4:5" ${disabled?'disabled':''}></label>${disabled?'':`<button class="btn primary" id="save-project">${existing?'Сохранить настройки':'Создать проект'}</button>`}`);
  const save = $('#save-project'); if (!save) return;
  save.onclick = async () => {
    const comma = id => $(id).value.split(',').map(x=>x.trim()).filter(Boolean);
    const body = { name:$('#pr-name').value, color:$('#pr-color').value, aliases:comma('#pr-aliases'), platformDefaults:comma('#pr-platforms'), brand:$('#pr-brand').value, brandSettings:{ font:$('#pr-font').value, cta:$('#pr-cta').value, toneOfVoice:$('#pr-tone').value, colors:comma('#pr-colors'), socialLinks:comma('#pr-social'), defaultFormats:comma('#pr-formats') } };
    try { await api(existing ? '/api/projects/'+existing.id : '/api/projects', existing ? 'PATCH' : 'POST', body); closeModal(); await refresh(); render(); toast(existing ? 'Настройки бренда сохранены' : 'Проект создан'); }
    catch (e) { toast(e.message); }
  };
}

function telegramAdminHtml() {
  const s = tgStatus || {};
  if (s.configured) {
    const people = users.filter(u => u.active !== false);
    return `<article class="panel admin-panel tg-admin"><h3>Telegram-бот</h3><p class="tg-ok">✓ Подключён: @${esc(s.botUsername)}</p>${s.error ? `<p class="danger-txt">${esc(s.error)}</p>` : ''}<p class="muted">Получают уведомления в Telegram: ${people.filter(u => u.telegramLinked).length} из ${people.length}. Каждый сотрудник подключается сам: Профиль → «Подключить Telegram».</p><button class="btn light small danger" id="tg-remove">Отключить бота</button></article>`;
  }
  return `<article class="panel admin-panel tg-admin"><h3>Telegram-бот для уведомлений</h3><ol class="tg-steps"><li>Откройте в Telegram <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a> и отправьте <code>/newbot</code>.</li><li>Придумайте имя (например, «Turon TZ») и адрес бота — он должен заканчиваться на <code>bot</code>.</li><li>BotFather пришлёт токен вида <code>123456789:AAH…</code>. Скопируйте его и вставьте ниже.</li></ol>${s.error ? `<p class="danger-txt">${esc(s.error)}</p>` : ''}<div class="tg-token-row"><input id="tg-token" type="password" autocomplete="off" placeholder="Токен от @BotFather"><button class="btn primary" id="tg-save">Подключить бота</button></div></article>`;
}
function renderAdmin() {
  if (!isSmm()) return '<div class="empty-big">Раздел доступен только SMM-менеджеру.</div>';
  if (!adminSummary) return `<section class="page-head"><div><h1>Команда</h1><p>Люди, нагрузка и просрочки.</p></div></section><div class="empty-big"><span class="spin dark"></span><p>Загружаем…</p></div>`;
  const s = adminSummary;
  return `<section class="page-head"><div><h1>Команда</h1><p>Люди, нагрузка и просрочки.</p></div><div class="head-actions"><button class="btn light" data-nav="projects">${svg('project',16)} Проекты и бренды</button><button class="btn primary" id="add-member">${svg('plus',16)} Добавить человека</button></div></section><section class="admin-grid"><article class="panel admin-panel"><div class="panel-title-row"><h3>Команда · ${s.totals.users}</h3></div><div class="admin-team-list">${s.workload.map(w=>{ const u=w.user; const self=u.id===me.id; return `<div class="admin-team-row ${u.active?'':'inactive'}"><span class="avatar role-${u.role}">${initials(u.name)}</span><div class="team-person"><b>${esc(u.name)}${u.telegramLinked ? ' <span class="tg-badge" title="Получает уведомления в Telegram">TG</span>' : ''}</b><small>${u.pending ? '<span class="warn-txt">ждёт подтверждения</span> · ' : ''}@${esc(u.login)} · ${w.active} активных · ${w.overdue ? '<span class="danger-txt">'+w.overdue+' просрочено</span>' : 'без просрочек'}</small></div><select data-user-role="${u.id}" ${self?'disabled':''}>${Object.entries(ROLES).map(([r,label])=>`<option value="${r}" ${u.role===r?'selected':''}>${label}</option>`).join('')}</select><button class="btn light small" data-user-toggle="${u.id}" ${self?'disabled':''}>${u.pending ? 'Подтвердить' : (u.active ? 'Отключить' : 'Включить')}</button></div>`; }).join('') || '<p class="muted">Команда пока пуста.</p>'}</div></article><article class="panel admin-panel"><h3>Нагрузка по людям</h3><div class="workload-list">${s.workload.filter(w=>['video','edit','design'].includes(w.user.role)).map(w=>`<div><span><b>${esc(w.user.name)}</b><small>${ROLES[w.user.role]}</small></span><b class="load-count ${w.overdue?'danger-txt':''}">${w.active}</b></div>`).join('') || '<p class="muted">Добавьте исполнителей, чтобы увидеть нагрузку.</p>'}</div></article><article class="panel admin-panel"><h3>Просроченные задачи</h3><div class="late-list">${s.lateTasks.map(t=>`<button data-admin-open="${t.id}"><b>${esc(t.title)}</b><span>${esc(projectById(t.projectId).name)} · ${fmtDateFull(t.deadline)}</span></button>`).join('') || '<p class="muted">Просрочек нет ✓</p>'}</div></article>${telegramAdminHtml()}</section>`;
}
function bindAdmin() {
  if (!adminSummary && !adminLoading) { loadAdmin(); return; }
  const reload = $('#reload-admin'); if (reload) reload.onclick = () => loadAdmin(true);
  const add = $('#add-member'); if (add) add.onclick = openAddMemberModal;
  const tgSave = $('#tg-save'); if (tgSave) tgSave.onclick = async () => {
    const tokenValue = $('#tg-token').value.trim();
    if (!tokenValue) return toast('Вставьте токен от @BotFather');
    tgSave.disabled = true; tgSave.innerHTML = '<span class="spin"></span> Проверяем…';
    try { await api('/api/telegram/config', 'POST', { token: tokenValue }); await refresh(); render(); toast('Бот подключён ✓ Теперь каждый подключает Telegram в своём профиле'); }
    catch (e) { toast(e.message, 5000); tgSave.disabled = false; tgSave.textContent = 'Подключить бота'; }
  };
  const tgRemove = $('#tg-remove'); if (tgRemove) tgRemove.onclick = async () => {
    if (!confirm('Отключить Telegram-бота? Уведомления в Telegram перестанут приходить всем.')) return;
    try { await api('/api/telegram/config', 'DELETE'); await refresh(); render(); toast('Бот отключён'); } catch (e) { toast(e.message); }
  };
  $$('[data-user-role]').forEach(select => select.onchange = async () => { try { await api('/api/admin/users/'+select.dataset.userRole, 'PATCH', { role:select.value }); await refresh(); await loadAdmin(true); toast('Роль обновлена'); } catch(e) { toast(e.message); } });
  $$('[data-user-toggle]').forEach(button => button.onclick = async () => { const member=users.find(u=>u.id===button.dataset.userToggle); if (!member) return; try { await api('/api/admin/users/'+member.id, 'PATCH', { active:!member.active }); await refresh(); await loadAdmin(true); toast(member.active ? 'Доступ отключён' : 'Доступ включён'); } catch(e) { toast(e.message); } });
  $$('[data-admin-open]').forEach(button => button.onclick = () => { detailId=button.dataset.adminOpen; render(); });
}
async function loadAdmin(force = false) {
  if (adminLoading) return;
  adminLoading = true;
  try { adminSummary = await api('/api/admin/summary'); }
  catch(e) { toast(e.message); }
  finally { adminLoading = false; if (page === 'admin') render(); }
}
function openAddMemberModal() {
  modal(`<h2>Добавить человека</h2><p class="muted">Передайте сотруднику этот логин и временный пароль. Он сможет войти сразу.</p><div class="form-grid"><label>Имя<input id="member-name" placeholder="Алия Каримова"></label><label>Роль<select id="member-role">${Object.entries(ROLES).map(([r,label])=>`<option value="${r}" ${r==='design'?'selected':''}>${label}</option>`).join('')}</select></label><label>Логин<input id="member-login" autocapitalize="none" placeholder="aliya"></label><label>Временный пароль<input id="member-password" type="password" placeholder="минимум 4 символа"></label></div><button class="btn primary" id="save-member">Добавить в команду</button>`);
  $('#save-member').onclick = async () => { try { await api('/api/admin/users','POST',{ name:$('#member-name').value, role:$('#member-role').value, login:$('#member-login').value, password:$('#member-password').value }); closeModal(); await refresh(); await loadAdmin(true); toast('Человек добавлен в команду'); } catch(e) { toast(e.message); } };
}

function renderCalendar() {
  const y=calCursor.getFullYear(), m=calCursor.getMonth(), first=new Date(y,m,1); let start=new Date(first); start.setDate(1-((first.getDay()+6)%7));
  const month=calCursor.toLocaleDateString('ru-RU',{month:'long',year:'numeric'});
  const isPublish = calMode === 'publish';
  const dateField = isPublish ? 'publishDate' : 'deadline';
  const scope = projectTasks();
  const cp = currentProject();
  let cells=''; for(let i=0;i<42;i++){ const d=new Date(start); d.setDate(start.getDate()+i); const day=scope.filter(t=>t[dateField] && sameDay(new Date(t[dateField]),d)); cells+=`<div class="month-cell ${d.getMonth()!==m?'other':''} ${sameDay(d,new Date())?'today':''}"><b>${d.getDate()}</b>${day.slice(0,3).map(t=>`<button data-open="${t.id}" class="cal-task ${t.priority==='high'?'hot':''}">${esc(t.title)}</button>`).join('')}</div>`; }
  const upcoming = scope.filter(t=>t[dateField] && new Date(t[dateField]) >= new Date(new Date().toDateString())).sort((a,b)=>new Date(a[dateField])-new Date(b[dateField])).slice(0,8);
  const title = isPublish ? 'Календарь публикаций' : 'Календарь дедлайнов';
  const subtitle = (cp ? cp.name + ' · ' : '') + (isPublish ? 'Когда выходит контент' : 'Когда сдавать работы');
  return `<div class="project-chips">${projectSwitcher('project-chip')}</div><section class="page-head"><div><h1>${title}</h1><p>${subtitle}</p></div><div class="cal-nav"><button id="prev-month">‹</button><b>${esc(month)}</b><button id="next-month">›</button><div style="display:flex;gap:8px;margin-left:16px"><button class="btn light" id="cal-deadline" style="${!isPublish?'background:var(--acc);color:#fff;':''}">Дедлайны</button><button class="btn light" id="cal-publish" style="${isPublish?'background:var(--acc);color:#fff;':''}">Публикация</button></div></div></section><section class="calendar-layout"><div class="panel month"><div class="week-head">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(x=>`<span>${x}</span>`).join('')}</div><div class="month-grid">${cells}</div></div><aside class="panel nearest"><h3>${isPublish?'Ближайшие публикации':'Ближайшие дедлайны'}</h3>${upcoming.map(t=>{const info=isPublish?{text:t.publishDate?fmtDateFull(t.publishDate):'-',cls:'muted'}:deadlineInfo(t.deadline,t.status);return `<button data-open="${t.id}"><span>${esc(t.title)}</span><b class="${info.cls}">${info.text}</b></button>`}).join('') || '<p class="muted">Дат нет</p>'}</aside></section>`;
}
function bindCalendar() {
  $('#prev-month').onclick=()=>{calCursor.setMonth(calCursor.getMonth()-1);render()};
  $('#next-month').onclick=()=>{calCursor.setMonth(calCursor.getMonth()+1);render()};
  $('#cal-deadline').onclick=()=>{calMode='deadline';render()};
  $('#cal-publish').onclick=()=>{calMode='publish';render()};
  $$('[data-open]').forEach(b=>b.onclick=()=>{detailId=b.dataset.open;render()});
}

function renderNotifications() {
  return `<section class="page-head"><div><h1>Уведомления</h1><p>${unreadCount()} непрочитанных</p></div><button class="btn light" id="mark-read">Отметить все прочитанными</button></section><section class="panel notif-list">${notifications.length?notifications.map(n=>`<button data-open="${n.taskId||''}" class="notif ${n.read?'':'unread'}"><b>${esc(n.title)}</b><span>${esc(n.text)}</span><small>${fmtDateFull(n.at)}</small></button>`).join(''):'<div class="empty-big">Уведомлений пока нет</div>'}</section>`;
}
function bindNotifications() { $('#mark-read').onclick=async()=>{await api('/api/notifications/read','POST',{});await refresh();render();}; $$('.notif[data-open]').forEach(b=>b.onclick=()=>{ if(b.dataset.open){ detailId=b.dataset.open; render(); } }); }

function telegramCardHtml() {
  const s = tgStatus || {};
  let body;
  if (!s.configured) body = isSmm()
    ? `<p class="muted">Бот ещё не подключён. Это делается один раз в разделе «Команда».</p><button class="btn light" data-nav="admin">Перейти в «Команду»</button>`
    : '<p class="muted">SMM-менеджер ещё не подключил Telegram-бота.</p>';
  else if (s.linked) body = `<p class="tg-ok">✓ Уведомления приходят в Telegram${s.linkedAs ? ' · ' + esc(s.linkedAs) : ''}</p><button class="btn light" id="tg-unlink">Отключить</button>`;
  else body = `<p class="muted">Новые ТЗ, комментарии и правки будут приходить на телефон от бота @${esc(s.botUsername)}.</p><button class="btn primary" id="tg-link">${svg('send',16)} Подключить Telegram</button><p class="muted tg-hint" id="tg-hint" hidden>Откроется Telegram — нажмите <b>Start</b> (Запустить), затем вернитесь сюда.</p>`;
  return `<div class="panel tg-card"><h3>Уведомления в Telegram</h3>${body}</div>`;
}
function renderProfile() {
  const ai = me || {};
  const ollama = ai.ollama || { installed:false, modelReady:false, model:'qwen2.5:7b' };
  const provider = ai.activeProvider || (ai.aiEnabled ? 'claude' : 'offline');
  const aiStatus = provider === 'ollama'
    ? `<li class="ok-li">✓ Умный AI: Ollama · ${esc(ollama.model)}</li>`
    : provider === 'claude'
      ? `<li class="ok-li">✓ Умный AI: Claude</li>`
      : `<li class="warn-li">○ AI-разбор: встроенный анализатор</li>`;
  const ollamaAction = !ollama.installed
    ? `<div class="ai-setup-copy"><b>Ollama не установлен</b><p>Это бесплатный AI, который работает на этом компьютере без API-ключа.</p><a class="btn light" href="https://ollama.com/download/windows" target="_blank" rel="noreferrer">Скачать Ollama</a></div>`
    : !ollama.modelReady
      ? `<div class="ai-setup-copy"><b>Ollama найден, но модель не скачана</b><p>Нужна модель <code>${esc(ollama.model)}</code>. Она останется на этом компьютере и не требует API-ключа.</p>${isSmm()?`<button class="btn primary" id="pull-ollama">${svg('download',16)} Скачать бесплатную модель</button>`:'<p class="muted">Попросите SMM-менеджера скачать модель один раз.</p>'}</div>`
      : `<div class="ai-setup-copy"><b>Локальный AI готов</b><p>Модель <code>${esc(ollama.model)}</code> работает на этом компьютере. Если Claude-ключ не добавлен, она используется автоматически.</p></div>`;
  return `<section class="page-head"><div><h1>Профиль</h1><p>Ваше имя и выход из аккаунта.</p></div></section><section class="profile-grid"><div class="panel profile-card"><div class="avatar big role-${me.role}">${initials(me.name)}</div><h2>${esc(me.name)}</h2><p>${ROLES[me.role]}</p><label>Имя<input id="profile-name" value="${esc(me.name)}"></label><button class="btn light" id="save-profile">Сохранить имя</button><button class="btn danger" id="logout">${svg('logout',16)} Выйти</button></div>${isSmm() ? '' : `<div class="panel"><h3>Команда</h3><div class="team-list">${users.map(u=>`<div><span class="avatar role-${u.role}">${initials(u.name)}</span><b>${esc(u.name)}</b><em>${ROLES[u.role]}</em></div>`).join('')}</div></div>`}${telegramCardHtml()}${isSmm() ? `<div class="panel ai-control-card"><div class="panel-title-row"><h3>AI-разбор ТЗ</h3><button class="icon-action" id="refresh-ai" title="Проверить состояние">${svg('refresh',16)}</button></div><ul class="clean-list">${aiStatus}</ul>${ollamaAction}</div>` : ''}</section>`;
}
function bindProfile() {
  const link = $('#tg-link'); if (link) link.onclick = async () => {
    try {
      const { url } = await api('/api/telegram/link', 'POST', {});
      window.open(url, '_blank', 'noopener');
      $('#tg-hint').hidden = false; link.disabled = true;
      for (let i = 0; i < 60 && page === 'profile'; i++) {
        await new Promise(r => setTimeout(r, 3000));
        tgStatus = await api('/api/telegram/status');
        if (tgStatus.linked) { render(); toast('Telegram подключён ✓'); return; }
      }
      link.disabled = false;
    } catch (e) { toast(e.message); }
  };
  const unlink = $('#tg-unlink'); if (unlink) unlink.onclick = async () => { try { await api('/api/telegram/unlink', 'POST', {}); await refresh(); render(); toast('Telegram отключён'); } catch (e) { toast(e.message); } };
  $('#save-profile').onclick=async()=>{try{const r=await api('/api/me','PATCH',{name:$('#profile-name').value});me={...me,...r};await refresh();render();toast('Сохранено')}catch(e){toast(e.message)}};
  $('#logout').onclick=async()=>{try{await api('/api/logout','POST',{})}catch(e){} setToken(''); me=null; renderAuth();};
  const refreshAi = $('#refresh-ai'); if (refreshAi) refreshAi.onclick = async () => { try { me = { ...me, ...(await api('/api/ai/status')) }; render(); toast('Статус AI обновлён'); } catch(e) { toast(e.message); } };
  const pullOllama = $('#pull-ollama'); if (pullOllama) pullOllama.onclick = async () => {
    if (!confirm('Скачать бесплатную модель Ollama? Это займёт время и потребует свободного места на компьютере.')) return;
    pullOllama.disabled = true; pullOllama.innerHTML = '<span class="spin"></span> Скачиваем модель…';
    try { me = { ...me, ...(await api('/api/ai/ollama/pull','POST',{})) }; render(); toast('Бесплатный AI готов ✓'); }
    catch(e) { pullOllama.disabled = false; pullOllama.innerHTML = `${svg('download',16)} Скачать бесплатную модель`; toast(e.message); }
  };
}

function modal(html) { $('#modal-root').innerHTML = `<div class="modal-back"><div class="modal"><button class="modal-x" id="modal-x">×</button>${html}</div></div>`; $('#modal-root').hidden=false; $('#modal-x').onclick=closeModal; $('.modal-back').onclick=e=>{if(e.target.classList.contains('modal-back'))closeModal()}; }
function closeModal(){ $('#modal-root').hidden=true; $('#modal-root').innerHTML=''; }

setInterval(async()=>{ if(!me || document.hidden) return; try{ await refresh(); if(['dashboard','board','calendar','notifications'].includes(page) && !$('.modal-back') && !(page==='board' && document.activeElement && document.activeElement.id==='filter-q')) render(); }catch(e){} }, 15000);
(async function boot(){ if(token){ try{ me = await api('/api/me'); await refresh(); openTaskFromLink(); render(); return; }catch(e){} } renderAuth(); })();
