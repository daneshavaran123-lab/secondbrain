# Implementation Plan: جستجوی یکپارچه در همه داده‌های من (Unified Search)

**Branch**: `001-unified-search` (کار روی شاخه `claude/vibrant-johnson-3obrre`) | **Date**: 2026-10-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-unified-search/spec.md`

## Summary

کادر Ctrl+K امروز فقط صفحه‌ها را پیدا می‌کند و ابزار `search_brain` دستیار فقط ۸ جدول را می‌گردد. یک
موتور جستجوی مشترک در backend (`backend/src/search/`) ساخته می‌شود که هم جدول‌های Postgres و هم فهرست‌های
شخصی ذخیره‌شده در `user_collections` را با یکسان‌سازی نوشتار فارسی، شرط «همه کلمه‌ها» و رتبه‌بندی «عنوان، بعد
تازه‌تر» می‌گردد و برای هر نتیجه مسیر صفحه مقصد را می‌سازد. مسیر `GET /search` (با `requireAuth`) آن را به
کادر Ctrl+K می‌دهد و `search_brain` همان موتور را به کار می‌گیرد. صفحه‌های اصلی با پارامتر `?highlight=<id>`
همان مورد را نمایان می‌کنند.

## Technical Context

**Language/Version**: JavaScript (Node 20، ES modules) در backend؛ TypeScript 5 / React 18 در frontend

**Primary Dependencies**: Express 4، `pg`؛ Vite 5، `cmdk` (کادر فرمان موجود)، react-router 6، Tailwind/shadcn

**Storage**: PostgreSQL 16؛ جدول‌های موجود + `user_collections` (سند JSON برای هر نفر و فهرست). جدول یا
ستون تازه لازم نیست.

**Testing**: `node --test` در backend (یکسان‌سازی و سازنده پرسش)؛ vitest + Testing Library در frontend
(کادر فرمان)؛ آزمون API با دو کاربر روی سرور واقعی (`agent-test/search-api.mjs`)؛ آزمون مرورگر با Playwright

**Target Platform**: وب (دسکتاپ و موبایل ۳۹۰px)، همان سرور Express

**Project Type**: web application (frontend + backend)

**Performance Goals**: پاسخ `/search` برای حسابی با ۵٬۰۰۰ مورد کمتر از ۳۰۰ms روی سرور (تا SC-002 یعنی کمتر از
۱ ثانیه از مکث تا نمایش، با ۲۵۰ms تأخیر تایپ، برقرار بماند)

**Constraints**: فقط داده خود کاربر (FR-008)؛ بدون سرویس بیرونی؛ پرسش‌ها پارامتری (بدون درج متن کاربر در SQL)؛
پاسخ قدیمی‌تر روی تازه‌تر ننشیند

**Scale/Scope**: ۲۴ نوع داده از ۲۶ منبع (۱۸ منبع جدولی روی ۱۷ جدول + ۸ فهرست JSON؛ پرونده حقوقی و شکرگزاری هم
جدول دارند هم فهرست)، یک مسیر API، یک کامپوننت، دو hook، ۶ صفحه با نمایان‌سازی مورد

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| اصل | چه می‌خواهد | این طرح | وضعیت |
|-----|-------------|---------|-------|
| I. فارسی‌محور | یکسان‌سازی ی/ي، ک/ك، نیم‌فاصله، ارقام؛ رابط فارسی؛ تاریخ شمسی | `normalize.js` در JS و همتای SQL با `translate()`؛ برچسب نوع‌ها فارسی؛ تاریخ ISO از سرور، نمایش شمسی در کلاینت | ✅ |
| II. داده روی سرور | جستجو باید داده سرور را ببیند، نه کش مرورگر | همه منابع از Postgres خوانده می‌شوند، از جمله فهرست‌های `user_collections` | ✅ |
| III. فقط داده واقعی | بدون نتیجه ساختگی؛ حالت خالی راهنما | فقط ردیف‌های واقعی؛ «چیزی پیدا نشد» + «از دستیار بپرس» | ✅ |
| IV. هر ردیف صاحب دارد | `requireAuth`؛ محدوده مالکیت؛ آزمون کاربر دوم | `/search` با `requireAuth`؛ هر منبع ستون مالک صریح دارد یا از راه والد (شرکت) محدود می‌شود؛ آزمون دو کاربره | ✅ |
| V. آزموده روی سرور واقعی | tsc/eslint/vitest/npm test/build + API و مرورگر | quickstart هر دو را دارد؛ گزارش با عدد | ✅ |
| UX: هر فهرست سه حالت دارد | بارگذاری/خالی/بی‌نتیجه | کادر: «در حال جستجو…»، «چیزی پیدا نشد»، «در دسترس نیست» | ✅ |
| UX: صفحه‌کلید و صفحه‌خوان | پیمایش، اعلام تعداد | cmdk پیمایش را دارد؛ ناحیه `aria-live` تعداد را اعلام می‌کند | ✅ |

بدون انحراف؛ Complexity Tracking خالی است.

**بازبینی پس از طراحی (Phase 1)**: قرارداد API فقط `q`، `type`، `limit` می‌گیرد و هویت را از توکن می‌خواند
(نه از پارامتر)، پس راهی برای پرسیدن داده دیگری نیست. منبع‌های `via` (مخاطبین شرکت) با `EXISTS` روی جدول
والد محدود می‌شوند. همه اصول برقرارند.

## Project Structure

### Documentation (this feature)

```text
specs/001-unified-search/
├── spec.md
├── plan.md              # این فایل
├── research.md          # Phase 0
├── data-model.md        # Phase 1: منبع‌ها و نتیجه
├── quickstart.md        # Phase 1: سناریوهای راستی‌آزمایی
├── contracts/
│   └── search-api.md    # Phase 1: GET /search
├── checklists/
│   ├── requirements.md
│   └── search-ux.md     # /speckit-checklist
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── search/
│   │   ├── normalize.js     # یکسان‌سازی فارسی (JS + عبارت SQL)، کلیدواژه‌ها، تکه متن
│   │   ├── sources.js       # فهرست منبع‌ها: جدول/فهرست، مالک، عنوان، متن، تاریخ، مسیر
│   │   └── engine.js        # searchAll(userId, query, { type, limit, match })
│   ├── routes/search.js     # GET /search (requireAuth)
│   ├── agent/tools.js       # search_brain → engine
│   └── index.js             # mount /search
└── test/search.test.js

