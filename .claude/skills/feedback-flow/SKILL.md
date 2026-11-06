---
name: feedback-flow
description: How nylon-impossible's in-app feedback becomes issues, and how the foreman triages and fixes them. Use when working on a `feedback`-labelled issue or its PR, POST /feedback or the apps' Send feedback, the `auto-fix` label, the feedback-assets branch, or the Before | After fix-shots (.fix-shots/plan.json, src/marketing/fix-shots.ts).
---

# Feedback issues

Issues labelled `feedback` + `platform:*` are filed by the apps' admin-only
**Send feedback** (`POST /feedback`), with the owner's token. Their
screenshots are committed to the orphan **`feedback-assets`** branch — never
merge it, rebase it onto `main`, force-push it or delete it, or every old
issue loses its images. Spec: #566 (and, before it,
[2026-10-21-feedback-inbox](https://github.com/superhighfives/nylon-impossible/blob/02f8c45b3ba52896a25bde813cfd2b0a05ef9fb1/plans/done/2026-10-21-feedback-inbox.md)).

## The foreman owns them

A report is just another way for work to reach the foreman
(`scripts/foreman/README.md`, "Feedback"). There's no workflow for it on
GitHub any more: `feedback.yml` and the `feedback/*` branches are retired.

- **`auto-fix` is the go-ahead.** The API adds it to admins' reports; on
  anyone else's, the owner adds it after reading. It counts only if the
  label's latest event is the owner adding it, because the report becomes
  the prompt.
- **Intake.** Each run, the foreman takes the oldest cleared report it
  hasn't handled (not on the board past Ideas, no `spec` or
  `needs-decision`, no open PR) ahead of any Ready item.
- **Triage.** Claude reads the report, its screenshots and the owner's,
  `nylon-foreman`'s and Claude's comments, and decides:
  - **Clear** (one observable problem, its fix evident, a contained
    change): it posts a **Light spec** comment and builds the fix straight
    away, on `foreman/<n>-<slug>`, as a ready-for-review PR that
    `Closes #n`. The item goes to In progress, then In review.
  - **Unclear, or bigger than a fix:** it writes a spec into the issue body
    (the report stays under **Problem**) and posts its questions. The
    foreman adds `spec` and `needs-decision` and moves it to Specced. The
    owner's replies start spec runs, as for any spec (`prd` skill), and
    `needs-decision` comes off once **Open questions** reads "None.". The
    owner moves it to Ready, and it's built like any other item.
- **After that it's the foreman's ordinary loop:** review rounds until 🟢,
  the merge gate, and the owner's `verified`. The operator leaves
  `control-room-review` findings on these PRs to the foreman.

When the Mac mini is off, reports wait. There's no hosted fallback.

## Fix shots

On Apple platforms the PR's **Try it** section gets a **Before | After**
table. Claude writes `.fix-shots/plan.json` and doesn't commit it or capture
anything itself:

```json
{"shots": [{"device": "iphone", "screen": "<route>", "dark": true, "landscape": false, "note": "<what to look at>"}]}
```

At most 4 shots, on `-NylonScreen` routes (listed at the top of
`src/ios/Nylon Impossible/Nylon Impossible/Views/Shell/ScreenRoute.swift`),
in the report's appearance. If a still can't show the fix (a gesture,
timing, sync, data that isn't in the sample), write
`{"skip": "<one line why>"}` instead.

After the run, the foreman runs `src/marketing/fix-shots.ts` on the Mac
mini: `capture --as after` with the branch's `src/ios`, `--as before` with
main's (the scripts stay main's), then `report`. The images go to
`feedback-assets` under `fixes/<issue>/<sha>/`, in a commit added on top
(never forced). The table sits between `<!-- fix-shots:start/end -->`
markers inside **Try it**, with the plan saved in a hidden comment.

- **It's best-effort,** like the marketing captures (see the
  `marketing-screenshots` skill): a shot that fails reads "not captured",
  and the PR says how many and where the log is. Never make it fail the
  run.
- **Retakes:** a review round that changes `src/ios` retakes the shots from
  the saved plan, and so does `foreman.sh shots <pr>`.
- The simulator helpers it shares with `generate.ts` live in
  `src/marketing/simulator.ts`.
