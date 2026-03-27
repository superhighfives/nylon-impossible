-- Migration: Add research_id to todo_urls
-- URLs with research_id are research sources (displayed with citation numbers)
-- URLs without research_id are user/extracted URLs (displayed as today)

ALTER TABLE todo_urls ADD COLUMN research_id TEXT REFERENCES todo_research(id) ON DELETE CASCADE;
CREATE INDEX idx_todo_urls_research_id ON todo_urls(research_id);
