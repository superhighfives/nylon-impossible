# Siri Inline Parameters

Enable users to say "Add buy milk to Nylon" instead of the two-step flow where Siri asks "What would you like to add?"

## Current Behavior

1. User: "Hey Siri, add a task to Nylon"
2. Siri: "What would you like to add?"
3. User: "buy milk"
4. Siri: "Added 'buy milk' to Nylon"

## Desired Behavior

1. User: "Hey Siri, add buy milk to Nylon"
2. Siri: "Added 'buy milk' to Nylon"

## Why This Requires Work

App Intents only allows parameter interpolation (`\(\.$taskTitle)`) in phrases for `AppEntity` or `AppEnum` types - not raw `String`. We need to wrap the task title in an `AppEntity` that uses `EntityStringQuery` to accept free-form text.

## Implementation

### Task 1: Create TaskTitle AppEntity

**File:** `src/ios/Nylon Impossible/Nylon Impossible/Intents/TaskTitleEntity.swift`

```swift
import AppIntents

/// Wrapper entity for free-form task titles, enabling inline Siri phrases
struct TaskTitle: AppEntity {
    var id: String
    var title: String
    
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Task"
    
    static var defaultQuery = TaskTitleQuery()
    
    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(title)")
    }
    
    init(id: String = UUID().uuidString, title: String) {
        self.id = id
        self.title = title
    }
}

/// Query that accepts any spoken string as a valid task title
struct TaskTitleQuery: EntityStringQuery {
    func entities(matching string: String) async throws -> [TaskTitle] {
        // Accept any free-form text as a valid task title
        [TaskTitle(title: string)]
    }
    
    func entities(for identifiers: [String]) async throws -> [TaskTitle] {
        // Not used for free-form input
        []
    }
    
    func suggestedEntities() async throws -> [TaskTitle] {
        // Could return recent tasks here for suggestions
        []
    }
}
```

### Task 2: Update AddTaskIntent to use TaskTitle

**File:** `src/ios/Nylon Impossible/Nylon Impossible/Intents/AddTaskIntent.swift`

Change the parameter type:

```swift
@Parameter(title: "Task", requestValueDialog: "What would you like to add?")
var task: TaskTitle  // was: var taskTitle: String

// In perform():
let todo = TaskCreationService.createTask(
    title: task.title,  // was: taskTitle
    // ...
)
```

### Task 3: Update AppShortcuts phrases

**File:** `src/ios/Nylon Impossible/Nylon Impossible/Intents/AppShortcuts.swift`

Add parameter placeholders:

```swift
phrases: [
    "Add \(\.$task) to \(.applicationName)",
    "Add a task to \(.applicationName)",
    // ...
]
```

## Verification

- [ ] Build succeeds with App Intents metadata extraction
- [ ] "Hey Siri, add buy milk to Nylon" creates task directly
- [ ] "Hey Siri, add a task to Nylon" still works (prompts for task)
- [ ] Tasks sync correctly

## Notes

- The `EntityStringQuery` protocol is key - it allows any spoken text to become a valid entity
- `suggestedEntities()` could optionally return recent tasks for Siri suggestions
- This is purely additive - the existing two-step flow remains as a fallback
