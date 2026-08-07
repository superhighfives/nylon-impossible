---
title: Time-Bucket Lists (Today / This Week / Sometime + custom lists)
status: Backlog
created: 2026-08-06
updated: 2026-08-06
---

## Problem / Opportunity

Nylon today is one flat list per user (top-level todos + subtasks), sorted by
position with due date and priority as metadata on individual items. That
works, but it asks the user to hold "how urgent is this, really?" in their
head for every item, forever — a todo added six months ago with no due date
sits in the same undifferentiated pile as something due this afternoon,
distinguished only by manual drag position or a due-date badge you have to
read.

The reimagining: **time itself becomes the primary organizing structure.**
Three built-in lists — **Today**, **This Week**, **Sometime** — plus an
unlimited number of user-named custom lists (**"Movies To See"**, **"Book
Recommendations"**, etc., per the attached wireframe). Todos in the three
built-in lists **age out automatically**: something in Today that isn't
finished falls back to This Week after a day; something in This Week that
isn't finished falls back to Sometime after a week, where it stays until
manually promoted. You can also drag items between lists directly at any
time. Custom lists don't participate in this aging — they're flat, permanent
containers for open-ended collections that were never about urgency in the
first place (a movie list has no "due date" in any meaningful sense).

**Priority is removed entirely.** Time-bucket + due date carries all the
urgency signal priority used to carry, and having both was redundant with a
model this explicit. Priority removal has been peeled off as its own ready
item, `plans/ready/2026-08-06-remove-priority.md`, and can ship independently
of everything else in this backlog item — see References.

## Reference

Wireframe (grid-of-columns, web): `Nylon Impossible` header, `Settings`
button top-right, then columns left-to-right: **Today**, **This Week**,
**Sometime**, then any number of custom lists (**Movies To See**, **Book
Recommendations**), ending in a **+ New List** affordance. Each column is a
simple vertical list: checkbox, bold title, short description, with
completed items shown greyed-out and struck through beneath active ones. The
**grid layout itself is a load-bearing part of the idea** — all lists
visible side by side on web, not a single-list-at-a-time view with a picker.

## Concept, item by item

### The three built-in lists

- **Today** — the "what am I doing right now" list. Answered questions
  below settle exactly how due date and Today interact, but the headline
  intent from the request: "today would be automatically due today."
- **This Week** — the near-horizon list. No forced due date; due dates here
  are optional and independent of bucket membership (see Q1 below — bucket
  and due date are **separate fields**, not one derived from the other).
- **Sometime** — the long tail. Everything that isn't urgent lives here
  until pulled forward. This is the new home for what's today's "no due
  date, low priority, sits at the bottom" todos.

### Auto-demotion

- Today → This Week after a day (if not completed).
- This Week → Sometime after a week (if not completed).
- Sometime is terminal — nothing auto-demotes further; it stays until a
  human moves it.
- **Falling out of a list clears the due date** — explicitly stated in the
  request: "If an item falls out of today into this week the due date gets
  removed. Same with this week into someday." This is a real, observable
  side effect on real data, not just a UI reshuffle — worth being careful
  about in the eventual spec (is this reversible? does the user get any
  signal it happened?).

### Custom lists

- Unlimited, user-named, created via **+ New List**.
- **Flat and non-temporal** — no aging, no due-date coupling. Items sit
  until manually dragged elsewhere or completed. (Confirmed during
  brainstorming — this was the leading option and is now settled, not just
  a recommendation.)
- Presumably rename/delete/reorder are all supported on custom lists but not
  on the three built-in ones (Today/This Week/Sometime are structural,
  not user data) — worth confirming explicitly when this moves to ready.

### Manual drag

- Items can be dragged between any lists at any time, not just aged out
  automatically. Within a list, presumably still reorderable by position the
  way today's drag-to-reorder works (fractional indexing, scoped per list —
  same pattern already established for subtasks being scoped by `parentId`
  and, per the sticky-todos plan just written, for sticky/non-sticky tiers
  being scoped by the `sticky` flag).
- **Sticky todos are unaffected by this reimagining.** Confirmed during
  brainstorming: "sticky just means the item stays at the top of the list,
  nothing else." A sticky todo sitting in, say, This Week stays pinned to
  the top of This Week specifically — sticky is a per-list positional
  property, orthogonal to which list an item is in. No redesign needed
  there; the two features compose cleanly.

### iOS

