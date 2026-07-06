-- Enforce one user row per email. Drops the non-unique index and recreates it
-- as unique, so a second account can't be created for an email that already
-- exists (e.g. the same person returning under a new auth/Clerk id).
-- NOTE: requires that no duplicate emails exist in `users` at apply time.
-- Dedupe any duplicates before applying this against production.
-- IF EXISTS / re-runnable: a prior failed apply may have dropped the old index
-- before the unique CREATE failed, so the index can already be absent here.
DROP INDEX IF EXISTS `idx_users_email`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`);
