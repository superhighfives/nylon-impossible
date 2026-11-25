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

0. **iOS statuses.** Give every open PR's head the `foreman/ios-ui-test`
   status that needs no build: "No iOS change", or "Not run" for someone
   else's PR that changes the app ("The iOS lane", below).
1. **Merge.** For each open `foreman/*` PR by `nylon-foreman`, run the merge
   gate. Merge if it passes. A merged PR whose body closes its issue
   (`Closes #n`) sets the issue to Done. One that says `Part of #n` puts it
   back in Ready with a comment, so the rest gets built (#689 closed with its
   second half unbuilt). If the only thing stopping it is a guarded
   area, label it `owner-merge`, comment once, and send an alert. If its
   review is 🟡 or 🔴, run a review round (below). A merge alerts with a
   link to the PR's **Try it** section, for the owner to try it once it's
   live.
2. **Tidy.** Remove worktrees whose PR has merged or closed.
   Then, if the iOS lane is free, start its next job in the background
   (below).
3. **Spec.** Turn every draft in **Define** into an issue labelled `spec`,
   label `spec` on the owner's open issues there without it, then draft or
   revise at most one spec (below).
4. **Routines.** Run the routines that are due: the shell ones, and at most
   one model-driven one (below).
5. **Waiting on you.** Put `waiting-on-owner` on exactly what's waiting on
   the owner, and take it off everything else (below). This runs before the
   PR limit, so it happens every tick.
6. **Feedback.** Builds and triages run as background jobs (below), up to 3
   at once. While there's room, start a triage of the oldest new feedback
   report the owner has cleared (below): a report goes ahead of Ready items.
7. **Build.** Fill any room left with the first **Ready** issues in board
   order whose spec passes the check (below), one build each.
   - It runs headless `claude` in a fresh worktree, with the issue body and
     the trusted comments as the prompt.
   - The result is a PR, with a **Try it** section, which then goes to In
     review and gets an operator watching it, and its before/after shots if it
     changes the Apple app (below).
   - Or the result is a question: the issue gets `needs-decision` and goes
     back to Define.

## Background jobs

