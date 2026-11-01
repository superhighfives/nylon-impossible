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

API handlers take `Context<Env>`, not `Context<{ Bindings: Env }>`. `Env` in
`src/api/src/types.ts` already contains **both** `Bindings` and `Variables`;
wrapping it in another `Bindings` key hides `Variables`, so `c.get("userId")`
stops type-checking. Fix the annotation instead of reaching for `as string`.

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

Deploy migrates the shared D1 database before the workers roll out, so never
tighten a constraint in one step: add it nullable, deploy the code that fills
it, then make it strict in a later migration. Details: `d1-migrations` skill.

## Work tracking

There's no `plans/` directory any more (retired October 2026; its documents
are in git history). Work lives on the
[**Nylon** GitHub Project](https://github.com/users/superhighfives/projects/1)
(`gh project … 1 --owner superhighfives`), a kanban whose `Status` field is
the source of truth:

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

- every check is green, and the latest `control-room-review` review is 🟢
  on the head commit (🟡 "approved with comments" doesn't count);
- the PR isn't a draft and has no `needs-decision` label;
- no unresolved review threads from the owner;
- it touches none of the guarded areas below.

Guarded areas wait for the owner to merge. A rename counts as touching both
paths.

- **The Settled table** in PRINCIPLES.md. Agents may edit the rest of
  PRINCIPLES.md carefully, and must say in the PR what changed and why.
- **Migrations:** anything under `src/api/migrations/`.
- **CI, deploys and releases:** anything under `.github/` (including the
  workflows that review and deploy), any `wrangler.jsonc`, Fastlane config,
  and version or build-number bumps.
- **Agent instructions:** `.claude/`, and every `CLAUDE.md` and `AGENTS.md`,
  this file included.
- **The foreman:** `scripts/foreman/`, which enforces these rules (see its
  README).

## Situational skills

The rest lives in `.claude/skills/` and loads when the work comes up:

- `d1-migrations`: expand/contract, and the outage that made it a rule.
- `marketing-screenshots`: the capture pipeline, its best-effort rules,
  `--parity` and `audit.ts`.
- `feedback-flow`: feedback issues, `feedback.yml` rounds, fix-shots. Fix-shots
  are best-effort, like the marketing captures: never make them fail the run.
  Never merge, rebase or delete the orphan **`feedback-assets`** branch; every
  old feedback issue's images live there.
- `cloud-routines`: the Sentry sweep, dependabot bundle and PR shepherd.

**Pastor on `feedback/*` and `foreman/*` PRs:** `feedback.yml` and the foreman
own `control-room-review` findings there, so don't fix or defer them (a
deferred 🟡 never reaches the 🟢 the foreman merges on). Watch CI, handle the
owner's own comments and decisions, and send the ready-to-merge notice.
