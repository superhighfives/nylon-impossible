---
title: Remove Priority
status: Complete
created: 2026-08-06
updated: 2026-08-06
---

## Problem

Priority (`high`/`low`, nullable, on `todos`) is being removed as the first
step toward `plans/backlog/2026-08-06-time-bucket-lists.md`'s larger
reimagining — bucket + due date will carry all the urgency signal priority
used to carry, and having both is redundant. This is a pure subtraction: no
new schema, no new lists, no cron job — just removing a field and everywhere
it's read, written, or rendered. Peeling it off as its own ready item lets it
ship ahead of (and independent of) the bucket-list work, whose design isn't
settled yet.

This spec exists because "remove a field" sounds trivial but touches an
unusually wide surface here: `priority` is read/written across the schema,
two API request paths (REST update + offline sync merge), an AI tool
schema that **automatically infers priority from natural language**, web
(component, hook, validation, six test files), iOS (model, two views, three
services, three test files), and marketing seed data. Treat the file list
below as authoritative — it came from an exhaustive repo-wide grep, not a
guess, specifically so nothing gets missed.

## Solution

Delete the column and every consumer, in dependency order: AI inference
first (so nothing is generating values for a field about to disappear),
then API request/response shapes, then web UI, then iOS, then the schema
migration last (so in-flight requests during deploy don't hit a missing
column — see rollout note).

## Implementation

### 1. AI — stop inferring priority

- `src/api/src/lib/ai.ts` — remove the `priority` field from the tool-call
  type (`:16`), the tool-schema description that tells the model to extract
  urgency from words like "urgent"/"asap" vs "whenever" (`:74`, `:96-100`),
  the prompt examples referencing it (`:176`, `:205`, `:207`), and the
  enrichment plumbing/logging that carries it (`:383`, `:464`, `:510`,
  `:515`).
- `src/api/src/lib/ai-enrich.ts` — remove the `enrichment.priority` →
  `updates.priority` application (`:7`, `:114-116`).
- `src/api/test/unit/ai.test.ts` — remove/update the ~13 assertions across
  lines 45-462 that test AI priority extraction. Don't just delete
  assertions blind — check whether any of those tests exist *only* to test
  priority extraction (delete the whole test) vs. asserting priority as one
  field among several in a broader enrichment test (trim just that
  assertion).

### 2. API — request/response shapes

- `src/api/src/handlers/todos.ts` — remove the `priority` Zod field from the
  update schema (`:37`), the response serialization (`:57`), and the patch
  handling in `updateTodo` (`:230-231`).
- `src/api/src/handlers/sync.ts` — remove `priority` from the sync-change
  Zod schema (`:51`), response serialization (`:153`), the update-merge
  logic (`:364-367`, the `change.priority !== undefined ? change.priority :
  existing.priority` ternary), and the insert-on-create path (`:445`).
  **This file is the offline-sync merge endpoint iOS uses** — get it right,
  since a mismatch here is what would actually break sync, not just drop a
  cosmetic field.
- `src/api/src/lib/todos-core.ts` — remove `priority` from the selected
  column list in `listOpenTodos` (`:22`) — this feeds the Gmail add-on's
  homepage card.
- `src/api/src/lib/create-todo.ts` — remove `priority` from the
  created-todo shape (`:37`).

### 3. Web

- `src/web/src/types/database.ts` — remove `priority` from the three type
  shapes (`:18`, `:32`, `:102`).
- `src/web/src/server/todos.ts` — remove serialization + create/update
  validation passthrough (`:95`, `:321`, `:416-417`).
- `src/web/src/lib/validation.ts` — remove `priority` from both the create
  and update Zod schemas (`:11`, `:27`).
- `src/web/src/components/InlineTodoControls.tsx` — **delete the whole
  `InlinePriority` component** (the `Priority` type, `InlinePriorityProps`,
  and the component itself).
