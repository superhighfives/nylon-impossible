-- Migration: Add todo_research table for storing AI research results
-- Each todo can have at most one research record (enforced by UNIQUE constraint)

CREATE TABLE todo_research (
  id TEXT PRIMARY KEY NOT NULL,
  todo_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'completed' | 'failed'
  research_type TEXT NOT NULL DEFAULT 'general', -- 'general' | 'location'
  summary TEXT,
  researched_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
);

CREATE INDEX idx_todo_research_todo_id ON todo_research(todo_id);
CREATE INDEX idx_todo_research_status ON todo_research(status);
