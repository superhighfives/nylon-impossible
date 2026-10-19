-- Expand-only: a new column with a default. Workers still running the previous
-- code never read or write it, and their inserts get the default, so it's safe
-- to apply before the rollout (see "Migrations: expand/contract" in CLAUDE.md).
ALTER TABLE `users` ADD `timezone_auto` integer DEFAULT true NOT NULL;
