---
title: Sticky Todos
status: Ready
created: 2026-08-06
updated: 2026-08-06
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

- [ ] Toggling the row-level pin icon (web and iOS) marks a todo sticky
      instantly (optimistic, no confirm) and it moves to the top tier of the
      list without a page/app reload.
- [ ] The expanded view (web) / edit sheet (iOS) has an explicit sticky
      toggle that reflects and controls the same flag as the row button.
- [ ] Sticky incomplete todos always render above non-sticky incomplete
      todos, on web, iOS, and the Gmail add-on homepage card.
- [ ] Dragging to reorder only moves a todo within its own tier — a sticky
      todo can't be dropped below a non-sticky one, and dragging a
      non-sticky todo can't place it above a sticky one.
- [ ] Un-stickying a todo drops it out of the sticky tier into its normal
      position-sorted place among non-sticky todos.
- [ ] Completing a sticky todo unsticks it (`sticky` clears to `false`) on
      both web and iOS, and via the Gmail add-on's toggle action — it then
      sorts as an ordinary completed todo, not pinned.
- [ ] Subtasks never get a sticky toggle or sticky sort behavior — no row
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
