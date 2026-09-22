DROP TABLE `todo_messages`;--> statement-breakpoint
DROP TABLE `todo_suggestions`;--> statement-breakpoint
ALTER TABLE `todos` DROP COLUMN `ai_status`;--> statement-breakpoint
ALTER TABLE `todos` DROP COLUMN `needs_input`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `ai_enabled`;