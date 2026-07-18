# Admin Interface

**Date:** 2026-06-22
**Status:** Complete
**Updated:** 2026-07-17
**Scope:** Standalone admin app + admin API endpoints + bundled self-serve account deletion

## Problem

There is no way to view users, toggle plans, or delete accounts without direct DB / Clerk dashboard access. Once subscription plans land (see `2026-03-23-subscription-plans.md`), manual plan flipping becomes a regular operation and needs a real surface. Account deletion also needs to cascade across DB and Clerk in both directions (admin-initiated and self-serve).

## Solution

Three pieces, shipped together with subscription plans in a single PR:

1. **Admin API endpoints** on the existing `@nylon-impossible/api` worker, gated by a `requireAdmin` middleware that checks the Clerk JWT for `publicMetadata.role === "admin"`.
2. **Standalone admin app** as a new `src/admin` workspace — Vite + React + Clerk, deployed as its own Cloudflare Pages/Worker project at `admin.nylon-impossible.com`. Same Clerk instance, so identity carries.
3. **Self-serve account deletion** — `DELETE /users/me` reusing the same cascade helper, plus a Clerk `user.deleted` webhook handler so out-of-band deletions from the Clerk dashboard clean up DB rows too.

### Why standalone

Keeps admin code out of the user-facing web bundle (no risk of accidentally shipping admin UI to end users), allows different auth posture (could later add IP allowlist / extra MFA) without complicating the main app, and the deploy target is small enough that the overhead is minimal.

### Admin identity

`publicMetadata.role` lives in the Clerk JWT (`sessionClaims`), so `requireAdmin` is a pure token check — no extra Clerk API call per request. Setting an admin happens via Clerk dashboard or backend SDK; not exposed in the admin UI for v1.

---

## Implementation

### 1. Admin middleware (`src/api/src/lib/auth.ts`)

Add `requireAdmin` middleware that runs after `authMiddleware`. Reads `publicMetadata.role` from the verified JWT payload (`verifyToken` already returns the full payload — extend `verifyClerkJWT` to also return claims, or do a second pass). Returns `403` if not admin.

```typescript
export const requireAdmin = createMiddleware<Env>(async (c, next) => {
  const role = c.get("role"); // set in authMiddleware from sessionClaims
  if (role !== "admin") return apiError(c, "forbidden");
  await next();
});
```

Extend `authMiddleware` to also `c.set("role", payload.publicMetadata?.role ?? null)`.

### 2. Cascade delete helper (`src/api/src/lib/delete-user.ts` — new)

Single helper used by admin-delete, self-serve-delete, and the Clerk webhook:

```typescript
export async function deleteUserCascade(
  env: Env["Bindings"],
  userId: string,
  opts: { deleteClerk: boolean },
): Promise<void> {
  const db = getDb(env.DB);
  // Drizzle ON DELETE CASCADE handles todos, lists, messages, urls.
  await db.delete(users).where(eq(users.id, userId));
  if (opts.deleteClerk) {
    await clerkClient(env).users.deleteUser(userId);
  }
}
```

- Admin delete: `deleteClerk: true`
- Self-serve delete: `deleteClerk: true`
- Webhook handler (Clerk → us): `deleteClerk: false` (already deleted in Clerk)

### 3. Admin endpoints (`src/api/src/handlers/admin.ts` — new)

