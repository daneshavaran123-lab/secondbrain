/**
 * System prompt for the assistant of «مغز دوم من». Rebuilt on every request with a fresh snapshot of the
 * user's day and long-term memories, so the model starts grounded instead of guessing.
 */

import { query } from '../db/index.js';
import { bucketTasks, loadMemories } from './tools.js';
import { addDays, buildDateTable, isoDateOf, persianDateLabel, persianTime, timeOf, zonedToUtc } from './time.js';

const BASE_PROMPT = `تو دستیار هوشمند اپلیکیشن «مغز دوم من» هستی؛ دستیار اجرایی و حافظه دوم کاربر. اگر نامت را پرسیدند، بگو «دستیار مغز دوم من». همیشه و فقط به فارسی روان و طبیعی جواب بده، حتی اگر کاربر انگلیسی نوشت. نام ابزارها و شناسه‌ها را هرگز به کاربر نشان نده.

## روش کار
۱. هدف کاربر را بفهم و همه کارهای لازم را انجام بده؛ یک پیام می‌تواند چند کار داشته باشد.
۲. هرگز درباره داده‌های کاربر حدس نزن. برای برنامه، کارها، یادداشت‌ها، مخاطبین، عادت‌ها و سلامت اول ابزار جستجو را صدا بزن و بر اساس نتیجه جواب بده.
۳. برای لغو یا تغییر یک قرار، اول با search_calendar پیدایش کن و با meeting_id اقدام کن.
۴. پیش‌فرض منطقی بگذار و کار را انجام بده؛ فقط وقتی اطلاعات ضروری واقعاً مبهم است (مثلاً جلسه بدون روز) با ask_clarification یک سوال کوتاه با گزینه بپرس. برای ذخیره دل‌نوشته، ایده یا یادداشت سوال‌پیچ نکن؛ حال و دسته را خودت از متن حدس بزن.
۵. تاریخ‌ها را همیشه از «جدول تاریخ» پایین به شکل YYYY-MM-DD و ساعت را ۲۴ساعته HH:MM بفرست. «عصر» یعنی حدود ۱۷:۰۰، «صبح» ۰۹:۰۰، «ظهر» ۱۲:۰۰، «شب» ۲۰:۰۰. «آخر هفته» یعنی پنجشنبه.
۶. اگر نتیجه ابزار خطا بود (TIME_CONFLICT، DUPLICATE، MISSING_FIELDS)، ادعای انجام نکن؛ مشکل را بگو و راه‌حل یا زمان جایگزین پیشنهاد بده.
۷. اقدام‌هایی با وضعیت awaiting_user_confirmation هنوز انجام نشده‌اند؛ بگو منتظر تأیید کاربر است.
۸. وقتی کاربر واقعیت ماندگاری درباره خودش می‌گوید (ترجیحات، افراد مهم، اهداف، سبک کار) یا می‌گوید «یادت باشه»، با remember ذخیره‌اش کن. از حافظه برای شخصی‌سازی استفاده کن. رمز، شماره کارت و اطلاعات حساس را ذخیره نکن.
۹. برای جواب دادن از روی یادداشت‌ها، عنوان یادداشت‌های منبع را ذکر کن. اگر چیزی پیدا نشد، صادقانه بگو.

## کجا ذخیره کنم؟
- قرار/جلسه → create_meeting · یادآوری در ساعت مشخص → create_reminder
- کار و وظیفه → create_task (چند کار → create_tasks_batch)
- ایده و «به ذهنم رسید» → save_idea
- احساسات، خاطره، شعر، خواب → save_journal_entry
- شکرگزاری و قدردانی → save_gratitude
- نکته تخصصی، آموخته، مقاله، «یادداشت کن» → save_knowledge
- کتاب، فیلم، سریال، پادکست → save_for_later
- خلاصه یا صورتجلسه → save_meeting_summary و اقدامات پیگیری را با create_tasks_batch بساز
- وزن، خواب، ورزش، آب، فشار → save_health_metrics · «امروز مدیتیشن کردم» → complete_habit
- مخاطب و کارت ویزیت → create_contact · فایل اکسل مخاطبین → import_contacts_batch
- مدرک، دوره، سابقه کاری → add_resume_item · پرونده حقوقی → create_legal_case · یادداشت حقوقی → save_lawyer_note
- نامه و بخشنامه اداری را کاربر در صفحه «نامه‌ها و بخشنامه‌ها» بارگذاری می‌کند؛ برای پیدا کردنشان search_brain با منبع letters
- پیامک → send_sms (همیشه با تأیید)

## سبک پاسخ
- کوتاه، گرم و کاربردی. بدون مقدمه و تعارف تکراری؛ «کار دیگری هست؟» را تکرار نکن.
- بعد از هر اقدام در یک خط بگو چه شد و کجا ذخیره شد، با تاریخ و ساعت فارسی (مثل «چهارشنبه ۶ آبان، ساعت ۱۴:۰۰»).
- برای فهرست‌ها از بولت مارک‌داون و برای موارد مهم از **پررنگ** استفاده کن. جدول نساز مگر لازم باشد.
- اگر به‌جا بود، در پایان یک پیشنهاد کوتاه و مفید بده (مثلاً یادآوری قبل از جلسه)، نه بیشتر.`;

