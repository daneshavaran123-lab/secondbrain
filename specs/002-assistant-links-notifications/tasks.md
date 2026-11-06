---

description: "Task list for assistant links and notifications"
---

# Tasks: پیوند در پاسخ دستیار و اعلان‌ها (Assistant Links & Notifications)

**Input**: Design documents from `specs/002-assistant-links-notifications/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/notifications-api.md, contracts/assistant-references.md, quickstart.md

**Tests**: لازم‌اند. قانون اساسی (اصل IV: آزمون «کاربر دوم»؛ اصل V: آزمون روی سرور واقعی) آن‌ها را برای هر قابلیت تازه می‌خواهد.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)

## Path Conventions

Web app: `backend/src/`, `backend/test/`, `frontend/src/`, `frontend/public/`. Real-server scripts live in the session scratchpad (`agent-test/`), as for feature 001.

---

## Phase 1: Setup

**Purpose**: Dependencies and the new module's place

- [X] T001 Add `web-push` to `backend/package.json` and `@capacitor/push-notifications` and `@capacitor/local-notifications` to `frontend/package.json` (install, keep lockfiles in sync)
- [X] T002 [P] Create `backend/src/notifications/` with empty `schedule.js`, `producers.js`, `delivery.js`, `worker.js`, `settings.js` (ES modules) and document the new env vars `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `FCM_SERVICE_ACCOUNT`, `FCM_API_BASE`, `SMS_API_URL`, `APP_URL`, `NOTIFY_TICK_MS` in `backend/.env.example`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: One place that knows the page of a record, used by both assistant references (US1) and notifications (US2)

**⚠️ CRITICAL**: US1 and US2 both need this

- [X] T003 Export `pathFor(type, row)` from `backend/src/search/sources.js` (the `path` of the table or collection source with that `type`, else `null`) and add the extra types the new features need: `invitation` → `/accept-invitation/<token>`, `delegated` → `/delegation`; unit-test it in `backend/test/search.test.js`

**Checkpoint**: `pathFor('need', { id: 'x' })` gives `/organizational/khadim-e-khalgh/needs?highlight=x`

---

## Phase 3: User Story 1 - از پاسخ دستیار مستقیم به همان مورد بروم (Priority: P1) 🎯 MVP

**Goal**: Every record the assistant names or creates is a link to its page (contracts/assistant-references.md)

**Independent Test**: one question per data type with the fake LLM; every named record is a link to the right page; links never leave the app (SC-001, SC-006)

### Tests for User Story 1

- [X] T004 [P] [US1] `backend/test/references.test.js`: keys `r1…rN` are unique per answer; the same record gets the same key; `linkify` links the first unlinked occurrence of each title; `ref:` keys not in the book and any `http(s):`/`mailto:` links become plain text; a reference with `path: null` is never linked
- [X] T005 [P] [US1] vitest `frontend/src/test/__tests__/components/AssistantLinks.test.tsx`: `[x](ref:r1)` with `r1` in `references` renders an in-app link to its `path` with `aria-label` «{نوع}: {عنوان}»; `[x](https://…)` and `[x](ref:r9)` render as text; the confirmation card shows «باز کردن» to `page?highlight=<id>`

### Implementation for User Story 1

