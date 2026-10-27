/**
 * Assistant tools.
 *
 * Three kinds:
 *  - read tools   → executed here, results go back to the model (multi-step loop)
 *  - memory tools → executed here, persist long-term facts about the user
 *  - write tools  → validated/normalised here, then returned to the app, which
 *                   executes them with actionExecutorService (auto or after confirm)
 *
 * Every query is scoped to the authenticated user id and parameterised.
 */

import { query } from '../db/index.js';
import {
  addDays, isoDateOf, normalizeDate, normalizeDateTime, normalizeTime,
  persianDateLabel, persianTime, zonedToUtc,
} from './time.js';

const fn = (name, description, properties = {}, required = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
});

const DATE = { type: 'string', description: 'تاریخ به فرمت YYYY-MM-DD (میلادی، از جدول تاریخ)' };
const TIME = { type: 'string', description: 'ساعت ۲۴ساعته HH:MM' };
const DOMAIN = { type: 'string', enum: ['personal', 'professional', 'organizational'] };
const PRIORITY = { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] };
const TAGS = { type: 'array', items: { type: 'string' } };

// ─── Tool schemas ────────────────────────────────────────────────────────────
const READ_TOOL_DEFS = [
  fn('search_calendar', 'جستجو و مرور رویدادها و قرارهای تقویم کاربر. برای «برنامه امروز/فردا/این هفته» یا پیدا کردن یک جلسه (مثلاً قبل از لغو) استفاده کن.', {
    query: { type: 'string', description: 'بخشی از عنوان (اختیاری)' },
    date_from: DATE,
    date_to: DATE,
  }),
  fn('get_pending_tasks', 'کارهای باز کاربر: عقب‌افتاده، امروز و پیش‌رو.', {
    domain: { type: 'string', enum: ['all', 'personal', 'professional', 'organizational'] },
    days_ahead: { type: 'number', description: 'تا چند روز آینده (پیش‌فرض ۷)' },
  }),
  fn('search_brain', 'جستجو در مغز دوم کاربر: یادداشت‌ها، دانش، دل‌نوشته‌ها، صورتجلسه‌ها، ایده‌ها، شکرگزاری‌ها، محتوای فرهنگی و پرونده‌های حقوقی. برای سوال‌هایی مثل «درباره X چی نوشته بودم؟» یا «ایده‌هام درباره Y».', {
    query: { type: 'string', description: 'کلمات کلیدی' },
    sources: { type: 'array', items: { type: 'string', enum: ['notes', 'ideas', 'meetings', 'gratitude', 'content', 'saved', 'legal'] }, description: 'محدود کردن منابع (اختیاری)' },
    limit: { type: 'number' },
  }, ['query']),
  fn('search_contacts', 'جستجوی مخاطبین کاربر با نام، سازمان، ایمیل یا تلفن.', {
    query: { type: 'string' },
  }, ['query']),
  fn('get_habits_status', 'عادت‌های فعال کاربر و اینکه امروز کدام انجام شده‌اند.'),
  fn('get_health_summary', 'خلاصه داده‌های سلامت چند روز اخیر (خواب، ورزش، آب، وزن).', {
    days: { type: 'number', description: 'تعداد روز (پیش‌فرض ۷)' },
  }),
];

const MEMORY_TOOL_DEFS = [
  fn('remember', 'ذخیره یک واقعیت ماندگار درباره کاربر در حافظه بلندمدت (ترجیحات، افراد مهم، اهداف، عادت‌های کاری). اطلاعات حساس مثل رمز را ذخیره نکن.', {
    fact: { type: 'string', description: 'یک جمله کوتاه و مستقل' },
    category: { type: 'string', enum: ['preference', 'person', 'goal', 'work', 'personal', 'other'] },
  }, ['fact']),
  fn('forget', 'حذف یک مورد از حافظه بلندمدت.', {
    memory_id: { type: 'string', description: 'شناسه از بخش حافظه' },
  }, ['memory_id']),
];

const CLARIFY_TOOL_DEF = fn('ask_clarification', 'فقط وقتی یک اطلاعات ضروری واقعاً مبهم است، یک سوال کوتاه با گزینه‌های پیشنهادی بپرس.', {
  question: { type: 'string' },
  options: { type: 'array', items: { type: 'string' }, description: '۲ تا ۵ گزینه کوتاه' },
  field: { type: 'string' },
}, ['question']);

