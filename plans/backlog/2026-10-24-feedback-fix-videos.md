# Video for interactions on feedback fix PRs

**Date**: 2026-10-24
**Status**: Backlog

## Problem

Feedback fix PRs show a Before | After table of stills
(`plans/done/2026-10-22-feedback-fix-previews.md`). Stills can't show
interaction fixes: #416 (pull-to-refresh on the pager) and #417 (dragging
down and sideways at once) look identical before and after. So does #432,
whose sync spinner only appears while a sync runs. Video would cover these.

## How it would work

1. **Claude writes a UI test for the interaction.** `Nylon ImpossibleUITests`
   already launches the app through `-NylonScreen` routes on sample data
   (`NylonUITestCase.launch`). The test performs the gesture and asserts the
   fixed behaviour, so it also guards against the bug coming back. The plan
   gains a `video` entry naming the test, for example
   `{"device": "iphone", "test": "PagerGestureTests/testDiagonalDragPagesOnly"}`.
   `readPlan` must validate it like a shot: a known device, and a test name
   matching a strict pattern, since it ends up on a command line.
2. **The workflow records the simulator** with `xcrun simctl io <udid>
   recordVideo` while `xcodebuild test -only-testing:<test>` runs, once per
   side. The capture step already swaps in each side's `src/ios` while the
   tooling stays on the workflow's commit (#444), so:
   - **after:** the fix branch's `src/ios` as-is;
   - **before:** `main`'s `src/ios` with the branch's UI-test target
     overlaid
     (`git checkout <after> -- "src/ios/Nylon Impossible/Nylon ImpossibleUITests"`).
     The test is expected to fail here, and that recording is the one that
     shows the bug.
3. **Each recording becomes a GIF** (ffmpeg, trimmed to the test's run,
   scaled down, a few seconds at ~15 fps). GitHub only plays video uploaded
   through its web UI, and there's no API for that, so a `.mp4` on a branch
   won't play inline. A GIF in an `<img>` will. The GIFs go on
   `feedback-assets` next to the stills, and the table gains a row per video.

## What the stills taught us

- **Build before you boot.** A cold build running next to the simulator
  starves CoreSimulator, and nothing can read the simulator's state until
  the build finishes (#445). `xcodebuild test` builds too, so build for
  testing (`build-for-testing`) first, then boot, then
  `test-without-building` while recording.
- **Budget.** A still capture already takes ~25 minutes of the capture
  step's 70. A UI-test run per side adds to that, so a plan should have one
  video at most, and the limits may need raising again (GitHub's own limit
  is 6 hours per job).
- **Mac.** `screencapture` of the app's window works on a hosted runner
  without a Screen Recording grant (run 40073497820). Whether
  `screencapture -v` window recording does too is untested; iPhone and iPad
  come first.

## Open questions

- Is ffmpeg on the macOS runner image, or does it need `brew install`
  (about a minute)?
- Keeping GIFs under GitHub's 10 MB image proxy limit: trim to the gesture,
  or use fewer frames.
- Trimming: the recording runs for the whole test, including launch. Log a
  marker from the test at the start of the gesture and cut from there, or
  just take the last few seconds?
- Does a `capture_only` rerun record video too? It should, from the same
  saved plan.