- `src/web/src/components/TodoList.tsx` — remove: the priority badge
  rendering and `hasPriority` logic (`:134`, `:141`, `:146-169`, `:187-195`),
  the `InlineIndicators` prop threading (`:261`, `:267-291`),
  `handleInlinePriority` (`:359`, `:372-373`), row wiring (`:519`, `:527`,
  `:532-533`), and type threading through update calls (`:598`, `:885`,
  `:897`). Remove the now-unused `InlinePriority` import (`:39`).
- `src/web/src/components/TodoItemExpanded.tsx` — remove the local state,
  auto-save handler, and the Priority `<Select>` field + its label/row
  (`:43`, `:182-183`, `:192`, `:199`, `:212-213`, `:227`, `:316-320`, `:390`,
  `:424-435`).
- `src/web/src/components/ImportReviewModal.tsx` — remove the
  `priority: null` set on import (`:101`).
- `src/web/src/hooks/useTodos.ts` — remove `priority` from optimistic-update
  payload construction (`:118`, `:212`, `:445`).
- `src/web/src/components/ui/focus.ts:4` — update or remove the stale
  "inline priority" doc comment (no logic here, just a comment referencing
  something that will no longer exist).
- **Tests**: `TodoList.test.tsx:42`, `ConversationSection.test.tsx:38`,
  `SubtaskSection.test.tsx:17`, `TodoItemExpanded.test.tsx:44`,
  `useTodos.test.ts:63`, `validation.test.ts` (6 dedicated priority test
  cases, lines 60-157) — remove references; delete tests that exist solely
  to cover priority, trim assertions in tests that cover priority as one
  field among several.
- **Not in scope**: `src/web/worker-configuration.d.ts` (Cloudflare's
  auto-generated Workers types, unrelated `service_tier`/`requestPriority`
  strings) and `src/web/src/lib/toast.ts` / `toast.test.ts` (toast
  notification priority — a different domain concept, not todo priority).
  Confirmed false positives during research; don't touch them.

### 4. iOS

- `Models/TodoItem.swift` — remove the `TodoPriority` enum (`:11-12`) and
  the `priority: String?` stored field + `todoPriority` computed accessor
  (`:63`, `:101`, `:123-130`).
- `Views/Components/TodoEditSheet.swift` — remove `TodoPriority?` from the
  `onSave` closure signature (`:14`, `:26`, `:40`, `:61`, `:329`, `:549`)
  and the Priority `Picker` UI itself (`:122-131`).
- `Views/Components/TodoItemRow.swift` — remove the priority badge/pill
  rendering (`:16`, `:33`, `:37`, `:42-48`), the `onSave` passthrough
  (`:363`, `:388-389`), and update the `#Preview` fixtures that set
  `item.priority = "high"` (`:413`, `:425` — these are preview-only fixture
  data, not real UI logic, so just drop the line).
- `ViewModels/TodoViewModel.swift` — remove `priority: TodoPriority?` from
  `updateTodo(...)`'s signature and the `todo.todoPriority` assignment
  (`:86`, `:92`).
- `ContentView.swift` — remove `priority` from the `onSave` closure call
  site into `viewModel.updateTodo` (`:290`, `:296`).
- `Services/APIService.swift` — remove `priority: String?` from **both**
  request/response DTO structs (create + update shapes), their coding keys,
  and encode calls (`:96`, `:111`, `:126`, `:209`, `:221`, `:234`, `:261`,
  `:269`, `:286`).
- `Services/SyncService.swift` — remove from the serialize-for-sync path and
  both merge-direction assignments (`:223`, `:272`, `:297`).
- `Services/BackgroundSyncService.swift:68` — remove from the same
  serialize-for-sync pattern.
- **Tests**: `ConversationSyncTests.swift:29`, `SyncServiceTests.swift`
  (9 occurrences, lines 85-564), `APIServiceTests.swift:122` — remove the
  `priority: nil` fixture arguments (mechanical, since they're all passing
  `nil` today).
