---
title: Time-Bucket Lists (Today / This Week / Sometime + custom lists)
status: Ready
created: 2026-08-06
updated: 2026-08-10
---

## Problem

Nylon today is one flat list per user, sorted by position with due date as
the only real urgency signal (priority was already removed —
`plans/done/2026-08-06-remove-priority.md`). That asks the user to hold "how
urgent is this, really?" in their head for every item, forever.

The reimagining: **time itself becomes the primary organizing structure.**
Three built-in lists — **Today**, **This Week**, **Sometime** — plus an
unlimited number of user-named custom lists. Todos in the three built-in
lists **age out automatically**: something in Today that isn't finished
falls back to This Week after a day; something in This Week that isn't
finished falls back to Sometime after a week, where it stays until manually
promoted. Custom lists don't age — they're flat, permanent containers for
open-ended collections (a movie list, a book list) that were never about
urgency.

## Solution

### Due date is fully independent of list membership — settled, not derived

This was the single biggest open question in the backlog item, resolved in
full during scoping:

- A todo's due date and its list are **two completely unrelated fields**,
  everywhere, always. Today does **not** force-set, imply, or read a due
  date. A Today item can have no due date, or one three weeks out — you're
  just saying "I want to work this today," not "this is due today."
- Buckets **only ever move backward** via the scheduled aging sweep
  (Today → This Week → Sometime). Reaching a due date **never** auto-promotes
  an item forward into Today — the user has to notice and drag it, or it
  simply sits with an overdue-looking due-date badge whatever list it's in.
- Falling out of a list does **not** clear the due date. It's independent
  metadata; demotion only changes `listId`, nothing else. (This reverses the
  backlog item's original "due date gets removed on demotion" idea — dropped
  once due date and bucket were established as fully independent.)

### An existing `lists`/`todo_lists` schema is dead weight — repurpose it

`src/shared/src/schema.ts:186-228` already defines a `lists` table and a
`todo_lists` many-to-many join table, seeded with four hardcoded rows
(`TODO`, `Shopping`, `Bills`, `Work`) the one time a new user is first
created (`src/api/src/handlers/sync.ts:238-286`, specifically the
`DEFAULT_LISTS` seed at `:261-272`). Tracing every reference: `todoLists`
(the join table) is **never inserted into, selected from, or joined
anywhere** in the API, web, or iOS code — it's pure dead weight, seeded and
ignored.

Rather than add a second, competing "lists" concept, this plan **repurposes
the existing `lists` table** and **drops `todo_lists` entirely**, replacing
the many-to-many join with a plain `todos.listId` foreign key (a todo
belongs to exactly one list — never many, which is what this feature
actually needs). This avoids shipping two lists tables and a second
migration cycle later.

### Grid on web, paged-swipe on iOS

Web keeps the wireframe's grid: all lists visible side by side (Today, This
Week, Sometime, then custom lists in position order), scrolling
horizontally. iOS v1 is paged-swipe only — one list fills the screen, swiping
left/right pages between lists in the same order. No iOS grid view for v1
(already settled in the original backlog item).

## Settled design decisions (recap)

- **New todo defaults**: the `n` keyboard shortcut (new — no global shortcut
  exists in the web app today) always creates into Today. Each column gets a
  hover-revealed "+ New Todo" affordance (always visible on mobile/narrow
  viewports) that creates directly into that column. Smart-create
  (`createSmartTodo`) is being retired in favor of AI enrichment — **out of
  scope for this plan**, don't touch `src/api/src/lib/create-todo.ts`'s
  smart-create path. The Gmail add-on's homepage card defaults new todos into
  Today only, for now.
