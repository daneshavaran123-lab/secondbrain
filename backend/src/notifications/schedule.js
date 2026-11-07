// When things are due and when a notification may go out (research R4, R5, R7). Pure functions.
import { isoDateOf, persianDateLabel, persianTime, timeOf, zonedToUtc } from '../agent/time.js';

export const EVENT_LEAD_MIN = 15;
export const TASK_DUE_TIME = '08:00';
/** Notifications for things that fell due while the server was down are still made within this window */
export const LOOKBACK_MS = 24 * 60 * 60 * 1000;

const MIN = 60 * 1000;

/** A calendar event or meeting: 15 minutes before it starts; an all-day event at 08:00 that day. */
export function eventDueAt(start, { allDay = false, tz }) {
  const at = new Date(start);
  if (allDay) return zonedToUtc(isoDateOf(at, tz), TASK_DUE_TIME, tz);
  return new Date(at.getTime() - EVENT_LEAD_MIN * MIN);
}

/**
 * A meeting is worth a notice only between its notice time and its start: a minutes record
 * written after the meeting (dated when it was written) must not announce it.
 */
export const eventIsDue = (start, dueAt, now) => dueAt <= now && now < new Date(start);

/** A task due on its due date (the person's calendar day) at 08:00. */
export function taskDueAt(dueDate, tz) {
  return zonedToUtc(isoDateOf(new Date(dueDate), tz), TASK_DUE_TIME, tz);
}

/** The task is due today in the person's time zone and it is already 08:00 there. */
export const taskIsDue = (dueDate, now, tz) =>
  isoDateOf(new Date(dueDate), tz) === isoDateOf(now, tz) && taskDueAt(dueDate, tz) <= now;

/** Still inside the window for things that fell due while nothing was running. */
export const withinLookback = (dueAt, now) => dueAt <= now && now.getTime() - dueAt.getTime() <= LOOKBACK_MS;

const minutesOf = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
};

/**
 * When outside channels (push, SMS, email) may deliver a notification due at `dueAt`: the end of
 * the person's quiet window if it falls inside it (the window may cross midnight), else `dueAt`.
 */
export function deliverAfter(dueAt, { quiet_start: start, quiet_end: end, tz }) {
  if (!start || !end || start === end) return dueAt;
  const local = minutesOf(timeOf(dueAt, tz));
  const s = minutesOf(start);
  const e = minutesOf(end);
  const inside = s < e ? local >= s && local < e : local >= s || local < e;
  if (!inside) return dueAt;
  const day = isoDateOf(dueAt, tz);
  let until = zonedToUtc(day, end, tz);
  if (until <= dueAt) until = new Date(until.getTime() + 24 * 60 * MIN);
  return until;
}

/** Is `now` inside the person's quiet window, and until when (for the in-app system notification). */
export function quietUntil(now, settings) {
  const until = deliverAfter(now, settings);
  return until > now ? until : null;
}

/** Dedupe keys: the due time is part of a key, so moving a meeting makes a new notice for the new time. */
export const keys = {
  reminder: (id, start) => `reminder:${id}:${new Date(start).toISOString()}`,
  event: (source, id, start) => `event:${source}:${id}:${new Date(start).toISOString()}`,
  taskDue: (source, id, date) => `task_due:${source}:${id}:${date}`,
  invitation: (id) => `invite:${id}`,
  delegated: (id) => `delegated:${id}`,
  delegationStatus: (id, status) => `delegation_status:${id}:${status}`,
};

/** «سه‌شنبه ۱۲ آبان ۱۴۰۵، ساعت ۹:۰۰» */
export const whenLabel = (date, tz) => `${persianDateLabel(date, tz)}، ساعت ${persianTime(date, tz)}`;

const clip = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
export const title = (s) => clip(s, 120);
export const body = (s) => (s ? clip(s, 500) : null);

/** SMS: the title and a link only (FR-021); details are seen after signing in. */
export function smsText(notification, siteUrl) {
  const link = siteUrl ? `\n${siteUrl.replace(/\/$/, '')}${notification.path || '/'}` : '';
  return `مغز دوم من — ${clip(notification.title, 70)}${link}`;
}
