/**
 * نامه‌ها و بخشنامه‌های سازمانی
 * Upload a letter/circular (OCR runs in the browser), keep the scan, and let the
 * model extract its details and draft a formal reply (جوابیه).
 */

import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { AiUnavailableError, chatCompletion, getApiKey } from '../agent/llm.js';
import { DEFAULT_TZ, normalizeDate } from '../agent/time.js';

const router = Router();
router.use(requireAuth);

const MAX_FILE_BYTES = 7 * 1024 * 1024;
const MAX_TEXT_CHARS = 20000;
const AI_TEXT_CHARS = 12000;
const FILE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const KINDS = new Set(['letter', 'circular']);
const DIRECTIONS = new Set(['incoming', 'outgoing']);
const STATUSES = new Set(['new', 'in_progress', 'replied', 'archived']);
const URGENCIES = new Set(['normal', 'urgent', 'very_urgent']);

// Everything except the stored file, so lists stay light.
const COLUMNS = `id, kind, direction, organization_name, subject, sender, recipient, letter_number,
  letter_date, deadline, urgency, classification, summary, key_points, action_items, needs_reply,
  ocr_text, clean_text, ocr_confidence, reply_draft, status, file_name, file_type,
  (file_data IS NOT NULL) AS has_file, analyzed_at, created_at, updated_at`;
const LIST_COLUMNS = COLUMNS.replace('ocr_text, clean_text, ', '').replace('reply_draft, ', '');

let tableReady = null;
function ensureTable() {
  tableReady ??= query(`
    CREATE TABLE IF NOT EXISTS organizational_letters (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id           UUID NOT NULL,
      kind              VARCHAR(20) NOT NULL DEFAULT 'letter',
      direction         VARCHAR(20) NOT NULL DEFAULT 'incoming',
      organization_name TEXT,
      subject           TEXT,
      sender            TEXT,
      recipient         TEXT,
      letter_number     TEXT,
      letter_date       TEXT,
      deadline          DATE,
      urgency           VARCHAR(20) DEFAULT 'normal',
      classification    TEXT,
      summary           TEXT,
      key_points        JSONB DEFAULT '[]',
      action_items      JSONB DEFAULT '[]',
      needs_reply       BOOLEAN,
      ocr_text          TEXT,
      clean_text        TEXT,
      ocr_confidence    NUMERIC(5,2),
      reply_draft       TEXT,
      status            VARCHAR(20) NOT NULL DEFAULT 'new',
      file_name         TEXT,
      file_type         TEXT,
      file_data         BYTEA,
      analyzed_at       TIMESTAMPTZ,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_org_letters_user ON organizational_letters(user_id, created_at DESC);
  `).catch((err) => {
    tableReady = null;
    throw err;
  });
  return tableReady;
}

class BadRequest extends Error {}

// Express 4 does not forward rejected promises to error handlers by itself.
const route = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const text = (v, max = 500) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const pick = (v, allowed, fallback) => (allowed.has(v) ? v : fallback);

async function findLetter(userId, id) {
  const { rows } = await query(`SELECT ${COLUMNS} FROM organizational_letters WHERE user_id = $1 AND id::text = $2`, [userId, String(id)]);
  return rows[0] || null;
}

// ─── AI ──────────────────────────────────────────────────────────────────────
const KIND_LABEL = { letter: 'نامه', circular: 'بخشنامه' };

