-- Persist the LLM-extracted Tavily search query alongside each research run
-- so manual re-research can reuse it instead of falling back to the raw todo
-- title (which often contains imperatives like "Research" that confuse search).

ALTER TABLE todo_research ADD COLUMN search_query TEXT;
