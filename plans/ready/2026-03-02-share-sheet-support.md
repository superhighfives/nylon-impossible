# iOS Share Sheet Support

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add support for the iOS share sheet so users can send URLs and content from other apps (Safari, Twitter, etc.) directly to Nylon as tasks.

**Architecture:** Create a Share Extension target that uses the same App Group as the main app. The extension writes directly to the shared SwiftData container. When the main app opens, it syncs the new items to the server.

**Tech Stack:** Swift, Share Extension, SwiftData, App Groups

**Dependencies:** This plan depends on `2026-03-02-siri-integration.md` Phase 1 (App Group setup) and Phase 2 (SharedModelContainer) being complete.

---

## Phase 1: Create Share Extension Target

### Task 1.1: Create Share Extension target in Xcode

**Manual Xcode steps:**
1. Open `src/ios/Nylon Impossible/Nylon Impossible.xcodeproj`
2. File > New > Target
3. Select "Share Extension"
4. Product Name: `Nylon Share`
5. Team: Select your team
6. Bundle Identifier: `com.superhighfives.Nylon-Impossible.NylonShare`
7. Click Finish
8. When asked "Activate scheme?", click Cancel (we'll test manually)

This creates:
- `Nylon Share/` folder with ShareViewController.swift
- `Nylon Share/Info.plist`
- Updated project.pbxproj

**Verify:** New target appears in Xcode

---

### Task 1.2: Add App Group to Share Extension

**Files:**
- Create: `src/ios/Nylon Impossible/Nylon Share/Nylon Share.entitlements`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.security.application-groups</key>
	<array>
		<string>group.com.superhighfives.Nylon-Impossible</string>
	</array>
</dict>
</plist>
```

**Manual Xcode step:** Add the entitlements file to the Nylon Share target's Build Settings > Code Signing Entitlements.

**Commit:** `git commit -m "add App Group entitlement to Share Extension"`

---

### Task 1.3: Configure Share Extension Info.plist

**Files:**
- Modify: `src/ios/Nylon Impossible/Nylon Share/Info.plist`

Replace the NSExtension section with:

```xml
<key>NSExtension</key>
<dict>
    <key>NSExtensionAttributes</key>
    <dict>
        <key>NSExtensionActivationRule</key>
        <dict>
            <key>NSExtensionActivationSupportsWebURLWithMaxCount</key>
            <integer>1</integer>
            <key>NSExtensionActivationSupportsText</key>
            <true/>
        </dict>
    </dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.share-services</string>
    <key>NSExtensionPrincipalClass</key>
    <string>$(PRODUCT_MODULE_NAME).ShareViewController</string>
</dict>
```

This configures the extension to:
- Accept single URLs from Safari, etc.
- Accept plain text content

**Commit:** `git commit -m "configure Share Extension activation rules"`

---

## Phase 2: Share Extension Implementation

### Task 2.1: Add shared files to Share Extension target

**Manual Xcode steps:**
1. Select `TodoItem.swift` in Project Navigator
2. In File Inspector, under Target Membership, check "Nylon Share"
3. Repeat for:
   - `SharedModelContainer.swift`
   - `TaskCreationService.swift`
   - `FractionalIndexing.swift`

This allows the Share Extension to use the same models and services.

**Verify:** Build the Nylon Share scheme

---

### Task 2.2: Implement ShareViewController

**Files:**
- Modify: `src/ios/Nylon Impossible/Nylon Share/ShareViewController.swift`

```swift
import UIKit
import SwiftUI
import SwiftData
import UniformTypeIdentifiers

class ShareViewController: UIViewController {
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        // Process the shared content
        processSharedContent()
    }
    
    private func processSharedContent() {
        guard let extensionItems = extensionContext?.inputItems as? [NSExtensionItem] else {
            completeWithError()
            return
        }
        
        for item in extensionItems {
            guard let attachments = item.attachments else { continue }
            
            for provider in attachments {
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    handleURL(provider: provider)
                    return
                } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    handleText(provider: provider)
                    return
                }
            }
        }
        
        // No supported content found
        completeWithError()
    }
    
    private func handleURL(provider: NSItemProvider) {
        provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { [weak self] item, error in
            guard let url = item as? URL else {
                DispatchQueue.main.async {
                    self?.completeWithError()
                }
                return
            }
            
            DispatchQueue.main.async {
                self?.showShareSheet(with: url.absoluteString, isURL: true)
            }
        }
    }
    
    private func handleText(provider: NSItemProvider) {
        provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { [weak self] item, error in
            guard let text = item as? String else {
                DispatchQueue.main.async {
                    self?.completeWithError()
                }
                return
            }
            
            DispatchQueue.main.async {
                self?.showShareSheet(with: text, isURL: false)
            }
        }
    }
    
    private func showShareSheet(with content: String, isURL: Bool) {
        let shareView = ShareSheetView(
            content: content,
            isURL: isURL,
            onSave: { [weak self] title in
                self?.saveTask(title: title)
            },
            onCancel: { [weak self] in
                self?.cancel()
            }
        )
        
        let hostingController = UIHostingController(rootView: shareView)
        addChild(hostingController)
        view.addSubview(hostingController.view)
        hostingController.view.translatesAutoresizingMaskIntoConstraints = false
        
        NSLayoutConstraint.activate([
            hostingController.view.topAnchor.constraint(equalTo: view.topAnchor),
            hostingController.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hostingController.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hostingController.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        
        hostingController.didMove(toParent: self)
    }
    
    private func saveTask(title: String) {
        let container = SharedModelContainer.shared
        let context = ModelContext(container)
        
        // Get userId from shared UserDefaults
        let userId = UserDefaults(suiteName: "group.com.superhighfives.Nylon-Impossible")?
            .string(forKey: "currentUserId")
        
        let allTodos = TaskCreationService.fetchAllTodos(userId: userId, context: context)
        
        _ = TaskCreationService.createTask(
            title: title,
            userId: userId,
            context: context,
            allTodos: allTodos
        )
        
        completeWithSuccess()
    }
    
    private func completeWithSuccess() {
        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
    
    private func completeWithError() {
        let error = NSError(domain: "com.superhighfives.Nylon-Impossible.NylonShare", code: 0, userInfo: nil)
        extensionContext?.cancelRequest(withError: error)
    }
    
    private func cancel() {
        extensionContext?.cancelRequest(withError: NSError(domain: NSCocoaErrorDomain, code: NSUserCancelledError))
    }
}
```

**Verify:** Build the Nylon Share scheme

**Commit:** `git commit -m "implement ShareViewController with content handling"`

---

### Task 2.3: Create ShareSheetView SwiftUI component

**Files:**
- Create: `src/ios/Nylon Impossible/Nylon Share/ShareSheetView.swift`

```swift
import SwiftUI

struct ShareSheetView: View {
    let content: String
    let isURL: Bool
    let onSave: (String) -> Void
    let onCancel: () -> Void
    
    @State private var taskTitle: String = ""
    @FocusState private var isFocused: Bool
    
    init(content: String, isURL: Bool, onSave: @escaping (String) -> Void, onCancel: @escaping () -> Void) {
        self.content = content
        self.isURL = isURL
        self.onSave = onSave
        self.onCancel = onCancel
        // Set initial title based on content type
        _taskTitle = State(initialValue: isURL ? "Check: \(content)" : content)
    }
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Task")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    
                    TextField("Task title", text: $taskTitle, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .focused($isFocused)
                        .lineLimit(3...6)
                }
                .padding(.horizontal)
                
                if isURL {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("URL")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        
                        Text(content)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal)
                }
                
                Spacer()
            }
            .padding(.top)
            .navigationTitle("Add to Nylon")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        onCancel()
                    }
                }
                
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(taskTitle)
                    }
                    .fontWeight(.semibold)
                    .disabled(taskTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .onAppear {
            isFocused = true
        }
    }
}

