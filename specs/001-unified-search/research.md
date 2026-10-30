# Research: جستجوی یکپارچه

هیچ «NEEDS CLARIFICATION» در Technical Context نماند؛ تصمیم‌های زیر از کد موجود و قانون اساسی گرفته شد.

## R1. روش جستجو: ILIKE روی متن یکسان‌شده یا full-text Postgres

- **Decision**: `ILIKE ALL(patterns)` روی عبارت یکسان‌شده (`translate(lower(...))`)، یک پرسش برای هر جدول،
  محدود به ردیف‌های همان کاربر (ستون مالک ایندکس دارد).
- **Rationale**: tsvector پیکربندی فارسی ندارد (`simple` ریشه‌یابی نمی‌کند و نیم‌فاصله را جداکننده نمی‌گیرد)؛
  ستون `search_vector` فقط در دو جدول هست. جستجوی زیررشته‌ای «می‌خواهم» را با «میخواهم» و «خواهم» هر دو پیدا
  می‌کند. حجم هر کاربر (چند هزار مورد) برای اسکن ردیف‌های خودش کوچک است.
- **Alternatives considered**: `pg_trgm` + ایندکس GIN (بی‌نیاز در این حجم، افزونه تازه لازم دارد)؛ جستجوی
  برداری (خارج از نسخه اول طبق Assumptions)؛ جستجو در مرورگر (خلاف اصل II، داده سرور را نمی‌بیند).

## R2. یکسان‌سازی نوشتار

- **Decision**: یک تابع JS و یک عبارت SQL با جدول نگاشت یکسان:
  `ي→ی`، `ى→ی`، `ك→ک`، `ة→ه`، `أ/إ→ا`، ارقام `۰-۹` و `٠-٩` → `0-9`؛ حذف نیم‌فاصله (U+200C)، کشیده (U+0640)
  و اعراب (U+064B–U+065F، U+0670)؛ سپس `lower`. پرسش به کلمه‌ها شکسته می‌شود (فاصله و نشانه‌ها)، کلمه‌های تکراری
  حذف و حداکثر ۶ کلمه نگه داشته می‌شود.
- **Rationale**: FR-006. حذف نیم‌فاصله (به‌جای تبدیل به فاصله) باعث می‌شود «می خواهم» (دو کلمه «می»، «خواهم») و
  «میخواهم» هر دو متن «می‌خواهم» را پیدا کنند. همتای SQL با `translate()` (کاراکترهای بدون جفت حذف می‌شوند) همان
  نگاشت را روی ستون‌ها اعمال می‌کند، پس ایندکس لازم نیست و رفتار دو طرف یکی است.
- **Alternatives considered**: یکسان کردن «آ→ا» (کنار گذاشته شد: «آب» و «اب» در فارسی یکی نیستند و spec
  نخواسته)؛ حذف ایست‌واژه‌ها در کادر جستجو (فقط برای دستیار نگه داشته شد؛ در کادر، کاربر خودش کلمه‌ها را می‌نویسد).

## R3. فهرست‌های JSON در `user_collections`

- **Decision**: سندهای همان کاربر برای کلیدهای مشخص (`khk_social_needs`، `partners`، `khk_service_projects`،
  `roadmap-programs`، `meetings_v3`، `risk-assessments`، `legal_<userId>_cases`، `enhanced_gratitude_entries`)
  با یک پرسش خوانده و در JS صاف (flatten)، یکسان‌سازی و فیلتر می‌شوند.
- **Rationale**: این فهرست‌ها یک سند JSON برای هر نفرند؛ اندازه‌شان کوچک است و شکل‌شان متفاوت
  (`risk-assessments` شیئی از نام سازمان به آرایه است). فیلتر در JS ساده‌تر و آزمودنی‌تر از `jsonb_array_elements`
  با شکل‌های گوناگون است.
- **Alternatives considered**: `jsonb_array_elements` + `ILIKE` در SQL (برای `risk-assessments` شکل تو در تو را
  نمی‌پوشاند)؛ انتقال این فهرست‌ها به جدول‌های جدا (کار بزرگ، خارج از این ویژگی).

## R4. شمارش «بقیه» و رتبه‌بندی

- **Decision**: در SQL: `count(*) OVER ()` برای کل منطبق‌ها و
  `ORDER BY (title_norm ILIKE ALL(patterns)) DESC, <date> DESC NULLS LAST LIMIT n`. در JS همان ترتیب با
  `titleHit` و تاریخ.
