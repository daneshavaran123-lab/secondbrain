# Research: پیوند در پاسخ دستیار و اعلان‌ها

هیچ «NEEDS CLARIFICATION» در Technical Context نماند؛ تصمیم‌ها از کد موجود، پاسخ‌های کاربر و قانون اساسی گرفته شد.

## وضع موجود (بررسی کد)

- پاسخ دستیار در `SmartAssistant.tsx` با `react-markdown` نمایش داده می‌شود و هر `<a>` با `target="_blank"` به بیرون می‌رود.
- ابزارهای خواندن (`search_brain`، `search_calendar`، `get_pending_tasks`، `search_contacts`) شناسه موردها را برمی‌گردانند؛ فقط
  `search_brain` مسیر صفحه (`path`) دارد.
- کارهای نوشتن روی کلاینت پس از تأیید با `actionExecutorService` اجرا می‌شوند؛ بیشتر `insert`ها شناسه برنمی‌گردانند.
- یادآورها در `calendar_events` با `event_type = 'reminder'` ذخیره می‌شوند؛ هیچ چیز سر موعد خبر نمی‌دهد.
- مرکز اعلان (`notification-center.tsx`) فقط `localStorage` است و هیچ کدی اعلانی در آن نمی‌گذارد.
- `delegation_notifications` و `organization_notifications` خالی‌اند و کدی در آن‌ها نمی‌نویسد.
- `public/sw.js` ثبت می‌شود و از پیش `push` و `notificationclick` دارد.
- پیامک: `utils/sms.js` (sms.ir، `SMS_API_KEY`)؛ ایمیل: `utils/email.js` (Resend، `RESEND_API_KEY`). شماره تلفن در
  `user_profiles.phone` / `mobile_phone`.

## R1. پیوند دادن نام موردها در پاسخ دستیار

- **Decision**: سرور در طول هر نوبت، موردهای خروجی ابزارهای خواندن را در فهرست `references` با کلید `r1…rN` جمع می‌کند و همان
  کلید (`ref`) را در خروجی ابزار به مدل می‌دهد؛ دستور سیستم می‌گوید نام مورد را `[عنوان](ref:rN)` بنویسد. پس از پاسخ نهایی،
  سرور (الف) هر `ref:` ناموجود را به متن ساده برمی‌گرداند و (ب) اولین رخداد عنوان هر ارجاعی را که هنوز پیوند نشده پیوند
  می‌دهد. کلاینت فقط `ref:` موجود در `references` همان پیام را به `<Link>` درون برنامه تبدیل می‌کند؛ هر `href` دیگری متن ساده است.
- **Rationale**: FR-001 و FR-003. مدل مسیر نمی‌نویسد (فقط کلید)، پس نمی‌تواند به بیرون یا به صفحه ساختگی پیوند بدهد؛ پیوند
  دادن قطعی عنوان‌ها در سرور، با مدل ساختگی هم آزمودنی است و اگر مدل دستور را رعایت نکند هم پیوند هست.
- **Alternatives considered**: مدل مسیر کامل بنویسد (قابل جعل، خلاف FR-003)؛ فقط ردیف «موردهای اشاره‌شده» زیر پاسخ (نام در
  خود متن پیوند نمی‌شد، خلاف سناریو ۱)؛ پیوند دادن در کلاینت با جستجوی عنوان (منطق تکراری و آزمون سخت‌تر).

## R2. پیوند «باز کردن» برای کار انجام‌شده

- **Decision**: `feedbackFor` در backend برای هر ابزار نوشتن `page` (و اینکه صفحه `highlight` می‌پذیرد) را هم برمی‌گرداند؛
  `actionExecutorService` شناسه ردیف ساخته‌شده را (`insert(...).select('id').single()`) در `ActionResult.data.id` می‌گذارد و کارت
  تأیید پیوند `page?highlight=id` (یا فقط `page`) نشان می‌دهد.
- **Rationale**: FR-002؛ یک منبع حقیقت برای صفحه هر ابزار (backend)، شناسه از همان جایی که ردیف ساخته می‌شود.

