-- Data only: lowercase every todo ID and every column that points at one
-- (todos.parent_id, todo_urls.todo_id). POST /todos used to store a client's
-- id as sent, and iOS sends `uuidString`, which is uppercase; every other
-- writer, and every lookup, uses lowercase. No schema change. Both foreign
-- keys are ON UPDATE no action, so their checks wait until the end.
PRAGMA defer_foreign_keys = true;
--> statement-breakpoint
-- An uppercase todo whose lowercased ID is already a row is an accidental
-- duplicate (an old iOS POST /todos, then sync inserting a lowercase copy).
-- The lowercase row is the one every client syncs, so the twin goes, and its
-- links and subtasks with it by ON DELETE cascade. Renaming it instead would
-- break the primary key and stop the deploy.
DELETE FROM `todos` WHERE `id` <> lower(`id`) AND lower(`id`) IN (SELECT `id` FROM `todos`);
--> statement-breakpoint
UPDATE `todos` SET `id` = lower(`id`) WHERE `id` <> lower(`id`);
--> statement-breakpoint
UPDATE `todos` SET `parent_id` = lower(`parent_id`) WHERE `parent_id` <> lower(`parent_id`);
--> statement-breakpoint
UPDATE `todo_urls` SET `todo_id` = lower(`todo_id`) WHERE `todo_id` <> lower(`todo_id`);
