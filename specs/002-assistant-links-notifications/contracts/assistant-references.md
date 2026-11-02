# Contract: ارجاع‌ها در پاسخ دستیار و ابزار `notify_user`

## پاسخ `POST /smart-assistant` (افزوده)

```json
{
  "message": "نیاز [آب شرب روستای کلاته](ref:r1) در حال اجراست و کار [پیگیری لوله‌کشی](ref:r2) موعدش فرداست.",
  "references": [
    { "key": "r1", "type": "need", "id": "need-1", "title": "آب شرب روستای کلاته",
      "path": "/organizational/khadim-e-khalgh/needs?highlight=need-1" },
    { "key": "r2", "type": "task", "id": "…", "title": "پیگیری لوله‌کشی", "path": "/tasks?highlight=…" }
  ],
  "actions": [
    { "type": "create_task", "params": { "…": "…" },
      "feedback": { "location": "وظایف شخصی", "details": "«…»", "page": "/tasks", "highlight": true } }
  ],
  "steps": [], "questions": [], "model": "…"
}
```

قواعد:
- هر `ref:<key>` در `message` در `references` هست؛ ارجاعی که مدل ساخته ولی وجود ندارد، به متن ساده برگردانده می‌شود.
- اولین رخداد عنوان هر ارجاع که هنوز پیوند ندارد، پیوند می‌شود (کد سرور، نه مدل).
- `path` همیشه با `/` شروع می‌شود و درون برنامه است؛ ارجاع بدون صفحه `path: null` دارد و پیوند نمی‌شود.
- خروجی ابزارهای خواندن به مدل برای هر مورد `ref` دارد؛ مسیر به مدل داده نمی‌شود.

## نمایش در کلاینت

- `[متن](ref:rN)` با `rN` موجود در `references` همان پیام → پیوند درون برنامه به `path` با `aria-label` «{نوع}: {عنوان}».
- هر `href` دیگر (http، mailto، `ref:` ناموجود) → متن ساده، بدون پیوند (FR-003).
- کارت تأیید کار انجام‌شده: اگر `feedback.page` هست، دکمه «باز کردن» به `page` و اگر `highlight` و شناسه ساخته‌شده معلوم است،
  `page?highlight=<id>`.

## ابزار نوشتن `notify_user`

```json
{ "recipient": "لیلا نوری", "message": "جلسه هماهنگی به ساعت ۱۱ منتقل شد" }
```

- `planWriteAction` گیرنده را در `GET /notifications/recipients` همان کاربر پیدا می‌کند:
  - یک تطبیق → عمل در انتظار تأیید با `feedback: { location: "اعلان به لیلا نوری", details: "«جلسه …»" }` و `params.recipient_id`.
  - چند تطبیق → `ask_clarification` با گزینه‌های نام‌ها.
  - هیچ → `{ error: "NOT_A_TEAMMATE" }` و مدل می‌گوید فقط به هم‌سازمانی‌ها می‌شود اعلان داد (و ایمیل/پیامک واگذاری را پیشنهاد می‌کند).
- همیشه تأیید لازم است (هرگز `status: pending` خودکار نیست)؛ اجرا روی کلاینت با `POST /notifications/send`.
