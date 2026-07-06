-- Add per-user preference to hide completed todos from the list.
-- Defaults to 0 (false) so existing users keep seeing completed todos.
ALTER TABLE `users` ADD `hide_completed` integer DEFAULT 0 NOT NULL;
