# Siri Integration

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Siri support to Nylon so users can create tasks using voice commands like "Hey Siri, tell Nylon to remind me to get dog food" or "Hey Siri, add 'feed cat' to Nylon".

**Architecture:** Use iOS 17+ App Intents framework (not legacy SiriKit) for simpler integration. Create a shared App Group to allow Siri to access the SwiftData model container. Extract task creation logic into a reusable service for both main app and Siri intent.

**Tech Stack:** Swift, App Intents, SwiftData, App Groups

---

## Prerequisites

- Apple Developer account with App Group capability
- Xcode 15+ for App Intents

---

## Phase 1: App Group Setup

### Task 1.1: Create App Group identifier

**Manual step (Apple Developer Portal):**
1. Go to Certificates, Identifiers & Profiles
2. Under Identifiers, click the + button
3. Select "App Groups" and continue
4. Enter identifier: `group.com.superhighfives.Nylon-Impossible`
5. Register the group

**Verify:** App Group appears in portal

---

### Task 1.2: Add App Group to main app entitlements

**Files:**
- Modify: `src/ios/Nylon Impossible/Nylon Impossible/Nylon Impossible.entitlements`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.developer.associated-domains</key>
	<array>
		<string>webcredentials:more-unicorn-94.clerk.accounts.dev</string>
	</array>
	<key>com.apple.security.application-groups</key>
	<array>
		<string>group.com.superhighfives.Nylon-Impossible</string>
	</array>
</dict>
</plist>
```

**Verify:** Open Xcode, go to Signing & Capabilities, verify App Groups shows the group

**Commit:** `git commit -m "add App Group entitlement to main app"`

---

### Task 1.3: Add Siri capability to main app

**Files:**
- Modify: `src/ios/Nylon Impossible/Nylon Impossible/Nylon Impossible.entitlements`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.developer.associated-domains</key>
	<array>
		<string>webcredentials:more-unicorn-94.clerk.accounts.dev</string>
	</array>
	<key>com.apple.security.application-groups</key>
	<array>
		<string>group.com.superhighfives.Nylon-Impossible</string>
	</array>
	<key>com.apple.developer.siri</key>
	<true/>
</dict>
</plist>
```

**Commit:** `git commit -m "add Siri entitlement to main app"`

---

### Task 1.4: Add Siri usage description to Info.plist

**Files:**
- Modify: `src/ios/Nylon Impossible/Nylon-Impossible-Info.plist`

Add this key to the existing plist:

```xml
<key>NSSiriUsageDescription</key>
<string>Siri helps you add tasks to Nylon with your voice.</string>
```

**Commit:** `git commit -m "add Siri usage description"`

---

## Phase 2: Shared Model Container

### Task 2.1: Create SharedModelContainer for App Group storage

**Files:**
- Create: `src/ios/Nylon Impossible/Nylon Impossible/Services/SharedModelContainer.swift`

```swift
import Foundation
import SwiftData

enum SharedModelContainer {
    static let shared: ModelContainer = {
        let schema = Schema([TodoItem.self])
        
        // Use App Group container for shared access
        let appGroupURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.com.superhighfives.Nylon-Impossible"
        )!
        
        let storeURL = appGroupURL.appendingPathComponent("nylon.store")
        
        let config = ModelConfiguration(
            schema: schema,
            url: storeURL,
            cloudKitDatabase: .none
        )
        
        do {
            return try ModelContainer(for: schema, configurations: config)
        } catch {
            fatalError("Failed to create shared model container: \(error)")
        }
    }()
}
```

**Verify:** Build succeeds in Xcode

**Commit:** `git commit -m "add SharedModelContainer for App Group storage"`

---

### Task 2.2: Update app entry point to use shared container

**Files:**
- Modify: `src/ios/Nylon Impossible/Nylon Impossible/Nylon_ImpossibleApp.swift`

Find the `.modelContainer(for: TodoItem.self)` call and replace with:

```swift
.modelContainer(SharedModelContainer.shared)
```

