CREATE TABLE `gmail_addon_links` (
	`google_sub` text PRIMARY KEY NOT NULL,
	`clerk_user_id` text NOT NULL,
	`email` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`clerk_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_gmail_addon_links_clerk_user` ON `gmail_addon_links` (`clerk_user_id`);--> statement-breakpoint
CREATE TABLE `lists` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'custom' NOT NULL,
	`system_kind` text,
	`position` text DEFAULT 'a0' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_lists_user_id` ON `lists` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_lists_user_system_kind` ON `lists` (`user_id`,`system_kind`);--> statement-breakpoint
CREATE TABLE `todo_urls` (
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
CREATE INDEX `idx_todo_urls_todo` ON `todo_urls` (`todo_id`);--> statement-breakpoint
CREATE TABLE `todos` (
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
	`sticky` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `todos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_todos_user_id` ON `todos` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_todos_user_position` ON `todos` (`user_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_todos_user_parent_position` ON `todos` (`user_id`,`parent_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_todos_user_list_position` ON `todos` (`user_id`,`list_id`,`position`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`);