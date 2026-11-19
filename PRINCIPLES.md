# Principles

Nylon is a todo app built around time. Today, This week and Someday are a flow that todos move through on their own, and your lists sit beside them as permanent collections. It runs on the web, iPhone, the Mac's menu bar and inside Gmail.

This page is the short, durable version of what Nylon is and how it behaves. Read it before changing UI or copy. Issues and pull requests record how each piece was built; this file records what stays true across them.

This written spec is the reference, not any one platform. The prototype artboards are where changes are tried out; when they disagree with this file, this file wins.

## Principles

1. **Time is the structure.** Today, This week and Someday are a flow that todos move through. Lists are permanent collections. The two are presented differently.
2. **Capture in one motion.** Adding is a single gesture everywhere, and the todo lands where you're looking.
3. **Done means gone.** A checked todo leaves straight away, with Undo. It doesn't move to another column, page or section.
4. **Todo rows carry information, not controls.** Actions live in gestures, context menus and the keyboard. Todo rows have no visible handles, toolbars or chevrons. Other rows, like sidebar entries, may carry controls.
5. **One design, many densities.** Phone, wide screen, the menu bar and the Gmail card share the same structure, the same order and the same words.
6. **Editorial type, native behavior.** Archivo display type and hairline rules provide the hierarchy. Each platform keeps its own conventions: sheets, swipe, haptics, Dynamic Type, keyboard shortcuts. Native means native to the input, not the device. Touch works the same on every touch layout: long-press to drag, rows that part to make room, immediate feedback. A pointer works the same wherever there's one: a drop line, hover, a click to select.
7. **Keyboard first where there's a keyboard.** On wide screens and in the menu bar, everything you can click you can also reach from the keyboard, and the same letter does the same thing everywhere. The keyboard is either on a section (the sidebar, a column, the open todo) or in it. Tab, ⇧Tab and ← → move between sections; Return steps in and Esc steps out. Inside, the arrow keys move through items, and in a form, keys do ordinary form things. The section with the keyboard has a light outline.
8. **Things don't jump.** Space that something might need (a banner) is kept whether or not it's showing. When columns move to make room, they slide; they never jump.
9. **Settled stays settled.** Decisions below need a written reason to reopen, not a polish pass.

## Settled

| Decision | Choice |
| --- | --- |
| Third horizon list | Someday |
| Completing a todo | Leaves the list immediately, with an Undo toast. Gmail is the exception: the card can't show Undo, so a ticked todo stays, crossed out, until the card refreshes, and unticking undoes it |
| Deleting a list | Happens straight away, with Undo. No confirmation |
| Due date vs list | Independent. Lists only ever move backward, through the sweep |
| Custom lists | Never age |
| List membership | One list per todo. The three time lists and your lists are all lists; moving between them moves the todo |
| Saving | Every edit saves instantly. No Save or Cancel anywhere |
| Wide layout | One row of columns that scrolls sideways: Today, This week, Someday, every list you haven't hidden, then Done. Hide or show a list from the sidebar. Opening a todo lays a sheet beside its column |
| Selecting on wide | One click selects. A second click, a double click or Enter opens the todo in a sheet beside its column |
| Dropping with a pointer | The todo lands in the gap nearest the pointer, shown by the drop line. Over a row's upper half it goes above it, over the lower half below it, and below the last row it goes last |
| Brand accent | Yellow, as a fill with dark ink only. Never yellow text or thin yellow lines on white. Two exceptions: the 2pt drop line while a todo is being dragged, where the drag preview and the faded original also mark the move; and the composer's 3px focus ring, where its `surface` fill and the caret also mark focus |
| Destructive and overdue red | Radix red-11 (`#CE2C31` light), which passes 4.5:1. Not red-9. The error toast fills with `#CE2C31` in both appearances, with light text and a light outline. |
| Moving between lists by drag | The web board only. On a phone layout a todo moves through its menu (Move to) |
| Case | Sentence case for every label, title and menu item: "This week", "New list", "Keyboard shortcuts" |

