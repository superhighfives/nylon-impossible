# Video for interactions on feedback fix PRs

**Date**: 2026-10-24
**Status**: Backlog. Blocked on `2026-10-23-self-hosted-mac-capture-runner.md`
**Updated**: 2026-10-26

## Problem

Feedback fix PRs show a Before | After table of stills
(`plans/done/2026-10-22-feedback-fix-previews.md`). Stills can't show
interaction fixes: #416 (pull-to-refresh on the pager) and #417 (dragging
down and sideways at once) look identical before and after. So does #432,
whose sync spinner only appears while a sync runs. Video would cover these.

## Where it stands

A working prototype exists, unmerged, on the **`fix-shots-video`** branch.
On GitHub's hosted macOS runners it can't get a usable recording of both
sides in one run: seven runs on #430 (feedback #416), each lost at least one
side to the runner. The approach works when the runner does. Run 40152231313's
before GIF shows #416's bug: the chip row pulled down, with the refresh
spinner in it.

**Decision (2026-10-26):** park video until the self-hosted Mac exists, and
try the prototype there first. A warm simulator removes most of the failures
below.

## What's built (`fix-shots-video`)

| Commit | What |
| --- | --- |
| 9a21363 | `videos` in the plan, `captureVideo`, a video row in the table, GIFs copied to `feedback-assets`, ffmpeg installed when needed, the branch's UI tests overlaid on the before side |
| 78b9b2d, 061ec68 | Trim tweaks, superseded by ee196fa |
| 9bb7b13 | `simctl create` gets the 3-minute setup timeout (it timed out at 60s) |
| 7f6e77c | Log `recordVideo`'s output, exit code and file size; 60s to finish the file |
| ee196fa | Record only from the test's marker to the end of the test, after a warm-up recording; 15-minute test limit |

How a video works on that branch:

1. **The plan names a UI test**:
   `"videos": [{"device": "iphone", "test": "Class/testMethod", "note": "…"}]`,
   at most one. `readPlan` checks the device, and the test name against a
   strict pattern, since it ends up in an `xcodebuild` argument and a file
   name.
2. **Per side:** `build-for-testing` on the "Nylon Impossible UI Tests"
   scheme, then boot (build before boot, as #445 found), then a throwaway
   recording to warm up `recordVideo`.
3. `test-without-building -only-testing:Nylon ImpossibleUITests/<test>`.
   The test prints `FIX-SHOTS-GESTURE` (and `fflush`es, or a piped stdout
   holds it until the end) and pauses 3s. `fix-shots` starts `simctl io
   recordVideo` when that line appears, and stops it with SIGINT when the
   test ends.
4. ffmpeg turns the first 9s into a GIF (12 fps, 300px wide, about 1 MB).
5. **The before side** runs `main`'s `src/ios` with the branch's
   `Nylon ImpossibleUITests` copied in, so the new test exists there. It's
   expected to fail on that side, and that recording shows the bug.

The UI test for #416 is on #430's branch (`feedback/416`):
`PullToRefreshUITests/testPullingTheChipRowDownDoesNotRefresh`. It focuses
"New todo", so the list chips appear above the keyboard, then slowly pulls
the chip row down and holds. **Its assertion doesn't catch the bug:** it
passed on the before side while the spinner was on screen. It checks
`app.activityIndicators` after the finger lifts, and the chip row's spinner
probably isn't exposed as one. For now the video, not the test, is the
evidence.

## What we learned

The runs, all capture-only on #430, from `fix-shots-video`:

| Run | Result | Cause |
| --- | --- | --- |
| 40144170584 | Both GIFs; no difference | The test pulled the list with the keyboard down. The bug needs the composer focused. |
| 40146414657 | Both GIFs; no difference | It pulled the list, not the chip row. The report's spinner is in the chip row: `.refreshable` reached that horizontal `ScrollView` too. |
| 40150015575 | Neither side | `simctl create` timed out at 60s; on the other side the test runner failed to start ("Failed to initialize for UI testing") |
| 40152231313 | **Before shows the bug**; after failed | After's recording couldn't be cut (asked for 316s into a shorter file) |
| 40154290949 | Before only | After's test failed on a 5s keyboard wait (the first keyboard on a fresh simulator is slow), and its file couldn't be read |
| 40172370419 | Both GIFs; neither shows the pull | Cutting back from the end landed after the app quit. `recordVideo` took ~2 minutes to start on the fresh simulator. The before test hit the 10-minute limit (9 minutes to reach the field). |
| 40175445440 | Neither side | After's simulator never booted. Before's recorder never reported starting in the 23s between the marker and the end of the test. |

What carries forward:

- **Reproduce the reported state, not the obvious one.** Two runs were
  spent on gestures that don't trigger the bug. Read the report's
  screenshot for where the problem appears before writing the test.
- **A `simctl recordVideo` file's timeline doesn't follow the clock.**
  Offsets from "Recording started", and back from when it stopped, both
  missed. Either record only around the gesture, or use a recording that's
  synced to the test (see Alternatives).
- **`recordVideo` start-up varies a lot on hosted runners:** under a second,
  about 2 minutes, or not within 23s. A fixed pause in the test only works
  if the start is quick.
- **Everything is slower on the first side.** The after side runs first, on
  a fresh simulator: create, boot, first keyboard and first recording are
  all slow there. Waits inside tests need to be generous, and shouldn't
  fail the test when they're only there for the picture.
- **ffmpeg isn't on the runner image.** `brew install ffmpeg` takes about
  20 seconds.
- **XCUITest output streams live** through `xcodebuild`, including a flushed
  `print`, so a marker in the output can drive the host.

## To finish it on the self-hosted Mac

- Run the prototype there as it is (a `capture_only` dispatch with `--ref
  fix-shots-video`, issue 416) and see what still fails.
- Make the test's assertion catch the bug, or drop it and say the test only
  drives the recording.
- Tell Claude about `videos` in `feedback.yml`'s prompt: when to write a
  UI test instead of a still, the marker, and that it must reproduce the
  report's state. Until then only a person can ask for a video, through the
  `plan` input.
- Rebase `fix-shots-video` on `main`; it's from 2026-10-24.

## Alternatives, if `recordVideo` stays unreliable

- **Xcode's own UI-test screen recording.** Recent Xcode versions can record
  a UI test run into the result bundle, synced to the test's steps, which
  would drop the separate recorder, the marker and the cutting. Check that
  this Xcode supports it and how to export the video from the `.xcresult`.
- **Frames from the test itself**: `XCUIScreen.main.screenshot()` in a loop
  during the gesture, assembled into a GIF. Lower frame rate, but no
  recorder at all.

## Landed on `main` separately

Two fixes from `fix-shots-video` that stills needed too went in with #482:
`readPlan`'s "Ignoring an invalid …" warnings go to stderr (in `report`,
stdout is the public PR body), and `simctl create` gets the 3-minute setup
timeout. Rebasing the branch will drop 9bb7b13, and the stderr change in
9a21363 will conflict trivially.