frontend/src/
├── services/searchService.ts                 # فراخوانی /search
├── hooks/useRecordSearch.ts                  # تأخیر تایپ، لغو پاسخ کهنه، حالت‌ها
├── hooks/useHighlight.ts                     # ?highlight=<id> → اسکرول و برجسته
├── lib/persianText.ts                        # همان یکسان‌سازی سرور برای پیدا کردن صفحه‌ها در کادر
├── components/command/CommandPalette.tsx     # گروه‌های نتیجه، «بیشتر»، حالت‌ها، aria-live
├── pages/… (Needs, Partners, Projects, Roadmap, TasksPage, PersonalContactsPage)  # data-search-id
└── test/__tests__/{components/CommandPalette,pages/KhadimLists}.test.tsx
```

**Structure Decision**: web application موجود (`backend/` + `frontend/`)؛ موتور در یک پوشه تازه در backend تا
مسیر API و دستیار هر دو از یک جا استفاده کنند.

دو افزوده که در اجرا لازم شد:
- فیلتر خود cmdk در کادر خاموش است (`shouldFilter={false}`)، چون نتایج سرور را که با نوشتار یکسان‌شده پیدا شده‌اند
  پنهان یا جابه‌جا می‌کرد؛ صفحه‌ها و میان‌برها با `lib/persianText.ts` (همان نگاشت `backend/src/search/normalize.js`)
  پیدا می‌شوند، پس «بخشنامهها» یا «كار» هم صفحه را پیدا می‌کند.
- باز کردن صفحه‌های نیاز، شریک و برنامه از نتیجه جستجو نشان داد موردهای قدیمی (فقط `id` و `title`) آن صفحه‌ها را از
  کار می‌اندازد؛ تابع‌های یکسان‌سازی فهرست در همان صفحه‌ها فیلدهای نبوده را پر می‌کنند و آزمون `KhadimLists` جلوی برگشتنش را می‌گیرد.

## Complexity Tracking

بدون انحراف از قانون اساسی.
