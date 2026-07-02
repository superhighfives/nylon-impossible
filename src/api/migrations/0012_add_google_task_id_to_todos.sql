-- Track the source Google Tasks id on imported todos so re-imports dedupe.
-- Null for todos created in-app; SQLite treats NULLs as distinct, so the
-- unique index only constrains real Google task ids (one per user).
ALTER TABLE `todos` ADD `google_task_id` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_todos_user_google_task` ON `todos` (`user_id`, `google_task_id`);
