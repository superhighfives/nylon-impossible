-- Marketing screenshot seed data.
-- Inserts the Clerk development test user and a realistic set of todos into the local D1.
-- Run from src/api directory:
--   npx wrangler d1 execute nylon-impossible-db --local \
--     --persist-to ../../.wrangler/state \
--     --file=../../src/marketing/seed.sql

INSERT OR IGNORE INTO users (id, email, created_at, updated_at)
VALUES ('user_3BPJATg8w4djAPJd71AUARo3vJ7', 'marketing@nylonimpossible.com', unixepoch(), unixepoch());

INSERT OR IGNORE INTO lists (id, user_id, name, kind, system_kind, position, created_at, updated_at)
VALUES
  ('mktg_list_today', 'user_3BPJATg8w4djAPJd71AUARo3vJ7', 'Today', 'system', 'today', 'a0', unixepoch(), unixepoch()),
  ('mktg_list_this_week', 'user_3BPJATg8w4djAPJd71AUARo3vJ7', 'This Week', 'system', 'thisWeek', 'a1', unixepoch(), unixepoch()),
  ('mktg_list_sometime', 'user_3BPJATg8w4djAPJd71AUARo3vJ7', 'Sometime', 'system', 'sometime', 'a2', unixepoch(), unixepoch());

INSERT OR IGNORE INTO todos (id, user_id, list_id, list_entered_at, title, notes, completed, position, due_date, created_at, updated_at)
VALUES
  ('mktg_1', 'user_3BPJATg8w4djAPJd71AUARo3vJ7', 'mktg_list_today', unixepoch(),
   'Finish quarterly report',
   'Needs sign-off from the finance team before end of month',
   0, 'a0', strftime('%s', '2026-03-28'), unixepoch(), unixepoch()),
  ('mktg_2', 'user_3BPJATg8w4djAPJd71AUARo3vJ7', 'mktg_list_this_week', unixepoch(),
   'Book dentist appointment',
   NULL,
   0, 'a1', strftime('%s', '2026-03-19'), unixepoch(), unixepoch()),
  ('mktg_3', 'user_3BPJATg8w4djAPJd71AUARo3vJ7', 'mktg_list_sometime', unixepoch(),
   'Read ''Atomic Habits''',
   NULL,
   0, 'a2', NULL, unixepoch(), unixepoch()),
  ('mktg_4', 'user_3BPJATg8w4djAPJd71AUARo3vJ7', 'mktg_list_today', unixepoch(),
   'Buy groceries for the week',
   NULL,
   1, 'a3', NULL, unixepoch(), unixepoch());
