#!/usr/bin/env node
// Guards against migrations/meta/ (drizzle-kit's own snapshot history) drifting
// out of sync with the real .sql migration files under migrations/. When it
// drifts, `pnpm db:generate` silently renumbers from wherever meta last left
// off (e.g. producing a bogus "0002_*" migration when 20 real ones already
// exist) instead of continuing the sequence. See
// plans/done/2026-08-06-remove-priority.md for the incident this guards
// against, and plans/done/2026-08-06-fix-drizzle-migration-meta.md for the
// fix.
//
// Two invariants must hold:
// 1. migrations/meta/_journal.json has exactly one entry per .sql file — its
//    entry count is what determines the next generated migration's number.
// 2. The most recent snapshot file's numeric prefix isn't behind the most
//    recent .sql migration's — meta must have "caught up" to the real history.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "migrations");
const metaDir = join(migrationsDir, "meta");

const sqlFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const journal = JSON.parse(
  readFileSync(join(metaDir, "_journal.json"), "utf8"),
);

const snapshotFiles = readdirSync(metaDir)
  .filter((f) => f.endsWith("_snapshot.json"))
  .sort();

const errors = [];

if (journal.entries.length !== sqlFiles.length) {
  errors.push(
    `migrations/meta/_journal.json has ${journal.entries.length} entries but ` +
      `there are ${sqlFiles.length} .sql migration files. drizzle-kit numbers ` +
      "the next generated migration from the journal's entry count, so this " +
      "drift causes it to silently generate a colliding/wrong migration number. " +
      "Reconcile the journal (one entry per .sql file, in filename order) before " +
      "running `pnpm db:generate` again.",
  );
}

const latestSqlIdx = sqlFiles.length - 1;
const latestSnapshotPrefix = snapshotFiles.at(-1)?.match(/^(\d+)_/)?.[1];
const latestSnapshotIdx = latestSnapshotPrefix
  ? Number.parseInt(latestSnapshotPrefix, 10)
  : -1;

if (latestSnapshotIdx < latestSqlIdx) {
  errors.push(
    `migrations/meta/'s latest snapshot (idx ${latestSnapshotIdx}) is behind ` +
      `the latest .sql migration (idx ${latestSqlIdx}). drizzle-kit diffs the ` +
      "next `db:generate` run against whatever the latest snapshot describes, " +
      "so a stale snapshot makes it think already-applied columns are new. " +
      "Regenerate a snapshot that reflects the current schema.ts before adding " +
      "another migration.",
  );
}

if (errors.length > 0) {
  console.error("✘ migrations/meta/ is out of sync with migrations/*.sql:\n");
  for (const e of errors) console.error(`  - ${e}\n`);
  process.exit(1);
}

console.log(
  `✓ migrations/meta/ is in sync (${sqlFiles.length} migrations, journal + snapshots caught up)`,
);
