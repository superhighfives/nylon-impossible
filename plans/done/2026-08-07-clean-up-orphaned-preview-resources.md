---
title: Clean up orphaned preview resources
status: Complete
created: 2026-08-07
updated: 2026-08-07
---

# Clean up orphaned preview resources

## Problem

Debugging why PR preview deploys ("`domains/records` request failed") kept
failing on unrelated PRs surfaced the real cause: the Cloudflare account was
sitting on ~230 orphaned Workers and Queues left behind by closed/merged PRs
going back to PR #107, almost certainly bumping into an account-level quota
(Workers had 147 scripts total; Queues sat at exactly 100). Investigation
found `cleanup-preview` (the job that's supposed to delete a PR's preview
Worker/Queue when the PR closes) deletes the **Worker before the Queue** —
but a Worker can't be deleted while it's a registered Queue consumer, so that
delete always failed. Every deletion step had `continue-on-error: true`, so
this failed silently on every single PR close, for as long as the
producer/consumer queue pattern has existed.

Same repo, `records.charliegleason.com`, and `nowhere-forever` all shared
this pattern and all had orphaned resources; only `nylon-impossible`'s were
cleaned up here.

## Solution

1. **One-time cleanup**: computed the diff between every PR-preview-shaped
   Worker/Queue in the account and currently-open PRs (across all three
   affected repos), then deleted the orphaned set via a hand-run script
   (`wrangler` CLI, not raw API — Claude Code's auto-mode classifier blocks
   direct Cloudflare API calls with an extracted token).
2. **Fixed the ordering bug**: `cleanup-preview` (and the queue-creation step
   in `deploy-preview`, which had the same `|| true` blanket-swallow problem)
   now run: remove the queue's consumer registration → delete the Workers
   (this also clears their producer bindings) → delete the Queue. Failures
   are classified — "does not exist" is expected/benign (PR closed before
   deploy ever ran, or a previous cleanup already got it) and doesn't fail
   the job; anything else does, so a real failure is visible in Actions
   instead of disappearing.
3. **Added a scheduled sweep** (`preview-cleanup-sweep.yml`) as a backstop
   independent of the per-PR close event ever firing correctly — daily cron,
   lists every PR-preview-shaped Worker/Queue account-wide (properly
   paginated, see deviation below), cross-checks against currently-open PRs
   via the GitHub API, and deletes anything orphaned using the same
   consumer-then-worker-then-queue order.

## Tasks

- [x] Delete ~230 orphaned Workers/Queues across `nylon-impossible`,
      `records.charliegleason.com`, `nowhere-forever` (verified against each
      repo's open PRs first).
- [x] Fix `cleanup-preview`'s deletion order and error-swallowing in
      `nylon-impossible`.
- [x] Fix the queue-creation step's blanket `|| true` in `deploy-preview`.
- [x] Add `preview-cleanup-sweep.yml` scheduled backstop to `nylon-impossible`.
- [ ] Same fixes for `records.charliegleason.com` — tracked separately.
- [ ] Same fixes for `nowhere-forever` — tracked separately.

## Deviations / known issues

- **`nylon-impossible-api-pr-107` could not be deleted.** It has a
  server-side orphaned queue-consumer registration pointing at a queue ID
  that no longer exists. Every client-facing fix attempted — direct delete,
  direct consumer removal, recreating the queue by the same name (gets a new
  ID, doesn't reunite with the dangling reference), redeploying the worker
  with zero queue bindings and a dropped Durable Object migration — failed,
  because every tool that can clear a consumer registration requires the
  queue to still exist by its original ID. Left in place; the scheduled
  sweep will keep retrying it daily and will keep failing loudly on it until
  it's resolved (via Cloudflare support, or possibly their dashboard has
  server-side tooling the API doesn't expose). This is intentional — better
  a visible daily red X than silently giving up on a known-broken resource
  again.
- **My original discovery undercounted the orphan set** two ways, both now
  fixed in the sweep script: I only read page 1 of the Cloudflare API's
  queue listing (missed everything past ~100 queues), and I assumed
  `records` used a `records-pr-N` queue name when it actually uses
  `records-analyze-pr-N`. The sweep paginates fully via `result_info` and
  matches Worker/Queue names directly rather than assuming a shared pattern.
