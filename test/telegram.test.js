/* The bot, reminders and backups against a fake Telegram API. */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { startServer, seedTeam } = require('./helpers');

const BOSS_CHAT = 111;
function fakeTelegram() {
  const sent = [], updates = [];
  let nextId = 1;
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const method = req.url.split('/').pop();
      const reply = result => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, result })); };
      if (req.url.startsWith('/file/')) { res.writeHead(200); return res.end(Buffer.from('fake-jpeg-bytes')); }
      if (method === 'getMe') return reply({ username: 'turontz_test_bot' });
      if (method === 'getFile') return reply({ file_path: 'photos/file_1.jpg' });
      if (method === 'getUpdates') {
        const offset = JSON.parse(raw.toString()).offset || 0;
        const ready = () => updates.filter(u => u.update_id >= offset);
        if (ready().length) return reply(ready());
        return setTimeout(() => reply(ready()), 150);
      }
      if (method === 'sendDocument') { sent.push({ method, raw: raw.toString('utf8') }); return reply({ message_id: 1 }); }
      sent.push({ method, ...JSON.parse(raw.toString() || '{}') });
      return reply({ message_id: 1 });
    });
  });
  return {
    sent,
    push: update => updates.push({ update_id: nextId++, ...update }),
    listen: () => new Promise(r => server.listen(0, '127.0.0.1', () => r(server.address().port))),
    close: () => new Promise(r => server.close(r)),
  };
}
async function waitFor(fn, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = fn(); if (v) return v; await new Promise(r => setTimeout(r, 50)); }
  throw new Error('timed out');
}

let tg, srv, api, team;
test.before(async () => {
  tg = fakeTelegram();
  const port = await tg.listen();
  srv = await startServer({ TELEGRAM_API_URL: `http://127.0.0.1:${port}`, TELEGRAM_BOT_TOKEN: '123456:TEST_TOKEN_abcdefghijklmnop', TURON_SCHEDULER_MS: '250', MAX_UPLOAD_MB: '1' });
  api = srv.api; team = await seedTeam(api);
});
test.after(async () => { await srv.stop(); await tg.close(); });

test('a manager links Telegram with a one-time code', async () => {
  const status = await waitFor(async () => (await api('/api/telegram/status', { token: team.smm })).data.configured && true);
  assert.ok(status);
  const { url } = (await api('/api/telegram/link', { method: 'POST', token: team.smm })).data;
  const code = new URL(url).searchParams.get('start');
  tg.push({ message: { message_id: 1, chat: { id: BOSS_CHAT, type: 'private' }, from: { id: BOSS_CHAT, username: 'boss' }, text: '/start ' + code } });
  await waitFor(() => tg.sent.find(m => m.method === 'sendMessage' && m.chat_id === BOSS_CHAT && /Готово/.test(m.text)));
  assert.equal((await api('/api/telegram/status', { token: team.smm })).data.linked, true);
});

test('a TZ written to the bot becomes a draft with buttons, then a task with the photo', async () => {
  tg.push({ message: { message_id: 2, chat: { id: BOSS_CHAT, type: 'private' }, from: { id: BOSS_CHAT },
    caption: 'Turon Market: пост про скидки на роутеры, дедлайн завтра в 18:00', photo: [{ file_id: 'small' }, { file_id: 'big' }] } });
  const draft = await waitFor(() => tg.sent.find(m => m.method === 'sendMessage' && m.reply_markup));
  assert.match(draft.text, /Черновик ТЗ/);
  assert.match(draft.text, /Референсов: 1/);
  const sendButton = draft.reply_markup.inline_keyboard[0][0].callback_data;
  assert.match(sendButton, /^tz:send:/);

  // Someone else's chat cannot press the button.
  tg.push({ callback_query: { id: 'cq0', from: { id: 999 }, message: { chat: { id: 999 }, message_id: 9 }, data: sendButton } });
  await waitFor(() => tg.sent.find(m => m.method === 'answerCallbackQuery' && m.callback_query_id === 'cq0'));

  tg.push({ callback_query: { id: 'cq1', from: { id: BOSS_CHAT }, message: { chat: { id: BOSS_CHAT }, message_id: 7 }, data: sendButton } });
  const edited = await waitFor(() => tg.sent.find(m => m.method === 'editMessageText' && /отправлено/.test(m.text)));
  assert.equal(edited.message_id, 7);
  const tasks = (await api('/api/tasks', { token: team.smm })).data;
  const task = tasks.find(t => t.source === 'telegram');
  assert.ok(task, 'task created');
  assert.equal(task.status, 'new');
  assert.ok(task.deadline);
  const withFile = await waitFor(async () => {
    const t = (await api('/api/tasks', { token: team.smm })).data.find(x => x.id === task.id);
    return t.files.length ? t : null;
  });
  assert.equal(withFile.files[0].kind, 'reference');
  // Designers got the "new task" notification.
  assert.ok((await api('/api/notifications', { token: team.dina.token })).data.some(n => n.taskId === task.id && n.title === 'Новое ТЗ'));
  // A pressed button cannot create the task twice.
  tg.push({ callback_query: { id: 'cq2', from: { id: BOSS_CHAT }, message: { chat: { id: BOSS_CHAT }, message_id: 7 }, data: sendButton } });
  await waitFor(() => tg.sent.find(m => m.method === 'answerCallbackQuery' && m.callback_query_id === 'cq2'));
  assert.equal((await api('/api/tasks', { token: team.smm })).data.filter(t => t.source === 'telegram').length, 1);
});

