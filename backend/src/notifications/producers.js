// Makes notifications from what falls due (research R5). Each has a dedupe key, so a run that
// repeats (a second server, a restart) never makes a second notice for the same moment.
import { query } from '../db/index.js';
import { isoDateOf, persianTime } from '../agent/time.js';
import { pathFor } from '../search/sources.js';
import { body, deliverAfter, eventDueAt, eventIsDue, keys, taskDueAt, taskIsDue, title, whenLabel, withinLookback } from './schedule.js';
import { channelsFor, isOff, mergeSettings } from './settings.js';

const OPEN = `COALESCE(status::text, 'pending') NOT IN ('completed', 'done', 'cancelled')`;
const STATUS_LABEL = {
  pending: 'در انتظار', in_progress: 'در حال انجام', accepted: 'پذیرفته شد', completed: 'انجام شد',
  done: 'انجام شد', cancelled: 'لغو شد', rejected: 'رد شد', blocked: 'متوقف شد',
};
const DISPLAY_NAME = (p, u) => `COALESCE(NULLIF(${p}.full_name, ''), NULLIF(trim(concat_ws(' ', ${p}.first_name, ${p}.last_name)), ''), NULLIF(${p}.display_name, ''), ${u}.email)`;

/** Settings of these people, defaults for those who never changed them. */
export async function loadSettings(userIds) {
  const ids = [...new Set(userIds.filter(Boolean).map(String))];
  const out = new Map(ids.map((id) => [id, mergeSettings(null)]));
  if (!ids.length) return out;
  const { rows } = await query('SELECT * FROM notification_settings WHERE user_id = ANY($1::uuid[])', [ids]);
  for (const r of rows) out.set(String(r.user_id), mergeSettings(r));
  return out;
}

/**
 * Stores one notification and its outside deliveries (the person's channels for this type, after
 * their quiet hours). Returns its id, or null when it already existed or the type is turned off.
 */
export async function createNotification(n, settings, now = new Date()) {
  if (isOff(settings, n.type)) return null;
  const { rows } = await query(
    `INSERT INTO notifications (user_id, type, title, body, sender_id, ref_type, ref_id, path, due_at, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (user_id, dedupe_key) DO NOTHING RETURNING id`,
    [n.user_id, n.type, title(n.title), body(n.body), n.sender_id ?? null, n.ref_type ?? null,
      n.ref_id === undefined || n.ref_id === null ? null : String(n.ref_id), n.path ?? null, n.due_at, n.dedupe_key],
  );
  const id = rows[0]?.id;
  if (!id) return null;
  const after = deliverAfter(now, settings);
  for (const channel of channelsFor(settings, n.type)) {
    await query(
      `INSERT INTO notification_deliveries (notification_id, channel, deliver_after) VALUES ($1, $2, $3)
       ON CONFLICT (notification_id, channel) DO NOTHING`,
      [id, channel, after],
    );
  }
  return id;
}

async function reminders(now) {
  const { rows } = await query(
    `SELECT id, user_id, title, start_date FROM calendar_events
      WHERE event_type = 'reminder' AND start_date <= $1 AND start_date > $1::timestamptz - interval '24 hours'`, [now]);
  return rows.map((r) => ({
    user_id: r.user_id, type: 'reminder', due_at: new Date(r.start_date),
    title: `یادآوری: ${r.title}`, bodyAt: r.start_date, ref_type: 'event', ref_id: r.id,
    path: pathFor('reminder', r), dedupe_key: keys.reminder(r.id, r.start_date),
  }));
}

