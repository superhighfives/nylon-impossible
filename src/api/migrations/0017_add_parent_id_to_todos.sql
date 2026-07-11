-- Add parent_id to todos for subtasks.
-- Self-referential: a subtask points at its parent todo; top-level todos have
-- parent_id NULL. One level only (a subtask cannot itself have subtasks) and
-- immutable after creation — subtasks are permanently bound to their parent.
-- Deleting a parent cascades to its children (ON DELETE CASCADE). The index
-- scopes sibling lookups/ordering per user, matching the (user_id, parent_id)
-- grouping.

ALTER TABLE todos ADD COLUMN parent_id TEXT REFERENCES todos(id) ON DELETE CASCADE;

CREATE INDEX idx_todos_user_parent_position ON todos(user_id, parent_id, position);