const ANALYSIS_PROMPT = `تو کارشناس دبیرخانه و مکاتبات اداری هستی. متن زیر با OCR از یک {kind} اداری فارسی استخراج شده و ممکن است غلط املایی، کلمه شکسته یا ترتیب به‌هم‌ریخته داشته باشد.
فقط یک شیء JSON معتبر برگردان، بدون هیچ توضیح و بدون \`\`\`:
{
  "kind": "letter" یا "circular",
  "subject": "موضوع",
  "sender": "فرستنده: نام، سمت و سازمان",
  "recipient": "گیرنده",
  "letter_number": "شماره نامه دقیقاً همان‌طور که در متن آمده",
  "letter_date": "تاریخ نامه همان‌طور که در متن آمده",
  "deadline": "مهلت اقدام به شکل YYYY/MM/DD شمسی",
  "urgency": "normal" یا "urgent" یا "very_urgent",
  "classification": "طبقه‌بندی مثل عادی یا محرمانه",
  "summary": "خلاصه دو تا سه جمله‌ای",
  "key_points": ["نکته مهم"],
  "action_items": [{"task": "کاری که باید انجام شود", "deadline": "YYYY/MM/DD شمسی", "owner": "مسئول"}],
  "needs_reply": true یا false,
  "clean_text": "متن کامل با اصلاح خطاهای OCR، بدون تغییر محتوا"
}
قواعد: چیزی را که در متن نیست حدس نزن و برایش null بگذار. اعداد و تاریخ‌ها را دقیق منتقل کن. «فوری» و «خیلی فوری» را در urgency منعکس کن.`;

const REPLY_PROMPT = `تو کارشناس ارشد مکاتبات اداری هستی. برای {kind} زیر یک پیش‌نویس {reply_kind} رسمی، مؤدبانه و دقیق به فارسی معیار اداری بنویس.
ساختار:
- «بسمه تعالی» در سطر اول
- «شماره: ــــــ    تاریخ: ــــــ    پیوست: ندارد»
- عنوان گیرنده با احترام (مثل «جناب آقای ... / ریاست محترم ...») بر اساس فرستنده نامه اصلی
- «موضوع: ...»
- «با سلام و احترام،» و سپس متن با «عطف به نامه شماره ... مورخ ...» اگر شماره و تاریخ معلوم است
- به همه درخواست‌ها و بندهای نامه اصلی جواب بده؛ هرجا اطلاعاتی لازم است که نداری، جای خالی «[ــــ]» بگذار و عدد یا تعهد از خودت نساز
- پایان با «با تشکر» و سپس نام و سمت امضاکننده
{signature}
{instructions}
فقط متن {reply_kind} را برگردان، بدون توضیح اضافه و بدون مارک‌داون.`;

const TONES = {
  agree: 'لحن: موافقت و اعلام آمادگی برای همکاری.',
  decline: 'لحن: عدم موافقت مؤدبانه با ذکر دلیل کلی و قدردانی.',
  extension: 'لحن: درخواست مهلت بیشتر برای اقدام با ذکر دلیل.',
  info: 'لحن: درخواست اطلاعات یا مدارک تکمیلی پیش از اقدام.',
  ack: 'لحن: اعلام وصول و اطلاع از اقدامات انجام‌شده یا در دست اقدام.',
};

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

const cleanReply = (content) => String(content || '')
  .replace(/<think>[\s\S]*?<\/think>/g, '')
  .replace(/^```[a-z]*\n?|```$/gim, '')
  .trim();

async function signatureFor(userId, organizationName) {
  try {
    const { rows } = await query(`SELECT display_name, first_name, last_name, position FROM user_profiles WHERE user_id = $1 LIMIT 1`, [userId]);
    const p = rows[0] || {};
    const name = p.display_name || [p.first_name, p.last_name].filter(Boolean).join(' ');
    const parts = [name, p.position, organizationName].filter(Boolean);
    return parts.length ? `امضاکننده: ${parts.join('، ')}` : 'امضاکننده را با «[نام و سمت]» خالی بگذار.';
  } catch {
    return 'امضاکننده را با «[نام و سمت]» خالی بگذار.';
  }
}

async function analyzeLetter(letterText, kind) {
  const { message } = await chatCompletion({
    messages: [
      { role: 'system', content: ANALYSIS_PROMPT.replace('{kind}', KIND_LABEL[kind]) },
      { role: 'user', content: letterText.slice(0, AI_TEXT_CHARS) },
    ],
    temperature: 0.1,
    maxTokens: 4000,
    timeoutMs: 60000,
  });
  const data = extractJson(message.content);
  if (!data) throw new Error('INVALID_ANALYSIS');
  return data;
}

