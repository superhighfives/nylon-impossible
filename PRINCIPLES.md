# Principles

Nylon is a todo app built around time. Today, This week and Someday are a flow that todos move through on their own, and your lists sit beside them as permanent collections. It runs on the web, iPhone, iPad, the Mac (including the menu bar) and inside Gmail.

This page is the short, durable version of what Nylon is and how it behaves. Read it before changing UI or copy. Plans in `plans/` record how each piece was built; this file records what stays true across them.

## Principles

1. **Time is the structure.** Today, This week and Someday are a flow that todos move through. Lists are permanent collections. The two are presented differently.
2. **Capture in one motion.** Adding is a single gesture everywhere, and the todo lands where you're looking.
3. **Done means gone.** A checked todo leaves straight away, with Undo. It doesn't move to another column, page or section.
4. **Rows carry information, not controls.** Actions live in gestures, context menus and the keyboard. Rows have no visible handles, toolbars or chevrons.
5. **One design, many densities.** Phone, wide screen, the menu bar and the Gmail card share the same structure, the same order and the same words.
6. **Editorial type, native behavior.** Archivo display type and hairline rules provide the hierarchy. Each platform keeps its own conventions: sheets, swipe, haptics, Dynamic Type, keyboard shortcuts.
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
| Brand accent | Yellow, as a fill with dark ink only. Never yellow text or thin yellow lines on white |
| Destructive and overdue red | Radix red-11 (`#CE2C31` light), which passes 4.5:1. Not red-9 |
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
- Focus is always visible: a selected row is tinted, and moving with the keyboard adds a bar beside it, as in the sidebar; a soft tinted background elsewhere.
