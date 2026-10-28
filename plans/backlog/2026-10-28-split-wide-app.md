---
title: Split WideApp into smaller pieces
status: Backlog
created: 2026-10-28
updated: 2026-10-28
---

# Split WideApp into smaller pieces

## Problem

`src/web/src/components/wide/WideApp.tsx` grew to about 1,150 lines over the
keyboard-first board's phases 2.1 and 2.2 (#500, #502). It holds the
selection, the fourth column, URL sync, the sidebar handlers, the `Board`
implementation behind the command registry, the palette's groups, drag and
drop, and the render tree. The sections are marked (`// --- Focus`, `URL`,
`Selection`, `Sidebar`, `Keyboard`, `Palette`, `Drag`, `Rendering`), but
they share closures over the same state, so any change means reading the
whole file.

## Direction

Pull each section into a hook or module that takes the state it needs,
without changing behaviour:

- `useBoardSelection`: `selectedId`, `lastSelected`, `select`, `focusColumn`
  and the pending-focus effect.
- `useBoardKeys`: the `Board` implementation and the keydown listener, plus
  the G-sequence state and its hint.
- `paletteGroups.ts`: Go to, Commands, Todos and Move to, as pure functions
  of the board data.
- `useBoardDrag`: the dnd-kit handlers and the drop indicator.

`WideApp` keeps the layout and wires these together. The existing
`WideApp.test.tsx` should pass unchanged; that's the check that nothing
moved.

Best done after phase 2.3 (`plans/in-progress/2026-10-27-keyboard-first-board.md`),
which adds `o` and the row links to the same file, and before phase 3 copies
the behaviour to SwiftUI, so the web version reads clearly as the reference.
