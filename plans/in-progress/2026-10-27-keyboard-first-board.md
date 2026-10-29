---
title: "Keyboard-first board: wide layout, menu bar, phone and Gmail polish"
status: In Progress
created: 2026-10-27
updated: 2026-10-28
---

# Keyboard-first board: wide layout, menu bar, phone and Gmail polish

The interactive prototype for everything here is the canvas at https://claude.ai/artifact/LdsHRNLhPuVqZ9ejvMnysh (artboards: Phone, Wide, macOS menu bar, Gmail home, Gmail with an email open). It's the reference for behavior and feel. Don't port its code: it's inline styles and sample data.

Read [PRINCIPLES.md](../../PRINCIPLES.md) first. Several of its Settled rows come from this plan.

## How to build this

Treat this like the October redesign: this spec is the source of truth, and the work lands as a series of small PRs, one per phase or sub-phase below.

**Build from the decisions written here, not from the prototype's code.** The canvas is all inline styles and sample data. Use it to check behavior and feel: open the matching artboard, press Play, and compare. When the canvas and this spec disagree, this spec wins. If the difference matters, fix the spec in the same PR.

**Less of this touches the backend than it looks.**

- **Several links per todo** already work in the data: the `todo_urls` table holds any number. What's missing is a way to add one to an existing todo, hence the new endpoint below.
- **Colors** come from `src/shared/design/tokens.json`, which generates both `src/web/src/styles/tokens.css` and iOS `Theme.swift`.
- **The rest is UI.** The only other server work is the Gmail cards, and changing "This Week" to "This week" in copy the API sends (card text and notifications).

### Order of work

1. **Shared foundations: one small PR, first.**
   - Change `destructive` to red-11 in `tokens.json` and run `bun run tokens`.
   - Do the sentence-case pass across every app, changing visible copy only, not identifiers, enum values, route paths or stored data.
   - Update the tests that assert on that copy.

   It's low risk and every later PR builds on it, so merge it before starting anything else.