async function draftReply({ letterText, kind, userId, organizationName, tone, instructions }) {
  const replyKind = kind === 'circular' ? 'اعلام وصول و گزارش اقدام' : 'جوابیه';
  const extra = [TONES[tone], text(instructions, 1000) && `خواسته نویسنده: ${text(instructions, 1000)}`].filter(Boolean).join('\n');
  const system = REPLY_PROMPT
    .replaceAll('{reply_kind}', replyKind)
    .replace('{kind}', KIND_LABEL[kind])
    .replace('{signature}', await signatureFor(userId, organizationName))
    .replace('{instructions}', extra);
  const { message } = await chatCompletion({
    messages: [{ role: 'system', content: system }, { role: 'user', content: letterText.slice(0, AI_TEXT_CHARS) }],
    temperature: 0.4,
    maxTokens: 2500,
    timeoutMs: 60000,
  });
  const reply = cleanReply(message.content);
  if (!reply) throw new Error('EMPTY_REPLY');
  return reply;
}

const aiUnavailable = (err) => err instanceof AiUnavailableError || !getApiKey();
const analysisError = (err) => (aiUnavailable(err)
  ? 'سرویس هوش مصنوعی الان در دسترس نیست؛ نامه ذخیره شد و بعداً می‌توانید دوباره تحلیل کنید.'
  : 'تحلیل خودکار ناموفق بود؛ نامه ذخیره شد و می‌توانید دوباره امتحان کنید.');
const replyError = (err) => (aiUnavailable(err)
  ? 'سرویس هوش مصنوعی الان در دسترس نیست؛ چند لحظه دیگر دوباره امتحان کنید.'
  : 'نوشتن پیشنهاد جوابیه ناموفق بود؛ دوباره امتحان کنید.');

/** Run analysis and reply drafting in parallel and store whatever succeeded. */
async function analyzeAndStore(userId, letter) {
  const letterText = letter.clean_text || letter.ocr_text || '';
  if (!letterText.trim()) return { letter, error: 'متنی برای تحلیل وجود ندارد.' };

  const [analysis, reply] = await Promise.allSettled([
    analyzeLetter(letterText, letter.kind),
    draftReply({ letterText, kind: letter.kind, userId, organizationName: letter.organization_name }),
  ]);

  const a = analysis.status === 'fulfilled' ? analysis.value : null;
  const kind = a && KINDS.has(a.kind) ? a.kind : letter.kind;
  const items = Array.isArray(a?.action_items) ? a.action_items.slice(0, 20).map((i) => ({
    task: text(i?.task, 300),
    deadline: text(i?.deadline, 40),
    deadline_iso: normalizeDate(i?.deadline, new Date(), DEFAULT_TZ),
    owner: text(i?.owner, 120),
  })).filter((i) => i.task) : null;

  const { rows } = await query(
    `UPDATE organizational_letters SET
       kind = $3,
       subject = COALESCE($4, subject), sender = COALESCE($5, sender), recipient = COALESCE($6, recipient),
       letter_number = COALESCE($7, letter_number), letter_date = COALESCE($8, letter_date),
       deadline = COALESCE($9::date, deadline), urgency = COALESCE($10, urgency),
       classification = COALESCE($11, classification), summary = COALESCE($12, summary),
       key_points = COALESCE($13::jsonb, key_points), action_items = COALESCE($14::jsonb, action_items),
       needs_reply = COALESCE($15, needs_reply), clean_text = COALESCE($16, clean_text),
       reply_draft = COALESCE($17, reply_draft),
       analyzed_at = CASE WHEN $18 THEN NOW() ELSE analyzed_at END,
       updated_at = NOW()
     WHERE user_id = $1 AND id = $2
     RETURNING ${COLUMNS}`,
    [
      userId, letter.id, kind,
      text(a?.subject), text(a?.sender), text(a?.recipient),
      text(a?.letter_number, 100), text(a?.letter_date, 60),
      normalizeDate(a?.deadline, new Date(), DEFAULT_TZ),
      URGENCIES.has(a?.urgency) ? a.urgency : null,
      text(a?.classification, 60), text(a?.summary, 2000),
      Array.isArray(a?.key_points) ? JSON.stringify(a.key_points.map((k) => text(k, 400)).filter(Boolean).slice(0, 15)) : null,
      items ? JSON.stringify(items) : null,
      typeof a?.needs_reply === 'boolean' ? a.needs_reply : null,
      // Keep the model's cleanup only when it is a plausible copy of the letter.
      a?.clean_text && a.clean_text.length > letterText.length * 0.5 ? text(a.clean_text, MAX_TEXT_CHARS) : null,
      reply.status === 'fulfilled' ? reply.value : null,
      Boolean(a),
    ],
  );

  const failed = analysis.status === 'rejected' ? analysis.reason : reply.status === 'rejected' ? reply.reason : null;
  if (failed) console.warn('[org-letters] AI step failed:', failed.message);
  return { letter: rows[0], error: failed ? analysisError(failed) : null };
}

