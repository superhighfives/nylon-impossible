# Principles

Nylon is a todo app built around time. Today, This week and Someday are a flow that todos move through on their own, and your lists sit beside them as permanent collections. It runs on the web, iPhone, iPad, the Mac (including the menu bar) and inside Gmail.

This page is the short, durable version of what Nylon is and how it behaves. Read it before changing UI or copy. Issues and pull requests record how each piece was built; this file records what stays true across them.

This written spec is the reference, not any one platform. The prototype artboards are where changes are tried out; when they disagree with this file, this file wins.

## Principles

1. **Time is the structure.** Today, This week and Someday are a flow that todos move through. Lists are permanent collections. The two are presented differently.
2. **Capture in one motion.** Adding is a single gesture everywhere, and the todo lands where you're looking.
3. **Done means gone.** A checked todo leaves straight away, with Undo. It doesn't move to another column, page or section.
4. **Rows carry information, not controls.** Actions live in gestures, context menus and the keyboard. Rows have no visible handles, toolbars or chevrons.
5. **One design, many densities.** Phone, wide screen, the menu bar and the Gmail card share the same structure, the same order and the same words.
6. **Editorial type, native behavior.** Archivo display type and hairline rules provide the hierarchy. Each platform keeps its own conventions: sheets, swipe, haptics, Dynamic Type, keyboard shortcuts. Native means native to the input, not the device. Touch works the same on every touch layout: long-press to drag, rows that part to make room, immediate feedback. A pointer works the same wherever there's one: a drop line, hover, a click to select.
7. **Keyboard first where there's a keyboard.** On wide screens and the Mac, everything you can click you can also reach from the keyboard, and the same letter does the same thing everywhere.
8. **Things don't jump.** Space that something might need (a banner, the fourth column) is kept whether or not it's showing, so titles and columns stay put.
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
| Wide layout | Three time columns plus a fourth. The fourth shows Done unless you pick a list or open a todo |
| Selecting on wide | One click selects. A second click, a double click or Enter opens the todo in the fourth column |
| Dropping with a pointer | The todo lands in the gap nearest the pointer, shown by the drop line. Over a row's upper half it goes above it, over the lower half below it, and below the last row it goes last |
| Brand accent | Yellow, as a fill with dark ink only. Never yellow text or thin yellow lines on white. Two exceptions: the 2pt drop line while a todo is being dragged, where the drag preview and the faded original also mark the move; and the composer's 3px focus ring, where its `surface` fill and the caret also mark focus |
| Destructive and overdue red | Radix red-11 (`#CE2C31` light), which passes 4.5:1. Not red-9 |
| Moving between lists by drag | Wide layouts only: the web board, iPad and Mac. On a phone layout a todo moves through its menu (Move to) |
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
- Short and specific: "Moved to This week", not "Your todo has been moved successfully".
- Toasts name what happened and, when it can be reversed, offer Undo.
- Empty states say what's true and, when it helps, where to look next: "Nothing today." with "4 waiting in This week".

## Visual

- Colors, type, spacing, radii and motion come from `src/shared/design/tokens.json`. Don't hard-code them in either app.
- Text meets 4.5:1 contrast, including small grey labels. Indicators that carry meaning meet 3:1.
- Colors that must be told apart also differ in lightness, not hue alone.
- Touch targets are at least 44 points on touch screens.
- Motion respects reduced motion: transitions shorten to a fade or nothing.
- Focus is always visible to the keyboard: a selected row is tinted, and moving with the keyboard adds a bar beside it, as in the sidebar; a soft tinted background elsewhere. A mouse click never draws a keyboard-strength ring. The full set is under States.

## States

How the wide board (web, iPad and the Mac, with a pointer and keyboard) shows each interaction state. Every platform draws the same look for the same state. Colours are `tokens.json` names; hover and fills ease over `motion.fast` and respect reduced motion. Touch layouts, the menu bar popover and Gmail follow their own conventions (principle 6).

| State | Rows (columns, Done, an open todo) | Column head | Sidebar entry | Composer | Palette item |
| --- | --- | --- | --- | --- | --- |
| Rest | No background | Title only | No background | No background, "Add" placeholder | No background |
| Hover (pointer only) | `fill` at 60%, in every column, tinted or not | Rename button: `fill` | `surface` (web) / `fill` at 70% (Apple) | `surface` | Moves the highlight |
| Pressed | Nothing extra: the click selects, and the selection is the feedback | — | — | — | — |
| Selected by click | `fill`, chip radius | — | Open list: `fill`, semibold | — | — |
| Selected by keyboard | `fill` plus a 3px `inkMuted` bar, inset 6 | — | — | — | `fill` |
| Focused by keyboard | Same as selected by keyboard: rows have no ring | 20% of the title's colour behind it, as the sidebar cursor | 20% of its text colour | `surface` plus the 3px `brand` ring | — |
| Focused by click | Same as selected by click | Nothing visible | Nothing extra | Same as by keyboard | — |
| Column holds the selection | — | — | 3px `ink` bar | — | — |
| Drop target | A 2pt/2px `brand` line in the gap where the todo will land | — | `brand` fill, `brandInk` text | — | — |
| Column as a drop target | The line only, no column fill | — | — | — | — |
| Dragging (source) | The original row stays, faded to 35% | — | — | — | — |
| Drag preview | `surface` card, `hairline` border, field radius, checkbox and title | — | — | — | — |

- **Two bars, two roles.** The row's keyboard bar is `inkMuted`; the sidebar's bar for the column holding the selection is `ink`.
- **Keyboard or pointer** is the last input: a key press (not a modifier alone) turns the keyboard looks on, a pointer press turns them off. The rows' bar and the column head's tint follow it, not the browser's own guess at `:focus-visible`.
- **Dropping.** The whole column accepts a drop, and the line always shows where the todo will land: over a row, the gap its nearer half points to; below the rows or in an empty column, after the last row. Releasing puts the todo where the line was. Done and an open todo aren't drop targets, and nothing draws a line over the sidebar.
- **Dividers.** Every divider (between columns, the fourth column's edge, the header rule, the sidebar edge, the toolbar's bottom) is `hairline`, 1px/1pt, drawn once. With Increase Contrast (`prefers-contrast: more` on the web) every colour with a `highContrast` value takes it.