async function events(now) {
  const near = [now, 'interval \'1 day\''];
  const [calendar, meetings, lists] = await Promise.all([
    query(`SELECT id, user_id, title, start_date, COALESCE(all_day, false) AS all_day FROM calendar_events
            WHERE COALESCE(event_type, '') <> 'reminder'
              AND start_date BETWEEN $1::timestamptz - ${near[1]} AND $1::timestamptz + ${near[1]}`, [now]),
    query(`SELECT id, user_id, title, COALESCE(meeting_date, start_time) AS start FROM meetings
            WHERE COALESCE(meeting_date, start_time) BETWEEN $1::timestamptz - interval '1 hour' AND $1::timestamptz + interval '1 hour'`, [now]),
    query(`SELECT user_id, data FROM user_collections WHERE collection = 'meetings_v3' AND jsonb_typeof(data) = 'array'`),
  ]);
  const out = [];
  for (const e of calendar.rows) out.push({ source: 'calendar', id: e.id, user_id: e.user_id, title: e.title, start: e.start_date, allDay: e.all_day, path: pathFor('event', e) });
  for (const m of meetings.rows) out.push({ source: 'meeting', id: m.id, user_id: m.user_id, title: m.title, start: m.start, path: pathFor('meeting', m) });
  for (const doc of lists.rows) {
    for (const m of doc.data) {
      if (!m?.id || !m.date || !m.title) continue;
      const start = new Date(m.date);
      if (Number.isNaN(start.getTime()) || Math.abs(start - now) > 60 * 60 * 1000) continue;
      out.push({ source: 'minutes', id: m.id, user_id: doc.user_id, title: m.title, start, path: pathFor('minutes', m) });
    }
  }
  return out;
}

async function dueTasks(now) {
  const window = `BETWEEN $1::timestamptz - interval '2 days' AND $1::timestamptz + interval '2 days'`;
  const [planned, tracked] = await Promise.all([
    query(`SELECT id, user_id, title, due_date FROM personal_planning WHERE due_date ${window} AND ${OPEN}`, [now]),
    // tasks the assistant tracks (no one else assigned) are the delegator's; assigned ones are the
    // assignee's when they have an account here
    query(`SELECT d.id, d.title, d.due_date, d.delegator_id,
                  COALESCE(d.assignee_id, d.delegatee_id, u.id) AS assignee,
                  (d.assignee_id IS NULL AND d.delegatee_id IS NULL AND NULLIF(d.delegatee_email, '') IS NULL
                    AND NULLIF(d.delegatee_name, '') IS NULL) AS own
             FROM delegation_tasks d LEFT JOIN users u ON lower(u.email) = lower(d.delegatee_email)
            WHERE d.due_date ${window} AND ${OPEN.replace('status', 'd.status')}`, [now]),
  ]);
  return [
    ...planned.rows.map((t) => ({ source: 'task', id: t.id, user_id: t.user_id, title: t.title, due: t.due_date, path: pathFor('task', t) })),
    ...tracked.rows.filter((t) => t.assignee || t.own).map((t) => ({
      source: 'delegated', id: t.id, user_id: t.assignee || t.delegator_id, title: t.title, due: t.due_date, path: pathFor('delegated', t),
    })),
  ];
}

async function invitations(now) {
  const { rows } = await query(
    `SELECT i.id, i.token, i.created_at, u.id AS user_id, o.name AS org_name, ${DISPLAY_NAME('p', 'iu')} AS inviter
       FROM organization_invitations i
       JOIN users u ON lower(u.email) = lower(i.email)
       JOIN organizations o ON o.id = i.organization_id
       LEFT JOIN users iu ON iu.id = i.invited_by
       LEFT JOIN user_profiles p ON p.user_id = i.invited_by
      WHERE COALESCE(i.status, 'pending') = 'pending' AND i.created_at > $1::timestamptz - interval '24 hours' AND i.created_at <= $1`, [now]);
  return rows.map((r) => ({
    user_id: r.user_id, type: 'invitation', due_at: new Date(r.created_at),
    title: `دعوت به «${r.org_name}»`, body: `${r.inviter || 'یکی از اعضا'} شما را به این سازمان دعوت کرده است`,
    ref_type: 'invitation', ref_id: r.id, path: pathFor('invitation', r), dedupe_key: keys.invitation(r.id),
  }));
}