All mounted under `/admin/*` with `authMiddleware` + `requireAdmin`:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/admin/users` | Paginated list — id, email, plan, createdAt, todoCount, lastSync |
| `GET` | `/admin/users/:id` | Single user with diagnostics (todo count, message count, last sync, research usage counters) |
| `PATCH` | `/admin/users/:id/plan` | Body `{ plan: "free" \| "pro" }` — flip plan |
| `DELETE` | `/admin/users/:id` | Cascade delete (DB + Clerk) |

Diagnostics use simple aggregate queries on `todos` / `todo_messages`. No new tables.

### 4. Self-serve deletion (`src/api/src/handlers/users.ts`)

Add `DELETE /users/me` — calls `deleteUserCascade(env, c.get("userId"), { deleteClerk: true })`.

### 5. Clerk webhook (`src/api/src/handlers/webhooks.ts` — new)

`POST /webhooks/clerk` — verifies Svix signature using `CLERK_WEBHOOK_SECRET`, handles `user.deleted` events by calling `deleteUserCascade(..., { deleteClerk: false })`. Other event types ignored for v1.

Mounted **outside** `authMiddleware` (Svix signature is the auth).

### 6. Standalone admin app (`src/admin` — new workspace)

- `package.json` name: `@nylon-impossible/admin`
- Stack: Vite + React + Clerk (`@clerk/clerk-react`) + Tailwind/Base UI (same as web)
- Routes:
  - `/` — protected, redirects to `/users`
  - `/users` — table: email, plan toggle, created, todo count, delete button (confirm modal)
  - `/users/:id` — detail page with diagnostics
- API calls hit the existing API base URL with the Clerk JWT in `Authorization`. No new client SDK — just `fetch`.
- Deployed as its own Cloudflare Worker via wrangler; route `admin.nylon-impossible.com/*`.
- Add scripts to root `package.json`: `admin:dev`, `admin:build`, `admin:deploy`, `admin:typecheck`, etc., mirroring `web:*`.
- Add to `pnpm-workspace.yaml`.

### 7. Self-serve delete UI (`src/web`)

Settings page: "Delete account" button → confirmation modal → `DELETE /users/me` → sign out → redirect to marketing site. Out of scope for the admin spec proper but bundled in the same PR as the API/webhook work.

---

## Files to create / modify

| File | Change |
|------|--------|
| `src/api/src/lib/auth.ts` | Add `requireAdmin`; set `role` in context |
| `src/api/src/lib/delete-user.ts` | New — cascade helper |
| `src/api/src/lib/clerk.ts` | New — wraps `@clerk/backend` `createClerkClient` |
| `src/api/src/handlers/admin.ts` | New — admin endpoints |
| `src/api/src/handlers/users.ts` | Add `DELETE /users/me` |
| `src/api/src/handlers/webhooks.ts` | New — Clerk webhook |
| `src/api/src/index.ts` | Mount `/admin/*` (admin-gated) and `/webhooks/clerk` (unauth) |
| `src/api/src/types.ts` | Add `role` to context |
| `src/api/wrangler.jsonc` | Add `CLERK_WEBHOOK_SECRET` to vars/secrets list |
| `src/admin/**` | New workspace — Vite + React + Clerk admin UI |
| `src/web/...` (settings page) | "Delete account" button + confirm modal |
| `pnpm-workspace.yaml` | Add `src/admin` |
| `package.json` (root) | Add `admin:*` scripts |

---

## Key considerations

- **One PR for plans + admin**: subscription gating, admin endpoints, admin app, self-serve delete, and Clerk webhook all land together. Avoids a window where admin can't toggle plans (the only mechanism to make someone Pro).
- **Cascade safety**: existing FK constraints already use `ON DELETE CASCADE` on todos/lists/messages — verify on every child table before relying on this.
- **Webhook idempotency**: Clerk may retry. `DELETE` on an already-deleted user should be a no-op (returns 0 rows affected), not an error.
- **Admin bootstrap**: first admin set manually in Clerk dashboard by editing user `publicMetadata`. Document this in `README.md`.
- **No audit log for v1**: every admin action is logged via existing Sentry breadcrumbs; a real audit table can come later if needed.
- **Pagination**: `/admin/users` defaults to 50, supports `?cursor=` (createdAt-based). Don't load all users at once.

---

## Acceptance criteria

- [ ] Non-admin users get `403` on any `/admin/*` route
- [ ] Admin (Clerk `publicMetadata.role === "admin"`) can list, view, plan-toggle, and delete users via the admin app
- [ ] Plan toggle persists and immediately affects `/todos/smart` behaviour for that user
- [ ] Admin delete removes all user data (todos, lists, messages, urls) and the Clerk user
- [ ] `DELETE /users/me` works for any authenticated user and signs them out
- [ ] Clerk `user.deleted` webhook removes the DB row without trying to re-delete in Clerk
- [ ] Webhook rejects requests with invalid Svix signature
- [ ] Admin app deploys to its own subdomain and loads with Clerk auth
- [ ] Root `package.json` has `admin:*` scripts matching the `web:*` pattern

---

## Dependencies

- Bundled with: `plans/ready/2026-03-23-subscription-plans.md` (same PR — admin UI is the way to flip plans)
- New env vars: `CLERK_WEBHOOK_SECRET` (set via `wrangler secret put`)
- New deploy target: `admin.nylon-impossible.com` Cloudflare Worker/Pages project

---

## Overview

This work landed three intertwined features in a single PR (#191) so that admins could flip subscription plans the moment the free/pro gate went live. First, a **subscription plan model**: a `plan` column (`text`, enum `free`/`pro`, `NOT NULL DEFAULT 'free'`, migration `0011_add_user_plan.sql`) on `users`, with the `/todos/smart` AI enrichment path gated on `plan === "pro"` (free users get a single fast-path todo, link previews still work). Second, an **admin surface** for viewing users, inspecting per-user diagnostics, toggling plan/settings, and cascade-deleting accounts — split across new API endpoints and a standalone `src/admin` app. Third, **self-serve and out-of-band account deletion**: a shared cascade helper feeding an admin delete, a new `DELETE /users/me`, and a new Clerk `user.deleted` webhook so deletions initiated in the Clerk dashboard sync back to the local DB. This is the first real operational tooling for the product; without it, plan changes and deletions required direct D1/Clerk-dashboard access.

## Architecture

**Auth / admin gating** (`src/api/src/lib/auth.ts`): `verifyClerkJWT` now returns an `AuthResult` of `{ userId, role }`. Role is extracted from the verified JWT payload's metadata — notably it reads **both** `public_metadata` (the real snake_case claim Clerk emits) and `publicMetadata`, a correction over the plan's assumption of camelCase. `authMiddleware` sets `role` (and `plan`) into context; `requireAdmin` is a pure token check returning `403` with no extra Clerk API call, as designed. `/admin/*` is mounted with `authMiddleware + requireAdmin` in `src/api/src/index.ts`; `/webhooks/clerk` is mounted outside auth (Svix signature is the auth).

**Cascade delete** (`src/api/src/lib/delete-user.ts`): `deleteUserCascade(env, userId, { deleteClerk })` deletes the DB row (children cascade via FK constraints) and optionally deletes the Clerk user. It went beyond the plan with real error handling — Clerk 404s are swallowed as "already gone" (idempotency for webhook retries), but any other Clerk failure is reported to Sentry and rethrown so DB/Clerk don't silently drift. Three callers: admin delete (`deleteClerk: true`), `DELETE /users/me` (`deleteClerk: true`), webhook (`deleteClerk: false`). `src/api/src/lib/clerk.ts` wraps `@clerk/backend`'s client as planned.

**Admin endpoints** (`src/api/src/handlers/admin.ts`): `GET /admin/users` (cursor pagination, default 50 / max 200, `createdAt`-ms cursor, per-user `todoCount` via a correlated subquery — with an inline comment about Drizzle rendering unqualified column refs), `GET /admin/users/:id` (diagnostics: `todoCount`, `messageCount`, `researchCount` from `todoResearch`, and `lastTodoUpdatedAt` — the plan's vaguer "last sync / research usage counters"), and `DELETE /admin/users/:id`. **Deviation:** the plan's plan-only `PATCH /admin/users/:id/plan` became a general `PATCH /admin/users/:id` accepting `plan`, `aiEnabled`, and `location` (zod-validated). `DELETE /users/me` (`deleteMe`) was added to `src/api/src/handlers/users.ts` as planned.

**Webhook** (`src/api/src/handlers/webhooks.ts`): Svix verification is implemented **inline** rather than via the `svix` SDK (kept deps lean, auditable in one place) — HMAC-SHA256 over `${id}.${timestamp}.${body}` using the base64-decoded `whsec_` secret, a 5-minute timestamp tolerance, multi-signature support, and a length-independent constant-time compare. Only `user.deleted` is acted on; other events are acknowledged. Missing `CLERK_WEBHOOK_SECRET` returns `forbidden`.

**Standalone admin app** (`src/admin`): Vite + React + Clerk deployed as its own Worker `nylon-impossible-admin` via **Workers Static Assets** (SPA `not_found_handling`), custom domain `admin.nylonimpossible.com` — not Cloudflare Pages, and note the real apex is `nylonimpossible.com` (no hyphen), unlike the plan text's `nylon-impossible.com`. **Deviation:** it is *not* a react-router app with `/users` and `/users/:id` routes as proposed; it is a single-page master/detail layout (`App.tsx` → `UsersTable` + a `UserDetailPanel` side drawer, selection held in local state). Auth uses `@clerk/react` with `<SignIn routing="hash">`, and the UI does a client-side `role === "admin"` check in addition to the server gate. API calls use plain `fetch` with the Clerk JWT (`src/admin/src/api.ts`). Deployment is wired through a new GitHub Actions workflow `.github/workflows/admin-deploy.yml` (lint/typecheck then `wrangler deploy`, path-filtered to `src/admin/**`) — an addition beyond the plan, which only mentioned an `admin:deploy` script. Root `package.json` gained the full `admin:*` script family and `admin` was added to `pnpm-workspace.yaml` and the aggregate `lint`/`check`/`typecheck` tasks.

**Web self-serve delete** (`src/web`): `SettingsModal.tsx` has a danger-zone "Delete account" button using a `window.confirm` guard and a `useDeleteCurrentUser` hook (`src/web/src/hooks/useUser.ts`) that calls `DELETE /users/me` then signs out.

**Not shipped / follow-ups** (per PR body): Stripe/payment integration (plan flipping remains admin-only), iOS self-serve delete UI, and the actual production deploy — the admin Worker DNS, `wrangler secret put CLERK_WEBHOOK_SECRET`, and configuring the Clerk webhook endpoint were all left as post-merge operational steps. Tests were added (`admin.test.ts`, `webhooks.test.ts`, `auth.test.ts`, `smart-create.test.ts`), which the plan did not enumerate.
