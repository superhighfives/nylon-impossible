-- Promote the board's "Completed" column from a synthesized section into a
-- real system list, so it has a stable id/position like Today/This
-- Week/Sometime. Its contents stay computed client-side (an aggregate of
-- completed todos across every list) — no todo ever gets `list_id` pointing
-- at this row; it exists purely so the board can treat it as a first-class
-- column. Position is inert: the web/iOS clients always render it last
-- regardless of `position`, so it doesn't need to interleave with existing
-- system/custom positions.
INSERT INTO `lists` (`id`, `user_id`, `name`, `kind`, `system_kind`, `position`, `created_at`, `updated_at`)
SELECT
  lower(hex(randomblob(16))),
  `id`,
  'Completed',
  'system',
  'completed',
  'a3',
  unixepoch(),
  unixepoch()
FROM `users`;
