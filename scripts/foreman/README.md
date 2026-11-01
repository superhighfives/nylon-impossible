# Foreman

The foreman turns the **Nylon** project board into pull requests without a
local session. It runs on the owner's always-on Mac mini (later a MacStadium
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
4. **Build.** If fewer than 3 agent PRs (`foreman/*` and `feedback/*`) are
   open, take the first **Ready** issue in board order whose spec passes the
   check (below), and build it.
   - It runs headless `claude` in a fresh worktree, with the issue body and
     the trusted comments as the prompt.
   - The result is a PR, with a **Try it** section, which then goes to In
     review and gets pastor watching it.
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

## Verified

The gate waits for the owner's `verified` on every foreman PR, for now.

- **It counts only if you added it,** going by the label event's actor, and
  only if you added it after the head commit was pushed (the repo's activity
  log says when). If the label's latest event is anyone else's, it waits.
- **A push after `verified` clears it.** The foreman removes the stale label
  and comments, so what you tried is what merges. The reminder clock
  restarts from that push.
- **Reminders.** When a PR first waits only for `verified`, the clock starts
  (`~/.foreman/verify/<pr>`, and an `awaiting_verified` event). After a day
  you get one alert and one comment. `foreman status` lists every PR still
  waiting, for the daily digest (#544) to pick up.
- **Relaxing it** means dropping it for one kind at a time, with a written
  reason in CLAUDE.md, and a change to the gate here.

## Review rounds

`control-room-review` reviews every push. The foreman merges only on 🟢, so
it owns the rounds on its own PRs, the way `feedback.yml` does on
`feedback/*`. Pastor leaves those findings alone (CLAUDE.md says so).

A round starts when a `foreman/*` PR's checks are green and its latest review
is 🟡 or 🔴 on the head commit:

- Claude runs in a detached checkout of the branch, with the review and its
  unresolved threads as the prompt.
- It fixes what's right and replies where it disagrees, then pushes. The
  push brings a fresh review, and the next round starts from that.
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
  so a guarded PR still gets `owner-merge` first);
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
way the gate has to wait, `verified` and its reminders, the spec check, and
the token's expiry. CI runs it whenever `scripts/foreman/` changes.

## What it trusts

The repo is public, so:

- The foreman **polls**. It isn't a self-hosted runner, so nothing on GitHub
  can push work to the machine.
- It only builds issues **opened by the owner** that the owner moved to
  Ready. `foreman build <n>` applies the same rule, and the spec check.
- The prompts include only comments by the owner, `nylon-foreman` and
  `claude[bot]`, matched by exact login (and, in review threads, by account
  type), because anyone can register a login that starts with "claude".
  Issues labelled `auto-fix` are left to `feedback.yml`.
- Only the owner's `verified` counts, so the machine account can't verify its
  own work.

## Running it

```sh
scripts/foreman/foreman.sh install           # copies itself to ~/.foreman/bin, loads the job
~/.foreman/bin/foreman.sh status
~/.foreman/bin/foreman.sh tick --dry-run     # what the next tick would do
~/.foreman/bin/foreman.sh build 548          # build one issue now
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
  worktrees, logs, `rounds/`, `specs/`, `verify/`, and `events.jsonl`, one
  line per merge, PR, question, spec run or failure. The daily digest (#544)
  will read `events.jsonl`.
- **It runs under macOS's `/bin/bash` 3.2**, so no associative arrays or
  other bash 4 features.

**Updating:** after each tick, the job copies `scripts/foreman/foreman.sh`
from `origin/main` to `~/.foreman/bin`, so a merged change takes effect on the
next tick. The foreman can't merge changes to itself, because that's a
guarded area.

**Moving to MacStadium:** install on the new machine, then `uninstall` on the
Mini. Nothing in the script is specific to the Mini.
