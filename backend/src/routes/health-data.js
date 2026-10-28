/**
 * سلامت: داده‌های روزانه دستگاه‌ها و برگه‌های آزمایش
 *
 * Daily values arrive from four places, each stored as its own source:
 *   apple_health / health_connect  the phone app reads HealthKit or Health Connect
 *   shortcut                       an iOS Shortcut posts with a personal token (/ingest)
 *   import                         an Apple Health export.zip parsed in the browser
 *   manual                         typed in on the health page
 * Lab reports are OCRed in the browser; the model (or, without one, the line parser in
 * health/labs.js) turns the text into results with reference ranges and flags.
 */

import crypto from 'node:crypto';
import { Router } from 'express';
import { query, getClient } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { AiUnavailableError, chatCompletion, getApiKey } from '../agent/llm.js';
import { DEFAULT_TZ, isoDateOf, normalizeDate, toLatinDigits } from '../agent/time.js';
import { LAB_TESTS, finishResult, parseHeader, parseLabText, ruleSummary } from '../health/labs.js';

const router = Router();

const MAX_FILE_BYTES = 7 * 1024 * 1024;
const MAX_TEXT_CHARS = 20000;
const FILE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const SOURCES = ['apple_health', 'health_connect', 'shortcut', 'import', 'manual'];
const MAX_SAMPLES = 5000;

// What each daily metric means, its unit, and the values that make sense for one day
export const METRICS = {
  steps:              { unit: 'count', min: 0, max: 200000 },
  distance:           { unit: 'm', min: 0, max: 300000 },
  active_energy:      { unit: 'kcal', min: 0, max: 20000 },
  exercise_minutes:   { unit: 'min', min: 0, max: 1440 },
  heart_rate:         { unit: 'bpm', min: 20, max: 250 },
  resting_heart_rate: { unit: 'bpm', min: 20, max: 200 },
  hrv:                { unit: 'ms', min: 1, max: 400 },
  blood_oxygen:       { unit: '%', min: 50, max: 100 },
  respiratory_rate:   { unit: '/min', min: 4, max: 60 },
  sleep_hours:        { unit: 'h', min: 0, max: 24 },
  weight:             { unit: 'kg', min: 2, max: 400 },
  body_fat:           { unit: '%', min: 1, max: 75 },
  systolic:           { unit: 'mmHg', min: 50, max: 260 },
  diastolic:          { unit: 'mmHg', min: 30, max: 180 },
  blood_glucose:      { unit: 'mg/dL', min: 20, max: 700 },
  water:              { unit: 'ml', min: 0, max: 15000 },
};

// Names an iOS Shortcut (or a person) may use for a metric
const METRIC_ALIASES = {
  steps: ['steps', 'step_count', 'stepcount', 'قدم', 'گام'],
  distance: ['distance', 'walking_distance', 'مسافت'],
  active_energy: ['active_energy', 'active_calories', 'calories', 'energy', 'کالری'],
  exercise_minutes: ['exercise_minutes', 'exercise', 'exercise_time', 'ورزش'],
  heart_rate: ['heart_rate', 'heartrate', 'hr', 'ضربان'],
  resting_heart_rate: ['resting_heart_rate', 'resting_hr', 'ضربان_استراحت'],
  hrv: ['hrv', 'heart_rate_variability'],
  blood_oxygen: ['blood_oxygen', 'spo2', 'oxygen', 'اکسیژن'],
  respiratory_rate: ['respiratory_rate'],
  sleep_hours: ['sleep_hours', 'sleep', 'خواب'],
  weight: ['weight', 'body_mass', 'وزن'],
  body_fat: ['body_fat', 'body_fat_percentage', 'چربی'],
  systolic: ['systolic', 'bp_systolic', 'فشار_بالا'],
  diastolic: ['diastolic', 'bp_diastolic', 'فشار_پایین'],
  blood_glucose: ['blood_glucose', 'glucose', 'قند'],
  water: ['water', 'dietary_water', 'آب'],
};
const ALIAS_TO_METRIC = new Map(Object.entries(METRIC_ALIASES).flatMap(([m, names]) => names.map((n) => [n, m])));
const metricOf = (name) => ALIAS_TO_METRIC.get(String(name || '').trim().toLowerCase().replace(/[\s-]+/g, '_')) || null;