## Vocabulary

One set of words, everywhere. Code identifiers follow the UI words where practical.

| Concept | Word | Not |
| --- | --- | --- |
| The item | todo | task |
| The three time lists | Today, This week, Someday | This Week, Sometime, buckets |
| User collections | Lists | custom lists, boards |
| Keep at the top | Pin / Unpin | Sticky |
| Finish | Done (verb: "Mark done") | Completed, complete |
| Calendar day it's due | Due | Due date, deadline |
| Recurrence | Repeat | Recurring |
| Child items | Subtasks | Steps |
| Attached URLs | Links | Resources, URLs |

## Copy

- Sentence case, always. Proper nouns keep their capitals.
- The time lists are lowercase mid-sentence: "Moved to this week", "Back in today", "Today, this week, someday.". They keep their capitals only where the name stands alone: column and page titles, the switcher, the sidebar, menu items and buttons. Your own lists keep their names everywhere: "Moved to Groceries".
- Short and specific: "Moved to this week", not "Your todo has been moved successfully".
- Toasts name what happened and, when it can be reversed, offer Undo.
- Adding somewhere off-screen toasts the same words everywhere: "Added to someday", "3 todos added to Groceries", and from Gmail and Siri, which have no date chip, "Added to this week · due Fri" ("due today", "due tomorrow"). The web and iPhone offer "View". The menu bar doesn't, an exception to principle 5: the toast already names where the todo went, and the popover shows only Today, so View would have to open a browser.
- A failed action toasts its own sentence, the same on every platform, with the article and a curly apostrophe: "Couldn’t add the link", "Couldn’t rename the list", "Couldn’t delete your account. Try again." Not the server's or browser's message ("Request failed (500)", "Failed to fetch"), except the API's messages that say what to do: "That doesn't look like a link." and "Too many requests. Try again in a minute."
- Empty states say what's true and, when it helps, where to look next: "Nothing today." with "4 waiting in this week".

## Visual

- Colors, type, spacing, radii and motion come from `src/shared/design/tokens.json`. Don't hard-code them in either app.
- Text meets 4.5:1 contrast, including small grey labels. Indicators that carry meaning meet 3:1.
- Colors that must be told apart also differ in lightness, not hue alone.
- Touch targets are at least 44 points on touch screens.
- Motion respects reduced motion: transitions shorten to a fade or nothing.
- Focus is always visible to the keyboard: a selected row is tinted, and moving with the keyboard adds a bar beside it, as in the sidebar; a soft tinted background elsewhere. A mouse click never draws a keyboard-strength ring. The full set is under States.

## States

How the wide board (the web) shows each interaction state, with a pointer and by touch. Colours are `tokens.json` names; hover and fills ease over `motion.fast` and respect reduced motion. The phone layouts, the menu bar popover and Gmail follow their own conventions (principle 6).

| State | Rows (columns, Done, an open todo) | Column head | Sidebar entry | Composer | Palette item |
| --- | --- | --- | --- | --- | --- |
| Rest | No background | Title only | No background | No background, "Add" placeholder | No background |
| Hover (pointer only) | `fill` at 60%, in every column, tinted or not | Rename button: `fill` | `surface` | `surface` | Moves the highlight |
| Pressed | Nothing extra: the click selects, and the selection is the feedback | — | — | — | — |
| Selected by click | `fill`, chip radius | — | — | — | — |
| Selected by keyboard | `fill` plus a 3px `inkMuted` bar, inset 6 | — | — | On Add, not typing: as a row, `fill` plus the `inkMuted` bar | `fill` |
| Focused by keyboard | Same as selected by keyboard: rows have no ring | 20% of the title's colour behind it, as the sidebar cursor | 20% of its text colour | `surface` plus the 3px `brand` ring | — |
| Focused by click | Same as selected by click | Nothing visible | Nothing extra | Same as by keyboard | — |
| Column holds the selection | — | — | 3px `ink` bar | — | — |
| Drop target with a pointer | A 2pt/2px `brand` line in the gap where the todo will land, with an 8pt `brand` dot at its leading end | — | `brand` fill, `brandInk` text | — | — |
| Drop target by touch | Rows part around a `brandSoft` gap the dragged row's height, no line | — | `brand` fill, `brandInk` text | — | — |
| Column as a drop target | The line only, no column fill | — | — | — | — |
| Dragging (source) with a pointer | The original row stays, faded to 35% | — | — | — | — |
| Drag preview with a pointer | `surface` card, `hairline` border, field radius, tilted at random up to 1.5° either way, checkbox and title | — | — | — | — |
| Dragging by touch | The row lifts, raised and tilted, and follows the finger; no faded original | — | — | — | — |

