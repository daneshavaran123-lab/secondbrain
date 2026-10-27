/**
 * Date/time helpers for the assistant.
 * The model works in the user's local wall-clock time (default Asia/Tehran) and
 * always emits ISO dates (YYYY-MM-DD) and 24h times (HH:MM). These helpers build
 * the calendar the model reasons over and normalise whatever it sends back.
 */

export const DEFAULT_TZ = 'Asia/Tehran';
const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (n) => String(n).padStart(2, '0');

export function resolveTimeZone(tz) {
  if (!tz || typeof tz !== 'string') return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

/** Convert Persian/Arabic-Indic digits to ASCII. */
export function toLatinDigits(str) {
  return String(str ?? '')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/** Wall-clock parts of an instant in a time zone. */
export function zonedParts(date, tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get('year'), m: get('month'), d: get('day'), hh: get('hour'), mm: get('minute') };
}

export const isoDateOf = (date, tz) => {
  const p = zonedParts(date, tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
};

export const timeOf = (date, tz) => {
  const p = zonedParts(date, tz);
  return `${pad(p.hh)}:${pad(p.mm)}`;
};

/** Local wall time (YYYY-MM-DD + HH:MM) in `tz` → UTC Date. */
export function zonedToUtc(isoDate, time = '00:00', tz = DEFAULT_TZ) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const p = zonedParts(new Date(guess), tz);
  const offset = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm) - guess;
  return new Date(guess - offset);
}

export function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** «سه‌شنبه ۶ آبان ۱۴۰۵» */
export function persianDateLabel(date, tz) {
  try {
    const parts = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }).formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type)?.value || '';
    return `${get('weekday')} ${get('day')} ${get('month')} ${get('year')}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function persianTime(date, tz) {
  return new Intl.DateTimeFormat('fa-IR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

/** Calendar the model uses to resolve «فردا», «پنجشنبه», «۱۵ آبان» → ISO. */
export function buildDateTable(now, tz, days = 14) {
  const today = isoDateOf(now, tz);
  const rel = { 0: 'امروز', 1: 'فردا', 2: 'پس‌فردا', [-1]: 'دیروز' };
  const lines = [];
  for (let i = -1; i < days; i++) {
    const iso = addDays(today, i);
    const label = persianDateLabel(zonedToUtc(iso, '12:00', tz), tz);
    lines.push(`- ${iso} = ${label}${rel[i] ? ` (${rel[i]})` : ''}`);
  }
  return lines.join('\n');
}

// ─── Jalali → Gregorian (jalaali-js algorithm) ───────────────────────────────
const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
const div = (a, b) => ~~(a / b);
const mod = (a, b) => a - ~~(a / b) * b;

function jalCal(jy) {
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jump = 0;
  for (let i = 1; i < BREAKS.length; i++) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  return { gy, march: 20 + leapJ - leapG };
}

function g2d(gy, gm, gd) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

export function jalaliToGregorian(jy, jm, jd) {
  const r = jalCal(jy);
  const jdn = g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  const { gy, gm, gd } = d2g(jdn);
  return `${gy}-${pad(gm)}-${pad(gd)}`;
}

// ─── Normalisers for tool arguments ──────────────────────────────────────────
const RELATIVE_DAYS = [
  [/پس[‌\s-]?فردا/, 2],
  [/فردا/, 1],
  [/دیروز/, -1],
  [/امروز|امشب/, 0],
];

/** Accepts ISO, Jalali (1405/08/06) or relative words; returns YYYY-MM-DD or null. */
export function normalizeDate(value, now, tz) {
  if (!value || typeof value !== 'string') return null;
  const str = toLatinDigits(value).trim();

  const m = str.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    if (y >= 1300 && y <= 1500) return jalaliToGregorian(y, mo, d);
    if (y >= 1900 && y <= 2200) return `${y}-${pad(mo)}-${pad(d)}`;
    return null;
  }

  for (const [re, offset] of RELATIVE_DAYS) {
    if (re.test(str)) return addDays(isoDateOf(now, tz), offset);
  }
  return null;
}

/** «۲ بعدازظهر» / «14:30» / «ساعت ۹ صبح» → HH:MM, or null. */
export function normalizeTime(value) {
  if (!value || typeof value !== 'string') return null;
  const str = toLatinDigits(value);
  const m = str.match(/(\d{1,2})(?:\s*[:٫.]\s*(\d{2}))?/);
  if (!m) return null;
  let hh = Number(m[1]);
  const mm = Number(m[2] || 0);
  if (/بعد\s*از\s*ظهر|بعدازظهر|عصر|شب|pm/i.test(str) && hh < 12) hh += 12;
  if (/صبح|am/i.test(str) && hh === 12) hh = 0;
  if (hh > 23 || mm > 59) return null;
  return `${pad(hh)}:${pad(mm)}`;
}

/** «2026-10-28 14:00», «فردا ساعت ۵ عصر» → { date, time } (either may be null). */
export function normalizeDateTime(value, now, tz) {
  if (!value || typeof value !== 'string') return { date: null, time: null };
  const str = toLatinDigits(value);
  const date = normalizeDate(str, now, tz);
  const withoutDate = str.replace(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/, ' ');
  const time = /\d/.test(withoutDate) ? normalizeTime(withoutDate.replace(/^[T\s]+/, '')) : null;
  return { date, time };
}
