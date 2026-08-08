---
title: Todo Row & List Polish (delete confirm, side panel, iOS fixes)
status: Complete
created: 2026-08-06
updated: 2026-08-07
---

## Problem

A grab-bag of six small, mostly-independent UI/UX fixes across web and iOS,
tracked as one spec because they're all quick row/list-level polish items
rather than new features. Ship them as separate commits under this one plan;
the plan only moves to `done/` when all six land (or a descoped item is
explicitly noted), following the same convention as
`plans/done/2026-07-17-pre-launch-polish.md`.

1. Delete button next to the priority/date icons on web.
2. Confirm step before delete, web + iOS.
3. Expand opens a sliding side panel on web, not inline.
4. Fix broken todo sorting on iOS.
5. Submit-on-Enter when adding a todo on iOS.
6. Move the "add subtask" form to the top of the list on web.

Items 1–3 all touch `TodoList.tsx`'s row/expand machinery — do them in that
order (1 and 2 are prerequisites for what item 3's panel needs to show).
Items 4–5 are iOS-only and independent of the web work. Item 6 is a pure JSX
reorder, independent of everything else.

---

## 1. Delete button beside priority/date icons (web)

**Current**: `InlineIndicators` (`TodoList.tsx:266-309`) renders
`InlinePriority` + `InlineDueDate` in a `flex items-center gap-1.5` row,
mounted at `TodoList.tsx:531` inside the row's action cluster (guarded by
`showInlineEditing && !isExpanded`). Desktop has **no row-level delete
affordance today** — `TodoActionsMenu` (delete + expand + reorder) is
`sm:hidden` (`TodoList.tsx:550`), mobile-only. On desktop, delete only exists
inside the expanded form (`TodoItemExpanded.tsx:516-529`, a full-width
"Delete" button with label).

