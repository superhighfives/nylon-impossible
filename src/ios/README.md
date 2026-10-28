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
- Home Screen quick action — long-press the app icon for "New Task"
- Custom gradient-based design system
- Home Screen widget showing everything for today, with a tap-to-complete toggle

## Getting Started

### Prerequisites

- Xcode 26+
- iOS 26+ Simulator or device
- SwiftLint (`brew install swiftlint`)

### Development

```bash
# From the repo root
bun run ios:open       # Open in Xcode
bun run ios:simulator  # Open iOS Simulator
bun run ios:build      # Build via xcodebuild
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
| `Nylon Share` | `.appex` | Share sheet extension (iOS and macOS) |
| `Nylon Widget` | `.appex` | Home Screen and Mac desktop widget |
| `Nylon ImpossibleTests` | `.xctest` | Unit tests (iOS and macOS) |

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
| `bun run ios:open` | Open Xcode project |
| `bun run ios:build` | Build via xcodebuild |
| `bun run ios:simulator` | Open iOS Simulator |

SwiftLint is run from the project directory:

```bash
cd "src/ios/Nylon Impossible" && swiftlint
```

## Widget

`Nylon Widget/` renders everything on the user's Today list plus anything due
before local midnight, defined once as `TodayDigest`. Small and medium
families, up to four rows, with each row's circle a `CompleteTodoIntent` button
that completes the todo in place.

Three things are easy to get wrong here:

- **"Today" is two things, not one.** A list and a due date are independent
  (`plans/done/2026-08-06-time-bucket-lists.md`): a Today item can be undated
  or due weeks out, and reaching a due date never moves a todo into Today. So
  the widget takes the union — narrowing it to either half drops rows the user
  expects to see. The app icon badge is deliberately *not* the same set: it
  counts due-or-overdue only, because a badge is an attention count rather than
  a plan for the day. It still takes its cutoff from `TodayDigest`, so the two
  can't disagree about when the day ends.
- **Only the iOS widget polls.** A widget re-renders when its timeline
  expires or when something calls `WidgetCenter.reloadTimelines`. Every write
  path ends in `WidgetRefresh.reload()` — the app on backgrounding and on
  sign-in/out, the share extension, the Siri intent, and the completion itself.
  A new write path needs one too.

  On iOS each timeline also pulls from the server first
  (`WidgetServerRefresh`: `GET /todos` and `GET /lists`, 8 seconds, token from
  `SharedClerk`) and folds the rows into the shared store, so a web edit shows
  up with the app closed. It asks to be reloaded every 30 minutes, or at
  midnight if sooner. It never overwrites a row with a pending local change,
  and it soft-deletes rather than deletes rows the server no longer has,
  because the app may be suspended holding them; the app's next sync finishes
  the job. Any failure leaves the store alone. The Mac widget stays on the
  local store and reloads at midnight: it can't mint a token, and the running
  Mac app keeps the store current.

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

iOS builds go to TestFlight via Fastlane:

```bash
cd "src/ios/Nylon Impossible"
bundle exec fastlane beta      # TestFlight
bundle exec fastlane release   # App Store
```

In CI, `ios-deploy.yml` runs `beta` on every push to `main` that touches
`src/ios/**` (or by hand), and `ios-release.yml` runs `release` when
dispatched. Both build against the production API and Clerk instance.

Each embedded extension needs its own App Store provisioning profile, named in
the Fastfile's `provisioningProfiles` dict, carrying the same App Group and
Keychain Sharing capabilities as the app. A missing entry fails the export
step, not the archive.

## Mac

The same targets build a native SwiftUI Mac app (macOS 14+, not Catalyst)
with the same bundle IDs, so the App Store listing is one Universal Purchase.
Pick the "My Mac" destination, or:

```bash
cd "src/ios/Nylon Impossible"
xcodebuild build -scheme "Nylon Impossible" -destination 'platform=macOS'
xcodebuild test  -scheme "Nylon Impossible" -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO
```

What's Mac-only lives in `Nylon Impossible/Mac/` (each file `#if os(macOS)`);
the few UIKit/AppKit touch points shared code needs go through
`Platform/PlatformShims.swift`.

- **Window.** The iPad board in a `NavigationSplitView`: sidebar, columns,
  the inspector, the focused list as the window title. Menus come from
  `BoardMenuCommand` (File ▸ New Todo ⌘N / New List ⇧⌘N, View ▸ Today ⌘1 /
  This Week ⌘2 / Someday ⌘3 / Show Done ⇧⌘D, Todo ▸ the single-key map).
  ⌘Z reaches the toast's Undo through `ToastUndoBridge`. Text and links
  dragged in from other apps become todos in that column.
- **`ContentRoot` owns the queries.** The split view's columns and the
  inspector are separate view graphs on macOS; a `@Query` read from one of
  them trapped AttributeGraph ("setting value during update") at launch. Keep
  `@Query` out of `ContentView` and anything it hands to another column.
- **Services.** The window, Settings and the menu bar icon share
  `MacServices.shared`, so the menu bar, hotkey and Dock badge work with the
  window closed. The WebSocket stays connected while the app runs.
- **Menu bar and hotkey.** `MenuBarController` owns a plain `NSStatusItem`
  (not SwiftUI's `MenuBarExtra`, which crashed the status bar window — see
  the file's header). Its icon and the global hotkey (`GlobalHotKey`, Carbon
  `RegisterEventHotKey`: sandbox-safe, no permission prompt) open the same
  floating `QuickAddView` panel. Default ⌃⌥Space; both are switchable in
  Settings.
- **Dock badge.** `DockBadgeController` shows today's open count (the
  `TodayDigest` set the widget uses), recomputed on every store save, on
  `StoreChangeSignal` from the widget and share extension, on activation and
  at midnight. Unlike iOS, the desktop widget is also reloaded (debounced) on
  each save: a Mac's widgets are visible while the app is open.
- **Sign-in.** ClerkKitUI is iOS-only, so `MacSignInView` is a small view on
  ClerkKit with **Continue with Google** and **Continue with GitHub** — the
  only strategies the production Clerk instance enables — via
  `signInWithOAuth` in an `ASWebAuthenticationSession`. macOS hands that
  session to the default browser, and with Chrome it can stall with no page
  and no error; `MacSignInHandoff` spots a likely stall and offers Start Over
  and a link to the default-browser setting. `KeychainHelper` uses the data
  protection keychain on macOS so the shared access group applies.
  ClerkKit's own items stay in the login keychain, tied to the signature of
  the build that wrote them, so DEBUG builds use the service
  `….Nylon-Impossible.debug`, and unsigned builds and `-NylonScreen` runs get
  a fresh one per launch (`clerkOptions` in `Nylon_ImpossibleApp.swift`).
  That keeps local runs from leaving items the TestFlight build then prompts
  for.
- **App Group.** `TGHU37N6EX.com.superhighfives.Nylon-Impossible` on macOS —
  the Team-prefixed form macOS accepts without a provisioning profile entry —
  and `group.com.superhighfives.Nylon-Impossible` on iOS. Use
  `AppGroup.identifier`; never spell it out.
- **Screenshots.** The DEBUG routes run on the Mac binary:
  `"…/Nylon Impossible.app/Contents/MacOS/Nylon Impossible" -NylonScreen board -NylonDark YES`,
  plus `menubar`, `settings`, `share`, `widgets` and `menu`.

### Releasing the Mac app

`bundle exec fastlane mac beta` (TestFlight) and `mac release` archive for
macOS and upload a `.pkg`. In CI they're the `deploy-mac` jobs in
`ios-deploy.yml` and `ios-release.yml`, gated on the repository variable
`ENABLE_MAC_RELEASE` (when `true`, every TestFlight deploy ships a Mac build
too). They need, beyond the iOS secrets:

| Secret | What |
| --- | --- |
| `MAC_APP_PROFILE_BASE64` | "Nylon Impossible Mac AppStore" profile (`.provisionprofile`) |
| `MAC_SHARE_EXTENSION_PROFILE_BASE64` | "Nylon Share Mac AppStore" profile |
| `MAC_WIDGET_EXTENSION_PROFILE_BASE64` | "Nylon Widget Mac AppStore" profile |
| `MAC_INSTALLER_CERTIFICATE_BASE64` | Mac Installer Distribution certificate (`.p12`) |
| `MAC_INSTALLER_CERTIFICATE_PASSWORD` | Its password |

## License

MIT
