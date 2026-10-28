---
title: Linting & Typechecking
status: Complete
created: 2026-02-26
updated: 2026-10-27
---

## Overview

Before this, only web had a linter, nothing failed CI on lint or type errors,
and iOS had no SwiftLint. This work put Biome on the API, cleaned up the web
errors, added a lenient SwiftLint config for iOS, tightened the API
`tsconfig`, and enforced all of it in CI. It shipped as #3 on 2026-02-26.

## Architecture

At merge time:

| Project | Linter | Typecheck | CI |
|---------|--------|-----------|----|
| **API** | Biome 2.2.4 | `tsc --noEmit` (strict + noUnused*) | lint.yml |
| **Web** | Biome 2.2.4 | `tsc --noEmit` (strict) | lint.yml |
| **iOS** | SwiftLint 0.63.2 | Xcode build | lint.yml |

All checks pass: `pnpm api:check`, `pnpm api:typecheck`, `pnpm web:check`, `pnpm web:typecheck`, `swiftlint`.

Each TypeScript package had its own `biome.json` and `lint`/`check`/
`typecheck` scripts, with root scripts fanning out to them. CI was a separate
`lint.yml` with one job per project, kept apart from tests for faster
feedback.

The one deviation from the plan was dropping `exactOptionalPropertyTypes`
from the web `tsconfig`. Kumo ships `.tsx` source, so `skipLibCheck` couldn't
hide the errors it raised inside the library.

Most of the wiring has since moved:

- `lint.yml` lasted two days. #16 (merged 2026-02-28) deleted it and folded
  the checks into `deploy.yml` and `testflight.yml`, so a deploy waits on
  them. Today they run in
  `web-test.yml` (`api:check`, `api:typecheck`, `web:check`,
  `web:typecheck`) and `ios-test.yml` (SwiftLint).
- The per-package `biome.json` files were merged into one root `biome.json`
  on 2026-03-06. Each workspace calls it with `--config-path ../..`.
- pnpm was replaced by Bun in #391, so the commands are now
  `bun run api:check` and so on. `admin` has its own checks too.
- `src/ios/Nylon Impossible/.swiftlint.yml` is still in place.

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
