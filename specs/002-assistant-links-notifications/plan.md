# Implementation Plan: پیوند در پاسخ دستیار و اعلان‌ها (Assistant Links & Notifications)

**Branch**: `002-assistant-links-notifications` (کار روی شاخه `claude/vibrant-johnson-3obrre`) | **Date**: 2026-11-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-assistant-links-notifications/spec.md`

## Summary

دو بخش که هر دو کاربر را به خود مورد می‌رسانند:

1. **پیوند در پاسخ دستیار:** سرور هر موردی را که ابزارهای خواندن دستیار برمی‌گردانند با کلید کوتاه (`r1`، `r2`…) و مسیر
   صفحه‌اش (از موتور جستجوی ویژگی ۰۰۱) در فهرست «ارجاع‌ها» نگه می‌دارد؛ مدل نام مورد را به شکل `[عنوان](ref:r1)` می‌نویسد و
   سرور عنوان‌هایی را که بی‌پیوند مانده‌اند خودش پیوند می‌دهد. کلاینت فقط پیوندهای `ref:` موجود در همان پاسخ را به صفحه برنامه
   تبدیل می‌کند و هر پیوند دیگری متن ساده می‌ماند. کارهای تأییدشده دستیار شناسه مورد ساخته‌شده را برمی‌گردانند و کارت تأیید
   «باز کردن» دارد.
2. **اعلان‌ها:** جدول‌های تازه اعلان، تحویل هر راه، تنظیمات و دستگاه در Postgres؛ یک زمان‌بند درون backend (هر ۳۰ ثانیه) از
   منبع‌ها (یادآور، تقویم، جلسه‌ها، کارها، دعوت‌نامه، کارهای واگذارشده) اعلان می‌سازد، با کلید یکتا که هر موعد فقط یک بار
   اعلان شود؛ همان زمان‌بند هر اعلان را از راه‌هایی که کاربر خواسته (اعلان مرورگر با Web Push، گوشی با FCM، پیامک sms.ir،
   ایمیل Resend) با رعایت بازه سکوت می‌فرستد. زنگوله و فهرست از سرور خوانده می‌شوند (هر ۲۰ ثانیه و هنگام برگشت به برنامه)؛
   اعلان سیستمی هنگام باز بودن برنامه از Service Worker موجود. ارسال به کاربر دیگر از مسیر جدا و ابزار نوشتن دستیار با تأیید.

## Technical Context

**Language/Version**: JavaScript (Node 20، ES modules) در backend؛ TypeScript 5 / React 18 در frontend؛ Capacitor 7 برای موبایل

**Primary Dependencies**: Express 4، `pg`، `jsonwebtoken` (امضای توکن FCM)، `resend` و `utils/sms.js` موجود؛ تازه: `web-push`
(رمزگذاری Web Push با VAPID). frontend: `react-markdown` موجود، `public/sw.js` موجود؛ تازه برای موبایل:
`@capacitor/push-notifications` و `@capacitor/local-notifications`

**Storage**: PostgreSQL؛ چهار جدول تازه: `notifications`، `notification_deliveries`، `notification_settings`، `notification_devices`
(بیرون از `/db`؛ فقط از مسیرهای اختصاصی)

**Testing**: `node --test` (محاسبه موعد، بازه سکوت، پیوند ارجاع‌ها، کلید یکتا)؛ vitest (رندر پیوندها، زنگوله، تنظیمات)؛ آزمون
API با سه کاربر روی سرور واقعی با سرویس‌های ساختگی Web Push/FCM/پیامک/ایمیل؛ آزمون مرورگر با Playwright (اجازه اعلان، کلیک
روی پیوند و اعلان)

**Target Platform**: وب (دسکتاپ و موبایل)، اپ Capacitor (اندروید/iOS)، همان سرور Express

**Project Type**: web application (frontend + backend) + اپ موبایل Capacitor

**Performance Goals**: اعلان حداکثر ۶۰ ثانیه پس از موعد (SC-003): تیک زمان‌بند ۳۰ ثانیه + تحویل در همان تیک؛ خواندن در دستگاه دیگر
کمتر از ۳۰ ثانیه (SC-005): پرسش فهرست هر ۲۰ ثانیه و هنگام focus

**Constraints**: هر موعد دقیقاً یک اعلان و از هر راه حداکثر یک تحویل (FR-010) حتی با دو نمونه سرور؛ بدون پیوند بیرونی در پاسخ
دستیار (FR-003)؛ گیرنده اعلان کاربر دیگر فقط عضو سازمان مشترک (FR-016)؛ سقف ۲۰ در ساعت (FR-019)؛ پیامک/ایمیل خاموش به‌طور
پیش‌فرض؛ کلیدهای سرویس‌ها از env

**Scale/Scope**: ۷ نوع اعلان، ۵ راه تحویل، ۴ جدول، ۲ گروه مسیر (`/notifications`، ارجاع‌ها در `/smart-assistant`)، یک ابزار نوشتن
تازه دستیار (`notify_user`)، صفحه تنظیمات اعلان، بازنویسی مرکز اعلان

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| اصل | چه می‌خواهد | این طرح | وضعیت |
|-----|-------------|---------|-------|
| I. فارسی‌محور | متن و تاریخ فارسی/شمسی، ساعت ۲۴ساعته | متن اعلان‌ها فارسی با تاریخ شمسی و ساعت ۲۴ساعته به وقت کاربر؛ پیامک و ایمیل هم | ✅ |
| II. داده روی سرور | نه «فقط در مرورگر» | مرکز اعلان فعلی (`localStorage`) کنار می‌رود؛ اعلان، خوانده‌شدن و تنظیمات روی سرور | ✅ |
| III. فقط داده واقعی | بدون اعلان ساختگی؛ حالت خالی راهنما | فقط از رویدادهای واقعی؛ حالت خالی «هنوز اعلانی ندارید» + توضیح | ✅ |
| IV. هر ردیف صاحب دارد | `requireAuth`؛ ستون هویت از سرور؛ آزمون کاربر دوم | همه مسیرها با `requireAuth`؛ `user_id` و `sender_id` از نشست؛ گیرنده فقط هم‌سازمان؛ جدول‌ها بیرون از `/db` (ببینید Complexity Tracking)؛ آزمون سه کاربره | ✅ |
| V. آزموده روی سرور واقعی | build/test + API و مرورگر | quickstart هر دو را دارد؛ سرویس‌های بیرونی با سرور ساختگی؛ آنچه آزموده نمی‌شود (تحویل واقعی اپل/گوگل/پیامک) صریح گزارش می‌شود | ✅ |
| UX: سه حالت فهرست | بارگذاری/خالی/خطا | فهرست اعلان‌ها (FR-015) | ✅ |
| UX: صفحه‌کلید و صفحه‌خوان | | پیوندها `<a>` واقعی با نام قابل اعلام؛ زنگوله با تعداد خوانده‌نشده در `aria-label` | ✅ |

**بازبینی پس از طراحی (Phase 1)**: قرارداد `/notifications` هویت را فقط از توکن می‌خواند؛ `POST /notifications/send` گیرنده را با
شرط هم‌سازمانی و پذیرش «اعلان از دیگران» و سقف ساعتی بررسی می‌کند و `sender_id` را خود سرور می‌گذارد؛ پیوند اعلان به دیگری
فقط برای سازمان مشترک می‌ماند. ثبت دستگاه برای endpoint تکراری، دستگاه را به کاربر تازه منتقل می‌کند (حساب قبلی در همان
مرورگر چیزی نمی‌گیرد). همه اصول برقرارند.

## Project Structure

### Documentation (this feature)

```text
specs/002-assistant-links-notifications/
├── spec.md
├── plan.md              # این فایل
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── notifications-api.md     # /notifications
│   └── assistant-references.md  # ارجاع‌ها در پاسخ /smart-assistant و ابزار notify_user
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── notifications/
│   │   ├── schedule.js      # محاسبه موعد هر نوع، بازه سکوت، منطقه زمانی (تابع‌های خالص)
│   │   ├── producers.js     # ساختن اعلان از منبع‌ها با کلید یکتا
│   │   ├── delivery.js      # تحویل به راه‌ها: webpush، fcm، sms، email؛ ثبت نتیجه
│   │   ├── worker.js        # تیک ۳۰ ثانیه: produce → deliver → پاک‌سازی ۹۰ روزه (با قفل advisory)
│   │   └── settings.js      # پیش‌فرض‌ها و ادغام تنظیمات
│   ├── agent/references.js  # جمع‌آوری ارجاع‌ها از خروجی ابزارها و پیوند دادن عنوان‌ها
│   ├── agent/tools.js       # کلید ارجاع در خروجی ابزارها؛ ابزار notify_user؛ page در feedback
│   ├── routes/notifications.js
│   ├── routes/smart-assistant.js  # references در پاسخ
│   ├── utils/sms.js         # SMS_API_URL قابل تنظیم (برای آزمون)
│   ├── db/schema.sql        # چهار جدول
│   └── index.js             # mount /notifications، شروع worker
└── test/notifications.test.js, test/references.test.js

