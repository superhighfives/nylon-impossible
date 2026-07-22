---
title: Pre-launch Web Polish
status: Complete
created: 2026-07-17
updated: 2026-07-17
---

**Updated**: 2026-07-17

## Problem

A grab-bag of web UI fixes and interaction improvements to land before launch.
Individually small-to-medium, together they make the app feel finished. Six
items, tracked as one spec because they cluster around two themes — **inline,
zero-friction editing** (drag handles, inline due/priority, auto-save,
optimism) and **making AI deliberate** (opt-in enrich/research instead of
auto-firing).

Order below is roughly ascending by risk. Ship them as separate commits/PRs
under this one plan; the plan only moves to `done/` when all six land (or a
descoped item is explicitly noted).

## Solution overview

1. **Drag handles** — near-invisible by default, revealed on row hover (web).
2. **Inline due date + priority** — set both from the row without expanding.
3. **Auto-save everywhere** — debounced field saves; remove the Save button
   entirely.
4. **Optimistic create** — close the last non-optimistic web mutation
   (smart-create).
5. **Subtasks insert at top** — new subtasks go to the top of the parent's
   list, not the bottom.
6. **Intentional AI** — enrich/research become explicit user actions
   (split-button at creation **and** per-todo actions afterward), never
   automatic.

Items 2 and 3 are intertwined (inline controls must auto-save to be useful), so
build them together. Item 6 is the only one that touches the API and user
model; treat it as its own PR.

## Progress

- [x] **Item 1 — Drag handle colours.** Grip in `TodoList` and `SubtaskSection`
      now rests at `text-gray-muted/40` and is `sm:opacity-0 sm:group-hover`
      revealed (kept visible on touch). Web suite green.
- [x] **Item 5 — Subtasks insert at top.** Threaded an optional `position`
      through `createTodoSchema` / `CreateTodoInput` / `createTodo` server fn /
      `useCreateTodo` optimistic insert; `SubtaskSection.handleAdd` computes a
      key before the first active subtask. Test updated + added; suite green.
- [x] **Item 4 — Optimistic smart-create.** `useSmartCreate` now prepends a
      `temp-…` placeholder (position sorted before the top-level minimum) in
      `onMutate`, rolls back in `onError`, and reconciles wholesale via the
      `onSettled` invalidation (handles one-line→N-todos expansion). Suite green.
- [x] **Item 2 — Inline due date + priority.** New `InlineTodoControls`
      (`InlinePriority` menu + `InlineDueDate` native-picker) rendered in an
      always-present slim `InlineIndicators` row on active todos; set values are
      editable badges, unset ones faint hover affordances. Writes go through the
      optimistic `updateTodo`. Recurrence stays read-only inline; clearing a due
      date also clears recurrence.
- [x] **Item 3 — Auto-save / remove Save button.** `TodoItemExpanded` now
      debounces title/notes (700ms, flush on blur + on collapse/unmount) and
      commits due/priority/repeat immediately; Save button + `canSave`/`isUpdating`
      gating removed; empty title never persists; `touched` merge-guard kept.
      Tests rewritten for auto-save; suite green (162).
- [x] **Item 6 — Intentional AI (own branch `intentional-ai`).**
      - [x] **API + web** (commit `2f9b086`): `smart-create` takes `enrich` /
        `research` flags (no more auto-fire); new `POST /todos/:id/enrich`;
        `[Add | ↓]` split-button on the web input; per-todo Enrich/Research in
        the expanded view (two separate actions). api (301) + web (166) green.
      - [x] **iOS opt-in** (commit `1ff07f5`): flags threaded through
        `SmartCreateRequest` / `APIProviding` / `SyncService` / `ContentView`;
        `AddTaskInputView` split add-button (long-press menu) when AI available;
        new `APIService.enrich` + `AIActionsSection` in `TodoEditSheet`.
        SwiftLint clean (0 errors). **NOT build/simulator-tested** in this env —
        needs an Xcode build + manual pass before merge.

## Branches / PRs

- `pre-launch-polish` (off `main`): items 1–5 (`30510d7`).
- `intentional-ai` (stacked on `pre-launch-polish`): item 6 web+API (`2f9b086`)
  + iOS (`1ff07f5`).

Intended as two PRs: merge `pre-launch-polish` first, then `intentional-ai`.
Nothing pushed yet.

---

## 1. Fix drag handle colours (web)

