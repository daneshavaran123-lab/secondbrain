# Data Model: جستجوی یکپارچه

جدول یا ستون تازه‌ای ساخته نمی‌شود. دو مفهوم در کد هست: **منبع** (تعریف ثابت در `backend/src/search/sources.js`)
و **نتیجه** (خروجی موتور).

## منبع جستجو (Search Source)

| فیلد | نوع | توضیح |
|------|-----|-------|
| `type` | string | شناسه پایدار (`task`، `need`، …)؛ در API و `search_brain` به کار می‌رود |
| `label` | string | نام فارسی گروه («نیاز اجتماعی») |
| `kind` | `'table'` \| `'collection'` | جدول Postgres یا فهرست JSON در `user_collections` |
| `table` / `collection` | string \| `(userId) => string` | نام جدول؛ یا کلید فهرست (برای پرونده‌های حقوقی وابسته به کاربر) |
| `owner` | SQL fragment | شرط مالکیت با `$1` = کاربر (مثلاً `user_id = $1`، `author_id = $1`، `EXISTS (… business_companies …)`) |
| `title` | column / field | ستون یا فیلد عنوان؛ نبودِ عنوان → تکه‌ای از متن |
| `body` | column[] / field[] | ستون‌ها یا فیلدهایی که متنشان گشته می‌شود |
| `date` | column / field | تاریخ نمایش و رتبه‌بندی (تاریخ ثبت یا موعد) |
| `where` | SQL fragment (اختیاری) | شرط اضافه (مثلاً دسته «دل‌نوشته») |
| `path` | `(row) => string` | مسیر صفحه مقصد، با `highlight=<id>` |
| `palette` | boolean | در کادر Ctrl+K می‌آید؛ `false` = فقط دستیار |

### منبع‌ها

| type | label | از کجا | مالک | عنوان | متن |
|------|-------|--------|------|-------|-----|
| task | کار | `personal_planning` | `user_id` | title | description |
| delegated | کار واگذارشده | `delegation_tasks` | `delegator_id` | title | description، delegatee_name |
| event | رویداد تقویم | `calendar_events` | `user_id` | title | description، notes، location، venue_address |
| meeting | جلسه | `meetings` | `user_id` | title | description، agenda، summary، notes |
| minutes | جلسه و صورت‌جلسه | `meetings_v3` (فهرست) | سند کاربر | title | summary، minutes_text، transcript، meeting_type |
| note | یادداشت و دانش | `knowledge_base` بدون دسته «دل‌نوشته» | `author_id` | title | content |
| journal | دل‌نوشته | `knowledge_base` با دسته «دل‌نوشته» | `author_id` | title | content |
| saved | ذخیره‌شده (فقط دستیار) | `knowledge_items` | `user_id` | title | content |
| idea | ایده | `ideas` | `user_id` | title | description |
| contact | مخاطب | `personal_contacts` | `user_id` | full_name | organization، role، email، phone، notes |
| company_contact | مخاطب شرکت | `company_contacts` | از راه `business_companies.user_id` | name | organization، role، email، phone، notes |
| project | پروژه | `projects` | `user_id` | name | description |
| legal | پرونده حقوقی | `legal_cases` + فهرست `legal_<userId>_cases` | `user_id` / سند کاربر | title | description، court، opponent، lawyer، case_number |
| letter | نامه و بخشنامه | `organizational_letters` | `user_id` | subject | summary، clean_text یا ocr_text، sender، organization_name، letter_number |
| cultural | محتوای فرهنگی | `cultural_content` | `user_id` | title | content، reference |
| gratitude | شکرگزاری | `gratitude_entries` + فهرست `enhanced_gratitude_entries` | `user_id` / سند کاربر | — | content، gratitude_item_1..3 |
| need | نیاز اجتماعی | `khk_social_needs` (فهرست) | سند کاربر | title | description، area، category، notes |
| partner | شریک و همکار | `partners` (فهرست) | سند کاربر | name | notes، type، contact_person |
| service | اقدام خدمت‌رسانی | `khk_service_projects` (فهرست) | سند کاربر | title | description، location، category |
| program | برنامه | `roadmap-programs` (فهرست) | سند کاربر | title | description |
| risk | ریسک | `risk-assessments` (شیء نام سازمان → آرایه) | سند کاربر | title | description، mitigationStrategy، category |
| csr | پروژه مسئولیت اجتماعی | `csr_projects` | `user_id` | title | description |
| company | شرکت | `business_companies` | `user_id` | company_name | industry، description، notes |
| organization | سازمان | `organizations` | `user_id` (مالک) یا عضویت در `user_organizations` | name | description |

قواعد:
- منبع جدول‌دار و فهرست‌دار با یک `type` (legal، gratitude) بر اساس `id` یکی می‌شوند؛ نسخه جدول مقدم است.
- مورد بدون عنوان و بدون متن هرگز منطبق نیست (هیچ کلمه‌ای در آن نیست).
- مورد حذف‌شده در جدول یا فهرست نیست، پس پیدا نمی‌شود (Edge case).

## نتیجه جستجو (Search Result)

| فیلد | نوع | توضیح |
|------|-----|-------|
| `id` | string | شناسه مورد در منبع خودش |
| `type` | string | `type` منبع |
| `title` | string | عنوان؛ یا ۶۰ نویسه اول متن |
| `snippet` | string | حداکثر ۱۶۰ نویسه پیرامون اولین کلمه پیداشده (بدون تکرار عنوان) |
| `date` | string \| null | ISO؛ کلاینت شمسی نمایش می‌دهد |
| `path` | string | مسیر صفحه مقصد |
| `titleHit` | boolean | همه کلمه‌ها در عنوان هستند (برای رتبه‌بندی) |

## گروه نتایج (Result Group)

| فیلد | نوع | توضیح |
|------|-----|-------|
| `type`، `label` | string | از منبع |
| `total` | number | تعداد همه موردهای منطبق در این نوع |
| `items` | Result[] | حداکثر `limit` مورد (۵ پیش‌فرض، ۲۰ با «بیشتر») |

گروه‌ها به ترتیب: گروهی که بهترین نتیجه‌اش همه کلمه‌ها را در عنوان دارد جلوتر؛ در برابری، ترتیب ثابت انواع (`SOURCE_TYPES`، همان ترتیب FR-002)
تا جای گروه‌ها از یک جستجو به جستجوی دیگر جابه‌جا نشود.