async function delegation(now) {
  const { rows } = await query(
    `SELECT d.id, d.title, d.status, d.created_at, d.updated_at, d.delegator_id, d.delegatee_name,
            COALESCE(d.assignee_id, d.delegatee_id, u.id) AS assignee,
            ${DISPLAY_NAME('dp', 'du')} AS delegator_name, ${DISPLAY_NAME('ap', 'au')} AS assignee_name,
            (d.assignee_id IS NOT NULL OR d.delegatee_id IS NOT NULL OR NULLIF(d.delegatee_email, '') IS NOT NULL
              OR NULLIF(d.delegatee_name, '') IS NOT NULL) AS has_assignee
       FROM delegation_tasks d
       LEFT JOIN users u ON lower(u.email) = lower(d.delegatee_email)
       LEFT JOIN users du ON du.id = d.delegator_id LEFT JOIN user_profiles dp ON dp.user_id = d.delegator_id
       LEFT JOIN users au ON au.id = COALESCE(d.assignee_id, d.delegatee_id, u.id)
       LEFT JOIN user_profiles ap ON ap.user_id = COALESCE(d.assignee_id, d.delegatee_id, u.id)
      WHERE GREATEST(d.created_at, COALESCE(d.updated_at, d.created_at)) > $1::timestamptz - interval '24 hours'`, [now]);
  const out = [];
  for (const d of rows) {
    const assignee = d.assignee ? String(d.assignee) : null;
    const delegator = String(d.delegator_id);
    if (assignee && assignee !== delegator && withinLookback(new Date(d.created_at), now)) {
      out.push({
        user_id: assignee, type: 'delegated', due_at: new Date(d.created_at), title: `کار تازه: ${d.title}`,
        body: `از طرف ${d.delegator_name || 'یکی از همکاران'}`, ref_type: 'delegated', ref_id: d.id,
        path: pathFor('delegated', d), dedupe_key: keys.delegated(d.id),
      });
    }
    const status = String(d.status || 'pending');
    const changed = new Date(d.updated_at || d.created_at);
    if (d.has_assignee && assignee !== delegator && status !== 'pending' && withinLookback(changed, now)) {
      out.push({
        user_id: delegator, type: 'delegation_status', due_at: changed,
        title: `${d.title}: ${STATUS_LABEL[status] || status}`,
        body: `${d.assignee_name || d.delegatee_name || 'انجام‌دهنده'} وضعیت این کار را تغییر داد`,
        ref_type: 'delegated', ref_id: d.id, path: pathFor('delegated', d), dedupe_key: keys.delegationStatus(d.id, status),
      });
    }
  }
  return out;
}

/** One pass: everything due by `now` becomes a notification once. Returns how many were made. */
export async function produce(now = new Date()) {
  const results = await Promise.allSettled([reminders(now), events(now), dueTasks(now), invitations(now), delegation(now)]);
  for (const r of results) if (r.status === 'rejected') console.warn('[notify] a source was skipped:', r.reason?.message);
  const [rem, ev, tasks, inv, del] = results.map((r) => (r.status === 'fulfilled' ? r.value : []));
  const settings = await loadSettings([...rem, ...ev, ...tasks, ...inv, ...del].map((n) => n.user_id));
  const tzOf = (userId) => settings.get(String(userId))?.tz || 'Asia/Tehran';

  const ready = [...inv, ...del];
  for (const r of rem) {
    if (!withinLookback(r.due_at, now)) continue;
    ready.push({ ...r, body: whenLabel(new Date(r.bodyAt), tzOf(r.user_id)) });
  }
  for (const e of ev) {
    const tz = tzOf(e.user_id);
    const due = eventDueAt(e.start, { allDay: e.allDay, tz });
    const isDue = e.allDay ? taskIsDue(e.start, now, tz) : eventIsDue(e.start, due, now);
    if (!isDue) continue;
    ready.push({
      user_id: e.user_id, type: 'event', due_at: due, title: e.title,
      body: e.allDay ? 'امروز' : `تا ۱۵ دقیقه دیگر، ساعت ${persianTime(new Date(e.start), tz)}`,
      ref_type: e.source, ref_id: e.id, path: e.path, dedupe_key: keys.event(e.source, e.id, e.start),
    });
  }
  for (const t of tasks) {
    const tz = tzOf(t.user_id);
    if (!taskIsDue(t.due, now, tz)) continue;
    ready.push({
      user_id: t.user_id, type: 'task_due', due_at: taskDueAt(t.due, tz), title: `موعد امروز: ${t.title}`, body: null,
      ref_type: t.source, ref_id: t.id, path: t.path, dedupe_key: keys.taskDue(t.source, t.id, isoDateOf(new Date(t.due), tz)),
    });
  }

  let made = 0;
  for (const n of ready) {
    try {
      if (await createNotification(n, settings.get(String(n.user_id)), now)) made += 1;
    } catch (err) {
      console.warn('[notify] could not store a notification:', err.message);
    }
  }
  return made;
}
