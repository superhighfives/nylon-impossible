# Before/after previews on feedback fix PRs

**Date**: 2026-10-22
**Status**: In progress

## Problem

The feedback inbox (`plans/done/2026-10-21-feedback-inbox.md`) has Claude
open a draft fix PR for each `auto-fix` issue. Judging those PRs means
building the branch and finding the screen by hand. Most iOS/Mac fixes need
someone to look at them to judge, so each PR should show what changed: what
the screen looked like on `main` and what it looks like on the branch, next to
each other, in the PR itself.

Getting the loop working at all came first:

- **#423**: every auto-fix run exited after two turns while showing green.
  `claude_args` is split like a shell command line, so the unquoted
  `--allowedTools` list broke each `Bash(cmd *)` rule into fragments, and
  Claude's first command was denied.
- **control-room#12**: the shared review workflow refused PRs opened by
  `claude[bot]`, so auto-fix PRs got no review. `claude[bot]` is now on its
  `allowed_bots`.

## Decisions

- **Claude picks the shots and the workflow takes them.** While fixing,
  Claude writes `.fix-shots/plan.json`. It lists up to 4 DEBUG screen routes
  (`-NylonScreen`, see `ScreenRoute.swift`) where the change is visible, each
  with a device, an appearance and a note. When a still image can't show the
  fix (a gesture, timing, sync), it writes `{"skip": "<why>"}` instead. Claude
  never captures anything itself, so its tool allowlist stays as it is.
- **Sample data only.** The routes draw in-memory sample data with no
  account, so nothing personal ends up in the public images.
- **Best-effort, like the marketing captures.** Both workflow steps are
  `continue-on-error`. A failed shot becomes a _not captured_ cell, and the
  fix PR never goes red because of a screenshot.
- **Images go on `feedback-assets`**, under `fixes/<issue>/<sha>/`, next to
  the report screenshots. The workflow only ever adds to that branch, and it
  pulls and retries instead of forcing. Claude never touches the branch.
- **The table lives in the PR body**, between
  `<!-- fix-shots:start/end -->` markers, so a rerun replaces it instead of
  stacking up comments.

## Built

- `src/marketing/fix-shots.ts` (#433) has two commands. `capture --as
  before|after` builds the DEBUG app and screenshots each shot. `report`
  prints the Markdown table.
  - iPhone/iPad: our own simulators ("Nylon Fix iPhone/iPad"), captured with
    `simctl io screenshot`.
  - Mac: an unsigned Debug build launched with `open -n -F -a … --args`. Run
    directly, the binary never activates and puts up no window. The script
    finds the app's largest window with CGWindowList and captures it with
    `screencapture -o -l <id>`.
  - Both sides share one derived-data path, so the second build only
    recompiles what the fix changed.
- `src/marketing/simulator.ts` holds the hardened simulator helpers
  (`ensureBooted`, `withSimRetries`, …), moved out of `generate.ts` so both
  scripts share them.
- `feedback.yml`:
  - The prompt asks for the plan on Apple platforms.
  - "Capture before and after" checks out `main` and then the branch, running
    the capture on each.
  - "Post before and after" commits the images and rewrites the PR body.
  - The job timeout is now 75 minutes.
- **#435**: an untimed first `simctl` call, plus `xcodebuild -downloadPlatform
  iOS` when no simulator is available. The first real run (#418, PR #434) got
  the whole way to the PR table, but both cells were _not captured_. On a
  fresh runner the first `simctl list` starts CoreSimulator, and that took
  longer than the script's 30-second timeout. `marketing.yml` already had the
  same warm-up step.

## Still to verify

- [ ] A run on #418 with #435 in place fills both cells
      (run 39908823680).
- [ ] Mac capture on a GitHub macOS runner. `screencapture` of another
      app's window may need Screen Recording permission, which the runner
      may not grant. If it doesn't, Mac cells stay _not captured_ and we
      need another approach (for example, the app snapshotting its own
      window in a DEBUG route).
- [ ] A web fix. It runs on Linux and writes no plan, so it should skip
      cleanly.

## Next: video for interactions

Still images can't show gesture fixes. #416 (pull-to-refresh on the pager)
and #417 (dragging down and sideways at once) look identical before and
after. Video would cover them.

**How it would work:**

1. **Claude writes a UI test for the interaction.** `Nylon ImpossibleUITests`
   already launches the app through `-NylonScreen` routes on sample data
   (`NylonUITestCase.launch`). The test performs the gesture and asserts the
   fixed behaviour, so it also guards against the bug coming back. The plan
   gains a `video` entry naming the test, for example
   `{"device": "iphone", "test": "PagerGestureTests/testDiagonalDragPagesOnly"}`.
2. **The workflow records the simulator** with `xcrun simctl io <udid>
   recordVideo` while `xcodebuild test -only-testing:<test>` runs, once per
   side:
   - **after:** the fix branch as-is;
   - **before:** `main` with the branch's UI-test files overlaid
     (`git checkout <after> -- "src/ios/Nylon Impossible/Nylon ImpossibleUITests"`).
     The test is expected to fail here, and that recording is the one that
     shows the bug.
3. **Each recording is converted to a GIF** (ffmpeg, trimmed to the test's
   run, scaled down, a few seconds at ~15 fps). GitHub only plays video that
   was uploaded through its web UI, and there's no API for that, so a `.mp4`
   on a branch won't play inline. A GIF in an `<img>` will. The GIFs go on
   `feedback-assets` with the stills, and the table gains a row per video.

**Open questions:**

- Mac: recording a window has the same Screen Recording question as Mac
  stills. iPhone and iPad come first.
- Cost: one UI-test run per side on top of the stills' builds. A plan should
  have one video at most.
- Whether ffmpeg is on the macOS runner image, or needs `brew install`
  (about a minute).
- Keeping GIFs under GitHub's 10 MB image proxy limit: trim to the gesture,
  or use fewer frames.
