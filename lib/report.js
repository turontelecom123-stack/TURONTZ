/* Team report for a period, built from each task's activity log and files. */

const DONE = ['approved', 'published'];
const CLOSED = ['approved', 'published', 'archived'];
const EXECUTOR_ROLES = ['video', 'edit', 'design'];

const arr = a => (Array.isArray(a) ? a : []);
const ms = v => new Date(v).getTime();

// When the task first reached "approved" or "published".
function completedAt(t) {
  const hits = arr(t.activity)
    .filter(a => a.action === 'approve' || (a.action === 'status' && /→\s*(approved|published)\s*$/.test(String(a.detail || ''))))
    .map(a => ms(a.at)).filter(Number.isFinite);
  if (hits.length) return Math.min(...hits);
  // Old tasks without a log entry: the last update is the best estimate.
  return DONE.includes(t.status) ? ms(t.updatedAt || t.createdAt) : NaN;
}

// Revision rounds. A file sent back also logs the status change, so events within 10 s are one round.
function revisionTimes(t) {
  const times = arr(t.activity)
    .filter(a => a.action === 'revision' || (a.action === 'status' && /→\s*revision\s*$/.test(String(a.detail || ''))))
    .map(a => ms(a.at)).filter(Number.isFinite).sort((a, b) => a - b);
  return times.filter((x, i) => i === 0 || x - times[i - 1] > 10e3);
}

const workFiles = t => arr(t.files).filter(f => f.kind !== 'reference');

// Who gets credit for a finished task: whoever made the approved file, else the named assignees, else anyone who uploaded work.
function creditedFor(t) {
  const approved = [...new Set(workFiles(t).filter(f => f.status === 'approved').map(f => f.uploadedBy).filter(Boolean))];
  if (approved.length) return approved;
  if (arr(t.assigneeIds).length) return arr(t.assigneeIds);
  return [...new Set(workFiles(t).map(f => f.uploadedBy).filter(Boolean))];
}
// Who a revision round belongs to: the author of the newest work file before it.
function revisedFor(t, at) {
  const before = workFiles(t).filter(f => ms(f.uploadedAt) <= at).sort((a, b) => ms(b.uploadedAt) - ms(a.uploadedAt));
  if (before[0] && before[0].uploadedBy) return [before[0].uploadedBy];
  return arr(t.assigneeIds);
}

function buildReport(db, from, to, now = Date.now()) {
  const fromMs = ms(from), toMs = ms(to);
  const inRange = x => Number.isFinite(x) && x >= fromMs && x < toMs;
  const users = arr(db.users);
  const executors = new Set(users.filter(u => EXECUTOR_ROLES.includes(u.role)).map(u => u.id));
  const people = new Map();
  const person = id => {
    if (!people.has(id)) people.set(id, { userId: id, completed: 0, onTime: 0, late: 0, revisions: 0, files: 0, active: 0, overdue: 0 });
    return people.get(id);
  };
  users.filter(u => EXECUTOR_ROLES.includes(u.role) && u.active !== false).forEach(u => person(u.id));

  const totals = { created: 0, completed: 0, onTime: 0, late: 0, revisions: 0, files: 0 };
  const projects = new Map(arr(db.projects).map(p => [p.id, { projectId: p.id, name: p.name, created: 0, completed: 0 }]));

  for (const t of arr(db.tasks)) {
    if (t.status === 'draft') continue;
    const pr = projects.get(t.projectId);
    if (inRange(ms(t.createdAt))) { totals.created++; if (pr) pr.created++; }

    const done = completedAt(t);
    if (inRange(done)) {
      totals.completed++;
      if (pr) pr.completed++;
      const deadline = t.deadline ? ms(t.deadline) : NaN;
      const verdict = Number.isFinite(deadline) ? (done <= deadline ? 'onTime' : 'late') : null;
      if (verdict) totals[verdict]++;
      for (const id of creditedFor(t)) { const p = person(id); p.completed++; if (verdict) p[verdict]++; }
    }

    for (const at of revisionTimes(t).filter(inRange)) {
      totals.revisions++;
      for (const id of revisedFor(t, at)) person(id).revisions++;
    }

    // Files from executors only: a manager attaching the final version is not delivered work.
    for (const f of workFiles(t)) if (inRange(ms(f.uploadedAt)) && executors.has(f.uploadedBy)) { totals.files++; person(f.uploadedBy).files++; }

    // Current load, independent of the period.
    if (!CLOSED.includes(t.status)) {
      const owners = arr(t.assigneeIds).length ? arr(t.assigneeIds) : users.filter(u => u.active !== false && arr(t.roles).includes(u.role)).map(u => u.id);
      const late = t.deadline && ms(t.deadline) < now;
      for (const id of owners) if (people.has(id)) { const p = people.get(id); p.active++; if (late) p.overdue++; }
    }
  }

  const byId = new Map(users.map(u => [u.id, u]));
  const list = [...people.values()]
    .filter(p => executors.has(p.userId))
    .map(p => ({ ...p, name: byId.get(p.userId).name, role: byId.get(p.userId).role }))
    .sort((a, b) => b.completed - a.completed || b.files - a.files || a.name.localeCompare(b.name));
  return { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString(), totals, people: list, projects: [...projects.values()] };
}

module.exports = { buildReport, completedAt, revisionTimes };
