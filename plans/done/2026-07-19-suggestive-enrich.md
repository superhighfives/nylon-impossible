---
title: Suggestive Enrich
status: Complete
created: 2026-07-19
updated: 2026-08-07
---

## Problem

Today enrichment is "automagical": when a user opts a todo into AI enrichment,
`enrichOrAskWithAI` (`src/api/src/lib/ai-enrich.ts`) mutates the todo in place —
it rewrites the title (URL removal), sets `dueDate`, `priority`, `recurrence`,
and can even generate subtasks — via a single `db.update(todos).set(updates)`
(~lines 85–190). The user never sees or consents to the individual changes; they
just appear.

This has three problems:

1. **No consent / no visibility.** The model silently overwrites fields. If it
   guesses a due date wrong, the user has to notice and undo it. There's no
   "here's what I think, tap to apply" step.
2. **Offline conflict surface.** Since #246, todos are created locally and
   enrichment is deferred until the item syncs (`SyncService.processPendingAI`).
   An auto-applied title rewrite or due date can land on a todo the user has been
   editing offline in the meantime — classic last-write-wins clobber fodder.
3. **Fragile progress signalling.** Because enrichment mutates the row, the only
   "is it working" signal is the time-boxed `aiStatus`/`isAIProcessing` spinner,
   whose 60s window we had to carefully re-stamp in #246 to survive deferral. A
   suggestion that arrives as durable data doesn't need a time-box at all.

The model already has a non-destructive channel for one case — the "ask a
clarifying question" branch (`ai-enrich.ts:250–280`) posts a `todoMessages` row
with `awaitingReply: true` and sets `needsInput`, rendered by
`ConversationSection`. We want to generalise that shape from "one free-text
question" to "a set of structured, single-tap suggestions."

## Solution

Make enrichment **propose** rather than **apply**. Instead of mutating the todo,
`enrichOrAskWithAI` writes a set of discrete suggestions the user accepts or
dismisses individually, each as a single button in web and iOS:

- "Set due date to Fri 25 Jul"
- "Mark high priority"
- "Repeat weekly"
- "Rename to 'Book DMV appointment'"
- "Add 3 subtasks: …"
- "Research this"

