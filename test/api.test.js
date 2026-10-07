const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startServer, seedTeam } = require('./helpers');

let srv, api, team;
test.before(async () => { srv = await startServer(); api = srv.api; team = await seedTeam(api); });
test.after(() => srv.stop());

const newTask = (body = {}) => api('/api/tasks', { method: 'POST', token: team.smm, body: { title: 'Пост', roles: ['design'], ...body } });
const upload = (taskId, name, data, token, kind = 'work') => api(`/api/tasks/${taskId}/upload?name=${encodeURIComponent(name)}&kind=${kind}`, { method: 'POST', token, raw: data });

test('passwords: minimum 6, temporary password must be changed, sessions revoked', async () => {
  assert.equal((await api('/api/admin/users', { method: 'POST', token: team.smm, body: { name: 'Ali', login: 'ali', password: '123', role: 'video' } })).status, 400);
  const me = await api('/api/me', { token: team.dina.token });
  assert.equal(me.data.mustChangePassword, true);
  assert.equal((await api('/api/me', { method: 'PATCH', token: team.dina.token, body: { oldPassword: 'wrong', newPassword: 'new-pass1' } })).status, 400);
  assert.equal((await api('/api/me', { method: 'PATCH', token: team.dina.token, body: { oldPassword: 'dina-pass', newPassword: 'x' } })).status, 400);
  const second = (await api('/api/login', { method: 'POST', body: { login: 'dina', password: 'dina-pass' } })).data.token;
  const changed = await api('/api/me', { method: 'PATCH', token: team.dina.token, body: { oldPassword: 'dina-pass', newPassword: 'new-pass1' } });
  assert.equal(changed.data.mustChangePassword, false);
  assert.equal((await api('/api/me', { token: second })).status, 401, 'other sessions end');
  assert.equal((await api('/api/me', { token: team.dina.token })).status, 200, 'this session stays');

  // Forgotten password: the manager sets a temporary one.
  const reset = await api('/api/admin/users/' + team.dina.id, { method: 'PATCH', token: team.smm, body: { password: 'temp-777' } });
  assert.equal(reset.data.mustChangePassword, true);
  assert.equal((await api('/api/me', { token: team.dina.token })).status, 401);
  team.dina.token = (await api('/api/login', { method: 'POST', body: { login: 'dina', password: 'temp-777' } })).data.token;
  assert.ok(team.dina.token);
  assert.equal((await api('/api/admin/users/' + team.dima.id, { method: 'PATCH', token: team.dina.token, body: { password: 'hacked1' } })).status, 403);
});

test('sign-in is required before the server reads a body; tokens only in the header', async () => {
  assert.equal((await api('/api/tasks', { method: 'POST', raw: 'x'.repeat(100000) })).status, 401);
  const res = await fetch(`${srv.base}/api/tasks?access_token=${team.smm}`);
  assert.equal(res.status, 401);
});

test('an uploaded HTML file downloads instead of running; no public /uploads', async () => {
  const task = (await newTask()).data;
  const res = await upload(task.id, 'brief.html', '<script>alert(1)</script>', team.dina.token);
  assert.equal(res.status, 200);
  const f = res.data.files.at(-1);
  assert.equal(f.type, 'application/octet-stream');
  assert.equal(f.preview, '');
  assert.equal(f.storageKey, undefined);
  assert.equal(f.localName, undefined);
  assert.equal(res.data.status, 'submitted', 'executor upload submits the work');
  const file = await fetch(srv.base + f.href);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'application/octet-stream');
  assert.match(file.headers.get('content-disposition'), /^attachment/);
  const stored = fs.readdirSync(path.join(srv.dir, 'uploads')).find(n => n.endsWith('.html'));
  assert.ok(stored);
  assert.equal((await fetch(`${srv.base}/uploads/${stored}`)).status, 404);
});

test('file links: signature required, tied to a person who can see the task', async () => {
  const task = (await newTask({ assigneeIds: [team.dina.id] })).data;
  const res = await upload(task.id, 'cover.png', Buffer.alloc(5000, 7), team.smm, 'reference');
  const f = res.data.files[0];
  assert.equal(f.preview, 'image');
  assert.equal(f.version, null, 'references are not versions');
  const url = new URL(srv.base + f.href);
  assert.equal((await fetch(url)).status, 200);
  const bad = new URL(url); bad.searchParams.set('s', '0'.repeat(40));
  assert.equal((await fetch(bad)).status, 404);
  const bare = srv.base + url.pathname;
  assert.equal((await fetch(bare)).status, 404);
  assert.equal((await fetch(bare, { headers: { authorization: 'Bearer ' + team.smm } })).status, 200);
  // Dima is a designer too, but the task is addressed to Dina only.
  assert.equal((await fetch(bare, { headers: { authorization: 'Bearer ' + team.dima.token } })).status, 404);
  const range = await fetch(url, { headers: { range: 'bytes=0-99' } });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get('content-range'), 'bytes 0-99/5000');
});