let tablesReady = null;
function ensureTables() {
  tablesReady ??= query(`
    CREATE TABLE IF NOT EXISTS health_daily (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day        DATE NOT NULL,
      metric     VARCHAR(40) NOT NULL,
      value      NUMERIC NOT NULL,
      unit       VARCHAR(20),
      source     VARCHAR(30) NOT NULL DEFAULT 'manual',
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (user_id, day, metric, source)
    );
    CREATE INDEX IF NOT EXISTS idx_health_daily_user_day ON health_daily(user_id, day DESC);

    CREATE TABLE IF NOT EXISTS health_lab_reports (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title          TEXT,
      lab_name       TEXT,
      report_date    DATE,
      summary        TEXT,
      ocr_text       TEXT,
      ocr_confidence NUMERIC(5,2),
      extracted_by   VARCHAR(20),
      file_name      TEXT,
      file_type      TEXT,
      file_data      BYTEA,
      analyzed_at    TIMESTAMPTZ,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      updated_at     TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_health_lab_reports_user ON health_lab_reports(user_id, report_date DESC);

    CREATE TABLE IF NOT EXISTS health_lab_results (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      report_id  UUID NOT NULL REFERENCES health_lab_reports(id) ON DELETE CASCADE,
      user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      test_key   VARCHAR(40) NOT NULL,
      test_name  TEXT,
      value      NUMERIC,
      value_text TEXT,
      unit       VARCHAR(30),
      ref_low    NUMERIC,
      ref_high   NUMERIC,
      ref_text   TEXT,
      flag       VARCHAR(10),
      position   INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_health_lab_results_user_key ON health_lab_results(user_id, test_key);

    CREATE TABLE IF NOT EXISTS health_sync_tokens (
      user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      token_hash   TEXT NOT NULL UNIQUE,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      last_used_at TIMESTAMPTZ
    );
  `).catch((err) => {
    tablesReady = null;
    throw err;
  });
  return tablesReady;
}

