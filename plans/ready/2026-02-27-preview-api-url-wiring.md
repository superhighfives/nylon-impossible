# Plan: Wire Preview Deployments to Use Preview API

## Context

PR preview deployments create separate workers for web (`pr-N.nylonimpossible.com`) and API (`api-pr-N.nylonimpossible.com`), but both the web app and iOS app always talk to the production API.

**Web** — two client-side connections are hardcoded to `api.nylonimpossible.com`:

1. **Smart create** — `useTodos.ts` fetches `https://api.nylonimpossible.com/todos/smart`
2. **WebSocket** — `useWebSocket.ts` connects to `wss://api.nylonimpossible.com/ws`

Standard CRUD operations (getTodos, createTodo, updateTodo, deleteTodo) are TanStack server functions that run on the web worker itself via D1 bindings — these already work correctly in previews since they don't go through the API worker.

**iOS** — three places hardcode `api.nylonimpossible.com`:

1. **Config.swift** — `Config.apiBaseURL` used by `APIService` for sync + smart create
2. **WebSocketService.swift** — builds its own `wss://api.nylonimpossible.com/ws` URL
3. **APIService.swift** — reads from `Config.apiBaseURL` (so fixing Config fixes this)

## Approach

### Web

Introduce a `VITE_API_BASE_URL` env var. At build time, Vite bakes it into the client bundle. The deploy workflow conditionally sets it to the preview API URL when the API is also being deployed in that PR.

### iOS

Inject the API URL as an Xcode build setting (`API_BASE_URL`) that populates an `Info.plist` entry. `Config.swift` reads it at runtime instead of using a hardcoded value. The `#if targetEnvironment(simulator)` check stays as a local-dev override to `localhost`.

The TestFlight workflow changes from label-triggered to automatic on iOS PRs. It detects whether `src/api/**` also changed in the PR to decide whether to use the preview API or production.

```
                          API changed in this PR?
                         /                       \
                       yes                        no
                       /                           \
API_BASE_URL = api-pr-N.nylonimpossible.com    API_BASE_URL = api.nylonimpossible.com
```

**TestFlight caveat:** only one build is "current" at a time. If multiple iOS PRs are open, the latest build wins. This is fine if concurrent iOS PRs are rare.

---

## Web File Changes

### 1. New: `src/web/src/lib/config.ts`

Centralise the API URL logic into one place instead of duplicating across hooks:

```ts
const apiBaseUrl =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:8787"
    : (import.meta.env.VITE_API_BASE_URL ?? "https://api.nylonimpossible.com");

export const API_URL = apiBaseUrl;
export const WS_URL = apiBaseUrl.replace(/^http/, "ws") + "/ws";
```

### 2. Update: `src/web/src/hooks/useTodos.ts`

Replace the inline `API_URL` constant with the import:

```ts
import { API_URL } from "@/lib/config";
```

Remove the existing `API_URL` declaration (lines 9-12).

### 3. Update: `src/web/src/hooks/useWebSocket.ts`

Replace the inline `WS_URL` constant with the import:

```ts
import { WS_URL } from "@/lib/config";
```

Remove the existing `WS_URL` declaration (lines 13-16).

### 4. Update: `.github/workflows/deploy.yml`

In both the `deploy-preview` build step ("Build preview Web") and the `deploy-production` build step ("Build Web"), pass the API URL:

**Production** (no change needed — falls back to default in config.ts):
```yaml
- name: Build Web
  if: steps.changes.outputs.web == 'true'
  run: pnpm --filter @nylon-impossible/web run build
  env:
    VITE_CLERK_PUBLISHABLE_KEY: ${{ secrets.VITE_CLERK_PUBLISHABLE_KEY }}
```

**Preview** — conditionally set the API URL based on whether the API is also being deployed:
```yaml
- name: Build preview Web
  if: steps.changes.outputs.web == 'true'
  run: pnpm --filter @nylon-impossible/web run build
  env:
    VITE_CLERK_PUBLISHABLE_KEY: ${{ secrets.VITE_CLERK_PUBLISHABLE_KEY }}
    VITE_API_BASE_URL: ${{ steps.changes.outputs.api == 'true' && format('https://api-pr-{0}.nylonimpossible.com', github.event.pull_request.number) || 'https://api.nylonimpossible.com' }}
```

### 5. Optional: `src/web/src/vite-env.d.ts`

Add type declaration for the new env var so TypeScript knows about it:

```ts
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}
```

---

## iOS File Changes

### 6. Update: `src/ios/Nylon Impossible/Nylon-Impossible-Info.plist`

Add a new key that reads from the `API_BASE_URL` build setting:

```xml
<key>APIBaseURL</key>
<string>$(API_BASE_URL)</string>
```

### 7. Update: `src/ios/Nylon Impossible/Nylon Impossible/Services/Config.swift`

Replace the hardcoded `apiBaseURL` with a runtime read from Info.plist, keeping the simulator override for local dev:

