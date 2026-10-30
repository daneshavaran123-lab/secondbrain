---

description: "Task list for unified search"
---

# Tasks: جستجوی یکپارچه در همه داده‌های من (Unified Search)

**Input**: Design documents from `specs/001-unified-search/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/search-api.md, quickstart.md

**Tests**: لازم‌اند. قانون اساسی (اصل IV: آزمون «کاربر دوم»؛ اصل V: آزمون روی سرور واقعی) آن‌ها را برای هر قابلیت تازه می‌خواهد.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

Web app: `backend/src/`, `backend/test/`, `frontend/src/`; real-server scripts live in the session scratchpad (`agent-test/`), not in the repository.

---

## Phase 1: Setup

**Purpose**: The new module's place in the backend

- [X] T001 Create the folder `backend/src/search/` with `normalize.js`, `sources.js`, `engine.js` (ES modules, like `backend/src/agent/`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Normalization and the source registry that the search box (US1), the assistant (US2) and matching (US3) all use

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 Implement `normalizeFa(text)`, `sqlNormalize(expr)`, `searchWords(query, { stopwords })`, `escapeLike(word)` and `snippetAround(text, words, 160)` in `backend/src/search/normalize.js` per research R2: «`ي/ى→ی`، `ك→ک`، `ة→ه`، `أ/إ→ا`، ارقام `۰-۹` و `٠-٩` → `0-9`؛ حذف U+200C، U+0640، U+064B–U+065F، U+0670؛ سپس lower»; words split on spaces and punctuation, deduplicated, "at most 6", query "بیش از ۲۰۰ نویسه بریده می‌شود"
- [X] T003 Define the 24 types (26 sources) of data-model.md (type, label, kind, table/collection, owner, title, body, date, where, path, palette) in `backend/src/search/sources.js`, with destination paths from research R8 and `highlight=<id>`; `organization` owner = owner or member via `user_organizations`; `company_contact` owner via `business_companies.user_id`; `note` excludes and `journal` requires category «دل‌نوشته»; `saved` has `palette: false`
- [X] T004 Implement `searchAll(userId, query, { type, limit = 5, match = 'all', palette = true })` in `backend/src/search/engine.js`: one parameterized query per table source (`$1` user, `$2` patterns, `ILIKE ALL`/`ANY` on `sqlNormalize`d title‖body, `count(*) OVER ()`, `ORDER BY title-hit DESC, date DESC NULLS LAST LIMIT n`); one query for all collection documents of the user, flattened and filtered in JS; merge legal/gratitude by `id` (table wins); a failing source returns empty; groups ordered by best item; limit "پیش‌فرض ۵، حداکثر ۲۰"
- [X] T005 [P] Unit tests for normalization, words, snippet and the SQL fragment in `backend/test/search.test.js` (`node --test`, like `backend/test/news.test.js`)

**Checkpoint**: `searchAll` works from a Node REPL against the local Postgres

---

## Phase 3: User Story 1 - پیدا کردن هر چیزی که ثبت کرده‌ام از یک جا (Priority: P1) 🎯 MVP

**Goal**: Ctrl+K and the header search find the person's own records, grouped, with snippet, Jalali date and a link to the right page

**Independent Test**: one record of each type containing «کلاته» → each appears in its group and opens its page (quickstart §2.2, §3.1–3.2)

### Tests for User Story 1

- [X] T006 [P] [US1] Two-user API test `agent-test/search-api.mjs`: one record per type for A; A finds each with the right `path`; B sees `total: 0`; counts exclude B's records; `limit`/`type`/400/401; `%`/`_` literal (quickstart §2)
- [X] T007 [P] [US1] vitest for the palette record groups, «بیشتر», no-result and unavailable states, and stale-response ordering in `frontend/src/test/__tests__/components/CommandPalette.test.tsx`

### Implementation for User Story 1

- [X] T008 [US1] Route `GET /search` with `requireAuth` and `wrap` (Express 4) in `backend/src/routes/search.js` per contracts/search-api.md; mount it in `backend/src/index.js`
- [X] T009 [P] [US1] `searchRecords(q, { type, limit, signal })` using `apiFetch` in `frontend/src/services/searchService.ts`
- [X] T010 [P] [US1] `useRecordSearch(query)` in `frontend/src/hooks/useRecordSearch.ts`: 250ms delay, at least 2 characters after trim, `AbortController` for the previous request, states `idle | loading | done | error`, `expand(type)` loading up to 20
- [X] T011 [US1] Record groups in `frontend/src/components/command/CommandPalette.tsx`: after «دستیار», before «ایجاد»/«صفحه‌ها»; each item shows type icon, title, snippet, Jalali date; «N مورد دیگر — بیشتر» item; «در حال جستجو…», «چیزی پیدا نشد» (with «از دستیار بپرس»), «جستجو در داده‌ها الان در دسترس نیست»; `forceMount` so cmdk does not filter server results; `aria-live` count; placeholder mentions records
- [X] T012 [P] [US1] `useHighlight()` in `frontend/src/hooks/useHighlight.ts`: reads `highlight`, waits for `[data-search-id="<id>"]`, scrolls it into view and rings it for 2s
- [X] T013 [US1] Add `data-search-id` and `useHighlight()` to the Khadim pages `frontend/src/pages/organizational/khadim-e-khalgh/{Needs,Partners,Projects,Roadmap}.tsx`
- [X] T014 [P] [US1] Add `data-search-id` and `useHighlight()` to `frontend/src/pages/TasksPage.tsx` and `frontend/src/pages/PersonalContactsPage.tsx`

**Checkpoint**: «کلاته» from Ctrl+K opens the need with the card highlighted

---

## Phase 4: User Story 2 - دستیار همه داده‌هایم را می‌بیند (Priority: P2)

**Goal**: `search_brain` covers every FR-002 type via the same engine

**Independent Test**: `search_brain({ query: "کلاته", sources: ["need"] })` returns the need with its status and path (quickstart §4)

### Tests for User Story 2

- [X] T015 [P] [US2] Assistant tool check in `agent-test/search-api.mjs`: call the tool through the fake LLM path or directly via `executeReadTool`; new types (task, contact, project, need, partner, service, program, minutes, risk) are found; any-word fallback marks `match: "any"`

### Implementation for User Story 2

- [X] T016 [US2] Replace `BRAIN_SOURCES`/`searchBrain` in `backend/src/agent/tools.js` with `searchAll(…, { palette: false, match: 'all' })` and the any-word retry (research R5); `sources` enum = source types; Jalali `date` label; keep the result shape `{ keywords, count, results }`
- [X] T017 [US2] Update the `search_brain` description in `backend/src/agent/tools.js` and its mention in `backend/src/agent/prompt.js` to list the new types

**Checkpoint**: the assistant answers about a Khadim need's status

---

## Phase 5: User Story 3 - جستجو با نوشتار فارسی واقعی (Priority: P3)

**Goal**: every writing variant finds the same record

**Independent Test**: quickstart §2.4

- [X] T018 [P] [US3] Variant cases (ي/ی، ك/ک، نیم‌فاصله، «می خواهم»، ۱۴۰۵/1405، word order, «کلاته برق» not found) in `backend/test/search.test.js` and against the server in `agent-test/search-api.mjs`
- [X] T019 [US3] Make the JS and SQL normalizers agree on every mapped character (a test that runs `sqlNormalize` through Postgres for each character and compares with `normalizeFa`) in `agent-test/search-api.mjs`

**Checkpoint**: all variants pass on the real server

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T020 [P] Browser test `verify-search.cjs` (scratchpad): Ctrl+K «کلاته» → groups, Enter → page with highlight, «بیشتر», no result, backend down, mobile 390px without horizontal scroll (quickstart §3)
- [X] T021 Performance: 5,000 records for one user, `/search` under 300ms (quickstart §2.8)
- [X] T022 Full gate (constitution V): `tsc`, `eslint`, `vitest` (UTC and `Asia/Tehran`), backend `npm test`, `vite build`, and the earlier real-server suites (storage, members, org, health, embed, db-security)
- [X] T023 Remove the Sync Impact Report comment from `.specify/memory/constitution.md` before committing; commit and push to `claude/vibrant-johnson-3obrre`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)** → user stories
- **US1 (P1)** needs T002–T004; **US2 (P2)** needs T002–T004 only (independent of US1's UI); **US3 (P3)** needs T002 and benefits from T008 for server checks
- **Polish** after the stories it verifies

### Within Each User Story

- Tests written alongside, run before the checkpoint
- Backend route before frontend service; hook before palette; highlight hook before page attributes

### Parallel Opportunities

- T005 with T003/T004 once T002 exists
- T009, T010, T012 in parallel (different files); T013 and T014 in parallel
- US2 (T016–T017) in parallel with US1's frontend (T009–T014)

---

## Parallel Example: User Story 1

```bash
Task: "searchRecords in frontend/src/services/searchService.ts"
Task: "useRecordSearch in frontend/src/hooks/useRecordSearch.ts"
Task: "useHighlight in frontend/src/hooks/useHighlight.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 + Phase 2
2. Phase 3 (US1) → validate with T006/T007 and the browser
3. Then US2, US3, Polish

### Incremental Delivery

Foundation → US1 (search box) → US2 (assistant) → US3 (variants hardening) → Polish; each adds value without breaking the previous one.

---

## Notes

- [P] tasks = different files, no dependencies
- Real-server scripts stay in the scratchpad, as with the earlier suites
- Commit after the full gate (T022), per the constitution

## Phase 7: Convergence

- [X] T024 Add a vitest that renders the Khadim needs, partners and roadmap pages with minimal older items (only `id` and `title`) and expects no crash, in `frontend/src/test/__tests__/pages/KhadimLists.test.tsx` per Constitution V (partial)
- [X] T025 Record `created_at` when a service project, a program or a partner is added, in `frontend/src/pages/organizational/khadim-e-khalgh/{Projects,Roadmap,Partners}.tsx`, so search shows the date recorded per FR-003 (partial)
- [X] T026 Document `frontend/src/lib/persianText.ts` (page matching with the server's normalization, since the palette's own filter is off) and the hardened Khadim list normalizers in `specs/001-unified-search/plan.md` per plan: structure (unrequested)
