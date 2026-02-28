# Plan: Wire Preview Deployments to Use Preview API + Consolidate CI

## Context

### Preview API wiring

PR preview deployments create separate workers for web (`pr-N.nylonimpossible.com`) and API (`api-pr-N.nylonimpossible.com`), but both the web app and iOS app always talk to the production API.

**Web** — two client-side connections are hardcoded to `api.nylonimpossible.com`:

1. **Smart create** — `useTodos.ts` fetches `https://api.nylonimpossible.com/todos/smart`
2. **WebSocket** — `useWebSocket.ts` connects to `wss://api.nylonimpossible.com/ws`

Standard CRUD operations (getTodos, createTodo, updateTodo, deleteTodo) are TanStack server functions that run on the web worker itself via D1 bindings — these already work correctly in previews since they don't go through the API worker.

**iOS** — three places hardcode `api.nylonimpossible.com`:

1. **Config.swift** — `Config.apiBaseURL` used by `APIService` for sync + smart create
2. **WebSocketService.swift** — builds its own `wss://api.nylonimpossible.com/ws` URL
3. **APIService.swift** — reads from `Config.apiBaseURL` (so fixing Config fixes this)

### CI is redundant

Currently there are 4 workflows that overlap:

| Workflow | Triggers on | Jobs |
|----------|-------------|------|
| `lint.yml` | every push to main, every PR | `lint-api`, `lint-web`, `lint-ios` (macOS runner) |
| `test.yml` | every push to main, every PR, `workflow_call` | `test-api`, `test-web`, (`test-ios` disabled) |
| `deploy.yml` | web/api changes on main + PRs | calls `test.yml` again via `workflow_call`, then deploys |
| `testflight.yml` | iOS changes on main, PRs with `testflight` label | builds + uploads |