```swift
enum Config {
    // MARK: - Clerk
    #if targetEnvironment(simulator)
    static let clerkPublishableKey = "pk_test_bW9yZS11bmljb3JuLTk0LmNsZXJrLmFjY291bnRzLmRldiQ"
    #else
    static let clerkPublishableKey = "pk_live_Y2xlcmsubnlsb25pbXBvc3NpYmxlLmNvbSQ"
    #endif

    // MARK: - API
    // Simulator uses localhost for local dev.
    // Device reads from Info.plist (set via API_BASE_URL build setting), defaulting to production.
    static let apiBaseURL: URL = {
        #if targetEnvironment(simulator)
        return URL(string: "http://localhost:8787")!
        #else
        if let override = Bundle.main.infoDictionary?["APIBaseURL"] as? String,
           !override.isEmpty,
           !override.hasPrefix("$("),   // unexpanded build setting
           let url = URL(string: override) {
            return url
        }
        return URL(string: "https://api.nylonimpossible.com")!
        #endif
    }()
}
```

The `!override.hasPrefix("$(")` guard handles the case where `API_BASE_URL` isn't set as a build setting in the Xcode project — `$(API_BASE_URL)` would appear as a literal string in the plist.

### 8. Update: `src/ios/Nylon Impossible/Nylon Impossible/Services/WebSocketService.swift`

Replace the hardcoded WS URL with one derived from `Config.apiBaseURL`:

```swift
// In doConnect(), replace the #if targetEnvironment(simulator) block:
let baseString = Config.apiBaseURL.absoluteString
let wsScheme = baseString.hasPrefix("https") ? "wss" : "ws"
let wsBase = baseString.replacingOccurrences(of: "https://", with: "\(wsScheme)://")
    .replacingOccurrences(of: "http://", with: "\(wsScheme)://")
let urlString = "\(wsBase)/ws?token=\(token)"
```

This replaces lines 59-63 (the `#if targetEnvironment(simulator)` / `#else` block). The scheme is automatically derived from whatever `Config.apiBaseURL` is — `http://localhost:8787` becomes `ws://`, `https://api-pr-N...` becomes `wss://`.

### 9. Update: `.github/workflows/testflight.yml`

**Change triggers** — fire on iOS PRs automatically, not just on label:

```yaml
on:
  push:
    branches: [main]
    paths:
      - "src/ios/**"
  pull_request:
    types: [opened, synchronize, reopened]
    paths:
      - "src/ios/**"
  workflow_dispatch:
```

**Remove the label gate** from the job `if`:

```yaml
if: >-
  github.event_name == 'push' ||
  github.event_name == 'workflow_dispatch' ||
  github.event_name == 'pull_request'
```

**Add API change detection** after checkout:

```yaml
- name: Detect API changes
  if: github.event_name == 'pull_request'
  uses: dorny/paths-filter@v3
  id: changes
  with:
    filters: |
      api:
        - 'src/api/**'
```

**Set `API_BASE_URL`** in the Fastlane build step env:

```yaml
- name: Build and upload to TestFlight
  env:
    APP_STORE_CONNECT_API_KEY_ID: ${{ secrets.ASC_KEY_ID }}
    APP_STORE_CONNECT_API_ISSUER_ID: ${{ secrets.ASC_ISSUER_ID }}
    APP_STORE_CONNECT_API_KEY_CONTENT: ${{ secrets.ASC_KEY_CONTENT }}
    BUILD_NUMBER: ${{ github.run_number }}
    SPM_CACHE_PATH: ${{ runner.temp }}/spm-cache
    API_BASE_URL: ${{ github.event_name == 'pull_request' && steps.changes.outputs.api == 'true' && format('https://api-pr-{0}.nylonimpossible.com', github.event.pull_request.number) || 'https://api.nylonimpossible.com' }}
  run: bundle exec fastlane beta --verbose
```

### 10. Update: `src/ios/Nylon Impossible/fastlane/Fastfile`

Pass `API_BASE_URL` through to xcodebuild as a build setting so it expands in Info.plist:

```ruby
# In the archive_cmd array, add:
"API_BASE_URL=#{ENV['API_BASE_URL'] || 'https://api.nylonimpossible.com'}",
```

This goes after the existing `CURRENT_PROJECT_VERSION=#{build_number}` line.

---

## What This Doesn't Cover

- **Database isolation** — both preview and production workers bind to the same D1 database. Preview deploys test code changes, not data isolation.
- **CORS** — the preview API worker gets a custom domain (`api-pr-N.nylonimpossible.com`), and the web preview gets its own (`pr-N.nylonimpossible.com`). If the API has CORS origin checks, they may need updating to allow preview origins. Similarly, iOS preview builds would be making requests from a native app to `api-pr-N`, which should be fine since native apps aren't subject to CORS.
- **Concurrent iOS PRs** — only one TestFlight build is active at a time. The last iOS PR to push wins. Acceptable if concurrent iOS PRs are rare.

## Testing

### Web
1. Push a PR that changes both `src/web/` and `src/api/` — verify the preview web app connects to `api-pr-N`
2. Push a PR that changes only `src/web/` — verify it still connects to production `api.nylonimpossible.com`
3. Verify local dev (`localhost`) still works as before

### iOS
4. Push a PR that changes both `src/ios/` and `src/api/` — verify the TestFlight build connects to `api-pr-N`
5. Push a PR that changes only `src/ios/` — verify the TestFlight build connects to production `api.nylonimpossible.com`
6. Push iOS changes to `main` — verify the TestFlight build connects to production
7. Verify simulator local dev (`localhost:8787`) still works as before
