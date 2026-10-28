---
title: "Keyboard-first board: wide layout, menu bar, phone and Gmail polish"
status: Ready
created: 2026-10-27
updated: 2026-10-27
---

# Keyboard-first board: wide layout, menu bar, phone and Gmail polish

The interactive prototype for everything here is the canvas at https://claude.ai/artifact/LdsHRNLhPuVqZ9ejvMnysh (artboards: Phone, Wide, macOS menu bar, Gmail home, Gmail with an email open). It's the reference for behavior and feel. Don't port its code: it's inline styles and sample data.

Read [PRINCIPLES.md](../../PRINCIPLES.md) first. Several of its Settled rows come from this plan.

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

Build what the canvas shows, in the order below. Each phase is one or more PRs that can ship alone. After phase 1, phases 2 to 5 can run in parallel.

### The wide board

Applies to wide web (1024px and up), iPad and the Mac window.

**Layout**

- The sidebar is followed by four columns, always: Today, This week, Someday, then a fourth.
- **The fourth column** shows, in order of precedence:
  1. the open todo's detail;
  2. otherwise the list you picked in the sidebar;
  3. otherwise Done.

  It never disappears, so the other three never change width.
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
- **⋯ next to the title** opens Rename and Delete list.
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
- **Sentence case** for all visible copy: "This Week" becomes "This week" on every platform, in the API's Gmail cards and toasts, and in `src/marketing/seed.ts`. Enum values, route paths (`/this-week`), identifiers and stored data don't change.

## Implementation

### Phases and PRs

1. **Foundations** (one PR):
   - token change, regenerated outputs;
   - the sentence-case sweep and its test updates;
   - `PRINCIPLES.md` updates, if any.
2. **Wide web, three PRs:**
   1. **Layout:** selection state, the fourth column with Done as its default, the detail in the fourth column, the toolbar with the quick-add and New list popovers, sidebar states, reserved banner space and the orange note, list rename, ⋯ and delete with Undo.
   2. **Keyboard:** the command registry, sidebar and board levels, Esc backing out, ⇧-digits, G sequences, the palette, Move to, roving tab stops and focus styles.
   3. **Links:** the endpoint, adding links in the detail, clickable row links, `o`.
3. **iPad and Mac wide:** mirror phase 2 in SwiftUI. Includes the Mac toolbar, list delete with Undo, and the iOS link-adding UI. It can start once 2.1 is merged, so it copies something settled.
4. **Menu bar:** the focus fix and the keyboard model.
5. **Phone:** the Done button, the top-level Done page, reserved banner space, adding links in the phone detail (iOS and web).
6. **Gmail:** the card changes and the ticked-row window.

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
  - Run `src/marketing/audit.ts` after phase 2 and phase 5.
- **Screenshots:** the marketing seed and the parity sheet use this copy and layout. Regenerate after phases 1, 2 and 5. Apple PRs get Before | After shots from `fix-shots`.
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
