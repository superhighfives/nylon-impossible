-- Normalize dashless 32-hex list ids into canonical dashed UUID form.
--
-- Migration 0023 seeded every pre-existing user's system lists with
-- `lower(hex(randomblob(16)))`, which yields a 32-char hex string with no
-- dashes (e.g. `fb56f07a273550155f36b3156936b01c`). Runtime-created lists use
-- `crypto.randomUUID()` (dashed). The web client treats ids as opaque strings
-- so both shapes work there, but the iOS client decodes list ids as a Swift
-- `UUID`, which only accepts the dashed 8-4-4-4-12 form — so for migrated
-- accounts `UUID(uuidString:)` returned nil, every todo's `listId` fell to nil,
-- and no todo matched any list (empty lists on iOS).
--
-- Rewrite the dashless ids in place to the dashed form on both `lists.id` and
-- the referencing `todos.list_id`. Deferring the foreign key check lets the two
-- updates land in either order within the migration without a transient
-- dangling reference. Idempotent: the WHERE clauses only touch rows that are
-- still in the 32-char dashless shape, so re-running is a no-op.
PRAGMA defer_foreign_keys = ON;
--> statement-breakpoint
UPDATE `todos`
SET `list_id` =
  substr(`list_id`, 1, 8) || '-' ||
  substr(`list_id`, 9, 4) || '-' ||
  substr(`list_id`, 13, 4) || '-' ||
  substr(`list_id`, 17, 4) || '-' ||
  substr(`list_id`, 21, 12)
WHERE `list_id` IS NOT NULL
  AND `list_id` NOT LIKE '%-%'
  AND length(`list_id`) = 32;
--> statement-breakpoint
UPDATE `lists`
SET `id` =
  substr(`id`, 1, 8) || '-' ||
  substr(`id`, 9, 4) || '-' ||
  substr(`id`, 13, 4) || '-' ||
  substr(`id`, 17, 4) || '-' ||
  substr(`id`, 21, 12)
WHERE `id` NOT LIKE '%-%'
  AND length(`id`) = 32;
