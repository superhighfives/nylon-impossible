-- Expand-only: one nullable column, no backfill. Null means the list's column
-- shows on a wide board, so workers still running the previous code (which
-- never read or write it) leave every list shown, and nothing is tightened
-- later (see "Migrations: expand/contract" in CLAUDE.md).
ALTER TABLE `lists` ADD `column_hidden` integer;
