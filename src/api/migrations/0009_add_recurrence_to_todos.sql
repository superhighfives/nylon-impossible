-- Migration: Add recurrence rule to todos
-- Nullable JSON column; null means non-repeating. v1 stores
-- { "frequency": "daily" | "weekly" | "monthly" | "yearly" }.

ALTER TABLE todos ADD COLUMN recurrence TEXT;
