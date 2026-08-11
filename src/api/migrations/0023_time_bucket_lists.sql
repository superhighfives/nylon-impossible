-- Repurpose `lists` for time-bucket lists: add kind/systemKind.
ALTER TABLE `lists` ADD `kind` text DEFAULT 'custom' NOT NULL;
--> statement-breakpoint
ALTER TABLE `lists` ADD `system_kind` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_lists_user_system_kind` ON `lists` (`user_id`,`system_kind`);
--> statement-breakpoint
-- Drop the dead todo_lists many-to-many join table.
DROP TABLE `todo_lists`;
--> statement-breakpoint
-- Add nullable columns first — existing todo rows have no value yet, and
-- SQLite rejects a non-constant default (unixepoch()) on ADD COLUMN.
ALTER TABLE `todos` ADD `list_id` text;
--> statement-breakpoint
ALTER TABLE `todos` ADD `list_entered_at` integer;
--> statement-breakpoint
-- Seed the three system lists for every existing user.
INSERT INTO `lists` (`id`, `user_id`, `name`, `kind`, `system_kind`, `position`, `created_at`, `updated_at`)
SELECT
  lower(hex(randomblob(16))),
  `id`,
  'Today',
  'system',
  'today',
  'a0',
  unixepoch(),
  unixepoch()
FROM `users`;
--> statement-breakpoint
INSERT INTO `lists` (`id`, `user_id`, `name`, `kind`, `system_kind`, `position`, `created_at`, `updated_at`)
SELECT
  lower(hex(randomblob(16))),
  `id`,
  'This Week',
  'system',
  'thisWeek',
  'a1',
  unixepoch(),
  unixepoch()
FROM `users`;
--> statement-breakpoint
INSERT INTO `lists` (`id`, `user_id`, `name`, `kind`, `system_kind`, `position`, `created_at`, `updated_at`)
SELECT
  lower(hex(randomblob(16))),
  `id`,
  'Sometime',
  'system',
  'sometime',
  'a2',
  unixepoch(),
  unixepoch()
FROM `users`;
--> statement-breakpoint
-- Backfill every existing todo into its owner's Sometime list. Single-user
-- product today, so "safest and simplest" wins over a due-date heuristic.
UPDATE `todos`
SET `list_id` = (
  SELECT `lists`.`id` FROM `lists`
  WHERE `lists`.`user_id` = `todos`.`user_id`
  AND `lists`.`system_kind` = 'sometime'
);
--> statement-breakpoint
-- Backfill list_entered_at to updated_at for existing rows (closest sensible
-- proxy for "when it entered its current list").
UPDATE `todos` SET `list_entered_at` = `updated_at`;
--> statement-breakpoint
-- SQLite can't add a NOT NULL column without a static default to a table
-- with existing rows in one step; rebuild list_id as NOT NULL now that every
-- row has a value.
CREATE TABLE `__new_todos` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`parent_id` text,
	`list_id` text NOT NULL,
	`list_entered_at` integer DEFAULT (unixepoch()) NOT NULL,
	`title` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`completed_at` integer,
	`position` text DEFAULT 'a0' NOT NULL,
	`notes` text,
	`due_date` integer,
	`recurrence` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`ai_status` text,
	`needs_input` integer DEFAULT false NOT NULL,
	`google_task_id` text,
	`sticky` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `todos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_todos` SELECT
	`id`, `user_id`, `parent_id`, `list_id`, `list_entered_at`, `title`,
	`completed`, `completed_at`, `position`, `notes`, `due_date`, `recurrence`,
	`created_at`, `updated_at`, `ai_status`, `needs_input`, `google_task_id`,
	`sticky`
FROM `todos`;
--> statement-breakpoint
DROP TABLE `todos`;
--> statement-breakpoint
ALTER TABLE `__new_todos` RENAME TO `todos`;
--> statement-breakpoint
CREATE INDEX `idx_todos_user_id` ON `todos` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_todos_user_position` ON `todos` (`user_id`,`position`);
--> statement-breakpoint
CREATE INDEX `idx_todos_user_parent_position` ON `todos` (`user_id`,`parent_id`,`position`);
--> statement-breakpoint
CREATE INDEX `idx_todos_user_list_position` ON `todos` (`user_id`,`list_id`,`position`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_todos_user_google_task` ON `todos` (`user_id`,`google_task_id`);
--> statement-breakpoint
-- Per-account timezone, drives the aging sweep's local-midnight calculation.
ALTER TABLE `users` ADD `timezone` text DEFAULT 'UTC' NOT NULL;
