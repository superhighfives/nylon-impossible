# Security Hardening

**Date**: 2026-02-27
**Status**: Complete
**Scope**: API + Web + iOS

## Overview

Audit and harden auth / permissions across the full stack so every entry point — REST endpoints, WebSocket connections, and the iOS client — correctly validates identity and enforces data ownership. Shipped across three PRs:

- [#42](https://github.com/superhighfives/nylon-impossible/pull/42) — CORS allowlist, `updateTodo` ownership check, SSRF audit notes
- [#132](https://github.com/superhighfives/nylon-impossible/pull/132) — full audit, cross-user isolation tests, WS auth tests, iOS 401 sign-out
- [#143](https://github.com/superhighfives/nylon-impossible/pull/143) — follow-up fix for a post-sign-in 401 race

## What shipped

### Clerk JWT verification (API)

Audit confirmed `authMiddleware` covers every user-data route, the `/ws` upgrade verifies the token before reaching the Durable Object, and `CLERK_SECRET_KEY` is a wrangler secret (not plaintext in `wrangler.jsonc`). No gaps found.

### D1 row-level access

Audit confirmed every handler filters by `userId` from the JWT context. One real gap: `updateTodo` was issuing `UPDATE … WHERE id = :id` with no ownership check. Fixed by combining the clauses:

```ts
await db
  .update(todos)
  .set(updates)
  .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));
```

Cross-user isolation is now exercised by integration tests (`src/api/test/integration/todos-crud.test.ts`) covering `GET /todos`, `GET /todos/:id`, and `DELETE /todos/:id` — another user's row returns 404, not 403.

### Durable Object / WebSocket auth

Audit confirmed the JWT is verified in `src/api/src/index.ts` before the request reaches the DO, the DO is keyed per user via `USER_SYNC.idFromName(userId)`, and the `/notify` path is internal-only. Tests in `src/api/test/integration/routing.test.ts` now assert:

- Missing token → 401
- Invalid token → 401
- Missing `Upgrade` header → 400

### iOS client auth

`APIService` now calls `authService.signOut()` on any 401 response instead of leaving the app in a silently broken auth state. PR #143 softened this: on the first 401 we refresh the token and retry once, and only sign out if the retry also fails. This keeps the security guarantee (invalid sessions get signed out) while fixing a race at sign-in where the initial sync fired before Clerk's JWT had propagated.

JWT storage was moved from `UserDefaults` to the Keychain in a sibling plan ([`2026-03-27-ios-keychain-jwt-storage.md`](./2026-03-27-ios-keychain-jwt-storage.md)), which closes the "shared defaults should hold no tokens" item from the original audit.

### CORS

The permissive `origin: "*"` was replaced with a strict allowlist regex matching production (`nylonimpossible.com`), preview deployments (`pr-*.nylonimpossible.com`, `api-pr-*.nylonimpossible.com`), and `localhost` when `ENVIRONMENT !== "production"`. `ENVIRONMENT` is now wired through `Env` and set to `production` by the deploy workflow.

### URL metadata SSRF

Not mitigated in code — documented as an accepted risk while the user pool is private/closed. The plan captures the recommended mitigations (scheme allowlist, link-local / private-range denylist) to revisit before enabling public signups.

## Files changed

| File | Purpose |
|------|---------|
| `src/api/src/index.ts` | CORS allowlist with dev-mode localhost carve-out |
| `src/api/src/types.ts` | `ENVIRONMENT` added to `Env` bindings |
| `src/api/src/handlers/todos.ts` | `updateTodo` ownership check |
| `src/api/wrangler.jsonc` | `ENVIRONMENT` default = `development` |
| `.github/workflows/web-deploy.yml` | Production deploys pass `--var ENVIRONMENT:production` |
| `src/api/test/integration/routing.test.ts` | CORS allow/deny tests, `/ws` auth tests |
| `src/api/test/integration/todos-crud.test.ts` | Cross-user isolation tests |
| `src/ios/Nylon Impossible/Nylon Impossible/Services/APIService.swift` | Sign out on 401, with one-shot token refresh retry |

## Deferred

Not done as part of this plan — track separately if/when needed:

- **Account deletion via Clerk webhook** (Phase 3 in the original spec). No `POST /webhooks/clerk` or `DELETE /users/me` endpoint exists yet; deleting a Clerk user leaves orphaned rows in D1.
- **SSRF mitigations** in `fetchUrlMetadata` beyond documentation. Fine while signups are closed.
- **WebSocket token revocation**. A revoked Clerk session does not force-disconnect an existing WS connection; this is an accepted limitation given short-lived JWTs.
