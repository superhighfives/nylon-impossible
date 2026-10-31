# nylon-impossible

Baseline rules live in [superhighfives/control-room](https://github.com/superhighfives/control-room/blob/main/BASELINE.md).
This file is the repo-specific part.

Read [PRINCIPLES.md](PRINCIPLES.md) before any UI or copy change. Its Settled
table needs a written reason to reopen.

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

What gets captured is listed in `src/marketing/manifest.json`. Its one
`timeZone` pins the browser (`timezoneId`), the simulators
(`SIMCTL_CHILD_TZ` on launch) and the seeded user, so every shot shows the
same weekday and date.

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
- `--parity` (never part of `--all`) captures `manifest.parity`'s screens on
  iOS and web at the same logical size and writes
  `output/parity/parity-{light,dark}.png`, each screen an "iOS | Web" pair.
  It uses simulators of its own ("Nylon Parity …"), is uploaded from
  `marketing.yml` as the `parity-sheet` artifact, and is never published.
- `audit.ts` runs axe and the layout checks (row movement on done, 44px
  targets, focus, Escape, 200% zoom, reduced motion) against a running,
  seeded dev server: `MARKETING_WEB_URL=http://127.0.0.1:<port> npx tsx
  audit.ts`.

## Work tracking

There's no `plans/` directory any more (retired October 2026; its documents
are in git history). Work lives on the **Nylon** GitHub Project, a kanban
whose `Status` field is the source of truth:

| Status | What's there |
| --- | --- |
| Ideas | Draft items: a line or a paragraph. Anyone, agents included, may add one |
| Specced | Converted to an issue with a spec in the body: problem, approach, acceptance criteria |
| Ready | Cleared to build. An agent may pick it up |
| In progress | Someone (or an agent) has a branch for it |
| In review | A PR is open |
| Done | Merged, or closed with a reason |

- Every issue gets a `kind:*` label: `feature`, `fix`, `refactor`, `a11y`,
  `test` or `chore`.
- **Only the owner moves a `kind:feature` item into Ready.** Agents may move
  the other kinds there themselves once the spec is written.
- At most **3 agent PRs** are open at once. Finish or close one before
  starting another.
- `needs-decision` on an issue or PR means it's waiting on the owner. Leave a
  comment that says exactly what the decision is.
- What a plan's "done" document used to record goes in the PR description.
  Anything that should stay true goes into PRINCIPLES.md, this file or a skill.

## Merging

Agents may merge their own PRs in this repo. This is a deliberate exception
to the owner's global "never merge" rule. Squash-merge, and only when **all**
of these hold:

- every required check is green and `control-room-review` is all-green;
- the PR isn't a draft and has no `needs-decision` label;
- no unresolved review threads from the owner;
- it touches none of the guarded areas below.

Guarded areas wait for the owner to merge:

- **The Settled table** in PRINCIPLES.md. Agents may edit the rest of
  PRINCIPLES.md carefully, and must say in the PR what changed and why.
- **Migrations:** anything under `src/api/migrations/`.
- **Releases:** `.github/workflows/ios-release.yml`, `ios-deploy.yml`,
  Fastlane config, and version or build-number bumps.
- **This section** and "Work tracking" above.

## Continuous improvement routines

Three Claude cloud routines are meant to run against this repo outside of any
local session — they're configured via claude.ai, not checked into
`.github/workflows/`, so this section is the source of truth for what they do
and why. They open and update PRs, and merge them only under "Merging"
above.

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

## Feedback issues

Issues labelled `feedback` + `platform:*` are filed by the apps' admin-only
**Send feedback** (`POST /feedback`), with the owner's token. Their
screenshots are committed to the orphan **`feedback-assets`** branch — never
merge it, rebase it onto `main`, or delete it, or every old issue loses its
images. `feedback.yml` has Claude open a draft fix PR (or ask questions) when
the repo owner applies `auto-fix` — the API does that for admins' reports —
because the issue body is the prompt. Spec: [2026-10-21-feedback-inbox](https://github.com/superhighfives/nylon-impossible/blob/02f8c45b3ba52896a25bde813cfd2b0a05ef9fb1/plans/done/2026-10-21-feedback-inbox.md).

It then works in rounds, like pastor but in CI:

- **answer:** while there's no fix PR yet, the owner's reply on the issue
  (with or without `@claude`) reruns the fix with that reply. Claude only sees comments
  by the owner and itself; the workflow filters them before the run, since
  anyone can comment on a public issue.
- **review:** a `control-room-review` review that isn't all-green on a
  `feedback/*` PR starts a round on that branch. Claude's push gets a fresh
  review, so it loops. `fix-round:N` counts the rounds, and after 3 the
  workflow adds `needs-decision` and stops.

`needs-decision` on the issue or the PR stops every round. Claude adds it
when a finding is the owner's call; removing it re-arms the next round.

**Pastor on `feedback/*` PRs:** `feedback.yml` owns `control-room-review`
findings there, so don't fix them; it would duplicate the round's commits.
Watch CI, handle the owner's own comments and decisions, and send the
ready-to-merge notice.

On Apple platforms the fix PR also gets a **Before | After** table: Claude
writes `.fix-shots/plan.json` (which `-NylonScreen` routes show the change,
or why a still can't), and `src/marketing/fix-shots.ts` captures them on
`main` and the branch after Claude finishes. The images go to
`feedback-assets` under `fixes/<issue>/<sha>/`; the table sits between
`<!-- fix-shots:start/end -->` markers in the PR body. It's best-effort, like the
marketing captures — never make it fail the run. The simulator helpers it
shares with `generate.ts` live in `src/marketing/simulator.ts`.
Follow-up commits (via `@claude` or a review round) that touch `src/ios`
retake the shots from the plan saved in the PR body.