- **Section with the keyboard.** The sidebar, a column or the open todo that has the keyboard shows a 4pt/4px `sectionOutline` (ink at 8%) drawn inside its edges: a frame, not a selection, and never `brand`. It shows whether the keyboard is on the section or in it, follows "Keyboard or pointer", and changes none of the looks inside it. At launch the keyboard is on Today, with the outline hidden until the first key press.
- **Two bars, two roles.** The row's keyboard bar is `inkMuted`; the sidebar's bar for the column holding the selection is `ink`.
- **Keyboard or pointer** is the last input: a key press (not a modifier alone) turns the keyboard looks on, a pointer press turns them off. The rows' bar and the column head's tint follow it, not the browser's own guess at `:focus-visible`.
- **Dropping.** The whole column accepts a drop, and the line always shows where the todo will land: over a row, the gap its nearer half points to; below the rows or in an empty column, after the last row. Releasing puts the todo where the line was. Done and an open todo aren't drop targets, and nothing draws a line over the sidebar.
- **Dragging by touch.** A finger holds a row for 450ms within 10px to lift it, with the row's menu; moving turns that into a drag. The gap goes where the line would, and there's one on the board at a time: its own column closes up once the finger leaves it, and the column under the finger parts.
- **Moving.** Moving a todo (1 / 2 / 3, Move to…, the menu's Move) keeps it selected, and the keyboard goes with it to its new column. Done and Delete hand the selection to the next todo.
- **Dividers.** Every divider (between columns, the header rule, the sidebar edge, the toolbar's bottom) is `hairline`, 1px/1pt, drawn once. The open todo's sheet has none: its own `surface`, radius and shadow set it apart. With Increase Contrast (`prefers-contrast: more` on the web) every colour with a `highContrast` value takes it.

## Todo menu

One todo menu, in one order and with the same words, for every layout (principle 5). The wide board's right-click menu shows all of it; the phone layouts show part of it.

| Item | Web wide | Web phone | iPhone |
| --- | --- | --- | --- |
| Mark done | ✓ | (the checkbox) | (the checkbox) |
| Move to … | Flat: "Move to Today" etc., then "Move to a list…" | Grouped under "Move to", More | Grouped under "Move to", More |
| Open link | With a link | (the row's link) | (the row's link) |
| Pin to top / Unpin | ✓ | ✓ | ✓ |
| Due… | ✓ | (the detail) | (the detail) |
| Delete | ✓ | ✓ | ✓ |

A layout may leave items out, but never reorders or renames them. The header (the web phone's title card, the iPhone's lifted row) and how More opens are each platform's own (principle 6).

Every Due choice list (the wide menu's Due view, the detail on the web and the iPhone) is the same: Today, Tomorrow, Friday, Next week, Pick a date…, then No date, only when a date is set. Repeat is the same shape: Daily, Weekly, Monthly, Yearly, then Don’t repeat, only when it repeats. The clear option is red-11. In a menu it sits after a divider; in the web detail's row of chips it's the last chip, with no divider.
