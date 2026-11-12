# Foreman

The foreman turns the **Nylon** project board, and the owner's feedback
reports, into pull requests without a local session, and runs the routines
(below). It runs on the owner's always-on Mac mini (later a MacStadium
Mac) as a launchd job, every 10 minutes.

It acts on GitHub as its own machine account, `nylon-foreman` (below), so
the PR history shows who did what.

## Who's who

| Name | What it is |
| --- | --- |
| **foreman** | This script. Builds from the board, opens PRs, runs review rounds, merges. |
| **operator** | Watches one PR: answers comments, fixes CI, rebases, says when it's ready. A CLI from the owner's dotfiles and a skill from their skills repo. Its comments start with 🎛️. It was called **pastor**, and its old comments start with 🐑. |
| **dispatch** | The foreman routine that starts an operator on every agent PR and stops it when the PR closes. It was called **shepherd**. |
| **control-room** | The owner's baseline rules, and `control-room-review`, the reviewer whose 🟢 the foreman merges on. |
| **`nylon-foreman`** | The GitHub account all of the foreman's work acts as, including the operator's comments and pushes on agent PRs. Local sessions act as the owner. |

Each tick:

1. **Merge.** For each open `foreman/*` PR by `nylon-foreman`, run the merge
   gate. Merge if it passes. If the only thing stopping it is a guarded
   area, label it `owner-merge`, comment once, and send an alert. If its
   review is 🟡 or 🔴, run a review round (below). A merge alerts with a
   link to the PR's **Try it** section, for the owner to try it once it's
   live.
2. **Tidy.** Remove worktrees whose PR has merged or closed.
3. **Spec.** Turn every draft in **Define** into an issue labelled `spec`,
   label `spec` on the owner's open issues there without it, then draft or
   revise at most one spec (below).
4. **Routines.** Run the routines that are due: the shell ones, and at most
   one model-driven one (below).
5. **Feedback.** If fewer than 5 agent PRs (`foreman/*` and `feedback/*`) are open, triage
   the oldest new feedback report the owner has cleared (below), and stop
   there: a report goes ahead of Ready items.
6. **Build.** Otherwise, if fewer than 5 agent PRs are open, take the first
   **Ready** issue in board order whose spec passes the check (below), and
   build it.
   - It runs headless `claude` in a fresh worktree, with the issue body and
     the trusted comments as the prompt.
   - The result is a PR, with a **Try it** section, which then goes to In
     review and gets an operator watching it, and its before/after shots if it
     changes the Apple app (below).
   - Or the result is a question: the issue gets `needs-decision` and goes
     back to Define.

## Specs

The template and the rules for arguing it are in the `prd` skill
(`.claude/skills/prd/SKILL.md`). Specs are argued in the **Define** column.
The board may still show it as "Specced" until the owner renames it in the
board settings: each run reads which of the two the board has
(`spec_column`), and stops if it has neither.

**From a draft.** Drag a draft card from Ideas to Define to have it specced.
On its next tick the foreman converts it into an issue in this repo
(`convertProjectV2DraftIssueItemToIssue`), which keeps its board item and so
its column. The title stays; the draft's text is quoted under `## Problem`,
and it's labelled `spec`. It's `nylon-foreman`'s issue, so its draft run and
the owner's replies work as below. Every waiting draft converts on the same
tick, since that takes no model; their spec runs still go one per tick.
Drafts anywhere else, Ideas included, are left alone, and the foreman and the
scout never move one out of Ideas: agents add ideas, and the owner picks
which get specced.

An open issue of the owner's in Define without `spec` gets it the same way,
so its next pass is a draft run, which rewrites the body into the template
and keeps what was there under Problem.

**The check.** Before building, the foreman reads the issue body. Every spec
needs `## Problem`, `## Acceptance criteria`, `## How to verify`,
`## Open questions` and `## Decisions`; a `kind:feature` also needs
`## Outcome`, `## Behaviour`, `## Non-goals` and `## Principles`. **Open
questions** must read exactly `None.`. If not, the issue gets `needs-spec`, a
comment listing what's wrong, and goes back to Define, and the foreman
tries the next Ready issue. A spec that passes loses `needs-spec`.

**Drafting and revising.** Open issues labelled `spec`, by the owner or
`nylon-foreman`, in Ideas or Define, get a spec run:
- a **draft** the first time the foreman sees one. An issue with no `kind:*`
  label gets one here: the run picks exactly one of `feature`, `fix`,
  `refactor`, `a11y`, `test` or `chore`, writes the spec to that kind's
  sections and names it in `~/.foreman/specs/<issue>.kind.json`, and the
  foreman adds the label. The owner can change it;
- a **revision** each time the owner comments after that. Only the owner's
  comments start one; the prompt includes the owner's, `nylon-foreman`'s and
  `claude[bot]`'s.