const WRITE_TOOL_DEFS = [
  fn('create_meeting', 'ایجاد قرار یا جلسه در تقویم.', {
    title: { type: 'string' }, date: DATE, time: TIME,
    duration: { type: 'number', description: 'دقیقه (پیش‌فرض ۶۰)' },
    participants: TAGS, location: { type: 'string' }, description: { type: 'string' },
  }, ['title', 'date']),
  fn('cancel_meeting', 'لغو یک قرار موجود. اول با search_calendar شناسه‌اش را پیدا کن.', {
    meeting_id: { type: 'string' }, title: { type: 'string', description: 'عنوان قرار برای نمایش به کاربر' },
    search_query: { type: 'string' }, date: DATE,
  }),
  fn('update_meeting', 'تغییر یک قرار موجود (عنوان، تاریخ، ساعت، مکان). اول با search_calendar شناسه‌اش را پیدا کن.', {
    meeting_id: { type: 'string' }, title: { type: 'string', description: 'عنوان فعلی قرار برای نمایش' },
    search_query: { type: 'string' },
    updates: { type: 'object', properties: { title: { type: 'string' }, date: DATE, time: TIME, location: { type: 'string' } } },
  }),
  fn('create_task', 'ایجاد یک وظیفه.', {
    title: { type: 'string' }, description: { type: 'string' }, due_date: DATE, priority: PRIORITY, domain: DOMAIN,
  }, ['title']),
  fn('create_tasks_batch', 'ایجاد چند وظیفه با هم (مثلاً اقدامات یک جلسه).', {
    tasks: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, due_date: DATE, priority: PRIORITY, assignee: { type: 'string' } }, required: ['title'] } },
    domain: DOMAIN,
  }, ['tasks']),
  fn('create_reminder', 'تنظیم یادآوری در زمان مشخص.', {
    title: { type: 'string' }, datetime: { type: 'string', description: 'YYYY-MM-DD HH:MM' },
    repeat: { type: 'string', enum: ['once', 'daily', 'weekly', 'monthly'] },
  }, ['title', 'datetime']),
  fn('save_idea', 'ذخیره ایده در بانک ایده‌ها.', {
    title: { type: 'string' }, description: { type: 'string' },
    category: { type: 'string', enum: ['business', 'product', 'process', 'marketing', 'technology', 'personal'] },
    domain: DOMAIN, tags: TAGS, priority: { type: 'string', enum: ['low', 'medium', 'high'] },
  }, ['title', 'description']),
  fn('save_journal_entry', 'ذخیره دل‌نوشته، خاطره، شعر یا خواب.', {
    content: { type: 'string' },
    mood: { type: 'string', enum: ['happy', 'sad', 'calm', 'anxious', 'grateful', 'motivated'] },
    tags: TAGS,
  }, ['content']),
  fn('save_gratitude', 'ثبت شکرگزاری امروز.', {
    item_1: { type: 'string' }, item_2: { type: 'string' }, item_3: { type: 'string' }, notes: { type: 'string' },
  }, ['item_1']),
  fn('save_meeting_summary', 'ذخیره صورتجلسه یا خلاصه جلسه.', {
    meeting_title: { type: 'string' }, meeting_date: DATE, participants: TAGS, summary: { type: 'string' },
    decisions: TAGS,
    action_items: { type: 'array', items: { type: 'object', properties: { task: { type: 'string' }, assignee: { type: 'string' }, deadline: DATE } } },
  }, ['meeting_title', 'summary']),
  fn('create_contact', 'ذخیره مخاطب جدید (مثلاً از کارت ویزیت).', {
    name: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' }, organization: { type: 'string' },
    role: { type: 'string' }, address: { type: 'string' }, notes: { type: 'string' },
  }, ['name']),
  fn('import_contacts_batch', 'ورود دسته‌ای مخاطبین از فایل اکسل/CSV ضمیمه.', {
    contacts: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' }, organization: { type: 'string' }, role: { type: 'string' } }, required: ['name'] } },
    skip_duplicates: { type: 'boolean' },
  }, ['contacts']),
  fn('save_for_later', 'ذخیره کتاب، فیلم، سریال، پادکست یا ویدیو در محتوای فرهنگی.', {
    title: { type: 'string' }, content: { type: 'string' }, source_url: { type: 'string' },
    category: { type: 'string', enum: ['book', 'movie', 'series', 'youtube', 'podcast', 'audiobook', 'theater'] }, tags: TAGS,
  }, ['title']),
  fn('save_knowledge', 'ذخیره یادداشت تخصصی، نکته، مقاله یا آموخته در مدیریت دانش.', {
    title: { type: 'string' }, content: { type: 'string' },
    category: { type: 'string', enum: ['مقالات', 'نکات', 'آموزشی', 'تحقیقاتی', 'یادداشت', 'صورتجلسات'] }, tags: TAGS,
  }, ['title', 'content']),
  fn('save_health_metrics', 'ثبت داده سلامت امروز.', {
    weight: { type: 'number' }, blood_pressure: { type: 'string' }, heart_rate: { type: 'number' },
    sleep_hours: { type: 'number' }, exercise_minutes: { type: 'number' }, water_intake: { type: 'number', description: 'لیوان' },
    notes: { type: 'string' },
  }),
  fn('complete_habit', 'ثبت انجام یک عادت برای امروز.', {
    habit_name: { type: 'string' }, notes: { type: 'string' },
  }, ['habit_name']),
  fn('add_resume_item', 'افزودن مورد به رزومه.', {
    section: { type: 'string', enum: ['education', 'work', 'skills', 'certificates', 'awards', 'affiliations'] },
    title: { type: 'string' }, organization: { type: 'string' }, start_date: { type: 'string' }, end_date: { type: 'string' },
    description: { type: 'string' }, location: { type: 'string' },
  }, ['section', 'title']),
  fn('create_legal_case', 'ایجاد پرونده حقوقی.', {
    title: { type: 'string' }, case_number: { type: 'string' },
    case_type: { type: 'string', enum: ['civil', 'criminal', 'administrative', 'family', 'commercial'] },
    court: { type: 'string' }, opposing_party: { type: 'string' }, description: { type: 'string' }, next_hearing_date: DATE,
  }, ['title']),
  fn('save_lawyer_note', 'ذخیره یادداشت حقوقی.', {
    title: { type: 'string' }, content: { type: 'string' }, case_title: { type: 'string' },
    category: { type: 'string', enum: ['meeting-prep', 'follow-up', 'important', 'reminder', 'general'] },
  }, ['title', 'content']),
  fn('send_sms', 'ارسال پیامک. همیشه نیاز به تأیید کاربر دارد.', {
    phone: { type: 'string', description: 'شماره موبایل، مثلاً 09121234567' }, message: { type: 'string' },
  }, ['phone', 'message']),
];