#Preview {
    ShareSheetView(
        content: "https://example.com/article",
        isURL: true,
        onSave: { _ in },
        onCancel: { }
    )
}
```

**Verify:** Build succeeds

**Commit:** `git commit -m "add ShareSheetView SwiftUI component"`

---

## Phase 3: URL Handling

### Task 3.1: Update TaskCreationService to handle URLs

**Files:**
- Modify: `src/ios/Nylon Impossible/Nylon Impossible/Services/TaskCreationService.swift`

Add an overload that accepts a URL:

```swift
/// Create a todo item with an associated URL
/// URL will be synced and metadata fetched by the server
@MainActor
static func createTaskWithURL(
    title: String,
    url: String,
    userId: String?,
    context: ModelContext,
    allTodos: [TodoItem]
) -> TodoItem {
    let todo = createTask(
        title: title,
        userId: userId,
        context: context,
        allTodos: allTodos
    )
    
    // Store URL in the description for now
    // The server will extract it and fetch metadata on sync
    if todo.itemDescription == nil {
        todo.itemDescription = "URL: \(url)"
    }
    
    return todo
}
```

**Note:** This is a simple approach that stores the URL in the description. A more complete implementation would add a local URLs table, but this works with the existing sync infrastructure.

**Commit:** `git commit -m "add URL support to TaskCreationService"`

---

### Task 3.2: Update ShareViewController to use URL-aware creation

**Files:**
- Modify: `src/ios/Nylon Impossible/Nylon Share/ShareViewController.swift`

Update the `saveTask` method to handle URLs:

```swift
private func saveTask(title: String, url: String? = nil) {
    let container = SharedModelContainer.shared
    let context = ModelContext(container)
    
    let userId = UserDefaults(suiteName: "group.com.superhighfives.Nylon-Impossible")?
        .string(forKey: "currentUserId")
    
    let allTodos = TaskCreationService.fetchAllTodos(userId: userId, context: context)
    
    if let url = url {
        _ = TaskCreationService.createTaskWithURL(
            title: title,
            url: url,
            userId: userId,
            context: context,
            allTodos: allTodos
        )
    } else {
        _ = TaskCreationService.createTask(
            title: title,
            userId: userId,
            context: context,
            allTodos: allTodos
        )
    }
    
    completeWithSuccess()
}
```

Also update `showShareSheet` to pass the URL separately:

```swift
private var sharedURL: String?

