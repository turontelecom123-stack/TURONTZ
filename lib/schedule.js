/* Time-based rules: deadline reminders and recurring tasks.
   Pure functions, so the timing can be tested without a running server. */

const TZ_OFFSET_MIN = Number(process.env.TZ_OFFSET_MIN || 300); // Asia/Tashkent: UTC+5, no DST
const HOUR = 3600e3;

// Statuses where the executor still has to deliver something.
const REMINDER_STATUSES = ['new', 'clarify', 'work', 'waiting', 'revision'];

// Wall-clock parts of a moment in the team's time zone. dow: 1 = Monday … 7 = Sunday.
function localParts(date, tzMin = TZ_OFFSET_MIN) {
  const d = new Date(new Date(date).getTime() + tzMin * 60e3);
  const z = n => String(n).padStart(2, '0');
  return {
    y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), hh: d.getUTCHours(), mi: d.getUTCMinutes(),
    dow: d.getUTCDay() || 7,
    date: `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())}`,
  };
}
function atLocal(y, m, d, hh, mi, tzMin = TZ_OFFSET_MIN) {
  return new Date(Date.UTC(y, m, d, hh, mi) - tzMin * 60e3);
}
// "YYYY-MM-DD" in the team's zone → the moment that day starts.
function localDayStart(ymd, tzMin = TZ_OFFSET_MIN) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
  return m ? atLocal(+m[1], +m[2] - 1, +m[3], 0, 0, tzMin) : null;
}

/* Decides which deadline reminder a task is due for.
   state is the task's stored `reminders` object; the returned state replaces it.
   A window the task was already inside when its deadline was first seen is marked
   as done without sending: the person just received the task or the new date. */
function reminderStep(task, state, now) {
  const deadline = task.deadline ? new Date(task.deadline).getTime() : NaN;
  if (!REMINDER_STATUSES.includes(task.status) || !Number.isFinite(deadline)) return { state, send: null };
  const nowMs = new Date(now).getTime();
  const left = deadline - nowMs;
  let s = state && state.for === task.deadline ? { ...state } : null;
  if (!s) {
    s = { for: task.deadline, d24: left <= 24 * HOUR, h2: left <= 2 * HOUR, overdue: left <= 0 };
    return { state: s, send: null };
  }
  if (left <= 0) {
    if (s.overdue) return { state: s, send: null };
    // Long past (server was off, or the date was set in the past): mark quietly.
    const send = left > -6 * HOUR ? 'overdue' : null;
    return { state: { ...s, d24: true, h2: true, overdue: true }, send };
  }
  if (left <= 2 * HOUR) {
    if (s.h2) return { state: s, send: null };
    return { state: { ...s, d24: true, h2: true }, send: 'h2' };
  }
  if (left <= 24 * HOUR) {
    if (s.d24) return { state: s, send: null };
    return { state: { ...s, d24: true }, send: 'd24' };
  }
  return { state: s, send: null };
}

function parseTime(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || '').trim());
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return { hh: +m[1], mi: +m[2] };
}

// First scheduled moment of a recurring rule strictly after `after`.
// rule.schedule = { days: [1..7], time: 'HH:MM' } in the team's time zone.
function nextRun(rule, after, tzMin = TZ_OFFSET_MIN) {
  const t = parseTime(rule.schedule && rule.schedule.time);
  const days = (rule.schedule && Array.isArray(rule.schedule.days) ? rule.schedule.days : []).filter(d => d >= 1 && d <= 7);
  if (!t || !days.length) return null;
  const afterMs = new Date(after).getTime();
  const base = localParts(afterMs, tzMin);
  for (let i = 0; i <= 7; i++) {
    const candidate = atLocal(base.y, base.m, base.d + i, t.hh, t.mi, tzMin);
    if (candidate.getTime() > afterMs && days.includes(localParts(candidate, tzMin).dow)) return candidate;
  }
  return null;
}

// The run a rule owes at `now`, or null. Missed runs while the server was off collapse into one.
function dueRun(rule, now, tzMin = TZ_OFFSET_MIN) {
  if (!rule || rule.active === false) return null;
  const next = nextRun(rule, rule.lastRunAt || rule.createdAt, tzMin);
  return next && next.getTime() <= new Date(now).getTime() ? next : null;
}

module.exports = { TZ_OFFSET_MIN, REMINDER_STATUSES, localParts, atLocal, localDayStart, reminderStep, parseTime, nextRun, dueRun };