async function rows(sql, params) {
  try {
    return (await query(sql, params)).rows;
  } catch {
    return [];
  }
}

async function buildSnapshot(ctx) {
  const { userId, tz, now } = ctx;
  const today = isoDateOf(now, tz);
  const from = zonedToUtc(today, '00:00', tz).toISOString();
  const to = zonedToUtc(addDays(today, 3), '00:00', tz).toISOString();

  const [profile, events, delegated, planned, habits, doneHabits, memories] = await Promise.all([
    rows(`SELECT display_name, first_name, position, department FROM user_profiles WHERE user_id = $1 LIMIT 1`, [userId]),
    rows(`SELECT id, title, start_date FROM calendar_events WHERE user_id = $1 AND start_date >= $2 AND start_date < $3 ORDER BY start_date LIMIT 12`, [userId, from, to]),
    rows(`SELECT id, title, due_date, priority FROM delegation_tasks WHERE delegator_id = $1 AND COALESCE(status::text, 'pending') NOT IN ('completed', 'done', 'cancelled') ORDER BY due_date ASC NULLS LAST LIMIT 40`, [userId]),
    rows(`SELECT id, title, due_date, priority::text AS priority FROM personal_planning WHERE user_id = $1 AND COALESCE(status::text, 'todo') NOT IN ('done', 'cancelled') ORDER BY due_date ASC NULLS LAST LIMIT 40`, [userId]),
    rows(`SELECT id, title FROM habits WHERE user_id = $1 AND COALESCE(is_active, true) AND archived_at IS NULL LIMIT 20`, [userId]),
    rows(`SELECT habit_id FROM habit_completions WHERE user_id = $1 AND completion_date = $2`, [userId, today]),
    loadMemories(userId).catch(() => []),
  ]);
  const letters = await rows(
    `SELECT subject, deadline FROM organizational_letters
     WHERE user_id = $1 AND status IN ('new', 'in_progress') AND COALESCE(needs_reply, true)
     ORDER BY deadline ASC NULLS LAST, created_at DESC LIMIT 5`,
    [userId],
  );

  const lines = [];
  const p = profile[0];
  if (p) {
    const name = p.display_name || p.first_name;
    const role = [p.position, p.department].filter(Boolean).join('، ');
    if (name || role) lines.push(`- کاربر: ${name || 'نامشخص'}${role ? ` (${role})` : ''}`);
  }

  if (events.length) {
    lines.push('- رویدادهای سه روز پیش رو:');
    for (const e of events) {
      const d = new Date(e.start_date);
      const day = isoDateOf(d, tz) === today ? 'امروز' : persianDateLabel(d, tz);
      lines.push(`  • ${day} ${persianTime(d, tz)} — ${e.title} (id: ${e.id})`);
    }
  } else {
    lines.push('- رویدادی برای سه روز آینده ثبت نشده.');
  }

  const b = bucketTasks([...delegated, ...planned], now, tz, 7);
  const fa = (n) => n.toLocaleString('fa-IR');
  lines.push(`- کارهای باز: ${fa(b.overdue.length)} عقب‌افتاده، ${fa(b.today.length)} برای امروز، ${fa(b.upcoming.length)} برای این هفته.`);
  for (const t of [...b.overdue, ...b.today].slice(0, 6)) {
    lines.push(`  • ${t.title}${t.due ? ` (موعد: ${t.due})` : ''}`);
  }

  if (habits.length) {
    const done = new Set(doneHabits.map((h) => h.habit_id));
    const left = habits.filter((h) => !done.has(h.id)).map((h) => h.title);
    lines.push(`- عادت‌ها: ${fa(habits.length - left.length)} از ${fa(habits.length)} امروز انجام شده${left.length ? `؛ مانده: ${left.slice(0, 5).join('، ')}` : ''}.`);
  }

  if (letters.length) {
    lines.push(`- نامه‌های در انتظار پاسخ (بخش نامه‌ها و بخشنامه‌ها):`);
    for (const l of letters) {
      lines.push(`  • ${l.subject || 'بدون موضوع'}${l.deadline ? ` (مهلت: ${persianDateLabel(new Date(l.deadline), tz)})` : ''}`);
    }
  }

  const memoryLines = memories.map((m) => `- ${m.content} (memory_id: ${m.id})`);
  return { snapshot: lines.join('\n'), memories: memoryLines.join('\n') };
}

export async function buildSystemPrompt(ctx) {
  const { tz, now, page } = ctx;
  let snapshot = '';
  let memories = '';
  if (ctx.userId) {
    ({ snapshot, memories } = await buildSnapshot(ctx).catch(() => ({ snapshot: '', memories: '' })));
  }

  return [
    BASE_PROMPT,
    `## زمان\nاکنون: ${persianDateLabel(now, tz)}، ساعت ${persianTime(now, tz)} (${isoDateOf(now, tz)} ${timeOf(now, tz)}، منطقه زمانی ${tz})`,
    `## جدول تاریخ\n${buildDateTable(now, tz, 14)}`,
    snapshot && `## وضعیت فعلی کاربر\n${snapshot}`,
    memories && `## حافظه بلندمدت درباره کاربر\n${memories}`,
    page && `## صفحه‌ای که کاربر الان در آن است\n${page}`,
  ].filter(Boolean).join('\n\n');
}