## R3. زمان‌بند: درون backend با قفل

- **Decision**: `worker.js` با `setInterval` هر ۳۰ ثانیه؛ در هر تیک `pg_try_advisory_lock` تا دو نمونه سرور هم‌زمان کار نکنند؛
  produce (ساختن اعلان‌های رسیده) ← deliver (تحویل‌های رسیده) ← روزی یک بار پاک کردن اعلان‌های بیش از ۹۰ روز.
- **Rationale**: یک فرایند Node در تولید (liara) هست؛ سرویس صف/cron جدا لازم نیست. قفل advisory + کلید یکتا (R4) «دقیقاً یک
  بار» را حتی با دو نمونه نگه می‌دارد.
- **Alternatives considered**: cron بیرونی (پیکربندی جدا در میزبان)؛ صف مثل BullMQ (Redis تازه)؛ زمان‌بندی در کلاینت (با برنامه
  بسته کار نمی‌کند، خلاف پاسخ پرسش ۲).

## R4. «دقیقاً یک اعلان» و پس‌گیری موعدهای ازدست‌رفته

- **Decision**: هر اعلان `dedupe_key` دارد (مثلاً `reminder:<eventId>:<startIso>`، `event:<id>:<startIso>`، `task_due:<id>:<date>`،
  `invite:<id>`، `delegated:<id>`، `delegation_status:<id>:<status>`) با `UNIQUE (user_id, dedupe_key)` و `ON CONFLICT DO NOTHING`.
  زمان موعد در کلید است، پس تغییر زمان، اعلان تازه می‌سازد و اعلان زمان قدیم ساخته نمی‌شود چون آن موعد دیگر از منبع نمی‌آید.
  هر تیک موعدهای `due_at` بین «۲۴ ساعت پیش» و «اکنون» را می‌گیرد؛ پس اگر سرور خاموش بوده، پس از برگشتن با `due_at` اصلی ساخته
  می‌شود. هر راه تحویل یک ردیف با `UNIQUE (notification_id, channel)`.
- **Rationale**: FR-010، FR-011 و Edge Cases؛ حذف/لغو منبع یعنی موعدی که دیگر پرسیده نمی‌شود.
- **Alternatives considered**: ستون «اعلان‌شده» روی جدول‌های منبع (تغییر ۵ جدول، با تغییر زمان باید پاک شود).

## R5. منبع‌ها و زمان موعد

| نوع | منبع | گیرنده | موعد |
|-----|------|--------|------|
| `reminder` | `calendar_events` با `event_type = 'reminder'` | `user_id` | `start_date` |
| `event` | `calendar_events` دیگر، `meetings`، موردهای `meetings_v3` | صاحب | ۱۵ دقیقه پیش از شروع (رویداد تمام‌روز: ساعت ۸ همان روز) |
| `task_due` | `personal_planning` باز؛ `delegation_tasks` باز که به کاربر واگذار شده | صاحب / انجام‌دهنده | ساعت ۸:۰۰ روز موعد به وقت کاربر |
| `invitation` | `organization_invitations` در انتظار که ایمیلش با حساب کاربری یکی است | دعوت‌شده | زمان ثبت |
| `delegated` | `delegation_tasks` تازه با `assignee_id` یا ایمیل انجام‌دهنده‌ای که حساب دارد | انجام‌دهنده | زمان ثبت |
| `delegation_status` | تغییر `status` در `delegation_tasks` | `delegator_id` | `updated_at` |
| `message` | `POST /notifications/send` | گیرنده | اکنون |

## R6. راه‌های تحویل