- **Rationale**: FR-005 تعداد بقیه را می‌خواهد و FR-007 ترتیب را؛ پنجره `count(*) OVER()` یک رفت‌وبرگشت کم می‌کند.
- **Alternatives considered**: پرسش جدا برای شمارش (دو برابر پرسش).

## R5. شرط «همه کلمه‌ها» برای دستیار

- **Decision**: موتور گزینه `match: 'all' | 'any'` دارد. کادر Ctrl+K همیشه `all`. `search_brain` اول `all` می‌گردد و
  اگر هیچ نتیجه‌ای نبود، با `any` و امتیاز (عنوان ۳، متن ۱) تکرار می‌کند.
- **Rationale**: مدل زبانی گاهی کلمه اضافه («وضعیت»، «نیاز») در پرسش می‌گذارد؛ `all` تنها آن را بی‌نتیجه می‌کند.
  رفتار قبلی دستیار `any` بود؛ این ترکیب دقت کادر و فراخوانی دستیار را هر دو نگه می‌دارد.

## R6. مسیر مقصد و نمایان کردن مورد

- **Decision**: هر منبع تابع `path(row)` دارد که مسیر صفحه (و `?tab=` در صورت نیاز) و `highlight=<id>` را
  می‌سازد. hook مشترک `useHighlight` در صفحه، پس از رسیدن داده، عنصر `[data-search-id="<id>"]` را پیدا می‌کند،
  به آن اسکرول می‌کند و ۲ ثانیه حلقه رنگی می‌دهد؛ اگر صفحه آن را ندارد، کاری نمی‌کند.
- **Rationale**: FR-004؛ کمترین تغییر در هر صفحه (یک attribute و یک خط hook). صفحه‌هایی که hook ندارند همچنان
  درست باز می‌شوند.
- **Alternatives considered**: پیش‌نمایش در خود کادر (Clarification Q2: لازم نیست)؛ فیلتر صفحه با `?q=`
  (هر صفحه منطق فیلتر جدا می‌خواست).

## R7. پاسخ کهنه و تأخیر تایپ

- **Decision**: hook `useRecordSearch` با تأخیر ۲۵۰ms، حداقل ۲ نویسه پس از trim، و `AbortController` که درخواست
  قبلی را لغو می‌کند؛ نتیجه فقط وقتی نوشته می‌شود که شماره درخواست همان آخرین باشد.
- **Rationale**: Edge case «تند تایپ می‌کند» و «پرسش یک‌حرفی».

## R8. مسیرهای مقصد

| نوع | مسیر |
|-----|------|
| کار | `/tasks` |
| کار واگذارشده | `/delegation` |
| رویداد تقویم | `/calendar` |
| جلسه (جدول) | `/meetings` |
| جلسه/صورت‌جلسه (`meetings_v3`) | `Professional` → `/meetings`؛ `KhadimEKhalgh` → `/organizational/khadim-e-khalgh/meeting-minutes`؛ `Varid/Chamber/Frangaran/Association` → `/organizations/<key>/meeting-minutes` |
| یادداشت/دانش | `/knowledge` |
| دل‌نوشته (`knowledge_base` با دسته «دل‌نوشته») | `/personal-journal` |
| مورد ذخیره‌شده (`knowledge_items`) | فقط دستیار؛ صفحه‌ای که آن را نشان دهد نیست |
| ایده | `/ideas` |
| مخاطب شخصی | `/contacts` |
| مخاطب شرکت | `/company/<company_id>` |
| مخاطب شبکه (`networking_contacts`) | فقط دستیار (`search_contacts`)؛ صفحه‌ای آن را نشان نمی‌دهد |
| پروژه | `/projects` |
| پرونده حقوقی | `/legal` |
| نامه/بخشنامه | `/organizational-letters` |
| محتوای فرهنگی | `/cultural-content` |
| شکرگزاری | `/gratitude-journal` |
| نیاز اجتماعی / شریک / اقدام / برنامه | `/organizational/khadim-e-khalgh/{needs,partners,projects,roadmap}` |
| ریسک | `/organizations/<key>/risk-assessment` از روی نام سازمان |
| پروژه مسئولیت اجتماعی | `/csr-project/<id>` |
| شرکت | `/company/<id>` |
| سازمان | `/organizations/<id>` |
