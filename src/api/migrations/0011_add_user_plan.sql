-- Add subscription plan column to users table
-- Defaults to 'free' so all existing users start on the free tier
ALTER TABLE `users` ADD `plan` text DEFAULT 'free' NOT NULL;