- **Decision**:
  - **داخل برنامه**: همیشه؛ زنگوله `GET /notifications` را هر ۲۰ ثانیه و هنگام focus می‌خواند.
  - **سیستمی با برنامه باز**: وقتی پرسش دوره‌ای اعلان خوانده‌نشده تازه‌ای می‌بیند و اجازه داده شده: در وب
    `registration.showNotification` (Service Worker)، در اپ `@capacitor/local-notifications`.
  - **روی دستگاه با برنامه بسته**: وب با Web Push (کتابخانه `web-push`، کلیدهای `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`)؛ اپ
    اندروید/iOS با FCM HTTP v1 (`FCM_SERVICE_ACCOUNT` JSON؛ توکن OAuth با `jsonwebtoken` امضا می‌شود؛ iOS از راه FCM/APNs).
    برای پرهیز از دو اعلان، دستگاهی که اعلان push را گرفته، همان را با برنامه باز دوباره نشان نمی‌دهد (برچسب `tag` یکسان).
  - **پیامک**: `utils/sms.js` با متن کوتاه (FR-021)؛ شماره از `user_profiles`.
  - **ایمیل**: Resend با قالب کوتاه.
- **Rationale**: پاسخ پرسش ۲ (همه راه‌ها) با کمترین سرویس تازه؛ پیامک و ایمیل از زیرساخت موجود.
- **Alternatives considered**: SSE برای تحویل لحظه‌ای (پروکسی‌ها بافر می‌کنند؛ پرسش ۲۰ ثانیه‌ای برای SC-005 کافی است)؛
  `firebase-admin` (وابستگی سنگین برای یک درخواست HTTP).
- آزمون: endpoint دستگاه Web Push، `FCM_API_BASE`، `SMS_API_URL` و `RESEND_BASE_URL` به سرورهای ساختگی محلی اشاره می‌کنند.

## R7. بازه سکوت و منطقه زمانی

- **Decision**: `notification_settings.tz` (پیش‌فرض `Asia/Tehran`؛ کلاینت `Intl` را یک بار می‌فرستد). اگر `due_at` در بازه
  `[quiet_start, quiet_end)` به وقت کاربر باشد (بازه می‌تواند از نیمه‌شب بگذرد)، تحویل‌های (ب) تا (هـ) `deliver_after` = پایان بازه؛
  اعلان در فهرست برنامه همان موقع هست.
- **Rationale**: FR-013 و Edge Case منطقه زمانی؛ تابع خالص در `schedule.js` آزمودنی است.

## R8. اعلان به کاربر دیگر

- **Decision**: ابزار نوشتن `notify_user { recipient, message, ref? }`؛ `planWriteAction` گیرنده را با نام یا ایمیل فقط بین اعضای
  سازمان‌های مشترک پیدا می‌کند (چند تطبیق → پرسش روشن‌سازی؛ هیچ → خطای قابل فهم) و برای تأیید نشان می‌دهد؛ پس از تأیید،
  کلاینت `POST /notifications/send` را صدا می‌زند و سرور دوباره همه شرط‌ها (هم‌سازمانی، پذیرش، سقف ۲۰ در ساعت) را بررسی می‌کند.
  پیوند فقط برای `organization` مشترک می‌ماند.
- **Rationale**: FR-016 تا FR-020؛ بررسی دوباره در سرور چون کلاینت قابل اعتماد نیست.
- **Alternatives considered**: هر کاربر برنامه با ایمیل (راه مزاحمت؛ کنار گذاشته شد، ببینید Assumptions مشخصات).

## R9. دستگاه‌ها

- **Decision**: `notification_devices` با `endpoint` یکتا؛ ثبت دوباره همان endpoint با کاربر دیگر، دستگاه را به او منتقل می‌کند؛
  خروج از حساب `DELETE /notifications/devices/:id`؛ پاسخ 404/410 سرویس push دستگاه را غیرفعال می‌کند.
- **Rationale**: Edge Cases «حساب دیگر در همان مرورگر» و «دستگاهی که دیگر استفاده نمی‌شود»؛ SC-004.

## R10. «این مورد دیگر نیست»

- **Decision**: `useHighlight` اگر پس از آماده شدن صفحه، مورد `highlight` را پیدا نکند، پیام «این مورد دیگر وجود ندارد» نشان می‌دهد.
- **Rationale**: سناریو ۴ داستان ۱.
