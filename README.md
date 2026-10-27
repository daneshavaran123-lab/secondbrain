# مغز دوم من (My Second Brain)

> مغز دوم دیجیتال و دستیار هوشمند اجرایی — فارسی، امن و آفلاین‌پذیر.

[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg)](https://conventionalcommits.org)
[![PWA](https://img.shields.io/badge/PWA-ready-brightgreen)](https://web.dev/progressive-web-apps/)
[![RTL](https://img.shields.io/badge/RTL-first-blue)](#)

وب‌سایت: **https://www.aimora.app**

---

## فهرست

1. [درباره مغز دوم من](#۱-درباره-مغز-دوم-من)
2. [معماری پروژه](#۲-معماری-پروژه)
3. [راه‌اندازی سریع](#۳-راهاندازی-سریع)
4. [User Flow کامل](#۴-user-flow-کامل)
5. [نقشه صفحات و مسیرها](#۵-نقشه-صفحات-و-مسیرها)
6. [دستیار هوشمند](#۶-دستیار-هوشمند)
7. [حالت آفلاین و PWA](#۷-حالت-آفلاین-و-pwa)
8. [امنیت و دسترسی](#۸-امنیت-و-دسترسی)
9. [طراحی و ریسپانسیو بودن](#۹-طراحی-و-ریسپانسیو-بودن)
10. [Edge Functions](#۱۰-edge-functions)
11. [راهنمای توسعه](#۱۱-راهنمای-توسعه)
12. [عیب‌یابی](#۱۲-عیبیابی)

---

## ۱. درباره مغز دوم من

«مغز دوم من» (نام قبلی: مورا) یک پلتفرم یکپارچه برای مدیران و متخصصان است که چهار حوزه‌ی زندگی کاری و شخصی را در یک محیط واحد جمع می‌کند:

| حوزه | چه کاری انجام می‌دهد |
|------|----------------------|
| **شخصی** | ژورنال، شکرگزاری، عادت‌ها، سلامت، برنامه‌ریزی شخصی، مخاطبین |
| **حرفه‌ای** | تقویم، جلسات، وظایف، پروژه‌ها، دانش، ایده‌ها، رزومه، ایمیل کاری |
| **سازمانی** | شرکت‌ها، منابع انسانی، استراتژی، جانشین‌پروری، ریسک، صورت‌جلسه |
| **هوش مصنوعی** | دستیار صوتی/متنی، تحلیل ایده، آمادگی جلسه، گزارش‌های هوشمند |

نکته کلیدی: **همه‌چیز فارسی است.** رابط کاربری RTL، تقویم شمسی، و دستیار هوش مصنوعی که همیشه فارسی پاسخ می‌دهد.

---

## ۲. معماری پروژه

### ۲.۱ نمودار معماری

```mermaid
graph TB
  subgraph Client["کلاینت — PWA"]
    UI["React 18 + Vite + Tailwind"]
    SW["Service Worker + IndexedDB v3"]
    ASSIST["دستیار (صوت/متن)"]
  end

  subgraph Supabase["Supabase"]
    AUTH["Auth / JWT"]
    DB[("Postgres + RLS")]
    STORE["Storage: userId/*"]
    EF["Edge Functions (Deno)"]
  end

  subgraph AI["Liara AI — سازگار با OpenAI"]
    CHAT["chat/completions"]
  end

  UI --> AUTH
  UI --> DB
  UI --> STORE
  ASSIST --> EF
  UI --> EF
  EF --> CHAT
  EF --> DB
  SW -. "صف همگام‌سازی" .-> DB
```

### ۲.۲ ساختار پوشه‌ها

```text
repo/
├── frontend/            ← اپلیکیشن اصلی (Vite + React 18 + TS + Tailwind)
│   ├── src/
│   │   ├── pages/       ← صفحات مسیریابی‌شده
│   │   ├── components/  ← کامپوننت‌ها (ui/, assistant/, organization/, ...)
│   │   ├── services/    ← لایه دسترسی به داده و منطق کسب‌وکار
│   │   ├── hooks/       ← هوک‌های ری‌اکت (use-mobile, useOffline, useWakeWord)
│   │   ├── integrations/supabase/  ← کلاینت و تایپ‌های دیتابیس
│   │   └── index.css    ← توکن‌های طراحی + قواعد ریسپانسیو سراسری
│   └── public/          ← manifest.json, sw.js, robots.txt, sitemap.xml, fonts
├── supabase/
│   ├── functions/       ← Edge Functions (Deno)
│   └── migrations/      ← مهاجرت‌های SQL + RLS
└── package.json         ← اسکریپت‌های ریشه که به frontend واگذار می‌شوند
```

**استک:** React 18 · Vite 5 · TypeScript 5 · Tailwind CSS 3 · shadcn/ui · TanStack Query · Recharts · Supabase (DB/Auth/Storage/Edge Functions) · Liara AI (سازگار با OpenAI).

> خروجی build در پوشه‌ی `dist/` ریشه ساخته می‌شود (`npm run build`).

---

## ۳. راه‌اندازی سریع

```bash
npm install               # نصب وابستگی‌ها
npm run dev               # اجرای محیط توسعه
npm run build             # ساخت نسخه production در dist/
npm run lint              # بررسی کیفیت کد
```

متغیرهای محیطی مورد نیاز (در `frontend/.env`):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

کلیدهای حساس (OpenAI، Resend، Telegram، …) هرگز در فرانت‌اند قرار نمی‌گیرند؛ فقط به‌صورت Secret در Edge Functions.

---

## ۴. User Flow کامل

### ۴.۱ نمای کلی سفر کاربر

```mermaid
flowchart TD
  A["ورود به سایت /"] --> B{"نشست معتبر؟"}
  B -- خیر --> C["/auth"]
  C --> C1["ورود با ایمیل و رمز"]
  C --> C2["ثبت‌نام"]
  C --> C3["ورود کاربر فرعی"]
  C --> C4["بازیابی رمز"]
  C1 --> D
  C2 --> D
  C3 --> D
  B -- بله --> D["داشبورد اصلی"]
  D --> E["Header + DomainSidebar + محتوا"]
  E --> F1["حوزه شخصی"]
  E --> F2["حوزه حرفه‌ای"]
  E --> F3["حوزه سازمانی"]
  E --> F4["حوزه هوش مصنوعی"]
  E --> G["دستیار — هی دستیار یا دکمه شناور"]
  G --> H["/assistant-reports — گزارش و خروجی PDF/Excel"]
```

### ۴.۲ فلو احراز هویت

1. کاربر وارد `/` می‌شود؛ `Index` نشست Supabase را بررسی می‌کند.
2. اگر نشستی نبود → ریدایرکت به `/auth`.
3. در `/auth` سه تب وجود دارد: **ورود**، **ثبت‌نام**، **کاربر فرعی**.
4. پس از موفقیت، `onAuthStateChange` وضعیت را به‌روز و کاربر را به داشبورد می‌برد.
5. خروج از حساب از منوی Header انجام می‌شود و نشست و کش محلی پاک می‌شود.

> کاربران فرعی (Sub-user) رمزشان با bcrypt هش می‌شود و ورودشان از طریق Edge Function `sub-user-login` انجام می‌گیرد.

```mermaid
sequenceDiagram
  autonumber
  actor U as کاربر
  participant W as اپ (React)
  participant S as Supabase Auth
  participant F as Edge Function sub-user-login
  participant D as Postgres

  U->>W: باز کردن /auth
  alt کاربر اصلی
    U->>W: ایمیل و رمز
    W->>S: signInWithPassword
    S-->>W: نشست + JWT
  else کاربر فرعی
    U->>W: نام کاربری فرعی و رمز
    W->>F: درخواست ورود
    F->>D: بررسی هش bcrypt
    D-->>F: تأیید
    F-->>W: توکن با claims (iss, aud, jti)
  end
  W->>W: onAuthStateChange و ریدایرکت به داشبورد
```

### ۴.۳ فلو کار روزانه (سناریوی نمونه)

| گام | کاربر چه می‌کند | سیستم چه می‌کند |
|-----|------------------|------------------|
| ۱ | صبح وارد داشبورد می‌شود | خلاصه‌ی امروز: وظایف سررسید، جلسات، عادت‌ها |
| ۲ | می‌گوید «هی دستیار» | پنل دستیار باز و میکروفن فعال می‌شود |
| ۳ | «فردا ساعت ۱۰ جلسه با تیم مالی» | دستیار قصد را استخراج و تداخل زمانی را بررسی می‌کند |
| ۴ | تأیید می‌کند | رویداد در تقویم ثبت و در گزارش‌ها لاگ می‌شود |
| ۵ | وارد `/meetings/preparation` می‌شود | تحلیل آمادگی جلسه با هوش مصنوعی تولید می‌شود |
| ۶ | در `/assistant-reports` گزارش می‌گیرد | نمودار فعالیت + خروجی PDF/Excel |

### ۴.۴ فلو جلوگیری از تداخل و تکرار

```mermaid
flowchart LR
  A["درخواست ثبت رویداد"] --> B{"تداخل زمانی؟"}
  B -- بله --> C["خطای TIME_CONFLICT + پیشنهاد ساعت جایگزین"]
  B -- خیر --> D{"رکورد مشابه در ۵ دقیقه اخیر؟"}
  D -- بله --> E["پیام: قبلاً ثبت شده است"]
  D -- خیر --> F["ثبت در دیتابیس"]
  F --> G["لاگ در assistant_action_logs"]
```

### ۴.۵ فلو آفلاین

```mermaid
flowchart TD
  A["قطع اینترنت"] --> B["نمایش OfflineBanner"]
  B --> C["خواندن داده از IndexedDB v3"]
  B --> D["نوشتن‌ها در صف syncService"]
  E["اتصال دوباره"] --> F["ارسال ترتیبی صف"]
  F --> G{"موفق؟"}
  G -- بله --> H["به‌روزرسانی OfflineIndicator"]
  G -- خیر --> I["تلاش مجدد با backoff"]
```

### ۴.۶ مدل داده‌ای اصلی

```mermaid
erDiagram
  USER_PROFILES ||--o{ TASKS : "دارد"
  USER_PROFILES ||--o{ CALENDAR_EVENTS : "دارد"
  USER_PROFILES ||--o{ HEALTH_METRICS : "ثبت می‌کند"
  USER_PROFILES ||--o{ KNOWLEDGE_BASE : "می‌سازد"
  USER_PROFILES ||--o{ USER_ROLES : "نقش دارد"
  USER_PROFILES ||--o{ SUB_USERS : "مدیریت می‌کند"
  USER_PROFILES ||--o{ ASSISTANT_ACTION_LOGS : "تولید می‌کند"
  COMPANIES ||--o{ COMPANY_CONTACTS : "دارد"
  COMPANIES ||--o{ COMPANY_CALLS : "دارد"
  COMPANIES ||--o{ ORGANIZATION_EMPLOYEES : "دارد"
  CALENDAR_EVENTS ||--o{ MEETING_MINUTES : "منجر می‌شود"
```

---

## ۵. نقشه صفحات و مسیرها

### عمومی
| مسیر | توضیح |
|------|-------|
| `/auth` | ورود / ثبت‌نام / کاربر فرعی |
| `/auth/signup` | ثبت‌نام مستقیم |
| `/accept-invitation/:token` | پذیرش دعوت‌نامه سازمان |

### شخصی
`/personal-dashboard` · `/personal-journal` · `/gratitude-journal` · `/habits` · `/health` · `/personal-planning` · `/contacts` · `/gadgets`

### حرفه‌ای
`/calendar` · `/meetings` · `/meetings/preparation` · `/tasks` · `/projects` · `/knowledge` · `/ideas` · `/legal` · `/resume` · `/business-email` · `/delegation` · `/professional-planning` · `/documentation`

### سازمانی
`/companies` · `/my-organizations` · `/organizations/new` · `/organizations/:id` (dashboard, settings, members) · `/organizational-planning` · `/organizational-letters` · `/social-responsibility` · `/csr-project/:id`

فضاهای سازمانی اختصاصی: `khadim-e-khalgh` · `varid` · `chamber` · `frangaran` — هرکدام با ماژول‌های سیاست/مأموریت، داشبورد، جانشین‌پروری، پیگیری مطالبات، صورت‌جلسه و ارزیابی ریسک.

### هوش مصنوعی و ابزارها
`/ai-chat` · `/ai-chat/analytics` · `/assistant-reports` · `/trends` · `/cultural-content` · `/social-media` · `/plaud` · `/hi-dock` · `/secretary-portal`

### مدیریتی
`/profile` · `/admin` · `/admin/users` · `/admin/sub-users` · `/admin/audit-logs` · `/debug/cleanup`

> فقط `/` و `/auth` در `sitemap.xml` ایندکس می‌شوند؛ بقیه پشت احراز هویت‌اند و در `robots.txt` مسیرهای `admin`، `debug` و `accept-invitation` مسدود شده‌اند.

---

## ۶. دستیار هوشمند

**روش‌های فراخوانی:** کارت «از مغز دومت بپرس» در صفحه خانه · دکمه شناور (دسکتاپ) یا دکمه وسط نوار پایین (موبایل) · جستجوی هدر · کلمه بیدارباش «هی دستیار». هر جای برنامه می‌تواند با `askAssistant(text)` از `src/lib/assistant.ts` دستیار را باز کند.

**مغز دستیار** در بک‌اند Node است (`backend/src/routes/smart-assistant.js` و پوشه `backend/src/agent/`) و به‌صورت یک ایجنت چندمرحله‌ای کار می‌کند:

- **حلقه ایجنت (تا ۶ گام):** مدل ابتدا با ابزارهای خواندنی داده‌های خود کاربر را بررسی می‌کند و نتیجه را می‌بیند، بعد تصمیم می‌گیرد و جواب می‌دهد.
- **ابزارهای خواندنی (روی سرور):** `search_calendar`، `get_pending_tasks`، `search_brain` (یادداشت‌ها، دل‌نوشته‌ها، صورتجلسه‌ها، ایده‌ها، شکرگزاری، محتوای فرهنگی، پرونده‌های حقوقی؛ حساس‌نبودن به ی/ي، ک/ك و نیم‌فاصله)، `search_contacts`، `get_habits_status`، `get_health_summary`. همه کوئری‌ها پارامتری و محدود به کاربر احرازشده‌اند.
- **حافظه بلندمدت:** ابزارهای `remember`/`forget` روی جدول `assistant_memories`؛ حافظه در هر درخواست به پرامپت اضافه می‌شود.
- **زمینه هر درخواست:** جدول تاریخ شمسی↔میلادی ۱۴ روز آینده، رویدادهای سه روز پیش رو، شمار کارهای باز و عقب‌افتاده، عادت‌های امروز و حافظه.
- **ابزارهای نوشتنی** (قرار، وظیفه، ایده، دل‌نوشته، دانش، مخاطب، سلامت، …) روی سرور نرمال می‌شوند (تاریخ شمسی/نسبی و اعداد فارسی ← `YYYY-MM-DD` و `HH:MM`)، تداخل و تکرار قرار پیش از ثبت بررسی می‌شود، و سپس اپ آن‌ها را با `actionExecutorService` اجرا می‌کند. لغو/ویرایش قرار، پیامک و ورود دسته‌ای مخاطب منتظر تأیید کاربر می‌مانند.
- **پاسخ:** `{ message, actions, questions, steps, model }` — `steps` نشان می‌دهد دستیار چه چیزهایی را بررسی کرده است.

| متغیر محیطی بک‌اند | توضیح |
|--------------------|-------|
| `OPENROUTER_API_KEY` | کلید سرویس مدل (یا `LOVABLE_API_KEY`) |
| `ASSISTANT_MODELS` | اختیاری؛ فهرست مدل‌ها با کاما، به ترتیب اولویت |
| `ASSISTANT_API_BASE` | اختیاری؛ آدرس سرویس سازگار با OpenAI (پیش‌فرض OpenRouter) |

> **ترتیب انتشار:** اول فرانت‌اند و بعد بک‌اند را منتشر کنید. نسخه قدیمی فرانت‌اند تاریخ‌های `YYYY-MM-DD` را نمی‌فهمد و قرارها را در روز اشتباه ثبت می‌کند.

> جدول `assistant_memories` و ستون‌های `venue_address`، `domain`، `color` و `reminders` در `calendar_events` هنگام اولین درخواست به دستیار ساخته می‌شوند (علاوه بر `schema.sql`).

### ۶.۱ نامه‌ها و بخشنامه‌های سازمانی (`/organizational-letters`)

- **بارگذاری:** عکس (از گالری یا دوربین گوشی) یا PDF نامه/بخشنامه.
- **خواندن متن (OCR) در مرورگر:** PDF با لایه متنی سالم مستقیم خوانده می‌شود؛ PDF اسکن‌شده یا PDFهایی که متن فارسی‌شان به‌هم‌ریخته ذخیره شده، صفحه‌به‌صفحه با Tesseract (فارسی+انگلیسی) خوانده می‌شوند. کاربر پیش از ذخیره متن را بررسی و اصلاح می‌کند.
- **تحلیل با هوش مصنوعی (بک‌اند):** موضوع، فرستنده، گیرنده، شماره، تاریخ، مهلت (تبدیل به تاریخ میلادی)، فوریت، خلاصه، نکات، اقدامات لازم و متن اصلاح‌شده؛ همزمان پیش‌نویس **جوابیه** رسمی (برای بخشنامه: اعلام وصول و گزارش اقدام).
- **پیشنهاد جدید** با لحن‌های آماده (موافقت، رد مؤدبانه، درخواست مهلت، درخواست اطلاعات، اعلام وصول) و توضیح دلخواه؛ کپی و دانلود Word.
- اقدامات لازم با یک کلیک به کارها اضافه می‌شوند؛ دستیار هم نامه‌ها را جستجو می‌کند و نامه‌های در انتظار پاسخ را می‌شناسد.
- داده در جدول `organizational_letters` (با فایل اصلی، حداکثر ۷ مگابایت) و API در `backend/src/routes/org-letters.js`.

> فایل‌های OCR به‌طور پیش‌فرض از jsDelivr دریافت می‌شوند. اگر در دسترس نبود، `worker.min.js` و `tesseract-core*.wasm*` (از `node_modules/tesseract.js` و `tesseract.js-core`) و `fas.traineddata.gz` و `eng.traineddata.gz` (از پکیج‌های `@tesseract.js-data/fas` و `eng`، پوشه `4.0.0_best_int`) را در یک مسیر عمومی مثل `public/ocr` بگذارید و `VITE_OCR_ASSETS_URL=/ocr` را تنظیم کنید.

**گزارش‌گیری** در `/assistant-reports`: فیلتر روزانه/هفتگی/ماهانه/بازه دلخواه، نمودار Recharts، خروجی PDF و Excel.

---

## ۷. حالت آفلاین و PWA

- `public/manifest.json` با `id` و `start_url` مطلق روی دامنه، آیکون‌ها و `display: standalone`.
- Service Worker در `public/sw.js`؛ کش نسخه‌دار و **عدم کش‌کردن `/assets/`** تا فایل‌های هش‌دار همیشه از شبکه بیایند.
- IndexedDB نسخه ۳ برای داده‌ی آفلاین و `syncService.ts` برای صف همگام‌سازی.
- نصب روی موبایل: «افزودن به صفحه اصلی» در مرورگر.

> اگر پس از انتشار نسخه‌ی قدیمی کش شده دیدید: `Ctrl/Cmd + Shift + R` یا Unregister کردن Service Worker در DevTools.

---

## ۸. امنیت و دسترسی

- **RLS** روی همه‌ی جدول‌های کاربری؛ کوئری‌ها همیشه با `user_id`/`author_id` محدود می‌شوند.
- **نقش‌ها** در جدول جداگانه‌ی `user_roles` با تابع `has_role` (SECURITY DEFINER) — هرگز روی پروفایل ذخیره نمی‌شوند.
- **Storage**: مسیر هر فایل باید با `${userId}/` شروع شود تا از سیاست‌ها عبور کند.
- ستون‌های حساس (`password_hash`, توکن‌های OAuth) از دسترس `SELECT` خارج‌اند.
- Edge Functions: اعتبارسنجی ورودی با Zod، CORS با allowlist مشخص، کلیدها فقط سمت سرور.
- لاگ حسابرسی برای بازنشانی رمز و اقدامات مدیریتی.

---

## ۹. طراحی و ریسپانسیو بودن

**سیستم طراحی «Liquid Glass»:** backdrop-blur، گرادیان‌های شعاعی، پس‌زمینه‌ی Aurora، تایپوگرافی Vazirmatn (سرو محلی، بدون CDN). همه‌ی رنگ‌ها توکن معنایی در `index.css` هستند — هیچ رنگ hardcode در کامپوننت‌ها.

**نقاط شکست**

| بازه | چیدمان |
|------|--------|
| `< 768px` موبایل | سایدبار به‌صورت Drawer با backdrop و سوایپ، ناوبری پایین (`MobileOptimizedNav`)، padding فشرده، تب‌ها اسکرول افقی |
| `768–1023px` تبلت | سایدبار جمع‌شونده، دو ستونه، جدول‌ها با اسکرول افقی |
| `≥ 1024px` دسکتاپ | سایدبار ثابت (باز `mr-72` / جمع `mr-16`)، شبکه‌های چندستونه |
| `≥ 1536px` نمایشگر عریض | محتوا در `max-width: 1600px` وسط‌چین می‌شود |

**قواعد سراسری ریسپانسیو** (انتهای `frontend/src/index.css`)
- جلوگیری از overflow افقی در `html/body/#root`.
- `max-width: 100%` برای تصاویر، ویدیو، svg و iframe.
- شکستن رشته‌های طولانی در متن‌ها و سلول‌های جدول.
- محدودکردن عرض‌های ثابت (`w-[...]`, `min-w-[...]`) در موبایل، با استثنا برای جدول‌های ذاتاً پهن که اسکرول افقی می‌گیرند.
- تب‌ها (`[role="tablist"]`) در موبایل اسکرول افقی بدون اسکرول‌بار.
- `font-size: 16px` برای ورودی‌ها تا iOS زوم نکند.
- حداقل هدف لمسی ۴۴px برای دکمه‌ها.
- دیالوگ‌ها در موبایل `calc(100vw - 1.5rem)`.

**هوک‌های کمکی:** `useIsMobile`، `useDeviceDetection`، `useAdaptiveLayout`، `useResponsiveBreakpoints`.

---

## ۱۰. Edge Functions

| تابع | کار | سرویس مدل |
|------|-----|-----------|
| `smart-assistant` | مغز دستیار: استخراج قصد، مسیریابی داده، پاسخ فارسی | Liara AI |
| `meeting-preparation` | تحلیل آمادگی جلسه با retry و fallback | Liara AI |
| `analyze-idea` | تحلیل ۸ بخشی ایده (Overview, BMC, SWOT, Strategy, …) | Liara AI |
| `ai-chat`, `ai-assistant` | گفت‌وگوی عمومی و پیشنهاددهی | Liara AI |
| `perplexity-proxy` | خلاصه‌سازی و ساخت مایندمپ | Liara AI |
| `speech-to-text` | تبدیل گفتار به متن | Whisper |
| `generate-business-email`, `generate-networking-email` | تولید ایمیل بومی‌سازی‌شده | Liara AI |
| `send-email`, `send-delegation-email/sms` | ارسال از طریق Resend / SMS |
| `telegram-bridge` | پل تلگرام با احراز هویت و لاگ حسابرسی |
| `plaud-*`, `hi-dock-*` | همگام‌سازی دستگاه‌های ضبط |
| `create-user`, `create-sub-user`, `sub-user-login`, `reset-password`, `list-users` | مدیریت کاربران |

---

## ۱۰.۱ پیکربندی هوش مصنوعی (Liara)

همه‌ی فراخوانی‌های مدل از `supabase/functions/_shared/liaraAI.ts` عبور می‌کنند. هر تابع AI این ماژول را به‌جای `fetch` سراسری import می‌کند، بنابراین مسیر مدل در یک نقطه متمرکز است.

| متغیر محیطی | توضیح |
|--------------|-------|
| `LIARA_AI_API_KEY` | کلید Liara (فقط سمت سرور، در Secret store) |
| `LIARA_AI_BASE_URL` | مثل `https://ai.liara.ir/api/v1/<service-id>` |
| `LIARA_AI_MODEL` | اختیاری؛ مدل پیش‌فرض را بازنویسی می‌کند |

```mermaid
flowchart LR
  F["Edge Function"] --> X["aiFetch()"]
  X --> Y{"LIARA_AI_API_KEY و BASE_URL موجود؟"}
  Y -- بله --> Z["Liara AI /chat/completions"]
  Y -- خیر --> W["fallback به سرویس قبلی"]
  Z --> R{"وضعیت پاسخ"}
  R -- 200 --> OK["پاسخ به کاربر"]
  R -- 400 --> M["تلاش مجدد با مدل پیش‌فرض"]
  R -- 401/402/429/5xx --> ERR["پیام خطای فارسی"]
```

نگاشت مدل‌ها: نام‌های `gemini` به `google/gemini-2.0-flash-001`، نام‌های `gpt-4o/4.1` به `openai/gpt-4.1` و بقیه به `openai/gpt-4o-mini` نگاشت می‌شوند.

---

## ۱۱. راهنمای توسعه

### Conventional Commits

```
type(scope?): subject

feat: add meeting upload functionality
fix: resolve authentication bug in login
docs: update installation guide
```

انواع مجاز: `feat` · `fix` · `docs` · `style` · `refactor` · `perf` · `test` · `chore` · `build` · `ci`

### قواعد کدنویسی
- بدون `console.log` در production — از `logger.ts` استفاده کنید.
- کتابخانه‌های سنگین (Tesseract، pdf.js، xlsx، jsPDF) حتماً **dynamic import**.
- رنگ‌ها فقط از توکن‌های معنایی؛ `text-white`/`bg-black` ممنوع.
- هر کوئری دیتابیس باید به‌صراحت با شناسه کاربر فیلتر شود.

---

## ۱۲. عیب‌یابی

| نشانه | راه‌حل |
|-------|--------|
| `Failed to fetch dynamically imported module` | Service Worker قدیمی؛ hard refresh یا Unregister |
| `Failed to send request` در Edge Function | مبدأ در allowlist `_shared/cors.ts` نیست |
| داده‌ی کاربر دیگری دیده می‌شود | فیلتر `user_id` در کوئری جا افتاده |
| آپلود فایل رد می‌شود | مسیر باید با `${userId}/` شروع شود |
| دستیار انگلیسی جواب می‌دهد | prompt الزام فارسی در `smart-assistant` بررسی شود |
| `dist-check failed` | build باید در `dist/` ریشه خروجی بدهد |

---

© مغز دوم من — همه حقوق محفوظ است.