export const TOOLS = [...READ_TOOL_DEFS, ...MEMORY_TOOL_DEFS, CLARIFY_TOOL_DEF, ...WRITE_TOOL_DEFS];

const WRITE_TOOLS = new Set(WRITE_TOOL_DEFS.map((t) => t.function.name));
// Destructive, outbound or bulk actions wait for an explicit tap in the app.
const NEEDS_CONFIRMATION = new Set(['cancel_meeting', 'update_meeting', 'send_sms', 'import_contacts_batch']);

export const isWriteTool = (name) => WRITE_TOOLS.has(name);

// ─── Helpers ─────────────────────────────────────────────────────────────────
const clip = (text, n = 280) => {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
};

/** Run a query, returning [] if a table/column is missing in this deployment. */
async function safeRows(sql, params) {
  try {
    const { rows } = await query(sql, params);
    return rows;
  } catch (err) {
    console.warn('[agent] query skipped:', err.message);
    return [];
  }
}

// Unify Arabic/Persian letter variants and drop ZWNJ so «می‌خواهم» matches «میخواهم».
const normalizeFa = (s) => String(s ?? '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/‌/g, '');
const SQL_NORMALIZE = (expr) => `translate(${expr}, 'يك' || chr(8204), 'یک')`;
const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

const STOPWORDS = new Set(['از', 'به', 'در', 'که', 'را', 'با', 'این', 'آن', 'برای', 'و', 'یا', 'چی', 'چه', 'من', 'درباره', 'مورد', 'رو', 'هم', 'تا', 'بود', 'است', 'های', 'ها', 'یه', 'یک', 'نوشته', 'بودم', 'کردم', 'چیزی']);

function keywords(text) {
  return [...new Set(normalizeFa(text).toLowerCase().split(/[\s,.;:!?؟،«»"'()\-/]+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w)))].slice(0, 6);
}

const localWhen = (value, tz) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${persianDateLabel(d, tz)} ساعت ${persianTime(d, tz)}`;
};

// ─── Read tools ──────────────────────────────────────────────────────────────
async function searchCalendar(args, ctx) {
  const { userId, tz, now } = ctx;
  const today = isoDateOf(now, tz);
  const from = normalizeDate(args.date_from, now, tz);
  const to = normalizeDate(args.date_to, now, tz);
  const text = typeof args.query === 'string' ? args.query.trim() : '';

  // Without a range: a text search looks ±90 days, a plain lookup shows the next week.
  const start = from || (text ? addDays(today, -90) : today);
  const end = to ? addDays(to, 1) : addDays(from || today, text ? 180 : 7);

  const params = [userId, zonedToUtc(start, '00:00', tz).toISOString(), zonedToUtc(end, '00:00', tz).toISOString()];
  let sql = `SELECT * FROM calendar_events WHERE user_id = $1 AND start_date >= $2 AND start_date < $3`;
  if (text) {
    params.push(`%${escapeLike(normalizeFa(text))}%`);
    sql += ` AND ${SQL_NORMALIZE('title')} ILIKE $4`;
  }
  sql += ' ORDER BY start_date ASC LIMIT 25';

  const rows = await safeRows(sql, params);
  return {
    range: { from: start, to: addDays(end, -1) },
    count: rows.length,
    events: rows.map((e) => ({
      id: e.id,
      title: e.title,
      when: localWhen(e.start_date, tz),
      start_iso: e.start_date,
      end_time: e.end_date ? persianTime(new Date(e.end_date), tz) : null,
      type: e.event_type || null,
      location: e.venue_address || null,
    })),
  };
}

const OPEN_TASK = `COALESCE(status::text, 'pending') NOT IN ('completed', 'done', 'cancelled')`;

async function loadOpenTasks(userId, domain) {
  const domainFilter = domain && domain !== 'all' ? ' AND domain = $2' : '';
  const params = domainFilter ? [userId, domain] : [userId];
  const [delegated, planned] = await Promise.all([
    safeRows(`SELECT id, title, due_date, priority, status, domain FROM delegation_tasks
              WHERE delegator_id = $1 AND ${OPEN_TASK}${domainFilter} ORDER BY due_date ASC NULLS LAST LIMIT 60`, params),
    safeRows(`SELECT id, title, due_date, priority::text AS priority, status::text AS status, domain FROM personal_planning
              WHERE user_id = $1 AND ${OPEN_TASK}${domainFilter} ORDER BY due_date ASC NULLS LAST LIMIT 60`, params),
  ]);
  return [...delegated, ...planned];
}

export function bucketTasks(tasks, now, tz, daysAhead = 7) {
  const today = isoDateOf(now, tz);
  const horizon = addDays(today, daysAhead);
  const buckets = { overdue: [], today: [], upcoming: [], no_date: [] };
  for (const t of tasks) {
    const item = { id: t.id, title: t.title, priority: t.priority || null, status: t.status || null };
    if (!t.due_date) { buckets.no_date.push(item); continue; }
    const due = isoDateOf(new Date(t.due_date), tz);
    item.due = persianDateLabel(new Date(t.due_date), tz);
    if (due < today) buckets.overdue.push(item);
    else if (due === today) buckets.today.push(item);
    else if (due <= horizon) buckets.upcoming.push(item);
  }
  return buckets;
}

async function getPendingTasks(args, ctx) {
  const tasks = await loadOpenTasks(ctx.userId, args.domain);
  const days = Math.min(Math.max(Number(args.days_ahead) || 7, 1), 60);
  const b = bucketTasks(tasks, ctx.now, ctx.tz, days);
  return {
    counts: { overdue: b.overdue.length, today: b.today.length, upcoming: b.upcoming.length, no_date: b.no_date.length },
    overdue: b.overdue.slice(0, 15),
    today: b.today.slice(0, 15),
    upcoming: b.upcoming.slice(0, 15),
    no_date: b.no_date.slice(0, 10),
  };
}

const BRAIN_SOURCES = {
  notes: { label: 'یادداشت/دانش', table: 'knowledge_base', owner: 'author_id', title: 'title', body: 'content', extra: 'category' },
  ideas: { label: 'ایده', table: 'ideas', owner: 'user_id', title: 'title', body: 'description', extra: 'status' },
  meetings: { label: 'جلسه', table: 'meetings', owner: 'user_id', title: 'title', body: 'description', extra: 'status' },
  gratitude: { label: 'شکرگزاری', table: 'gratitude_entries', owner: 'user_id', title: null, body: 'content', extra: 'mood' },
  content: { label: 'محتوای فرهنگی', table: 'cultural_content', owner: 'user_id', title: 'title', body: 'content', extra: 'content_type' },
  saved: { label: 'ذخیره‌شده', table: 'knowledge_items', owner: 'user_id', title: 'title', body: 'content', extra: null },
  legal: { label: 'پرونده حقوقی', table: 'legal_cases', owner: 'user_id', title: 'title', body: 'description', extra: 'status' },
};

function snippetAround(body, words) {
  const text = String(body ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const norm = normalizeFa(text).toLowerCase();
  const hit = words.map((w) => norm.indexOf(w)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
  if (hit === undefined || hit < 120) return clip(text, 320);
  return `…${clip(text.slice(hit - 100), 320)}`;
}

async function searchBrain(args, ctx) {
  const words = keywords(args.query || '');
  const wanted = Array.isArray(args.sources) && args.sources.length
    ? args.sources.filter((s) => BRAIN_SOURCES[s])
    : Object.keys(BRAIN_SOURCES);
  const limit = Math.min(Math.max(Number(args.limit) || 8, 1), 20);
  const patterns = words.map((w) => `%${escapeLike(w)}%`);

  const perSource = await Promise.all(wanted.map(async (key) => {
    const s = BRAIN_SOURCES[key];
    const haystack = SQL_NORMALIZE(`COALESCE(${s.title || "''"}, '') || ' ' || COALESCE(${s.body}, '')`);
    const where = patterns.length ? ` AND ${haystack} ILIKE ANY($2)` : '';
    const params = patterns.length ? [ctx.userId, patterns] : [ctx.userId];
    const rows = await safeRows(
      `SELECT * FROM ${s.table} WHERE ${s.owner} = $1${where} ORDER BY created_at DESC NULLS LAST LIMIT 15`,
      params,
    );
    return rows.map((r) => ({ key, s, r }));
  }));

  const scored = perSource.flat().map(({ key, s, r }) => {
    const title = s.title ? r[s.title] : null;
    const body = r[s.body];
    const t = normalizeFa(title).toLowerCase();
    const b = normalizeFa(body).toLowerCase();
    const score = words.reduce((acc, w) => acc + (t.includes(w) ? 3 : 0) + (b.includes(w) ? 1 : 0), 0);
    return {
      score,
      created: r.created_at ? new Date(r.created_at).getTime() : 0,
      item: {
        source: s.label,
        id: r.id,
        title: title || clip(body, 60),
        ...(s.extra && r[s.extra] ? { tag: r[s.extra] } : {}),
        date: r.created_at ? persianDateLabel(new Date(r.created_at), ctx.tz) : null,
        snippet: snippetAround(body, words),
        source_key: key,
      },
    };
  });

  scored.sort((a, b) => b.score - a.score || b.created - a.created);
  const results = scored.slice(0, limit).map((x) => x.item);
  return { keywords: words, count: results.length, results };
}

async function searchContacts(args, ctx) {
  const words = keywords(args.query || '');
  if (!words.length) return { count: 0, contacts: [] };
  const patterns = words.map((w) => `%${escapeLike(w)}%`);
  const hay = (cols) => SQL_NORMALIZE(cols.map((c) => `COALESCE(${c}::text, '')`).join(` || ' ' || `));
  const [personal, network, company] = await Promise.all([
    safeRows(`SELECT * FROM personal_contacts WHERE user_id = $1 AND ${hay(['full_name', 'organization', 'email', 'phone', 'role'])} ILIKE ANY($2) LIMIT 10`, [ctx.userId, patterns]),
    safeRows(`SELECT * FROM networking_contacts WHERE user_id = $1 AND ${hay(['name', 'organization_name', 'email', 'phone', 'title'])} ILIKE ANY($2) LIMIT 10`, [ctx.userId, patterns]),
    safeRows(`SELECT * FROM company_contacts WHERE user_id = $1 AND ${hay(['name', 'organization', 'email', 'phone', 'role'])} ILIKE ANY($2) LIMIT 10`, [ctx.userId, patterns]),
  ]);
  const contacts = [
    ...personal.map((c) => ({ id: c.id, name: c.full_name, phone: c.phone, email: c.email, organization: c.organization, role: c.role, list: 'شخصی' })),
    ...network.map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email, organization: c.organization_name, role: c.title, list: 'شبکه' })),
    ...company.map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email, organization: c.organization, role: c.role, list: 'شرکت' })),
  ].slice(0, 15);
  return { count: contacts.length, contacts };
}

async function getHabitsStatus(_args, ctx) {
  const today = isoDateOf(ctx.now, ctx.tz);
  const [habits, done] = await Promise.all([
    safeRows(`SELECT id, title, emoji FROM habits WHERE user_id = $1 AND COALESCE(is_active, true) AND archived_at IS NULL ORDER BY sort_order NULLS LAST, created_at`, [ctx.userId]),
    safeRows(`SELECT habit_id FROM habit_completions WHERE user_id = $1 AND completion_date = $2 AND COALESCE(completed, true)`, [ctx.userId, today]),
  ]);
  const doneIds = new Set(done.map((d) => d.habit_id));
  return {
    total: habits.length,
    done_today: habits.filter((h) => doneIds.has(h.id)).length,
    habits: habits.map((h) => ({ title: `${h.emoji ? `${h.emoji} ` : ''}${h.title}`, done_today: doneIds.has(h.id) })),
  };
}

async function getHealthSummary(args, ctx) {
  const days = Math.min(Math.max(Number(args.days) || 7, 1), 60);
  const since = addDays(isoDateOf(ctx.now, ctx.tz), -days + 1);
  const rows = await safeRows(`SELECT * FROM health_metrics WHERE user_id = $1 AND date >= $2 ORDER BY date DESC LIMIT 60`, [ctx.userId, since]);
  const avg = (key) => {
    const vals = rows.map((r) => Number(r[key])).filter((v) => Number.isFinite(v) && v > 0);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  };
  return {
    days, entries: rows.length,
    averages: { sleep_hours: avg('sleep_hours'), exercise_minutes: avg('exercise_minutes'), water_intake: avg('water_intake'), weight: avg('weight') },
    recent: rows.slice(0, 7).map((r) => ({
      date: r.date ? persianDateLabel(new Date(r.date), ctx.tz) : null,
      sleep_hours: r.sleep_hours, exercise_minutes: r.exercise_minutes, water_intake: r.water_intake, weight: r.weight,
    })),
  };
}

// ─── Memory ──────────────────────────────────────────────────────────────────
// schema.sql runs as a single batch at startup and aborts on the first error, so the
// assistant ensures its own table/columns once per process (all statements idempotent).
let assistantSchemaReady = null;
export function ensureAssistantSchema() {
  assistantSchemaReady ??= query(`
    ALTER TABLE IF EXISTS calendar_events ADD COLUMN IF NOT EXISTS venue_address TEXT;
    ALTER TABLE IF EXISTS calendar_events ADD COLUMN IF NOT EXISTS domain VARCHAR(50);
    ALTER TABLE IF EXISTS calendar_events ADD COLUMN IF NOT EXISTS color VARCHAR(20);
    ALTER TABLE IF EXISTS calendar_events ADD COLUMN IF NOT EXISTS reminders JSONB;
    CREATE TABLE IF NOT EXISTS assistant_memories (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID NOT NULL,
      content    TEXT NOT NULL,
      category   VARCHAR(50) DEFAULT 'other',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_assistant_memories_user ON assistant_memories(user_id, created_at DESC);
  `).catch((err) => {
    assistantSchemaReady = null;
    console.warn('[agent] assistant schema unavailable:', err.message);
  });
  return assistantSchemaReady;
}

export async function loadMemories(userId, limit = 40) {
  await ensureAssistantSchema();
  return safeRows(`SELECT id, content, category FROM assistant_memories WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`, [userId, limit]);
}

async function remember(args, ctx) {
  const fact = clip(args.fact, 400);
  if (!fact) return { error: 'EMPTY_FACT' };
  await ensureAssistantSchema();
  const existing = await safeRows(`SELECT id FROM assistant_memories WHERE user_id = $1 AND content = $2 LIMIT 1`, [ctx.userId, fact]);
  if (existing.length) return { ok: true, memory_id: existing[0].id, note: 'از قبل در حافظه بود' };
  const rows = await safeRows(
    `INSERT INTO assistant_memories (user_id, content, category) VALUES ($1, $2, $3) RETURNING id`,
    [ctx.userId, fact, args.category || 'other'],
  );
  return rows.length ? { ok: true, memory_id: rows[0].id } : { error: 'MEMORY_UNAVAILABLE' };
}

async function forget(args, ctx) {
  if (!args.memory_id) return { error: 'MISSING_ID' };
  const rows = await safeRows(`DELETE FROM assistant_memories WHERE user_id = $1 AND id::text = $2 RETURNING id`, [ctx.userId, String(args.memory_id)]);
  return rows.length ? { ok: true } : { error: 'NOT_FOUND' };
}

export const SERVER_TOOLS = {
  search_calendar: searchCalendar,
  get_pending_tasks: getPendingTasks,
  search_brain: searchBrain,
  search_contacts: searchContacts,
  get_habits_status: getHabitsStatus,
  get_health_summary: getHealthSummary,
  remember,
  forget,
};

/** Short Persian label for the «what I looked at» trail in the UI. */
export function stepLabel(name, args) {
  const q = args?.query ? ` «${clip(args.query, 30)}»` : '';
  switch (name) {
    case 'search_calendar': return `بررسی تقویم${q}`;
    case 'get_pending_tasks': return 'مرور کارهای باز';
    case 'search_brain': return `جستجو در یادداشت‌ها${q}`;
    case 'search_contacts': return `جستجوی مخاطبین${q}`;
    case 'get_habits_status': return 'بررسی عادت‌ها';
    case 'get_health_summary': return 'مرور داده‌های سلامت';
    case 'remember': return 'به خاطر سپردن';
    case 'forget': return 'پاک کردن از حافظه';
    default: return name;
  }
}

// ─── Write tools: normalise, validate, pre-check, describe ───────────────────
const DOMAIN_LABEL = { personal: 'شخصی', professional: 'حرفه‌ای', organizational: 'سازمانی' };
const RESUME_LABEL = { education: 'تحصیلات', work: 'سوابق کاری', skills: 'مهارت‌ها', certificates: 'گواهینامه‌ها', awards: 'افتخارات', affiliations: 'عضویت‌ها' };

function feedbackFor(name, p) {
  switch (name) {
    case 'create_meeting': return { location: 'تقویم', details: `«${p.title}» ${p.date || ''} ${p.time || ''}`.trim() };
    case 'cancel_meeting': return { location: 'تقویم', details: `لغو ${p.title ? `«${p.title}»` : 'قرار'}` };
    case 'update_meeting': return { location: 'تقویم', details: `ویرایش ${p.title ? `«${p.title}»` : 'قرار'}` };
    case 'create_task': return { location: `وظایف ${DOMAIN_LABEL[p.domain] || ''}`.trim(), details: `«${p.title}»${p.due_date ? ` تا ${p.due_date}` : ''}` };
    case 'create_tasks_batch': return { location: 'وظایف', details: `${(p.tasks || []).length} وظیفه` };
    case 'create_reminder': return { location: 'یادآورها', details: `«${p.title}» ${p.datetime || ''}`.trim() };
    case 'save_idea': return { location: 'بانک ایده‌ها', details: `«${p.title}»` };
    case 'save_journal_entry': return { location: 'دل‌نوشته‌ها', details: clip(p.content, 40) };
    case 'save_gratitude': return { location: 'شکرگزاری', details: clip(p.item_1, 40) };
    case 'save_meeting_summary': return { location: 'صورتجلسات', details: `«${p.meeting_title}»` };
    case 'create_contact': return { location: 'مخاطبین', details: `«${p.name}»${p.organization ? ` - ${p.organization}` : ''}` };
    case 'import_contacts_batch': return { location: 'مخاطبین', details: `${(p.contacts || []).length} مخاطب` };
    case 'save_for_later': return { location: 'محتوای فرهنگی', details: `«${p.title}»` };
    case 'save_knowledge': return { location: 'مدیریت دانش', details: `«${p.title}»` };
    case 'save_health_metrics': return { location: 'سلامت', details: 'داده‌های امروز' };
    case 'complete_habit': return { location: 'عادت‌ها', details: `«${p.habit_name}»` };
    case 'add_resume_item': return { location: `رزومه › ${RESUME_LABEL[p.section] || p.section}`, details: `«${p.title}»` };
    case 'create_legal_case': return { location: 'امور حقوقی', details: `«${p.title}»` };
    case 'save_lawyer_note': return { location: 'یادداشت‌های حقوقی', details: `«${p.title}»` };
    case 'send_sms': return { location: 'پیامک', details: `به ${p.phone}: ${clip(p.message, 40)}` };
    default: return { location: 'سیستم', details: name };
  }
}

function normalizeParams(name, raw, ctx) {
  const p = { ...(raw || {}) };
  const { now, tz } = ctx;
  const date = (v) => normalizeDate(v, now, tz) || v;

  if (name === 'create_meeting') {
    // Models sometimes pack the time into `date`; split it back out.
    const dt = normalizeDateTime(`${p.date || ''} ${p.time || ''}`, now, tz);
    if (dt.date) p.date = dt.date;
    const t = normalizeTime(p.time) || dt.time;
    if (t) p.time = t;
  }
  if (name === 'update_meeting' && p.updates) {
    p.updates = { ...p.updates };
    if (p.updates.date) p.updates.date = date(p.updates.date);
    if (p.updates.time) p.updates.time = normalizeTime(p.updates.time) || p.updates.time;
  }
  if (name === 'create_reminder') {
    const dt = normalizeDateTime(p.datetime, now, tz);
    if (dt.date || dt.time) p.datetime = `${dt.date || isoDateOf(now, tz)} ${dt.time || '09:00'}`;
  }
  for (const key of ['due_date', 'meeting_date', 'next_hearing_date']) {
    if (p[key]) p[key] = date(p[key]);
  }
  if (name === 'cancel_meeting' && p.date) p.date = date(p.date);
  if (Array.isArray(p.tasks)) p.tasks = p.tasks.map((t) => ({ ...t, ...(t.due_date ? { due_date: date(t.due_date) } : {}) }));
  if (Array.isArray(p.action_items)) p.action_items = p.action_items.map((a) => ({ ...a, ...(a.deadline ? { deadline: date(a.deadline) } : {}) }));
  return p;
}

const REQUIRED = Object.fromEntries(WRITE_TOOL_DEFS.map((t) => [t.function.name, t.function.parameters.required || []]));

/** Check a proposed meeting against the user's calendar before the app writes it. */
async function meetingConflicts(p, ctx) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '') || !/^\d{2}:\d{2}$/.test(p.time || '')) return null;
  const start = zonedToUtc(p.date, p.time, ctx.tz);
  const end = new Date(start.getTime() + (Number(p.duration) || 60) * 60000);
  const rows = await safeRows(
    `SELECT id, title, start_date, end_date FROM calendar_events
     WHERE user_id = $1 AND start_date < $3 AND COALESCE(end_date, start_date + interval '1 hour') > $2
     ORDER BY start_date LIMIT 3`,
    [ctx.userId, start.toISOString(), end.toISOString()],
  );
  if (!rows.length) return null;
  const same = rows.find((r) => normalizeFa(r.title).trim() === normalizeFa(p.title).trim());
  return {
    error: same ? 'DUPLICATE' : 'TIME_CONFLICT',
    conflicts: rows.map((r) => ({ id: r.id, title: r.title, when: localWhen(r.start_date, ctx.tz) })),
    hint: same ? 'این قرار قبلاً ثبت شده؛ از کاربر بپرس تغییرش بدهد یا نه.' : 'به کاربر بگو و چند ساعت جایگزین خالی پیشنهاد بده.',
  };
}

/**
 * Turn a write tool call into an action for the app.
 * Returns { action } or { error, ... } (the error goes back to the model).
 */
export async function planWriteAction(name, rawArgs, ctx) {
  const params = normalizeParams(name, rawArgs, ctx);
  const missing = REQUIRED[name].filter((k) => params[k] === undefined || params[k] === null || params[k] === '' || (Array.isArray(params[k]) && !params[k].length));
  if (missing.length) return { error: 'MISSING_FIELDS', missing, hint: 'اگر قابل حدس نیست، با ask_clarification بپرس.' };

  if (name === 'create_meeting') {
    const conflict = await meetingConflicts(params, ctx);
    if (conflict) return conflict;
  }
  if ((name === 'cancel_meeting' || name === 'update_meeting') && !params.meeting_id && !params.search_query) {
    return { error: 'MISSING_FIELDS', missing: ['meeting_id'], hint: 'اول با search_calendar قرار را پیدا کن.' };
  }

  const status = NEEDS_CONFIRMATION.has(name) ? 'needs_confirmation' : 'pending';
  return {
    action: { type: 'action', id: `act_${Math.random().toString(36).slice(2, 10)}`, function: name, params, status, feedback: feedbackFor(name, params) },
  };
}
