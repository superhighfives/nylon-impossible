---
title: iOS Styling Improvements
status: Complete
created: 2026-02-26
updated: 2026-10-27
---

## Overview

A visual polish pass on the early iOS app to bring it closer to the web
version: borderless cards with a light-mode shadow, bigger checkboxes, a
"Completed" section header, an active-task count in the header, a nicer
empty state, dimmed completed cards, swipe-to-dismiss for the keyboard, and
due dates on rows. It shipped as #4 (37a84d1, merged 2026-02-27).

Two parts didn't last. Due dates were taken out again the same day, and the
new drag-to-reorder was reverted a day later (see below). None of this UI
exists any more. `TodoItemRow`, `HeaderView` and `EmptyStateView` were
deleted when the 2026-10 cohesive redesign rebuilt the iOS views (#398).

## Architecture

Everything was a SwiftUI view change, mostly in `ContentView.swift` and
`Views/Components/TodoItemRow.swift`, matching the file summary below.
Due dates also needed a `dueDate` field on `TodoItem`, `APITodo` and the
sync code. How it differed from the plan:

- **Reordering (§1).** The plan left the approach open. #4 replaced the
  always-active edit mode with `.draggable` / `.dropDestination`. That broke
  sorting, so #11 (a505492, 2026-02-28) went back to `.onMove` with
  `.environment(\.editMode, .constant(.active))`. It also disabled moving on
  completed rows and the header, replaced `.swipeActions` with `.onDelete`
  (swipe actions don't work in edit mode), and added tap-to-edit on the
  title. So the permanent reorder
  handles that §1 set out to remove came back.
- **Due dates (§3)** shipped in #4 and were removed the same day in #14
  ("Remove due date for now"), which also dropped the web column and the
  smart-input date parsing. They returned with the expanded schema on
  2026-03-03.
- **Add task input (§5).** Only the border change (1pt to 0.5pt) shipped.
  The commit has no sign of the button corner radius, press animation or
  placeholder colour.

## Context

The iOS app is functional but its styling needs polish. The current UI uses always-active edit mode (showing system reorder handles permanently), has no due date display, and uses a somewhat basic card design. This plan addresses visual refinements to bring the iOS app closer to the quality of the web version while keeping things idiomatically SwiftUI.

Reference: the screenshot shows dark mode with "Cats" and "Ninjas" todos, each in a dark card with a circle checkbox, title text, and the default iOS reorder grip (three horizontal lines) always visible.

## Changes

### 1. Remove always-active edit mode — use long-press drag instead

**File: `ContentView.swift`**

The current approach sets `.environment(\.editMode, .constant(.active))` to enable drag reordering, but this forces the system reorder handles to always display — adding visual clutter and an inelegant look.

Replace with a custom drag-to-reorder approach:
- Remove the `.environment(\.editMode, .constant(.active))` modifier
- Remove the `.onMove` modifier from `ForEach`
- Add a long-press gesture on each `TodoItemRow` that enters a reorder mode
- Use `@State private var isReordering = false` to track active reorder state
- When reordering, show a dragging state on the held item (slightly scaled up, shadow)
- Alternatively, use the `draggable`/`dropDestination` modifiers (iOS 16+) or keep `.onMove` but only activate edit mode on long press with a toggle

The simplest clean approach: keep `.onMove` but toggle edit mode on/off rather than keeping it always active. Add an explicit "Reorder" button in the header, or trigger edit mode via long-press on the list area.

### 2. Improve todo card design

**File: `TodoItemRow.swift`**

Current cards use `RoundedRectangle` with a 0.5pt border which looks thin and mechanical. Improve:

- Remove the `overlay` border stroke entirely — rely on the elevated background fill alone for card definition (the contrast between `kumoBase` and `kumoElevated` is sufficient, matching the web's borderless item style)
- Increase corner radius from 12 to 14 for a softer feel
- Add subtle shadow: `.shadow(color: Color.black.opacity(0.08), radius: 4, y: 2)` in light mode (use `@Environment(\.colorScheme)` to reduce or remove in dark mode)
- Increase checkbox size from 28 to 32 for better touch target and visual weight
- Make checkbox circle stroke slightly thicker: `lineWidth: 2` → `lineWidth: 2.5`
- Increase checkmark icon size from 14 to 16 to match the larger circle

### 3. Add due date display to todo items

**File: `TodoItemRow.swift`**

The web app shows due dates ("Today", "Tomorrow", "Mon", "Feb 25") below the title with overdue highlighting. The iOS app has no due date display.

- Add `dueDate: Date?` property to `TodoItemRow` (sourced from the `TodoItem` model — will need to add `dueDate` field to `TodoItem.swift` if not present, or pass through from API sync)
- Below the title `Text`, conditionally render the formatted due date:
  ```swift
  if let dueDate = todo.dueDate {
      Text(formatDueDate(dueDate))
          .font(.system(size: 13))
          .foregroundStyle(isOverdue(dueDate) ? Color.kumoDanger : Color.kumoSubtle)
  }
  ```
- Add `formatDueDate()` and `isOverdue()` helper functions matching the web's logic (Today, Tomorrow, weekday for ≤7 days, "MMM d" otherwise)
- Wrap title and due date in a `VStack(alignment: .leading, spacing: 2)`

### 4. Add "Completed" section header

**File: `ContentView.swift`**

The web app visually separates incomplete and completed todos. On iOS, they blend together.

- Add a section header between incomplete and completed items:
  ```swift
  if !completed.isEmpty {
      Section {
          Text("Completed")
              .font(.system(size: 13, weight: .semibold))
              .foregroundStyle(Color.kumoSubtle)
              .textCase(nil)
              .listRowBackground(Color.clear)
              .listRowInsets(EdgeInsets(top: 16, leading: 4, bottom: 4, trailing: 0))
      }
  }
  ```

### 5. Improve add task input styling

**File: `AddTaskInputView.swift`**

- Increase the add button corner radius from 14 to match the outer container (make it feel more integrated)
- Add a subtle scale animation on the add button press: `.scaleEffect(isPressed ? 0.92 : 1.0)`
- Soften the border: reduce stroke from `lineWidth: 1` to `lineWidth: 0.5`, or remove entirely and use shadow instead to match the card treatment
- Add placeholder text color: `.foregroundStyle(Color.kumoInactive)` (currently inherits system default)

### 6. Improve empty state

**File: `EmptyStateView.swift`**

The current empty state is minimal. Add a bit more personality:

- Use a filled icon instead of a stroked circle — e.g. `Image(systemName: "checklist")` with `.font(.system(size: 48))` and `.foregroundStyle(Color.kumoLine)`
- Add subtle opacity animation on appearance: `.opacity(appeared ? 1 : 0)` with `.onAppear { withAnimation(.easeIn(duration: 0.4)) { appeared = true } }`

### 7. Polish header

**File: `HeaderView.swift`**

- Add a task count below "My Tasks": `Text("\(todoCount) tasks")` in `kumoSubtle` for context
- This requires passing the count in as a parameter

### 8. Improve completed todo visual treatment

**File: `TodoItemRow.swift`**

Currently completed todos just get `strikethrough` and `kumoSubtle` text color. Enhance:

- Reduce the entire card's opacity to 0.7 when completed: `.opacity(todo.isCompleted ? 0.7 : 1.0)`
- This creates a more obvious visual hierarchy between active and completed items

### 9. Add keyboard dismiss on scroll

**File: `ContentView.swift`**

When the user starts scrolling the todo list, dismiss the keyboard if the add task input is focused:

- Add `.scrollDismissesKeyboard(.interactively)` to the `List`

## File Summary

| File | Change |
|------|--------|
| `ContentView.swift` | Remove always-active edit mode, add completed section header, add scroll keyboard dismiss, pass todo count to header |
| `TodoItemRow.swift` | Remove border, increase corner radius, add shadow, enlarge checkbox, add due date display, reduce completed opacity |
| `AddTaskInputView.swift` | Soften border, add button press animation |
| `EmptyStateView.swift` | New icon, fade-in animation |
| `HeaderView.swift` | Add task count |

## Out of Scope

These are worth considering for a future pass but not part of this styling plan:

- Inline editing of todos (feature parity with web)
- AI extraction support
- Swipe-to-complete gesture (in addition to checkbox tap)
- Haptic feedback on toggle and reorder
- iPad layout adaptations
- Custom app icon and launch screen styling
