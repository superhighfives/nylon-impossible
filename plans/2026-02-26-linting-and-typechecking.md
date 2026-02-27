# Linting & Typechecking Plan

## Context

The monorepo has inconsistent linting and typechecking across its three projects. Web has Biome configured but errors are not enforced in CI. API has no linter at all. iOS has no SwiftLint. Typechecking exists for web and API but isn't run in CI either.

This plan adds consistent linting + typechecking across all three projects and enforces them in CI. It's designed to complement the [test suite implementation plan](2026-02-26-test-suite-implementation.md) — the CI job from Phase 5 of that plan should be extended (or merged) with the lint/typecheck CI job defined here.

---

## Current State

| Project | Linter | Formatter | Typecheck | CI Enforcement |
|---------|--------|-----------|-----------|----------------|
| **API** | None | None | `tsc --noEmit` (strict) | None |
| **Web** | Biome 2.2.4 | Biome | `tsc --noEmit` (strict+) | None |
| **iOS** | None | None | Xcode build | None |

### Known Issues

**Web:**
- 8 `noExplicitAny` warnings in test mocks (`TodoPreview.test.tsx`, `Header.test.tsx`, `LandingPage.test.tsx`)
- 1 `noUnusedImports` warning (`within` import in `TodoPreview.test.tsx`)
- 1 `noDangerouslySetInnerHtml` error in `__root.tsx` (theme detection script — intentional, needs suppression)
- 2 TS2375 errors from `@cloudflare/kumo` internals conflicting with `exactOptionalPropertyTypes` (library issue, covered by `skipLibCheck`)

**iOS (Xcode warnings):**
- "Main actor-isolated conformance of X to Decodable/Encodable cannot be used in actor-isolated context" warnings in `APIService.swift` (Codable structs used across isolation boundaries)
- "Immutable value 'modelContext' was never used" in `SyncService.swift`
- "Reference to captured var 'self' in concurrently-executing code" in `WebSocketService.swift`

**API:**
- No known type errors
- No linter configured, so no lint errors either

---

## Phase 1: Add Biome to API

Standardize on Biome across both TypeScript projects (consistent with web).

### Install Biome

Add `@biomejs/biome` to `src/api/package.json` devDependencies (same version as web: `2.2.4`).

### Create `src/api/biome.json`

```json
{
  "$schema": "https://biomejs.dev/schemas/2.2.4/schema.json",
  "vcs": { "enabled": false, "clientKind": "git", "useIgnoreFile": false },
  "files": {
    "ignoreUnknown": false,
    "includes": ["**/src/**/*", "**/test/**/*"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  },
  "assist": { "actions": { "source": { "organizeImports": "on" } } },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "javascript": {
    "formatter": { "quoteStyle": "double" }
  }
}
```

### Add scripts to `src/api/package.json`

```json
{
  "lint": "biome lint",
  "format": "biome format",
  "check": "biome check"
}
```

### Add root-level scripts to `package.json`

```json
{
  "api:lint": "pnpm --filter @nylon-impossible/api lint",
  "api:format": "pnpm --filter @nylon-impossible/api format",
  "api:check": "pnpm --filter @nylon-impossible/api check",
  "lint": "pnpm web:lint && pnpm api:lint",
  "check": "pnpm web:check && pnpm api:check"
}
```

### Fix any lint errors

Run `biome check --write` on the API codebase and fix anything that can't be auto-fixed.

### Files modified
- `src/api/package.json` — add Biome dep + scripts
- `src/api/biome.json` — new config
- `package.json` — add root lint/check scripts
- Any API source files that fail lint

---

## Phase 2: Fix Web Lint & Typecheck Errors

### Fix `noExplicitAny` in test files

Replace `any` with proper types in mock function parameters:
- `src/web/src/components/__tests__/TodoPreview.test.tsx`
- `src/web/src/components/__tests__/Header.test.tsx`
- `src/web/src/components/__tests__/LandingPage.test.tsx`

### Fix unused import

Remove `within` from the `@testing-library/react` import in `TodoPreview.test.tsx`.

### Suppress `dangerouslySetInnerHTML` in `__root.tsx`

The theme detection script in `src/web/src/routes/__root.tsx` intentionally uses `dangerouslySetInnerHTML` for an inline script tag. Add a Biome suppression comment:

```tsx
{/* biome-ignore lint/security/noDangerouslySetInnerHtml: inline theme detection script with no user input */}
<script dangerouslySetInnerHTML={{ ... }} />
```

### Verify typecheck passes

Run `pnpm web:typecheck` and confirm the Kumo TS2375 errors are already suppressed by `skipLibCheck: true`. If not, investigate further.

### Files modified
- `src/web/src/components/__tests__/TodoPreview.test.tsx`
- `src/web/src/components/__tests__/Header.test.tsx`
- `src/web/src/components/__tests__/LandingPage.test.tsx`
- `src/web/src/routes/__root.tsx`

---

## Phase 3: Add SwiftLint to iOS

