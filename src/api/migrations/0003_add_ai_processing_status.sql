-- Migration: Add AI processing status to todos
-- This tracks whether a todo is pending AI processing, currently being processed, or complete

ALTER TABLE todos ADD COLUMN ai_status TEXT DEFAULT NULL;
-- Values: NULL (not applicable), 'pending', 'processing', 'complete', 'failed'