test('voice messages get the dictation hint', async () => {
  tg.push({ message: { message_id: 3, chat: { id: BOSS_CHAT, type: 'private' }, from: { id: BOSS_CHAT }, voice: { file_id: 'v' } } });
  await waitFor(() => tg.sent.find(m => m.method === 'sendMessage' && /диктовка/.test(m.text)));
});

test('deadline reminders reach the app and Telegram', async () => {
  const soon = (await api('/api/tasks', { method: 'POST', token: team.smm, body: { title: 'Срочный макет', roles: ['design'], assigneeIds: [team.dina.id], deadline: new Date(Date.now() + 1500).toISOString() } })).data;
  const twoHours = (await api('/api/tasks', { method: 'POST', token: team.smm, body: { title: 'Через два часа', roles: ['design'], assigneeIds: [team.dina.id], deadline: new Date(Date.now() + 2 * 3600e3 + 1500).toISOString() } })).data;
  await waitFor(async () => (await api('/api/notifications', { token: team.dina.token })).data.some(n => n.taskId === soon.id && n.title === 'Дедлайн просрочен'), 8000);
  await waitFor(async () => (await api('/api/notifications', { token: team.dina.token })).data.some(n => n.taskId === twoHours.id && n.title === 'Дедлайн через 2 часа'), 8000);
  // The author is told about the missed deadline too — here, in Telegram.
  await waitFor(() => tg.sent.find(m => m.method === 'sendMessage' && m.chat_id === BOSS_CHAT && /Дедлайн просрочен/.test(m.text) && /Срочный макет/.test(m.text)));
  await new Promise(r => setTimeout(r, 800));
  const count = (await api('/api/notifications', { token: team.dina.token })).data.filter(n => n.taskId === soon.id && n.title === 'Дедлайн просрочен').length;
  assert.equal(count, 1, 'sent once');
});

test('database backup goes to Telegram without sessions', async () => {
  assert.equal((await api('/api/me', { method: 'PATCH', token: team.smm, body: { backupToTelegram: true } })).data.backupToTelegram, true);
  assert.equal((await api('/api/me', { method: 'PATCH', token: team.dina.token, body: { backupToTelegram: true } })).status, 403);
  const res = await api('/api/telegram/backup', { method: 'POST', token: team.smm });
  assert.equal(res.status, 200);
  const doc = await waitFor(() => tg.sent.find(m => m.method === 'sendDocument'));
  assert.match(doc.raw, /filename="turontz-db-\d{4}-\d{2}-\d{2}\.json"/);
  assert.match(doc.raw, /name="chat_id"\r\n\r\n111\r\n/);
  const json = JSON.parse(doc.raw.slice(doc.raw.indexOf('{"users"'), doc.raw.lastIndexOf('}') + 1));
  assert.deepEqual(json.tokens, {});
  assert.equal(json.meta.fileSecret, undefined);
  assert.ok(json.tasks.length > 0);
});

test('uploads over the limit are refused and leave nothing behind', async () => {
  const task = (await api('/api/tasks', { method: 'POST', token: team.smm, body: { title: 'Видео', roles: ['design'] } })).data;
  const res = await api(`/api/tasks/${task.id}/upload?name=big.mp4`, { method: 'POST', token: team.smm, raw: Buffer.alloc(2 * 1024 * 1024, 1) });
  assert.equal(res.status, 413);
  assert.deepEqual(fs.readdirSync(path.join(srv.dir, 'uploads')).filter(n => n.endsWith('.part')), []);
});
