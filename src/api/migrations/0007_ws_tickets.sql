-- Expand-only: a new table for one-use WebSocket tickets (#664). Workers
-- still running the previous code never read or write it, so it's safe to
-- apply before the rollout. Deleting a user cascades to their tickets.
CREATE TABLE `ws_tickets` (
	`ticket_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_ws_tickets_expires_at` ON `ws_tickets` (`expires_at`);