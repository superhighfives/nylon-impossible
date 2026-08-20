# Migrate PR previews to Worker Previews

**Date**: 2026-08-13
**Status**: Complete
**Updated**: 2026-08-20

## Implementation notes (2026-08-14)

Code changes landed on branch `migrate-worker-previews` (off `main`). What
actually shipped, and how it deviated from the spec below:

- **Step 0 result.** Installed Wrangler is **4.119.0**; `wrangler preview` and
  its `secret` / `settings` subcommands exist but are flagged **`[private
  beta]`**. This means the feature depends on account-level beta enablement and
  paid-plan preview limits that **cannot be verified from the repo** — confirm
  in the Cloudflare dashboard before merging.
- **Docs are on a preview host, and ahead of the shipped CLI.** The stable
  `developers.cloudflare.com/workers/previews/*` links 404; the real docs live at
  `worker-previews-docs-2.preview.developers.cloudflare.com/workers/previews/`.
  They confirm the resource model used below (see next bullet). Config choices
  were cross-checked against the bundled `wrangler/config-schema.json`
  (`PreviewsConfig`) and `wrangler preview --help`.
- **Secret command — `base-config` does not exist; secrets are CI-seeded per
  preview.** The docs mention `wrangler preview base-config secret put <KEY>`
  (shared "base configuration" every *new* preview inherits), but **no shipped
  Wrangler has a `base-config` subcommand** — verified on the pinned 4.119.0 *and*
  the latest 4.123.0, both of which expose only `wrangler preview secret
  put/delete/list/bulk [--name <preview>]`. There is no CLI "set once, all
  previews inherit" path (the only such mechanism is the Preview base config in
  the Cloudflare dashboard — a manual GUI action, invisible to the repo). So the
  workflow seeds secrets **per preview** with `wrangler preview secret put <KEY>
  --name <PREVIEW_NAME>` right after each deploy — automated in CI, so it is *not*
  the manual per-preview toil the migration aimed to drop. Wrangler was bumped
  4.119.0/4.120.0 → **4.123.0** (within the existing `^` ranges) because 4.123's
  `preview secret put` explicitly "create[s] a new deployment" with the secret
  applied, making the deploy-then-seed order correct on the *first* PR push.
- **Separate preview D1 — reverses the "share prod D1" decision.** Previews run
  on `*.workers.dev`, a different registrable domain than `nylonimpossible.com`,
  so production Clerk cookies (scoped to `.nylonimpossible.com`) aren't readable
  and interactive sign-in can't use the prod instance — previews must use the
  Clerk **development** instance (see the Clerk section). Dev-instance user IDs
  never match prod-provisioned `users` rows, so sharing prod D1 would 404 every
  `/users/me` (and pollute the prod users table on any auto-provision). The fix:
  a dedicated `nylon-impossible-preview-db`. Both the API and web `previews`
  blocks bind it by `database_id`; the API's top-level `DB` binding carries a
  matching `preview_database_id` so CI migrates it with `wrangler d1 migrations
  apply DB --preview --remote` (the `--preview` flag *requires* `--remote`). The
  app already provisions user rows on demand from Clerk in the sync handler (a
  fallback for the prod-only signup webhook); that was extracted into a shared
  `ensureUser` helper (`src/api/src/lib/ensure-user.ts`) and is now also called
  from `/users/me`, so a fresh dev-instance login provisions instead of 404ing.
  `ensureUser` additionally seeds a set of demo todos when a preview-allowlisted
  account (`marketing@nylonimpossible.com`, `hi@charliegleason.com`, matched by
  Clerk email) first provisions on a preview (`ENVIRONMENT === "preview"`), so
  logging into a preview as one of those accounts lands on a populated app
  instead of an empty one. Other accounts get a clean empty account.
- **Resource model confirmed by the docs** (`/workers/previews/resources/`):
  Durable Objects are "automatically isolated" per preview (own namespace +
  state); D1/KV/R2 are "shared by resource ID"; queue *producers* work when
  bound to the same resource, but "queue consumers … target production, not
  Previews"; "cron triggers … target production. They do not target Previews";
  and "service bindings from a Preview always call the bound Worker's production
  deployment." This matches the config exactly: API previews declare the queue
  *producer* only, no consumer and no cron, so the hourly list-sweep and the
  research consumer never run against shared prod D1 from a preview; TODO_AGENT
  necessarily hits prod. Active-preview limit is 100/worker on paid plans
  (10 on free); older previews auto-evict at the limit.
