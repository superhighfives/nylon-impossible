# nylon-impossible

Baseline rules live in [superhighfives/control-room](https://github.com/superhighfives/control-room/blob/main/BASELINE.md).
This file is the repo-specific part.

## Layout

Bun workspaces: `src/shared`, `src/web`, `src/api`, `src/admin`,
`src/marketing`. `@nylon-impossible/shared` is consumed by both `web` and `api`.

`web`, `api`, and `admin` have their own check scripts, so `bun run typecheck`
and `bun run lint` fan out to those three. Per-package variants are prefixed
(`bun run api:test`, `bun run web:typecheck`).

## Bun

Bun is the package manager and script runner; Node still runs the tools.
wrangler, vitest (and `@cloudflare/vitest-pool-workers`) and vite execute
under Node via their shebangs, so don't add `--bun` to them, and keep
`actions/setup-node` in CI.

- Always `bun run <script>`. `bun test` is Bun's own test runner and ignores
  the `test` script entirely.
- A root script that targets one workspace is `bun run --cwd src/x <script>`.
  The flag has to come **after** `run`: `bun --cwd src/x run <script>` prints
  the script list and exits 0, so a check written that way passes without
  running anything.
- `bunfig.toml` pins the isolated linker, so each package only sees the deps it
  declares, as it did under pnpm.
- `patches/vitest@5.0.3.patch` is listed in `patchedDependencies` and keyed to
  that exact version. If vitest is bumped, regenerate the patch with
  `bun patch vitest` / `bun patch --commit`, or the API tests stop parsing.

Biome config lives at the root; each workspace invokes it with
`--config-path ../..`. Don't add a per-workspace `biome.json`.

## Hono context typing

API handlers take `Context<Env>`, not `Context<{ Bindings: Env }>`.

`Env` in `src/api/src/types.ts` already contains **both** `Bindings` and
`Variables`. Wrapping it in another `Bindings` key hides `Variables`, so
`c.get("userId")` stops type-checking — and the usual reflex is to paper over
that with `as string` rather than fix the annotation.

```ts
// Good
export async function processTodo(c: Context<Env>) {
  const userId = c.get("userId"); // already string
}

// Bad
export async function processTodo(c: Context<{ Bindings: Env }>) {
  const userId = c.get("userId") as string;
}
```

## Bindings

Resource bindings reached via `c.env.*` — D1, Durable Objects, Queues, and
plain `vars` — must exist in `Env["Bindings"]` **and** in the relevant
`wrangler.jsonc`. One that type-checks because someone widened the type but
isn't in the wrangler config will fail at runtime, not at build.

Secrets are the exception: `CLERK_SECRET_KEY`, `SENTRY_DSN`
and friends are typed in `Env["Bindings"]` but set with `wrangler secret put`,
so they deliberately don't appear in `wrangler.jsonc`.

## Errors

Handlers return errors through `apiError(c, code)` with a code from
`API_ERRORS` in `src/api/src/lib/errors.ts` — don't hand-write status codes or
message strings at the call site.

## Migrations: expand/contract

Deploy (`.github/workflows/web-deploy.yml`) **applies D1 migrations to the
shared D1 database (the `DB` binding) before rolling out the workers** — migrate → deploy
API → deploy web. Both the `web` and `api` workers bind the
same database, so during that window the schema is already new while the old
worker code is still serving.

A migration that **tightens** a constraint in one step therefore causes a brief
outage for live writes until rollout finishes. Concretely: `0023` made
`todos.list_id` NOT NULL with no default, and every write that omitted the
column 500'd (`NOT NULL constraint failed: todos.list_id`) for the length of the
deploy — surfacing on the client as `Error: No error message`.

For any constraint-tightening change, use **expand/contract**:

1. Migration A adds the column **nullable** (or with a safe default).
2. Deploy the workers that populate it.
3. Migration B (a later deploy) makes it `NOT NULL` / adds the strict
   constraint.

A single add-nullable-then-rebuild-NOT-NULL migration applied before the new
code deploys is what bites. Reordering CI to deploy-before-migrate just breaks
it the other way (new code expects a column the migration hasn't added yet), so
this is a migration-authoring discipline, not a CI tweak.

## Marketing screenshots

`marketing.yml` regenerates the landing-page screenshots on
superhighfives.com. It used to be a job inside `web-deploy.yml`, which meant
its flakes (Vite optimizer races, Clerk sign-in timeouts, `simctl launch` on a
wedged simulator) reported the *deploy* as failed — for a stretch, every red
`web-deploy` run was this job and `deploy-production` was green in all of them.
It now runs on `workflow_run` after a successful deploy, with its own status.

Two rules keep it that way, and both are easy to undo by accident:

- **Capture is best-effort.** `capturePhase` in `generate.ts` catches a failed
  capture and reuses the screenshot the workflow restored from cache, so the
  composite matches what's published and the publish step no-ops. Don't
  "fix" a flake by adding another retry — that's been tried four times and a
  new failure mode showed up each time. A run only fails when there's nothing
  to fall back to. `capture-status.json` records `fresh`/`cached`/`skipped`
  per asset; anything reused gets a `::warning::`.
- **Don't put it back in the deploy pipeline.** A job that calls a reusable
  workflow can't be given `continue-on-error`, so coupling them is all-or-
  nothing.

The iOS screenshots are cached against `hashFiles('src/ios/**', …)`, so a
web-only deploy skips the Xcode build and simulator entirely — that's most of
the runtime and nearly all of the flakiness. Only a fully fresh iOS set (every
`ios-*` entry in `capture-status.json`) is written back to that cache; caching
a reused one would pin stale screenshots to a revision they don't belong to.
To regenerate by hand, dispatch the workflow with `force_ios` (it also runs
`strict` by default, so a fallback fails rather than passing quietly).

What gets captured is listed in `src/marketing/manifest.json`:

- **Web** signs in with Clerk's testing helpers and shoots desktop (1440×900)
  and phone (390×844) in light and dark. `generate.ts` applies the local D1
  migrations and writes the demo data (`seed.ts`, which mirrors the iOS
  sample data) itself, inside the best-effort web phase — the seed needs the
  capture account's Clerk id, so there's no separate workflow step.
- **iOS** needs no account. It launches the DEBUG build with
  `-NylonScreen <route>` (plus `-NylonDark`, `-NylonLandscape`), which skips
  sign-in and draws in-memory sample data, on simulators the script creates
  for itself (6.9" iPhone, 13" iPad). iPhone and iPad are separate capture
  phases, so one flaking doesn't discard the other.
- `--web` writes the composites (browser + iPhone, and iPad + iPhone), a raw
  App Store set in `output/app-store/` (uploaded as a workflow artifact;
  App Store Connect upload is manual), and WebP shots for the web landing page
  in `output/landing/` (copy into `src/web/public/images/landing/`).

## Continuous improvement routines

Three Claude cloud routines are meant to run against this repo outside of any
local session — they're configured via claude.ai, not checked into
`.github/workflows/`, so this section is the source of truth for what they do
and why. All three are to open or update PRs only; none of them get merge
rights. A human merges everything they produce.

**Status: not yet live.** The routines below are the agreed design, not a
description of something already running — creating them needs an
`environment_id` from the claude.ai routines API, which wasn't reachable when
this was written. Treat this section as the spec to build against, and delete
this paragraph once all three exist and have run once.

- **Sentry sweep** — cron, nightly (~03:00 local). Runs the `review-sentry`
  skill against unresolved issues for this project and opens one PR per issue
  it decides is worth fixing.
- **Dependabot bundle** — cron, weekly (Monday morning). Runs the
  `dependabot-bundle` skill to combine that week's open dependabot PRs into a
  single PR.
- **PR shepherd** — event-triggered, not cron. Fires on `pull_request`
  (opened/synchronize) and `workflow_run` (completed) webhook events for this
  repo, so it reacts to a new commit or a finished CI run instead of polling
  on a timer. Runs the `shepherd` skill to push fixup commits, respond to
  review comments, and rebase on conflict for PRs it's watching.

If any of these starts producing bad output, disable it from claude.ai (or ask
Claude to do so via the `schedule`/`RemoteTrigger` tooling) rather than
reverse-engineering it from PR history — the routine definition, not this
file, is authoritative for the exact prompt and trigger config.