**Current**: `src/web/src/components/TodoList.tsx:587-595` renders the grip as a
`GripVertical size={16}` with `text-gray-muted hover:text-gray` — always
visible, and too prominent. `SubtaskSection.tsx:96-105` has the same treatment.

**Want**: much more transparent by default, and on web only reveal the handle
when the mouse is over the row.

**Approach**

- The row wrapper is already `group` (`TodoList.tsx:558`), and the desktop
  expand button already uses the reveal pattern
  `sm:opacity-0 sm:group-hover:opacity-100 transition-opacity`
  (`TodoList.tsx:461`). Mirror that on the grip button.
- Keep the handle visible on touch (no hover): scope the hide to `sm:` so small
  screens keep it, matching how the actions menu is mobile-only.
- Lower the resting colour/opacity so even when shown it's subtle — e.g.
  `text-gray-muted/40 hover:text-gray-muted` (tune to taste against
  `make-interfaces-feel-better`).
- Preserve the disabled-while-expanded state
  (`disabled:opacity-50 disabled:cursor-default`).
- Mirror the same reveal-on-hover + transparency in `SubtaskSection.tsx`
  `ActiveSubtaskRow` (its wrapper is `group/sub`).

**Files**: `src/web/src/components/TodoList.tsx`,
`src/web/src/components/SubtaskSection.tsx`.

**Acceptance**

- [ ] On desktop, the grip is (near-)invisible until the pointer enters the row,
      then fades in.
- [ ] On touch/mobile the grip remains available.
- [ ] Reordering still works via pointer and keyboard; disabled-when-expanded
      unchanged.

---

## 2. Inline due date + priority (web)

**Current**: due date and priority are only editable inside the expanded form
(`TodoItemExpanded.tsx:332-391`). The row shows read-only badges via
`TodoIndicators` (`TodoList.tsx:141-218`).

**Want**: set (and change/clear) due date and priority directly from the row,
without expanding.

**Approach**

- Turn the `TodoIndicators` badges into interactive controls (or add compact
  controls beside them) in `TodoItemContent`:
  - **Priority**: a small menu/segmented control cycling None → High → Low
    (reuse the `Select` used in the expanded form, or a lightweight popover).
  - **Due date**: a compact date control — a native `type="date"` input behind
    a small "Add date" affordance, plus a clear (×) when set. Reuse the pattern
    from `TodoItemExpanded.tsx:343-368`.
- Both write through the existing `updateTodo.mutate({ id, input })` path, which
  is already optimistic (`useUpdateTodo`). No new mutation needed.
- Respect the recurrence rule: due-date changes on a recurring todo should not
  desync the schedule — for v1, inline editing of a recurring todo's date can be
  left to the expanded form if it complicates things; note the decision.
- Keep the controls in the hover-revealed affordance zone so resting rows stay
  clean (consistent with item 1).
- Follow `make-interfaces-feel-better` for the reveal/change animation.

**Files**: `src/web/src/components/TodoList.tsx` (TodoIndicators /
TodoItemContent), possibly a small new `InlineDueDate` / `InlinePriority`
control under `components/ui/`.

**Acceptance**

- [ ] Setting/clearing due date and priority from the row updates immediately
      (optimistic) and persists.
- [ ] The expanded form and the row stay consistent (both read the same todo).
- [ ] No layout jump when a badge becomes an editable control.

---

## 3. Auto-save everywhere — remove the Save button (web)

**Decision**: full auto-save. The "Save changes" button
(`TodoItemExpanded.tsx:447-455`) is removed app-wide; every field commits on its
own.

**Current**: the expanded form buffers edits in local state with a `touched`
map and commits them in a batch via `handleSave` on button click
(`TodoItemExpanded.tsx:160-257`). The background-sync merge logic (untouched
fields track the server, touched fields are preserved) must be kept.

**Approach**

- Replace the explicit save with **debounced auto-save per field**:
  - Text fields (`title`, `notes`): debounce (~600–800ms) after typing stops,
    then `onUpdate({ title })` / `onUpdate({ notes })`. Also flush on blur.
  - Immediate-commit fields (`dueDate`, `priority`, `recurrence`): save on
    change (they're discrete selections) — same as the inline controls in
    item 2.
  - Guard the empty-title case: don't auto-save a blank title (title is
    required). Keep the last valid title until a non-empty value is entered.