A build or a triage runs for up to two hours, and a tick that waited for it
did nothing else: no merges, review rounds or specs, and no second build
(#802). So the tick starts each one as `foreman job build|triage <n>` in the
background and returns.

- **Room.** At most 3 jobs run at once (`FOREMAN_MAX_JOBS`), and a running
  job counts toward the limit of 5 agent PRs, since it will open one.
- **Locks.** A job holds `~/.foreman/jobs/<n>/`, with its pid, and removes it
  when it ends. A tick clears the lock of a job whose process has gone, skips
  an issue whose job is still running, and leaves that job's worktree alone.
- **Process group.** Each job runs in its own process group. When a tick
  exits, launchd kills what's left in the tick's group, and the job has to
  outlive it.
- **Shared clone.** Jobs make their worktrees from the one clone. A build
  whose worktree can't be made (a fetch that lost a race for a ref lock) goes
  back to Ready for the next tick.
- Two builds that change the same files open conflicting PRs. The second
  one's operator rebases it.

## Headless runs

`claude -p` exits when the model ends its turn, and anything it left in the
background dies with it. So every run the foreman starts (builds, triages,
review rounds, spec runs and routines) goes through one launcher,
`headless`, which sets `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` and
`BASH_MAX_TIMEOUT_MS=3600000`: nothing goes to the background, and a Bash
call may run for an hour in the foreground. The build, triage, round and
spec prompts say the same in `headless_rules`.

A build, triage or review round that still ends with none of its outcomes
(a PR or a question; a PR or a spec; a push or a question) is resumed once:
`claude -p --resume` on the session the first run started, in the same
worktree, with its own timeout. The retry is quiet, a `retried` event and a
log line. If it ends with nothing too, the foreman fails it as before, and
the comment names both logs. A run the timeout killed (exit 142) isn't
retried, and spec runs and routines never are.

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
comments in the prompt. Images pasted on GitHub into the owner's issue body or the
owner's comments (not the foreman's or `claude[bot]`'s) (`github.com/user-attachments/assets/<id>`) are fetched too, into
`.feedback-assets/user-attachments/<id>.<ext>`, for spec runs and builds
as well. It decides:
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
- **Neither** (a failed run, even after its retry): `needs-decision`, a
  comment with both logs' paths, and back to Ideas. Removing `needs-decision` triages it again.

Feedback PRs are ordinary `foreman/*` PRs: the same rounds and gate.

## Before/after shots

A build or triage that changes the Apple app leaves `.fix-shots/plan.json`
(the `feedback-flow` skill): the `-NylonScreen` routes that show the change.
After the run, the foreman captures them here with
`src/marketing/fix-shots.ts`, warm simulators and all:

- in a detached checkout of `main`: `capture --as after` with the branch's
  `src/ios`, then `--as before` with main's, each side at most 45 minutes,
  in the iOS lane (below), with DerivedData in `~/.foreman/derived`;
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

## The iOS lane

The iOS UI tests and the iOS marketing captures run here on the Mac mini,
whose simulators and DerivedData stay warm, rather than on a hosted runner
that starts cold every time (#611). The mini isn't a GitHub Actions runner:
the repo is public, and a runner here would run strangers' PRs on the
machine that holds the token. The foreman picks what runs, and that's only
`main` and the owner's and `nylon-foreman`'s PRs.

**One at a time.** UI tests, captures and before/after shots share one lock,
`~/.foreman/jobs/ios-lane/` (a pid, like the build jobs'). The timing checks
need a quiet simulator. A tick starts at most one iOS job in the background,
as `foreman job ios <kind> <sha> [pr|main]`. It doesn't count toward
`FOREMAN_MAX_JOBS` or the PR limit. Fix-shots waits up to 30 minutes for the
lane (`FOREMAN_LANE_WAIT`), then gives up best-effort, saying so in the PR's
**Try it**. The order: UI tests for open PR heads, oldest PR first; then
`main`'s; then the captures.

**Trusted checkout.** Every job works in `~/.foreman/worktrees/ios-lane`, a
detached checkout of `main`'s head that's kept between jobs. The scripts,
the `xcodebuild` invocation and `node_modules` all come from there. Only the
**iOS paths** come from the commit under test: `src/ios`,
`src/shared/src/todo-date-fixtures.json` and `src/shared/design`, the list
`ios-test.yml` watches.

**Disk.** Each kind keeps its own DerivedData in `~/.foreman/derived/`
(`ui-test`, `marketing`, `fix-shots-ios`, `fix-shots-mac`), so the second
build is incremental. Nothing goes to `/tmp`.
- After every iOS job, while `~/.foreman/derived` is over 15GB
  (`FOREMAN_DERIVED_CAP_GB`), the least recently used folder goes.
- With under 10GB free (`FOREMAN_MIN_FREE_GB`), no iOS job starts: an alert
  and an `ios_skipped` event, once a day. PRs then wait on the status, and
  the gate's wait says why.
- The simulators stay created and are shut down after each job, and
  `xcrun simctl delete unavailable` runs. `.xcresult` bundles go after 7 days.

### UI tests: `foreman/ios-ui-test`

- **No iOS change.** A PR whose files (against its merge base) touch none of
  the iOS paths gets `success`, "No iOS change", in the tick's first pass,
  with no build. Anyone's PR, forks included: it only reads the file list.
- **Not run.** Any other PR that touches them (a fork, dependabot, anyone
  but the owner and `nylon-foreman`) gets `failure`, "Not run: only the
  owner's and the foreman's PRs run on the Mac mini".
- **Run.** A trusted, non-draft PR's head, and `main`'s head after a merge
  that changed the iOS paths, get `pending` ("Running on the Mac mini") when
  the job starts, then `success` or `failure`: "All N passed", "Passed, 1 on
  retry: testDoneUnderLoad" or "2 failed: testDoneUnderLoad, …". It's the
  "Nylon Impossible UI Tests" scheme on `Nylon UI Test iPhone`, with
  `-retry-tests-on-failure -test-iterations 2`, within 45 minutes
  (`FOREMAN_IOS_TIMEOUT`). A `main` whose iOS paths didn't change since its
  last run gets "No iOS change since <sha>".
- A newer head replaces an older one: the job checks the PR's head before it
  starts, and a superseded one never runs.
- The tests run without `NYLON_SLOW_SIMULATOR`, so the timing checks
  (`testDoneHoldsInPlaceThenLeavesWithUndo`, `testDoneUnderLoad`, the
  accessibility audits' -56) run in full here. Only the hosted
  `ios-ui-test.yml` sets it.
- A failure or a pass on retry comments on the PR with every test and its
  result, the failures by name, and the log's path. On `main`, a failure
  alerts, and a pass on retry is a line in the digest.
- Logs: `~/.foreman/logs/ui-test-<sha>.log`, with the result bundle beside
  it.
- **The gate** waits on a foreman PR whose head has no `foreman/ios-ui-test`
  yet (`wait: ios-ui-test not posted`), so it can't merge in the gap before
  the job starts. The owner makes the status a required check on `main`.

### Marketing captures

- After a merge that changed the iOS paths or `src/marketing/manifest.json`
  since the last capture. The revision is those paths' git ids
  (`git rev-parse <sha>:src/ios` …), which `marketing.yml` computes the same
  way. A failed capture isn't retried until the next change, or by hand.
- In the lane's checkout of that commit: `generate.ts --capture-ios
  --capture-parity-ios` (the parity sheet's iOS half; its web half needs
  Clerk), within 45 minutes.
- An all-fresh set (every entry in `capture-status.json` is `fresh`) goes to
  the orphan `marketing-ios` branch, force-pushed as one parentless commit:
  `source/ios-*.png`, `source/parity/ios-*.png`, `capture-status.json` and
  `revision.json` (the source commit and the tree ids). It's the only branch
  the foreman force-pushes. A partial set is never pushed.
- Then, whether it worked or not, the foreman dispatches `marketing.yml`
  (`strict=false`). That run fetches `marketing-ios` and publishes, without
  Xcode. Its `workflow_run` trigger, after a deploy that changed the iOS
  paths, skips publishing until `revision.json` matches, so the landing page
  changes once, with both halves fresh.
- A failure is a `captures` routine event and a line in the digest, and two
  in a row alert. The hosted job publishes with the last good set.

### By hand

```sh
~/.foreman/bin/foreman.sh ui-test 640       # a PR (the owner's or the foreman's), its head
~/.foreman/bin/foreman.sh ui-test main      # or main's head, or a commit on main
~/.foreman/bin/foreman.sh captures --force  # even if main's revision was captured
~/.foreman/bin/foreman.sh routine ui-test off
```

Both go through the lane, waiting for it, and `ui-test` re-runs a head that
already has its status. `ui-test` and `captures` turn off like the routines:
`foreman routine <name> off`, or `FOREMAN_ROUTINES_OFF`. With `ui-test` off,
no statuses are posted, so foreman PRs wait, and stall where the owner can see
it.

## After the merge

There's no `verified` any more (owner, 2026-11-10): the gate below is the
whole gate, for every kind, and the owner tries changes once they're live.
Each PR keeps its **Try it** section for that, and the merge alert links to
it. What's wrong is reverted or fixed forward (CLAUDE.md, "Rolling back").
A leftover `verified` label on an old PR changes nothing.

## Waiting on you

The `waiting-on-owner` label marks every issue whose next step is the
owner's, so the board's **Waiting on you** view (a board grouped by Status,
filtered to `label:waiting-on-owner is:open`) is one place to see them, each
in its real column. The foreman sets it and the owner never does: each tick,
`waiting_pass` works the list out again from GitHub and a fresh read of the
board, taken after the tick's other passes have moved things (`owner_waits`), labels what's missing and unlabels what no longer applies,
closed issues included. Nothing remembers it, so whatever ends a wait
(removing `needs-decision`, replying on a spec, merging a PR) takes the label
off on the next tick.

What counts:

| Waiting | Labelled |
| --- | --- |
| An open issue with `needs-decision` (a build or triage that stopped, a feedback spec with questions) | the issue |
| An open `foreman/<n>-*` PR with `needs-decision` or `owner-merge` | `#n` |
| An open `foreman/deps-*` PR with `owner-merge` (a dependency bundle that touches a guarded area) | the PR. It's added to the board in In review, and set to Done once it merges or closes |
| A spec in Define whose Open questions aren't "None.", once the foreman has answered the owner's latest comment (`settle_pass`'s test) | the issue |

A spec with no Open questions section hasn't been drafted yet, and one with an
unanswered reply is waiting on the foreman, so neither counts. Nor does a
stalled PR (below): that's usually CI or the review bot. Only PRs by the owner
or `nylon-foreman` label an issue.

`needs-decision` keeps its job as the "go again" switch for builds, triage and
review rounds; `waiting-on-owner` only summarises it. If any read fails, the
pass changes no labels that tick, since a partial list would strip them from
things still waiting. A bundle that can't be moved on the board (a renamed
column) is logged, and the labels still change. The first time it has something to label, the foreman
creates the label if the repo doesn't have it. `tick --dry-run` logs `would
label` and `would unlabel` instead. The digest's "Waiting on you" section
prints the same list.

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
- a round pushes nothing, even after its retry, since without a new commit
  there's no new review, so it could never reach 🟢 on its own;
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
queries for merged PRs, what's waiting on you (`owner_waits`, above),
`~/.foreman/verify/`, and `~/.foreman/waits/`
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
- the iOS lane's `ui-test` and `captures` turn off the same two ways ("The
  iOS lane");
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
dispatch, retaking shots after a push, closing superseded dependabot PRs, the
`waiting-on-owner` label, the digest's sections from a fixture
`events.jsonl`, and the iOS lane: which PRs get which status, the queue's
order, the trusted checkout, the status's words from a sample
`summary.json`, the push to `marketing-ios` and the failed-capture path, the
DerivedData cap and the free-space refusal. CI runs it whenever `scripts/foreman/` changes.

## What it trusts

The repo is public, so:

- The foreman **polls**. It isn't a self-hosted runner, so nothing on GitHub
  can push work to the machine.
- The iOS lane builds only `main` and the owner's and `nylon-foreman`'s PRs,
  not forks, and only their iOS paths, inside `main`'s scripts.
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
~/.foreman/bin/foreman.sh ui-test 640        # the iOS UI tests of a PR now ("The iOS lane")
~/.foreman/bin/foreman.sh captures           # main's iOS marketing shots now, if they're out of date
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
