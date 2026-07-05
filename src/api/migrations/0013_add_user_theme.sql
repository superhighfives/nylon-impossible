-- Add appearance preference column to users table.
-- Defaults to 'system' so existing users keep following their OS setting.
ALTER TABLE `users` ADD `theme` text DEFAULT 'system' NOT NULL;