- Keep the existing `touched` / server-merge effects
  (`TodoItemExpanded.tsx:183-215`) so an in-flight AI re-enrichment doesn't
  clobber a field the user is actively editing. After a field's auto-save
  settles, clearing its `touched` flag lets server updates flow back in.
- Remove the Save button and the `canSave`/`hasChanges` gating that only existed
  to drive it. Delete/Research/Conversation/Links sections stay.
- Consider a subtle, non-blocking "Saved" / saving affordance is **out** —
  decision was to remove the button entirely, not replace it. `isUpdating`
  already drives field `disabled` state and the toast-on-error path in
  `useUpdateTodo` covers failures.
- Audit other web save buttons for consistency: `SettingsModal.tsx`,
  `ImportReviewModal.tsx` — only convert todo-field editing; explicit
  modal/confirm actions (import review, destructive settings) keep their
  buttons. Scope this item to the todo edit form + inline controls.

**Files**: `src/web/src/components/TodoItemExpanded.tsx` (primary),
`src/web/src/components/TodoList.tsx` (inline controls share the path).

**Key considerations**

- Debounce cleanup on unmount/collapse: flush any pending debounced save when
  the row collapses (`expandedId` changes) so a fast edit-then-collapse isn't
  lost.
- Rapid edits + optimistic cache + the `touched` merge interact; test typing
  into notes while a sync arrives.

**Acceptance**

- [ ] No "Save changes" button anywhere in the todo edit surface.
- [ ] Editing title/notes auto-saves shortly after typing stops and on blur.
- [ ] Due date / priority / repeat save on change.
- [ ] A blank title never persists.
- [ ] An incoming AI re-enrichment doesn't overwrite a field being edited.
- [ ] Collapsing the row mid-edit still saves the pending change.

---

## 4. Make remaining web mutations optimistic

**Current audit** (`src/web/src/hooks/useTodos.ts`):

- `useCreateTodo`, `useUpdateTodo`, `useDeleteTodo`, `useUpdateUrlPreview`,
  `useReplyToTodo`, `useDismissTodoQuestion` — **already optimistic**
  (onMutate cache write + rollback).
- Reorder and toggle go through `useUpdateTodo` — already optimistic.
- **`useSmartCreate` (`useTodos.ts:378-407`) is NOT optimistic** — it awaits the
  server then `invalidateQueries`. This is the real "type a todo, wait for it to
  appear" gap, since `TodoInput` always uses smart-create
  (`TodoInput.tsx:10,17`).

**Approach**