A single push to main touching web/api files triggers **~8 job runs** across 3 workflows, with tests running twice (once standalone, once via deploy.yml's `workflow_call`). The macOS swiftlint runner fires even for web-only changes.

## Approach

### Preview API — Web

Introduce a `VITE_API_BASE_URL` env var. At build time, Vite bakes it into the client bundle. The deploy workflow conditionally sets it to the preview API URL when the API is also being deployed in that PR.

### Preview API — iOS

Inject the API URL as an Xcode build setting (`API_BASE_URL`) that populates an `Info.plist` entry. `Config.swift` reads it at runtime instead of using a hardcoded value. The `#if targetEnvironment(simulator)` check stays as a local-dev override to `localhost`.

```
                          API changed in this PR?
                         /                       \
                       yes                        no
                       /                           \
API_BASE_URL = api-pr-N.nylonimpossible.com    API_BASE_URL = api.nylonimpossible.com
```

**TestFlight caveat:** only one build is "current" at a time. If multiple iOS PRs are open, the latest build wins. This is fine if concurrent iOS PRs are rare.

### CI consolidation

Delete `lint.yml` and `test.yml` as separate workflows. Fold their work into the workflows that actually need them:

- **`deploy.yml`** gets a single `checks` job (lint + typecheck + test for api and web, one runner, one checkout/install). Deploy jobs depend on it via `needs: [checks]`. Path filtering means it only runs when web/api files change.
- **`testflight.yml`** gets swiftlint as a build step. It already only triggers on iOS changes, so no wasted macOS minutes on web-only PRs.
- **`copilot-setup-steps.yml`** stays as-is (manual dispatch only).

**Before:** push to main with web changes → 3 workflows, ~8 jobs, tests run twice
**After:** push to main with web changes → 1 workflow, 2 jobs (checks → deploy), tests run once

| Event | Before | After |
|-------|--------|-------|
| Push to main (web/api) | 3 workflows, ~8 jobs | 1 workflow, 2 jobs |
| PR (web/api) | 3 workflows, ~8 jobs | 1 workflow, 2 jobs |
| Push to main (iOS) | 3 workflows, ~6 jobs | 1 workflow, 1 job |
| PR (iOS) | 2 workflows, ~5 jobs | 1 workflow, 1 job |
| Push to main (both) | 4 workflows, ~12 jobs | 2 workflows, 3 jobs |

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

### 4. Optional: `src/web/src/vite-env.d.ts`

Add type declaration for the new env var so TypeScript knows about it:

```ts
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}
```

---

## iOS File Changes

### 5. Update: `src/ios/Nylon Impossible/Nylon-Impossible-Info.plist`

Add a new key that reads from the `API_BASE_URL` build setting:

```xml
<key>APIBaseURL</key>
<string>$(API_BASE_URL)</string>
```

### 6. Update: `src/ios/Nylon Impossible/Nylon Impossible/Services/Config.swift`

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

### 7. Update: `src/ios/Nylon Impossible/Nylon Impossible/Services/WebSocketService.swift`

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

### 8. Update: `src/ios/Nylon Impossible/fastlane/Fastfile`

Pass `API_BASE_URL` through to xcodebuild as a build setting so it expands in Info.plist:

```ruby
# In the archive_cmd array, add after CURRENT_PROJECT_VERSION:
"API_BASE_URL=#{ENV['API_BASE_URL'] || 'https://api.nylonimpossible.com'}",
```

---

## CI Workflow Changes

### 9. Delete: `.github/workflows/lint.yml`

Remove entirely. Lint + typecheck moves into `deploy.yml`'s `checks` job.

### 10. Delete: `.github/workflows/test.yml`

Remove entirely. Tests move into `deploy.yml`'s `checks` job. The `workflow_call` trigger is no longer needed since nothing calls it.

### 11. Update: `.github/workflows/deploy.yml`

Replace the `tests` job (which called `test.yml`) with an inline `checks` job that does lint, typecheck, and test in one go. Both `deploy-preview` and `deploy-production` depend on it.

**New `checks` job** (replaces the `tests` reference):
```yaml
checks:
  if: github.event_name != 'pull_request' || github.event.action != 'closed'
  runs-on: ubuntu-latest
  timeout-minutes: 10
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 22
    - run: pnpm install

    - name: Lint & typecheck API
      run: pnpm api:check && pnpm api:typecheck

    - name: Lint & typecheck Web
      run: pnpm web:check && pnpm web:typecheck

    - name: Test API
      run: pnpm --filter @nylon-impossible/api test

    - name: Test Web
      run: pnpm --filter @nylon-impossible/web test
```

**Update `deploy-preview` and `deploy-production`** to use `needs: [checks]` instead of `needs: [tests]`. The rest of these jobs stays the same (change detection, preview URL wiring, etc.), plus the `VITE_API_BASE_URL` additions from step 4 of the web changes above.

**Add `VITE_API_BASE_URL`** to the "Build preview Web" step env:
```yaml
VITE_API_BASE_URL: ${{ steps.changes.outputs.api == 'true' && format('https://api-pr-{0}.nylonimpossible.com', github.event.pull_request.number) || 'https://api.nylonimpossible.com' }}
```

### 12. Update: `.github/workflows/testflight.yml`

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

**Add swiftlint step** before the certificate setup:

```yaml
- name: SwiftLint
  run: |
    brew install swiftlint
    cd "src/ios/Nylon Impossible" && swiftlint
```

**Set `API_BASE_URL`** in the Fastlane build step env:

```yaml
API_BASE_URL: ${{ github.event_name == 'pull_request' && steps.changes.outputs.api == 'true' && format('https://api-pr-{0}.nylonimpossible.com', github.event.pull_request.number) || 'https://api.nylonimpossible.com' }}
```

---

## What This Doesn't Cover

- **Database isolation** — both preview and production workers bind to the same D1 database. Preview deploys test code changes, not data isolation.
- **CORS** — the preview API worker gets a custom domain (`api-pr-N.nylonimpossible.com`), and the web preview gets its own (`pr-N.nylonimpossible.com`). If the API has CORS origin checks, they may need updating to allow preview origins. Similarly, iOS preview builds would be making requests from a native app to `api-pr-N`, which should be fine since native apps aren't subject to CORS.
- **Concurrent iOS PRs** — only one TestFlight build is active at a time. The last iOS PR to push wins. Acceptable if concurrent iOS PRs are rare.
- **iOS tests** — `test-ios` is currently disabled (needs Xcode 26+ runner). When it's ready, it can be added as a step in `testflight.yml` before the archive, since it already runs on a macOS runner.

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

### CI consolidation
8. Push a PR touching only `src/web/` — verify only `deploy.yml` runs (no lint.yml or test.yml)
9. Push a PR touching only `src/ios/` — verify only `testflight.yml` runs
10. Push to `main` — verify checks run once, not twice, before deploy
