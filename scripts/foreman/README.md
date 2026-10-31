# Foreman

The foreman turns the **Nylon** project board into pull requests without a
local session. It runs on the owner's always-on Mac mini (later a MacStadium
Mac) as a launchd job, every 10 minutes.

Each tick:

1. **Merge.** For each open `foreman/*` PR, run the merge gate. Merge if it
   passes. If the only thing stopping it is a guarded area, label it
   `owner-merge`, comment once, and send an alert.
2. **Tidy.** Remove worktrees whose PR has merged or closed.
3. **Build.** If fewer than 3 agent PRs (`foreman/*` and `feedback/*`) are
   open, take the first **Ready** issue in board order and build it.
   - It runs headless `claude` in a fresh worktree, with the issue body and
     the owner's comments as the prompt.
   - The result is a PR, which then goes to In review and gets pastor
     watching it.
   - Or the result is a question: the issue gets `needs-decision` and goes
     back to Specced.

## The merge gate

`foreman gate <pr>` prints the verdict. The gate is a shell function, not a
model, so an agent never decides whether its own work merges. A PR merges
only when all of these hold:

- it's open, not a draft, mergeable, and has no `needs-decision` label;
- every check is complete and green (success, skipped or neutral);
- the latest `control-room-review` review is for the head commit and is
  all-green (`## 🟢`);
- there are no unresolved review threads started by the owner;
- it touches no **guarded area**:
  - `src/api/migrations/`;
  - anything under `.github/` (workflows, including the ones that review
    and deploy), and any `wrangler.jsonc`;
  - Fastlane config;
  - `MARKETING_VERSION` or `CURRENT_PROJECT_VERSION`;
  - PRINCIPLES.md's Settled section;
  - CLAUDE.md's "Work tracking" or "Merging" sections;
  - `scripts/foreman/` itself.

## What it trusts

The repo is public, so:

- The foreman **polls**. It isn't a self-hosted runner, so nothing on GitHub
  can push work to the machine.
- It only builds issues **opened by the owner** that the owner (or an agent,
  for non-features) moved to Ready.
- The prompt includes only the owner's and Claude's comments. Issues
  labelled `auto-fix` are left to `feedback.yml`.

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

**Setup and state:**
- Credentials come from pastor's shim (`~/.config/pastor/exec.sh`), so run
  `pastor setup` and `pastor token` first.
- Alerts use pastor's Discord webhook, if one is set.
- Everything else lives in `~/.foreman`: a clone tracking `main`, the
  worktrees, logs, and `events.jsonl`. The digest reads `events.jsonl`.

**Updating:** after each tick, the job copies `scripts/foreman/foreman.sh`
from `origin/main` to `~/.foreman/bin`, so a merged change takes effect on the
next tick. The foreman can't merge changes to itself, because that's a
guarded area.

**Moving to MacStadium:** install on the new machine, then `uninstall` on the
Mini. Nothing in the script is specific to the Mini.