- [X] T006 [US1] `backend/src/agent/references.js`: `createReferenceBook()` with `add({ type, id, title, path })` → key and `linkify(text)` per contracts/assistant-references.md; `path` must start with `/` and contain no `//` or `:`
- [X] T007 [US1] In `backend/src/agent/tools.js`, give each item of the read tools a `ref` from `ctx.refs` (the path is not sent to the model): `search_brain` (engine `path`), `search_calendar` (`/calendar`), `get_pending_tasks` (mark each task's source; planning → `/tasks?highlight=<id>`, delegated → `/delegation`), `search_contacts` (personal → `/contacts?highlight=<id>`, company → `/company/<company_id>`, network → `null`)
- [X] T008 [US1] In `backend/src/routes/smart-assistant.js`, create `ctx.refs` per turn, run `linkify` on the final text and return `references` with the response
- [X] T009 [P] [US1] In `backend/src/agent/prompt.js`, tell the model to write record names as `[عنوان](ref:rN)` using the `ref` from tool results, and never to write URLs
- [X] T010 [US1] In `feedbackFor` (`backend/src/agent/tools.js`), add `page` and `highlight` for every write tool (create_task/create_tasks_batch → `/tasks` with highlight; create_meeting/cancel_meeting/update_meeting/create_reminder → `/calendar`; save_idea → `/ideas`; save_journal_entry → `/personal-journal`; save_gratitude → `/gratitude-journal`; save_meeting_summary → `/meetings`; create_contact/import_contacts_batch → `/contacts` with highlight; save_for_later → `/cultural-content`; save_knowledge → `/knowledge`; save_health_metrics → `/health`; complete_habit → `/habits`; add_resume_item → `/resume`; create_legal_case/save_lawyer_note → `/legal`)
- [X] T011 [US1] In `frontend/src/services/actionExecutorService.ts`, return the created row's id in `ActionResult.data.id` (`insert(...).select('id').single()`) for every create action
- [X] T012 [US1] In `frontend/src/components/assistant/SmartAssistant.tsx`: keep `references` on each assistant message; `AssistantMarkdown` renders `ref:` links as `react-router` links per T005 and every other link as text; the action confirmation shows «باز کردن» from `feedback.page` (+ `highlight=<id>` when `feedback.highlight` and an id came back)
- [X] T013 [US1] In `frontend/src/hooks/useHighlight.ts`, show the toast «این مورد دیگر وجود ندارد» when the page is ready and the record is not found
- [X] T014 [P] [US1] Fake-LLM scenarios and `agent-test/assistant-links.mjs`: a question about «کلاته» returns `references` and linked names; a model answer with an external link and an unknown `ref` comes back as text; a confirmed create has `page`

**Checkpoint**: clicking a record name in an answer opens its page with the record outlined

---

## Phase 4: User Story 2 - یادآورها، موعدها و خبرهای کاری سر وقت به من برسند (Priority: P2)

**Goal**: Notifications are produced on time from every source, kept on the server, and delivered in app, as a system notification, by push, SMS and email

**Independent Test**: a reminder 2 minutes ahead with the app closed arrives once, stays in the list and opens the record; the same for a meeting, a task due today, an invitation and a delegated-task change (quickstart §2.1–2.7, §4.3)

### Tests for User Story 2

- [ ] T015 [P] [US2] `backend/test/notifications.test.js`: due times (event 15 minutes before; all-day event 08:00; `task_due` 08:00 on the due date in the user's tz; reminder at `start_date`), quiet window including one that crosses midnight, `Asia/Tehran` vs another tz, dedupe keys include the due time, message text for SMS/email is short and has no body details (FR-021)
- [ ] T016 [P] [US2] `agent-test/fake-notify.mjs` (records Web Push, FCM, SMS and email requests) and `agent-test/notifications-api.mjs` covering quickstart §2 items 1–7, 10 and 11 with three users

### Implementation for User Story 2

- [ ] T017 [US2] Add to `backend/src/db/schema.sql` (idempotent): `notifications` (`title` "حداکثر ۱۲۰ نویسه", `body` "حداکثر ۵۰۰ نویسه", `type` one of `reminder`، `event`، `task_due`، `invitation`، `delegated`، `delegation_status`، `message`, `UNIQUE (user_id, dedupe_key)`, `ON DELETE CASCADE`, indexes `(user_id, created_at DESC)` and unread), `notification_deliveries` (`channel` `push`|`sms`|`email`, `status` `pending`|`sent`|`failed`|`skipped`, `attempts` "حداکثر ۳ تلاش", `UNIQUE (notification_id, channel)`), `notification_settings` (defaults per data-model.md) and `notification_devices` (`kind` `webpush`|`fcm`, `endpoint` UNIQUE)
- [ ] T018 [P] [US2] `backend/src/notifications/settings.js`: defaults (every type `{ push: true, sms: false, email: false }`, `accept_from_others: true`, `tz: 'Asia/Tehran'`), load/merge, `isOff(type)`, `channelsFor(type)`
- [ ] T019 [P] [US2] `backend/src/notifications/schedule.js`: pure functions for due times, `deliverAfter(dueAt, settings)` (quiet window end) and dedupe keys, per research R4/R5/R7
- [ ] T020 [US2] `backend/src/notifications/producers.js`: one producer per type of research R5 with the 24-hour look-back window, `INSERT … ON CONFLICT (user_id, dedupe_key) DO NOTHING`, skipping types the user turned off, and one `notification_deliveries` row per enabled outside channel with `deliver_after`; `path` from `pathFor` (T003)
- [ ] T021 [P] [US2] `SMS_API_URL` override in `backend/src/utils/sms.js` (default `https://api.sms.ir/v1`)
- [ ] T022 [US2] `backend/src/notifications/delivery.js`: Web Push with `web-push` (VAPID); FCM HTTP v1 (OAuth token signed with `jsonwebtoken` RS256 from `FCM_SERVICE_ACCOUNT`, base `FCM_API_BASE`); SMS via `utils/sms.js` to `user_profiles.mobile_phone`/`phone`; email via Resend; short Persian text with Jalali date and 24-hour time plus `APP_URL` link; up to 3 attempts; 404/410 disables the device; `skipped` when there is no device/phone/email
- [ ] T023 [US2] `backend/src/notifications/worker.js`: every `NOTIFY_TICK_MS` (default 30000) under `pg_try_advisory_lock`: produce → deliver due rows → once a day delete notifications older than 90 days; start it from `backend/src/index.js` (not when `NODE_ENV=test`)
- [ ] T024 [US2] `backend/src/routes/notifications.js` with `requireAuth` and `wrap`: `GET /`, `GET /unread-count`, `POST /read`, `DELETE /:id`, `POST /devices`, `DELETE /devices/:id` per contracts/notifications-api.md (same endpoint from another user moves the device); mount `/notifications` in `backend/src/index.js`
- [ ] T025 [P] [US2] `frontend/src/services/notificationsService.ts` for the routes of T024
- [ ] T026 [US2] `frontend/src/hooks/useNotifications.ts`: unread count every 20 seconds and on focus; newly arrived unread items shown once as a system notification (web: `registration.showNotification` with `tag` = notification id; app: `@capacitor/local-notifications`) when permission is granted
- [ ] T027 [US2] `frontend/src/lib/push.ts`: register the device (web: `pushManager.subscribe` with the VAPID public key from settings; app: `PushNotifications.register` → FCM token) and `POST /notifications/devices`; keep the device id; `DELETE` it on sign-out from `frontend/src/contexts/AuthContext.tsx`
- [ ] T028 [P] [US2] `frontend/public/sw.js`: `push` shows title/body with `tag` and `data.path`; `notificationclick` focuses an open window and navigates to `data.path`, or opens it
- [ ] T029 [US2] Rewrite `frontend/src/components/ui/notification-center.tsx` on the server: list with type icon, Jalali date and 24-hour time, sender name; click → navigate to `path` and mark read; «همه خوانده شد»; delete; loading, empty («هنوز اعلانی ندارید» + what produces notifications) and error states (FR-015); remove the `localStorage` service
- [ ] T030 [US2] `frontend/src/components/Header.tsx`: badge and `aria-label` «اعلان‌ها، N خوانده‌نشده» from `useNotifications`
- [ ] T031 [US2] Permission explanation once (FR-014): when permission is denied and `permission_explained` is false, a short note in the notification center with how to allow it; dismissing sets `permission_explained` via settings

**Checkpoint**: a reminder set by the assistant arrives on time in the bell and as a system/push notification, once

---

## Phase 5: User Story 3 - اعلان‌ها و راه رسیدنشان را خودم تعیین کنم (Priority: P3)

**Goal**: Per type, the person chooses channels; quiet hours; notifications from others

**Independent Test**: «کار با موعد امروز» set to in-app only → no push/SMS for it; quiet 22–07 → a 23:00 reminder's push arrives at 07:00 (quickstart §2.8)

### Tests for User Story 3

- [ ] T032 [P] [US3] In `agent-test/notifications-api.mjs`: `PUT /settings` with `sms` and no phone → 422 with `field: "phone"`; bad time or tz → 400; type off → no notification; quiet window → `deliver_after` at its end and no push before it; SMS/email only for types where they are on (SC-008)
- [ ] T033 [P] [US3] vitest `frontend/src/test/__tests__/pages/NotificationSettings.test.tsx`: renders every type with its channels, saves, shows the phone error next to the SMS switch

### Implementation for User Story 3

- [ ] T034 [US3] `GET`/`PUT /notifications/settings` in `backend/src/routes/notifications.js` with validation, `has_phone`, `has_email`, `last_errors` and `vapid_public_key`; the client sends `Intl` time zone once
- [ ] T035 [US3] `frontend/src/pages/NotificationSettingsPage.tsx`: a row per type with switches for in-app (fixed on), on-device, SMS, email; quiet hours with `TimeInput`; «اعلان از دیگران»; this device's state with an «فعال کردن اعلان روی این دستگاه» button; route `/settings/notifications` in `frontend/src/App.tsx`; links from the notification center and the user menu

**Checkpoint**: settings change what arrives and when

---

## Phase 6: User Story 4 - به همکارم که کاربر برنامه است خبر بدهم (Priority: P4)

**Goal**: Notify a teammate, always with confirmation, only within shared organizations

**Independent Test**: «به لیلا خبر بده…» → confirmation → Leila sees it with the sender's name; the same to someone with no shared organization is refused (quickstart §2.9, §3.4)

### Tests for User Story 4

- [ ] T036 [P] [US4] In `agent-test/notifications-api.mjs`: `send` 201 to a teammate; 403 with no shared organization; 403 when the recipient refuses others; 429 on the 21st in an hour; `ref` to an organization the recipient is not in is dropped; `recipients` lists only shared-organization members (SC-007)
- [ ] T037 [P] [US4] In `agent-test/assistant-links.mjs`: `notify_user` for one teammate → awaiting confirmation with `recipient_id`; two matches → clarification; none → `NOT_A_TEAMMATE`

### Implementation for User Story 4

- [ ] T038 [US4] `POST /notifications/send` and `GET /notifications/recipients` in `backend/src/routes/notifications.js` per the contract (message "حداکثر ۵۰۰ نویسه"; `sender_id` from the session; title = sender's display name)
- [ ] T039 [US4] Write tool `notify_user` in `backend/src/agent/tools.js`: definition, `planWriteAction` resolution against shared-organization members, `feedback` «اعلان به {نام}», never auto-confirmed; describe when to use it in `backend/src/agent/prompt.js`
- [ ] T040 [US4] Execute `notify_user` in `frontend/src/services/actionExecutorService.ts` with `POST /notifications/send`, showing the server's Persian error on 403/429

**Checkpoint**: a teammate receives the message; strangers cannot be messaged

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T041 [P] Browser test `verify-notifications.cjs` (scratchpad) for quickstart §4: answer links (mouse and keyboard), deleted record message, permission granted/denied, bell count, system notification once, settings page, mobile 390px without horizontal scroll
- [ ] T042 [P] Setup notes for VAPID keys and Firebase (Android `google-services.json`, iOS APNs key in Firebase) in `frontend/BUILD_INSTRUCTIONS.md`
- [ ] T043 Full gate (constitution V): `tsc`, `eslint`, `vitest` (UTC and `Asia/Tehran`), backend `npm test`, `vite build`, the new API and browser suites and the earlier ones (search, storage, members, org, health, embed, db-security)
- [ ] T044 Commit and push to `claude/vibrant-johnson-3obrre`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2: T003)**
- **US1 (P1)** needs T003 only; it does not need any notification table
- **US2 (P2)** needs T001 and T003
- **US3 (P3)** needs US2's tables, routes and worker (T017, T020, T024)
- **US4 (P4)** needs US2's tables and routes (T017, T024) and US1's confirmation flow for `notify_user` (T010–T012)
- **Polish** after the stories it verifies

### Within Each User Story

- Tests alongside, run before the checkpoint
- Schema → pure functions → producers/delivery → worker → routes → client service → hooks → UI

### Parallel Opportunities

- T002 with T001; T004, T005, T009 in parallel; T018, T019, T021 in parallel; T025 and T028 in parallel with the backend of US2
- US1 (assistant) and US2's backend can proceed side by side after T003
- T032/T033, T036/T037, T041/T042 in parallel

---

## Parallel Example: User Story 2

```bash
Task: "settings.js defaults and merge in backend/src/notifications/settings.js"
Task: "schedule.js pure functions in backend/src/notifications/schedule.js"
Task: "SMS_API_URL override in backend/src/utils/sms.js"
Task: "push and notificationclick in frontend/public/sw.js"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 + Phase 2
2. Phase 3 (US1): links in answers and «باز کردن» → validate with T004, T005, T014
3. Then US2 (the largest), US3, US4, Polish

### Incremental Delivery

Links (US1) → notifications on time in every channel (US2) → personal control (US3) → teammate messages (US4); each adds value without breaking the previous one.

---

## Notes

- [P] tasks = different files, no dependencies
- Outside services (Apple/Google/browser push, sms.ir, Resend) are tested against local fakes; real delivery is reported as untested
- Commit after the full gate (T043), per the constitution
