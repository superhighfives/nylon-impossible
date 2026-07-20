# Suggestive Enrich

**Date**: 2026-07-19
**Status**: Ready

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

- [ ] Enrichment no longer mutates `title`/`dueDate`/`priority`/`recurrence`/
      subtasks directly; it produces `pending` suggestions instead.
- [ ] Suggestions sync to both web and iOS and render as single-tap buttons.
- [ ] Accepting a suggestion applies exactly that change (via the shared update
      path) and marks it `accepted`; dismissing marks it `dismissed`.
- [ ] Accept is optimistic on both clients and reconciles on sync.
- [ ] Re-running enrich replaces any stale `pending` suggestions.
- [ ] The clarifying-question flow is unchanged.
- [ ] Enrichment "done" is signalled by suggestion arrival, not the `aiStatus`
      time-box; the `isAIProcessing`/`aiStartedAt` window is scoped to the
      thinking phase only.
- [ ] Tests: API (enrich yields suggestions; accept applies; dismiss; re-enrich
      supersedes), web (render + optimistic accept), iOS (sync reconciliation +
      optimistic accept).

## Dependencies

- **Related to**: PR #246 (instant/offline create + deferred enrich). This plan
  supersedes the `aiStatus` spinner heuristic that #246 fixed in place, and
  removes the offline auto-apply conflict surface that motivated it. Land #246
  first; this is follow-up work.
- Touches the AI enrichment model contract (`enrichOrAskWithAI` output shape) —
  coordinate with any prompt/schema for the model's structured output.
