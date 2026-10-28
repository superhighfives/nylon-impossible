---
title: Subscription Plans (Free + Pro)
status: Complete
created: 2026-03-23
updated: 2026-10-27
---

**Scope:** API + Shared Schema + Web UI

## Overview

The free/pro plan gate is fully implemented. The `plan` column exists on
`users` (default `'free'`), the auth middleware loads it into request context,
and every AI-spending endpoint checks `plan === "pro"` before running Workers
AI:

- `POST /todos/smart` — free users silently take the non-AI fast path.
- `POST /todos/:id/research` (re-research) — returns `pro_required` (403) for
  free users.
- `POST /todos/:id/reply` (conversation) — returns `pro_required` (403) for
  free users.

On the web, the Settings AI toggle and the location field (which only feeds AI
research) render only for pro users, and the todo editor's "Not used by AI"
hint is likewise pro-only. Free users see a clean, AI-free todo experience.

Payment processing (Stripe) and usage-based credits/trials remain out of scope
— plan upgrades are still a manual DB update (`users.plan = 'pro'`). A future
plan covers the payment integration and, if credits are introduced, the
usage-tracking schema they require.

## Architecture

This spec landed in March (#86) but wasn't built until July, by which time
AI ran after creation and sat behind a per-user `aiEnabled` switch
(`plans/done/2026-03-25-ai-features.md`). The gate was built on top of that
switch.

- **#191 (2026-07-01).** Migration `0011_add_user_plan.sql` added
  `users.plan` (`'free' | 'pro'`, default `'free'`), not `0002` as the spec
  said, since `0002` was already taken. `lib/auth.ts` loads `aiEnabled` and
  `plan` in one query and sets both on the context, typed in `types.ts`.
  `smart-create.ts` runs AI only when `aiEnabled && plan === "pro"`. The
  spec's `shouldUseAI` heuristic was already gone, so pro users with AI on
  always got enrichment. The same PR added the `src/admin` app and
  `PATCH /admin/users/:id/plan`, so plans were flipped from the admin UI
  instead of by hand in the database.
- **#194 (2026-07-04).** `GET/PATCH /users/me` returned `plan`, and the web
  and iOS apps showed the AI toggle only to pro users. The admin plan
  endpoint became a general `PATCH /admin/users/:id`.
- **#219 (2026-07-10).** Gated `POST /todos/:id/research` and
  `POST /todos/:id/reply` with a new `pro_required` (403) error, hid the
  location field and "Not used by AI" hint from free users, removed the dead
  web `AiToggle`, and wrote the Overview above.

Stripe and usage credits were never built.

**This no longer exists.** Eight days after #219, #234 (2026-07-18) dropped
the plan gate: the AI split button never showed for anyone without Pro, so
every AI feature went back to depending on `aiEnabled` alone, and
`ai_disabled` replaced `pro_required`. AI enrichment itself was removed in
#355 (2026-09-22). The `plan` column, its `/users/me` field and the admin
plan editing were removed in the backend schema reset (#386, 2026-10-18).

## Problem

All features are currently free with no usage gating. AI-powered todo extraction uses Cloudflare Workers AI, which has a real cost. As the app grows, unlimited free AI usage is not sustainable.

## Solution

Introduce two tiers:

| Feature | Free | Pro ($5/month) |
|---------|------|----------------|
| Core todos (create, edit, delete, sync) | ✅ | ✅ |
| URL extraction (regex-based) | ✅ | ✅ |
| Link previews (metadata fetching) | ✅ | ✅ |
| AI todo extraction (multi-item, natural language dates) | ❌ | ✅ |
| Research agent (future) | ❌ | ✅ |
| Repeating todos (future) | ✅ | ✅ |

### What "no AI" means for free users

The `POST /todos/smart` endpoint has two paths:

1. **AI path** — calls `extractTodos()` (Workers AI). Handles multi-item input, natural language dates ("tomorrow", "next Friday"), and intelligently extracts URLs from prose.
2. **Fast path** — creates a single todo directly from the raw text. Already handles URL-only input via `createFallbackItem`, and `ensureUrlsExtracted` regex-scans the title for any URLs.

Free users always take the fast path. They still get:
- Link previews when they paste a URL (regex extraction + HTML metadata fetching)
- Single-todo creation from any text
- All CRUD, sync, and list features

They miss out on:
- Creating multiple todos from one input ("buy milk, call mom, email team")
- Natural language due date parsing ("remind me Friday")
- AI-intelligently separated title vs URL (AI strips URLs from prose titles)

### URL extraction clarification

URL extraction is currently handled at two levels:
- **AI level**: the AI's `extract_todos` tool returns `urls` as a separate array, keeping them out of the title
- **Regex level** (`ensureUrlsExtracted` in `smart-create.ts`): a fallback that scans the title for raw URLs and lifts them into `todo_urls`

The regex path is already fully functional and non-AI. Free users get this. No refactoring needed.

### Payment integration

This plan does **not** include payment processing (Stripe etc). It adds the `plan` column and enforcement logic. Plan upgrades are manually managed for now (direct DB update). A separate payment integration plan should cover Stripe webhooks that flip `users.plan` to `'pro'`.

---

## Implementation

### 1. Database migration

Add `plan` column to `users` table:

```sql
ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free' CHECK(plan IN ('free', 'pro'));
```

New migration file: `src/api/migrations/0002_add_user_plan.sql`

### 2. Shared schema (`src/shared/src/schema.ts`)

Add `plan` to the `users` table definition:

```typescript
plan: text("plan", { enum: ["free", "pro"] }).notNull().default("free"),
```

### 3. Auth middleware (`src/api/src/lib/auth.ts`)

Currently sets `userId` in context. Extend to also load and set the user's `plan` from the DB, so handlers can read `c.get("plan")`.

- After verifying the JWT and getting `userId`, query `users` for `plan`
- Set it in context: `c.set("plan", user.plan)`
- Define the context variable type in `src/api/src/types.ts`

### 4. Smart create handler (`src/api/src/handlers/smart-create.ts`)

Before calling AI, check the plan:

```typescript
const plan = c.get("plan");
if (plan !== "pro") {
  // Free path: skip AI entirely, use fast path
  return createAndReturn(db, c, userId, [createFallbackItem(text)], firstPosition);
}
```

This replaces the `shouldUseAI(text)` branch for free users — they never go to AI regardless of input format.

The response should NOT expose a 402/error to free users — they just silently get the fast path. The `ai` flag in the response (`{ todos, ai: false }`) already signals to clients that AI was not used.

### 5. Types (`src/api/src/types.ts`)

Add `plan` to the Hono context variables:

```typescript
Variables: {
  userId: string;
  plan: "free" | "pro";
}
```

---

## Files to modify

| File | Change |
|------|--------|
| `src/api/migrations/0002_add_user_plan.sql` | New — adds `plan` column |
| `src/shared/src/schema.ts` | Add `plan` field to `users` table |
| `src/api/src/types.ts` | Add `plan` to context variables |
| `src/api/src/lib/auth.ts` | Load and set `plan` after auth |
| `src/api/src/handlers/smart-create.ts` | Gate AI path behind `plan === 'pro'` |

---

## Key considerations

- **Default is free**: All existing users get `plan = 'free'` via `DEFAULT 'free'`. No migration of existing data needed beyond the column add.
- **Graceful degradation**: Free users don't see an error — they just get a single todo. The existing fast-path fallback already handles this correctly.
- **`shouldUseAI` is unchanged**: The heuristic function still exists and is still used for pro users. Free users bypass it entirely.
- **No quota tracking needed**: This is a binary free/pro gate, not a usage counter. Simpler to start.
- **Auth cost**: Loading `plan` requires one extra DB query per request on `/todos/*` routes. This is acceptable; it can be cached later if needed.
- **Research agent**: When the research agent is implemented, it should also check `plan === 'pro'` before running.

---

## Acceptance criteria

- [ ] `users` table has a `plan` column defaulting to `'free'`
- [ ] All existing users remain on `'free'` after migration
- [ ] Free users calling `POST /todos/smart` always get the fast path (single todo, no AI)
- [ ] Pro users calling `POST /todos/smart` get the existing AI path when `shouldUseAI()` returns true
- [ ] Free users pasting a URL still get a link preview card (regex extraction + metadata fetch)
- [ ] `c.get("plan")` is available in all authenticated route handlers
- [ ] Response `ai: false` for free users, `ai: true` for pro users when AI is invoked
- [ ] No change to existing test suite for fast-path / AI path behaviour (plan is orthogonal)

---

## Dependencies

- No blockers
- Related: `plans/ready/2026-03-13-research-agent.md` — research agent should also be gated on `plan === 'pro'`
- Future: payment integration plan (Stripe webhooks to set `plan = 'pro'`)