- **Recurring todos**: every recurring todo already has a due date (no
  due-date-less recurrence exists), so the next occurrence's initial list is
  chosen once, at creation, from that due date: due today or tomorrow →
  Today; due within the next 7 days → This Week; further out → Sometime.
  After that it ages normally like any manually-placed todo — this doesn't
  reintroduce due-date coupling, it's just the placement heuristic for a new
  occurrence (the same category of decision as "what list does any new todo
  land in," specialized for recurrence).
- **Aging sweep timing**: triggered at calendar midnight in the **account's
  timezone** — not UTC, not a rolling 24h/7d window from item-entry. This
  requires a new persisted per-user `timezone` field (confirmed not to exist
  today — see Implementation §1) and a settings control to change it.
- **Migration of existing data**: every existing todo gets `listId` = the
  user's Sometime list. No due-date-based placement heuristic at migration
  time (single-user product today, so "safest and simplest" wins).
- **Custom lists**: unlimited, user-named, rename/delete/reorder all
  supported. Deleting a custom list **cascade-deletes its todos**, gated by a
  confirmation warning in the UI (destructive, not currently reversible).
- **Subtasks**: implicitly scoped to their parent's list — no independent
  list membership, matching how they're already scoped to their parent for
  position (`idx_todos_user_parent_position`).
- **List ordering**: Today, This Week, Sometime are always fixed first, in
  that order, on both web and iOS. Custom lists follow, user-orderable among
  themselves via position — but never interleaved before/between the three
  built-in lists.
- **Sticky todos are unaffected** — sticky is a per-list positional tier,
  already shipped (`plans/done/2026-08-06-sticky-todos.md`), orthogonal to
  which list a todo is in.
- **Search/filter**: no such feature exists in the codebase today (confirmed
  by repo-wide search) — stays out of scope.
- **Wireframe details**: the "Name of Resource" chips map to the existing
  `UrlPreviewCard`/`EmailPreviewCard` components (already built, nothing new
  needed). The sad-face icon on completed items in the wireframe was
  placeholder noise, not a real requirement — ignore it.

## Implementation

### 1. Schema + migration

`src/shared/src/schema.ts`:

- **Repurpose `lists`** (`:186-207`): add `kind: text("kind", { enum:
  ["system", "custom"] }).notNull().default("custom")` and `systemKind:
  text("system_kind", { enum: ["today", "thisWeek", "sometime"] })`
  (nullable — null for custom lists). Update the table comment (currently
  "Lists table (hardcoded defaults: TODO, Shopping, Bills, Work)" — no longer
  true). Add a unique index scoping `systemKind` per user so a user can't end
  up with two "today" lists:
  `uniqueIndex("idx_lists_user_system_kind").on(table.userId,
  table.systemKind)` (SQLite treats multiple `NULL`s as distinct, so custom
  lists with `systemKind = null` never collide with each other — same
  pattern already used for `idx_todos_user_google_task`).
- **Drop `todoLists`** (`:210-228`) entirely — table, relations
  (`:405-417`), and type exports (`TodoList`/`NewTodoList` at `:448-449`).
- **Add `todos.listId`** (`:67-137`): `listId: text("list_id").notNull()
  .references(() => lists.id, { onDelete: "cascade" })`. Add an index:
  `index("idx_todos_user_list_position").on(table.userId, table.listId,
  table.position)` as the list-scoped equivalent of the existing
  `idx_todos_user_parent_position` pattern — this is the index the drag
  reorder and per-list fetch will actually use.
- **Add `users.timezone`**: `timezone: text("timezone").notNull()
  .default("UTC")` (IANA identifier, e.g. `"America/New_York"`) on the
  `users` table (`:33-64`). No persisted timezone exists anywhere today —
  the `timeZone` value read via `useHints()`
  (`src/web/src/hooks/useHints.tsx:10-14`, consumed in
  `TodoList.tsx:154,322,829`, `InlineTodoControls.tsx:186`,
  `TodoItemExpanded.tsx:168`, `ImportReviewModal.tsx:23`) is a per-request
  browser-derived cookie value (`@epic-web/client-hints`), not something a
  server Cron Trigger can read. This is genuinely new persisted state.
- Update `usersRelations` (`:360-363`, drop `lists: many(lists)` → keep, it's
  still valid one-to-many) and `listsRelations`/`todosRelations`
  (`:365-381`, `:400-406`) to match the new shape (drop `todoLists`, keep
  `todos: many(todos)` on the `lists` side as a new relation since it's now
  a direct FK).
- Generate the migration by hand (per this repo's established pattern —
  `pnpm db:generate` needs a TTY for interactive prompts and drizzle-kit's
  `meta/` snapshot history has been stale since migration `0001`; see the
  sticky-todos plan's deviation note). Next sequential number after the most
  recent migration in `src/api/migrations/`. This migration:
  1. `ALTER TABLE lists ADD COLUMN kind ...`, `ADD COLUMN system_kind ...`.
  2. `ALTER TABLE todos ADD COLUMN list_id ...` — **cannot be `NOT NULL`
     in the same statement** since existing rows have no value yet; add
     nullable first, backfill, then a follow-up `ALTER` to enforce
     `NOT NULL` (SQLite's `ALTER TABLE` can't add a `NOT NULL` column
     without a default to an existing table with rows in one step the way
     Drizzle's schema declares it — match whatever pattern
     `0022_add_sticky_to_todos.sql` used for a `NOT NULL DEFAULT` boolean
     column, but `listId` has no static default since it must point at a
     real per-user row).
  3. For every existing user: insert three system list rows (Today, This
     Week, Sometime, `kind = 'system'`), then `UPDATE todos SET list_id =
     (that user's Sometime list id) WHERE user_id = ...`.
  4. `ALTER TABLE users ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC'`.
  5. Drop `todo_lists`.
  Verify against a local D1 instance with `pnpm db:migrate` before treating
  it as done, per this repo's standing practice.

### 2. Cloudflare Cron Trigger — aging sweep

This is the **first** Cron Trigger in this codebase — `src/api/wrangler.jsonc`
has no `triggers`/`crons` block today, and `src/api/src/index.ts:179-207`'s
exported `handler` only implements `fetch` and `queue`. Add a `scheduled`
handler alongside them:

- `src/api/wrangler.jsonc` — add a `triggers.crons` array. Run **hourly**
  (`"0 * * * *"`), not daily — the sweep has to check, for each user
  independently, whether it's currently local midnight in *that user's*
  timezone, so it needs to run often enough to catch every timezone's
  midnight within an hour, not once globally.
- `src/api/src/index.ts` — add `async scheduled(event, env, ctx)` to the
  `handler` object (`:179-207`), following the existing `queue` handler's
  error-reporting shape (try/catch around the real work, `Sentry
  .captureException` with `tags: { area: "cron-list-sweep" }` on failure,
  matching `:197-201`'s pattern).
- New file, e.g. `src/api/src/lib/list-sweep.ts`: for each user, compute
  whether "local midnight" has just occurred for their `timezone` (compare
  current UTC time against the last time this sweep ran for that user — an
  hourly sweep means checking "did local midnight fall within the last
  hour," using `Intl.DateTimeFormat` with the user's IANA timezone rather
  than hand-rolled offset math). For every user whose local midnight just
  passed:
  - `UPDATE todos SET list_id = <that user's This Week list> WHERE user_id =
    ? AND list_id = <Today list> AND completed = false` (items completed
    today don't get swept — no reason to move a done item).
  - Separately, for the weekly rule: track "how long has this todo been in
    This Week" — since `listId` alone doesn't carry an entry timestamp, add
    a `listEnteredAt: integer("list_entered_at", { mode: "timestamp"
    }).notNull().default(sql\`(unixepoch())\`)` column to `todos` (set
    whenever `listId` changes, by any path — manual drag, sweep, or
    creation) so the sweep can select `WHERE list_id = <This Week> AND
    list_entered_at <= <7 days ago> AND completed = false` and demote those
    into Sometime. This column needs the same manual-migration + backfill
    treatment as `listId` itself (§1) — backfill to `updatedAt` or `now()`
    for existing rows at migration time, whichever reads more sensibly for
    the single-user migration case.
  - Sometime is terminal — no further sweep rule.
- Every code path that changes `todos.listId` (manual drag, the sweep
  itself, creation) must also stamp `listEnteredAt = now()` — this needs to
  be threaded through the same places as `listId` itself in §3/§4/§5 below,
  not just the sweep.

### 3. API

- `src/api/src/handlers/todos.ts`:
  - `createTodoSchema` (`:24-27`) — add `listId: z.string().uuid().optional()`.
  - `updateTodoSchema` (`:29-41`) — add `listId: z.string().uuid().optional()`.
  - `serializeTodo` (`:44-60`) — add `listId` to the output.
  - `listTodos` (`:83-121`) — currently a flat per-user query; `listId` rides
    along automatically as a plain column once selected. Decide whether the
    web/iOS grid fetches all lists in one call (simplest — client groups by
    `listId`) or per-column via `?listId=` — **recommend one call**, since
    the grid needs every list visible at once anyway and per-column fetching
    would mean N round trips on load.
  - `createTodo` (`:154-187`) — accept/default `listId` (falls back to the
    caller's Today list if omitted, matching the "always Today" default for
    the `n` shortcut and Gmail add-on).
  - New handlers: `GET /lists`, `POST /lists` (custom only — reject `kind:
    "system"` from client input with a new `API_ERRORS` code, e.g.
    `system_list_immutable`, following the existing code/status/message
    shape at `src/api/src/lib/errors.ts:11-53`), `PATCH /lists/:id` (rename,
    reposition — reject on system lists), `DELETE /lists/:id` (reject on
    system lists; cascade-deletes todos via the FK's `onDelete: "cascade"`,
    but the **API must still return enough info for the client to show the
    "this will delete N todos" warning before the client even issues the
    delete** — e.g. `GET /lists/:id` or the delete confirmation flow needs a
    todo count).
- `src/api/src/lib/todos-core.ts`:
  - `UpdateTodoPatch` (`:28-40`) — add `listId?: string`.
  - `listOpenTodos` (`:48-65`, feeds the Gmail add-on) — filter to the user's
    Today list specifically (`WHERE list_id = <today's list id>`), per the
    settled "Gmail add-on defaults to Today only for now" scope.
  - `setTodoCompleted` (`:78-157`) and `updateTodoCore` (`:176-323`) — thread
    `listId` through both, same shape as `sticky` was threaded
    (`:39`, `:202`, `:249-251`). Both need the `listEnteredAt` stamp from §2
    whenever `listId` changes.
- `src/api/src/handlers/sync.ts` — **the offline-sync endpoint iOS actually
  talks to; both priority-removal and sticky-todos needed changes here too,
  don't skip it**:
  - Replace `DEFAULT_LISTS` (`:33`) and the seeding block (`:261-272`) with
    the three system lists (Today/This Week/Sometime, `kind: "system"`,
    correct `systemKind`) — this is the natural, single place new-user list
    provisioning already happens (confirmed via repo-wide grep: `sync.ts`'s
    `insert(users)` at `:254` is the **only** place a user row is ever
    created — no separate Clerk webhook or web-side provisioning path
    exists).
  - `syncRequestSchema` (`:40+`, change-object fields including `sticky` at
    `:60`) — add `listId: z.string().uuid().optional()`.
  - `serializeTodo` (`:153+`, `sticky` at `:173`) — add `listId`.
  - Update-merge branch (`:373-387` region) and insert-on-create branch
    (`:466` region, `sticky: change.sticky ?? false`) — thread `listId`
    (default to the user's Today list on create if the client omits it) and
    `listEnteredAt`.
- `src/api/src/lib/create-todo.ts` — confirm which creation path is actually
  live for plain (non-smart) creates (`todos.ts:154-187` vs. this file's
  `serializeCreatedTodo`); `createSmartTodo` is explicitly **out of scope**
  (being retired) — don't add `listId` handling there.
- `src/api/src/handlers/import-google-tasks.ts` — `TODO_INSERT_COLUMNS`
  (currently `13`, `:31`) becomes `14` with `listId` (and `15` if
  `listEnteredAt` is also a bound param on every insert — check whether
  Drizzle binds a param for a column with a SQL-level default the way it
  already does for `sticky`/`needsInput`, per this repo's known D1
  bound-param gotcha — see memory `d1-drizzle-bound-param-cap.md`).
  Recompute `INSERT_CHUNK_SIZE = Math.floor(100 / TODO_INSERT_COLUMNS)` and
  verify against the existing "imports more tasks than fit in one D1 insert
  chunk" test, which will catch a wrong chunk size the same way it caught
  sticky's. Imported tasks default to the Sometime list.
- Gmail add-on: `src/api/src/handlers/gmail-addon/homepage.ts` and
  `actions.ts` both consume `listOpenTodos` — no code change needed beyond
  §`todos-core.ts` filtering to Today, but worth a read-through to confirm
  neither hardcodes an assumption about "all open todos" that the Today
  filter would break.

### 4. Web

- `src/web/src/types/database.ts` — add `listId: string` to the todo type(s)
  (`TodoWithUrls` and the create/update input shapes, `:23-41`,
  `:112-125+`). Add a `List` type (`id`, `userId`, `name`, `kind`,
  `systemKind`, `position`, timestamps).
- `src/web/src/lib/validation.ts` — add `listId` to `createTodoSchema`
  (`:7-11`) and `updateTodoSchema` (`:20-30`).
- `src/web/src/server/todos.ts` — this is one of **two parallel
  implementations** found (the other is the Worker REST API in
  `src/api/src/handlers/todos.ts`); confirm which one the deployed web app
  actually calls at runtime (TanStack Start server functions talking to D1
  directly, vs. the separate Worker) before assuming a change to one covers
  both — both currently serialize `sticky` independently (`:128` here vs.
  `todos.ts:56`) and both will need `listId` added in parallel. Add list
  CRUD server functions here (or confirm they belong in the Worker API
  instead) matching whichever pattern `getTodos`/`createTodo`/`updateTodo`/
  `deleteTodo` (`:108-624`) already establish.
- `src/web/src/hooks/useTodos.ts` — thread `listId` through optimistic-update
  construction (`:122`, `:220`, `:511`, where `sticky` defaults/passthrough
  already happen), plus a new list-CRUD hook (`useLists` or similar) with
  its own optimistic create/rename/reorder/delete.
- **`TodoList.tsx` restructure** — today this is a single `export function
  TodoList()` (`:821`) rendering one flat list. The grid means:
  - A new outer component (e.g. `TodoGrid` or `TodoBoard`) that fetches all
    lists + all todos once, groups todos by `listId`, and renders one
    `TodoList` instance per list side by side (horizontal scroll container),
    ending in a "+ New List" affordance.
  - `TodoList` itself becomes a per-list component — its internal
    `sortedTodos` (`:980-997`) and `handleDragEnd` (`:1035-1075`) already
    scope drag/reorder to a `sticky`-tier filter within one array; add
    `listId` scoping the same way, or better, follow the **subtask
    precedent** the research surfaced: `SubtaskSection.tsx` never filters by
    `parentId` inline because it only ever receives one parent's already-
    scoped array as a prop. Prefer fetching/passing todos pre-scoped to one
    `listId` into each `TodoList` instance over inline-filtering a combined
    array — cleaner and matches the existing subtask pattern instead of
    extending the sticky-tier inline-filter pattern to a second dimension.
  - Drag-and-drop **between** columns (not just within one) needs a new
    cross-list drop handler — `dnd-kit`'s `DndContext` needs to span the
    whole grid (all columns under one context, not one per column) so a
    dragged item can be dropped into a different list's `SortableContext`,
    updating both `listId` and `position` (via `generateKeyBetween` against
    the *target* list's items) in one mutation.
  - Per-column "+ New Todo" affordance: hover-reveal on desktop (likely a
    `group-hover` Tailwind pattern near the column header), always visible
    below `md`/mobile breakpoint.
- **New global `n` keyboard shortcut** — none exists in the codebase today
  (confirmed by repo-wide search; only scoped Enter-to-submit handling exists
  in `TodoInput.tsx`/`SubtaskSection.tsx`). Needs a new `keydown` listener
  (window-level, guarding against firing while focus is inside any input/
  textarea/contenteditable) that creates into the Today list and focuses it.
- **New list-CRUD UI**: rename (inline edit, likely following whatever
  pattern the todo title inline-edit already uses), delete (confirmation
  modal — reuse `SettingsModal.tsx`'s existing delete-account confirmation
  pattern at `:92` for tone/shape, showing the todo count that will be
  cascade-deleted), reorder (drag the column headers themselves, scoped so
  the three system lists can't be dragged out of their fixed first-three
  position), "+ New List" (name input, appends to the end of the custom-list
  order).
- **Settings — timezone picker**: `SettingsModal.tsx` is the existing
  settings surface (already handles account-level toggles); add a timezone
  `<Select>` there, defaulting to the browser's detected `Intl` timezone on
  first visit if the stored value is still `"UTC"` (the migration default),
  writing through to the new `users.timezone` field.

### 5. iOS

No `List`/`TodoList` SwiftData model exists today — this is new modeling
work, not a threading exercise like `sticky` was.

- `Models/TodoItem.swift` — add `listId: UUID?` (or the appropriate FK type
  matching however `TodoItem`'s `id` is typed) alongside existing stored
  properties (`:33-80+`).
- New `Models/TodoListModel.swift` (name TBD to avoid clashing with Swift's
  `List` view type) — `@Model final class TodoListModel { id, userId, name,
  kind, systemKind, position, ... }`, mirroring the schema.
- `ViewModels/TodoViewModel.swift` — `sortedTodos` (`:20-46`) needs list
  scoping alongside the existing sticky-first comparator (`:36-37`);
  `addTodo` (`:47`), `moveTodo`/`moveSubtask` (`:69`, `:204`), `updateTodo`
  (`:93-108`, where `sticky: Bool` already threads through as a param at
  `:99` — `listId` follows the same shape), `toggleTodo` (`:109`). New
  methods for fetching/switching the active list (paged navigation) and for
  list CRUD.
- `ContentView.swift` — currently the single-list navigation surface; needs
  restructuring into paged-swipe navigation across lists (Today → This Week
  → Sometime → custom lists in order) — likely a `TabView` with
  `.tabViewStyle(.page)` or an equivalent swipeable-page container, no
  existing precedent in this codebase for multi-list navigation to reuse.
- `Services/APIService.swift` / `Services/SyncService.swift` — same DTO/merge
  threading shape as `sticky` and `priority` both needed (`APITodo`/
  `TodoChange` structs, both `SyncService` merge directions,
  `BackgroundSyncService`'s serialize path), plus new request/response DTOs
  and sync handling for the `lists` entity itself (fetch, create, rename,
  reorder, delete) — genuinely new surface, not just a field addition.
- `TodoEditSheet.swift` / `TodoItemRow.swift` — a list picker/indicator if
  the edit sheet should show/allow changing which list a todo belongs to
  (needed at minimum for manual cross-list moves on iOS, since there's no
  drag-and-drop grid to move between columns the way web has).
- As with the priority and sticky-todos plans: **iOS changes should be
  written by inspection and cross-referenced for call-site consistency**,
  not compiled — `xcodebuild` fails in this dev environment (iOS 26.5 SDK
  not installed, only 26.4; see memory `ios-build-env-limitation.md`).
  SwiftLint and a repo-wide grep for consistency are the available
  verification tools here; a real compile and SwiftData migration check
  (new model + new stored property, same caution as the priority-removal
  plan flagged) must happen on a machine with a matching simulator before
  shipping to iOS users.

### 6. Admin / marketing seed

- `src/admin` — no lists-specific surface exists (`src/admin/src/api.ts:3-24`
  tracks aggregate `todoCount` only). No required change unless per-list
  breakdowns in the admin user-detail view are wanted — not indicated by
  anything settled here, treat as out of scope unless requested later.
- `src/marketing/seed.sql:11-24` — the `INSERT INTO todos (...)` column list
  has no `list_id` today. Once `todos.listId` is `NOT NULL`, this breaks.
  Fix (mirroring how the priority-removal plan handled the same file, in
  reverse — adding a column to the insert list instead of removing one):
  insert the marketing seed user's three system lists first, then add
  `list_id` to each of the four seeded todo rows (probably split across
  Today/This Week/Sometime for a realistic-looking demo screenshot, rather
  than dumping all four into one list).

## Acceptance criteria

- [ ] `lists` table repurposed with `kind`/`systemKind`; `todoLists` join
      table dropped; `todos.listId` FK added and backfilled for all existing
      users (all landing in Sometime).
- [ ] `users.timezone` persisted, defaults to `UTC`, settable from a new
      Settings control.
- [ ] An hourly Cron Trigger correctly demotes Today → This Week after one
      full local day and This Week → Sometime after one full local week, per
      account timezone, without touching completed todos or Sometime items.
- [ ] Due date is never read, written, or cleared by any bucket-membership
      change (creation into Today, manual drag, or the sweep) — verified by
      inspection across every `listId`-writing code path in §3/§4/§5.
- [ ] Reaching a due date never auto-moves a todo into a different list.
- [ ] Web renders the full grid (Today, This Week, Sometime, then custom
      lists in position order) with drag-and-drop both within and between
      columns, a "+ New Todo" per column, and "+ New List" at the end.
- [ ] `n` creates a new todo into Today from anywhere in the web app (when
      focus isn't inside a text field).
- [ ] Custom lists support rename, delete (cascade + confirmation warning
      showing the todo count), and reorder among themselves; the three
      system lists can't be renamed, deleted, or reordered out of their
      fixed first-three position.
- [ ] Subtasks have no independent list membership — always implicitly in
      their parent's list, on both platforms.
- [ ] Recurring todos land their new occurrence in Today/This
      Week/Sometime based on the new due date's distance, per the settled
      heuristic, then age normally afterward.
- [ ] iOS pages between lists via swipe, in the same fixed-then-custom
      order as web; no grid/multi-column iOS view in v1.
- [ ] Offline sync (`POST /todos/sync`) round-trips `listId` correctly for
      create, update, and the system-list seeding path — verified as
      carefully as sticky-todos' sync threading was, since this is the same
      endpoint iOS actually uses.
- [ ] `import-google-tasks.ts`'s D1 bound-param chunk size is recomputed and
      verified against the existing chunking test, not just assumed
      unchanged.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` (web + api) green. iOS
      verified by SwiftLint + inspection only, with an explicit note (like
      the priority and sticky-todos plans) that a real compile and SwiftData
      migration check on a populated store are still needed before shipping.

## Dependencies

- Builds on `plans/done/2026-08-06-remove-priority.md` (priority already
  fully removed — no interaction, just confirms the domain model this plan
  extends is clean).
- Builds on `plans/done/2026-08-06-sticky-todos.md` — sticky is a per-list
  positional tier, confirmed orthogonal; no changes needed to sticky logic
  itself beyond scoping its existing tier-filter to also respect `listId`.
- `plans/done/2026-08-06-todo-row-and-list-polish.md` — the row's own shape
  is unaffected; only its container changes (one list → many).
- Repurposes the existing (currently dead) `lists`/`todo_lists` schema
  instead of introducing a second lists concept — see Solution section.

## Out of scope

- Removing or redesigning recurrence — considered and rejected; the due-
  date-distance placement heuristic (§ Settled design decisions) resolves
  the original concern without removing the feature.
- Smart-create (`createSmartTodo`) — being retired in favor of AI enrichment
  as a separate, later effort. Don't add `listId` handling to it.
- Search/filtering across lists — no such feature exists today; not part of
  this plan.
- Any cross-device "sticky todos" or list summary/count surface beyond what
  already exists.
- iOS grid/multi-column list view — paged-swipe only for v1, per the
  original backlog item.
- Admin per-list breakdowns.

## References

- Original backlog item: this file's prior revision at
  `plans/backlog/2026-08-06-time-bucket-lists.md` (moved here).
- Wireframe supplied 2026-08-06 (grid of columns: Today, This Week,
  Sometime, custom lists, `+ New List`).
- `plans/done/2026-08-06-remove-priority.md`, `plans/done/2026-08-06-sticky-todos.md`,
  `plans/done/2026-08-06-todo-row-and-list-polish.md` — precedent plans this
  one builds on and follows for implementation style (exhaustive file/line
  inventories from real greps, not guesses).