class BadRequest extends Error {}
const route = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const text = (v, max = 500) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string' || !v.trim()) return null;
  const n = Number(toLatinDigits(v).replace(/[٫]/g, '.').replace(/[,٬\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

router.use(async (_req, _res, next) => {
  try {
    await ensureTables();
    next();
  } catch (err) {
    next(err);
  }
});

// ─── Daily values ────────────────────────────────────────────────────────────

/** Validate incoming samples → rows for health_daily. Unknown or implausible ones are skipped. */
function cleanSamples(samples, source, now = new Date()) {
  const today = isoDateOf(now, DEFAULT_TZ);
  const rows = new Map();
  for (const s of Array.isArray(samples) ? samples.slice(0, MAX_SAMPLES) : []) {
    const metric = METRICS[s?.metric] ? s.metric : metricOf(s?.metric);
    const value = num(s?.value);
    if (!metric || value == null) continue;
    const { min, max, unit } = METRICS[metric];
    if (value < min || value > max) continue;
    const day = normalizeDate(String(s.day || s.date || today), now, DEFAULT_TZ);
    if (!day || day > today || day < '2000-01-01') continue;
    // A later sample for the same day and metric replaces an earlier one in the batch
    rows.set(`${day}|${metric}`, { day, metric, value: Math.round(value * 100) / 100, unit, source });
  }
  return [...rows.values()];
}

async function storeSamples(userId, rows) {
  if (!rows.length) return 0;
  const client = await getClient();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const values = [];
      const params = [userId];
      chunk.forEach((r) => {
        params.push(r.day, r.metric, r.value, r.unit, r.source);
        const b = params.length - 4;
        values.push(`($1, $${b}, $${b + 1}, $${b + 2}, $${b + 3}, $${b + 4})`);
      });
      await client.query(
        `INSERT INTO health_daily (user_id, day, metric, value, unit, source) VALUES ${values.join(', ')}
         ON CONFLICT (user_id, day, metric, source) DO UPDATE SET value = EXCLUDED.value, unit = EXCLUDED.unit, updated_at = NOW()`,
        params,
      );
    }
    await client.query('COMMIT');
    return rows.length;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * One value per day and metric. Several sources can report the same day (the watch and
 * a Shortcut both send steps); the phone's own health store wins, then the Shortcut,
 * then an imported export, then a typed-in value.
 */
export async function dailySummary(userId, days, now = new Date()) {
  const since = new Date(now.getTime() - (days - 1) * 86400000);
  const sinceDay = isoDateOf(since, DEFAULT_TZ);
  const { rows } = await query(
    `SELECT DISTINCT ON (h.day, h.metric) to_char(h.day, 'YYYY-MM-DD') AS day, h.metric, h.value::float AS value, h.unit, h.source
       FROM health_daily h
      WHERE h.user_id = $1 AND h.day >= $2
      ORDER BY h.day, h.metric, array_position($3::text[], h.source::text), h.updated_at DESC`,
    [userId, sinceDay, SOURCES],
  );
  // Values typed in before this page existed (and by the assistant) live in health_metrics
  const manual = await query(
    `SELECT to_char(date, 'YYYY-MM-DD') AS day, weight::float AS weight, sleep_hours::float AS sleep_hours,
            exercise_minutes, water_intake
       FROM health_metrics WHERE user_id = $1 AND date >= $2`,
    [userId, sinceDay],
  ).then((r) => r.rows).catch(() => []);
  const have = new Set(rows.map((r) => `${r.day}|${r.metric}`));
  for (const m of manual) {
    const add = (metric, value, unit) => {
      if (value == null || have.has(`${m.day}|${metric}`)) return;
      rows.push({ day: m.day, metric, value: Number(value), unit, source: 'manual' });
    };
    add('weight', m.weight, 'kg');
    add('sleep_hours', m.sleep_hours, 'h');
    add('exercise_minutes', m.exercise_minutes, 'min');
    // health_metrics counts glasses; one glass is 250 ml
    if (m.water_intake != null) add('water', Number(m.water_intake) * 250, 'ml');
  }
  return rows.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

router.get('/summary', requireAuth, route(async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
  const daily = await dailySummary(req.user.id, days);
  const latest = {};
  for (const r of daily) latest[r.metric] = r;
  const { rows: sources } = await query(
    `SELECT source, MAX(updated_at) AS last_sync, COUNT(*)::int AS values
       FROM health_daily WHERE user_id = $1 GROUP BY source`,
    [req.user.id],
  );
  res.json({ data: { days, daily, latest, sources } });
}));

router.post('/samples', requireAuth, route(async (req, res) => {
  const source = SOURCES.includes(req.body?.source) ? req.body.source : 'manual';
  const rows = cleanSamples(req.body?.samples, source);
  const stored = await storeSamples(req.user.id, rows);
  res.json({ data: { stored, skipped: (Array.isArray(req.body?.samples) ? req.body.samples.length : 0) - stored } });
}));

router.delete('/samples', requireAuth, route(async (req, res) => {
  const source = SOURCES.includes(req.query.source) ? req.query.source : null;
  if (!source) throw new BadRequest('منبع مشخص نیست');
  const { rowCount } = await query(`DELETE FROM health_daily WHERE user_id = $1 AND source = $2`, [req.user.id, source]);
  res.json({ data: { deleted: rowCount } });
}));

// ─── Personal token for the iOS Shortcut ────────────────────────────────────

router.get('/token', requireAuth, route(async (req, res) => {
  const { rows } = await query(`SELECT created_at, last_used_at FROM health_sync_tokens WHERE user_id = $1`, [req.user.id]);
  res.json({ data: rows[0] ? { exists: true, ...rows[0] } : { exists: false } });
}));

/** Creates or replaces the token; it is shown once and only its hash is kept. */
router.post('/token', requireAuth, route(async (req, res) => {
  const token = `hs_${crypto.randomBytes(24).toString('base64url')}`;
  await query(
    `INSERT INTO health_sync_tokens (user_id, token_hash) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, created_at = NOW(), last_used_at = NULL`,
    [req.user.id, hashToken(token)],
  );
  res.json({ data: { token } });
}));

router.delete('/token', requireAuth, route(async (req, res) => {
  await query(`DELETE FROM health_sync_tokens WHERE user_id = $1`, [req.user.id]);
  res.json({ data: { deleted: true } });
}));

/**
 * The Shortcut's endpoint. Accepts either a flat object for one day
 *   { "date": "1405/08/06", "steps": 8123, "sleep_hours": 7.1, "resting_heart_rate": 58 }
 * or { "samples": [{ "metric": "steps", "value": 8123, "date": "2026-10-28" }] }.
 */
router.post('/ingest', route(async (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : String(req.headers['x-health-token'] || '').trim();
  if (!token.startsWith('hs_')) return res.status(401).json({ error: 'توکن سلامت لازم است' });
  const { rows } = await query(
    `UPDATE health_sync_tokens SET last_used_at = NOW() WHERE token_hash = $1 RETURNING user_id`,
    [hashToken(token)],
  );
  if (!rows[0]) return res.status(401).json({ error: 'توکن نامعتبر است' });

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const samples = Array.isArray(body.samples)
    ? body.samples
    : Object.entries(body)
      .filter(([k]) => metricOf(k) || METRICS[k])
      .map(([metric, value]) => ({ metric, value, date: body.date || body.day }));
  const cleaned = cleanSamples(samples, 'shortcut');
  const stored = await storeSamples(rows[0].user_id, cleaned);
  res.json({ ok: true, stored, metrics: cleaned.map((s) => s.metric) });
}));

// ─── Lab reports ─────────────────────────────────────────────────────────────

const REPORT_COLUMNS = `id, title, lab_name, to_char(report_date, 'YYYY-MM-DD') AS report_date, summary, ocr_text,
  ocr_confidence, extracted_by, file_name, file_type, (file_data IS NOT NULL) AS has_file, analyzed_at, created_at, updated_at`;
const RESULT_COLUMNS = `id, test_key, test_name, value::float AS value, value_text, unit, ref_low::float AS ref_low,
  ref_high::float AS ref_high, ref_text, flag, position`;

const LAB_PROMPT = `تو دستیار خواندن برگه آزمایش هستی. متن زیر با OCR از یک برگه آزمایش (معمولاً آزمایشگاه‌های ایران، فارسی و انگلیسی) استخراج شده و ممکن است غلط داشته باشد.
فقط یک شیء JSON معتبر برگردان، بدون توضیح و بدون \`\`\`:
{
  "lab_name": "نام آزمایشگاه یا null",
  "report_date": "تاریخ جواب یا پذیرش همان‌طور که چاپ شده (مثل 1405/08/02)",
  "results": [{
    "test_key": "یکی از کلیدهای فهرست زیر، یا other",
    "test_name": "نام آزمایش همان‌طور که چاپ شده",
    "value": عدد یا null,
    "value_text": "برای نتایج کیفی مثل Negative، وگرنه null",
    "unit": "واحد",
    "ref_low": عدد یا null, "ref_high": عدد یا null,
    "ref_text": "محدوده مرجع همان‌طور که چاپ شده"
  }],
  "summary": "توضیح ساده و کوتاه فارسی برای خود بیمار: کدام نتایج خارج از محدوده‌اند و معنای عمومی‌شان. تشخیص نده، دارو پیشنهاد نکن و در پایان بگو برای تفسیر با پزشک مشورت کند."
}
کلیدها: {keys}
قواعد: عدد و واحد و محدوده را دقیقاً از متن بردار؛ چیزی را که در متن نیست نساز. اعداد فارسی را به لاتین برگردان. هر آزمایش فقط یک بار.`;

const LAB_KEYS = LAB_TESTS.map((t) => `${t.key} (${t.aliases[t.aliases.length > 1 ? 1 : 0]})`).join('، ');

function extractJson(content) {
  const s = String(content || '').replace(/<think>[\s\S]*?<\/think>/g, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Results from the model when it answers with something usable, else from the line parser.
 * Returns { lab_name, report_date, results, summary, extracted_by }.
 */
export async function extractLabResults(ocrText, now = new Date()) {
  const header = parseHeader(ocrText, now);
  const parsed = parseLabText(ocrText).map(finishResult);
  let ai = null;
  let aiError = null;
  if (getApiKey()) {
    try {
      const { message } = await chatCompletion({
        messages: [
          { role: 'system', content: LAB_PROMPT.replace('{keys}', LAB_KEYS) },
          { role: 'user', content: ocrText.slice(0, 12000) },
        ],
        temperature: 0.1,
        maxTokens: 3500,
        timeoutMs: 60000,
      });
      ai = extractJson(message.content);
    } catch (err) {
      aiError = err;
    }
  }
  const aiResults = Array.isArray(ai?.results)
    ? ai.results.slice(0, 80).map(finishResult).filter((r) => r.test_name && (r.value != null || r.value_text))
    : [];
  const useAi = aiResults.length >= Math.max(1, parsed.length * 0.6);
  const seen = new Set();
  const results = (useAi ? aiResults : parsed).filter((r) => {
    const k = r.test_key === 'other' ? `other:${r.test_name.toLowerCase()}` : r.test_key;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  // Header fields come from whichever reading of the sheet supplied the results
  const aiName = text(ai?.lab_name, 120);
  const aiDate = normalizeDate(String(ai?.report_date || ''), now, DEFAULT_TZ);
  return {
    lab_name: useAi ? aiName || header.lab_name : header.lab_name || aiName,
    report_date: useAi ? aiDate || header.report_date : header.report_date || aiDate,
    results,
    summary: (useAi && text(ai?.summary, 2000)) || ruleSummary(results),
    extracted_by: useAi ? 'ai' : 'parser',
    ai_unavailable: !useAi && (aiError instanceof AiUnavailableError || !getApiKey()),
  };
}

async function saveResults(client, userId, reportId, results) {
  await client.query(`DELETE FROM health_lab_results WHERE report_id = $1 AND user_id = $2`, [reportId, userId]);
  for (const [i, r] of results.entries()) {
    await client.query(
      `INSERT INTO health_lab_results (report_id, user_id, test_key, test_name, value, value_text, unit, ref_low, ref_high, ref_text, flag, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [reportId, userId, r.test_key, r.test_name, r.value, r.value_text, r.unit, r.ref_low, r.ref_high, r.ref_text, r.flag, i],
    );
  }
}

async function loadReport(userId, id) {
  const { rows } = await query(`SELECT ${REPORT_COLUMNS} FROM health_lab_reports WHERE user_id = $1 AND id::text = $2`, [userId, String(id)]);
  if (!rows[0]) return null;
  const results = await query(`SELECT ${RESULT_COLUMNS} FROM health_lab_results WHERE report_id = $1 ORDER BY position`, [rows[0].id]);
  return { ...rows[0], results: results.rows };
}

async function analyzeAndStore(userId, reportId, ocrText) {
  const extracted = await extractLabResults(ocrText);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE health_lab_reports SET lab_name = COALESCE($3, lab_name), report_date = COALESCE($4::date, report_date),
         summary = $5, extracted_by = $6, analyzed_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND id = $2`,
      [userId, reportId, extracted.lab_name, extracted.report_date, extracted.summary, extracted.extracted_by],
    );
    await saveResults(client, userId, reportId, extracted.results);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return extracted;
}

router.get('/labs', requireAuth, route(async (req, res) => {
  const { rows } = await query(
    `SELECT r.id, r.title, r.lab_name, to_char(r.report_date, 'YYYY-MM-DD') AS report_date, r.summary, r.extracted_by,
            r.created_at, COUNT(x.id)::int AS result_count,
            COUNT(x.id) FILTER (WHERE x.flag IN ('high', 'low'))::int AS flagged_count
       FROM health_lab_reports r LEFT JOIN health_lab_results x ON x.report_id = r.id
      WHERE r.user_id = $1
      GROUP BY r.id
      ORDER BY COALESCE(r.report_date, r.created_at::date) DESC, r.created_at DESC
      LIMIT 200`,
    [req.user.id],
  );
  res.json({ data: rows });
}));

/** Every reading of one test across reports, oldest first. */
router.get('/labs/trend/:key', requireAuth, route(async (req, res) => {
  const { rows } = await query(
    `SELECT x.value::float AS value, x.unit, x.flag, x.ref_low::float AS ref_low, x.ref_high::float AS ref_high,
            to_char(COALESCE(r.report_date, r.created_at::date), 'YYYY-MM-DD') AS day, r.id AS report_id
       FROM health_lab_results x JOIN health_lab_reports r ON r.id = x.report_id
      WHERE x.user_id = $1 AND x.test_key = $2 AND x.value IS NOT NULL
      ORDER BY day`,
    [req.user.id, String(req.params.key).slice(0, 40)],
  );
  res.json({ data: rows });
}));

router.get('/labs/:id', requireAuth, route(async (req, res) => {
  const report = await loadReport(req.user.id, req.params.id);
  if (!report) return res.status(404).json({ error: 'آزمایش پیدا نشد' });
  res.json({ data: report });
}));

router.get('/labs/:id/file', requireAuth, route(async (req, res) => {
  const { rows } = await query(
    `SELECT file_name, file_type, file_data FROM health_lab_reports WHERE user_id = $1 AND id::text = $2 AND file_data IS NOT NULL`,
    [req.user.id, String(req.params.id)],
  );
  if (!rows[0]) return res.status(404).json({ error: 'فایل پیدا نشد' });
  res.setHeader('Content-Type', rows[0].file_type);
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(rows[0].file_name || 'lab')}`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.send(rows[0].file_data);
}));

router.post('/labs', requireAuth, route(async (req, res) => {
  const body = req.body || {};
  const ocrText = text(body.ocr_text, MAX_TEXT_CHARS);
  if (!ocrText) throw new BadRequest('متن برگه آزمایش خالی است');
  let file = { name: null, type: null, data: null };
  if (body.file?.data) {
    if (!FILE_TYPES.has(body.file.type)) throw new BadRequest('نوع فایل پشتیبانی نمی‌شود');
    const data = Buffer.from(String(body.file.data), 'base64');
    if (data.length > MAX_FILE_BYTES) throw new BadRequest('حجم فایل بیش از ۷ مگابایت است');
    file = { name: text(body.file.name, 200), type: body.file.type, data };
  }
  const { rows } = await query(
    `INSERT INTO health_lab_reports (user_id, title, report_date, ocr_text, ocr_confidence, file_name, file_type, file_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [req.user.id, text(body.title, 200), normalizeDate(String(body.report_date || ''), new Date(), DEFAULT_TZ),
      ocrText, num(body.ocr_confidence), file.name, file.type, file.data],
  );
  const extracted = await analyzeAndStore(req.user.id, rows[0].id, ocrText);
  res.status(201).json({
    data: await loadReport(req.user.id, rows[0].id),
    notice: extracted.ai_unavailable && extracted.results.length
      ? 'هوش مصنوعی در دسترس نبود؛ نتایج با خواندن خط‌به‌خط استخراج شد. لطفاً مقادیر را با برگه مقایسه کنید.'
      : !extracted.results.length ? 'نتیجه‌ای در متن پیدا نشد؛ می‌توانید مقادیر را دستی وارد کنید.' : null,
  });
}));

router.post('/labs/:id/analyze', requireAuth, route(async (req, res) => {
  const report = await loadReport(req.user.id, req.params.id);
  if (!report) return res.status(404).json({ error: 'آزمایش پیدا نشد' });
  await analyzeAndStore(req.user.id, report.id, report.ocr_text || '');
  res.json({ data: await loadReport(req.user.id, report.id) });
}));

/** Edit the header fields and/or replace the results after checking them against the sheet. */
router.patch('/labs/:id', requireAuth, route(async (req, res) => {
  const report = await loadReport(req.user.id, req.params.id);
  if (!report) return res.status(404).json({ error: 'آزمایش پیدا نشد' });
  const body = req.body || {};
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE health_lab_reports SET
         title = CASE WHEN $3 THEN $4 ELSE title END,
         lab_name = CASE WHEN $5 THEN $6 ELSE lab_name END,
         report_date = CASE WHEN $7 THEN $8::date ELSE report_date END,
         updated_at = NOW()
       WHERE user_id = $1 AND id = $2`,
      [req.user.id, report.id,
        'title' in body, text(body.title, 200),
        'lab_name' in body, text(body.lab_name, 120),
        'report_date' in body, normalizeDate(String(body.report_date || ''), new Date(), DEFAULT_TZ)],
    );
    if (Array.isArray(body.results)) {
      const results = body.results.slice(0, 120).map(finishResult).filter((r) => r.test_name && (r.value != null || r.value_text));
      await saveResults(client, req.user.id, report.id, results);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  res.json({ data: await loadReport(req.user.id, report.id) });
}));

router.delete('/labs/:id', requireAuth, route(async (req, res) => {
  const { rowCount } = await query(`DELETE FROM health_lab_reports WHERE user_id = $1 AND id::text = $2`, [req.user.id, String(req.params.id)]);
  if (!rowCount) return res.status(404).json({ error: 'آزمایش پیدا نشد' });
  res.json({ data: { deleted: true } });
}));

/** The catalogue, so the page can label and pick tests the same way the server does. */
router.get('/lab-tests', requireAuth, (_req, res) => {
  res.json({ data: LAB_TESTS.map(({ key, label, unit, low, high }) => ({ key, label, unit, low: low ?? null, high: high ?? null })) });
});

router.use((err, _req, res, next) => {
  if (err instanceof BadRequest) return res.status(400).json({ error: err.message });
  next(err);
});

export default router;
