import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deliverAfter, eventDueAt, eventIsDue, keys, quietUntil, smsText, taskDueAt, taskIsDue, withinLookback } from '../src/notifications/schedule.js';
import { channelsFor, defaultSettings, isOff, mergeSettings, validateSettings } from '../src/notifications/settings.js';

const TEHRAN = 'Asia/Tehran'; // UTC+03:30, no daylight saving

test('an event: 15 minutes before; an all-day event at 08:00 local', () => {
  assert.equal(eventDueAt('2026-11-10T07:00:00Z', { tz: TEHRAN }).toISOString(), '2026-11-10T06:45:00.000Z');
  assert.equal(eventDueAt('2026-11-10T07:00:00Z', { allDay: true, tz: TEHRAN }).toISOString(), '2026-11-10T04:30:00.000Z');
});

test('an event is announced only between its notice time and its start', () => {
  const start = new Date('2026-11-10T07:00:00Z');
  const due = eventDueAt(start, { tz: TEHRAN });
  assert.equal(eventIsDue(start, due, new Date('2026-11-10T06:44:00Z')), false);
  assert.equal(eventIsDue(start, due, new Date('2026-11-10T06:50:00Z')), true);
  assert.equal(eventIsDue(start, due, new Date('2026-11-10T07:00:30Z')), false); // a minutes record written after
});

test('a task: 08:00 on its due date in the person’s time zone', () => {
  // due «2026-11-10» stored as midnight Tehran = 2026-11-09T20:30Z
  const due = '2026-11-09T20:30:00Z';
  assert.equal(taskDueAt(due, TEHRAN).toISOString(), '2026-11-10T04:30:00.000Z');
  assert.equal(taskIsDue(due, new Date('2026-11-10T04:00:00Z'), TEHRAN), false); // 07:30 Tehran
  assert.equal(taskIsDue(due, new Date('2026-11-10T05:00:00Z'), TEHRAN), true);
  assert.equal(taskIsDue(due, new Date('2026-11-11T05:00:00Z'), TEHRAN), false); // the next day: not again
  // another zone: the same instant is a different calendar day
  assert.equal(taskDueAt(due, 'America/Los_Angeles').toISOString(), '2026-11-09T16:00:00.000Z');
});

test('things that fell due while nothing ran are still made within 24 hours', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  assert.ok(withinLookback(new Date('2026-11-10T08:00:00Z'), now));
  assert.ok(!withinLookback(new Date('2026-11-09T11:00:00Z'), now));
  assert.ok(!withinLookback(new Date('2026-11-10T12:00:01Z'), now));
});

test('quiet hours move outside channels to the end of the window, across midnight too', () => {
  const s = { quiet_start: '22:00', quiet_end: '07:00', tz: TEHRAN };
  // 23:00 Tehran → 07:00 the next morning
  assert.equal(deliverAfter(new Date('2026-11-10T19:30:00Z'), s).toISOString(), '2026-11-11T03:30:00.000Z');
  // 06:00 Tehran → 07:00 the same morning
  assert.equal(deliverAfter(new Date('2026-11-11T02:30:00Z'), s).toISOString(), '2026-11-11T03:30:00.000Z');
  // 12:00 Tehran → right away
  assert.equal(deliverAfter(new Date('2026-11-11T08:30:00Z'), s).toISOString(), '2026-11-11T08:30:00.000Z');
  // a daytime window
  const day = { quiet_start: '13:00', quiet_end: '15:00', tz: TEHRAN };
  assert.equal(deliverAfter(new Date('2026-11-11T10:00:00Z'), day).toISOString(), '2026-11-11T11:30:00.000Z');
  // none
  assert.equal(deliverAfter(new Date('2026-11-11T10:00:00Z'), { tz: TEHRAN }).toISOString(), '2026-11-11T10:00:00.000Z');
  assert.equal(quietUntil(new Date('2026-11-10T19:30:00Z'), s).toISOString(), '2026-11-11T03:30:00.000Z');
  assert.equal(quietUntil(new Date('2026-11-11T08:30:00Z'), s), null);
});

test('dedupe keys carry the due time, so a moved meeting gets a new notice', () => {
  assert.notEqual(keys.event('cal', 'e1', '2026-11-10T07:00:00Z'), keys.event('cal', 'e1', '2026-11-10T08:00:00Z'));
  assert.equal(keys.taskDue('task', 't1', '2026-11-10'), 'task_due:task:t1:2026-11-10');
  assert.equal(keys.delegationStatus('d1', 'completed'), 'delegation_status:d1:completed');
});

test('SMS text: the title and a link only', () => {
  const t = smsText({ title: 'یادآوری: تماس با پیمانکار', body: 'جزئیات خصوصی', path: '/calendar' }, 'https://app.example/');
  assert.equal(t, 'مغز دوم من — یادآوری: تماس با پیمانکار\nhttps://app.example/calendar');
  assert.ok(!t.includes('جزئیات'));
  assert.ok(smsText({ title: 'x'.repeat(200), path: null }, '').length < 90);
});

test('settings: push on, SMS and email off by default; a type can be turned off', () => {
  const s = defaultSettings();
  assert.deepEqual(channelsFor(s, 'reminder'), ['push']);
  const merged = mergeSettings({ channels: { reminder: { push: true, sms: true }, task_due: { off: true } }, quiet_start: '22:00:00', quiet_end: '07:00:00', tz: 'Nowhere/City' });
  assert.deepEqual(channelsFor(merged, 'reminder'), ['push', 'sms']);
  assert.ok(isOff(merged, 'task_due'));
  assert.deepEqual(channelsFor(merged, 'task_due'), []);
  assert.equal(merged.quiet_start, '22:00');
  assert.equal(merged.tz, 'Asia/Tehran');
});

test('settings validation names the field', () => {
  const s = defaultSettings();
  assert.equal(validateSettings({ quiet_start: '25:00', quiet_end: '07:00' }, s).field, 'quiet_start');
  assert.equal(validateSettings({ quiet_start: '22:00' }, s).field, 'quiet_end');
  assert.equal(validateSettings({ tz: 'Mars/Base' }, s).field, 'tz');
  assert.equal(validateSettings({ channels: { nonsense: { push: true } } }, s).field, 'channels');
  const ok = validateSettings({ channels: { event: { sms: true } }, quiet_start: '22:00', quiet_end: '07:00', tz: 'Europe/Berlin' }, s);
  assert.deepEqual(ok.value.channels.event, { push: true, sms: true, email: false });
  assert.equal(ok.value.tz, 'Europe/Berlin');
});