**Want**: a small icon-only delete button rendered to the right of the
priority/date icons in the same row, desktop only (mobile keeps its existing
menu — don't duplicate the affordance there).

**Approach**

- Add a `Trash2` icon button (ghost/xs variant, matching the existing
  `InlinePriority`/`InlineDueDate` sizing) as a sibling inside
  `InlineIndicators`'s row, or in the same `showActions` cluster
  (`TodoList.tsx:526-546`) — whichever keeps consistent spacing with the
  existing icons.
- Gate it `sm:block` (or reuse whatever breakpoint class the rest of that
  cluster uses) so it only shows on desktop; the mobile `TodoActionsMenu`
  keeps owning delete on small screens.
- Wire it to the same `onDelete`/`deleteTodo.mutate` path
  `TodoActionsMenu`/`TodoItemExpanded`'s delete button already uses — no new
  mutation.
- **This button must open the confirm step from item 2**, not delete
  directly — land items 1 and 2 together or the button will regress on
  accidental-click safety the mobile menu doesn't currently have either
  (note: the *existing* mobile delete and the expanded-form delete are
  themselves un-confirmed today — item 2 fixes all three, not just this new
  button).

**Files**: `src/web/src/components/TodoList.tsx`.

**Acceptance**

- [x] On desktop, a delete icon appears in the row next to the priority/date
      indicators.
- [x] Clicking it goes through the item 2 confirm step, not an immediate
      delete.
- [x] Mobile is unchanged (delete still lives in `TodoActionsMenu`).

---

## 2. Confirm step before delete (web + iOS)

**Current**: no delete path is confirmed today, on either platform. Web has
no reusable dialog component under `src/web/src/components/ui/` — the only
existing confirm-shaped thing is a raw `window.confirm()` in
`SettingsModal.tsx:90-95` for account deletion, which is not a pattern worth
replicating (native browser dialogs, unstyled, blocks the main thread — the
`make-interfaces-feel-better` skill would flag it). `@base-ui/react/dialog`
is already a direct dependency and already used for real dialogs
(`ImportReviewModal.tsx`, `SettingsModal.tsx`). On iOS, delete reaches
`TodoEditSheet.swift` via an `onDelete` closure (and presumably a swipe
action in `ContentView.swift`); there's no existing
`.confirmationDialog`/`.alert` pattern in the iOS codebase to mirror — this
would be the first.

**Want**: every delete path (web row button from item 1, web expanded-form
delete, web mobile `TodoActionsMenu` delete, iOS swipe-to-delete, iOS
`TodoEditSheet` delete) asks for confirmation first.

**Approach**

- **Web**: build a small reusable `ConfirmDialog` component under
  `src/web/src/components/ui/` on top of `@base-ui/react/dialog` (title,
  body text, Cancel + destructive Confirm buttons) — not `window.confirm`.
  Wire all three existing delete affordances (item 1's new button,
  `TodoItemExpanded.tsx:516-529`, `TodoActionsMenu`'s delete item) through
  it. One shared component, three call sites.
- **iOS**: use SwiftUI's native `.confirmationDialog(...)` (the standard
  destructive-action idiom) on both the swipe-to-delete action and
  `TodoEditSheet`'s delete button. No custom component needed — this is a
  case where the platform-native primitive is the right call, unlike web
  which needed one built.
- Copy: "Delete this todo?" / "This can't be undone" (or similar, match
  existing app tone) with a destructive-styled confirm action on both
  platforms.

**Files**: `src/web/src/components/ui/ConfirmDialog.tsx` (new),
`src/web/src/components/TodoList.tsx`, `src/web/src/components/TodoItemExpanded.tsx`;
iOS `TodoEditSheet.swift`, `ContentView.swift` (or wherever the swipe action
lives).

**Acceptance**

- [x] Every delete affordance on web (row icon, expanded form, mobile menu)
      opens the shared `ConfirmDialog` before deleting; cancelling leaves the
      todo untouched.
- [x] Every delete affordance on iOS (swipe action) opens a
      `.confirmationDialog` before deleting; cancelling leaves the todo
      untouched. `TodoEditSheet.swift` turned out to have no delete-the-parent
      button (only `onDeleteSubtask`) — that part of the plan's premise was
      stale, so there was nothing to wire there.
- [x] No `window.confirm()` remains in the todo delete path (the
      `SettingsModal` account-deletion one is out of scope — leave it).

---

## 3. Expand opens a sliding side panel on web

**Current**: `TodoList.tsx:806` holds `expandedId` state; the row's
`ExpandedSection` (`TodoList.tsx:567`) mounts **inline**, directly under the
row inside the same sortable list-item wrapper
(`TodoList.tsx:705-710`, `{props.isExpanded && <ExpandedSection ... />}`).
Expanding a row today pushes every row below it down the page. No
Sheet/Drawer primitive exists yet anywhere in `src/web/src/components/ui/`.

**Want**: expanding a todo opens a side panel that slides in from the edge
of the screen (like the Gmail-style side-rail pattern this app's other
add-on plan referenced), instead of pushing the list around inline.

**Approach**

- Build the panel on `@base-ui/react/dialog` (already a dependency, already
  used for modal-shaped UI) with a side-anchored variant — translate-in from
  the right, not a centered modal. Follow `make-interfaces-feel-better` /
  `apple-design` for the spring/slide motion and backdrop treatment.
- **Reuse the existing `expandedId`/toggle-expand state as-is** — this is a
  presentation change, not a state-model change. The same state that
  currently gates the inline `ExpandedSection` render should gate the panel
  instead.
- `ExpandedSection`'s actual content (the form fields, item 2's delete
  button, everything in `TodoItemExpanded.tsx`) doesn't need to change
  logically — it moves into the panel's body.
- Decide and note: does the row stay visually "selected" in the list while
  its panel is open (likely yes, for context), and does closing the panel
  (Escape, backdrop click, explicit close) map to the same `onToggleExpand`
  callback that inline collapse used?
- Keyboard: Escape closes the panel (native to most dialog primitives);
  confirm focus returns to the row's trigger on close (existing
  `@base-ui/react/dialog` usage elsewhere in the app should already show the
  idiom).

**Files**: `src/web/src/components/TodoList.tsx`,
`src/web/src/components/TodoItemExpanded.tsx`, possibly a new
`src/web/src/components/ui/SidePanel.tsx` if the slide-in variant is generic
enough to be reusable (recommended, given item 2 is also adding new dialog
primitives to `ui/`).

**Acceptance**

- [x] Expanding a todo opens a panel sliding in from the side, not an inline
      block that pushes the list.
- [x] The list behind the panel doesn't reflow while it's open.
- [x] Escape and backdrop-click close the panel; the previously-focused row
      regains focus. Verified live: Escape closes it and focus lands back on
      the triggering row's expand button.
