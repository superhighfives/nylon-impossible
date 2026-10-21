-- Expand-only: three new columns, one nullable and two with defaults. Workers
-- still running the previous code never read or write them, and their inserts
-- get the defaults, so it's safe to apply before the rollout (see
-- "Migrations: expand/contract" in CLAUDE.md). Nothing is tightened later.
ALTER TABLE `users` ADD `last_sweep_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `last_sweep_moved_to_this_week` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `last_sweep_moved_to_someday` integer DEFAULT 0 NOT NULL;
