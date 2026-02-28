# Linting & Typechecking Plan (Completed)

## Context

The monorepo had inconsistent linting and typechecking across its three projects. Web had Biome configured but errors weren't enforced in CI. API had no linter. iOS had no SwiftLint. Typechecking existed for web and API but wasn't run in CI.

---

## What was done

### Phase 1: Added Biome to API

- Installed `@biomejs/biome@2.2.4` (matching web)
- Created `src/api/biome.json` with recommended rules, import organization, and test-file overrides (`noExplicitAny` and `noNonNullAssertion` off in `test/**`)
- Added `lint`, `format`, `check` scripts to `src/api/package.json`
- Added `api:lint`, `api:format`, `api:check`, root `lint`, `check` scripts to root `package.json`
- Auto-fixed formatting and import ordering across all API files
- Fixed `noImplicitAnyLet` in `src/api/src/handlers/sync.ts` (typed `serverTodos` as `Todo[]`)
- Fixed unused `error` parameter in `src/api/src/durable-objects/UserSync.ts` (prefixed with `_`)

### Phase 2: Fixed web lint & typecheck errors

- Added Biome overrides in `src/web/biome.json` for test files (`noExplicitAny`, `noNonNullAssertion` off in `__tests__/**`)
- Added `biome-ignore` comment for intentional `dangerouslySetInnerHTML` in `src/web/src/routes/__root.tsx`
- Auto-fixed formatting and import ordering across all web files
- Removed unused `within` import from `TodoPreview.test.tsx`
- Dropped `exactOptionalPropertyTypes` from `src/web/tsconfig.json` — it caused type errors in `@cloudflare/kumo` internals (Kumo ships `.tsx` source files, so `skipLibCheck` doesn't help)
- Added `"exclude": ["node_modules"]` to `src/web/tsconfig.json`

### Phase 3: Added SwiftLint to iOS

- Installed SwiftLint via Homebrew
- Created `src/ios/Nylon Impossible/.swiftlint.yml` with lenient config (disabled noisy rules like `identifier_name`, `type_name`, `cyclomatic_complexity`, `function_body_length` that caused false positives in algorithm code like `FractionalIndexing.swift`)
- Verified Xcode build produces zero warnings from project code (only an unrelated AppIntents metadata warning)
- SwiftLint: 0 violations across 17 files

### Phase 4: Strengthened API TypeScript config

- Added `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` to `src/api/tsconfig.json`
- Passed cleanly with no new errors

### Phase 5: CI enforcement

- Created `.github/workflows/lint.yml` with three parallel jobs:
  - `lint-api`: Biome check + tsc typecheck (ubuntu-latest)
  - `lint-web`: Biome check + tsc typecheck (ubuntu-latest)
  - `lint-ios`: SwiftLint (macos-15)
- Runs on all PRs and pushes to main
- Separate from test workflow for fast feedback

---

## Final state

| Project | Linter | Typecheck | CI |
|---------|--------|-----------|----|
| **API** | Biome 2.2.4 | `tsc --noEmit` (strict + noUnused*) | lint.yml |
| **Web** | Biome 2.2.4 | `tsc --noEmit` (strict) | lint.yml |
| **iOS** | SwiftLint 0.63.2 | Xcode build | lint.yml |

All checks pass: `pnpm api:check`, `pnpm api:typecheck`, `pnpm web:check`, `pnpm web:typecheck`, `swiftlint`.