- [x] All existing expanded-form functionality (auto-save fields, delete via
      item 2's confirm, research/enrich actions) still works inside the
      panel unchanged. Verified live: delete-from-panel opens the confirm
      dialog stacked above the side panel correctly.

---

## 4. Fix broken todo sorting on iOS

**Current**: `TodoViewModel.swift:20-40`'s `sortedTodos` — incomplete-first
sorted by `position <`, completed sorted by most-recent-first — reads
correctly at a glance, and `ContentView.swift:29` correctly pre-filters to
`parentId == nil` before sorting. `position` is a `String`
(`TodoItem.swift:61`, default `"a0"`), synced via `SyncService.swift:270,290`
(`remote.position ?? local.position`, falling back to `"a0"`) — no obvious
staleness bug there either.

**Leading hypothesis (unconfirmed)**: `FractionalIndexing.swift` (hand-ported
from the npm `fractional-indexing` package the server/web side uses) compares
keys with Swift's native `<`/`>=` string operators throughout (lines 21, 192,
207, 237). Swift's default `String` comparison is Unicode-collation-based,
not guaranteed identical to the JS engine's UTF-16-code-unit comparison the
server generates positions against for the same BASE_62 alphabet. For the
plain ASCII digit/letter range currently in use this usually coincides — but
it's the one place iOS's comparator isn't provably identical to the
server/web's, and the most likely source of an intermittent or edge-case
ordering mismatch.

**Approach**

- Start by writing a failing test (or reproducing manually) that pins down
  the actual observed breakage — "broken" needs a concrete repro before
  fixing blind. Compare against a few known `position` value pairs generated
  server-side (via `fractional-indexing` in `src/shared` or the API) run
  through both Swift's default `<` and a UTF-16-code-unit-safe comparison.
- If the hypothesis holds: replace `FractionalIndexing.swift`'s `<`/`>=` on
  `String` with a comparison over `unicodeScalars` (or explicit UTF-16 code
  units) to match JS string comparison semantics exactly, rather than
  relying on Swift's locale/collation-aware default.
- If the hypothesis doesn't hold: keep investigating `sortedTodos` itself,
  `SyncService`'s merge order, or a stale-cache-read timing issue instead —
  don't force the fix onto `FractionalIndexing.swift` if the repro points
  elsewhere.

**Files**: iOS `FractionalIndexing.swift` (leading suspect),
`TodoViewModel.swift`, `SyncService.swift` (secondary, if the hypothesis
doesn't pan out).

**Acceptance**

- [x] A concrete repro of the current broken ordering is captured (as a test
      or documented manual steps) before the fix lands.
- [x] Todo order on iOS matches web/API order for the same account,
      including at least one previously-broken case from the repro.
- [x] Existing iOS sort/position tests (if any) still pass; add coverage for
      the fixed case.

**What actually happened**: the leading hypothesis was tested empirically
(a standalone `swift` script exercising `FractionalIndexing.swift` directly)
and disproven — Swift's default `String <` matches UTF-16-code-unit
comparison exactly across the full BASE_62 alphabet and across hundreds of
randomly generated multi-character keys; no mismatch reproduced. `sortedTodos`
and `moveTodo` also use plain `<` correctly.

The real defect was elsewhere: `TaskCreationService.fetchAllTodos` sorted its
`FetchDescriptor` with `SortDescriptor(\.position)`, whose default String
comparator is *not* a plain codepoint comparison — verified with a script
that `SortDescriptor` orders `["9", "a0", "A0000...0001", "b1V", "z", "Zz"]`
while `<` orders `["9", "A0000...0001", "Zz", "a0", "b1V", "z"]` for the same
inputs. This didn't affect the main list today (`ContentView`'s
`sortedTodosList` never calls `fetchAllTodos`; the Share Extension and Siri
`AddTaskIntent` paths that do call it only use the result to `.min(by:)`
with the correct comparator, which is order-independent), but it's a
verified, real ordering bug in a shared helper, and the likeliest thing to
bite the *next* caller that assumes the returned array is actually sorted.
Fixed by sorting in memory with `<` after fetch, matching every other
position comparison in the app; added
`fetchAllTodosOrdersMixedCaseKeysLikeRawComparison` as regression coverage
(it fails under the old `SortDescriptor` behavior).

No other broken-ordering repro was found in the code paths investigated. If
the user still observes incorrect ordering in the live app, it needs a fresh
repro (which account/todos, what order was expected vs. shown) since this
audit didn't reproduce it beyond the `fetchAllTodos` defect above.

---

## 5. Submit-on-Enter when adding a todo on iOS

**Current**: `AddTaskInputView.swift:30-39` already has
`.onSubmit { if canAdd { onAdd(.plain) } }` wired — but it doesn't work in
practice. The `TextField` uses `axis: .vertical` (line 30) for auto-growing
multi-line input, and on iOS a vertical-axis `TextField`'s Return key inserts
a newline instead of firing `.onSubmit` — a known SwiftUI/UIKit interaction.
The existing handler is effectively dead code against the keyboard's Return
key today.

**Want**: pressing Return/Enter while composing a new todo submits it, the
same way it already does on web.

**Approach**

