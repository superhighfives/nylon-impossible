# Security Hardening

**Date:** 2026-02-27
**Status:** Ready
**Scope:** API + Web + iOS

## Overview

Audit and harden auth / permissions across the full stack. The goal is to ensure that every entry point — REST endpoints, WebSocket connections, server functions, and the iOS client — correctly validates identity and enforces data ownership. No cross-tenant data leakage, no unauthenticated access paths.

---

## Areas

### 1. Clerk JWT Verification (API)

**File:** `src/api/src/lib/auth.ts`

Current state: `verifyClerkJWT()` extracts the Bearer token and calls `verifyToken()` from `@clerk/backend`. The `authMiddleware` is applied to `/todos/*` routes in `src/api/src/index.ts`.

**Audit checklist:**

- [ ] Confirm `authMiddleware` covers **all** routes that touch user data — check `src/api/src/index.ts` for any route registered outside the middleware group
- [ ] Confirm the `/ws` WebSocket upgrade route verifies the token **before** the Durable Object upgrade, not after
- [ ] Verify expired tokens return 401, not 500 — test with a manually expired JWT
- [ ] Verify malformed tokens (missing header, wrong format, bad signature) return 401 cleanly
- [ ] Ensure `CLERK_SECRET_KEY` is set as a wrangler secret (not in `wrangler.jsonc` plaintext) — check current state
- [ ] Confirm no routes accidentally bypass middleware (e.g. early returns, route ordering bugs in Hono)

**Tests to add** (`src/api/test/unit/auth.test.ts`):

- Expired token → 401
- Malformed Authorization header → 401
- Missing Authorization header → 401
- Valid token → passes, `userId` set in context
- Token for different user → request rejected when accessing another user's resource

---

### 2. D1 Row-Level Access

**Files:** `src/api/src/handlers/todos.ts`, `src/api/src/lib/db.ts`

All D1 queries that read or write user data must include `WHERE userId = :userId` (or equivalent join). The `userId` must come from the verified JWT context — never from a request body or query param.

**Audit checklist:**

- [ ] `GET /todos` — confirm query filters by `userId` from auth context
- [ ] `POST /todos` — confirm new todo is created with `userId` from auth context, not from request body
- [ ] `GET /todos/:id` — confirm ownership check: `WHERE id = :id AND userId = :userId`; returns 404 (not 403) to avoid leaking existence
- [ ] `PUT /todos/:id` — same ownership check before update
- [ ] `DELETE /todos/:id` — same ownership check before delete
- [ ] `POST /todos/smart` — confirm extracted todos are created under the authenticated user
- [ ] `POST /todos/sync` — confirm sync only touches the authenticated user's todos
- [ ] `todoUrls` — confirm URL fetches and updates are gated on todo ownership (can't update a URL on another user's todo)
- [ ] Drizzle schema (`src/shared/src/schema.ts`) — confirm `userId` foreign key exists on all user-owned tables and is indexed

**What a cross-tenant leak looks like:** `GET /todos/abc123` where `abc123` belongs to a different user returns data. The fix is always: `WHERE id = ? AND userId = ?`, returning 404 if no row is found.

---

### 3. Durable Object / WebSocket Auth

**Files:** `src/api/src/durable-objects/UserSync.ts`, `src/api/src/index.ts`

WebSocket connections authenticate via a token query param (`?token=<jwt>`) on the `/ws` upgrade request.

**Audit checklist:**

- [ ] Confirm JWT is verified in `src/api/src/index.ts` **before** the request is forwarded to the Durable Object — the DO itself should receive a pre-verified `userId`, not the raw token
- [ ] Confirm the Durable Object is keyed per user (`USER_SYNC.idFromName(userId)`) so connections are strictly isolated
- [ ] Confirm the `/notify` POST endpoint (used by broadcast) is not publicly reachable — it should only be callable from within the Worker, not from the internet
- [ ] WebSocket `webSocketMessage()` — confirm incoming messages cannot trigger actions on behalf of other users
- [ ] Review what data is broadcast: confirm the sync payload only contains the requesting user's data
- [ ] Ensure WebSocket connections are cleaned up on `webSocketClose()` and `webSocketError()` to prevent zombie connections holding stale auth state

**Tests to add** (`src/api/test/integration/durable-object.test.ts`):

- WS upgrade with no token → rejected before reaching DO
- WS upgrade with expired token → rejected
- WS upgrade with valid token → connected, receives correct user's data only

---

### 4. iOS Client Auth

**File:** `src/ios/Nylon Impossible/Nylon Impossible/Services/AuthService.swift`

Current state: `Clerk.shared.auth.getToken()` is called on demand — no local token storage. `userId` is persisted to a shared `UserDefaults` suite.

**Audit checklist:**

- [ ] Confirm every API call uses a freshly retrieved token (not a cached string from a prior call)
- [ ] Confirm `AuthError.tokenFailed` is handled gracefully — user is signed out or prompted to re-authenticate, not left in a broken state
- [ ] Confirm the `UserDefaults` suite (`group.com.superhighfives.Nylon-Impossible`) only stores non-sensitive data (`userId`); no tokens, no secrets
- [ ] Confirm sign-out clears all shared defaults and any in-memory state
- [ ] Test the "expired session" path: what happens when the app resumes after a long background and `getToken()` returns nil or throws?
- [ ] Confirm unauthenticated network responses (401 from API) trigger a sign-out or re-auth flow, not a silent failure

---

### 5. Edge Cases

**Account deletion:**

- [ ] When a user account is deleted in Clerk, confirm their D1 data is also deleted (either via Clerk webhook → Worker endpoint, or on next auth attempt)
- [ ] Plan: add a `DELETE /users/me` endpoint that deletes the user row and cascades (todos, todoUrls, lists) — triggers from Clerk webhook on account deletion

**Token revocation:**

- [ ] Understand Clerk's token revocation behavior — short-lived JWTs (default ~60s) expire naturally; confirm `verifyToken()` rejects revoked sessions via Clerk's JWKS endpoint
- [ ] WebSocket connections use a token only at connection time — a revoked token won't disconnect an existing WS; document this limitation and decide if it's acceptable

**Concurrent sessions:**

- [ ] Multiple sessions (web + iOS simultaneously) both sync via the same Durable Object keyed by `userId` — this is by design; confirm broadcasts reach all connections for the same user
- [ ] Confirm there's no session-fixation risk: each connection independently verifies its own JWT

---

## Implementation Phases

### Phase 1: Audit (No Code Changes)

- [ ] Walk through every route in `src/api/src/index.ts` and confirm middleware coverage
- [ ] Review all D1 queries for ownership checks
- [ ] Review DO upgrade path and `/notify` visibility
- [ ] Review iOS auth error paths
- [ ] Document any gaps found

### Phase 2: Fix Gaps

- [ ] Add missing ownership checks to any queries that lack them
- [ ] Tighten WebSocket upgrade auth if token is validated too late
- [ ] Lock `/notify` endpoint to internal-only (route-level guard or remove external binding)
- [ ] Add iOS re-auth flow for 401 responses

### Phase 3: Account Deletion

- [ ] Add Clerk webhook endpoint to API: `POST /webhooks/clerk`
- [ ] Handle `user.deleted` event: delete user row (cascades via FK)
- [ ] Register webhook in Clerk dashboard

### Phase 4: Tests

- [ ] Auth unit tests: expired, malformed, missing tokens
- [ ] Ownership integration tests: cross-user access attempts return 404
- [ ] WS auth tests: upgrade rejected without valid token