Remove any existing `modelContainer` setup and use the shared one instead.

**Verify:** Build and run app, verify todos still work

**Commit:** `git commit -m "use SharedModelContainer in main app"`

---

## Phase 3: Task Creation Service

### Task 3.1: Extract task creation into reusable service

**Files:**
- Create: `src/ios/Nylon Impossible/Nylon Impossible/Services/TaskCreationService.swift`

```swift
import Foundation
import SwiftData

enum TaskCreationService {
    /// Create a todo item with the given title
    /// This is the core creation logic used by both the main app and Siri
    @MainActor
    static func createTask(
        title: String,
        userId: String?,
        context: ModelContext,
        allTodos: [TodoItem]
    ) -> TodoItem {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        
        // Generate position after the last todo
        let lastPosition = allTodos
            .filter { !$0.isDeleted }
            .sorted { $0.position < $1.position }
            .last?.position
        
        let position = generateKeyBetween(lastPosition, nil)
        
        let todo = TodoItem(
            title: trimmedTitle,
            userId: userId,
            position: position
        )
        
        context.insert(todo)
        
        do {
            try context.save()
        } catch {
            print("Failed to save task: \(error)")
        }
        
        return todo
    }
    
    /// Fetch all todos for the current user
    @MainActor
    static func fetchAllTodos(userId: String?, context: ModelContext) -> [TodoItem] {
        let descriptor = FetchDescriptor<TodoItem>(
            predicate: #Predicate<TodoItem> { todo in
                !todo.isDeleted
            },
            sortBy: [SortDescriptor(\.position)]
        )
        
        do {
            let todos = try context.fetch(descriptor)
            // Filter by userId in memory since predicates with optionals are tricky
            if let userId = userId {
                return todos.filter { $0.userId == userId || $0.userId == nil }
            }
            return todos.filter { $0.userId == nil }
        } catch {
            print("Failed to fetch todos: \(error)")
            return []
        }
    }
}
```

**Verify:** Build succeeds

**Commit:** `git commit -m "add TaskCreationService for shared task creation"`

---

### Task 3.2: Update TodoViewModel to use TaskCreationService

**Files:**
- Modify: `src/ios/Nylon Impossible/Nylon Impossible/ViewModels/TodoViewModel.swift`

Find the `addTodo` method and update to use `TaskCreationService`:

```swift
func addTodo(context: ModelContext, userId: String?, allTodos: [TodoItem]) {
    guard !taskText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
    
    _ = TaskCreationService.createTask(
        title: taskText,
        userId: userId,
        context: context,
        allTodos: allTodos
    )
    
    taskText = ""
}
```

**Verify:** Build and test adding a todo manually

**Commit:** `git commit -m "refactor TodoViewModel to use TaskCreationService"`

---

## Phase 4: App Intents

### Task 4.1: Create AddTaskIntent

**Files:**
- Create: `src/ios/Nylon Impossible/Nylon Impossible/Intents/AddTaskIntent.swift`

```swift
import AppIntents
import SwiftData

struct AddTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Add Task"
    static var description = IntentDescription("Add a new task to Nylon")
    
    @Parameter(title: "Task")
    var taskTitle: String
    
    static var parameterSummary: some ParameterSummary {
        Summary("Add \(\.$taskTitle) to Nylon")
    }
    
    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let container = SharedModelContainer.shared
        let context = ModelContext(container)
        
        // Get current userId from Keychain/UserDefaults if available
        // For Siri, we may not have auth context, so userId can be nil
        let userId: String? = UserDefaults(suiteName: "group.com.superhighfives.Nylon-Impossible")?
            .string(forKey: "currentUserId")
        
        let allTodos = TaskCreationService.fetchAllTodos(userId: userId, context: context)
        
        let todo = TaskCreationService.createTask(
            title: taskTitle,
            userId: userId,
            context: context,
            allTodos: allTodos
        )
        
        return .result(dialog: "Added '\(todo.title)' to Nylon")
    }
}
```

**Verify:** Build succeeds

