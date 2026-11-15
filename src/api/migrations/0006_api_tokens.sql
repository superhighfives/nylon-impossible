-- Expand-only: a new table for personal API tokens (#570). Workers still
-- running the previous code never read or write it, so it's safe to apply
-- before the rollout. Nothing is tightened later. Deleting a user cascades to
-- their token, like every other child table.
CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_user_id_unique` ON `api_tokens` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_token_hash_unique` ON `api_tokens` (`token_hash`);