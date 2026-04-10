# Sentry and Analytics

**Date:** 2026-02-28
**Status:** Complete
**Scope:** API + Web + iOS

## Overview

Add Sentry error tracking and performance monitoring across the full stack. Currently the only observability is `console.error()` calls and Cloudflare's built-in `observability: { enabled: true }` (which captures Worker invocation metrics but not application-level errors or user flows).

The goal: know when things break in production before users report them, and understand which features are actually being used.

---

## Privacy Constraints

Applies to all platforms:

- **No PII in error payloads** — scrub `title`, `description`, `url` from todo-related breadcrumbs; send structural context only (e.g. `"todo created"`, not the todo's content)
- **No email addresses** — Sentry user identification uses the opaque Clerk `userId` only
- **Source maps uploaded** for web and iOS to enable readable stack traces, but maps are not publicly accessible

---

## Environments

| Environment | Sentry Release | Sample Rate |
|-------------|---------------|-------------|
| Development | Not sent | 0% (Sentry disabled locally) |
| Production | Git SHA / build number | 100% errors, 10% performance traces |

Use `SENTRY_DSN` env var to gate Sentry — absent in dev, present in prod.

---

## Platform Plans

### 1. API Worker (Hono + Cloudflare Workers)

**Package:** `@sentry/cloudflare`

Cloudflare Workers have a specific Sentry SDK that wraps the Worker handler and instruments fetch events, D1, and KV bindings.

**Files to modify:**

- `src/api/src/index.ts` — wrap the Hono app with Sentry's Workers handler
- `src/api/wrangler.jsonc` — add `SENTRY_DSN` secret binding
- `src/api/package.json` — add `@sentry/cloudflare`

**Integration points:**

```ts
// src/api/src/index.ts
import * as Sentry from '@sentry/cloudflare';

export default Sentry.withSentry(
  (env) => ({
    dsn: env.SENTRY_DSN,
    environment: env.ENVIRONMENT ?? 'production',
    tracesSampleRate: 0.1,
    // Scrub todo content from breadcrumbs
    beforeSend(event) {
      // Strip request body from events (contains todo titles)
      if (event.request?.data) delete event.request.data;
      return event;
    },
  }),
  app, // Hono app
);
```

**What gets captured automatically:**

- Unhandled exceptions in any route handler
- D1 query performance (via binding instrumentation)
- Worker CPU time and invocation errors

**What to add manually:**

- [ ] Capture AI failures in `src/api/src/handlers/smart-create.ts` — currently `console.error()`; replace/augment with `Sentry.captureException(error, { tags: { area: 'ai' } })`
- [ ] Add `Sentry.setUser({ id: userId })` in `authMiddleware` (`src/api/src/lib/auth.ts`) after JWT verification — uses opaque ID, no PII
- [ ] Add structured breadcrumbs at key operations: todo created, sync triggered, research started
- [ ] Wrap Durable Object handler: `src/api/src/durable-objects/UserSync.ts` — capture WS errors and malformed message events that are currently silently swallowed

**Source maps:**

- [ ] Add `@sentry/vite-plugin` to upload maps on deploy (or use `wrangler` + sentry-cli in CI)
- [ ] Add build step to `package.json`: `sentry-cli releases files <version> upload-sourcemaps ./dist`

---

### 2. Web App (React + TanStack)

**Package:** `@sentry/react`

**Files to create/modify:**

- `src/web/src/lib/sentry.ts` — Sentry init, called once at app startup
- `src/web/src/routes/__root.tsx` — wrap root with Sentry error boundary; call `sentry.init()`
- `src/web/src/lib/errors.ts` — augment `errorToResponse()` to also capture to Sentry
- `src/web/src/hooks/useTodos.ts` — add `onError` Sentry capture to mutations
- `src/web/src/hooks/useWebSocket.ts` — capture WS parse errors

**Sentry init:**

```ts
// src/web/src/lib/sentry.ts
import * as Sentry from '@sentry/react';

export function initSentry() {
  if (!import.meta.env.VITE_SENTRY_DSN) return;

  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // No session replay content capture (PII risk)
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,     // off by default
    replaysOnErrorSampleRate: 0.5,  // capture replay on error only
    beforeSend(event) {
      // Don't send in dev
      if (import.meta.env.DEV) return null;
      return event;
    },
  });
}
```

**Error boundary:**

```tsx
// src/web/src/routes/__root.tsx
import { Sentry } from '@sentry/react';

// Wrap root outlet
<Sentry.ErrorBoundary fallback={<ErrorFallback />}>
  <Outlet />
</Sentry.ErrorBoundary>
```

**Checklist:**

- [ ] Install `@sentry/react` in `src/web/package.json`
- [ ] Create `src/web/src/lib/sentry.ts` with init function
- [ ] Call `initSentry()` in `__root.tsx` before render
- [ ] Add `Sentry.setUser({ id: userId })` after Clerk auth resolves (in root loader or `useUser()`)
- [ ] Wrap root with `<Sentry.ErrorBoundary>` — currently no React error boundary exists
- [ ] Add `Sentry.captureException(error)` in `errorToResponse()` for 500-class errors
- [ ] Add `onError: (error) => Sentry.captureException(error)` to TanStack Query mutations in `useTodos.ts`
- [ ] Add `VITE_SENTRY_DSN` to `.env.example`
- [ ] Upload source maps in CI via `@sentry/vite-plugin` in `vite.config.ts`

**Performance traces to add:**

- Todo list load time (from sync request start to render)
- Smart create end-to-end time (input → todo appears)

---

### 3. iOS App (SwiftUI)

**Package:** `sentry-cocoa` (via Swift Package Manager)

**Files to create/modify:**

- `NylonImpossibleApp.swift` (or equivalent app entry point) — Sentry init on launch
- `Services/AuthService.swift` — set user context after sign-in
- Network/API service files — capture request failures

**Init:**

```swift
import Sentry

SentrySDK.start { options in
    options.dsn = "https://..."
    options.environment = "production"
    options.tracesSampleRate = 0.1
    options.enableSwizzling = true         // auto-captures crashes
    options.enableAutoPerformanceTracing = true
    // Privacy: don't attach screenshots or view hierarchy
    options.attachScreenshot = false
    options.attachViewHierarchy = false
}
```

**Checklist:**

- [ ] Add `sentry-cocoa` via Swift Package Manager
- [ ] Init Sentry in app entry point (conditional on release build, not `#DEBUG`)
- [ ] Call `SentrySDK.setUser(User(userId: clerk.userId))` after successful sign-in in `AuthService.swift`
- [ ] Call `SentrySDK.setUser(nil)` on sign-out
- [ ] Capture `AuthError.tokenFailed` with `SentrySDK.capture(error:)`
- [ ] Capture sync/network failures with context: `{ "endpoint": "/todos/sync" }`
- [ ] Upload dSYMs in CI (Xcode Cloud or fastlane `upload_symbols_to_sentry`)

---

## Analytics

Separate from error tracking — lightweight event tracking to understand feature usage. No third-party analytics SDK needed initially; use Sentry's breadcrumbs/custom events or a minimal custom approach.

### Events to Track

| Event | Properties (no PII) |
|-------|---------------------|
| `todo.created` | `method: 'smart' \| 'manual'` |
| `todo.completed` | — |
| `todo.deleted` | — |
| `research.triggered` | `type: 'general' \| 'location'` |
| `research.completed` | `duration_ms` |
| `research.failed` | — |
| `sync.triggered` | `source: 'websocket' \| 'focus'` |
| `url.added` | — |

### Implementation

Track via Sentry's `addBreadcrumb()` or `captureEvent()` with `level: 'info'`. No separate analytics SDK needed until volume justifies it.

```ts
// Example in smart-create handler
Sentry.addBreadcrumb({
  category: 'todo',
  message: 'todo.created',
  data: { method: 'smart', count: todos.length },
  level: 'info',
});
```

---

## Implementation Phases

### Phase 1: API Worker

- [x] Add `@sentry/cloudflare` to `src/api/package.json`
- [x] Wrap Hono app in `Sentry.withSentry()` in `src/api/src/index.ts`
- [x] Add `SENTRY_DSN` and `ENVIRONMENT` as wrangler secrets
- [x] Add `Sentry.setUser()` in `authMiddleware`
- [x] Replace `console.error()` in `smart-create.ts` with `Sentry.captureException()`
- [x] Wrap Durable Object WS error handlers

### Phase 2: Web App

- [x] Add `@sentry/react` to `src/web/package.json`
- [x] Create `src/web/src/lib/sentry.ts`
- [x] Init in `__root.tsx`, add error boundary
- [x] Add user context after auth
- [x] Instrument `useTodos.ts` mutations and `useWebSocket.ts`
- [x] Add `VITE_SENTRY_DSN` to env config and `.env.example`
- [x] Add `@sentry/vite-plugin` for source map upload

### Phase 3: iOS

- [x] Add `sentry-cocoa` via SPM
- [x] Init in app entry point
- [x] Set/clear user on auth state changes
- [x] Capture known error paths in `AuthService.swift`
- [x] Configure dSYM upload in CI

### Phase 4: Analytics Events

- [x] Define final event list and properties (no PII review)
- [x] Instrument key user actions across web and API
- [ ] Verify events appear in Sentry dashboard