// ─── Routes ──────────────────────────────────────────────────────────────────
router.use(async (_req, _res, next) => {
  try {
    await ensureTable();
    next();
  } catch (err) {
    next(err);
  }
});

router.get('/', route(async (req, res) => {
  const params = [req.user.id];
  let where = 'user_id = $1';
  if (KINDS.has(req.query.kind)) {
    params.push(req.query.kind);
    where += ` AND kind = $${params.length}`;
  }
  if (STATUSES.has(req.query.status)) {
    params.push(req.query.status);
    where += ` AND status = $${params.length}`;
  }
  const q = text(req.query.q, 100);
  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    const p = `$${params.length}`;
    where += ` AND (subject ILIKE ${p} OR sender ILIKE ${p} OR letter_number ILIKE ${p} OR organization_name ILIKE ${p} OR COALESCE(clean_text, ocr_text) ILIKE ${p})`;
  }
  const { rows } = await query(`SELECT ${LIST_COLUMNS} FROM organizational_letters WHERE ${where} ORDER BY created_at DESC LIMIT 200`, params);
  res.json({ data: rows });
}));

router.get('/:id', route(async (req, res) => {
  const letter = await findLetter(req.user.id, req.params.id);
  if (!letter) return res.status(404).json({ error: 'نامه پیدا نشد' });
  res.json({ data: letter });
}));

