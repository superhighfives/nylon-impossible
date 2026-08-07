-- Remove priority from todos.
-- Bucket + due date now carry the urgency signal priority used to carry, so
-- having both was redundant. Every reader/writer (API, web, iOS) had priority
-- removed ahead of this migration; safe to drop the column now.
ALTER TABLE todos DROP COLUMN priority;