Claude writes the spec into the issue body, posts its questions as a
comment, and doesn't touch code. It settles implementation calls itself
(naming, file layout, tests, internal shapes) and records them under
**Decisions** as `(foreman)`; it asks the owner only about what they'd
notice (the `prd` skill has the list). After the run you get an alert:
either it has questions for you, and stays in Define, or it has none left,
and the foreman moves it to **Ready** (a `spec_settled` event) so the build
pass takes it. One run per tick, and one per reply, even if it fails: the id
of the reply it answered is kept in `~/.foreman/specs/<issue>`.

A spec can also settle without a run, when the owner edits **Open
questions** to "None." in the body. Every tick, the foreman checks the spec
column for those and moves them to Ready the same way. It skips one with a
reply no run has answered yet, since that run comes first.

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
  it to Define. From there it's the spec argument below: the owner's replies
  start revisions even though it has `needs-decision`, which comes off when
  **Open questions** reads "None."; then it goes to Ready and is built. One
  whose triage spec has no questions at all goes straight to Ready.
- **Neither** (a failed run): `needs-decision`, a comment with the log's
  path, and back to Ideas. Removing `needs-decision` triages it again.

Feedback PRs are ordinary `foreman/*` PRs: the same rounds and gate.

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
here can fail the build. Any push that changes `src/ios` retakes them from
the plan saved in the PR body, whoever made it: a review round retakes them
straight after its push, and for other pushes (the operator's, the owner's)
the tick compares the head with the commit the shots show. That's once per
head commit and one PR a tick, and `~/.foreman/shots/<pr>.checked` holds the
head it last looked at. `foreman shots <pr>` retakes them by hand.

## After the merge

There's no `verified` any more (owner, 2026-11-10): the gate below is the
whole gate, for every kind, and the owner tries changes once they're live.
Each PR keeps its **Try it** section for that, and the merge alert links to
it. What's wrong is reverted or fixed forward (CLAUDE.md, "Rolling back").
A leftover `verified` label on an old PR changes nothing.

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
- **What isn't:** `needs-decision`, `guarded:` (`owner-merge`) and drafts.
  These, and a merge, stop the clock, and so does the PR closing.
- `foreman status` lists each open PR past its threshold as `stalled:`, and
  the daily digest lists them under Problems. `tick --dry-run` writes no
  clock and logs `would alert` instead.

## Review rounds

`control-room-review` reviews every push. The foreman merges only on 🟢, so
it owns the rounds on its own PRs. The operator leaves those findings alone
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
| `dispatch` | every tick | shell |
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
merge pass for hours. `dispatch` and `digest` don't use the slot.

**The PR limit.** `deps` opens a PR, so it counts toward the 5 agent PRs.
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
  the owner's reply), and set to Define. Skips and won't-fix reasons go in
  the event's `note`.
- **scout:** at most 5 draft items, set to Ideas, skipping any whose title
  (ignoring case and spacing) is already on the board or an open issue.

`deps` pushes `foreman/deps-<YYYY-MM-DD>` and opens its PR itself. It isn't
started when there are no open dependabot PRs or a bundle is still open.
Once a bundle has merged, every tick checks the open dependabot PRs. It
closes one only if a merged `foreman/deps-*` PR by `nylon-foreman` names it
and every change it makes outside `bun.lock` is already on main. That's
checked by reverse-applying its diff to main in a scratch index.

**Dispatch** starts an operator on each open agent PR without a job (a
`com.operator.superhighfives-nylon-impossible-<pr>` plist), with
`--gh-token-file ~/.foreman/github-token`, so the job's comments come from
`nylon-foreman`. A job from before that flag, with no
`OPERATOR_GH_TOKEN_FILE` in its plist, is reinstalled once in the checkout
it already uses. Dispatch uses the build's worktree if one has the branch, or
makes `~/.foreman/worktrees/dispatch-<pr>`. It remembers the jobs it started
in `~/.foreman/dispatch/`, and stops them (`operator stop --purge`) and
removes their worktrees once the PR closes. If GitHub can't say what's open,
it leaves every job alone. It logs an event only when it installs or stops
something. It was called `shepherd`: its old state directory is moved on the
first run, old `shepherd-<pr>` worktrees keep working, and `shepherd` still
works as its name in the off switches.

**The digest** is `jq` over the last 24 hours of `events.jsonl`, plus `gh`
queries for merged PRs, `needs-decision`, `owner-merge`, specs in Define whose
open questions aren't "None.", `~/.foreman/verify/`, and `~/.foreman/waits/`
for open stalls. It emails the result through Cloudflare Email Sending's
REST API, from `Nylon foreman <foreman@superhighfives.com>` to
`hi@charliegleason.com`, with the subject `Nylon digest: <Weekday> <d>
<Month>`. The email has a plain-text part (the markdown) and a plain HTML
part (a heading per section, a list of its lines, every `#n` linked to the
repo), built in `perl` with titles escaped before linking. It needs the token
in `~/.foreman/cloudflare-email-token` (below). The send counts only if
Cloudflare lists the recipient as delivered or queued. A missing token, an API
error or a bounce fails the routine with the reason, which alerts and shows
up under the next day's Problems. When all four sections are empty, it sends
nothing. `FOREMAN_DIGEST_FROM`, `FOREMAN_DIGEST_TO`, `FOREMAN_CF_ACCOUNT_ID`
and `FOREMAN_CF_TOKEN_FILE` override the sender, the recipient, the account
and the token file.

