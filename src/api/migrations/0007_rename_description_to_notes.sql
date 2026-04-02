-- Migration: Rename description to notes on todos table
-- Notes are user-facing freeform text and are not used by AI processing.

ALTER TABLE todos RENAME COLUMN description TO notes;
