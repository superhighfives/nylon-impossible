# Migrate PR previews to Worker Previews

**Date**: 2026-08-13
**Status**: In Progress
**Updated**: 2026-08-14

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
- **Secret command — version skew, not a plan error.** The docs show BOTH
  `wrangler preview base-config secret put <KEY>` (shared "base configuration"
  that every *new* preview inherits) and `wrangler preview secret put <KEY>
  --name <preview>` (one preview). BUT the pinned Wrangler (checked 4.119.0 and
  4.120.0) has **no `base-config` subcommand** — only `wrangler preview secret
  put <KEY> [--name <preview>]`, which targets a single preview (defaulting to
  the current git branch). So until a Wrangler with `base-config` is pinned,
  there is **no "set once, all previews inherit" path**: preview secrets must be
  set per-preview (per branch), or Wrangler must be bumped to a build that ships
  `base-config`. Resolve this as part of the out-of-band secret step.
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

- [ ] Confirm the Worker Previews private beta is enabled on the account and the
      active-preview limit is acceptable.
- [ ] Set preview secrets (API: `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`,
      `CLOUDFLARE_API_TOKEN`, and if present `TAVILY_API_KEY`,
      `INTERNAL_AGENT_SECRET`; Web: `CLERK_SECRET_KEY`). **Decide the mechanism
      first** given the version skew above: either (a) bump Wrangler to a build
      with `wrangler preview base-config secret put` and set them once on the
      base config, or (b) with the pinned CLI, set them per-preview via
      `wrangler preview secret put <KEY> --name <preview>` (needs a per-branch
      step — note this partially reintroduces per-preview secret management the
      migration aimed to drop).
- [ ] Add `https://*.workers.dev` (or the specific preview subdomains) to
      Clerk's allowed origins / authorized parties for the preview keys.
- [ ] Run one real `wrangler preview` (API + web) to verify the beta actually
      deploys, the `--json` shape matches `.preview.urls[0]`, and DO isolation /
      D1 sharing / no-cron-no-consumer behaviours hold as assumed above.
- [ ] One-time legacy cleanup of leftover `nylon-impossible-*-pr-*` workers and
      `nylon-impossible-research-pr-*` queues (the old sweep script's delete
      logic, run manually once).
- [ ] Optional: write the reusable `WORKER-PREVIEWS-MIGRATION.md` at repo root
      (listed under Dependencies) — not created yet.

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
3. **Previews share production D1 data.** D1 is shared by resource ID. Preview code can read/write prod todo data. This is the main "use with care" item — call it out in the PR that lands this.
4. **Clerk runs against production keys** via the preview base config. `*.workers.dev` preview origins likely need allow-listing in Clerk (and in any API CORS/origin check). Verification step below.

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

### Preview secrets (one-time, out of band)

Preview workers do not inherit production secrets. Set them once on the preview **base configuration** so every new preview starts with them:

```sh
# From src/api
printf '%s' "$CLERK_SECRET_KEY"      | pnpm exec wrangler preview base-config secret put CLERK_SECRET_KEY
printf '%s' "$CLERK_PUBLISHABLE_KEY" | pnpm exec wrangler preview base-config secret put CLERK_PUBLISHABLE_KEY
printf '%s' "$CLOUDFLARE_API_TOKEN"  | pnpm exec wrangler preview base-config secret put CLOUDFLARE_API_TOKEN
# Optional, if present:
printf '%s' "$TAVILY_API_KEY"        | pnpm exec wrangler preview base-config secret put TAVILY_API_KEY
printf '%s' "$INTERNAL_AGENT_SECRET" | pnpm exec wrangler preview base-config secret put INTERNAL_AGENT_SECRET

# From src/web (only what the web worker needs at runtime)
printf '%s' "$CLERK_SECRET_KEY" | pnpm exec wrangler preview base-config secret put CLERK_SECRET_KEY
```

This replaces the per-push `wrangler secret put` / `wrangler secret bulk` steps in the old job. If a team prefers CI-managed secrets, these commands can live in a manual `workflow_dispatch` job instead — but not on every PR push.

### Clerk / origin allow-listing

- Add the preview URL shape (`https://*.<subdomain>.workers.dev`, or the specific `<worker>` subdomains) to Clerk's allowed origins / authorized parties for the environment the preview keys belong to.
- Check the API for any explicit origin/CORS allow-list that currently only knows about `nylonimpossible.com` and `*-pr-*.nylonimpossible.com`; extend it to accept the workers.dev preview origins. `src/api/src/lib/auth.ts` uses `verifyToken` with a shared secret (no origin coupling there), but grep for CORS middleware before assuming there's nothing to change.

### Key considerations

- **Build ordering matters.** The web build bakes `VITE_API_BASE_URL` in at compile time (`src/web/src/lib/config.ts:6`). The API preview must be deployed and its URL captured *before* the web build runs.
- **Preview name = branch name.** Pushing more commits to the same PR updates the same preview and keeps the URL stable — same UX as today's `pr-N` comment.
- **AI binding** is account-level/stateless — works on previews with no extra config.
- **`--json` output** from `wrangler preview` is the documented machine-parseable way to grab URLs; use it rather than scraping stdout.
- **Legacy cleanup.** After this lands, one-time delete any lingering `nylon-impossible-*-pr-*` workers and `nylon-impossible-research-pr-*` queues from the old system (the existing sweep script logic can do this on a final manual run before the file is deleted).

## Acceptance criteria

- [ ] Step 0 checks pass (or Wrangler bumped so they do); documented in the PR.
- [ ] `previews` blocks added to `src/api/wrangler.jsonc` and `src/web/wrangler.jsonc`.
- [ ] `deploy-preview` job replaced with a `wrangler preview`-based job (API → capture URL → web build → web preview → comment).
- [ ] `cleanup-preview` job and all config-rewriting / queue-creation steps removed.
- [ ] `preview-cleanup-sweep.yml` deleted (after a final legacy cleanup run).
- [ ] Preview base-config secrets set for API and web.
- [ ] Clerk allowed origins + any API CORS allow-list updated for `*.workers.dev`.
- [ ] Opening a PR produces working web + API preview URLs, commented on the PR, with the web preview talking to the matching API preview.
- [ ] Pushing a second commit keeps the same preview URLs.
- [ ] Closing a PR leaves no manual cleanup required (auto-eviction handles it); no orphaned `*-pr-*` resources remain from the old system.

## Dependencies

- Related to: `plans/done/2026-08-07-clean-up-orphaned-preview-resources.md` (the orphan problem this migration retires).
- Generic version of this migration for reuse across other repos: `WORKER-PREVIEWS-MIGRATION.md` (repo root).

## References

- Previews overview: https://developers.cloudflare.com/workers/previews/
- Configuration (`previews` block, base config, secrets): https://developers.cloudflare.com/workers/previews/configuration/
- Resources and isolation (service bindings → prod, DO isolation, D1 sharing, queue-consumer caveat): https://developers.cloudflare.com/workers/previews/resources/
- Get started (External CI example): https://developers.cloudflare.com/workers/previews/get-started/
- Previews vs Version URLs vs Wrangler environments: https://developers.cloudflare.com/workers/configuration/compare-preview-workflows/