2. **Wide web: the big piece, in three PRs.**
   1. **Layout.** Click to select, and a second click or Enter to open. The always-present fourth column with Done as its default, and the detail opening into it. The sidebar's fill and keyboard-bar states. The toolbar with its quick-add and New list popovers. List rename in place, the ⋯ menu, and delete with Undo.
      - *As built:* the toolbar's Search button arrives with the palette in 2.2, so 2.1's pill holds New todo and New list. Opening a todo leaves focus on the board (that's what lets the detail follow the selection), so Esc closing the open todo landed here rather than in 2.2. `n` still focuses the column's Add field; on Done, which has none, it opens quick add. Keys fall back to the selection only while focus is on the board, until 2.2 gives the sidebar and toolbar their own keyboard model.
   2. **Keyboard.** Moving between the sidebar and the board, Esc backing out, G sequences, ⇧-digits, the ⌘K palette and M (Move to). Build one command registry first, and have the shortcuts dialog, the palette, the right-click menu and the key handler all read from it. If each keeps its own list they drift apart, which is how the composer ended up in five places before the October redesign.
      - *As built:* the registry is `wide/commands.ts`: each command has an id, label, key caps, bindings (by `key`, or by `code` for ⇧-digits), a group, and `run(board)` against a `Board` interface that `WideApp` implements. Commands opt into the menu and the palette with a label function for the todo they act on. Because the right-click menu now reads the registry, it shows Mark done, the time lists, Move to a list… (M), Pin, Due… and Delete with their keys, rather than one "Move to" item per list. Keys that act on a todo still only act while focus is on the board. Quick add and New list hand focus back to the selected row when they close, like the palette. `o` stays with links in 2.3. `WideApp.tsx` ended up around 1,150 lines; it was split between 2.3 and phase 3 (`plans/done/2026-10-28-split-wide-app.md`).
   3. **Details.** Adding several links (the endpoint, the detail's "Paste a link" field, clickable row links, `o`). The orange overnight banner in its reserved space. Tidier tab stops (one per column) and the soft focus backgrounds.
      - *As built:* the API and the field share `normalizeLink` from `@nylon-impossible/shared`, so "That doesn't look like a link." shows before a request is made; the error code is `invalid_url`. Web calls the endpoint directly (as it does smart-create), so there's no web server function for it. The detail sheet is shared, so the phone already has Links always shown and the "Paste a link" field; phase 4 only needs to check it. On wide the pill drops the word "overnight" (the moon says it); the phone line keeps it until phase 4. The wide row is a container (pointer clicks and drags) holding the title button and the meta line, and the phone row is unchanged. `src/marketing/audit.ts` was still looking for the 2.1-era detail panel; it now opens the detail in the fourth column and also audits the palette, Move to and quick add. After phase 2: 68 screens, no axe violations, Esc closes every overlay, one tab stop per column.
3. **iPad and Mac (SwiftUI wide):** the same behavior as web, built after phase 2 so it copies something already settled and reviewed. This phase also includes:
   - the Mac toolbar (Search, New todo, New list);
   - list delete with Undo in place of the confirmation dialog;
   - the iOS link-adding UI;
   - the menu bar popover's keyboard model, and its focus fix.

   Split like phase 2: **3.1 layout** (the fourth column, select then open, the sidebar's fill and bar, the toolbar with quick add and New list, rename in place, list delete with Undo on every Apple layout), **3.2 keyboard** (two levels, jumps, the palette as a `CommandMenu`, Move to, Search in the toolbar, the Keyboard shortcuts item, `BoardMenuCommand`/`BoardKey` as the registry), and **3.3 details** (links, the overnight pill, the menu bar popover).
      - *3.1 as built:* the inspector is gone; the detail renders in the fourth column, so the Mac board no longer has a separate inspector hosting view. Settings is a sheet on iPad (its own window on a Mac, as before). Done reads from `ContentView`'s todos rather than `DoneHistoryView`'s own `@Query`. The `inspector` screen route keeps its name and now shows the detail in the fourth column. The sidebar's shortcut hint stays until 3.2 replaces it with the Keyboard shortcuts item. List delete with Undo replaces the confirmation on the phone too, and its toast counts every todo in the list, done ones included (they go with it).
4. **Phone (iOS and mobile web together):**
   - the Done button beside the avatar, and Done as a top-level page;
   - the space kept for the banner on every top-level page;
   - adding links in the phone detail.

   Check that Share is still in the iOS detail sheet's header. It already exists, so this is a check, not new work.
5. **Gmail:** the card changes, all within what Card Service can render, including the window that keeps ticked todos on the card.

**Running in parallel.** Once phase 1 is merged, web and iOS can be built at the same time in separate worktrees. Phase 3 should still follow 2.1 at least, so the Apple layout copies a settled web layout. Gmail (phase 5) touches only the API and can run any time after phase 1.

### Working on a phase

- **Starting:** move this file to `plans/in-progress/` and set `status: In Progress` when the first phase starts. Keep it there until every phase has shipped, ticking off the checklist below as PRs merge. If a decision changes while building, update this spec in the same PR, so the next phase reads the current truth.
- **Branches:** one branch per PR, named for the phase, for example `board/1-foundations` or `board/2-1-wide-layout`.
- **Checks before each PR:**
  - `bun run check`, `bun run typecheck` and `bun run test` must pass.
  - `bun run tokens:check` must pass after any token change.
  - Apple PRs: compile-check the iOS targets and run SwiftLint from `src/ios/Nylon Impossible/`.
- **Reviewing against the prototype:**
  - Apple PRs get Before | After screenshots from `fix-shots` (`src/marketing/fix-shots.ts`). Use the matching `-NylonScreen` routes, and add a route when a new screen needs one (for example the palette, or the menu bar popover with a selected row).
  - Web PRs describe how to try the change on the PR preview at `pr-{N}.nylonimpossible.com`.
- **Screenshots and audits:** after phases 1, 2 and 4, rerun `src/marketing/audit.ts` against a seeded dev server, and regenerate the marketing and `--parity` screenshots. The copy and layout both change.
- **Finishing:** when the last phase merges, move this file to `plans/done/` with Overview and Architecture sections, as `plans/README.md` describes. Record any deviations honestly.

### Checklist

- [x] 1. Shared foundations (tokens, sentence case)
- [x] 2.1 Wide web: layout
- [x] 2.2 Wide web: keyboard, command registry, palette, Move to
- [x] 2.3 Wide web: links, overnight banner, tab stops and focus
- [ ] 3. iPad and Mac wide, Mac toolbar, list delete with Undo, iOS links, menu bar
  - [x] 3.1 Layout: fourth column, select then open, sidebar, toolbar, rename, list delete with Undo
  - [ ] 3.2 Keyboard, palette, Move to
  - [ ] 3.3 Links, overnight pill, menu bar
- [ ] 4. Phone (iOS and mobile web)
- [ ] 5. Gmail

## Problem

The October redesign (`plans/done/2026-10-18-cohesive-redesign.md`) gave every platform one structure. Using it day to day showed where it falls short:

- **Wide doesn't hold still.** The fourth column comes and goes, and opening a todo squeezes every column to make room for the panel.
- **Clicking a row opens it straight away.** There's no way to pick a todo without opening it, so the keyboard and the mouse act on different things. Wide web has no real selection at all: "selected" means "has DOM focus".
- **The keyboard covers rows, not places.** You can't reach the sidebar, jump to a list, search, or move a todo to one of your own lists without the mouse.
- **Creating things is buried.** New todo and New list have no home on wide, and the Mac toolbar spends a slot on Done instead.
- **Lists can't be managed on web.** `useUpdateList` and `useDeleteList` exist in `src/web/src/hooks/useLists.ts`, but nothing uses them.
- **Links are read-only.** Todos can hold several links (`todo_urls`), but you can only get one in by typing it into the title. There's no endpoint or UI to add one.
- **Small things.** "This Week" is title case everywhere. Destructive red is red-9 at 3.9:1. The menu bar popover doesn't focus its field after the first open. The overnight note pushes rows down. The Gmail card hides a ticked todo before you can untick it.

## Solution

Build what the canvas shows. The order of work is in "How to build this" above; this section describes the end state.

### The wide board

Applies to wide web (1024px and up), iPad and the Mac window.

**Layout**

- The sidebar is followed by four columns, always: Today, This week, Someday, then a fourth.
- **The fourth column** shows, in order of precedence:
  1. the open todo's detail;
  2. otherwise the list you picked in the sidebar;
  3. otherwise Done.

  It never disappears, so the other three never change width.
- **A list column's ⋯ and ×** sit in the header's top-right corner, not beside the title. At 1440px a list column has about 250px for a 40px title, and "Groceries" doesn't fit beside two buttons; the title keeps the full width and wraps to two lines before it breaks a word.
- **Closing things in the fourth column:**
  - Closing a todo (×, or Esc) returns to the list it covered.
  - × on a list returns to Done.
  - Done has no ×.
- **Done in the fourth column:**
  - Its title is in the muted ink color, like a subline. It's the resting state, not a destination.
  - Its rows can be selected like any other column's. X, Space or Enter puts a todo back; Delete removes it.
- **A toolbar row sits above the columns,** with a hairline under it. At the right is a pill of three icon buttons: Search (⌘K), New todo and New list. On the Mac this replaces the toolbar's current New Todo and Done buttons (`ContentView+Mac.swift`).
- **Column headers** are tall enough to hold a two-line banner above the title, and every column reserves that space. The overnight note is a small orange pill above Today's title, 20px clear of the title:
  - text "2 moved to This week", wrapping to two lines and then truncating;
  - colors: light `#B54700` on `#FFF1E0`, dark `#FF9A4D` on `#2B1A0C` (add `notice` and `noticeFill` to `tokens.json`);
  - the text is a link that selects the first todo in This week; the × dismisses it.
- **Each column keeps its Add field,** with no list picker. The column already says which list it is.

**Sidebar**

- Today, This week, Someday, then a "Lists" heading with your lists and "New list".
- At the bottom: Done (with a check icon), Settings, and "Keyboard shortcuts ?". This replaces the old shortcut hint, and the Send feedback item for admins stays.
- **Two indicators, which can combine:**
  - **Grey fill and semibold:** the list currently open in the fourth column. Done never takes the fill; its label goes from muted to ink while it's showing.
  - **A 3px ink bar on the left edge:** the column the selection is in. It's ink, not yellow: yellow on white is about 1.3:1, below the 3:1 an indicator needs.
- **Clicking a sidebar item goes into that column:**
  - A time list selects its last-selected todo, or the first.
  - A list opens in the fourth column and selects its first todo.
  - Clicking the open list again does the same thing; it doesn't close it.
- **New list** opens a small popover, anchored to whichever button opened it (sidebar or toolbar), with a Name field and an Add button. Enter or Add creates the list, opens it in the fourth column and focuses its Add field.

**Selection and opening**

- **Selection is real state,** not DOM focus. It's `selectedTodoId` on iOS already; add the equivalent on web.
- **One click selects. A second click on the selection, a double click, or Enter opens it** in the fourth column.
- **While a todo is open, the detail follows the selection.** Arrowing through rows shows each one.
- **The selected row** gets a 2px ring in the focus ink plus the pressed fill. That ring is the only focus indicator a row has: the row's own title button shows no outline.
- **Roving tab stop:** each column is one stop, on its selected row or else its first. The checkbox and the inline link are out of the tab order (X and O cover them). Anything else you can tab to (sidebar items, toolbar, menu items, ×, ⋯) shows a rounded background at 20% of its text color on `:focus-visible` instead of an outline. Pressed yellow chips get a soft ring instead, so they keep their fill.
- **Links in a row's meta line are real links on wide.** Clicking one opens it in a new tab without changing the selection; clicking anywhere else on the row selects. A link can't sit inside a button, so the row becomes a container: the title is the focusable button, and the container handles mouse clicks. On the phone, links stay in the detail; the target is too small next to "tap to open".

**Lists**

- **A list column's title** is a button: click it to rename in place. Enter or blur commits, Esc cancels.
- **⋯ in the header** opens Rename and Delete list.
- **Delete list** happens straight away, with an Undo toast that names the list and how many todos went with it. It replaces the confirmation on iOS (`ContentView.swift`, the `deletingList` dialog). Hide the list and its todos at once, and commit when the toast expires, the way todo delete already works in `useTodoActions.ts`.

**Quick add (New todo)**

A popover under the toolbar. It's the same component as the Mac menu bar composer.

- **Header:** the target list's name and count, for example "Today 4".
- **Field:** "+ Add to Today…".
- **Chips:** one per list (time lists first, then your lists), with the chosen one filled yellow.
- **Starting target:** the column the selection is in, else Today.
- **Typed dates** show a "Due Fri ×" chip, as the phone composer does.
- **Enter adds and keeps the popover open.** If the todo lands somewhere you can't see, the toast says "Added to Studio" with a View action.
- Esc or clicking outside closes it.

### Keyboard model (wide)

Two levels, the sidebar and the board, plus jumps that work from either.

The existing map in `src/web/src/components/wide/keys.ts` and `Views/Wide/BoardKeyboard.swift` carries over unchanged: j/k and arrows, h/l and arrows, x, 1/2/3, p, d, Backspace or Delete, n, z, f (admin) and ?. On top of it:

| Key | Where | Action |
| --- | --- | --- |
| ← (or h) | First column | Focus the sidebar item for that column |
| ↑ ↓ (or j k) | Sidebar | Move between sidebar items |
| → (or l), Enter | Sidebar | Go into that column (as a click). On New list, Settings or Keyboard shortcuts, Enter presses the button |
| Esc | Board | Close a menu or popover, else close the open todo, else focus the sidebar item for the current column. Esc no longer clears the selection |
| Enter | Row | Open in the fourth column |
| o | Row | Open the todo's first link without opening the detail ("No link on this todo" if none) |
| m | Row | Move to a list (see below) |
| n | Anywhere | Open quick add (it used to focus the column's composer) |
| ⇧N | Anywhere | Open the New list popover |
| ⇧1 ⇧2 ⇧3 | Anywhere | Jump to Today, This week, Someday |
| ⇧4 … ⇧9 | Anywhere | Jump to your lists, in sidebar order |
| ⇧0 | Anywhere | Jump to Done |
| G, then T W S D | Anywhere | Jump to Today, This week, Someday, Done |
| G, then L | Anywhere | Palette showing only lists ("Go to a list") |
| ⌘K, Ctrl+K | Anywhere, even while typing | Command palette |

- **Jumps remember** the last selection per column, so moving away and back lands where you were.
- **G** shows a small hint card ("G Go to · T Today · W This week · S Someday · D Done · L Lists") for 1.2 seconds or until the next key. Any other key cancels it and does its usual job.
- **Use `KeyboardEvent.code`, not `key`,** for ⇧-digits. Shift changes `key` to `!`, `@` and so on.
- **The Mac's ⌘1/2/3 and ⇧⌘D** in `MacCommands.swift` stay as the menu-bar equivalents.

**Command palette (⌘K)**

A centered dialog: a search field (a `role="combobox"` pointing at a listbox), grouped results, and a footer hint.

- **With nothing typed:**
  - **Go to:** the time lists, your lists and Done, with counts and their ⇧-digit hints.
  - **Commands:** New todo, New list, Keyboard shortcuts. With a selection, also Move "…" to…, Mark "…" done and Pin or Unpin "…".
- **When typing:** everything is filtered, and a **Todos** group goes first, searching every todo including Done. Choosing a todo jumps to its column (opening the list if needed) and selects it.
- ↑ ↓ choose, Enter runs, Esc or ⌘K closes. Focus returns to the selected row.

**Move to (m)**

The same dialog, titled "Move "Plan Lisbon trip"".

- It lists every list except the current one, with counts and 1/2/3 hints for the time lists.
- Typing filters. A name that matches no list adds a last option, New list "…", which creates the list and moves the todo in one step.
- Moving shows "Moved to …" with Undo.

**One command registry.** The shortcuts dialog, the palette, the context menu and the key handler must all read from one list of commands (id, label, keys, whether it needs a selection, and what it does), so they can't drift apart. On web it replaces `SHORTCUTS` and `boardKeyAction` in `keys.ts`. On iOS it's `BoardMenuCommand` and `BoardKey`, extended rather than duplicated.

### Mac menu bar popover

- **The field takes focus every time the popover opens.** Today `QuickAddView` starts with `focusRequested = true`, but `MenuBarController` and `QuickAddPanelController` reuse the panel, so `onAppear` only fires once. Request focus on `NSWindow.didBecomeKeyNotification` for a `QuickAddPanel`.
- **The list chips appear once you start typing,** not on focus. ⇥ and ⇧⇥ step through them. Picking a chip also switches the popover to show that list, so the todo lands where you're looking.
- **Enter adds and stays in the field.** Esc clears the field, then closes the popover.
- **↓ from the field moves into the list.** The selected row gets the same ring as on wide.
- **In the list, letters are shortcuts:** ↵ opens in Nylon, X done (stay in the slot), P pin (follow the todo to its new row), O open link.
- **↑ from the top row, Esc, or N** returns to the field.
- While in the list, a footer reads "↵ open · X done · P pin · O link · ↑ or N to type".
- It shows 5 rows, then "+N more in Nylon".

### Phone (iOS and mobile web)

- **Done moves out of the account sheet** to a round check button beside the avatar, after the four tabs:
  - grey normally; yellow with dark ink while you're on Done;
  - announced as "Done", and current when it is;
  - in the tab order straight after Lists, and the last page when swiping.
  - The account sheet keeps Settings and Sign out (and Send feedback for admins).
  - Files: `Views/Shell/Switcher.swift`, `AccountSheet.swift` on iOS; `PhoneApp.tsx`, `AccountSheet.tsx` on web.
- **Done is a top-level page,** with no "‹ Today" back button and its title at the same height as the others. The title stays ink on the phone.
- **Every top-level page reserves the banner's space** above its title, so titles don't move when the overnight note appears or is dismissed. The note is the same orange pill as on wide, 20px below the tabs.
- **Share** stays in the iOS detail sheet (`TodoDetailSheet+Sections.swift`). Web doesn't add one.

### Links

- **Add an endpoint:** `POST /todos/:id/urls` with `{ url }`.
  - It validates and normalizes the URL (adding `https://` when there's no scheme), inserts a `todo_urls` row with the next position, and queues the title fetch the same way `create-todo.ts` does for extracted URLs.
  - It returns the serialized URL (see `serializeUrl` in `handlers/todos.ts`) and pings the user's sync Durable Object.
  - Add the hook (`useAddTodoUrl` in `useTodos.ts`) and `APIService.addTodoUrl`, matching the existing update and delete calls.
- **The detail's Links section is always shown,** even when empty.
  - Under the cards there's a "Paste a link" field (link icon, Enter to add), styled like "Add subtask".
  - A new card appears straight away with its domain and a muted "Fetching title…".
  - Text that isn't a link shows "That doesn't look like a link." in red.
  - The cards keep their current menus: Show as URL, Retry, Remove, and Copy URL on iOS.
- **Row meta** shows the first link's domain plus a count when there are more: "visitlisboa.com +2".

### Gmail

Stay within Card Service widgets. The add-on is the HTTP-endpoint model in `src/api`.

- **Sentence case:** "This week · 4".
- **Every section header has a count,** including Today and This week.
- **Drop the card header** that repeats "Nylon" under the panel's own header.
- **Make Add a filled button.**
- **No Undo after ticking.** A todo ticked in the last 10 minutes (going by `completedAt`) stays in place, checked and struck through (`<s>` is in Card Service's HTML subset), and unticking it marks it not done. This keeps the card stateless: rebuilding it from current data does the right thing, and ticked rows drop off on the next refresh after the window. The notification still says "Done".
- **The contextual card** shows the open email as a decorated text row ("Attached as a link", the subject, "From … · date") instead of the sentence "The email is attached as a link." After Add it shows an "Added to Today" section with Open in Nylon and Undo buttons, instead of only a notification. Undo deletes the todo it just made.

### Shared foundations

- **Red:** `destructive` in `tokens.json` goes to red-11 (`#CE2C31` light; dark stays a passing red-11). Run `bun run tokens`. `Theme.swift` and `tokens.css` are generated; don't edit them by hand.
- **Sentence case** for all visible copy: "This Week" becomes "This week" on every platform, in the API's Gmail cards and toasts, and in `src/marketing/seed.ts`. Enum values, route paths (`/this-week`) and identifiers don't change.
  - **The one stored value that does change** is the This week system list's `name`. Every client renders `lists.name`, so a copy-only change would leave "This Week" in the sidebar, column titles and chips. Migration `0003_system_list_sentence_case` renames the existing rows; the seeds (`ensure-user.ts`, `lists.ts`, `seed.sql`, `scripts/db-reset`) create new ones as "This week". It's data only, with nothing tightened, so it's safe to apply before rollout.
  - The pass also covers the other title-case labels on Apple platforms (menus, intents, settings): "New todo", "Mark done", "Show done", "Send feedback…", "Sign out", "Privacy policy" and so on. Strings that macOS composes itself, like Edit ▸ "Undo Done", stay as the system renders them.

## Implementation

### Phases and PRs

See "How to build this" above for the order, what goes in each PR, and the checklist. Files below are grouped by app, not by phase.

### Files to modify

**Web** (`src/web/src/components`):

- `wide/WideApp.tsx`:
  - selection state, roving tab index;
  - an always-present fourth column (Done, list or detail);
  - the panel no longer pads `<main>`;
  - the toolbar row; Esc and focus handling.
- `wide/keys.ts`: replace `SHORTCUTS` and `boardKeyAction` with the command registry.
- New `wide/commands.ts`: the registry.
- New `wide/CommandPalette.tsx`: the palette and the Move to mode.
- New `wide/QuickAdd.tsx`: the quick-add popover.
- New `wide/NewListPopover.tsx`.
- `wide/Sidebar.tsx`:
  - fill and keyboard-bar states, ids for focus;
  - New list opens the popover;
  - Done styling; the "Keyboard shortcuts ?" item.
- `wide/Column.tsx`:
  - title rename, ⋯ menu, × only on lists;
  - reserved banner space;
  - selectable Done rows.
- `wide/ShortcutsOverlay.tsx`: render from the registry.
- `phone/TodoRow.tsx`: split into container and title button; link as an anchor on wide; ring style.
- `phone/DetailSheet.tsx`: Links always shown, the "Paste a link" field, the pending card state.
- `phone/OvernightNote.tsx`: the orange pill.
- `phone/PhoneApp.tsx`, `phone/AccountSheet.tsx`, `phone/DoneScreen.tsx`: the Done button, Done as a page, reserved banner space.
- `phone/useTodoActions.ts`: list delete with Undo.
- `phone/model.ts`: copy.
- `../hooks/useLists.ts` and `../hooks/useTodos.ts`: wire up the rename and delete hooks; add `useAddTodoUrl`.

**API:**

- `src/api/src/index.ts`: the `POST /todos/:id/urls` route.
- `src/api/src/handlers/todo-urls.ts`: `createTodoUrl`.
- `src/api/src/lib/addon-cards.ts`:
  - headers, counts, filled Add, no repeated header;
  - the recently-ticked rows;
  - the contextual card's email row and confirmation.
- `src/api/src/handlers/gmail-addon/actions.ts`: the toggle unticks as well as ticks; Undo for add-from-message.
- `API_ERRORS` in `src/api/src/lib/errors.ts`: an invalid-URL code.

**iOS** (`src/ios/Nylon Impossible/Nylon Impossible`):

- `ContentView.swift`: drop the `deletingList` confirmation; delete with Undo through `ToastCenter`.
- `ContentView+Wide.swift`, `ContentView+WideKeys.swift`, `ContentView+Panel.swift`:
  - the always-present fourth column;
  - the detail in the fourth column;
  - two-level keyboard, jumps, palette and Move to.
- `Views/Wide/BoardKeyboard.swift`, `BoardMenuCommand.swift`, `WideSidebar.swift`, `BoardColumn.swift`.
- `ContentView+Mac.swift`: toolbar Search, New todo, New list.
- `Mac/QuickAddView.swift`, `Mac/MenuBarController.swift`, `Mac/QuickAddPanel.swift`, `Views/Composer/Composer.swift`: the menu bar focus and keyboard model.
- `Views/Shell/Switcher.swift`, `Views/Account/AccountSheet.swift`, `Views/Account/DoneHistoryView.swift`, `ContentView+Pages.swift`, `Views/Shell/OvernightLine.swift`: the phone Done button, the page, banner space.
- `Views/Detail/TodoDetailSheet+Sections.swift`, `LinkCard.swift`, `Services/APIService.swift`: adding links.

**Shared:**

- `src/shared/design/tokens.json`: `destructive`, plus `notice` and `noticeFill`.
- `PRINCIPLES.md`.

### Key considerations

- **Don't rebuild what works.** Drag (dnd-kit on web), the context menu, the toast system, the detail sheet's sections and the date parser all stay. This plan changes how they're reached, not what they do.
- **The palette must not steal ⌘K from a focused field on iOS.** Register it as a menu command (`CommandMenu`), so the system routes it.
- **Gmail's 10-minute window is a constant** next to the other budgets in `addon-cards.ts`. The integration test should cover tick, untick and expiry.
- **Accessibility:**
  - The palette is a combobox with `aria-activedescendant`.
  - The selected row uses `aria-current`.
  - The orange pill is `role="status"`.
  - The Done button on the phone has `aria-current="page"` when showing.
  - Run `src/marketing/audit.ts` after phases 2 and 4.
- **Screenshots:** the marketing seed and the parity sheet use this copy and layout. Regenerate after phases 1, 2 and 4. Apple PRs get Before | After shots from `fix-shots`.
- **No migration is needed.** `todo_urls` already supports several links per todo.

## Acceptance criteria

- [ ] No visible "This Week" remains in any client, card or toast. Destructive and overdue red pass 4.5:1 in both themes.
- [ ] On wide (web, iPad, Mac), the three time columns never change width when opening, closing or switching what's in the fourth column.
- [ ] One click selects, a second click or Enter opens, and the open detail follows the selection.
- [ ] Every action in the shortcuts dialog is reachable from the keyboard alone, starting from a fresh page load, including reaching the sidebar and every list.
- [ ] The palette, the shortcuts dialog and the context menu list the same commands with the same keys, because they read from one registry.
- [ ] A list can be renamed and deleted on web. Deleting a list on any platform shows Undo, and Undo restores the list and its todos.
- [ ] A link can be added from the detail on web and iOS, shows a pending card, and gets its title.
- [ ] The Mac menu bar field is focused on every open, not only the first, and the popover can be used without the mouse.
- [ ] The phone shows Done as a button beside the avatar, reachable with Tab and by swiping.
- [ ] In Gmail, a ticked todo stays struck through and can be unticked until the card refreshes after the window.

## Dependencies

- Builds on: `plans/done/2026-10-18-cohesive-redesign.md`, `plans/done/2026-10-21-mac-app.md`.
- Unrelated to, and can run alongside: `plans/backlog/2026-10-25-mac-sign-in-chrome-handoff.md`, `plans/backlog/2026-10-25-widget-server-refresh.md`.
