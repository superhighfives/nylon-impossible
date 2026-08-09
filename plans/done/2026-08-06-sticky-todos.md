---
title: Sticky Todos
status: Complete
created: 2026-08-06
updated: 2026-08-08
---

## Problem

Some todos deserve to stay visible at the top of the list regardless of due
date or manual ordering — a running "current focus" item, something you keep
glancing at. Today the only way to keep a todo near the top is manual drag
reordering, which gets undone the moment anything else is reordered or a new
todo lands above it (new top-level creates and quick-add both insert at the
top per `plans/done/2026-07-17-pre-launch-polish.md`).

Add a **sticky** flag: sticky todos always render above non-sticky todos,
and are reorderable only amongst themselves (dragging a sticky todo can't
land it below a non-sticky one, and vice versa). Toggle it from a small icon
button in the row's action cluster (the same row item 1 of
`plans/ready/2026-08-06-todo-row-and-list-polish.md` adds a delete icon to)
and as an explicit option in the expanded/edit view, on both web and iOS.

## Solution

A new `sticky` boolean column on `todos`, threaded through the same
schema → API-patch → web-type → UI path the existing `needsInput` flag
already establishes as a clean precedent. Sorting gains a sticky-first tier
ahead of the existing incomplete/complete split, on both the web client
comparator and iOS's `sortedTodos`. Position stays a single fractional-index
space per user (no separate position column for sticky todos) — reordering
just gets scoped so a drag only considers same-tier neighbors when computing
the new key, the same way top-level and subtask position spaces are already
implicitly separate today.

### Why scope position math instead of a second position field

`position` (text, fractional-indexing key, `idx_todos_user_position` /
`idx_todos_user_parent_position`) already coexists across subtask groups
using one column — `SubtaskSection`/`createTodo` scope neighbor lookups to
`parentId` when computing `generateKeyBetween`. Sticky/non-sticky is the same
shape of problem (todos share one flat position space, groupable by a
boolean instead of `parentId`), so reuse the pattern rather than adding
`stickyPosition`. Keeps the schema smaller and the drag-and-drop code path
identical apart from which neighbor set it reads.

## Implementation

### 1. Schema + migration

- `src/shared/src/schema.ts` — add `sticky: integer("sticky", { mode: "boolean" }).notNull().default(false)`
  to the `todos` table (matching `needsInput`'s definition style at
  `schema.ts:97-99`).
- Generate the migration via `pnpm db:generate` (next sequential number
  after `0019_add_gmail_addon_links.sql`).

### 2. API

