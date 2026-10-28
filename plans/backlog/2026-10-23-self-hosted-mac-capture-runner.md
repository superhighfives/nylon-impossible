---
title: Self-hosted Mac runner for screenshot captures
status: Backlog
created: 2026-10-23
updated: 2026-10-26
---

# Self-hosted Mac runner for screenshot captures

## Problem

Nearly all of the time in our iOS screenshot work goes to starting from a
fresh machine. On a GitHub-hosted macOS runner, every run downloads the iOS
platform, cold-boots a simulator and builds from scratch. In marketing's last
fresh iOS run, a single iPhone pass took about 26 minutes:

| Stage | Time |
| --- | --- |
| Download the iOS platform | ~3 min |
| Cold build | ~5 min |
| Boot (one failed attempt, then a retry) | ~16 min |
| Install, then the first shot | ~8 min |

That's why:

- the feedback fix screenshots (`plans/done/2026-10-22-feedback-fix-previews.md`)
  take ~25 minutes for a single iPhone shot, most of it a cold build and
  simulator, and the capture step now needs a 70-minute limit (#445);
- `marketing.yml`'s iOS phase takes 25–44 minutes, and the parity sheet 42;
- most of the capture flakiness CLAUDE.md describes is a cold CoreSimulator
  timing out;
- video of interactions on fix PRs (`2026-10-24-feedback-fix-videos.md`)
  is parked until this exists: seven hosted runs never got both sides,
  losing them to slow creates, boots, first keyboards and `recordVideo`
  start-up.

A Mac that stays up keeps all of that warm: the platform installed, our
simulators created and booted, DerivedData from the last build. A capture
should then take a few minutes. The candidate is a cloud M1 Mac mini (1 TB).

## Approach

### Only the captures move

Claude keeps running on hosted runners. The feedback job gives Claude an
issue body as its prompt, and a hosted runner throws away whatever it did
when the job ends; a machine we keep doesn't. So split `feedback.yml`'s `fix`
job in two:

1. **`fix`** (hosted, as now): Claude makes the fix and opens the PR, and the
   "Find the fix PR" step (from #439) outputs the PR number and the two
   commits. Upload `.fix-shots/plan.json` as an artifact.
2. **`shots`** (self-hosted, `needs: fix`): what a `capture_only` run already
   does (#442), on the mini: recover the plan, find the PR, capture, post.
   The capture scripts come from the workflow's own commit and each side only
   swaps in `src/ios` (#444), so nothing from the fix branch runs outside the
   app build. The plan is already saved in the PR body, so it needs no
   artifact.

`marketing.yml` moves as a whole: it runs on `workflow_run` after a deploy of
`main`, so it only ever runs code that's already merged.

### Keeping the runner to those jobs

The repo is public, and on a public repo a pull request from a fork can edit a
workflow to `runs-on: self-hosted`. Before registering the runner:

- Settings → Actions → General: require approval for fork PR workflows from
  **all outside contributors**.
- Give the runner a label of its own (say `nylon-mac`) and use only that
  label, never bare `self-hosted`, so nothing else ever lands on it by
  accident.
- Check whether repo-level runners can be limited to specific workflows; on a
  personal account they may not be (see open questions).

### Machine setup

- A real logged-in user session: auto-login, sleep and screen saver off.
  Simulators and `screencapture` need a GUI session, so the runner runs as a
  LaunchAgent (`./svc.sh install` on macOS), not a headless daemon. First
  setup on a cloud mini is over VNC.
- Xcode pinned to the version the hosted image uses, with the iOS platform
  installed, so builds match what `ios-test.yml` checks.
- Screen Recording permission for the runner's process, only if Mac
  captures need it there. Hosted runners don't (run 40073497820).
- The "Nylon Fix …" and "Nylon Marketing …" simulators left created and
  booted between runs. The scripts already use simulators of their own by
  name, so nothing else on the machine collides with them.

### Script changes

- DerivedData paths (`FIX_SHOTS_DERIVED_DATA_*` in `fix-shots.ts`, and
  marketing's equivalent) set to a persistent directory instead of `/tmp`.
- The warm-up and `-downloadPlatform` steps become no-ops on a warm machine.
  Keep them so the jobs still run on hosted runners.
- The workspace persists between jobs, so steps that assume a fresh checkout
  must clean up first. For example, "Fetch screenshots" runs
  `git worktree add .feedback-assets` and fails if the worktree already
  exists.

## Tasks

- [ ] Rent or provision the mini; check its RAM (see open questions).
- [ ] Fork PR approval setting, then register the runner with a `nylon-mac`
      label as a LaunchAgent in a logged-in session.
- [ ] Install Xcode and the iOS platform.
- [ ] Split `feedback.yml` into `fix` (hosted) and `shots` (`nylon-mac`).
- [ ] Make the fix-shots and marketing steps safe to rerun in a persistent
      workspace; move DerivedData off `/tmp`.
- [ ] Move `marketing.yml`'s job to `nylon-mac`.
- [ ] Re-run #418 and a marketing run, and compare times with the hosted
      runs above.
- [ ] Check a Mac capture still works there (Screen Recording).
- [ ] Try the video prototype there (`fix-shots-video`, issue 416); see
      the video plan's "To finish it on the self-hosted Mac".

## Open questions

- **RAM.** An 8 GB M1 handles a build next to one booted iPhone simulator;
  an iPad simulator on top gets tight. 16 GB is comfortable. Which is it?
- **When the mini is down.** A job for an offline self-hosted runner waits
  in the queue (for up to a day) rather than failing over. Do we fall back
  to hosted runners automatically, which would need a token that can list
  runners (the `GITHUB_TOKEN` can't), or accept queued shots and a manual
  re-run?
- **One job at a time.** A single runner runs one job at a time, so a
  marketing run and a feedback capture queue behind each other. That's fine
  at our volume, but worth knowing.
- **Workflow restrictions.** Can a runner on a personal-account repo be
  limited to specific workflows, or does that need an org runner group?
- **`ios-test.yml`.** It would gain just as much, but it runs on pull
  requests, which is the risky trigger. Leave it hosted, at least to start.
- **Upkeep.** Xcode and runtime updates, clearing disk space and the
  occasional wedged simulator are now ours. Is a scheduled job to reboot and
  clear DerivedData weekly enough?
