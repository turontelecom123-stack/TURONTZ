const test = require('node:test');
const assert = require('node:assert/strict');
const Files = require('../lib/files');
const Schedule = require('../lib/schedule');
const { buildReport } = require('../lib/report');

const H = 3600e3;

test('uploaded HTML or SVG never opens as a page', () => {
  for (const name of ['brief.html', 'x.htm', 'logo.svg', 'a.js', 'noext']) {
    const h = Files.fileHeaders(name, 10);
    assert.equal(h['content-type'], 'application/octet-stream', name);
    assert.match(h['content-disposition'], /^attachment;/, name);
  }
});

test('media opens inline inside a sandbox, PDF inline without it', () => {
  const png = Files.fileHeaders('Cover.PNG', 10);
  assert.equal(png['content-type'], 'image/png');
  assert.match(png['content-disposition'], /^inline;/);
  assert.match(png['content-security-policy'], /sandbox/);
  assert.equal(Files.fileHeaders('reel.mov')['content-type'], 'video/quicktime');
  const pdf = Files.fileHeaders('brief.pdf');
  assert.equal(pdf['content-type'], 'application/pdf');
  assert.equal(pdf['content-security-policy'], undefined);
});

test('byte ranges for video playback', () => {
  assert.deepEqual(Files.parseRange('bytes=0-99', 1000), { start: 0, end: 99 });
  assert.deepEqual(Files.parseRange('bytes=900-', 1000), { start: 900, end: 999 });
  assert.deepEqual(Files.parseRange('bytes=-100', 1000), { start: 900, end: 999 });
  assert.equal(Files.parseRange('bytes=1000-', 1000), null);
  assert.equal(Files.parseRange('items=0-1', 1000), null);
});

test('reminders: 24h, 2h, overdue — once each', () => {
  const now = Date.parse('2026-10-07T10:00:00Z');
  const task = { status: 'work', deadline: new Date(now + 30 * H).toISOString() };
  let r = Schedule.reminderStep(task, undefined, now);
  assert.equal(r.send, null, 'first sight never sends');
  r = Schedule.reminderStep(task, r.state, now + 7 * H);
  assert.equal(r.send, 'd24');
  assert.equal(Schedule.reminderStep(task, r.state, now + 8 * H).send, null, 'not twice');
  r = Schedule.reminderStep(task, r.state, now + 28.5 * H);
  assert.equal(r.send, 'h2');
  r = Schedule.reminderStep(task, r.state, now + 31 * H);
  assert.equal(r.send, 'overdue');
  assert.equal(Schedule.reminderStep(task, r.state, now + 32 * H).send, null);
});

test('reminders: a task created close to its deadline is not reminded at once', () => {
  const now = Date.parse('2026-10-07T10:00:00Z');
  const task = { status: 'new', deadline: new Date(now + 1 * H).toISOString() };
  const first = Schedule.reminderStep(task, undefined, now);
  assert.equal(first.send, null);
  assert.equal(Schedule.reminderStep(task, first.state, now + 10 * 60e3).send, null);
  assert.equal(Schedule.reminderStep(task, first.state, now + 1.5 * H).send, 'overdue');
});

test('reminders: a new deadline starts over; finished tasks are silent', () => {
  const now = Date.parse('2026-10-07T10:00:00Z');
  const task = { status: 'work', deadline: new Date(now + 20 * H).toISOString() };
  const s = Schedule.reminderStep(task, undefined, now).state;
  task.deadline = new Date(now + 50 * H).toISOString();
  const moved = Schedule.reminderStep(task, s, now);
  assert.equal(moved.state.for, task.deadline);
  assert.equal(moved.state.d24, false);
  assert.equal(Schedule.reminderStep({ ...task, status: 'submitted' }, moved.state, now + 49 * H).send, null);
});

test('recurring: next run in Tashkent time, missed runs collapse', () => {
  // 2026-10-07 is a Wednesday. Mon/Thu at 10:00 Tashkent = 05:00 UTC.
  const rule = { schedule: { days: [1, 4], time: '10:00' }, createdAt: '2026-10-07T12:00:00Z', lastRunAt: '2026-10-07T12:00:00Z' };
  assert.equal(Schedule.nextRun(rule, rule.lastRunAt).toISOString(), '2026-10-08T05:00:00.000Z');
  assert.equal(Schedule.dueRun(rule, Date.parse('2026-10-08T04:59:00Z')), null);
  assert.ok(Schedule.dueRun(rule, Date.parse('2026-10-08T05:00:30Z')));
  // Server off for two weeks: still one due run, not many.
  assert.ok(Schedule.dueRun(rule, Date.parse('2026-10-22T09:00:00Z')));
  assert.equal(Schedule.dueRun({ ...rule, active: false }, Date.parse('2026-10-09T00:00:00Z')), null);
  assert.equal(Schedule.nextRun({ schedule: { days: [], time: '10:00' } }, Date.now()), null);
});

test('report: completed, on time, late and revisions per executor', () => {
  const at = s => `2026-10-${s}`;
  const db = {
    users: [{ id: 'm', role: 'smm', name: 'Boss' }, { id: 'a', role: 'design', name: 'Ann' }, { id: 'b', role: 'video', name: 'Bob' }],
    projects: [{ id: 'p', name: 'P' }],
    tasks: [
      { id: 't1', projectId: 'p', status: 'approved', createdAt: at('02T08:00:00Z'), deadline: at('05T13:00:00Z'), assigneeIds: ['a'],
        files: [{ id: 'f1', kind: 'work', uploadedBy: 'a', uploadedAt: at('03T08:00:00Z'), status: 'revision' }, { id: 'f2', kind: 'work', uploadedBy: 'a', uploadedAt: at('04T08:00:00Z'), status: 'approved' }],
        activity: [{ action: 'revision', at: at('03T09:00:00Z') }, { action: 'status', detail: 'submitted → revision', at: at('03T09:00:01Z') }, { action: 'approve', at: at('04T10:00:00Z') }] },
      { id: 't2', projectId: 'p', status: 'published', createdAt: at('02T08:00:00Z'), deadline: at('03T13:00:00Z'), assigneeIds: ['b'], files: [],
        activity: [{ action: 'status', detail: 'work → approved', at: at('06T10:00:00Z') }, { action: 'status', detail: 'approved → published', at: at('07T10:00:00Z') }] },
      { id: 't3', projectId: 'p', status: 'work', createdAt: at('09T08:00:00Z'), deadline: at('01T13:00:00Z'), roles: ['video'], files: [], activity: [] },
    ],
  };
  const r = buildReport(db, '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z', Date.parse('2026-10-10T00:00:00Z'));
  assert.deepEqual(r.totals, { created: 3, completed: 2, onTime: 1, late: 1, revisions: 1, files: 2 });
  const ann = r.people.find(p => p.userId === 'a'), bob = r.people.find(p => p.userId === 'b');
  assert.deepEqual([ann.completed, ann.onTime, ann.late, ann.revisions, ann.files], [1, 1, 0, 1, 2]);
  assert.deepEqual([bob.completed, bob.onTime, bob.late, bob.active, bob.overdue], [1, 0, 1, 1, 1]);
  assert.ok(!r.people.some(p => p.userId === 'm'), 'managers are not in the table');
});