### Install SwiftLint

Add SwiftLint via Homebrew (already available on macOS CI runners). Add to `src/ios/Nylon Impossible/Gemfile` or use a Swift Package Plugin if preferred. The simplest approach: install via Homebrew locally and add a build phase.

### Create `.swiftlint.yml`

Place at `src/ios/Nylon Impossible/.swiftlint.yml`:

```yaml
included:
  - Nylon Impossible

excluded:
  - Nylon Impossible/Preview Content
  - Nylon ImpossibleTests

disabled_rules:
  - trailing_whitespace
  - line_length

opt_in_rules:
  - empty_count
  - closure_spacing
  - force_unwrapping
  - implicitly_unwrapped_optional

analyzer_rules:
  - unused_import
  - unused_declaration
```

Start with a lenient config and tighten over time. The `disabled_rules` list keeps noise down initially.

### Add Xcode build phase (optional)

Add a "Run Script" build phase to the Xcode project that runs `swiftlint` on build. This gives inline warnings in Xcode. The script:

```bash
if command -v swiftlint >/dev/null 2>&1; then
  swiftlint
fi
```

### Fix iOS warnings

Address the current Xcode warnings:

1. **`APIService.swift`** — "Main actor-isolated conformance of X to Decodable": Mark Codable structs (`SyncResponse`, `APITodo`, `EmptyResponse`, `ErrorResponse`) as `nonisolated` or move them outside the `@MainActor` scope. Alternatively, add explicit `nonisolated` conformance.

2. **`SyncService.swift`** — "Immutable value 'modelContext' was never used": Remove or prefix with `_`.

3. **`WebSocketService.swift`** — "Reference to captured var 'self' in concurrently-executing code": Capture `self` explicitly with `[weak self]` or restructure the closure.

### Files modified
- `src/ios/Nylon Impossible/.swiftlint.yml` — new config
- `src/ios/Nylon Impossible/Nylon Impossible.xcodeproj/project.pbxproj` — build phase (if adding)
- `src/ios/Nylon Impossible/Nylon Impossible/Services/APIService.swift`
- `src/ios/Nylon Impossible/Nylon Impossible/Services/SyncService.swift`
- `src/ios/Nylon Impossible/Nylon Impossible/Services/WebSocketService.swift`

---

## Phase 4: Strengthen API TypeScript Config

The API tsconfig is less strict than the web's. Align them for consistency.

### Add stricter settings to `src/api/tsconfig.json`

```json
{
  "compilerOptions": {
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

Don't add `exactOptionalPropertyTypes` or `verbatimModuleSyntax` — these are more opinionated and may conflict with Cloudflare Workers types. Evaluate later.

### Fix any new errors

Run `pnpm api:typecheck` and fix unused variables/parameters surfaced by the new settings.

### Files modified
- `src/api/tsconfig.json`
- Any API source files with newly surfaced errors

---

## Phase 5: CI Enforcement

### New workflow: `.github/workflows/lint.yml`

Runs on all PRs and pushes to main. Should run before deploy and test workflows.

```yaml
name: Lint & Typecheck

on:
  push:
    branches: [main]
  pull_request:

jobs:
  lint-api:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: pnpm install
      - run: pnpm api:check
      - run: pnpm api:typecheck

  lint-web:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: pnpm install
      - run: pnpm web:check
      - run: pnpm web:typecheck

  lint-ios:
    runs-on: macos-15
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - run: brew install swiftlint
      - run: cd "src/ios/Nylon Impossible" && swiftlint
      - run: |
          xcodebuild \
            -project "src/ios/Nylon Impossible/Nylon Impossible.xcodeproj" \
            -scheme "Nylon Impossible" \
            -configuration Debug \
            -destination "generic/platform=iOS Simulator" \
            build 2>&1 | tee build.log
          ! grep -q "error:" build.log
```

### Coordinate with test suite CI

The [test suite plan](2026-02-26-test-suite-implementation.md) Phase 5 adds a `test.yml` workflow. These can either be:
- **Separate workflows** — lint runs fast and fails early, tests run in parallel
- **Combined** — lint jobs are `needs` dependencies of test jobs

Separate is recommended. Lint is fast (~30s) and should gate PRs independently.

### Files modified
- `.github/workflows/lint.yml` — new workflow

---

## Implementation Order

1. **API Biome setup** — Install, configure, fix errors
2. **Web lint/typecheck fixes** — Fix existing errors, add suppressions
3. **API tsconfig strictness** — Add stricter settings, fix errors
4. **iOS SwiftLint + warning fixes** — Install, configure, fix warnings
5. **CI workflow** — Add `.github/workflows/lint.yml`

## Verification

- API: `cd src/api && pnpm check && pnpm typecheck` — zero errors
- Web: `cd src/web && pnpm check && pnpm typecheck` — zero errors
- iOS: `cd "src/ios/Nylon Impossible" && swiftlint` — zero violations
- CI: Open a PR and verify all three lint jobs pass
