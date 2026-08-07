---
title: Fix drizzle-kit migration metadata drift
status: Complete
created: 2026-08-06
updated: 2026-08-06
---

# Fix drizzle-kit migration metadata drift

## Goal

Reconcile `src/api/migrations/meta/` (drizzle-kit's own snapshot history) with
the real `.sql` migration files, and add a guard so it can't silently drift
out of sync again.

## Context

While implementing `plans/done/2026-08-06-remove-priority.md`, running
`pnpm db:generate` to add a column-drop migration produced a bogus migration
that tried to re-create 7+ columns that already existed. Investigation found
`migrations/meta/` had only tracked 2 migrations (`0000`, `0001`) even though
21 `.sql` files existed on disk (`0000`-`0019`, with a duplicate `0007`
prefix). drizzle-kit numbers the next generated migration from
`meta/_journal.json`'s entry count and diffs against the alphabetically-last
snapshot file in `meta/` — with both stale, it thought the schema was still
at migration `0001` and treated everything added since as brand new.

This didn't affect real deploys: `wrangler d1 migrations apply` (what
actually runs migrations) tracks applied files by name in its own
`d1_migrations` table and never reads drizzle-kit's meta. The drift only
broke `pnpm db:generate`, silently, until it produced a migration that
would have re-created 7 already-existing columns.

## Approach

1. **Reconcile history for `0000`-`0019`.** Rebuilt `meta/_journal.json` with
   one entry per real `.sql` file (21 entries, ordered by filename, `when`
   timestamps pulled from each file's first commit via `git log`). Generated
   an accurate snapshot representing the schema exactly as of migration
   `0019` (the current `main` state) by pointing `drizzle-kit generate` at a
   scratch output directory seeded with the two real early snapshots, letting
   it diff and serialize the full current schema, then keeping only the
   resulting snapshot json (not the bogus recreate-everything SQL it also
   produced) and renaming it to `0020_snapshot.json` to sort last. Verified
   by running `db:generate` for real afterward — it correctly reported "No
   schema changes, nothing to migrate", and a test column addition correctly
   generated as `0021_*` (not colliding with anything).
2. **Add a guard**: `src/api/scripts/check-migrations-meta.mjs` checks two
   invariants — `_journal.json`'s entry count matches the `.sql` file count,
   and the latest snapshot's numeric prefix isn't behind the latest `.sql`
   migration's. Wired in as `db:check-meta` (both `src/api/package.json` and
   root `package.json`), added to `.husky/pre-commit` (runs alongside
   `check:fix`) and to `.github/workflows/web-test.yml` (runs alongside the
   API lint/typecheck step, gated on the same `src/api/**` path filter).

## Tasks

- [x] Rebuild `migrations/meta/_journal.json` with one entry per real `.sql`
      file.
- [x] Generate and place an accurate current-state snapshot as the new head
      of the meta chain.
- [x] Verify `pnpm db:generate` reports no diff against unchanged
      `schema.ts`, and correctly numbers the next migration when a real
      schema change is made (tested with a throwaway column, reverted).
- [x] Write `check-migrations-meta.mjs` and verify it fails against the old
      broken state and passes against the reconciled one.
- [x] Wire the guard into `pnpm db:check-meta`, pre-commit, and CI.

## Overview

Drizzle-kit's migration-generation metadata was 18 migrations behind the real
`.sql` history. Reconciled it by rebuilding the journal and splicing in an
accurate current-state snapshot, then added `db:check-meta` — a script
verifying the journal's entry count matches the `.sql` file count and the
latest snapshot isn't stale — wired into pre-commit and CI so this can't
silently drift again.

## Architecture

- `src/api/migrations/meta/_journal.json` — rebuilt with 21 entries (one per
  `.sql` file, ordered by filename), `tag` matching each file's stem.
- `src/api/migrations/meta/0020_snapshot.json` — new head of the snapshot
  chain, representing the schema as of migration `0019` (current `main`).
  Intermediate per-migration snapshots (`0002`-`0019`) were not
  reconstructed — that granularity is genuinely lost and isn't needed for
  `db:generate` to function correctly going forward (it only ever diffs
  against the alphabetically-last snapshot file).
- `src/api/scripts/check-migrations-meta.mjs` — the guard script, run via
  `pnpm db:check-meta`.

### Deviations from a "complete" fix

- Only the *latest* snapshot was reconstructed, not one per historical
  migration. drizzle-kit doesn't need per-migration snapshots to function (it
  only reads the last one), and reconstructing 18 historical schema states
  with no record of what each looked like at the time isn't recoverable
  data — it would have to be guessed. If this granularity is ever needed
  (e.g. to `db:generate` against an intermediate point), it isn't available.
