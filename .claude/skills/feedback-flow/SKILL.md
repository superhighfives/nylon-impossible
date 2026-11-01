---
name: feedback-flow
description: How nylon-impossible's in-app feedback becomes issues and auto-fix PRs. Use when working on a `feedback`-labelled issue or a `feedback/*` PR, POST /feedback or the apps' Send feedback, feedback.yml and its rounds (auto-fix, fix-round:N), the feedback-assets branch, or the Before | After fix-shots (.fix-shots/plan.json, src/marketing/fix-shots.ts).
---

# Feedback issues

Issues labelled `feedback` + `platform:*` are filed by the apps' admin-only
**Send feedback** (`POST /feedback`), with the owner's token. Their
screenshots are committed to the orphan **`feedback-assets`** branch — never
merge it, rebase it onto `main`, or delete it, or every old issue loses its
images. `feedback.yml` has Claude open a draft fix PR (or ask questions) when
the repo owner applies `auto-fix` — the API does that for admins' reports —
because the issue body is the prompt. Spec: [2026-10-21-feedback-inbox](https://github.com/superhighfives/nylon-impossible/blob/02f8c45b3ba52896a25bde813cfd2b0a05ef9fb1/plans/done/2026-10-21-feedback-inbox.md).

## Rounds

It then works in rounds, like pastor but in CI:

- **answer:** while there's no fix PR yet, the owner's reply on the issue
  (with or without `@claude`) reruns the fix with that reply. Claude only sees comments
  by the owner and itself; the workflow filters them before the run, since
  anyone can comment on a public issue.
- **review:** a `control-room-review` review that isn't all-green on a
  `feedback/*` PR starts a round on that branch. Claude's push gets a fresh
  review, so it loops. `fix-round:N` counts the rounds, and after 3 the
  workflow adds `needs-decision` and stops.

`needs-decision` on the issue or the PR stops every round. Claude adds it
when a finding is the owner's call; removing it re-arms the next round.

## Fix shots

On Apple platforms the fix PR also gets a **Before | After** table: Claude
writes `.fix-shots/plan.json` (which `-NylonScreen` routes show the change,
or why a still can't), and `src/marketing/fix-shots.ts` captures them on
`main` and the branch after Claude finishes. The images go to
`feedback-assets` under `fixes/<issue>/<sha>/`; the table sits between
`<!-- fix-shots:start/end -->` markers in the PR body. It's best-effort, like the
marketing captures (see the `marketing-screenshots` skill) — never make it fail
the run. The simulator helpers it shares with `generate.ts` live in
`src/marketing/simulator.ts`. Follow-up commits (via `@claude` or a review
round) that touch `src/ios` retake the shots from the plan saved in the PR body.