- **Paged, swipe-only navigation for v1** (confirmed during brainstorming,
  over a Trello-style scrollable grid): one list fills the screen, swiping
  left/right pages between Today → This Week → Sometime → custom lists (in
  whatever order the user's lists are arranged). No zoomed-out multi-column
  view planned for the first iOS pass — that's explicitly deferred, not
  ruled out forever.
- Web keeps the full grid from the wireframe — all lists visible side by
  side, scrolling horizontally past however many custom lists exist.

## Rough shape (to be specced later)

- New `lists` entity: id, userId, name, `kind` (`system` vs `custom`),
  `systemKind` (`today` | `thisWeek` | `sometime` | null for custom),
  position (for custom-list ordering, and for where Today/This Week/Sometime
  sit relative to custom lists in the grid/swipe order), timestamps.
- `todos.listId` foreign key replacing (or supplementing?) whatever implicit
  grouping exists today. Position stays a per-list fractional-index scope,
  same shape as the existing `parentId`-scoped subtask pattern.
- A scheduled job (Cloudflare Cron Trigger) doing the daily/weekly
  auto-demotion sweep — needs a precise definition of "after a day" /
  "after a week" (see open questions).
- Every existing todo-mutation surface (REST, Gmail add-on, smart-create,
  the sticky-todos row button, the row/list-polish plan's delete+panel work)
  needs to become list-aware — this touches nearly everything in
  `src/api/src/lib/todos-core.ts` / `create-todo.ts`, both web and iOS
  list-rendering code, and the Gmail add-on's homepage card query.

## Open questions (lots — resolve before this becomes a ready spec)

**Settled during brainstorming** (recapped here for the record):

- Bucket is a **separate field from due date**, not derived from it — a
  todo has both a list and an optional independent due date.
- Custom lists are flat/non-temporal, no auto-demotion.
- iOS v1 is paged-swipe only, no grid view.
- Sticky todos are unaffected — orthogonal, per-list pinning.

**Still open:**

- **If bucket and due date are separate, what exactly does "Today would be
  automatically due today" mean mechanically?** Candidates: (a) every item
  in the Today list has its due date force-set to today's date, read-only
  while it's there; (b) Today just implies "due today" as a display
  convention without actually writing a due date; (c) something else. This
  is probably the single most important mechanical detail to nail down
  before specifying further — it determines whether Today is really a
  distinct list or effectively a filtered view of "due date = today."
- **Does reaching a due date auto-promote an item into Today?** e.g. a This
  Week item due next Friday — does it jump to Today automatically when
  Friday arrives, or does the user have to notice and drag it? Reconciling
  this with the auto-demotion direction (Today → This Week → Sometime) is
  probably the crux of the whole design.
- **What's the precise timing of "after a day" / "after a week"?** Calendar
  midnight in the user's local timezone? A rolling 24h/7d window from when
  the item entered the list? This matters for a scheduled job's exact
  semantics and needs a real answer, not "roughly."
- **What determines which list a brand-new todo lands in?** Today by
  default? Whatever list was open when it was created (matches the grid
  metaphor — add directly into a column)? Does smart-create / quick-add need
  a list picker, or does it always default somewhere specific?
- **Recurring todos**: when a recurring todo's next occurrence fires, which
  list does the new occurrence land in — Today (since it's newly due), or
  wherever the previous occurrence was?
- **Subtasks**: do they belong to the same list as their parent implicitly
  (no independent list membership), matching how they're already scoped to
  their parent for position? Recommend yes — subtasks have never had
  independent top-level-list membership and there's no obvious reason to
  start now.
- **What happens to a demoted item's due date "getting removed" from the
  user's point of view?** Silent, or does the user see some signal ("this
  moved to This Week and lost its due date") so it isn't a surprise days
  later?
- **Does Sometime remain literally has no due dates at all, or can an item
  in Sometime still carry an optional due date** (e.g. "someday, but by next
  March") independent of bucket, per the "bucket is separate from due date"
  decision? The original request says due dates are "available for
  everything after today," which reads as yes — but worth confirming since
  it affects the UI (does Sometime show a due-date control at all?).
- **Migration of existing data**: every existing todo needs a `listId` on
  day one. Do all pre-existing todos land in Sometime (safest, least
  surprising — nothing suddenly appears in Today that wasn't already due
  today)? Do ones with a due date land based on that due date once, at
  migration time, then behave normally after?
- **The wireframe's "Name of Resource" chips and the sad-face icon on
  greyed completed items** — the chips read as attached-link/resource
  previews (an existing concept, `UrlPreviewCard`/`EmailPreviewCard`); the
  icon on completed items isn't self-explanatory from the wireframe alone —
  confirm intent when this gets fleshed out further, don't guess.
- **Does search/filtering need to span all lists**, or is "which list is
  this in" itself the primary navigation, making cross-list search less
  necessary than it is today?
- **What happens to `plans/ready/2026-08-06-todo-row-and-list-polish.md`'s
  side-panel and delete-button work**, and the sticky-todos plan, once this
  ships? Both were specced against the current flat-list model — likely
  still valid (the row itself doesn't change shape, only its container),
  but worth a compatibility pass when this moves toward ready.

## Incremental path

Priority removal (see Problem/Opportunity above) has already been peeled off
and specced as `plans/ready/2026-08-06-remove-priority.md` — ship that
independently, ahead of everything else here. Everything else in this idea
(lists entity, auto-demotion cron, per-list positions, iOS paging) depends on
enough of the open questions above being answered that it isn't ready to peel
off piecemeal yet.

## References

- Wireframe supplied 2026-08-06 (grid of columns: Today, This Week,
  Sometime, custom lists, `+ New List`).
- Related: `plans/ready/2026-08-06-remove-priority.md` (priority removal,
  peeled off as its own ready item), `plans/ready/2026-08-06-sticky-todos.md`
  (confirmed compatible, orthogonal), `plans/ready/2026-08-06-todo-row-and-list-polish.md`
  (row/UI work that likely survives this reimagining unchanged in shape),
  `plans/done/2026-07-17-pre-launch-polish.md` (existing due date inline-
  editing this reimagining will remove/replace).
