---
title: Before/after previews on feedback fix PRs
status: Complete
created: 2026-10-22
updated: 2026-10-24
---

# Before/after previews on feedback fix PRs

Completed 2026-10-24.

## Overview

The feedback inbox (`plans/done/2026-10-21-feedback-inbox.md`) has Claude
open a draft fix PR for each `auto-fix` issue. Judging those PRs used to mean
building the branch and finding the screen by hand. Now, for iOS, iPadOS and
Mac fixes, the PR body carries a **Before | After** table: the screen on
`main` next to the screen on the fix branch, captured by the Feedback
workflow from DEBUG screen routes on sample data.

Claude chooses what to show by writing a small plan while it fixes the issue.
The workflow builds both sides, captures them, stores the images on
`feedback-assets`, and writes the table into the PR body. It's best-effort:
a failed shot becomes a _not captured_ cell and never turns the PR red. A
`capture_only` rerun retakes the shots on an open fix PR without running
Claude again.

Verified end to end on 2026-10-24:

- **iPhone**: #440 (feedback #418), both cells filled, run 40070832296.
- **Mac**: #432 (feedback #420), four cells filled, run 40073497820. The
  hosted runner needs no Screen Recording permission for `screencapture` of
  the app's own window.
- **Web**: #446 → #447 ran on Linux, wrote no plan, and skipped every
  capture step cleanly (run 40073550300).

Getting the loop running at all came first: **#423** (an unquoted
`--allowedTools` list meant Claude's first command was refused and every run
exited green after two turns) and **control-room#12** (the shared review
workflow refused PRs opened by `claude[bot]`).

## Architecture

### How a run works

1. Claude fixes the issue and, on Apple platforms, writes
   `.fix-shots/plan.json`: up to 4 shots, each a `-NylonScreen` route
   (listed in `ScreenRoute.swift`) with a device, appearance and note, or
   `{"skip": "<why>"}` when a still can't show the fix.
2. **Summarise Claude's run** prints each refused tool call as a warning,
   and Claude's final message, since the action hides its output (#436).
3. **Find the fix PR** outputs the PR number and the two commits. It's its
   own step so a capture that runs out of time still posts a table (#439).
4. **Capture before and after** checks out the workflow's own commit, then,
   for each side (after first), swaps in only that side's `src/ios` and runs
   `fix-shots.ts capture` (#444). It has a 70-minute limit; the job has 100.
5. **Post before and after** commits the PNGs to `feedback-assets` under
   `fixes/<issue>/<sha>/` (pull and retry, never force) and replaces the
   section between `<!-- fix-shots:start/end -->` in the PR body. The section
   also carries the validated plan in a hidden `fix-shots:plan` comment.

A `capture_only` dispatch skips step 1. **Recover the plan** reads the plan
back from the PR body, or from the `plan` input for older PRs (#442).

### Key decisions

- **Claude picks the shots, the workflow takes them.** Claude never captures
  anything, so its tool allowlist didn't grow.
- **Sample data only.** The routes run on in-memory data with no account.
  The sidebar name ("Charlie Gleason") is a fixed placeholder that
  `ContentView` returns for any screen route, the same one the marketing
  shots use.
- **The plan is model output and the PR is public.** `readPlan` keeps only
  the known shot fields, checks the route name, and cleans notes (no table
  breaks, HTML or links; @mentions broken). The saved plan escapes `<` and
  `>` so it can't close its comment.
- **Capture scripts always come from the workflow's commit.** Checking out a
  whole side ran the fix branch's copy of `fix-shots.ts`, which was older
  than `main`'s fixes. It also meant the post step, which holds a token that
  can write to the repo, ran code from the fix branch.
- **Build, then boot.** See below.

### Files

| File | Purpose |
| --- | --- |
| `src/marketing/fix-shots.ts` | `capture --as before\|after` (build, launch routes, screenshot) and `report` (the table plus the saved plan) |
| `src/marketing/simulator.ts` | Simulator helpers shared with `generate.ts`: `ensureSimulator`, `ensureBooted`, `withSimRetries`, … |
| `.github/workflows/feedback.yml` | The prompt's plan instructions, the summary step, and the find / recover / capture / post steps |

iPhone and iPad shots use our own simulators ("Nylon Fix iPhone/iPad") and
`simctl io screenshot`. Mac shots launch an unsigned Debug build with
`open -n -F -a … --args` (run directly, the binary never puts up a window),
find its largest window with CGWindowList and capture it with
`screencapture -o -l <id>`. Both sides share one derived-data path, so the
second build is incremental.

### What the hosted runner taught us

Almost every fix after #433 was about the hosted macOS runner, where
CoreSimulator is slow to answer and gets slower under load:

- **#435**: the first `simctl` call starts CoreSimulator and can take
  minutes, so the workflow makes an untimed warm-up call (and downloads the
  iOS platform if it's missing).
- **#439**: a capture that ran 73 minutes hit the job timeout, which
  cancelled the post step and discarded the log. Capture got its own limit.
- **#441**: even after the warm-up, `simctl list` took 48 seconds, so
  `ensureSimulator`'s lookups (which nothing retries) got 3 minutes instead
  of 30 seconds.
- **#443**: `ensureBooted` treated an unreadable state as a failed boot and
  shut the simulator down, discarding boots that were nearly done. An
  unknown state now waits on the same boot instead.
- **#444**: the after side was running the fix branch's old capture code
  (see Key decisions).
- **#445**: #439 had overlapped the build with the boot. A cold build swamps
  CoreSimulator: every state read timed out for the whole 30-minute build,
  so a boot that had worked was given up on. Back to build, then boot. The
  limits went from 50 to 70 minutes (capture) and 75 to 100 (job).

The working run took 25 minutes to capture: the after side ~20 (an 11-minute
cold build, a boot of under a minute, one install retry), the before side 5.

## Follow-ups

- **Video for interactions**: `plans/backlog/2026-10-24-feedback-fix-videos.md`.
  Gesture fixes like #416 and #417 look the same in stills, and so does #432
  (its spinner only shows during a sync, which sample data never does).
- **A warm Mac**: `plans/backlog/2026-10-23-self-hosted-mac-capture-runner.md`.
  Most of the 25 minutes is the cold build and simulator.
- **Small differences between sides.** In #440 the after image lacked the
  fixed status bar (the best-effort `status_bar override` probably timed out
  right after boot), and the two sides showed different sample dates
  (probably the older branch's sample data). Neither affects judging a fix;
  worth a look if they keep showing up.
