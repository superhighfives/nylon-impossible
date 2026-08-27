# Nylon Impossible (iOS)

Native iOS client for the Nylon Impossible todo app. Built with SwiftUI and SwiftData, targeting iOS 26+.

## Tech Stack

- **SwiftUI** - Declarative UI framework
- **SwiftData** - Local persistence with model containers
- **Swift Concurrency** - async/await, actors, @Observable
- **[Clerk iOS SDK](https://clerk.com/docs/quickstarts/ios)** - Authentication
- **URLSession WebSocket** - Real-time sync notifications

### Development Tools

- **[SwiftLint](https://github.com/realm/SwiftLint)** - Swift linter
- **[Fastlane](https://fastlane.tools/)** - TestFlight deployment automation

## Features

- Create, complete, reorder, and delete todos
- Offline-first with local SwiftData storage
- Background sync with the API via `POST /todos/sync`
- Real-time sync via WebSocket (broadcasts between web and iOS)
- Clerk authentication (sign in with social providers or email)
- Custom gradient-based design system
- Home Screen widget showing what's due today, with a tap-to-complete toggle

## Getting Started

### Prerequisites

- Xcode 26+
- iOS 26+ Simulator or device
- SwiftLint (`brew install swiftlint`)

### Development

```bash
# From the repo root
pnpm ios:open       # Open in Xcode
pnpm ios:simulator  # Open iOS Simulator
pnpm ios:build      # Build via xcodebuild
```

Or open the project directly:

```bash
open "src/ios/Nylon Impossible/Nylon Impossible.xcodeproj"
```

### Configuration

The API base URL is configured in `Services/Config.swift`:
- **Simulator**: `http://localhost:8787` (connects to local API dev server)
- **Device**: `https://api.nylonimpossible.com`

Clerk is configured via the `Nylon Impossible.entitlements` file and the Clerk iOS SDK.

## Project Structure

```
src/ios/Nylon Impossible/Nylon Impossible/
├── Nylon_ImpossibleApp.swift    # App entry point, environment setup
├── ContentView.swift            # Main view (signed in vs signed out)
├── Models/
│   └── TodoItem.swift           # SwiftData model
├── ViewModels/
│   └── TodoViewModel.swift      # Todo state management
├── Views/
│   ├── Components/
│   │   ├── AddTaskInputView.swift
│   │   ├── TodoItemRow.swift
│   │   ├── EmptyStateView.swift
│   │   ├── GradientBackground.swift
│   │   └── HeaderView.swift
│   ├── Extensions/
│   │   └── Color+Hex.swift
│   └── SignInView.swift
├── Services/
│   ├── APIService.swift         # HTTP client (actor-isolated)
│   ├── AuthService.swift        # Clerk auth wrapper
│   ├── SyncService.swift        # Sync orchestration
│   ├── WebSocketService.swift   # Real-time sync notifications
│   └── Config.swift             # API URL configuration
├── Utils/
│   └── FractionalIndexing.swift # Position ordering algorithm
└── Assets.xcassets/
```

## Targets

| Target | Product | What it is |
|--------|---------|------------|
| `Nylon Impossible` | `.app` | The app |
| `Nylon Share` | `.appex` | Share sheet extension |
| `Nylon Widget` | `.appex` | Home Screen widget |
| `Nylon ImpossibleTests` | `.xctest` | Unit tests |

All three code targets open the same SwiftData store in the
`group.com.superhighfives.Nylon-Impossible` App Group (see
`SharedModelContainer`) and read credentials from the shared Keychain access
group. The extensions compile a subset of the app's own files rather than
importing a framework — the file list per target lives in the project's
`membershipExceptions`, so a new shared file has to be added there as well as
written.

Only the app performs the destructive store reset in `SharedModelContainer`:
an extension can be the first process to open the store after an update, and
resetting from there would discard unsynced todos before the app ever ran.

## Sync Architecture

1. **Local-first**: All changes are saved to SwiftData immediately
2. **Background sync**: `SyncService` sends unsynced items to `POST /todos/sync`
3. **Conflict resolution**: Server uses last-write-wins; conflicts are logged
4. **Real-time**: `WebSocketService` listens for `{"type": "sync"}` messages and triggers a pull
5. **Offline resilience**: Unsynced items are marked with `isSynced = false` and retried on next sync

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm ios:open` | Open Xcode project |
| `pnpm ios:build` | Build via xcodebuild |
| `pnpm ios:simulator` | Open iOS Simulator |

SwiftLint is run from the project directory:

```bash
cd "src/ios/Nylon Impossible" && swiftlint
```

## Widget

`Nylon Widget/` renders the todos due before local midnight — the same
definition the app icon badge uses, shared as `TodayDigest`. Small and medium
families, up to four rows, with each row's circle a `CompleteTodoIntent` button
that completes the todo in place.

Two things are easy to get wrong here:

- **Nothing polls.** A widget re-renders when its timeline expires (midnight,
  here) or when something calls `WidgetCenter.reloadTimelines`. Every write
  path ends in `WidgetRefresh.reload()` — the app on backgrounding and on
  sign-in/out, the share extension, the Siri intent, and the completion itself.
  A new write path needs one too.

  The app refreshes on backgrounding rather than per-mutation or per-sync,
  which is both sufficient (leaving the app is the only moment the widget
  becomes visible) and deliberate: `WidgetCenter` is a system-daemon client,
  and calling it from `SyncService.sync()` put an XPC round trip inside the
  hottest path in the test suite. `WidgetRefresh.reload()` also no-ops under
  `XCTestConfigurationFilePath` for the same reason.
- **Completion is not a flag flip.** `CompleteTodoIntent` calls
  `TodoCompletionService`, the same code the app's checkbox runs, so repeats
  roll forward and re-place themselves and subtasks follow their parent. Don't
  reimplement it against `isCompleted`. That service is a real toggle, though,
  and the widget button is one-way — it has no checked state to draw — so the
  intent no-ops on an already-completed todo rather than un-completing one from
  a stale entry.

The toggle uploads immediately via `BackgroundSyncService` when there's a valid
token, and otherwise leaves the todo unsynced for the app's next foreground
sync — an extension can't schedule a `BGTask` to retry sooner.

## Deployment

iOS builds are deployed to TestFlight via Fastlane:

```bash
cd "src/ios/Nylon Impossible"
bundle exec fastlane release
```

This is also automated via the `testflight.yml` GitHub Actions workflow.

Each embedded extension needs its own App Store provisioning profile, named in
the Fastfile's `provisioningProfiles` dict, carrying the same App Group and
Keychain Sharing capabilities as the app. A missing entry fails the export
step, not the archive.

## License

MIT