- Don't just add `.onSubmit` again — it's already there and doesn't fire.
  Options: (a) detect a trailing `"\n"` in the bound `text` on change,
  strip it, and call the existing `onAdd(.plain)` path; or (b) move off
  `axis: .vertical` for the single-line add case and use `.submitLabel(.done)`
  with a `TextField` that does fire `.onSubmit` normally, accepting a
  different growth behavior for the input; or (c) a `UITextView`-backed
  wrapper if multi-line growth needs to be preserved *and* Return needs to
  submit (shift+Return equivalents aren't a mobile-keyboard concept here, so
  plain Return-to-submit is the right default).
- Prefer (a) if the vertical-growth behavior is otherwise wanted/liked;
  prefer (b) if a single-line add box is acceptable — check current visual
  behavior before picking.
- Keep existing `canAdd` gating (don't submit an empty title).

**Files**: iOS `AddTaskInputView.swift`.

**Acceptance**

- [x] Pressing Return on the keyboard while composing a new todo submits it
      (when `canAdd` is true), without requiring a tap on the Add button.
- [x] An empty/whitespace-only title still doesn't submit on Return.
- [x] Whatever visual growth behavior is kept (single-line vs.
      auto-growing) is a deliberate choice, noted here, not an accidental
      regression.

**What actually happened**: went with option (a) — kept `axis: .vertical`
(auto-growing input is preserved) and added an `.onChange(of: text)` handler
that detects a trailing `"\n"`, strips it, and calls the existing
`onAdd(.plain)` path (gated on `canAdd`, which already trims whitespace
including newlines, so an empty/whitespace-only title still doesn't submit).
The pre-existing `.onSubmit` handler was left in place as a harmless no-op
fallback rather than removed.

---

## 6. Move "add subtask" form to the top of the list (web)

**Current**: `SubtaskSection.tsx` renders the active-subtask list at lines
210-231 (`DndContext`/`SortableContext`, sorted by `byPosition`, computed at
line 168), the completed list at lines 233-241, and the "Add subtask" input
block **last**, at lines 244-272 — visually at the bottom. This is now
inconsistent with the actual insert behavior: per
`plans/done/2026-07-17-pre-launch-polish.md` item 5, `handleAdd`
(lines 173-178) already computes
`generateKeyBetween(null, active[0]?.position ?? null)`, so a newly-added
subtask lands at the **top** of `active` on the optimistic update and after
refetch — the form is at the bottom, but new items appear at the top, right
under the "Subtasks" header.

**Want**: the "Add subtask" form renders at the top of the list, next to
where new items actually land.

**Approach**

- Pure JSX reorder — no logic changes. Move the input+button block
  (lines 244-272) to render immediately after the "Subtasks" header
  (lines 197-208) and before the active-list block currently at line 210.
- Verify no `key`/`ref`/focus-management assumption in the surrounding JSX
  depended on the form's previous DOM position (e.g. tab order, a
  `scrollIntoView` targeting the bottom) — skim for any such coupling before
  moving.

**Files**: `src/web/src/components/SubtaskSection.tsx`.

**Acceptance**

- [x] The "Add subtask" input renders directly under the "Subtasks" header,
      above the active subtask list.
- [x] Adding a subtask still inserts it at the top of the active list
      (unchanged behavior, just now visually adjacent to the form that
      created it).
- [x] Completed subtasks still render below active ones, unaffected.

---

## Cross-cutting

- Run `pnpm typecheck`, `pnpm lint`, `pnpm test` after each item (web items);
  SwiftLint + a manual/simulator pass for iOS items, per this repo's known
  limitation that `xcodebuild` scheme/test builds don't run cleanly in this
  dev environment (SDK 26.5 vs. runtime 26.4 mismatch) — note explicitly in
  the PR if an iOS item wasn't simulator-verified, same caveat
  `pre-launch-polish`'s iOS work carried.
- Items 1–3 share `TodoList.tsx`/`TodoItemExpanded.tsx` — land them in that
  file in the order listed (delete button, then confirm dialog, then the
  panel) to avoid three overlapping diffs on the same region.

## Dependencies

- Item 1 depends on item 2 landing first or alongside it (a bare delete
  button with no confirm would be a regression, not a fix).
- Item 3 should land after items 1–2 so the panel ships with the finished
  row actions, not a mid-refactor state.
- Items 4 and 5 are independent of the web items and of each other.
- Item 6 is fully independent.
- Builds on `plans/done/2026-07-17-pre-launch-polish.md` (inline controls,
  auto-save, subtasks-to-top — this plan is follow-on polish on the same
  surfaces).

## Out of scope

- Any new delete-adjacent feature (undo, trash/recovery, bulk delete) — this
  is strictly "confirm before delete," not a bigger data-safety feature.
- Redesigning the expanded form's *content* — item 3 changes only its
  container (inline block → side panel).
- Any other iOS sort/data-model changes beyond the specific ordering bug in
  item 4.

---

## Overview

All six items shipped, each as its own commit. Web: a desktop-only row
delete button, a shared `ConfirmDialog` wired through every delete path, a
sliding side panel replacing the inline expanded form, and the add-subtask
form moved above the active list. iOS: swipe-to-delete now confirms before
deleting, Return submits a new todo despite the auto-growing input, and a
real (if narrow) ordering bug was found and fixed along the way — though not
the one the plan suspected going in.

## Architecture

**Web (items 1, 2, 3, 6 — `TodoList.tsx`, `TodoItemExpanded.tsx`,
`SubtaskSection.tsx`, and two new `ui/` primitives):**

- `src/web/src/components/ui/ConfirmDialog.tsx` (new) — generic title/
  description/confirm-destructive dialog on `@base-ui/react/dialog`. `TodoList`
  owns a single `confirmDeleteId` state; every delete call site (the new
  desktop row button, `TodoItemExpanded`'s delete button, `TodoActionsMenu`'s
  mobile delete item) already funneled through one `handleDelete` prop, so
  centralizing the confirm step there meant no per-callsite plumbing — just
  changing what `handleDelete` does.
- `src/web/src/components/ui/SidePanel.tsx` (new) — right-anchored
  `@base-ui/react/dialog` variant using Base UI's `data-starting-style`/
  `data-ending-style` attributes (via Tailwind's bare `data-*` variant
  shorthand, already used elsewhere in this codebase for `data-disabled`)
  for the slide/backdrop-fade transition, no extra animation library. Reuses
  the existing `expandedId` state as-is — the panel just replaced where
  `ExpandedSection` mounted, not the state model. Expanded rows get a subtle
  `bg-gray-base` tint so they stay visually "selected" while the panel is
  open, per the plan's "likely yes" call.
- `SubtaskSection.tsx`'s change was a pure JSX block move, no logic touched.

**iOS (items 2, 4, 5):**

- `ContentView.swift` — swipe-to-delete no longer deletes directly; the swipe
  action now only stages a `pendingDeleteTodo`, and a single
  `.confirmationDialog` on the view actually deletes on confirm. **Deviation**:
  the plan also expected a delete button inside `TodoEditSheet.swift` needing
  the same treatment — that turned out not to exist (the sheet only has
  `onDeleteSubtask`, no delete-the-parent-todo action), so there was nothing
  to wire there.
- `AddTaskInputView.swift` — kept the auto-growing `axis: .vertical`
  `TextField` and added an `.onChange(of: text)` handler that detects a
  trailing `"\n"` (what Return actually produces in a vertical-axis field),
  strips it, and submits through the existing `onAdd(.plain)` path.
- **Deviation, item 4**: the plan's leading hypothesis — that
  `FractionalIndexing.swift`'s use of Swift's native `String <` diverges from
  the JS/UTF-16 comparison the server uses — was tested directly with a
  standalone `swift` script exercising the port's `generateKeyBetween`
  against both comparators across the full BASE_62 alphabet and hundreds of
  randomly generated multi-character keys. No mismatch reproduced; the
  hypothesis was false. Continuing to investigate per the plan's own
  fallback instructions turned up a real, verified defect in
  `TaskCreationService.fetchAllTodos`: its `FetchDescriptor` sorted with
  `SortDescriptor(\.position)`, whose default String comparator is not a
  plain codepoint comparison (confirmed with a script showing it reorders
  mixed-case fractional-index keys relative to `<`). Fixed by sorting in
  memory with `<` instead, matching every other position comparison in the
  app, with a regression test that fails under the old behavior. This bug
  didn't reach the visible list today (`ContentView`'s list never calls
  `fetchAllTodos`; the two callers that do — the Share Extension and Siri's
  `AddTaskIntent` — only use the result via `.min(by:)`, which is
  order-independent), so it's a latent-but-real fix rather than a confirmed
  repro of what the user actually saw. No other ordering defect was found in
  the paths investigated; if broken ordering is still visible in the live
  app, it needs a fresh repro to chase further.
- No iOS item was verified in a simulator — `xcodebuild` scheme/test builds
  don't run cleanly in this dev environment (SDK 26.5 vs. runtime 26.4
  mismatch, the same known limitation `pre-launch-polish` carried). Verified
  instead via SwiftLint, balanced-braces checks, and (for item 4) standalone
  `swift` scripts exercising the actual production code directly.
