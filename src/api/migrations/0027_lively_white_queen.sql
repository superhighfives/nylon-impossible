DELETE FROM `todo_suggestions` WHERE `type` = 'research';--> statement-breakpoint
DROP TABLE `todo_research`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_todo_urls` (
	`id` text PRIMARY KEY NOT NULL,
	`todo_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`description` text,
	`site_name` text,
	`favicon` text,
	`image` text,
	`show_preview` integer DEFAULT true NOT NULL,
	`position` text DEFAULT 'a0' NOT NULL,
	`fetch_status` text DEFAULT 'pending' NOT NULL,
	`fetched_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`todo_id`) REFERENCES `todos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_todo_urls`("id", "todo_id", "url", "title", "description", "site_name", "favicon", "image", "show_preview", "position", "fetch_status", "fetched_at", "created_at", "updated_at") SELECT "id", "todo_id", "url", "title", "description", "site_name", "favicon", "image", "show_preview", "position", "fetch_status", "fetched_at", "created_at", "updated_at" FROM `todo_urls`;--> statement-breakpoint
DROP TABLE `todo_urls`;--> statement-breakpoint
ALTER TABLE `__new_todo_urls` RENAME TO `todo_urls`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_todo_urls_todo` ON `todo_urls` (`todo_id`);