- `src/api/src/handlers/todos.ts` — `updateTodo`'s patch object gains
  `sticky?: boolean` (same handling as `priority`/`needsInput` today — no
  new endpoint, it's an ordinary field update through `PATCH /todos/:id`,
  going through `apiError`/`API_ERRORS` for any validation failure per this
  repo's error convention).
- `createTodo` / `createSmartTodo` (`src/api/src/lib/create-todo.ts`): no
  new param needed — todos are created non-sticky by default; sticky is
  toggled after creation.
- **Completing a sticky todo clears `sticky` back to `false`.** Mirror the
  existing `needsInput`-clear-on-complete precedent
  (`handlers/todos.ts:274-275`, `if (completingRow && existing.needsInput)
  updates.needsInput = false`) with an equivalent `if (completingRow &&
  existing.sticky) updates.sticky = false` alongside it. `setTodoCompleted`
  (`src/api/src/lib/todos-core.ts`, used by the Gmail add-on's toggle action)
  needs the same clear so completing a sticky todo from the Gmail panel
  un-sticks it too, not just the REST path.
- **Sort order**: `listTodos` (`src/api/src/handlers/todos.ts:85-93`)
  currently orders by `createdAt` and leaves position sorting to the client
  — leave that as-is; this is a client-side sort concern (item 3 below),
  matching the existing division of responsibility. `listOpenTodos`
  (`src/api/src/lib/todos-core.ts:15-33`, used by the Gmail add-on's
  homepage card) orders by `position` directly — add `sticky` as the primary
  `ORDER BY` column there (`orderBy(desc(todos.sticky), asc(todos.position))`)
  so the Gmail panel's list reflects sticky-first too.
- **Deviation from plan**: `src/api/src/handlers/sync.ts` (`POST
  /todos/sync`, the offline-sync endpoint iOS's `SyncService` actually talks
  to) wasn't listed above but needs the same threading as any other
  client-writable field (`completed`, `dueDate`, `notes`) — unlike
  `needsInput` (server-only), `sticky` is user-toggled from iOS too, so it
  must round-trip through sync or an offline sticky toggle would never
  persist. Added `sticky` to `syncRequestSchema`, the update-merge branch
  (with the same completing-clears-sticky rule as the REST path), the
  insert-on-create branch, and `serializeTodo`.
- **Deviation from plan**: `src/api/src/handlers/import-google-tasks.ts`'s
  `TODO_INSERT_COLUMNS` bound-param accounting (D1's 100-param cap; see
  `plans/done/*` notes on this) needed bumping from 12 to 13 — `sticky` is
  another NOT NULL defaulted column Drizzle binds on every insert row even
  though the import path never sets it explicitly, same as `needsInput`.
  `INSERT_CHUNK_SIZE` dropped from 8 to 7 rows per statement. Caught by the
  existing `imports more tasks than fit in one D1 insert chunk` test failing
  with a D1 param-overflow 500 after adding the column.
- **Deviation from plan (iOS)**: `SyncService.swift`'s two merge points
  handle `sticky` differently from the plan's literal
  `local.sticky = remote.sticky ?? false` (which mirrors `needsInput`'s
  unconditional, server-always-wins overwrite). `needsInput` is
  server/AI-only — the client never sets it directly — so overwriting it
  unconditionally on every sync is safe. `sticky` is user-toggled from the
  client (like `title`/`completed`/`dueDate`), so it needed the same
  last-write-wins resolution as those fields: it's set inside the
  `if remote.updatedAt > local.updatedAt` block (existing-todo merge) rather
  than unconditionally, so a newer unsynced local toggle isn't clobbered by
  a stale remote value. The create-new-todo branch (`todo.sticky = remote.sticky
  ?? false`) matches the plan as written since there's no local state to
  protect there. Also threaded `sticky` through `TodoChange`/`APITodo`
  (`APIService.swift`) and the outbound `gatherLocalChanges`/
  `BackgroundSyncService.sync` serialize paths, which the plan's line
  references implied but didn't spell out as separate edits.
- **Deviation from plan (iOS UI)**: the pin toggle button
  (`TodoItemRow.swift`) was placed as a sibling in the row's outer `HStack`
  rather than inside `indicatorBadges` — `indicatorBadges` renders inside the
  same `Button` that opens the edit sheet on tap, and SwiftUI doesn't
  reliably route taps to a nested interactive `Button` inside another
  `Button`'s label. Placing it as a sibling (like the checkbox) avoids that
  and keeps it independently tappable.

### 3. Web — types, sort, drag reorder

- `src/web/src/types/database.ts` — add `sticky: boolean` alongside
  `needsInput` (line ~105).
- `src/web/src/server/todos.ts` — serialize `sticky: todo.sticky` alongside
  the existing `needsInput` passthrough (line ~98).
- `TodoList.tsx:940-957` (`sortedTodos`) — add sticky-first as the outermost
  comparator branch, ahead of the existing incomplete/complete split: sticky
  incomplete → non-sticky incomplete → completed (unchanged ordering within
  each). Only incomplete todos participate in the sticky tier — **completing
  a sticky todo unsticks it** (clear `sticky` back to `false` at the same
  point `completed`/`completedAt` are set, not just a sort-time exclusion —
  see the API note below), same as it would sort for any other completed
  todo.
- `TodoList.tsx:995-1012` (`handleDragEnd`) — scope the `arrayMove`/
  `generateKeyBetween` neighbor lookup to same-`sticky` items only, so a
  dragged sticky todo can only be dropped among other sticky todos and vice
  versa (mirrors how subtask drag is already scoped to `parentId`). If a
  drag gesture attempts to cross the sticky/non-sticky boundary, either clamp
  the drop to the boundary or reject the drop — pick whichever
  `dnd-kit` already makes easier given the existing `SortableContext` setup;
  don't introduce a second `DndContext`.

### 4. Web — row button + expanded view

- `TodoList.tsx:266-309` (`InlineIndicators`) — add a `Pin`/`PinOff`
  (lucide-react) icon-button toggle as a sibling of `InlinePriority`/
  `InlineDueDate` in the same `flex items-center gap-1.5` row, following
  `plans/ready/2026-08-06-todo-row-and-list-polish.md` item 1's delete
  button for exact placement/sizing conventions (land after that plan's
  item 1, or alongside it, to avoid two people editing the same JSX region
  independently). Filled pin = sticky, outline/absent = not — toggling calls
  `updateTodo.mutate({ id, input: { sticky: !todo.sticky } })` directly, no
  confirm step needed (non-destructive, instantly reversible).
- `TodoItemExpanded.tsx:390-443` — add a "Sticky" toggle as a third field in
  the existing Due Date / Priority grid (or its own row if a boolean toggle
  doesn't fit the two-column grid visually) — a `Switch`/checkbox, wired
  through the existing `onUpdate({ sticky: next })` auto-save path
  (`onUpdate`'s prop type at lines 39-45 gains `sticky?: boolean`), matching
  how `handlePriorityChange` (line 316-320) already calls `onUpdate`
  immediately with no debounce for discrete fields.

### 5. iOS

- `TodoItem.swift` — add `sticky: Bool = false` alongside `priority`,
  `needsInput` (line ~61-76).
- `SyncService.swift` — thread `sticky` through both merge points the way
  `needsInput`/`priority` already are: the create/serialize path (line 223,
  alongside `priority: todo.isDeleted ? nil : todo.priority`) and both
  update-merge branches (lines 272/286 and 297/306 — `local.sticky =
  remote.sticky ?? false`, `todo.sticky = remote.sticky ?? false`).
- `TodoViewModel.swift`'s `sortedTodos` — same sticky-first tier as the web
  comparator, ahead of the existing incomplete-by-position /
  completed-by-recency split. `toggleTodo`/`updateTodo` (wherever local
  completion is set) clears `sticky` to `false` when marking complete,
  matching the API-side clear so an offline-then-synced completion doesn't
  leave a completed todo sticky.
- `TodoItemRow.swift:42-48` — add a pin toggle button alongside the existing
  priority/due-date/recurrence `HStack` (the row's badge cluster) — a
  `Button` with `Image(systemName: "pin.fill")`/`"pin"` matching this file's
  existing `Image(systemName:)` icon conventions (see clock/repeat icons at
  lines 113/118).
- `TodoItemRow.swift`'s `onSave` closure (line 388-389) and the call site in
  `ContentView.swift:290-297` — both currently pass
  `(title, notes, dueDate, priority, recurrence)`; add `sticky` as a new
  parameter through the same chain into `viewModel.updateTodo(...)`.
- `TodoEditSheet.swift` — add a `Toggle("Sticky", ...)` near the existing
  `Picker("Priority", ...)` block (~line 122-131), same pattern.

## Acceptance criteria

- [x] Toggling the row-level pin icon (web and iOS) marks a todo sticky
      instantly (optimistic, no confirm) and it moves to the top tier of the
      list without a page/app reload. **Verified in-browser for web**; iOS
      implemented but not compiled/run — see Architecture note below.
- [x] The expanded view (web) / edit sheet (iOS) has an explicit sticky
      toggle that reflects and controls the same flag as the row button.
      **Verified in-browser for web** (bidirectional: row ↔ panel).
- [x] Sticky incomplete todos always render above non-sticky incomplete
      todos, on web, iOS, and the Gmail add-on homepage card.
- [x] Dragging to reorder only moves a todo within its own tier — a sticky
      todo can't be dropped below a non-sticky one, and dragging a
      non-sticky todo can't place it above a sticky one.
- [x] Un-stickying a todo drops it out of the sticky tier into its normal
      position-sorted place among non-sticky todos. **Verified in-browser**.
- [x] Completing a sticky todo unsticks it (`sticky` clears to `false`) on
      both web and iOS, and via the Gmail add-on's toggle action — it then
      sorts as an ordinary completed todo, not pinned. **Verified in-browser
      for web**, including the recurring-todo completion path.
- [x] Subtasks never get a sticky toggle or sticky sort behavior — no row
      button, no expanded-view/edit-sheet option, on either platform. Existing
      subtask position scoping (`parentId`-scoped drag) is unaffected.

No cap on how many todos can be sticky at once — if the sticky tier grows to
dominate the list that's a signal for the user to un-stick things, not
something enforced in code.

## Dependencies

- Land after (or alongside) `plans/ready/2026-08-06-todo-row-and-list-polish.md`
  item 1 (delete button in the same `InlineIndicators` row) to avoid
  conflicting edits to `TodoList.tsx:266-309`.
- Builds on the `needsInput` column as the precedent for adding a new
  boolean flag end-to-end (schema → handler → web type → serialization →
  iOS model → `SyncService` merge).
- Builds on the existing `parentId`-scoped position pattern
  (`SubtaskSection`/`createTodo`) as the precedent for scoping fractional-
  index neighbor lookups by a grouping key other than the whole list.

## Out of scope (v1 deferred)

- Sticky subtasks — never applicable, on either platform.
- A cap or warning UI for "too many sticky todos."
- Any cross-device "sticky todos" summary/count surface — this is purely a
  sort-order + toggle feature, no new views.

## Overview

Added a `sticky` boolean to `todos`, threaded end-to-end through the same
schema → API → web → iOS path `needsInput` established as the precedent for
a new boolean flag. Sticky todos render in their own tier above non-sticky
incomplete todos on web, iOS, and the Gmail add-on homepage card; dragging
reorders within a tier only; completing a todo clears `sticky`. Toggled from
a pin icon in the row's action cluster and from an explicit toggle in the
expanded/edit view, on both platforms.

## Architecture

- **Schema/migration**: `sticky` added to `src/shared/src/schema.ts`'s
  `todos` table, migration `0022_add_sticky_to_todos.sql`. `drizzle-kit
  generate` couldn't run non-interactively in this environment (needs a
  TTY for its column-conflict prompt), so the migration `.sql` and its
  `meta/` snapshot/journal entries were hand-authored following the existing
  file pattern, then verified by running `pnpm db:generate` for real
  afterward (confirmed it diffed cleanly against the new snapshot) and
  applying the migration to a local D1 instance.
- **API**: `sticky` threaded through `handlers/todos.ts` (`updateTodo`'s
  patch, `serializeTodo`, completion-clears-sticky) and
  `lib/todos-core.ts` (`setTodoCompleted`'s clear, `listOpenTodos`'s
  `ORDER BY sticky DESC, position ASC` for the Gmail add-on card) as
  specced. Also threaded through `handlers/sync.ts` (request schema,
  update-merge, insert-on-create, response serialization) — not called out
  in the original plan, but required since `sticky` is client-writable from
  iOS and `sync.ts` is the actual endpoint iOS's offline sync talks to.
- **Web**: types (`types/database.ts`), validation (`lib/validation.ts`),
  server functions (`server/todos.ts`, including its own
  completion-clears-sticky since web doesn't route through the API's
  `updateTodo` handler), optimistic updates (`hooks/useTodos.ts`), sort +
  drag scoping and the pin toggle/expanded-view toggle
  (`TodoList.tsx`, `TodoItemExpanded.tsx`). Manually verified in-browser:
  row toggle, expanded-panel toggle (bidirectional with the row), sort
  reorder, and completion-clears-sticky (including the recurring-todo
  completion path, which stamps `completedAt` without setting
  `completed: true`).
- **iOS**: `sticky` added to `TodoItem` (SwiftData model), `APITodo`/
  `TodoChange` (`APIService.swift`), both `SyncService.swift` merge
  directions and the outbound serialize path, `TodoViewModel.swift`
  (`sortedTodos`, `updateTodo`, new `toggleSticky`, completion-clears-sticky
  in `toggleTodo`), a pin-icon row button (`TodoItemRow.swift`), and a
  `Toggle("Sticky", ...)` in `TodoEditSheet.swift`.

### Deviations from the plan

1. **`sync.ts` needed `sticky` threading the plan didn't call out** (see
   above) — the plan's API section only listed `handlers/todos.ts` and
   `lib/todos-core.ts`.
2. **iOS `SyncService.swift` merge semantics differ from the plan's literal
   instruction.** The plan said to mirror `needsInput`'s unconditional
   `local.sticky = remote.sticky ?? false` overwrite on every sync. But
   `needsInput` is server/AI-only (the client never sets it directly), so
   unconditional overwrite is safe for it; `sticky` is user-toggled from the
   client like `title`/`completed`/`dueDate`. It was placed inside the
   existing `if remote.updatedAt > local.updatedAt` last-write-wins block
   instead, so a newer unsynced local toggle isn't clobbered by a stale
   remote value on the next sync round. The create-new-todo branch does
   match the plan as written (no local state to protect there).
3. **iOS pin button placed as a row sibling, not inside `indicatorBadges`.**
   The plan pointed at `TodoItemRow.swift:42-48` (the due-date/recurrence
   `HStack`), but that `HStack` renders inside the same `Button` that opens
   the edit sheet on tap — SwiftUI doesn't reliably route taps to a nested
   interactive `Button` inside another `Button`'s label. The pin toggle was
   added as a sibling of that content `Button` in the row's outer `HStack`
   instead (same pattern as the checkbox), so it's independently tappable.
4. **`import-google-tasks.ts`'s D1 bound-param chunk size needed updating.**
   `sticky` is another NOT NULL defaulted column Drizzle binds on every
   insert row even though the import path never sets it — the same
   "hidden param" issue `needsInput` already caused there. Caught by the
   existing `imports more tasks than fit in one D1 insert chunk` test
   failing with a param-overflow 500 after adding the column;
   `TODO_INSERT_COLUMNS` bumped 12 → 13, `INSERT_CHUNK_SIZE` 8 → 7 rows.
5. **iOS was not compiled or run.** Same environment limitation as prior
   iOS work in this repo (`xcodebuild` fails — iOS 26.5 SDK isn't
   installed, only 26.4 is available). All iOS changes were written by
   inspection and cross-referenced for signature consistency across every
   call site (`TodoChange`/`APITodo` construction, `onSave`/`updateTodo`
   signatures in `TodoItemRow.swift`, `TodoEditSheet.swift`,
   `ContentView.swift`, and their `#Preview`/test call sites), and
   SwiftLint ran clean on every changed file, but a real compile and
   on-device/simulator check are still needed before shipping to iOS users.
