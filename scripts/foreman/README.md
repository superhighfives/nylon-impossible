# Foreman

The foreman turns the **Nylon** project board, and the owner's feedback
reports, into pull requests without a local session, and runs the routines
(below). It runs on the owner's always-on Mac mini (later a MacStadium
Mac) as a launchd job, every 10 minutes.

It acts on GitHub as its own machine account, `nylon-foreman` (below), so
the PR history shows who did what.

Each tick:

1. **Merge.** For each open `foreman/*` PR by `nylon-foreman`, run the merge
   gate. Merge if it passes. If the only thing stopping it is a guarded
   area, label it `owner-merge`, comment once, and send an alert. If its
   review is 🟡 or 🔴, run a review round (below). If it's waiting for
   `verified`, see "Verified" below.
2. **Tidy.** Remove worktrees whose PR has merged or closed.
3. **Spec.** Draft or revise at most one spec (below).
4. **Routines.** Run the routines that are due: the shell ones, and at most
   one model-driven one (below).
5. **Feedback.** If fewer than 3 agent PRs (`foreman/*` and `feedback/*`) are open, triage
   the oldest new feedback report the owner has cleared (below), and stop
   there: a report goes ahead of Ready items.
6. **Build.** Otherwise, if fewer than 3 agent PRs are open, take the first
   **Ready** issue in board order whose spec passes the check (below), and
   build it.
   - It runs headless `claude` in a fresh worktree, with the issue body and
     the trusted comments as the prompt.
   - The result is a PR, with a **Try it** section, which then goes to In
     review and gets pastor watching it, and its before/after shots if it
     changes the Apple app (below).
   - Or the result is a question: the issue gets `needs-decision` and goes
     back to Specced.

## Specs

The template and the rules for arguing it are in the `prd` skill
(`.claude/skills/prd/SKILL.md`).

**The check.** Before building, the foreman reads the issue body. Every spec
needs `## Problem`, `## Acceptance criteria`, `## How to verify`,
`## Open questions` and `## Decisions`; a `kind:feature` also needs
`## Outcome`, `## Behaviour`, `## Non-goals` and `## Principles`. **Open
questions** must read exactly `None.`. If not, the issue gets `needs-spec`, a
comment listing what's wrong, and goes back to Specced, and the foreman
tries the next Ready issue. A spec that passes loses `needs-spec`.

**Drafting and revising.** The owner's open issues labelled `spec`, in Ideas
or Specced, get a spec run:
- a **draft** the first time the foreman sees one;
- a **revision** each time the owner comments after that. Only the owner's
  comments start one; the prompt includes the owner's, `nylon-foreman`'s and
  `claude[bot]`'s.

Claude writes the spec into the issue body, posts its questions as a
comment, and doesn't touch code. The issue moves to Specced, and you get an
alert: either it has questions for you, or it has none left and is ready for
you to move to Ready. One run per tick, and one per reply, even if it fails:
the id of the reply it answered is kept in `~/.foreman/specs/<issue>`.

## Feedback

Reports from the apps' **Send feedback** are issues labelled `feedback` and
`platform:*`, filed with the owner's token. `auto-fix` is the go-ahead: the
API adds it to admins' reports, and the owner adds it to anyone else's.