**Running one now:** `foreman.sh routine <name>` ignores the schedule and the
off switch, but not the PR limit. `--dry-run` changes nothing on GitHub. For
`sentry` and `scout` it still runs Claude, which is read-only anyway, and
prints what would be filed. For `deps` it lists what would be bundled. For
`dispatch` it prints the installs. For `digest` it prints the email's subject,
sender, recipient and both parts, and whether the token file exists, without
reading it.
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
- it touches no **guarded area**. The check diffs with `--no-renames`, so
  moving a file out of a guarded path counts as touching it. The areas:
  - anything under `.github/` (workflows, including the ones that review and
    deploy) and any `wrangler.jsonc`;
  - Fastlane config;
  - `MARKETING_VERSION` or `CURRENT_PROJECT_VERSION`;
  - PRINCIPLES.md's Settled table;
  - the rules agents work under: every `CLAUDE.md` and `AGENTS.md`;
  - `scripts/foreman/` itself.

  Migrations and `.claude/skills/` aren't guarded (2026-11-10); the rest of
  `.claude/` (settings, hooks, permissions, agents) is.

The merge is pinned to the commit the gate checked (`--match-head-commit`), so
a fixup the operator pushes in between can't slip through unreviewed. A refused
merge is logged and retried on the next tick.

A PR that's green apart from a guarded area gets the `owner-merge` label, a
comment and an alert, and waits for you. The comment points to CLAUDE.md's
"Merging" section, which arrives with #549.

`scripts/foreman/test.sh` (`bun run foreman:test`) runs the gate against a
throwaway repo with `gh` stubbed: renames, deletes, every guarded path, each
way the gate has to wait, stalls, the spec check, a settled spec's move to Ready,
feedback intake (whose `auto-fix` counts) and triage's outcomes, the shots'
place in the PR body and their push to `feedback-assets`, the token's
expiry, and the routines: schedules either side of each time, the off
switches and pause, the PR limit, the Sentry and scout filing rules, the
dispatch, retaking shots after a push, closing superseded dependabot PRs, and the digest's sections from
a fixture `events.jsonl`. CI runs it whenever `scripts/foreman/` changes.

## What it trusts

The repo is public, so:

- The foreman **polls**. It isn't a self-hosted runner, so nothing on GitHub
  can push work to the machine.
- It only builds issues **opened by the owner or `nylon-foreman`** that are
  in Ready. `foreman build <n>` applies the same rule, and the spec check.
  `nylon-foreman`'s issues are the Sentry sweep's, which can carry
  attacker-influenced text from error reports. One reaches Ready only when
  the owner moves it, or after a spec run settles it, and a spec run only
  starts from the owner's own reply: the owner engaging with the spec is the
  gate.
- It only triages feedback reports **opened as the owner** that the owner
  cleared with `auto-fix`, going by the label event's actor.
- The prompts include only comments by the owner, `nylon-foreman` and
  `claude[bot]`, matched by exact login (and, in review threads, by account
  type), because anyone can register a login that starts with "claude".
- The gate is code, not a model, so the machine account can't approve its
  own work: it needs green checks and `control-room-review`'s 🟢.

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
  That covers pushes from the operator's jobs in its worktrees too, and
  dispatch gives those jobs the token file, so their comments are
  `nylon-foreman`'s as well.
- It checks the token at the start of every command. **Seven days before it
  expires** you get an alert (once per token) and a ⚠️ line in
  `foreman status`. **Once it has expired** (or is missing, or belongs to
  someone else), the foreman does nothing, says why in its log and in
  `status`, and alerts once.
- **To renew it:** make a new classic token on `nylon-foreman` with the same
  scopes, and write it to `~/.foreman/github-token`. The next tick uses it.

**The digest's Cloudflare token** lives in
**`~/.foreman/cloudflare-email-token`**, `chmod 600`: an API token on the
Cloudflare account with Email Sending's send permission, made without an
expiry. Only the digest reads it, and it reaches `curl` as a header file, never
as an argument. There's no early warning: if it's revoked, that morning's
digest fails and alerts.
- **To renew it:** in the Cloudflare dashboard, make a new API token with
  Email Sending send permission for the account, write it to
  `~/.foreman/cloudflare-email-token` and `chmod 600` it. Run
  `foreman.sh routine digest` to send that day's digest.
- Sending to `hi@charliegleason.com` without Workers Paid needs it verified
  under Email Routing → Destination addresses.

**Setup and state:**
- Claude's credentials come from the operator's shim
  (`~/.config/operator/exec.sh`), so run `operator setup` and
  `operator token` first, and put the machine account's token in place
  (above).
- Alerts use the operator's Discord webhook, if one is set.
- Everything else lives in `~/.foreman`: a clone tracking `main`, the
  worktrees, logs, `rounds/`, `specs/`, `verify/`, `waits/`, `feedback/`, `shots/`,
  `routines/`, `dispatch/`, and `events.jsonl`, one line per merge, PR,
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
