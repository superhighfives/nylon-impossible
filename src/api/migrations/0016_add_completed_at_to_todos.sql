-- Add completed_at timestamp to todos.
-- Records the moment a repeating todo was checked. Its dueDate rolls forward on
-- completion (the todo is never persisted as done), so completed_at is what the
-- UI uses to keep the repeat in the Completed section until the user's local
-- midnight, after which it derives back to active. Null for todos never
-- completed as a repeat.
ALTER TABLE todos ADD COLUMN completed_at INTEGER;