frontend/src/
├── services/notificationsService.ts           # فراخوانی /notifications
├── hooks/useNotifications.ts                   # پرسش دوره‌ای، شمارنده، اعلان سیستمی برای تازه‌ها
├── lib/push.ts                                 # ثبت دستگاه: Web Push (sw.js) یا Capacitor
├── components/ui/notification-center.tsx       # بازنویسی روی سرور
├── components/assistant/SmartAssistant.tsx     # پیوند ref:، «باز کردن» در کارت تأیید
├── services/actionExecutorService.ts           # برگرداندن شناسه مورد ساخته‌شده
├── pages/NotificationSettingsPage.tsx          # راه‌ها برای هر نوع، بازه سکوت، اعلان از دیگران
├── hooks/useHighlight.ts                       # «این مورد دیگر نیست»
└── public/sw.js                                # push و notificationclick با مسیر مورد
```

**Structure Decision**: web application موجود؛ منطق اعلان در پوشه تازه `backend/src/notifications/` با تابع‌های خالص جدا از
I/O تا بدون پایگاه داده آزموده شوند؛ ارجاع‌های دستیار در `agent/references.js` و از موتور جستجوی ۰۰۱ برای مسیرها استفاده می‌کند.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| جدول‌های اعلان در `BACKEND_TABLES` (`/db`) ثبت نمی‌شوند (قید فنی قانون اساسی) | ساختن اعلان، فرستنده و وضعیت تحویل را فقط سرور باید بنویسد؛ از `/db` کاربر می‌توانست اعلان یا تحویل جعلی بسازد | ثبت در `/db` با `readOnly` هم خواندن تنظیمات و دستگاه‌ها را باز می‌گذاشت و منطق ادغام تنظیمات را به کلاینت می‌برد؛ همان راهی که `user_files` و `org-members` رفته‌اند |
| وابستگی تازه `web-push` | رمزگذاری aes128gcm و امضای VAPID استاندارد Web Push است | پیاده‌سازی دستی رمزگذاری پرخطر است؛ بدون Web Push، اعلان با مرورگر بسته نمی‌رسد (پاسخ پرسش ۲) |
