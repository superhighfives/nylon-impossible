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

## Xcode builds

A build with its own `-derivedDataPath` (one per PR, or per iOS/Mac pair, so parallel builds don't fight
over Xcode's lock) leaves 3-4GB behind, and nothing clears `/tmp`. A week of those filled the owner's disk
(55GB, 2026-11). Put the folder in your session's scratchpad, and delete it once the build or test run is
done, pass or fail. Without a reason to keep builds apart, use Xcode's default DerivedData instead.

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

## Reviewing UI changes

For reviewers, `control-room-review` included. When the diff touches
`src/web/src`, `src/ios`, `src/gmail-addon`, `src/shared/design` or
`src/shared/copy`, read PRINCIPLES.md (and its `## States` section, the state
matrix, once it exists) and check the changed lines against it. Flag:

- a done todo that moves to another section, column or page instead of
  leaving (principle 3, Settled "Completing a todo"). Two written
  exceptions: Gmail's card, where a ticked todo stays, crossed out, until it
  refreshes; and the wide layout's fourth column, which shows Done by default
  (Settled "Wide layout");
- visible controls on rows: handles, toolbars, chevrons, per-row buttons
  (principle 4);
- layout that jumps: space for a banner or the fourth column that's added and
  removed rather than kept (principle 8);
- colours, type, spacing, radii or motion hard-coded instead of coming from
  `src/shared/design/tokens.json` (Visual);
- a word from the Vocabulary table's "Not" column in UI copy ("task",
  "Completed", "Sometime"…), or a label, title or menu item that isn't in
  sentence case (Vocabulary, Copy, Settled "Case"). "Subtasks" is the
  Vocabulary's own word, not a "task";
- a change to how any Settled row behaves;
- an interaction state that doesn't match the state matrix.

Cite the principle number, Settled row or section by name in each finding, so
it can be argued. Only flag what a line of PRINCIPLES.md supports; a taste
call that no line covers isn't a principles finding.

Severity: a principles finding is ⚠️, so the review is at best 🟡. That stops
the foreman, which merges only on 🟢, without blocking the owner's own PRs. A
change to a Settled row's behaviour is ⛔ (principle 9): it needs the owner and
a written reason.

## Work tracking

There's no `plans/` directory any more (retired October 2026; its documents
are in git history). Work lives on the
[**Nylon** GitHub Project](https://github.com/users/superhighfives/projects/1)
(`gh project … 1 --owner superhighfives`), a kanban whose `Status` field is
the source of truth:

| Status | What's there |
| --- | --- |
| Ideas | Draft items: a line or a paragraph. Anyone, agents included, may add one |
| Specced | An issue whose body is a spec (`prd` skill), being argued until its Open questions are "None." |
| Ready | Argued out and cleared to build by the owner. An agent may pick it up |
| In progress | Someone (or an agent) has a branch for it |
| In review | A PR is open |
| Done | Merged, or closed with a reason |

- Every issue gets a `kind:*` label: `feature`, `fix`, `refactor`, `a11y`,
  `test` or `chore`.
- **Specs are argued, not just written.** Claude drafts every spec into the
  issue body with the `prd` skill's template and posts its questions; the
  owner argues until **Open questions** reads "None.". Answers go into
  **Decisions**, dated. The owner may edit the body directly, and the edited
  body is the truth. The foreman drafts and revises issues labelled `spec`
  on its own; in a local session, write the result back to the issue.
- **Only the owner moves an item into Ready,** for every kind, for now. The
  foreman refuses to build one with a missing section or open questions: it
  comments, adds `needs-spec` and moves it back to Specced.
- **The owner tries agent PRs before they merge.** Each PR's body has a
  **Try it** section (preview URL, steps, Apple before/after shots, and each
  acceptance criterion with its proof). On the foreman's PRs, the owner adds
  `verified` after trying it; a later push clears it.
- At most **3 agent PRs** are open at once. Finish or close one before
  starting another.
- **Feedback reports reach the board through the foreman.** A `feedback`
  issue the owner has cleared with `auto-fix` is triaged on the foreman's
  next run, ahead of Ready items: a clear report is built straight away, with
  a light spec in a comment; an unclear one becomes a spec in Specced, argued
  like any other. `feedback-flow` skill.
- `needs-decision` on an issue or PR means it's waiting on the owner. Leave a
  comment that says exactly what the decision is.
- **The agents have their own GitHub account,** `nylon-foreman`. The
  foreman, its review rounds and its merges act as it; local sessions act as
  the owner. Its comments count alongside the owner's, `control-room-review`
  and `claude[bot]`; nobody else's do.
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
- on the foreman's `foreman/*` PRs, the owner added `verified` after the
  head commit was pushed (for now, every kind; it will be dropped kind by
  kind, each with a written reason). The dependency bundle's
  `foreman/deps-*` PRs don't wait for it: green CI and a 🟢 review on the
  head commit are the proof for a dependency bump. A bump under `.github/`
  is still guarded, so the owner merges it;
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
- `feedback-flow`: feedback issues, how the foreman triages them, fix-shots.
  Fix-shots are best-effort, like the marketing captures: never make them fail
  the run. Never merge, rebase, force-push or delete the orphan
  **`feedback-assets`** branch; every old feedback issue's images live there.
- `routines`: what the foreman runs on a schedule (Sentry sweep, dependabot
  bundle, pastor shepherd, scout, daily digest), and how to turn each off.
- `prd`: the spec template, what makes a question open, and how Decisions
  are recorded. Load it before drafting or revising any spec.

**Pastor on `foreman/*` PRs:** the foreman owns `control-room-review`
findings there, so don't fix or defer them (a
deferred 🟡 never reaches the 🟢 the foreman merges on). Watch CI, handle the
owner's own comments and decisions, and send the ready-to-merge notice.
