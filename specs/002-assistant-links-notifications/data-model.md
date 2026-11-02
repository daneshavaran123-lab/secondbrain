# Data Model: پیوند در پاسخ دستیار و اعلان‌ها

چهار جدول تازه در `backend/src/db/schema.sql` (idempotent، `CREATE TABLE IF NOT EXISTS`). هیچ‌کدام در `/db` نیستند؛ فقط از
`/notifications` و زمان‌بند نوشته/خوانده می‌شوند.

## notifications

| ستون | نوع | قاعده |
|------|-----|-------|
| `id` | uuid PK | |
| `user_id` | uuid → users, NOT NULL | گیرنده؛ همیشه سرور می‌گذارد |
| `type` | text NOT NULL | یکی از `reminder`، `event`، `task_due`، `invitation`، `delegated`، `delegation_status`، `message` |
| `title` | text NOT NULL | حداکثر ۱۲۰ نویسه |
| `body` | text | حداکثر ۵۰۰ نویسه |
| `sender_id` | uuid → users, NULL | فقط برای `message`؛ از نشست فرستنده |
| `ref_type`, `ref_id` | text, NULL | مورد مرتبط (نوع‌های جستجوی ۰۰۱) |
| `path` | text, NULL | مسیر صفحه درون برنامه؛ باید با `/` شروع شود و `//` یا `:` نداشته باشد |
| `due_at` | timestamptz NOT NULL | زمان موعد اصلی (برای نمایش) |
| `created_at` | timestamptz default now() | زمان ساخته شدن |
| `read_at` | timestamptz NULL | خوانده‌شده |
| `dedupe_key` | text NOT NULL | ببینید research R4 |

- `UNIQUE (user_id, dedupe_key)`؛ ایندکس `(user_id, created_at DESC)` و `(user_id) WHERE read_at IS NULL`.
- حذف کاربر → حذف اعلان‌ها (`ON DELETE CASCADE`). پاک‌سازی: `created_at < now() - 90 days`.

## notification_deliveries

| ستون | نوع | قاعده |
|------|-----|-------|
| `id` | uuid PK | |
| `notification_id` | uuid → notifications ON DELETE CASCADE | |
| `channel` | text | `push`، `sms`، `email` (داخل برنامه و سیستمیِ برنامه باز ردیف ندارند) |
| `deliver_after` | timestamptz | `due_at` یا پایان بازه سکوت |
| `status` | text | `pending` → `sent` \| `failed` \| `skipped` |
| `attempts` | int default 0 | حداکثر ۳ تلاش؛ سپس `failed` |
| `sent_at` | timestamptz NULL | |
| `error` | text NULL | آخرین خطا (برای نمایش یک‌باره در تنظیمات) |

- `UNIQUE (notification_id, channel)` (هر راه حداکثر یک بار — FR-010).
- `skipped` وقتی راه خاموش است، شماره/دستگاه ندارد یا کاربر اعلان سیستمی را رد کرده.

## notification_settings

| ستون | نوع | پیش‌فرض |
|------|-----|---------|
| `user_id` | uuid PK → users | |
| `channels` | jsonb | برای هر نوع `{ "push": true, "sms": false, "email": false }`؛ نوعِ خاموش = `{ "off": true }` |
| `quiet_start`, `quiet_end` | time NULL | بدون بازه سکوت |
| `accept_from_others` | boolean | `true` |
| `tz` | text | `Asia/Tehran` |
| `permission_explained` | boolean | `false` (FR-014: یک بار) |
| `updated_at` | timestamptz | |

- اگر ردیفی نیست، پیش‌فرض‌ها اعمال می‌شوند (`settings.js`). روشن کردن `sms` بدون شماره در پروفایل → ۴۲۲ با پیام فارسی (سناریو ۴ داستان ۳).

## notification_devices

| ستون | نوع | قاعده |
|------|-----|-------|
| `id` | uuid PK | |
| `user_id` | uuid → users | از نشست |
| `kind` | text | `webpush` \| `fcm` |
| `endpoint` | text UNIQUE | endpoint Web Push یا توکن FCM |
| `p256dh`, `auth` | text NULL | فقط `webpush` |
| `label` | text NULL | مثل «Chrome روی ویندوز» |
| `created_at`, `last_ok_at`, `disabled_at` | timestamptz | |

- ثبت همان `endpoint` با کاربر دیگر → `user_id` عوض و `disabled_at` پاک می‌شود (R9). پاسخ 404/410 از سرویس → `disabled_at = now()`.

## ارجاع در پاسخ دستیار (در حافظه یک نوبت، ذخیره نمی‌شود)

| فیلد | نوع | توضیح |
|------|-----|-------|
| `key` | string | `r1`، `r2`… یکتا در همان پاسخ |
| `type` | string | نوع منبع جستجو (۰۰۱) |
| `id` | string | شناسه مورد |
| `title` | string | عنوان نمایش |
| `path` | string \| null | مسیر صفحه؛ `null` = بدون پیوند |

## انتقال وضعیت‌ها

```text
notification:  (ساخته) unread ──خواندن──▶ read ──حذف──▶ (پاک)
delivery:      pending ──ارسال موفق──▶ sent
               pending ──خطا (<۳)──▶ pending (attempts+1)
               pending ──خطا (۳)──▶ failed
               pending ──راه خاموش/بی‌دستگاه──▶ skipped
```
