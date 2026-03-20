# iOS Share Todo

**Date:** 2026-03-20
**Status:** Backlog

## Problem

Users can share URLs *into* Nylon Impossible via the iOS Share Sheet to create todos, but there
is no way to share a todo *out* — for example, to send a todo item to Messages, Mail, Notes, or
any other app via the standard iOS Share Sheet.

## Proposed solution

Add a share button to the todo detail view (and optionally the todo list row) that invokes
`UIActivityViewController` with a text representation of the todo. The shared payload should
include the todo's title, description, due date, and any attached URLs so the recipient has
full context.

## Implementation sketch

### 1. Share payload

Construct a shareable string from the todo's fields:

```swift
func shareText(for todo: TodoItem) -> String {
    var lines: [String] = [todo.title]
    if let description = todo.itemDescription, !description.isEmpty {
        lines.append(description)
    }
    if let dueDate = todo.dueDate {
        lines.append("Due: \(dueDate.formatted(date: .abbreviated, time: .omitted))")
    }
    if let urls = todo.urls, !urls.isEmpty {
        lines.append(contentsOf: urls.map { $0.url })
    }
    return lines.joined(separator: "\n")
}
```

### 2. Share button

Add a share button to `TodoEditSheet.swift` (toolbar or within the form) that presents
`ShareLink` (SwiftUI) or wraps `UIActivityViewController` via a `UIViewControllerRepresentable`:

```swift
// SwiftUI ShareLink (iOS 16+)
ShareLink(item: shareText(for: todo))
```

### 3. List row context menu (optional)

Add a "Share" action to the context menu in `TodoItemRow.swift` so users can share directly
from the list without opening the detail sheet.

## Files to modify

| File | Change |
|------|--------|
| `src/ios/.../Views/Components/TodoEditSheet.swift` | Add share button to toolbar |
| `src/ios/.../Views/Components/TodoItemRow.swift` | Add "Share" context menu action (optional) |
| `src/ios/.../Helpers/TodoShareHelper.swift` | New helper — `shareText(for:)` |

## Acceptance criteria

- [ ] Tapping the share button in the todo detail sheet opens the iOS Share Sheet
- [ ] The share payload includes the title, description (if set), due date (if set), and any
      attached URLs
- [ ] Sharing works on iOS 16+ via `ShareLink`
- [ ] No new permissions or entitlements are required

## Out of scope

- Sharing multiple todos at once
- Custom activity types (e.g. a dedicated "Copy as Markdown" action)
- Deep-link URLs that open the todo directly in the app

## Dependencies

- No external dependencies
- Compatible with the `TodoUrl` SwiftData model introduced in `optimistic-ui-parity`
