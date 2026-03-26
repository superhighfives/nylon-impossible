-- Add AI enabled preference to users table
-- Defaults to true so existing users retain current behavior
ALTER TABLE `users` ADD `ai_enabled` integer DEFAULT 1 NOT NULL;