private func showShareSheet(with content: String, isURL: Bool) {
    if isURL {
        sharedURL = content
    }
    // ... rest of existing code
}

// Update onSave callback:
onSave: { [weak self] title in
    self?.saveTask(title: title, url: self?.sharedURL)
}
```

**Commit:** `git commit -m "handle URLs in Share Extension"`

---

## Phase 4: Testing

### Task 4.1: Build both targets

```bash
cd "src/ios/Nylon Impossible"

# Build main app
xcodebuild -scheme "Nylon Impossible" -destination "platform=iOS Simulator,name=iPhone 16" build

# Build share extension
xcodebuild -scheme "Nylon Share" -destination "platform=iOS Simulator,name=iPhone 16" build
```

**Expected:** Both builds succeed

---

### Task 4.2: Test Share Extension in Simulator

1. Run the main Nylon app and sign in
2. Open Safari in Simulator
3. Navigate to any webpage
4. Tap the Share button
5. Select "Nylon" from the share sheet
6. Verify the ShareSheetView appears with the URL
7. Edit the title if desired
8. Tap Save
9. Open Nylon app
10. Verify the task appears in the list

---

### Task 4.3: Test with plain text

1. Open Notes app in Simulator
2. Select some text
3. Tap Share
4. Select "Nylon"
5. Verify text appears as task title
6. Save and verify in main app

---

### Task 4.4: Test offline behavior

1. Enable airplane mode in Simulator
2. Share a URL to Nylon
3. Verify task is saved locally
4. Disable airplane mode
5. Open Nylon app
6. Verify task syncs to server

---

## Summary

| Component | What was added |
|-----------|---------------|
| **Share Extension Target** | New `Nylon Share` target with App Group |
| **ShareViewController** | Handles URL and text content from share sheet |
| **ShareSheetView** | SwiftUI UI for editing task before save |
| **TaskCreationService** | URL-aware task creation method |
| **Info.plist** | Activation rules for URLs and text |

## Acceptance criteria

- [ ] Share Extension appears in iOS share sheet for Safari and other apps
- [ ] URLs shared from Safari create tasks with the URL
- [ ] Plain text shared from other apps creates tasks
- [ ] User can edit task title before saving
- [ ] Tasks created via share sheet appear in main app
- [ ] Tasks sync to server when main app opens
- [ ] Works offline (task syncs later)
- [ ] Cancel button dismisses share sheet without saving