test('executors see tasks addressed to them, or to their role when nobody is named; drafts stay hidden', async () => {
  const named = (await newTask({ title: 'Только Дине', assigneeIds: [team.dina.id] })).data;
  const everyone = (await newTask({ title: 'Всем дизайнерам' })).data;
  const draft = (await newTask({ title: 'Черновик', status: 'draft' })).data;
  const dimaSees = (await api('/api/tasks', { token: team.dima.token })).data.map(t => t.id);
  assert.ok(!dimaSees.includes(named.id));
  assert.ok(dimaSees.includes(everyone.id));
  assert.ok(!dimaSees.includes(draft.id));
  assert.equal((await api('/api/tasks/' + named.id, { method: 'PATCH', token: team.dima.token, body: { status: 'work' } })).status, 404);
  // Sending a draft out notifies the executors as a new task.
  await api('/api/tasks/' + draft.id, { method: 'PATCH', token: team.smm, body: { status: 'new' } });
  const notes = (await api('/api/notifications', { token: team.dima.token })).data;
  assert.ok(notes.some(n => n.taskId === draft.id && n.title === 'Новое ТЗ'));
});

test('references: only web links, "instagram.com/…" gets https', async () => {
  const task = (await newTask({ refs: [{ url: 'javascript:alert(1)' }, { url: 'instagram.com/reel/abc' }, { url: 'https://t.me/x' }, { url: 'data:text/html,hi' }] })).data;
  assert.deepEqual(task.refs.map(r => r.url), ['https://instagram.com/reel/abc', 'https://t.me/x']);
  const parsed = (await api('/api/ai/parse', { method: 'POST', token: team.smm, body: { text: 'Нужен пост про тарифы на завтра', refUrl: 'javascript:alert(1)' } })).data;
  assert.ok(!parsed.refs.some(r => /javascript/.test(r.url)));
});

test('large uploads stream to disk without leftovers', async () => {
  const task = (await newTask()).data;
  const big = Buffer.alloc(20 * 1024 * 1024, 1);
  const res = await upload(task.id, 'reel.mp4', big, team.dina.token);
  assert.equal(res.status, 200);
  const f = res.data.files.at(-1);
  assert.equal(f.size, big.length);
  assert.equal(f.preview, 'video');
  assert.equal(f.version, 1);
  const leftovers = fs.readdirSync(path.join(srv.dir, 'uploads')).filter(n => n.endsWith('.part'));
  assert.deepEqual(leftovers, []);
});

test('a deleted task takes its files with it', async () => {
  const task = (await newTask()).data;
  await upload(task.id, 'a.png', Buffer.alloc(10, 1), team.smm);
  const before = fs.readdirSync(path.join(srv.dir, 'uploads')).length;
  await api('/api/tasks/' + task.id, { method: 'DELETE', token: team.smm });
  assert.equal(fs.readdirSync(path.join(srv.dir, 'uploads')).length, before - 1);
});

test('recurring rules: create, pause, resume, delete', async () => {
  const task = (await newTask({ title: 'Еженедельный пост' })).data;
  assert.equal((await api('/api/recurring', { method: 'POST', token: team.dina.token, body: { taskId: task.id, days: [1], time: '10:00' } })).status, 403);
  assert.equal((await api('/api/recurring', { method: 'POST', token: team.smm, body: { taskId: task.id, days: [], time: '10:00' } })).status, 400);
  const rule = (await api('/api/recurring', { method: 'POST', token: team.smm, body: { taskId: task.id, days: [1, 3], time: '9:30', deadlineHours: 24 } })).data;
  assert.equal(rule.scheduleText, 'пн, ср в 09:30');
  assert.ok(rule.nextRunAt);
  const paused = (await api('/api/recurring/' + rule.id, { method: 'PATCH', token: team.smm, body: { active: false } })).data;
  assert.equal(paused.active, false);
  assert.equal(paused.nextRunAt, null);
  assert.equal((await api('/api/recurring/' + rule.id, { method: 'PATCH', token: team.smm, body: { active: true } })).data.active, true);
  assert.equal((await api('/api/recurring/' + rule.id, { method: 'DELETE', token: team.smm })).status, 200);
  assert.equal((await api('/api/recurring', { token: team.smm })).data.length, 0);
});

test('report endpoint: managers only, needs a period', async () => {
  assert.equal((await api('/api/admin/report?from=2026-10-01&to=2026-10-31', { token: team.dina.token })).status, 403);
  assert.equal((await api('/api/admin/report', { token: team.smm })).status, 400);
  const r = (await api('/api/admin/report?from=2000-01-01&to=2100-01-01', { token: team.smm })).data;
  assert.ok(r.totals.created > 0);
  assert.ok(r.people.every(p => ['video', 'edit', 'design'].includes(p.role)));
});

test('the app page sends a script policy; data files are not served', async () => {
  const page = await fetch(srv.base + '/');
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  for (const p of ['/db.json', '/server.js', '/telegram.json', '/backups/x.json', '/lib/files.js', '/../server.js']) assert.equal((await fetch(srv.base + p)).status, 404, p);
  for (const p of ['/manifest.webmanifest', '/sw.js', '/icons/icon-192.png']) assert.equal((await fetch(srv.base + p)).status, 200, p);
});