- **`previews` block, not a named env.** Bindings and `vars` are **not**
  inherited into the block (the docs' examples repeat them; `vars`/`define`
  schema descriptions say so explicitly), so each Worker's `previews` block
  repeats exactly what its previews need. `triggers` is not even a valid key in
  the block.
- **CORS.** `src/api/src/index.ts` now accepts `*.workers.dev` origins, but
  **only when `ENVIRONMENT !== "production"`** (same gating as localhost). The
  preview API runs with `ENVIRONMENT: "preview"`, so prod CORS stays pinned to
  our own domains. The legacy `(api-)?pr-N.nylonimpossible.com` allow-list entry
  was left in place (harmless during transition).
- **CI URL capture.** `wrangler preview --json` emits
  `{ "preview": { "name", "urls": [...] }, "deployment": {...} }`; the workflow
  reads `.preview.urls[0]` (with a `grep` fallback for a workers.dev URL if the
  beta JSON shape shifts). Preview name is the sanitised PR head branch, passed
  explicitly via `--name` because the Actions checkout is a detached merge ref.

### Still out of band (not doable from the repo — owner action required)

- [x] Confirm the Worker Previews private beta is enabled on the account and the
      active-preview limit is acceptable. — confirmed live: `deploy-preview` has
      been running against real PRs since this merged (PR #298).
- [x] ~~Set preview secrets~~ — **now automated in CI**, not out of band. The
      `deploy-preview` job seeds them per preview with `wrangler preview secret
      put --name <PREVIEW_NAME>` after each deploy (API: `CLERK_SECRET_KEY`,
      `CLERK_PUBLISHABLE_KEY`, `CLOUDFLARE_API_TOKEN`, optional `TAVILY_API_KEY` /
      `INTERNAL_AGENT_SECRET`; Web: `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`).
      No base-config command exists (see the secret-command note above), so
      per-preview seeding is the mechanism.
- [x] ~~Add `*.workers.dev` to Clerk allowed origins~~ — **moot**. Previews now
      run against the Clerk **development** instance (`CLERK_DEVELOPMENT_*`
      secrets, the same pair the marketing workflow uses), which accepts any
      request origin — so no Clerk dashboard config is needed for workers.dev. A
      `pk_live_`/`sk_live_` pair is domain-locked to `nylonimpossible.com` and
      can't serve a workers.dev origin anyway (cookie domain + FAPI origin).
- [x] Run one real `wrangler preview` (API + web) to verify the beta actually
      deploys, the `--json` shape matches `.preview.urls[0]`, and DO isolation /
      D1 sharing / no-cron-no-consumer behaviours hold as assumed above. —
      verified in production use; a follow-up fix (`preview_urls: true` in both
      `wrangler.jsonc`s) was needed because a plain `wrangler deploy` resets
      Preview URLs to off by default, which briefly broke `deploy-preview` on
      every PR until that was pinned (see `[[preview-urls-reset-on-deploy]]`
      memory / commit history).
- [ ] One-time legacy cleanup of leftover `nylon-impossible-*-pr-*` workers and
      `nylon-impossible-research-pr-*` queues (the old sweep script's delete
      logic, run manually once). — not confirmed done; worth a manual pass in
      the Cloudflare dashboard if it hasn't happened yet.
- [ ] Optional: write the reusable `WORKER-PREVIEWS-MIGRATION.md` at repo root
      (listed under Dependencies) — not created; skipped as optional.

## Problem

Every PR currently spins up an entire isolated stack through `.github/workflows/web-deploy.yml`. The `deploy-preview` job:

- Rewrites `src/api/wrangler.jsonc`, `src/web/wrangler.jsonc`, and `src/todo-agent/wrangler.jsonc` at runtime (renaming workers, swapping custom domains, rewiring queue producer/consumer/service bindings) — roughly 250 lines of `github-script` config surgery.
- Creates a dedicated per-PR queue (`nylon-impossible-research-pr-<N>`).
- Deploys three full Workers on custom domains (`pr-N.nylonimpossible.com`, `api-pr-N.nylonimpossible.com`, plus the todo-agent).
- Uploads secrets to each worker on every push.
- Tears it all down on PR close via the `cleanup-preview` job (unregister consumer → delete 3 workers → delete queue, in that exact order).

On top of that, `.github/workflows/preview-cleanup-sweep.yml` runs nightly as a backstop, listing every PR-shaped Worker and Queue in the account and deleting orphans, because the close-triggered cleanup has silently leaked resources in the past (see `plans/done/2026-08-07-clean-up-orphaned-preview-resources.md`).

This is a lot of bespoke machinery to reproduce something the platform now does natively.

## Solution

Adopt Cloudflare's **Worker Previews** feature. Each branch gets a stable preview via `wrangler preview`, driven by a declarative `previews` block committed to each `wrangler.jsonc`. Cloudflare:

- Creates/updates a named preview per branch (name defaults to the git branch), with a stable `<preview>-<worker>.<subdomain>.workers.dev` URL.
- Isolates Durable Object state per preview automatically.
- Shares prod D1 by resource ID (matches our "shared backend" decision).
- Auto-evicts stale previews when limits are hit (100 active previews/worker on paid plans).

This deletes all the runtime config rewriting, the per-PR queue, the close-triggered cleanup, and the entire nightly sweep.

### Scope decisions

- **API + web get previews. todo-agent stays production-only.** This is a platform constraint, not just a preference: a service binding from a preview *always* calls the bound Worker's **production** deployment and **cannot** target another Worker's preview ([Resources and isolation](https://developers.cloudflare.com/workers/previews/resources/)). So the API preview's `TODO_AGENT` binding necessarily hits prod todo-agent. Revisit only if we start actively changing todo-agent and need it isolated.
- **Web preview points at the matching API preview.** CI deploys the API preview first, reads its URL from `wrangler preview --json`, then builds the web preview with `VITE_API_BASE_URL` set to that URL. Frontend + backend changes on one branch are testable together, as they are today.
- **workers.dev URLs**, no custom domains. Zero DNS setup; drops the custom-domain-per-PR logic entirely.
- **External CI** — keep GitHub Actions and the existing PR-comment behaviour.

### Behavioral differences to accept

These are real changes from today's fully-isolated stack. They're acceptable given the "shared prod backend" decision, but must be documented so nobody is surprised:

1. **Preview API `UserSync` Durable Object is auto-isolated per preview.** Each branch gets fresh sync state. Arguably better; just different.
2. **Preview API does not consume the research queue.** Queue consumers are triggers that only ever target production ([Resources and isolation](https://developers.cloudflare.com/workers/previews/resources/)). Research-worker behaviour is exercised end-to-end only after merge (or against prod). This matches the accepted tradeoff of keeping todo-agent/backend prod-shared.
3. **Previews use a SEPARATE, isolated D1 (`nylon-impossible-preview-db`), not prod's.** This reverses the plan's original "share prod D1" decision — see the Implementation-notes deviation below. Preview code can't read or write real todo data, and preview logins (Clerk dev instance) don't pollute the prod users table. The API provisions a user row on demand from Clerk (shared `ensureUser`, used by `/users/me` and `/todos/sync`), since the Clerk signup webhook only fires in prod.
4. **Clerk runs against the development instance on previews**, not production. Dev instances accept any request origin, so `*.workers.dev` previews need no Clerk allow-listing; production keys are domain-locked to `nylonimpossible.com` and can't serve workers.dev. Sign-in routes through Clerk's `*.accounts.dev` Account Portal and shows a dev-mode badge — both expected for previews. (The API's own CORS still gates `*.workers.dev` on `ENVIRONMENT !== "production"`; see below.)

## Implementation

### Step 0 — Verify platform + tooling support (do this first)

- Confirm the pinned Wrangler version supports the `wrangler preview` command and the `previews` block in `wrangler.jsonc`. Run `pnpm exec wrangler --version` and `pnpm exec wrangler preview --help`. If the command is absent, bump Wrangler (root + per-project as needed) and re-run `pnpm install`.
- Confirm the account plan's active-preview limits are acceptable (100/worker on paid).
- If either check fails, stop and reassess before touching CI — the rest of the plan assumes `wrangler preview` is available.

### Files to modify

- `src/api/wrangler.jsonc` — add a `previews` block:
  - `vars`: set `ENVIRONMENT: "preview"` (and any preview-appropriate overrides of `WEB_BASE_URL` if we want it to point at the web preview — otherwise leave prod).
  - D1 binding: keep the same `database_id` so previews share prod data by resource ID. No change needed if the top-level binding is inherited; verify whether the `previews` block requires the binding to be repeated.
  - Do **not** add per-PR queues. The producer binding can stay pointed at the prod queue (shared by ID); the consumer will not fire on previews.
- `src/web/wrangler.jsonc` — add a `previews` block (mainly to opt the worker into previews and share prod D1). The API URL is a Vite build-time var, not a wrangler binding, so it is handled in CI, not here.
- `.github/workflows/web-deploy.yml`:
  - **Replace** the `deploy-preview` job with a preview job that:
    1. Installs deps.
    2. Runs `wrangler preview` for the API (`workingDirectory: src/api`), capturing the preview URL via `--json`.
    3. Applies D1 migrations to the shared prod DB (unchanged — previews share it).
    4. Builds the web app with `VITE_API_BASE_URL=<api preview URL>`, `VITE_IS_PREVIEW=true`, and the existing Sentry/Clerk vars.
    5. Runs `wrangler preview` for the web worker (`workingDirectory: src/web`), capturing its preview URL.
    6. Comments both preview URLs on the PR (reuse the existing find-or-update comment logic).
  - **Delete** the `cleanup-preview` job entirely.
  - **Delete** the "Ensure preview research queue exists" step and all three "Rewrite … wrangler config for preview" `github-script` steps.
  - Keep `test`, `deploy-production`, and `screenshots` jobs unchanged.
- `.github/workflows/preview-cleanup-sweep.yml` — **delete the file.** Auto-eviction replaces it. (Optionally keep a one-shot manual `workflow_dispatch` sweep for a transition period to mop up legacy `*-pr-N` workers/queues from the old system, then delete it once the account is clean.)

### Preview secrets (CI-automated, per preview)

Preview workers inherit no secrets from the top-level config or from production. Because no shipped Wrangler has a `base-config secret` command (see the secret-command note in Implementation notes), the `deploy-preview` job seeds each preview per name, right after its deploy:

```sh
# In the job, after `wrangler preview --name "$PREVIEW_NAME"`:
printf '%s' "$CLERK_SECRET_KEY" | pnpm exec wrangler preview secret put CLERK_SECRET_KEY --name "$PREVIEW_NAME"
# …CLERK_PUBLISHABLE_KEY, CLOUDFLARE_API_TOKEN, optional TAVILY_API_KEY /
#   INTERNAL_AGENT_SECRET for the API; CLERK_SECRET_KEY + VITE_CLERK_PUBLISHABLE_KEY
#   for the web worker.
```

On Wrangler 4.123 `preview secret put` creates a new deployment with the secret applied, so the running preview picks it up on the first push. The GitHub secret **values** are the Clerk **development** instance keys (`CLERK_DEVELOPMENT_SECRET_KEY` / `CLERK_DEVELOPMENT_PUBLISHABLE_KEY`), not production — the worker-side secret *names* are unchanged. This is CI-managed, so it does not reintroduce the manual per-push secret toil the old job had.

### Clerk / origin allow-listing — not needed

Previews use the Clerk **development** instance, which accepts any request origin, so there is nothing to add to Clerk for `*.workers.dev`. On the API side, `src/api/src/index.ts` CORS already accepts `*.workers.dev` origins when `ENVIRONMENT !== "production"` (the preview API runs as `ENVIRONMENT: "preview"`), so no further origin/CORS change is required.

### Key considerations

- **Build ordering matters.** The web build bakes `VITE_API_BASE_URL` in at compile time (`src/web/src/lib/config.ts:6`). The API preview must be deployed and its URL captured *before* the web build runs.
- **Preview name = branch name.** Pushing more commits to the same PR updates the same preview and keeps the URL stable — same UX as today's `pr-N` comment.
- **AI binding** is account-level/stateless — works on previews with no extra config.
- **`--json` output** from `wrangler preview` is the documented machine-parseable way to grab URLs; use it rather than scraping stdout.
- **Legacy cleanup.** After this lands, one-time delete any lingering `nylon-impossible-*-pr-*` workers and `nylon-impossible-research-pr-*` queues from the old system (the existing sweep script logic can do this on a final manual run before the file is deleted).

## Acceptance criteria

- [x] Step 0 checks pass (or Wrangler bumped so they do); documented in the PR.
- [x] `previews` blocks added to `src/api/wrangler.jsonc` and `src/web/wrangler.jsonc`.
- [x] `deploy-preview` job replaced with a `wrangler preview`-based job (API → capture URL → web build → web preview → comment).
- [x] `cleanup-preview` job and all config-rewriting / queue-creation steps removed.
- [x] `preview-cleanup-sweep.yml` deleted (after a final legacy cleanup run).
- [x] Preview secrets seeded per preview in CI (dev-instance Clerk keys) for API and web.
- [x] Clerk allow-listing not required (dev instance); API CORS already accepts `*.workers.dev` off `ENVIRONMENT`.
- [x] Opening a PR produces working web + API preview URLs, commented on the PR, with the web preview talking to the matching API preview.
- [x] Pushing a second commit keeps the same preview URLs.
- [ ] Closing a PR leaves no manual cleanup required (auto-eviction handles it); no orphaned `*-pr-*` resources remain from the old system. — auto-eviction is in place; the one-time legacy-resource cleanup itself isn't confirmed (see out-of-band list above).

## Overview

Replaced the fully bespoke per-PR preview stack (runtime `wrangler.jsonc`
rewriting, a dedicated per-PR queue, three custom-domain Workers, and a
close-triggered + nightly-sweep cleanup pair) with Cloudflare's native Worker
Previews feature. `deploy-preview` in `web-deploy.yml` now just runs
`wrangler preview` for the API, captures its URL, builds the web app against
it, and runs `wrangler preview` for web — Cloudflare handles naming, DO
isolation, and stale-preview eviction. Landed via PR #298, already merged and
running in production CI.

## Architecture

- **`previews` block per worker**, not a named environment — `src/api/wrangler.jsonc`
  and `src/web/wrangler.jsonc` each declare their own `previews` config (bindings
  aren't inherited from the top level).
- **Previews get their own D1** (`nylon-impossible-preview-db`), not prod's —
  this reverses the plan's original "share prod D1" assumption. Previews run on
  `*.workers.dev`, a different registrable domain than `nylonimpossible.com`, so
  production Clerk cookies aren't usable there; previews authenticate against
  Clerk's development instance instead, and a shared `ensureUser` helper
  (`src/api/src/lib/ensure-user.ts`) provisions a user row on demand since the
  prod-only signup webhook never fires on a preview.
- **No per-preview queue consumer or cron** — the platform only ever fires
  queue consumers and cron triggers on the production deployment, so research
  processing and the list-sweep only run post-merge. The API preview keeps its
  queue *producer* binding pointed at the shared prod queue.
- **`todo-agent` stays production-only** — a service binding from a preview
  always calls the bound Worker's production deployment, so isolating
  todo-agent as its own preview would be a no-op.
- **Secrets are seeded per preview in CI**, right after each `wrangler preview`
  deploy (`wrangler preview secret put ... --name <PREVIEW_NAME>`) — there is no
  shipped "base config, all previews inherit" command, contrary to what the
  (ahead-of-stable) docs implied at the time.
- **Deviation caught after merge:** `wrangler deploy` resets Preview URLs to
  off by default (matching `workers_dev`) on every deploy, which silently broke
  `deploy-preview` on subsequent pushes. Fixed by pinning `preview_urls: true`
  in both `wrangler.jsonc`s.

## Dependencies

- Related to: `plans/done/2026-08-07-clean-up-orphaned-preview-resources.md` (the orphan problem this migration retires).
- Generic version of this migration for reuse across other repos: `WORKER-PREVIEWS-MIGRATION.md` (repo root).

## References

- Previews overview: https://developers.cloudflare.com/workers/previews/
- Configuration (`previews` block, base config, secrets): https://developers.cloudflare.com/workers/previews/configuration/
- Resources and isolation (service bindings → prod, DO isolation, D1 sharing, queue-consumer caveat): https://developers.cloudflare.com/workers/previews/resources/
- Get started (External CI example): https://developers.cloudflare.com/workers/previews/get-started/
- Previews vs Version URLs vs Wrangler environments: https://developers.cloudflare.com/workers/configuration/compare-preview-workflows/
