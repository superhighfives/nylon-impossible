# iOS Share Todo

**Date:** 2026-03-20
**Status:** Complete

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
