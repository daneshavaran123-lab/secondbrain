// Each person's notification settings (data-model.md: notification_settings), with the defaults
// of FR-009: on-device push on, SMS and email off until the person turns them on for a type.
import { resolveTimeZone } from '../agent/time.js';

export const TYPES = ['reminder', 'event', 'task_due', 'invitation', 'delegated', 'delegation_status', 'message'];
export const CHANNELS = ['push', 'sms', 'email'];

/** Persian names, for the settings page and messages */
export const TYPE_LABELS = {
  reminder: 'یادآورها',
  event: 'جلسه‌ها و رویدادهای تقویم',
  task_due: 'کارهای با موعد امروز',
  invitation: 'دعوت به سازمان',
  delegated: 'کار تازه‌ای که به من واگذار شده',
  delegation_status: 'تغییر وضعیت کارهایی که واگذار کرده‌ام',
  message: 'اعلان از دیگران',
};

const DEFAULT_CHANNELS = { push: true, sms: false, email: false };
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const defaultSettings = () => ({
  channels: Object.fromEntries(TYPES.map((t) => [t, { ...DEFAULT_CHANNELS }])),
  quiet_start: null,
  quiet_end: null,
  accept_from_others: true,
  tz: 'Asia/Tehran',
  permission_explained: false,
});

const hhmm = (v) => (v ? String(v).slice(0, 5) : null);

/** A stored row (or none) merged over the defaults. */
export function mergeSettings(row) {
  const s = defaultSettings();
  if (!row) return s;
  for (const t of TYPES) {
    const stored = row.channels?.[t];
    if (stored?.off) s.channels[t] = { off: true };
    else if (stored) s.channels[t] = Object.fromEntries(CHANNELS.map((c) => [c, typeof stored[c] === 'boolean' ? stored[c] : DEFAULT_CHANNELS[c]]));
  }
  s.quiet_start = hhmm(row.quiet_start);
  s.quiet_end = hhmm(row.quiet_end);
  s.accept_from_others = row.accept_from_others !== false;
  s.tz = resolveTimeZone(row.tz);
  s.permission_explained = !!row.permission_explained;
  return s;
}

export const isOff = (settings, type) => !!settings.channels[type]?.off;

/** Outside channels to deliver a notification of this type on. */
export const channelsFor = (settings, type) =>
  (isOff(settings, type) ? [] : CHANNELS.filter((c) => settings.channels[type]?.[c]));

/**
 * Validates a settings update from the client. Returns { value } or { error, field } with a
 * Persian message.
 */
export function validateSettings(input, current) {
  const next = { ...current, channels: { ...current.channels } };
  if (input.channels !== undefined) {
    if (typeof input.channels !== 'object' || input.channels === null) return { error: 'تنظیم راه‌ها نامعتبر است', field: 'channels' };
    for (const [type, value] of Object.entries(input.channels)) {
      if (!TYPES.includes(type)) return { error: 'نوع اعلان شناخته نشد', field: 'channels' };
      if (value?.off === true) { next.channels[type] = { off: true }; continue; }
      if (typeof value !== 'object' || value === null) return { error: 'تنظیم راه‌ها نامعتبر است', field: 'channels' };
      const entry = {};
      for (const c of CHANNELS) entry[c] = typeof value[c] === 'boolean' ? value[c] : (next.channels[type]?.[c] ?? DEFAULT_CHANNELS[c]);
      next.channels[type] = entry;
    }
  }
  for (const key of ['quiet_start', 'quiet_end']) {
    if (input[key] === undefined) continue;
    if (input[key] !== null && !TIME.test(String(input[key]))) return { error: 'ساعت باید به شکل ۲۴ساعته باشد (مثل ۲۲:۰۰)', field: key };
    next[key] = input[key];
  }
  if (Boolean(next.quiet_start) !== Boolean(next.quiet_end)) return { error: 'برای بازه سکوت، هم ساعت شروع و هم پایان لازم است', field: next.quiet_start ? 'quiet_end' : 'quiet_start' };
  if (input.accept_from_others !== undefined) next.accept_from_others = input.accept_from_others !== false;
  if (input.permission_explained !== undefined) next.permission_explained = !!input.permission_explained;
  if (input.tz !== undefined) {
    if (resolveTimeZone(input.tz) !== input.tz) return { error: 'منطقه زمانی شناخته نشد', field: 'tz' };
    next.tz = input.tz;
  }
  return { value: next };
}