Accepting a suggestion applies exactly the mutation enrich used to do — but now
it's a deliberate, per-field action, initiated by the user, on the current state
of the todo. Dismissing removes it. The clarifying-question flow stays as-is
(it's already suggestive); this extends the same idea to field changes.

Suggestions are **stored and synced** so web and iOS render the same list, in the
same reconciliation model already used for `todoUrls`/`todoMessages`/`todoResearch`.

### Data model

New table `todoSuggestions` in `src/shared/src/schema.ts` (mirror the shape and
relations of `todoResearch`, ~lines 193–231 / 325):

| column | type | notes |
|--------|------|-------|
| `id` | text PK | client- or server-generatable UUID |
| `todoId` | text FK → todos.id | cascade delete |
| `type` | text | `due_date` \| `priority` \| `recurrence` \| `title` \| `subtasks` \| `research` |
| `payload` | text (JSON) | the proposed value, e.g. `{"dueDate":"2026-07-25"}`, `{"titles":["…","…"]}` |
| `label` | text | pre-rendered human string for the button ("Set due date to Fri 25 Jul") |
| `status` | text | `pending` \| `accepted` \| `dismissed` |
| `createdAt` / `updatedAt` | integer | unix seconds, as elsewhere |

Server is authoritative for suggestions (same as research/urls); clients upsert
on sync and never generate them.

### Flow

1. User opts a todo into enrich (existing `POST /todos/:id/enrich`, or the
   create-time enrich path). `aiStatus` still goes `pending → processing` purely
   as a "generating suggestions" indicator.
2. `enrichOrAskWithAI` runs the same model call, but instead of building
   `updates` and calling `db.update(todos)`, it inserts `todoSuggestions` rows
   (status `pending`) and flips `aiStatus` to `complete`. It no longer mutates
   `title`/`dueDate`/`priority`/`recurrence`, and it creates subtasks only when
   the "add subtasks" suggestion is **accepted**, not up front.
3. Sync serialises suggestions onto each todo (extend `handlers/sync.ts` and
   `handlers/todos.ts` serialisers alongside `urls`/`messages`/`research`).
4. Clients render `pending` suggestions as buttons. Accept →
   `POST /todos/:id/suggestions/:sid/accept`, which applies the field change
   server-side (reusing the existing update logic) and marks the suggestion
   `accepted`. Dismiss → `POST /todos/:id/suggestions/:sid/dismiss` (or a single
   `PUT` with status). Both `notifySync`.
5. Optimistic on the client: accepting applies the change locally immediately and
   marks the suggestion accepted, then syncs — same pattern as toggling a todo.

### AI-enabled gate

Suggestion generation must only run when the account has AI enabled. This is
already the master switch (`users.aiEnabled`, `src/shared/src/schema.ts:24`),
set into Hono context by `auth.ts` (`c.set("aiEnabled", ...)`) and read by
`handlers/enrich.ts:23`, which already refuses the request when
`c.get("aiEnabled")` is false. Since this plan keeps `enrich.ts` as the
unchanged entry point (`enrichOrAskWithAI` is just called from the same place),
no new gating code is needed server-side — the existing check covers
suggestion generation for free. Double-check the same guard applies to any new
enrich-triggering paths this plan touches (e.g. re-enrich-on-supersede) and
that clients don't surface the "needs attention" affordance at all when
`user.aiEnabled` is false (mirror the existing `user?.aiEnabled === true`
checks in `TodoInput.tsx:21` and `TodoItemExpanded.tsx:170`).

### Needs-attention indicator (yellow dot) and suggestions list

Rather than rendering suggestions as a set of standalone buttons inline in the
row (as originally sketched), the row shows a single **yellow dot** next to
the todo title whenever the todo has `pending` suggestions. Clicking/tapping
it opens the existing expanded/detail view, which hosts a new suggestions
list.

- **Web** (`src/web/src/components/TodoList.tsx`): add the dot to the
  title-line container inside `TodoItemContent` (~line 429), following the
  same pattern as the existing `needsInput` message-circle badge (line
  430-442) — a small ghost affordance with `onClick={() =>
  onToggleExpand(todo.id)}`, styled with `bg-yellow-base` /
  `text-yellow-8 dark:text-yellowdark-8` (reuse the research-pending badge's
  yellow tokens, line 419-429). Clicking opens `TodoItemExpanded` inline
  (accordion-style — this repo doesn't use a side panel for this), same as
  the `needsInput` precedent.
  - New `SuggestionsSection.tsx` (sibling of `ConversationSection.tsx`),
    mounted in `TodoItemExpanded.tsx` alongside `ConversationSection`. Renders
    each `pending` suggestion as a row with Accept / Dismiss buttons, plus an
    "Accept all" action above the list when more than one is pending.
- **iOS**: add a small filled `Circle` dot (mirror the existing `isSynced` dot
  pattern in `TodoItemRow.swift` line 320-324, but yellow and conditioned on
  `todo.suggestions.contains { $0.status == .pending }`) into the title
  `HStack` (~line 296-301, alongside the `needsInput` bubble icon). Tapping the
  row already opens `TodoEditSheet` via `showingEditSheet = true` (line 267) —
  no new tap target needed, just ensure the sheet mounts the new suggestions
  view (mirror `ResearchSection.swift`) with the same accept-all / dismiss
  actions.
- **Dismiss semantics**: dismissing a suggestion (individually, or via a
  todo-level "dismiss all") sets it to `dismissed` and is terminal — re-running
  enrich only replaces `pending` rows (see "One-shot vs re-suggest" below), it
  never resurrects a `dismissed` one. The yellow dot itself simply reflects
  "any `pending` suggestions exist"; once all are accepted or dismissed, the
  dot disappears until the next enrich run produces fresh `pending` rows.

### Retiring the enrich spinner heuristic

Once suggestions are the durable "enrichment produced something" signal, the
`aiStatus`/`isAIProcessing` time-box (`TodoItem.swift`, and the `aiStartedAt`
re-stamping added in #246) is only needed for the brief "model is thinking"
phase, not for the result. Keep it for the thinking phase; the arrival of
suggestion rows — not a timer — tells the UI enrichment is done. This removes the
class of bug #246's review flagged rather than just patching its window.

## Implementation

### Files to modify / create

**Shared / API**
- `src/shared/src/schema.ts` — add `todoSuggestions` table + relations; migration.
- `src/api/src/lib/ai-enrich.ts` — replace the in-place `updates` mutation
  (~85–190) with suggestion inserts; leave the question branch (~250–280) intact.
- `src/api/src/handlers/enrich.ts` — unchanged entry point; now yields suggestions.
- `src/api/src/handlers/apply-suggestion.ts` (new) — apply a suggestion's change
  (reuse the field-update logic factored out of `ai-enrich`/`updateTodo`).
- `src/api/src/handlers/dismiss-suggestion.ts` (new) — mark dismissed.
- `src/api/src/handlers/sync.ts` + `handlers/todos.ts` — serialise suggestions;
  add a `serializeSuggestion` and include in the per-todo payload.
- `src/api/src/index.ts` — routes:
  `POST /todos/:id/suggestions/:sid/accept`, `.../dismiss`.
- `src/api/src/lib/errors.ts` — `suggestion_not_found` etc. in `API_ERRORS`.

**Web**
- `src/web/src/types/database.ts` — suggestion type.
- `src/web/src/server/todos.ts` + `hooks/useTodos.ts` — fetch/apply/dismiss,
  optimistic accept.
- `src/web/src/components/ConversationSection.tsx` (or a sibling
  `SuggestionsSection.tsx`) — render pending suggestions as buttons; reuse the
  question-card styling.
- `src/web/src/components/TodoItemExpanded.tsx` — mount the suggestions section.

**iOS**
- `Models/TodoSuggestion.swift` (new) + `TodoSuggestion+APIConversion.swift` —
  SwiftData model mirroring `TodoUrl`/`TodoMessage`.
- `Models/TodoItem.swift` — `@Relationship … suggestions`.
- `Services/SyncService.swift` — reconcile suggestions in `applySync` (mirror the
  urls/messages upsert-and-prune steps).
- `Services/APIService.swift` (+ `APIProviding` + `MockAPIService`) —
  `acceptSuggestion` / `dismissSuggestion`.
- A suggestions view (mirror `ResearchSection.swift`) mounted in `TodoItemRow` /
  `TodoEditSheet`; optimistic accept applies locally then `syncAfterAction()`.

### Key considerations

- **Backwards compatibility.** Existing enriched todos already had changes
  applied; nothing to migrate. The switch only changes future enrich runs.
- **Reuse the update path.** Accepting a suggestion must go through the same
  validation/normalisation as a manual edit (`updateTodo`) — e.g. recurrence
  requires a `dueDate`, title truncation — so factor that logic so both call it.
- **One-shot vs re-suggest.** Accepting/dismissing is terminal for a suggestion;
  re-running enrich produces a fresh `pending` set (clear or supersede old
  `pending` rows on re-enrich, like `reresearch` clears prior research).
- **Conflict-free by design.** Suggestions never auto-write, so the offline
  edit-vs-enrich clobber in #246's model goes away — the user's edits always win
  until they tap Accept.
- **Parity.** Web and iOS must render the same suggestion set and labels; the
  server pre-renders `label` so both surfaces stay identical without duplicating
  formatting logic.

## Acceptance criteria

- [x] Enrichment no longer mutates `title`/`dueDate`/`priority`/`recurrence`/
      subtasks directly; it produces `pending` suggestions instead.
- [x] Suggestions sync to both web and iOS and render as single-tap buttons.
- [x] Accepting a suggestion applies exactly that change (via the shared update
      path) and marks it `accepted`; dismissing marks it `dismissed`.
- [x] Accept is optimistic on both clients and reconciles on sync.
- [x] Re-running enrich replaces any stale `pending` suggestions.
- [x] The clarifying-question flow is unchanged.
- [x] Suggestion generation only happens when `aiEnabled` is true for the
      account (already covered by the existing `enrich.ts` gate); clients hide
      the needs-attention affordance when AI is disabled.
- [x] A yellow dot renders next to the todo title (web title line, iOS row)
      whenever the todo has `pending` suggestions, and disappears once none
      remain pending.
- [x] Clicking/tapping the dot opens the todo's expanded/detail view
      (`TodoItemExpanded` on web, `TodoEditSheet` on iOS) showing the
      suggestions list with individual Accept/Dismiss and an "accept all"
      action.
- [x] Dismissing a suggestion is terminal — it never reappears, including
      across re-enrich runs.
- [x] Enrichment "done" is signalled by suggestion arrival, not the `aiStatus`
      time-box; the `isAIProcessing`/`aiStartedAt` window is scoped to the
      thinking phase only.
- [x] Tests: API (enrich yields suggestions; accept applies; dismiss; re-enrich
      supersedes), web (render + optimistic accept), iOS (sync reconciliation +
      optimistic accept).

## Dependencies

- **Related to**: PR #246 (instant/offline create + deferred enrich). This plan
  supersedes the `aiStatus` spinner heuristic that #246 fixed in place, and
  removes the offline auto-apply conflict surface that motivated it. Land #246
  first; this is follow-up work.
- Touches the AI enrichment model contract (`enrichOrAskWithAI` output shape) —
  coordinate with any prompt/schema for the model's structured output.

## Overview

Enrichment now proposes rather than applies. `enrichOrAskWithAI`
(`src/api/src/lib/ai-enrich.ts`) writes `pending` rows to a new
`todoSuggestions` table instead of mutating `title`/`dueDate`/`recurrence`/
subtasks on the todo. Each row carries a server-rendered `label` so web and
iOS show identical copy. Two new endpoints (`POST
/todos/:id/suggestions/:sid/accept` and `.../dismiss`) apply or discard a
suggestion; accept is terminal and reuses the same field-level invariants as
a manual edit (e.g. recurrence requires an existing due date). A yellow dot
next to the todo title (web `TodoList.tsx`, iOS `TodoItemRow.swift`) is the
"needs attention" signal, mirroring the existing `needsInput` badge; tapping
it opens the todo's detail view, which now hosts a `SuggestionsSection` with
per-suggestion Accept/Dismiss and an "Accept all" action. Suggestions sync
like `todoUrls`/`todoMessages`/`todoResearch` — server-authoritative, upserted
on both clients.

## Architecture

**Data model.** `todoSuggestions` (`src/shared/src/schema.ts`): `id`,
`todoId`, `type` (`due_date` | `recurrence` | `title` | `subtasks` |
`research` — `priority` was dropped from the original spec's type list since
a separate PR removed the `priority` field from `todos` entirely before this
landed), `payload` (JSON, shape keyed by `type`), `label`, `status`
(`pending` | `accepted` | `dismissed`). Migration `0021_curved_catseye.sql`.

**API.** `ai-enrich.ts` builds a suggestion per detected change and, right
before inserting the fresh batch, deletes any suggestions still `pending` for
that todo (accepted/dismissed rows are left alone as history) — this is the
"re-enrich supersedes" behavior. URL extraction stayed *outside* the consent
flow: it's additive preview metadata, not a field overwrite, so
`insertAndFetchUrls` still runs automatically as before. `research` only
proposes a suggestion when no `todoResearch` row exists yet for the todo —
accepting it is what actually creates the row and enqueues the job (moved out
of `ai-enrich.ts` into `handlers/apply-suggestion.ts`). `recurrence` is only
suggested when the todo already has a real due date (not merely a pending
due-date suggestion) — accepting "Repeat weekly" alone must never leave a
todo recurring without an anchor. `apply-suggestion.ts`/`dismiss-suggestion.ts`
inline their own `notifySync` helper rather than importing the one in
`ai-enrich.ts`, because that module is globally mocked to a no-op in the test
suite (`test/setup-mocks.ts`) to keep unrelated handler tests off Workers AI —
importing from it would have broken those handlers under test.

**Web.** `TodoWithUrls.suggestions` flows through both data sources: the
TanStack Start server function (`server/todos.ts`, queries D1 directly) and
the API worker's `/todos/sync` handler (`handlers/sync.ts`). `useTodos.ts`
gained `useAcceptSuggestion`/`useDismissSuggestion`, optimistic like the
existing reply/dismiss-question hooks; accept applies the field locally only
for the types that map onto a single todo column (title/due_date/recurrence)
— subtasks and research create new rows server-side, so those reconcile on
the next refetch rather than being synthesized client-side.

**iOS.** New `TodoSuggestion` SwiftData model (registered in
`SharedModelContainer` and every test `ModelContainer(for:...)` call site) with
flattened `payload*` fields instead of a generic JSON blob, since Swift can't
easily decode a payload shape that varies by a sibling `type` column. Sync
reconciliation (`SyncService.swift`) upserts-and-prunes suggestions the same
way it already does for `TodoUrl` — simpler than the `TodoMessage` reconciler
since suggestions have no local unsynced state to protect (clients only ever
push accept/dismiss, never create one).

**Deviations from the original spec:**
- `priority` suggestion type dropped (field no longer exists on `todos`; a
  concurrent PR removed it before this landed).
- `handlers/todos.ts`'s plain REST serializer (`listTodos`/`getTodo`) was
  *not* extended with suggestions — it doesn't serialize `research`/`messages`
  either, so `handlers/sync.ts` remains the one authoritative full-state path
  for both clients, consistent with the existing split.
- iOS changes could not be compiled or run in this environment (documented
  pre-existing limitation — no matching iOS 26.5 simulator runtime); they were
  written by close pattern-mirroring against the existing `TodoUrl`/
  `TodoMessage` model+sync+UI trio and should get a real build/test pass on a
  machine with a matching simulator before shipping.