- Give `useSmartCreate` an optimistic insert mirroring `useCreateTodo`:
  - `onMutate`: cancel queries, snapshot, prepend a `temp-…` `TodoWithUrls`
    built from the raw text (title = text, no AI fields yet), return context.
  - `onError`: restore snapshot (or drop the temp entry), toast.
  - `onSettled`: `invalidateQueries` to reconcile with the server's real
    row(s) — smart-create may expand one line into multiple todos, so the temp
    row is replaced wholesale on refetch (don't try to patch IDs in place).
  - `onSuccess`: keep `notifyChanged()`.
- Note the multi-item case: a single input can yield N todos. The optimistic
  entry is a single placeholder; `onSettled` invalidation resolves the true
  count. The existing "Added N items" toast stays.
- Leave research/reresearch/import as-is (server-driven, spinner-backed — not
  worth faking optimistically).

**Files**: `src/web/src/hooks/useTodos.ts`.

**Acceptance**

- [ ] Submitting the input shows the new todo instantly, before the server
      responds.
- [ ] On error the optimistic row is removed and a toast shown.
- [ ] Multi-item smart-create reconciles to the correct set after settle.

---

## 5. Insert new subtasks at the top of the parent's list

**Current**: `SubtaskSection.handleAdd` (`SubtaskSection.tsx:173-178`) calls
`onAdd(parentId, title)` → `subtaskHandlers.onAdd` (`TodoList.tsx:796`) →
`createTodo.mutate({ title, parentId })`. The server `createTodo` assigns a
position at the **end** of the sibling group.

**Want**: new subtasks appear at the **top** of the active subtask list.
(Follows `in-progress/2026-07-08-subtasks.md`.)

**Approach**

- Compute the insert position on the client, before the current first active
  subtask, and pass it through:
  - In `SubtaskSection.handleAdd`, `active` is already sorted by position
    (`SubtaskSection.tsx:168`). Compute
    `generateKeyBetween(null, active[0]?.position ?? null)` and pass it up:
    `onAdd(parentId, title, position)`.
  - Widen `SubtaskHandlers.onAdd` (`TodoList.tsx:108-113`) and the
    `SubtaskSectionProps.onAdd` signature to accept an optional `position`.
  - `subtaskHandlers.onAdd` → `createTodo.mutate({ title, parentId, position })`.
- Thread `position` through the create path:
  - Add `position?: string` to `CreateTodoInput`
    (`src/web/src/types/database.ts:14`).
  - `createTodo` server fn (`src/web/src/server/todos.ts`) — honour an explicit
    `position` when provided, else fall back to the current end-of-group
    default.
  - `useCreateTodo` optimistic insert (`useTodos.ts:104-128`) — use the passed
    `position` instead of the `"a0"` placeholder so the optimistic row lands at
    the top immediately.
- The main-list top-level create (smart-create) already prepends at the top
  (`smart-create.ts:109-124`); this item is only about the subtask add path, so
  the two are consistent (new things go to the top).

**Files**: `src/web/src/components/SubtaskSection.tsx`,
`src/web/src/components/TodoList.tsx`, `src/web/src/hooks/useTodos.ts`,
`src/web/src/server/todos.ts`, `src/web/src/types/database.ts`.

**Acceptance**

- [ ] Adding a subtask places it at the top of the active subtask list,
      optimistically and after refetch.
- [ ] Existing subtask order is otherwise preserved; completed still pinned to
      the bottom.
- [ ] Top-level todo creation is unaffected.

---

## 6. Make AI features intentional (opt-in enrich + research)

**Decision**: expose AI both ways — a **split-button `[Add | ↓]`** at creation
time, and **explicit per-todo actions** afterward. AI never fires automatically.

**Current behaviour** (from an API map):

- **Enrichment**: `smart-create.ts:107` gates on
  `useAI = aiEnabled && plan === "pro"` and, when true, fires
  `enrichOrAskWithAI` in the background on every create
  (`smart-create.ts:165-184`). The web input always hits `/todos/smart`
  (`TodoInput.tsx`), so **eligible users get AI on every todo automatically**.
- **Research**: auto-triggered from inside enrichment when the model detects
  research intent (`src/api/src/lib/ai-enrich.ts:182-247`) — no separate gate.
- **Manual research already exists**: `POST /todos/:id/research`
  (`reresearch.ts`, pro-gated), surfaced by `useReresearch` and the
  `ResearchSection` retry/refresh buttons.
- **User model**: `users.aiEnabled` (default `true`) and `users.plan`
  (`free|pro`) in `src/shared/src/schema.ts:24-29`; read into request context in
  `src/api/src/lib/auth.ts:66-74`.

**Approach**

**API — stop auto-firing, add explicit triggers**

- `smart-create.ts`: remove the "always enrich when eligible" behaviour. Enrich
  (and thus auto-research) only when the request explicitly asks for it:
  - Add `enrich?: boolean` and `research?: boolean` to `smartCreateSchema` /
    the request body.
  - Compute `useAI = enrich && aiEnabled && plan === "pro"` (still pro-gated and
    still honouring the `aiEnabled` master switch, but now requires an explicit
    request). Keep the fast-path insert unchanged when not enriching.
  - If `research` is requested independently of enrich, enqueue research
    directly (reuse the reresearch enqueue path) rather than relying on the
    enrichment model to decide.
- Add an **enrich-on-demand endpoint**: `POST /todos/:id/enrich` that runs
  `enrichOrAskWithAI` against an existing todo (pro-gated, mirrors
  `reresearch.ts`). This backs the per-todo "Enrich" action.
- Keep `POST /todos/:id/research` (already present) for the per-todo "Research"
  action.

**Web — creation split-button**

- `TodoInput.tsx`: replace the single Add button (`TodoInput.tsx:38-51`) with a
  split button `[Add | ↓]`. The chevron opens a small menu offering "Add",
  "Add + enrich", "Add + research" (label copy TBD). Default primary action is
  plain Add (no AI).
- `useSmartCreate` passes the chosen `{ enrich, research }` flags in the body.
  Combine with the optimistic-create work in item 4 (the split button and the
  optimistic insert live in the same change).
- Gate the AI options on `user.plan === "pro" && user.aiEnabled` — hide/disable
  the AI menu items otherwise (reuse the `useUser` plan/aiEnabled reads already
  used in `TodoItemExpanded.tsx:315`).

**Web — per-todo actions**

- Add explicit **Enrich** and **Research** actions to the expanded view
  (`TodoItemExpanded.tsx`) and/or `TodoActionsMenu.tsx`:
  - "Research" calls `useReresearch` (existing) — but only render the
    `ResearchSection` / research affordance when research exists or has been
    requested, since it no longer auto-populates.
  - "Enrich" calls a new `useEnrichTodo` hook hitting `POST /todos/:id/enrich`,
    with a pending spinner (reuse the `aiStatus`/`STALE_AI_MS` pending
    treatment already in `TodoList.tsx:291-293`).
  - Pro/aiEnabled gating as above.

**Files**

- API: `src/api/src/handlers/smart-create.ts`, new
  `src/api/src/handlers/enrich.ts` (+ route wiring),
  `src/api/src/lib/ai-enrich.ts` (research-detection path stays but is only
  reached on explicit enrich), route registration.
- Web: `src/web/src/components/TodoInput.tsx`,
  `src/web/src/components/TodoItemExpanded.tsx`,
  `src/web/src/components/TodoActionsMenu.tsx`,
  `src/web/src/components/ResearchSection.tsx`,
  `src/web/src/hooks/useTodos.ts` (smart-create flags + new `useEnrichTodo`).

**Key considerations**

- **iOS parity**: iOS presumably also hits `/todos/smart` and expects
  auto-enrich. Removing auto-fire server-side changes iOS behaviour too. Either
  (a) scope this to web and have iOS send `enrich: true` to preserve its current
  behaviour until an iOS opt-in ships, or (b) coordinate an iOS change. **Flag
  this — it's the main cross-surface risk.** Simplest safe default: iOS keeps
  sending `enrich: true` for now (behaviour-preserving) while web goes opt-in.
- `aiEnabled` semantics shift from "auto-run AI" to "AI features available at
  all" — the master switch still hides the affordances when off.
- Don't break the conversational-refinement / `needsInput` reply flow, which
  re-enriches server-side after a reply (`useReplyToTodo`).

**Acceptance**

- [ ] Creating a todo the normal way runs **no** AI (no enrich, no research),
      for pro users included.
- [ ] The input split-button offers explicit "add + enrich" / "add + research"
      (pro + aiEnabled only).
- [ ] Per-todo "Enrich" and "Research" actions exist in the expanded view /
      actions menu and trigger AI on demand with a pending indicator.
- [ ] Research UI only appears once research has been requested.
- [ ] iOS behaviour is either preserved (sends `enrich: true`) or intentionally
      migrated — decided and noted, not left implicit.
- [ ] `aiEnabled = false` hides all AI affordances.

---

## Cross-cutting

- Run `pnpm typecheck`, `pnpm lint`, `pnpm test` after each item; the web suite
  has component tests under `src/web/src/components/__tests__` and hook tests
  under `src/web/src/hooks/__tests__` — add/adjust coverage for the new inline
  controls, auto-save, optimistic create, subtask-top ordering, and the AI
  gating change.
- Follow `make-interfaces-feel-better` for the hover reveals, inline control
  transitions, and split-button.

## Dependencies

- Related to: `in-progress/2026-07-08-subtasks.md` (item 5 follows its subtask
  work; item 1 also touches `SubtaskSection`).
- Item 6 touches the shared user model gating and has an **iOS parity**
  interaction that must be resolved before it merges.

## Open questions (resolve during implementation)

- Item 2: inline editing of a **recurring** todo's due date — allow inline, or
  route recurring todos to the expanded form? (Lean: allow, but verify it
  doesn't desync the schedule.)
- Item 6: exact copy for the split-button menu and per-todo actions; whether
  "Research" and "Enrich" are two actions or one "AI" affordance with a submenu.
- Item 6: iOS migration — preserve via `enrich: true` now, or ship iOS opt-in in
  the same cycle?

---

## Overview

All six polish items were built. Five are web-only quality-of-life changes
(drag handles, inline due/priority editing, full auto-save, optimistic
creation, subtasks-to-top); the sixth makes AI deliberate across web, API, and
iOS. Shipped as **two stacked PRs**, not merged at time of writing:

- **PR #231** `pre-launch-polish` → `main`: items 1–5 (commit `30510d7`).
- **PR #232** `intentional-ai` → `pre-launch-polish`: item 6 (commits `2f9b086`
  web+API, `1ff07f5` iOS). Merge #231 first.

Verification at completion: web typecheck clean, web suite **166 passing**, API
suite **301 passing**, lint clean, iOS SwiftLint clean (0 errors). The iOS app
was **not** build/simulator-tested (SDK mismatch in the dev environment — CI
runs SwiftLint only), so PR #232 carries a "needs a simulator pass" caveat.

## Architecture

**Item 1 (drag handles)** — pure Tailwind: the grip rests at
`text-gray-muted/40` and reveals via `sm:opacity-0 sm:group-hover:opacity-100`
(kept visible on touch), in `TodoList.tsx` and `SubtaskSection.tsx`.

**Item 2 (inline due/priority)** — new `components/InlineTodoControls.tsx`
exports `InlinePriority` (a Base UI `Menu`) and `InlineDueDate` (a hidden native
`<input type="date">` opened via `showPicker()`). They render inside a new
`InlineIndicators` row in `TodoItemContent`, wired to a new `onInlineUpdate`
prop → the optimistic `updateTodo`.
- **Deviation from the spec:** the spec floated keeping controls purely in a
  hover-revealed zone. Shipped instead as an **always-present slim
  `InlineIndicators` row** on active todos (set values = editable badges, unset
  = faint hover affordances) to avoid hover-induced layout jump. Recurrence is
  read-only inline; clearing a due date also clears recurrence. This row's
  resting spacing is the most likely thing to want a visual tweak.

**Item 3 (auto-save)** — `TodoItemExpanded` lost its Save button and the
`canSave`/`hasChanges`/`isUpdating` machinery. Title/notes use a debounced
committer (700ms, `useRef` timers, flush on blur and on an empty-dep unmount
effect that fires on collapse); due/priority/repeat commit immediately in their
handlers. The `touched` server-merge guard is retained so in-flight AI
re-enrichment can't clobber an active edit. `isUpdating` was removed from the
prop chain (`ExpandedSection` no longer forwards it).

**Item 4 (optimistic create)** — only `useSmartCreate` needed changing (every
other web mutation was already optimistic). It prepends a `temp-…` placeholder
with a position sorted before the top-level minimum, rolls back in `onError`,
and reconciles wholesale via the `onSettled` invalidation (handles
one-line→N-todos). Its `mutationFn` variable changed from `string` to
`SmartCreateInput` — which dovetailed with item 6's flags.

**Item 5 (subtasks-to-top)** — an optional `position` was threaded through
`createTodoSchema`, `CreateTodoInput`, the `createTodo` server fn (explicit
position wins over the end-of-group default), and the `useCreateTodo`
optimistic insert. `SubtaskSection.handleAdd` computes a key before the first
active subtask.

**Item 6 (intentional AI)** — the behavioural core is `smart-create.ts`:
`useAI = enrich && aiEnabled && Pro`, replacing the old auto-fire. Research runs
directly (`doResearch = research && Pro && !useAI`) — the `!useAI` guard avoids
a double run when enrichment would itself detect research. New
`handlers/enrich.ts` (`POST /todos/:id/enrich`) mirrors `reresearch.ts`.
- Web: `TodoInput` split-button (`[Add | ↓]`, Base UI `Menu`) + a new
  `useEnrichTodo` hook; `TodoItemExpanded` gains explicit Enrich/Research
  actions (two separate actions, per decision), Pro + aiEnabled gated.
- iOS: flags on `SmartCreateRequest` + the `APIProviding` protocol +
  `SyncService`/`ContentView`; `AddTaskInputView` becomes a `Menu` with
  `primaryAction` (plain tap adds, long-press opens enrich/research);
  `APIService.enrich` + an `AIActionsSection` in `TodoEditSheet`.
- **Deviations / decisions:** iOS was migrated to opt-in **this cycle** (not the
  behaviour-preserving `enrich:true` fallback the spec floated). The
  `AIActionsSection` was extracted to a standalone view purely to keep
  `TodoEditSheet` under SwiftLint's `type_body_length` error threshold. The
  inline recurring-due-date open question was resolved as **allow inline edit**
  (setting a date just moves the anchor; the server advances recurrence on
  completion, not on edit).