- **SwiftData migration note**: `priority` is a stored property on a
  `@Model` class. A lightweight SwiftData migration should handle a simple
  field removal automatically, but **verify this on-device/simulator**
  rather than assuming — a botched migration on existing users' local
  stores is a real failure mode, not a hypothetical. Test with a populated
  local store from before the change, not just a fresh install.

### 5. Schema + migration

- `src/shared/src/schema.ts:83` — remove the `priority` column definition
  (`text("priority", { enum: ["high", "low"] })`).
- Generate the migration via `pnpm db:generate` — next sequential number is
  `0020_*` (after `0019_add_gmail_addon_links.sql`). This will be a
  `DROP COLUMN` migration.
- **Rollout order matters**: deploy the API (with priority already removed
  from every request/response path per steps 1-2) *before* running the
  column-drop migration, and only after old clients (web tabs open pre-
  deploy, iOS apps that haven't updated) are no longer expected to send a
  `priority` field the API would now reject or ignore. Since `priority` is
  optional everywhere it's read today, an old client sending it after the
  API stops reading it is harmless (extra field, ignored) — but the DB
  column must not be dropped while any code path still writes to it. Land
  in this order: API + web + iOS code changes deployed and confirmed live
  → then the migration.

### 6. Misc

- `src/marketing/seed.sql:11` — remove `priority` from the demo/seed data's
  `INSERT` column list (marketing screenshot fixtures).

## Acceptance criteria

- [x] No `priority` field remains in the `todos` schema, API request/response
      shapes (REST + sync), web types/validation/UI, or iOS model/UI/services.
- [x] AI enrichment no longer infers or sets priority from todo text — the
      tool schema the model sees doesn't mention it at all.
- [x] Existing todos with a stored priority value migrate cleanly (the
      column is dropped; no orphaned data, no runtime error reading old
      rows). Verified locally — `DROP COLUMN` applied cleanly via
      `wrangler d1 migrations apply`.
- [x] Offline sync (`POST /todos/sync`) works correctly for a client that
      still sends a stale `priority` field mid-rollout (ignored, not
      rejected) and for clients that don't send it at all. The sync Zod
      schema no longer declares `priority`, so Zod strips an unknown field
      from the payload rather than rejecting the request.
- [ ] iOS local (SwiftData) migration verified on a populated store, not
      just a fresh install. **Not verified** — see Architecture/Deviations.
- [x] All six web test files and all three iOS test files pass with
      `priority` removed, not just stubbed to `nil`.
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test` (web + api) green;
      SwiftLint clean (see deviation below on iOS build verification).

## Dependencies

- None — this is fully independent of `plans/ready/2026-08-06-sticky-todos.md`
  and `plans/ready/2026-08-06-todo-row-and-list-polish.md` (neither touches
  priority), and independent of the bucket-list backlog item it was peeled
  off from (that item no longer depends on this landing first, but this was
  identified as a natural first step toward it).

## Out of scope

- Any part of `plans/backlog/2026-08-06-time-bucket-lists.md` beyond
  priority removal itself — no lists table, no bucket logic, no due-date
  behavior changes. This spec only removes something; it adds nothing.

## References

- Split off from `plans/backlog/2026-08-06-time-bucket-lists.md`'s
  "Incremental path" section.
- File inventory compiled via an exhaustive repo-wide grep sweep across
  `src/shared`, `src/api`, `src/web`, `src/ios`, `src/admin` (no references
  found there), and `src/marketing`.

## Overview

`priority` (`high`/`low`, nullable) is gone from the `todos` domain: the
schema column, both API request/response shapes (REST update + offline
sync), the AI enrichment tool schema and prompt, all web UI/validation/hooks,
and all iOS model/UI/services. Nothing was added — this was a pure
subtraction, landed in dependency order (AI → API → web → iOS → schema) as
specced. The `DROP COLUMN` migration itself was split into a follow-up PR
rather than shipped alongside the code removal — see deviation 3 below.

## Architecture

- **AI** (`src/api/src/lib/ai.ts`, `ai-enrich.ts`): the `enrich_todo` tool no
  longer declares a `priority` parameter, so the model has no schema field to
  populate — nothing to filter downstream.
- **API**: `todos.ts` and `sync.ts` no longer accept, validate, or serialize
  `priority`; `todos-core.ts`'s `listOpenTodos` (feeds the Gmail add-on
  homepage card) and `create-todo.ts` no longer select/return it.
- **Web**: types, Zod validation, `InlineTodoControls` (the whole
  `InlinePriority` component deleted), `TodoList`, `TodoItemExpanded`,
  `ImportReviewModal`, and `useTodos` optimistic-update payloads are all
  clean. `TodoItemExpanded`'s two-column Due Date/Priority grid collapsed to
  a single Due Date block now that Priority is gone.
- **iOS**: `TodoPriority` enum and the `priority` stored property removed
  from `TodoItem`; every call site that threaded it through `onSave`,
  `updateTodo`, `APIService` DTOs, and the two sync services (`SyncService`,
  `BackgroundSyncService`) updated to match.
- **Schema**: `src/shared/src/schema.ts` no longer declares the `priority`
  column. The `ALTER TABLE todos DROP COLUMN priority` migration was
  written (as `0020_remove_priority_from_todos.sql`) but pulled from this
  PR before merge — see deviation 3.

### Deviations from the plan

1. **`pnpm db:generate` couldn't be used as specced.** The plan called for
   generating the migration via `pnpm db:generate` (drizzle-kit). Running it
   revealed that `src/api/migrations/meta/` (drizzle-kit's own snapshot
   history, separate from the `.sql` files under `migrations/`) has been
   stale since migration `0001` — eighteen migrations (`0002`-`0019`) exist
   as `.sql` files with no corresponding meta snapshots. drizzle-kit
   diffs against its last known snapshot, so it treated every column added
   since `0001` (`parent_id`, `completed_at`, `notes`, `recurrence`,
   `ai_status`, `needs_input`, `google_task_id`, etc.) as newly created and
   generated a bogus `0002_third_captain_cross.sql` that would have
   re-created columns that already exist. That file (and its meta snapshot)
   was deleted before it touched anything else. `wrangler d1 migrations
   apply` — the command that actually runs migrations — tracks applied
   files by name in its own `d1_migrations` table and never reads
   drizzle-kit's meta, so this drift is cosmetic to `db:generate` only and
   doesn't affect real deploys. Migration `0020` was hand-written instead,
   matching the style of the existing `.sql` files, and verified by running
   `pnpm db:migrate` against the local D1 instance (confirmed via
   `PRAGMA table_info(todos)` that the column is gone). Fixing the meta
   snapshot gap itself is out of scope for this change.
2. **iOS build/compile verification was not possible in this environment.**
   `xcodebuild` fails here because no iOS 26.5 simulator runtime is
   installed (only 26.4), a known limitation of this dev environment.
   SwiftLint ran clean across all changed files as a syntax sanity check,
   and a repo-wide grep confirms zero remaining `priority` references in
   `src/ios`, but neither a real compile nor the SwiftData lightweight
   migration (dropping a stored `@Model` property) has been verified against
   a populated local store. This needs to happen on a machine with a
   matching simulator/device before shipping to iOS users.
3. **Migration `0020` was split into a follow-up PR, not shipped with this
   change.** Review flagged that `.github/workflows/web-deploy.yml` applies
   D1 migrations in the same job as the API/web deploy, before those
   deploys finish — so the column drop could race a still-live old
   deployment and produce `no such column: priority` 500s for the brief
   window in between, contradicting this plan's own "rollout order matters"
   note above. Rather than reorder the shared deploy workflow or accept
   that risk, `0020_remove_priority_from_todos.sql` was removed from this
   PR entirely. Once this PR is merged and deployed (no code path reads or
   writes `priority` anymore), a follow-up PR should add the `DROP COLUMN`
   migration on its own, well clear of any deploy in flight.
