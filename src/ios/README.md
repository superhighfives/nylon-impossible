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

## Deployment

iOS builds are deployed to TestFlight via Fastlane:

```bash
cd "src/ios/Nylon Impossible"
bundle exec fastlane release
```

This is also automated via the `testflight.yml` GitHub Actions workflow.

## License

MIT