router.get('/:id/file', route(async (req, res) => {
  const { rows } = await query(
    `SELECT file_name, file_type, file_data FROM organizational_letters WHERE user_id = $1 AND id::text = $2 AND file_data IS NOT NULL`,
    [req.user.id, String(req.params.id)],
  );
  if (!rows[0]) return res.status(404).json({ error: 'فایل پیدا نشد' });
  res.setHeader('Content-Type', rows[0].file_type);
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(rows[0].file_name || 'letter')}`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.send(rows[0].file_data);
}));

router.post('/', route(async (req, res) => {
  const body = req.body || {};
  const ocrText = text(body.ocr_text, MAX_TEXT_CHARS);
  if (!ocrText) throw new BadRequest('متن نامه خالی است');

  let fileName = null;
  let fileType = null;
  let fileData = null;
  if (body.file?.data) {
    if (!FILE_TYPES.has(body.file.type)) throw new BadRequest('نوع فایل پشتیبانی نمی‌شود');
    fileData = Buffer.from(String(body.file.data), 'base64');
    if (fileData.length > MAX_FILE_BYTES) throw new BadRequest('حجم فایل بیش از ۷ مگابایت است');
    fileName = text(body.file.name, 200);
    fileType = body.file.type;
  }

  const confidence = Number(body.ocr_confidence);
  const { rows } = await query(
    `INSERT INTO organizational_letters
       (user_id, kind, direction, organization_name, ocr_text, ocr_confidence, file_name, file_type, file_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${COLUMNS}`,
    [
      req.user.id,
      pick(body.kind, KINDS, 'letter'),
      pick(body.direction, DIRECTIONS, 'incoming'),
      text(body.organization_name, 200),
      ocrText,
      Number.isFinite(confidence) ? Math.min(Math.max(confidence, 0), 100) : null,
      fileName, fileType, fileData,
    ],
  );

  if (body.analyze === false) return res.status(201).json({ data: rows[0] });
  const { letter, error } = await analyzeAndStore(req.user.id, rows[0]);
  res.status(201).json({ data: letter, warning: error });
}));

const EDITABLE = {
  kind: (v) => pick(v, KINDS, undefined),
  direction: (v) => pick(v, DIRECTIONS, undefined),
  status: (v) => pick(v, STATUSES, undefined),
  urgency: (v) => pick(v, URGENCIES, undefined),
  organization_name: (v) => text(v, 200),
  subject: (v) => text(v),
  sender: (v) => text(v),
  recipient: (v) => text(v),
  letter_number: (v) => text(v, 100),
  letter_date: (v) => text(v, 60),
  deadline: (v) => (v === null ? null : normalizeDate(String(v), new Date(), DEFAULT_TZ)),
  summary: (v) => text(v, 2000),
  clean_text: (v) => text(v, MAX_TEXT_CHARS),
  reply_draft: (v) => (typeof v === 'string' ? v.slice(0, MAX_TEXT_CHARS) : undefined),
};

router.patch('/:id', route(async (req, res) => {
  const sets = [];
  const params = [req.user.id, String(req.params.id)];
  for (const [key, clean] of Object.entries(EDITABLE)) {
    if (!Object.hasOwn(req.body || {}, key)) continue;
    const value = clean(req.body[key]);
    if (value === undefined) continue;
    params.push(value);
    sets.push(`${key} = $${params.length}`);
  }
  if (!sets.length) throw new BadRequest('تغییری ارسال نشده');
  const { rows } = await query(
    `UPDATE organizational_letters SET ${sets.join(', ')}, updated_at = NOW() WHERE user_id = $1 AND id::text = $2 RETURNING ${COLUMNS}`,
    params,
  );
  if (!rows[0]) return res.status(404).json({ error: 'نامه پیدا نشد' });
  res.json({ data: rows[0] });
}));

router.delete('/:id', route(async (req, res) => {
  const { rows } = await query(`DELETE FROM organizational_letters WHERE user_id = $1 AND id::text = $2 RETURNING id`, [req.user.id, String(req.params.id)]);
  if (!rows[0]) return res.status(404).json({ error: 'نامه پیدا نشد' });
  res.json({ data: { id: rows[0].id } });
}));

router.post('/:id/analyze', route(async (req, res) => {
  const letter = await findLetter(req.user.id, req.params.id);
  if (!letter) return res.status(404).json({ error: 'نامه پیدا نشد' });
  const result = await analyzeAndStore(req.user.id, letter);
  res.json({ data: result.letter, warning: result.error });
}));

router.post('/:id/reply', route(async (req, res) => {
  const letter = await findLetter(req.user.id, req.params.id);
  if (!letter) return res.status(404).json({ error: 'نامه پیدا نشد' });
  try {
    const reply = await draftReply({
      letterText: letter.clean_text || letter.ocr_text || '',
      kind: letter.kind,
      userId: req.user.id,
      organizationName: letter.organization_name,
      tone: req.body?.tone,
      instructions: req.body?.instructions,
    });
    const { rows } = await query(
      `UPDATE organizational_letters SET reply_draft = $3, updated_at = NOW() WHERE user_id = $1 AND id = $2 RETURNING ${COLUMNS}`,
      [req.user.id, letter.id, reply],
    );
    res.json({ data: rows[0] });
  } catch (err) {
    console.warn('[org-letters] reply failed:', err.message);
    res.status(503).json({ error: replyError(err) });
  }
}));

// Express 4 does not catch async errors on its own.
router.use((err, _req, res, _next) => {
  if (err instanceof BadRequest) return res.status(400).json({ error: err.message });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'حجم فایل زیاد است' });
  console.error('[org-letters] error:', err);
  res.status(500).json({ error: 'خطایی در سرور رخ داد' });
});

export default router;
