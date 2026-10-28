-- Data only: the thisWeek system list's stored name is what every client
-- shows, so sentence case ("This week") means renaming the row. No schema
-- change, nothing tightened; workers still on the previous code just read the
-- new name (see "Migrations: expand/contract" in CLAUDE.md).
UPDATE `lists` SET `name` = 'This week' WHERE `system_kind` = 'thisWeek' AND `name` = 'This Week';
