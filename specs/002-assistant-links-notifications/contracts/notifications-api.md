# Contract: `/notifications`

همه مسیرها `Authorization: Bearer <token>` می‌خواهند (`requireAuth`)؛ بدون آن `401`. کاربر فقط اعلان‌ها، تنظیمات و دستگاه‌های
خودش را می‌بیند و تغییر می‌دهد. پیام‌های خطا فارسی‌اند: `{ "error": "…" }`.

## `GET /notifications?before=<iso>&limit=<n>`

فهرست تازه‌ترین اعلان‌ها (پیش‌فرض ۳۰، حداکثر ۱۰۰؛ `before` برای صفحه بعد).

```json
{
  "unread": 3,
  "items": [
    {
      "id": "…", "type": "reminder", "title": "یادآوری: تماس با پیمانکار", "body": null,
      "due_at": "2026-11-03T05:30:00.000Z", "created_at": "2026-11-03T05:30:04.000Z", "read_at": null,
      "path": "/calendar", "sender": null
    },
    {
      "id": "…", "type": "message", "title": "سارا کرباسی", "body": "جلسه هماهنگی به ساعت ۱۱ منتقل شد",
      "due_at": "…", "created_at": "…", "read_at": null, "path": null,
      "sender": { "id": "…", "display_name": "سارا کرباسی" }
    }
  ]
}
```

## `GET /notifications/unread-count` → `{ "unread": 3 }`

برای پرسش دوره‌ای سبک (هر ۲۰ ثانیه).

## `POST /notifications/read`

بدنه `{ "ids": ["…"] }` یا `{ "all": true }` → `{ "updated": n }`. شناسه‌های کاربر دیگر نادیده گرفته می‌شوند.

## `DELETE /notifications/:id` → `204`؛ اعلان کاربر دیگر → `404`.

## `GET /notifications/settings`

```json
{
  "channels": { "reminder": { "push": true, "sms": false, "email": false }, "task_due": { "off": true }, "…": {} },
  "quiet_start": "22:00", "quiet_end": "07:00", "accept_from_others": true, "tz": "Asia/Tehran",
  "permission_explained": false,
  "has_phone": true, "has_email": true,
  "last_errors": [{ "channel": "sms", "error": "شماره نامعتبر است", "at": "…" }],
  "vapid_public_key": "B…"
}
```

## `PUT /notifications/settings`

بدنه همان شکل (بدون فیلدهای فقط‌خواندنی). اعتبارسنجی: نوع و راه شناخته‌شده؛ ساعت `HH:mm`؛ `tz` معتبر IANA.
روشن کردن `sms` بدون شماره → `422 { "error": "برای پیامک، شماره همراه را در پروفایل ثبت کنید" , "field": "phone" }`.

## `POST /notifications/devices`

```json
{ "kind": "webpush", "endpoint": "https://…", "p256dh": "…", "auth": "…", "label": "Chrome روی ویندوز" }
```
یا `{ "kind": "fcm", "endpoint": "<fcm token>", "label": "Android" }` → `{ "id": "…" }`. همان `endpoint` برای کاربر دیگر
ثبت‌شده باشد، به کاربر فعلی منتقل می‌شود.

## `DELETE /notifications/devices/:id` → `204` (هنگام خروج از حساب).

## `POST /notifications/send` — اعلان به کاربر دیگر

```json
{ "recipient_id": "…", "message": "جلسه هماهنگی به ساعت ۱۱ منتقل شد", "ref": { "type": "organization", "id": "…" } }
```

| پاسخ | وقتی |
|------|------|
| `201 { "id": "…" }` | ساخته شد |
| `400` | پیام خالی یا بیش از ۵۰۰ نویسه؛ گیرنده خود فرستنده |
| `403 { "error": "این کاربر با شما در هیچ سازمانی عضو نیست" }` | سازمان مشترک ندارند یا گیرنده نیست |
| `403 { "error": "این کاربر اعلان از دیگران را نمی‌پذیرد" }` | `accept_from_others = false` |
| `429 { "error": "بیش از ۲۰ اعلان در یک ساعت؛ کمی بعد دوباره امتحان کنید" }` | سقف ساعتی |

- `sender_id` = کاربر نشست؛ عنوان اعلان = نام نمایشی فرستنده.
- `ref` فقط وقتی نگه داشته می‌شود که `type = organization` و گیرنده عضو همان سازمان باشد؛ وگرنه حذف می‌شود (FR-018).

## `GET /notifications/recipients?q=<text>`

اعضای سازمان‌های مشترک (برای انتخاب گیرنده در رابط و برای ابزار دستیار): `[{ "id", "display_name", "organizations": ["…"] }]`.
هرگز ایمیل کسی را که سازمان مشترک ندارد برنمی‌گرداند.
