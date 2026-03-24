-- Marketing screenshot seed data.
-- Inserts the Clerk development test user and a realistic set of todos into the local D1.
-- Run from src/api directory:
--   npx wrangler d1 execute nylon-impossible-db --local \
--     --persist-to ../../.wrangler/state \
--     --file=../../src/marketing/seed.sql

INSERT OR IGNORE INTO users (id, email, created_at, updated_at)
VALUES ('user_3BPJATg8w4djAPJd71AUARo3vJ7', 'marketing@nylonimpossible.com', unixepoch(), unixepoch());

INSERT OR IGNORE INTO todos (id, user_id, title, description, completed, priority, position, due_date, created_at, updated_at)
VALUES
  ('mktg_1', 'user_3BPJATg8w4djAPJd71AUARo3vJ7',
   'Finish quarterly report',
   'Needs sign-off from the finance team before end of month',
   0, 'high', 'a0', strftime('%s', '2026-03-28'), unixepoch(), unixepoch()),
  ('mktg_2', 'user_3BPJATg8w4djAPJd71AUARo3vJ7',
   'Book dentist appointment',
   NULL,
   0, NULL, 'a1', strftime('%s', '2026-03-19'), unixepoch(), unixepoch()),
  ('mktg_3', 'user_3BPJATg8w4djAPJd71AUARo3vJ7',
   'Read ''Atomic Habits''',
   NULL,
   0, 'low', 'a2', NULL, unixepoch(), unixepoch()),
  ('mktg_4', 'user_3BPJATg8w4djAPJd71AUARo3vJ7',
   'Buy groceries for the week',
   NULL,
   1, NULL, 'a3', NULL, unixepoch(), unixepoch());
