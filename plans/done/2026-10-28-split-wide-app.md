---
title: Split WideApp into smaller pieces
status: Complete
created: 2026-10-28
updated: 2026-10-28
---

# Split WideApp into smaller pieces

## Overview

`src/web/src/components/wide/WideApp.tsx` had grown to about 1,170 lines
over the keyboard-first board's phases 2.1 to 2.3 (#500, #502, #505). It
held the selection, the fourth column, URL sync, the sidebar handlers, the
`Board` implementation behind the command registry, the palette's results,
drag and drop, the toolbar and the G hint, all sharing closures, so any
change meant reading the whole file.

The behaviour moved into modules that take what they need as arguments.
Nothing changed for the user: `WideApp.test.tsx` passed untouched, and
`src/marketing/audit.ts` gave the same results before and after. `WideApp`
is now about 740 lines: the board's state, the sidebar handlers, URL sync,
and the layout that wires the pieces together.

## Architecture

### Key decisions

- **`createBoard(ctx)` rather than a hook.** The `Board` that commands run
  against is rebuilt each render from an explicit `BoardContext`, so
  everything a command can touch is listed in one interface. Callbacks that
  `WideApp` declares later in render are passed as arrow wrappers.
- **The palette's results are pure.** `paletteGroups(state, moving, source,
  query)` takes the board's data and the moves its items make, and returns
  the groups; it has no state of its own.
- **DOM lookups in one place.** The `data-row-id`, `data-column` and
  `data-sidebar-*` conventions are only queried from `boardDom.ts`.
- **`selectedId` and `select` stayed in `WideApp`.** Selection is tied to
  `detailId`, the URL and the sidebar's handlers; pulling it into its own
  hook would have meant passing most of `WideApp`'s state into it.

### The audit's focus check

Re-running the audit as the behaviour check showed that its keyboard walk
only counted an outline as a visible focus indicator. Since 2.3 the wide
board uses a soft background (sidebar, toolbar, menus) and the selection
ring (a box-shadow on the row's container), so it reported 33 false
"invisible" stops. It now compares each stop's outline, box-shadow and
background, focused against blurred, on it and four ancestors, with
transitions off; a row counts when its container shows the selection ring,
which stays after blur because the selection does. Every stop now passes.

## Files

| File | Purpose |
|------|---------|
| `wide/WideApp.tsx` | State, sidebar handlers, URL sync and layout |
| `wide/board.ts` | `createBoard`: the `Board` the command registry runs |
| `wide/boardDom.ts` | Row, column and sidebar lookups |
| `wide/useBoardKeys.ts` | The one keydown listener |
| `wide/useGoSequence.ts`, `wide/GoHint.tsx` | G, then a letter, and its hint card |
| `wide/paletteGroups.ts` | The palette's Todos, Go to, Commands and Move to |
| `wide/useBoardDrag.tsx` | Drag and drop, the drop indicator and the preview |
| `wide/Toolbar.tsx` | Search, New todo (quick add) and New list |
| `marketing/audit.ts` | Focus visibility compares focused with blurred |
