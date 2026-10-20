# Cohesive redesign: one Nylon across web, iOS and Gmail

**Date**: 2026-10-18
**Status**: In Progress. Phase 1 (backend reset) shipped in #386, Phase 0's
prototype is at https://claude.ai/artifact/LdsHRNLhPuVqZ9ejvMnysh, and Phase 2
is next.

## Why

Nylon was designed as an AI-first app: describe a todo and AI does the rest.
Between 20 September and 5 October every AI feature was removed, along with
priority, Google Tasks import and the Pro gate. What remains is a strong
idea — a time horizon that ages todos on its own — inside UI that was shaped
around features that no longer exist.

The history shows the cost of having no fixed target:

- Brand colour went yellow → indigo → yellow → orange → yellow, the last two a
  day apart (#293, #299).
- Completed has had 6 designs and row actions about 9. The composer has sat in
  5 places on web and 3 on iOS.
- iOS kept being reworked to match whatever web had just become, so it
  matches neither web nor itself. The main screen is custom glass, while the
  edit sheet, settings and share extension are stock forms.

The backend is not the problem. Sync, recurrence, the midnight sweep, offline
iOS and the schema all work. This plan **keeps the backend and its behaviour,
resets its history, and rebuilds the UI layer on every platform against one
spec.** This document is that spec. Each platform implements it, and none
copies another.

## Principles

1. **Time is the structure.** Today, This Week and Someday are a flow that
   todos move through. Lists are permanent collections. The two are presented
   differently.
2. **Capture in one motion.** Adding is a single gesture everywhere, and the
   todo lands where you're looking.
3. **Done means gone.** A checked todo leaves straight away, with Undo. It
   doesn't move to another column, page or section.
4. **Rows carry information, not controls.** Actions live in gestures,
   context menus and the keyboard. Rows have no visible handles, toolbars or
   chevrons.
5. **One design, three densities.** Phone, wide screen and the Gmail card
   share the same structure, the same order and the same words.
6. **Editorial type, native behaviour.** Archivo display type and hairline
   rules provide the hierarchy. Each platform keeps its own conventions:
   sheets, swipe, haptics, Dynamic Type, keyboard shortcuts.
7. **Settled stays settled.** Decisions in [Settled](#settled) need a written
   reason to reopen, not a polish pass.

## Settled

| Decision | Choice |
| --- | --- |
| Third horizon list | **Someday** (renamed from "Sometime" everywhere: code, enum, copy) |
| Completing a todo | Leaves the list immediately, with an Undo toast |
| Visual direction | Editorial: Archivo display, hairline rules, generous whitespace |
| Due date vs list | Independent. Lists only ever move backward, through the sweep |
| Custom lists | Never age |
| Saving | Every edit saves instantly. No Save/Cancel on any platform |
| Noun | "todo" in UI copy (not "task") |
| Pin vs Sticky | **Pin** in UI and code |
| Brand accent | Yellow, as a fill with dark ink only |
| List membership | One list per todo. Today, This Week, Someday and your lists are all lists; moving between them moves the todo. "When" and "which list" were considered as separate fields and declined (2026-10-19) |

## Model

What exists after the redesign. Anything not listed here is deleted.

- **Todo**: title, notes, due day, repeat, pinned, subtasks (one level), links.
  Belongs to exactly one list. Repeat and subtasks stay mutually exclusive.
- **Horizon**: Today → This Week → Someday.
  - Aging rules are unchanged: Today gets a full day, then moves at the next
    local midnight (#379). This Week moves to Someday after 7 days. Someday is
    terminal.
  - Nothing ever moves forward on its own, and the sweep never touches done
    todos.
- **Lists**: user-named collections, ordered, never age. Deleting a list
  deletes its todos, behind a confirmation.
- **Done**: `completed` stays in the database.
  - Undo needs it, Gmail ticks need it, and completed todos keep their
    `listId` so they can be restored to the right list.
  - Completing a repeating todo advances its due date in place, as it does
    today. The row stays and briefly shows its new date.
- **Timezone**: every client sends the device timezone automatically.
  - Web detects it with `Intl`. iOS uses `TimeZone.current` and reports it on
    launch and when it changes.
  - Settings shows a manual override.
  - The sweep reads `users.timezone`; it never read `location`.

**Deleted:**

| Item | Reason |
| --- | --- |
| The Completed system list (`systemKind: "completed"`, migration 0026) | Done means gone |
| `users.location` | Only the removed research agent read it. The sweep uses `timezone` |
| `users.plan` | The Pro gate was removed in #234; now only shown in admin |
| `users.hide_completed` | Nothing left to hide |
| "Process links" | Link titles fetch automatically. A failed fetch gets a Retry item in the link's menu |
| The iOS Location settings section | Same reason as `users.location` |

## Vocabulary

One set of words. Code identifiers follow the UI words where practical.

| Concept | Word | Not |
| --- | --- | --- |
| The item | todo | task |
| The three time lists | Today, This Week, Someday | Sometime, buckets |
| User collections | Lists | custom lists, boards |
| Keep at the top | Pin / Unpin | Sticky |
| Finish | Done (verb: "Mark done") | Completed, complete |
| Calendar day it's due | Due | Due date, deadline |
| Recurrence | Repeat | Recurring |
| Child items | Subtasks | Steps |
| Attached URLs | Links | Resources, URLs |

## Structure

### Phone (iOS, and web under 1024px)

```
┌────────────────────────────────┐
│ N                          ( ) │  wordmark · avatar (Settings, Done, sign out)
│                                │
│ Today   This Week   Someday   ⋯│  editorial switcher: current title is large,
│ ────────────────────────────── │  others smaller; "⋯" opens Lists
│ ☐ Review PR for the sync engine│
│ ☐ Finish quarterly report      │
│   Today · ▤                    │  meta line
│ ☐ Plan Lisbon trip             │
│   Fri · 1/4 · ▤                │
│                                │
│                                │
│ ┌────────────────────────────┐ │
│ │ Add to Today…            ↑ │ │  composer, anchored to the keyboard
│ └────────────────────────────┘ │
└────────────────────────────────┘
```

- **Swiping** horizontally moves between Today, This Week and Someday. The
  switcher titles follow your finger.
- **Lists** (`⋯`) is a page of collections, with the list count and a New
  List row. Tapping a collection pushes it with the same row and composer.
- **Settings and Done history** live under the avatar.

### Wide (web 1024px and up, iPad)

```
┌──────────┬─────────────────┬─────────────────┬─────────────────┐
│ N        │                 │                 │                 │
│          │ Today           │ This Week       │ Someday         │  titles share a baseline
│ Lists    │ ─────────────── │ ─────────────── │ ─────────────── │
│ Groceries│ + Add           │ + Add           │ + Add           │
│ Studio   │ ☐ …             │ ☐ …             │ ☐ …             │
│ + New    │                 │                 │                 │
│          │                 │                 │                 │
│ Done     │                 │                 │                 │
│ Settings │                 │                 │                 │
└──────────┴─────────────────┴─────────────────┴─────────────────┘
```

- **The three horizon columns are always visible.** This keeps the current
  board's strongest quality: hairlines and shared-baseline titles.
- **Selecting a collection in the sidebar opens it as a fourth column** on
  the right. One collection column at a time: selecting another swaps it,
  and selecting the open one closes it.
- **Dragging works across every visible column**, collections included.
  Because a todo belongs to exactly one list, dropping it into another
  column *moves* it. Dragging "Mix the new EP" from Studio into This Week
  takes it out of Studio.
- **768–1024px** web uses the phone layout, centred, with a max width.

### Gmail card

The card format controls the visual design, so Gmail matches on structure
and words instead.

- **Homepage:** a composer with a list dropdown (default Today). Below it are
  Today and This Week sections with tick-to-done. Someday is collapsed to a
  count with a link to the web app.
- **Message open:** "Add to Nylon". The title is the subject and the message
  is attached as a link. Default list is Today, with the same dropdown.
- **Copy:** uses the [Vocabulary](#vocabulary) table exactly.

## Interactions

### Adding

- **One composer behaviour.** Return adds the todo and keeps focus, for rapid
  entry.
  - Pasting several lines adds one todo per line.
  - Text past the title limit spills into notes (`splitTodoText`).
  - A URL-only entry is titled from the page once it's fetched.
- **Target list.** Defaults to the list you're looking at. When focused, a
  chip row appears under the field: `Today · This Week · Someday · List ▾ ·
  Due`.
- **Typed dates.** A small deterministic parser handles "today", "tomorrow",
  weekday names, "next week" and "oct 30". It turns the date into the due
  date, shown as a "Due Fri ×" chip; tapping × keeps the words as typed. No
  AI.
  - Weekdays, "next week" and month dates only count at the **end** of the
    text, so "Call Mum about Sunday lunch" stays a title. "Today" and
    "tomorrow" count anywhere.
  - Lives in `@nylon-impossible/shared` with a Swift mirror, sharing test
    fixtures the way `recurrence-test-fixtures.ts` does.
  - The server also runs it for Siri, Share and Gmail input.
- **Phone:** the composer sits at the bottom, attached to the keyboard.
- **Wide:** an `+ Add` row at the top of each column. `n` adds to the focused
  column, Today by default.
- **Other entry points (Siri, Share extension, Gmail, widget quick-add):**
  same defaults and same parser. Siri and Share also take a list parameter.

### Row

- **Anatomy:** checkbox, then the title (up to 3 lines), then one meta line.
  - The meta line shows, only when set: due ("Today", "Tomorrow", "Fri",
    "Oct 30", "3 days overdue" in red), a repeat glyph, subtasks `1/4`, a
    notes glyph, and the first link's favicon and domain.
  - Pinned todos sit in a group at the top with a small pin glyph. No other
    marker.
- **Primary actions:** tap the checkbox to mark done; tap the row to open the
  detail.
- **Touch:**
  - Long-press opens the context menu: Move to Today / This Week / Someday,
    Pin, Delete. Delete gets an Undo toast instead of a confirmation dialog.
    There are no drag handles.
  - **No row swipe actions.** A horizontal swipe on the list pages between
    Today, This Week and Someday. Row swipes would fight it, and paging is
    the more frequent gesture. (Found while building the prototype.)
  - Dragging starts from the long-press. Dropping a todo on a switcher title
    moves it to that list, which is the phone version of dragging between
    columns on wide.
- **Pointer:**
  - Grab the row anywhere except the checkbox to drag.
  - Right-click opens the context menu: Move to…, Due…, Pin, Delete.
  - Hover only tints the row. No controls appear.
- **Keyboard (wide web):**

  | Key | Action |
  | --- | --- |
  | `j` / `k` | Move focus |
  | `x` | Done |
  | `Enter` | Open |
  | `1` / `2` / `3` | Move to Today / This Week / Someday |
  | `p` | Pin |
  | `d` | Due |
  | `Backspace` | Delete |
  | `n` | New todo |

### Detail

Same content and order on every platform:

1. **Title**: display type, the largest text on screen, edited in place.
2. **Properties row** of chips: List ▾, Due ▾, Repeat ▾, Pin.
3. **Notes**: autosave.
4. **Subtasks**: same row anatomy, smaller.
5. **Links**: cards. Each card's menu has Show as URL, Retry, Remove.
6. **Footer**: Delete (quiet), then created and edited times in meta type.

It opens as a sheet with medium and large detents on iOS, a full-height sheet
on mobile web, and a right-hand panel on wide web. Closing it is the only way
to "finish"; there is nothing to save.

### Done

1. The checkbox fills with the accent and the check draws in (~200ms, with
   haptics on iOS).
2. The row holds for ~400ms, then collapses (height and opacity, ~250ms).
3. A toast shows "Done · Undo" for 5s.
4. **Done history** (avatar menu on phone, sidebar on wide) lists done todos
   by day. Unchecking one restores it to its original list.

### Overnight

When the sweep moved things, Today shows a single quiet line the next
morning, e.g. "3 moved to This Week". It goes away once Today is scrolled or
anything is added.

### Empty states

These are written lines, not illustrations. For example: "Nothing today. 4
waiting in This Week." Tapping the count goes to This Week.

## Visual language

- **Type:**
  - Archivo Variable for display: wordmark, list titles, detail title. iOS
    bundles it, so iOS and web match.
  - System UI for text (SF on Apple platforms).
  - Scale on phone: Display 34, Title 22, Body 17, Meta 13. On wide: Display
    40, Title 22, Body 15, Meta 13.
  - iOS maps each size to a Dynamic Type style and scales Archivo with
    `UIFontMetrics`.
- **Colour:**
  - Radix gray neutrals and red for overdue and destructive.
  - One accent: brand yellow. It's used for fills only (the done checkbox,
    the composer send button, focus rings), always with dark ink on top.
  - Yellow is never used as text on white. This replaces the current
    yellow-outline "Settings" button.
- **Structure:**
  - Hairline rules separate things; cards and shadows don't.
  - The only floating element is the composer, which uses Liquid Glass on
    iOS.
  - Radius 6 for chips, 10 for fields. Sheets use the system radius.
- **Spacing:** 4pt grid. Rows are at least 44pt tall.
- **Motion:**
  - `fast` 150ms, `base` 220ms, `slow` 320ms, all on the existing
    `--ease-out-strong` curve.
  - Reduced motion keeps opacity changes and drops movement.
- **Icons:** lucide on web, SF Symbols on iOS, with a mapping table in the
  tokens package so the same glyph means the same thing.
- **Tokens:** one source, `src/shared/design/tokens.json`, generates the web
  CSS variables and a Swift `Theme.swift`. Nothing outside those generated
  files hard-codes colour, size or duration. This replaces
  `radix-utilities.css` (651 lines) and `Color+Hex.swift`.

## Phases

Each phase ships on its own.

### 0. Prototype the phone experience (done)

A clickable HTML prototype (an artifact, linked in the Status line) of the
phone structure, built to settle how it feels before either codebase changed.
It covered:

- the switcher and swiping between lists
- the composer with chips and typed dates
- done-then-gone with Undo
- the detail sheet

Its findings are folded into this spec. The main one: row swipe actions were
dropped, because they fight the horizontal paging (see
[Row](#row)).

### 1. Backend reset (shipped in #386)

Started the backend from a clean database and migration history that already
reflect the model above. Kept here as a record; there's nothing left to do.

- **Squashed migrations.** The 31 migrations in `src/api/migrations/` were
  replaced with one `0000_baseline.sql`, and drizzle-kit's `meta/` was
  regenerated so `bun run db:generate` works again.
- **Schema changes folded into the baseline:**
  - `systemKind` enum is `today | thisWeek | someday`.
  - `users.location`, `users.plan` and `users.hide_completed` were dropped.
- **Removed the code that served the deleted items:**
  - Completed list provisioning.
  - The location and plan handlers in `users.ts` and `admin.ts`.
  - Plan UI in admin. Admin keeps only the users list and delete.
  - The iOS Location section and preferences.
  - The `/todos/:id/process` button paths.
  - The dead code listed in the audits: `EmptyState`, `useTodoWithUrls`,
    unused `Tooltip`, the `.todo-list-ios-offset` CSS, unused props.
- **New databases.** Production and preview moved to new D1 databases, with
  the baseline applied. The old databases stay untouched as a backup until
  the new ones have run cleanly for a while, then get deleted.
- **Data.** Todos, lists, subtasks and links were copied across with a one-off
  export/import script (`scripts/db-reset/`).
- **Deploy notes:**
  - The TestFlight build at the time spoke `sometime` and `completed`, so the
    iOS update shipped in the same window.
  - Expand/contract didn't apply to a fresh database, because the old workers
    kept pointing at the old database until they were replaced.

### 2. Shared foundations

- The tokens package and its CSS and Swift generators.
- The date parser with its Swift mirror and shared fixtures.
- Vocabulary renames in code: Sticky → Pin, Completed → Done. (Sometime →
  Someday already shipped in #386.)
- Automatic timezone reporting from both clients.

### 3. Phone: iOS and mobile web together

- **iOS:** keep `Models/` and `Services/`, rewrite `Views/` against this spec.
  - The edit sheet, settings and share extension all use the same
    components; no stock `Form` styling.
- **Web:** a new component tree for the phone layout that reuses `useTodos`,
  the sync and the server functions. `TodoGrid.tsx` and `TodoList.tsx` are
  replaced, not refactored.

### 4. Wide web and iPad

The sidebar and three columns, the collection column, keyboard map and
context menus.

### 5. Edges

- Siri gets a list parameter.
- The share extension uses the shared composer component.
- The Today widget gets a quick-add control.
- The Gmail card is brought in line with this spec.
- The landing page and marketing screenshots are updated.

### 6. Quality pass

Every screen on every platform is checked against this list:

- light and dark mode
- Dynamic Type XL on iOS, 200% zoom on web
- reduced motion
- keyboard-only use on web
- VoiceOver and screen-reader labels
- empty, loading, error and offline states
- 44pt targets
- no layout shift when completing a todo

`marketing.yml`'s capture also produces a **parity sheet**: the same screen
on iOS and web side by side, so mismatches are visible in review instead of
discovered later.

## Resolved questions (2026-10-18)

- **Backend reset data:** copy your production todos, lists, subtasks and
  links into the fresh database with a one-off export/import script. The old
  database stays as a backup.
- **Admin app:** keep a minimal version: the users list and delete. Drop the
  plan toggle and the location fields.
- **Done history:** Undo toast plus a lightweight Done view, grouped by day,
  where todos can be restored.
- **Brand accent:** yellow, now settled. Used only as a fill with dark ink,
  never as text on white.
