CREATE TABLE `todo_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`todo_id` text NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`label` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`todo_id`) REFERENCES `todos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_todo_suggestions_todo_id` ON `todo_suggestions` (`todo_id`);--> statement-breakpoint
CREATE INDEX `idx_todo_suggestions_status` ON `todo_suggestions` (`status`);