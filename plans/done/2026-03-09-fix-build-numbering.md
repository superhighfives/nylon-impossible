---
title: Fix Build Numbering
status: Complete
created: 2026-03-09
updated: 2026-10-27
---

## Overview

TestFlight builds were numbered from `github.run_number`, so when the iOS
workflows were split and renamed on 2026-03-09 (`ios-test` / `ios-deploy`),
the counter restarted and the next upload was build #1 after #87. The fix,
committed straight to `main` with no PR (`14cad1e`), took the number out of
the workflow's run count and put it in a `BUILD_NUMBER` file at the repo root,
seeded at 87. The next deploy produced #88 (`703652f`, 2026-03-13).

That file didn't last. On 2026-03-25 (`2d9b9b1`, `c4ae31e`) it was removed and
Fastlane now asks TestFlight for the latest build number and adds one, which
is still how it works today.

## Architecture

**As first shipped (`14cad1e`):** the `deploy` job in
`.github/workflows/ios-deploy.yml` got `contents: write`, read
`BUILD_NUMBER`, incremented it, committed it back as
`Bump build number to N [skip ci]` as `github-actions[bot]`, and passed the
new value to `fastlane beta` as `BUILD_NUMBER`. This is the "separate file
incremented by the build" idea from the problem statement below.

The commit-back was awkward: the workflow needed write access to `main` just
to count builds, and its push could collide with other commits landing at the
same time (`0c6647d` added a pull before the push).

**Today:** the `beta` lane in `src/ios/Nylon Impossible/fastlane/Fastfile`
calls `latest_testflight_build_number` and passes `current + 1` as
`CURRENT_PROJECT_VERSION`. The Mac lane added later (#408) does the same.
TestFlight is the only source of truth, so nothing gets committed and a
renamed or re-run workflow can't reset the count.


The build numbering is not working correctly. The latest build is #1 but it should be #88.

## Problem

The build numbering is not working correctly. The latest build is #1 but it should be #88.

This may be because I changed the workflows, but we need a way to track build numbers consistently. Maybe we should use a separate file to track the build number? Something that can be incremented by the build automatically?

## Solution

**Latest:**

Deploy to TestFlight
Deploy to TestFlight #1: Manually run by superhighfives
main	
Today at 4:32 PM
8m 32s

**Previous:**

Merge pull request #29 from superhighfives/fix/todo-unchecked-ordering
Deploy to TestFlight #87: Commit e1d91ca pushed by superhighfives
main	
Today at 1:50 PM
9m 31s