**Commit:** `git commit -m "add AddTaskIntent for Siri task creation"`

---

### Task 4.2: Create AppShortcuts provider

**Files:**
- Create: `src/ios/Nylon Impossible/Nylon Impossible/Intents/AppShortcuts.swift`

```swift
import AppIntents

struct NylonShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddTaskIntent(),
            phrases: [
                "Add \(\.$taskTitle) to \(.applicationName)",
                "Tell \(.applicationName) to add \(\.$taskTitle)",
                "Tell \(.applicationName) to remind me to \(\.$taskTitle)",
                "Add a task to \(.applicationName)",
                "Create a task in \(.applicationName)"
            ],
            shortTitle: "Add Task",
            systemImageName: "plus.circle"
        )
    }
}
```

**Verify:** Build succeeds

**Commit:** `git commit -m "add AppShortcuts provider for Siri phrases"`

---

### Task 4.3: Register AppShortcuts in app entry point

**Files:**
- Modify: `src/ios/Nylon Impossible/Nylon Impossible/Nylon_ImpossibleApp.swift`

Add import and update the App struct. In the `init()` method or as a task on appear, register shortcuts:

```swift
import AppIntents

// In the App struct body or init:
.task {
    // Register app shortcuts on launch
    NylonShortcuts.updateAppShortcutParameters()
}
```

**Verify:** Build and run

**Commit:** `git commit -m "register AppShortcuts on app launch"`

---

## Phase 5: User Context for Siri

### Task 5.1: Store userId in shared UserDefaults on sign-in

**Files:**
- Modify: `src/ios/Nylon Impossible/Nylon Impossible/Services/AuthService.swift`

Add a method to persist userId to shared UserDefaults when user signs in:

```swift
private func persistUserIdToSharedDefaults() {
    let sharedDefaults = UserDefaults(suiteName: "group.com.superhighfives.Nylon-Impossible")
    sharedDefaults?.set(userId, forKey: "currentUserId")
}

private func clearUserIdFromSharedDefaults() {
    let sharedDefaults = UserDefaults(suiteName: "group.com.superhighfives.Nylon-Impossible")
    sharedDefaults?.removeObject(forKey: "currentUserId")
}
```

Call `persistUserIdToSharedDefaults()` when `isSignedIn` becomes true.
Call `clearUserIdFromSharedDefaults()` in `signOut()`.

**Verify:** Sign in, check that UserDefaults is populated

**Commit:** `git commit -m "persist userId to App Group UserDefaults for Siri"`

---

## Phase 6: Testing

### Task 6.1: Build iOS app

```bash
cd "src/ios/Nylon Impossible"
xcodebuild -scheme "Nylon Impossible" -destination "platform=iOS Simulator,name=iPhone 16" build
```

**Expected:** Build succeeds

---

### Task 6.2: Test Siri in Simulator

1. Run app in Simulator
2. Sign in (if not already)
3. Open Settings > Siri & Search > Shortcuts
4. Verify "Nylon" shortcuts appear
5. Test with: "Hey Siri, add 'test task' to Nylon"
6. Verify task appears in app

---

### Task 6.3: Test offline behavior

1. Enable airplane mode in Simulator
2. Use Siri to add a task
3. Verify task is created locally
4. Disable airplane mode
5. Open app, verify sync happens

---

## Summary

| Component | What was added |
|-----------|---------------|
| **Entitlements** | App Group, Siri capability |
| **SharedModelContainer** | SwiftData container in App Group for shared access |
| **TaskCreationService** | Reusable task creation logic |
| **AddTaskIntent** | App Intent for Siri task creation |
| **AppShortcuts** | Siri phrase registration |
| **AuthService** | userId persistence to shared UserDefaults |

## Acceptance criteria

- [ ] User can say "Hey Siri, add 'buy milk' to Nylon" and task is created
- [ ] Tasks created via Siri appear in the main app
- [ ] Tasks created via Siri sync to the server when app opens
- [ ] Siri confirms task creation with dialog
- [ ] Works offline (task syncs later)
