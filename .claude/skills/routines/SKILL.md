---
name: routines
description: The foreman's scheduled routines for nylon-impossible (nightly Sentry sweep, weekly Dependabot bundle, the pastor shepherd, the weekly scout, the daily digest). Use when changing, debugging or turning off a routine, when an issue, board item, PR or digest comment looks like a routine made it, or when asked what runs on the Mac mini besides builds.
---

# Routines

The foreman (`scripts/foreman/foreman.sh`, on the owner's Mac mini) runs
five routines as well as building from the board. They act as
`nylon-foreman`, like everything else the foreman does. Its README's
**Routines** section has the mechanics. This is what each one does and how to
stop it.

| Routine | When (the Mini's local time) | Runs | Output |
| --- | --- | --- | --- |
| `sentry` | Nightly, from 03:00 | Claude, with the Sentry MCP | Up to 5 issues in Specced |
| `deps` | Mondays, from 09:00 | Claude, `dependabot-bundle` skill | One `foreman/deps-<date>` PR |
| `shepherd` | Every tick | Shell | A pastor job on every agent PR |
| `scout` | Thursdays, from 03:00 | Claude | Up to 5 draft items in Ideas |
| `digest` | Daily, from 08:00 | Shell | A comment on the pinned "Foreman digest" issue, and a Discord alert |

A routine runs on the first tick after its time, once per window, even if
that run fails. A failed run alerts and shows up in the next digest. Each run
logs a `routine` event to `~/.foreman/events.jsonl`.

## What each one does

- **sentry** finds unresolved errors seen in the last 14 days in this repo's
  Sentry projects, the same selection as the `review-sentry` skill. It doesn't fix
  anything. Claude proposes up to 5 specs in the `prd` template, and the
  foreman files them: labelled `kind:fix` and `spec`, open questions as the
  first comment, in **Specced**. It skips an error whose short ID is already
  in an open issue, or one closed in the last 30 days, and any body that
  isn't a complete spec or doesn't name its short ID. Won't-fix reasons go in
  the event, not on GitHub. The spec pass revises these specs after the
  owner's reply. Only the owner moves one to Ready.
- **deps** bundles the open dependabot PRs into one PR on
  `foreman/deps-<YYYY-MM-DD>`. It leaves out failing or major bumps and says
  why in the PR. It does nothing when there are no dependabot PRs, while a
  bundle is still open, or while 3 agent PRs are open. Its PR merges on green
  CI and a 🟢 review, without `verified`. A bump under `.github/` makes it a
  guarded PR, so the owner merges that one. After a bundle merges, a later
  tick closes each dependabot PR the bundle named, once main has all of its
  change.
- **shepherd** runs `pastor install` on every open agent PR (`foreman/*` and
  `feedback/*`, by the owner or `nylon-foreman`) that has no pastor job, and
  stops the jobs it started once their PR closes. CLAUDE.md's pastor rule
  still applies: on `foreman/*` PRs, `control-room-review` findings are the
  foreman's.
- **scout** reads the code for simplification, dead code and drift between
  `src/web`, `src/ios`, the menu bar and `src/gmail-addon` (PRINCIPLES.md's
  "One design, many densities" and Vocabulary). The foreman adds up to 5
  findings to **Ideas** as draft items (a title and a paragraph naming files
  and lines), skipping any whose title is already on the board or in an open
  issue. It never edits files or opens a branch or PR.
- **digest** covers the last 24 hours: **Merged**, **Waiting on you**
  (`needs-decision`, `owner-merge`, PRs waiting for `verified`, specs with
  questions), **Found** (what sentry and scout filed) and **Problems** (failed
  builds, rounds, spec runs and routines, and a token about to expire). It's
  built in shell from `events.jsonl` and GitHub's own fields, so no text on
  GitHub can steer it. It posts nothing when every section is empty.

## What they're trusted with

sentry and scout are read-only, by an allow-list rather than a deny-list.
Claude runs `--restricted` in `dontAsk` mode, so anything not listed is
refused: no shell, no web, no MCP server but Sentry's read tools (sentry
only), and the file tools stay inside its checkout. The one thing it may
write is its JSON file of proposals, so the machine account's token is out
of reach. Their prompts treat everything from GitHub and Sentry as data. The
shell checks, deduplicates, caps and files those proposals, so the caps and
the "never Ready" rule don't depend on the model. deps is the one routine
that pushes and opens a PR, because that's its whole job. The merge gate and
review rounds cover it like any other `foreman/*` PR.

## Running, checking, turning off

```sh
~/.foreman/bin/foreman.sh status                    # each routine's last run, next run, and whether it's off
~/.foreman/bin/foreman.sh routine sentry --dry-run  # what it would file, open, install or post; changes nothing
~/.foreman/bin/foreman.sh routine digest            # run it now, ignoring its schedule
```

To turn one off:

- **From anywhere:** set the repo variable `FOREMAN_ROUTINES_OFF` to a
  comma-separated list of names, like `sentry,scout` (Settings → Secrets and
  variables → Actions → Variables). Remove a name to turn it back on.
- **On the Mac:** `foreman.sh routine <name> off`, and `on` to undo it.
- `FOREMAN_PAUSED` (or `foreman.sh pause`) stops the whole foreman, routines
  included.

A routine that's off stays due, so it runs on the next tick after it's
turned back on.
