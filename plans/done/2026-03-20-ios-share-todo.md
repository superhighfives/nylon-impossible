---
title: iOS Share Todo
status: Complete
created: 2026-03-20
updated: 2026-10-27
---

## Overview

Nylon could take things in from the iOS Share Sheet but couldn't send a todo
out. PR #129 (`77517ae`, tests in `36e7353`) added a share button that hands
a plain-text version of the todo (title, notes, due date, URLs) to the
system Share Sheet, so it can go to Messages, Mail, Notes and so on.

## Architecture

- `Utils/TodoShareHelper.swift` has one function,
  `shareText(for:urls:)`, which joins the title, the notes if there are any,
  `Due: <date>` if set, and each URL on its own line.
  `TodoShareHelperTests.swift` covers each field present and absent.
- `TodoEditSheet` got a `ShareLink` in its toolbar, fed from the sheet's
  `urls` state.
- `TodoItemRow` got the optional Share item in its context menu.

Deviations from the sketch: it reads `itemNotes`, not `itemDescription`,
because the field had been renamed to notes a week earlier (#114). Nothing
else changed.

Since then: the row's Share action was removed in #261 (July 2026). The
context menu's long press collided with the row's long-press drag lift, so
the share popover hijacked drags; sharing stayed in the edit sheet. The detail-sheet button survived the Phase 3 iOS rebuild
(#398) and now lives in `Views/Detail/TodoDetailSheet+Sections.swift`.
`shareText` formats the due date with `DueDay.localDate` since due dates
became calendar days (#370).

## Problem

Users can share URLs *into* Nylon Impossible via the iOS Share Sheet to create todos, but there
is no way to share a todo *out* — for example, to send a todo item to Messages, Mail, Notes, or
any other app via the standard iOS Share Sheet.

## Proposed solution

Add a share button to the todo detail view (and optionally the todo list row) that invokes
`ShareLink` with a text representation of the todo. The shared payload should include the todo's
title, description, due date, and any attached URLs so the recipient has full context.

## Implementation sketch

### 1. Share payload

`TodoEditSheet` already receives `urls: [APITodoUrl]` as a parameter. Pass that alongside the
`TodoItem` into the helper:

```swift
func shareText(for todo: TodoItem, urls: [APITodoUrl]) -> String {
    var lines: [String] = [todo.title]
    if let description = todo.itemDescription, !description.isEmpty {
        lines.append(description)
    }
    if let dueDate = todo.dueDate {
        lines.append("Due: \(dueDate.formatted(date: .abbreviated, time: .omitted))")
    }
    if !urls.isEmpty {
        lines.append(contentsOf: urls.map { $0.url })
    }
    return lines.joined(separator: "\n")
}
```

### 2. Share button

Add a share button to the toolbar in `TodoEditSheet.swift` using `ShareLink` (available on the
project's iOS 26.2 deployment target):

```swift
ShareLink(item: shareText(for: todo, urls: urls))
```

`urls` is already available as `@State private var urls: [APITodoUrl]` in `TodoEditSheet`.

### 3. List row context menu (optional)

Add a "Share" action to the context menu in `TodoItemRow.swift` so users can share directly
from the list without opening the detail sheet. `TodoItemRow` also receives `urls: [APITodoUrl]`
already, so the same helper applies.

## Files to modify

| File | Change |
|------|--------|
| `src/ios/Nylon Impossible/Nylon Impossible/Views/Components/TodoEditSheet.swift` | Add `ShareLink` share button to toolbar |
| `src/ios/Nylon Impossible/Nylon Impossible/Views/Components/TodoItemRow.swift` | Add "Share" context menu action (optional) |
| `src/ios/Nylon Impossible/Nylon Impossible/Utils/TodoShareHelper.swift` | New helper — `shareText(for:urls:)` |

## Acceptance criteria

- [ ] Tapping the share button in the todo detail sheet opens the iOS Share Sheet
- [ ] The share payload includes the title, description (if set), due date (if set), and any
      attached URLs
- [ ] `ShareLink` is used directly (no `UIActivityViewController` wrapper needed — deployment
      target is iOS 26.2)
- [ ] No new permissions or entitlements are required

## Out of scope

- Sharing multiple todos at once
- Custom activity types (e.g. a dedicated "Copy as Markdown" action)
- Deep-link URLs that open the todo directly in the app

## Dependencies

- No external dependencies
- Uses the existing `APITodoUrl` (Codable) URL model; no SwiftData `TodoUrl` type required