**Intake.** A report is triaged when it's open, the owner's, labelled
`feedback` and `auto-fix`, and:
- the owner added `auto-fix` (the label's latest event is theirs; anyone
  else's is ignored, and logged);
- it isn't in hand already: not on the board past Ideas, no `spec` or
  `needs-decision`, no open PR for it, and not triaged before
  (`~/.foreman/feedback/<issue>`).

Oldest first, one per tick, ahead of Ready items: a report is the owner
saying "this is wrong now". `foreman triage <n>` does one now, with the same
checks.

**Triage.** Claude runs in a fresh worktree on `foreman/<n>-<slug>`, with the
report's screenshots fetched into `.feedback-assets/` and the trusted
comments in the prompt. It decides:
- **Clear** (one observable problem, its fix evident, a contained change):
  it posts a **Light spec** comment (problem, acceptance criteria, how to
  verify) and builds the fix as it would any Ready item. The PR is ready for
  review and `Closes #n`; the issue goes In progress, then In review.
- **Unclear, or bigger than a fix:** it writes a spec into the issue body and
  posts its questions. The foreman adds `spec` and `needs-decision` and moves
  it to Specced. From there it's the spec argument below: the owner's replies
  start revisions even though it has `needs-decision`, which comes off when
  **Open questions** reads "None.", so moving it to Ready builds it.
- **Neither** (a failed run): `needs-decision`, a comment with the log's
  path, and back to Ideas. Removing `needs-decision` triages it again.

Feedback PRs are ordinary `foreman/*` PRs: the same rounds, gate and
`verified`.

## Before/after shots

A build or triage that changes the Apple app leaves `.fix-shots/plan.json`
(the `feedback-flow` skill): the `-NylonScreen` routes that show the change.
After the run, the foreman captures them here with
`src/marketing/fix-shots.ts`, warm simulators and all:

- in a detached checkout of `main`: `capture --as after` with the branch's
  `src/ios`, then `--as before` with main's, each side at most 45 minutes;
- the images go to `feedback-assets` under `fixes/<issue>/<sha>/`, in one
  commit built from tree objects (the clone never downloads the branch) and
  pushed on top, never forced;
- `report`'s table goes into the PR's **Try it** section between
  `<!-- fix-shots:start/end -->` markers, replacing any earlier one.

It's best-effort. A shot that fails reads "not captured", and the PR says how
many failed and where the log is (`~/.foreman/logs/shots-<pr>-*.log`). Nothing
here can fail the build. A review round that changes `src/ios` retakes them
from the plan saved in the PR body, and so does `foreman shots <pr>`.

## Verified

The gate waits for the owner's `verified` on every foreman PR, for now,
except the dependency bundle's `foreman/deps-*` PRs: green CI and a 🟢
review on the head commit are the proof for a dependency bump (CLAUDE.md,
"Merging"). A bundle that bumps something under `.github/` is guarded, so the
owner merges it either way.

- **It counts only if you added it,** going by the label event's actor, and
  only if you added it after the head commit was pushed (the repo's activity
  log says when). If the label's latest event is anyone else's, it waits.
- **A push after `verified` clears it.** The foreman removes the stale label
  and comments, so what you tried is what merges. The reminder clock
  restarts from that push.
- **Reminders.** When a PR first waits only for `verified`, the clock starts
  (`~/.foreman/verify/<pr>`, and an `awaiting_verified` event). After a day
  you get one alert and one comment. `foreman status` lists every PR still
  waiting, and so does the daily digest.
- **Relaxing it** means dropping it for one kind at a time, with a written
  reason in CLAUDE.md, and a change to the gate here.

## Stalls

Most of the gate's `wait:` reasons have no action in the merge pass, so a PR
can sit on one indefinitely (#563 waited 8 hours on a review that had already
arrived). The foreman times each wait, per PR, in `~/.foreman/waits/<pr>`: when
it started, the head commit, and the reason.

- **The clock restarts** when the reason changes or a new commit is pushed.
  A count or a `(STATE)` changing within the reason (`2 unresolved
  thread(s)` to `1`, `not mergeable (UNKNOWN)` to `(CONFLICTING)`) doesn't
  count as a change, and nor does a failed read (`couldn't …`, `fetch
  failed`) while a clock is running: it keeps timing the reason it had.
- **After 2 hours on the same reason,** you get one alert naming the PR and
  the reason, and a `stalled` event goes to `events.jsonl`. It doesn't repeat
  for that wait. `checks pending` gets **12 hours**, so a slow run never trips
  it, but a required check that never starts does.
- **What's timed:** every other `wait:` reason, including a 🟡 review whose
  round has already answered, the owner's unresolved threads, and a merge the
  gate passed but GitHub refused (`merge refused`).
- **What isn't:** `needs-decision`, `guarded:` (`owner-merge`), `not
  verified` (it has its own reminder) and drafts. These, and a merge, stop the
  clock, and so does the PR closing.
- `foreman status` lists each open PR past its threshold as `stalled:`, and
  the daily digest lists them under Problems. `tick --dry-run` writes no
  clock and logs `would alert` instead.

## Review rounds

`control-room-review` reviews every push. The foreman merges only on 🟢, so
it owns the rounds on its own PRs. Pastor leaves those findings alone
(CLAUDE.md says so).

A round starts when a `foreman/*` PR's checks are green and its latest review
is 🟡 or 🔴 on the head commit:

- Claude runs in a detached checkout of the branch, with the review and its
  unresolved threads as the prompt.
- It fixes what's right and replies where it disagrees, then pushes. The
  push brings a fresh review, and the next round starts from that. If the
  push changed `src/ios`, the before/after shots are retaken.
- The PR gets a `fix-round:N` label for each round.
- Each review gets one round at most. The last answered id is kept in
  `~/.foreman/rounds/<pr>`, as `handed:<id>` once it's waiting on you.

**It hands the PR to you** with `needs-decision`, a comment and an alert when:
- a finding is your call;
- a round pushes nothing, since without a new commit there's no new review,
  so it could never reach 🟢 on its own;
- 3 rounds pass without reaching 🟢.

**Removing `needs-decision` re-arms it.** The next run clears the
`fix-round:*` labels and starts again from round 1 on the latest review.

**What the round sees:** the review, plus only those thread replies written
by the review bot, `claude[bot]` or you. Anyone can reply on a public repo's
threads. Bots are matched by account type as well as name, because GraphQL
drops the `[bot]` suffix. The prompt wraps all of it in a block marked as
data, and tells Claude not to read the PR's other comments.

**A failed fetch doesn't use up a round.** Nothing is recorded until the
checkout exists, so the next run tries again.

## Routines

Scheduled work, run by the tick between the spec pass and building. What
each one is for is in the `routines` skill (`.claude/skills/routines/SKILL.md`).

| Routine | When (the Mini's local time) | Runs |
| --- | --- | --- |
| `shepherd` | every tick | shell |
| `sentry` | nightly, from 03:00 | Claude, read-only, with the Sentry MCP |
| `deps` | Mondays, from 09:00 | Claude, `dependabot-bundle` skill |
| `scout` | Thursdays, from 03:00 | Claude, read-only |
| `digest` | daily, from 08:00 | shell |

**Schedules.** A routine is due when its latest scheduled time is after its
last run, kept in `~/.foreman/routines/<name>`. So it runs on the first tick
after its time, and once per window however many ticks follow. A live run
counts even if it fails: it alerts, logs a `routine` event with
`outcome: failed`, and waits for the next window. A tick that's late, or a
Mac that was asleep, runs it on the next tick.

**One model-driven routine a tick.** `sentry`, `deps` and `scout` run headless
`claude` in a fresh detached worktree of `origin/main`, within
`FOREMAN_ROUTINE_TIMEOUT` (an hour). If more than one is due, the first in the
table runs and the others wait for later ticks, so a tick can't hold up the
merge pass for hours. `shepherd` and `digest` don't use the slot.

**The PR limit.** `deps` opens a PR, so it counts toward the 3 agent PRs.
While 3 are open it stays due and runs on a later tick.

**What the model may do.** `sentry` and `scout` run Claude `--restricted`
in `dontAsk` mode with an allow-list (`read_only_args`): reading and
searching their checkout, Sentry's read tools for `sentry`, and writing one
file. Anything else is refused, including the shell, the web, other MCP
servers and the token file, so they can't push, comment or touch the board
however a Sentry error is worded. Their prompts treat GitHub and Sentry text
as data. Each writes its proposals to
`~/.foreman/routines/out/<name>/result.json`. The shell then acts on them:
- **sentry:** each proposal must name a well-formed short ID and be a
  complete `kind:fix` spec apart from its open questions. It's skipped if
  its short ID is in an open issue or one closed in the last 30 days. At
  most 5 are filed, labelled `kind:fix` and `spec`, with the questions as the
  first comment, `0` in `~/.foreman/specs/<n>` (so the spec pass waits for
  the owner's reply), and set to Specced. Skips and won't-fix reasons go in
  the event's `note`.
- **scout:** at most 5 draft items, set to Ideas, skipping any whose title
  (ignoring case and spacing) is already on the board or an open issue.

`deps` pushes `foreman/deps-<YYYY-MM-DD>` and opens its PR itself. It isn't
started when there are no open dependabot PRs or a bundle is still open.
Once a bundle has merged, every tick checks the open dependabot PRs. It
closes one only if a merged `foreman/deps-*` PR by `nylon-foreman` names it
and every change it makes outside `bun.lock` is already on main. That's
checked by reverse-applying its diff to main in a scratch index.

**The shepherd** installs pastor on each open agent PR without a job (a
`com.pastor.superhighfives-nylon-impossible-<pr>` plist). It uses the
build's worktree if one has the branch, or makes
`~/.foreman/worktrees/shepherd-<pr>`. It remembers the jobs it started in
`~/.foreman/shepherd/`, and stops them (`pastor stop --purge`) and removes
their worktrees once the PR closes. If GitHub can't say what's open, it
leaves every job alone. It logs an event only when it installs or stops
something.

**The digest** is `jq` over the last 24 hours of `events.jsonl`, plus `gh`
queries for merged PRs, `needs-decision`, `owner-merge`, Specced specs whose
open questions aren't "None.", `~/.foreman/verify/`, and `~/.foreman/waits/`
for open stalls. It comments on the
open "Foreman digest" issue by `nylon-foreman`, opening and pinning it the
first time, then sends a Discord alert linking the comment. When all four
sections are empty, it posts and alerts nothing.

**Running one now:** `foreman.sh routine <name>` ignores the schedule and the
off switch, but not the PR limit. `--dry-run` changes nothing on GitHub. For
`sentry` and `scout` it still runs Claude, which is read-only anyway, and
prints what would be filed. For `deps` it lists what would be bundled. For
`shepherd` and `digest` it prints the installs and the comment.
`foreman.sh status` lists each routine's last run, next run, and whether it's
off.

**Turning one off:**
- from anywhere: the repo variable `FOREMAN_ROUTINES_OFF`, a comma-separated
  list of names (`sentry,scout`);
- on the Mac: `foreman.sh routine <name> off`, and `on` to undo it (a
  `~/.foreman/routines/<name>.off` marker);
- `FOREMAN_PAUSED`, or `foreman.sh pause`, stops everything, routines
  included.

An off routine stays due, and runs on the first tick after it's back on.

## The merge gate

`foreman gate <pr>` prints the verdict. The gate is a shell function, not a
model, so an agent never decides whether its own work merges. **It fails
closed:** if any step can't be completed (GitHub doesn't answer, the fetch or
the diff fails), the answer is "wait". A PR merges only when all of these
hold:

- it's open, not a draft, mergeable, and has no `needs-decision` label;
- every check is complete and green (success, skipped or neutral), and there's
  at least one;
- the latest `control-room-review` review is for the head commit and is 🟢.
  🟡 "approved with comments" doesn't count;
- there are no unresolved review threads started by the owner;
- the owner added `verified` after the head commit was pushed (checked last,
  so a guarded PR still gets `owner-merge` first). Not on `foreman/deps-*`;
- it touches no **guarded area**. The check diffs with `--no-renames`, so
  moving a file out of a guarded path counts as touching it. The areas:
  - `src/api/migrations/`;
  - anything under `.github/` (workflows, including the ones that review and
    deploy) and any `wrangler.jsonc`;
  - Fastlane config;
  - `MARKETING_VERSION` or `CURRENT_PROJECT_VERSION`;
  - PRINCIPLES.md's Settled table;
  - anything that steers agents: `.claude/`, and every `CLAUDE.md` and
    `AGENTS.md`;
  - `scripts/foreman/` itself.

The merge is pinned to the commit the gate checked (`--match-head-commit`), so
a fixup pastor pushes in between can't slip through unreviewed. A refused
merge is logged and retried on the next tick.

A PR that's green apart from a guarded area gets the `owner-merge` label, a
comment and an alert, and waits for you. The comment points to CLAUDE.md's
"Merging" section, which arrives with #549.

`scripts/foreman/test.sh` (`bun run foreman:test`) runs the gate against a
throwaway repo with `gh` stubbed: renames, deletes, every guarded path, each
way the gate has to wait, `verified` and its reminders, stalls, the spec check,
feedback intake (whose `auto-fix` counts) and triage's outcomes, the shots'
place in the PR body and their push to `feedback-assets`, the token's
expiry, and the routines: schedules either side of each time, the off
switches and pause, the PR limit, the Sentry and scout filing rules, the
shepherd, closing superseded dependabot PRs, and the digest's sections from
a fixture `events.jsonl`. CI runs it whenever `scripts/foreman/` changes.

## What it trusts

The repo is public, so:

- The foreman **polls**. It isn't a self-hosted runner, so nothing on GitHub
  can push work to the machine.
- It only builds issues **opened by the owner or `nylon-foreman`** that the
  owner moved to Ready. `foreman build <n>` applies the same rule, and the
  spec check. `nylon-foreman`'s issues are the Sentry sweep's, which can carry
  attacker-influenced text from error reports. The owner reads each spec
  before moving it to Ready, and that move is the gate.
- It only triages feedback reports **opened as the owner** that the owner
  cleared with `auto-fix`, going by the label event's actor.
- The prompts include only comments by the owner, `nylon-foreman` and
  `claude[bot]`, matched by exact login (and, in review threads, by account
  type), because anyone can register a login that starts with "claude".
- Only the owner's `verified` counts, so the machine account can't verify its
  own work.

## Running it

```sh
scripts/foreman/foreman.sh install           # copies itself to ~/.foreman/bin, loads the job
~/.foreman/bin/foreman.sh status
~/.foreman/bin/foreman.sh tick --dry-run     # what the next tick would do
~/.foreman/bin/foreman.sh build 548          # build one issue now
~/.foreman/bin/foreman.sh triage 568         # triage one feedback report now
~/.foreman/bin/foreman.sh shots 572          # retake a PR's before/after shots
~/.foreman/bin/foreman.sh routine digest --dry-run  # what a routine would do (below)
~/.foreman/bin/foreman.sh logs -f
```

To stop it:

- From the Mac: `foreman.sh pause` and `foreman.sh resume`.
- From anywhere: set the repo variable `FOREMAN_PAUSED` to `1` (Settings →
  Secrets and variables → Actions → Variables). Delete it, or set it to
  anything else, to resume.

## The machine account

The foreman acts as `nylon-foreman`, a GitHub user with Write access to the
repo and to the Nylon project. Its classic token (scopes `repo`, `workflow`,
`project`) lives in **`~/.foreman/github-token`**, `chmod 600`.

- Every `gh` call, and every `claude` run it starts, gets that token as
  `GH_TOKEN`, so builds, rounds, spec runs, comments, labels and merges are
  `nylon-foreman`'s.
- Its clone pushes over HTTPS with that token as the credential (a
  repo-local credential helper), and commits as `nylon-foreman`, unsigned.
  That covers pushes from pastor's jobs in its worktrees too. Pastor's
  comments still come from the owner's `gh` login.
- It checks the token at the start of every command. **Seven days before it
  expires** you get an alert (once per token) and a ⚠️ line in
  `foreman status`. **Once it has expired** (or is missing, or belongs to
  someone else), the foreman does nothing, says why in its log and in
  `status`, and alerts once.
- **To renew it:** make a new classic token on `nylon-foreman` with the same
  scopes, and write it to `~/.foreman/github-token`. The next tick uses it.

**Setup and state:**
- Claude's credentials come from pastor's shim (`~/.config/pastor/exec.sh`),
  so run `pastor setup` and `pastor token` first, and put the machine
  account's token in place (above).
- Alerts use pastor's Discord webhook, if one is set.
- Everything else lives in `~/.foreman`: a clone tracking `main`, the
  worktrees, logs, `rounds/`, `specs/`, `verify/`, `waits/`, `feedback/`, `shots/`,
  `routines/`, `shepherd/`, and `events.jsonl`, one line per merge, PR,
  question, spec run, triage, set of shots, routine run or failure. The
  daily digest reads `events.jsonl`.
- **It runs under macOS's `/bin/bash` 3.2**, so no associative arrays or
  other bash 4 features.

**Updating:** after each tick, the job copies `scripts/foreman/foreman.sh`
from `origin/main` to `~/.foreman/bin`, so a merged change takes effect on the
next tick. The foreman can't merge changes to itself, because that's a
guarded area.

**Moving to MacStadium:** install on the new machine, then `uninstall` on the
Mini. Nothing in the script is specific to the Mini.
