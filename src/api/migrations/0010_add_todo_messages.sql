-- Migration: Add todo_messages table + todos.needs_input
-- Lightweight conversation thread on each todo for conversational refinement.
-- Messages are immutable and append-only; only `awaiting_reply` flips (to 0)
-- when the user replies or dismisses. `needs_input` on todos is the cheap
-- signal the list view reads without joining todo_messages on every render.

CREATE TABLE todo_messages (
  id TEXT PRIMARY KEY NOT NULL,
  todo_id TEXT NOT NULL,
  role TEXT NOT NULL, -- 'assistant' | 'user'
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  awaiting_reply INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
);

CREATE INDEX idx_todo_messages_todo_id ON todo_messages(todo_id, created_at);

ALTER TABLE todos ADD COLUMN needs_input INTEGER NOT NULL DEFAULT 0;
