-- Database seed script for local development
-- Run with: wrangler d1 execute nylon-impossible-db --local --persist-to ../../.wrangler/state --file=src/db/seeds/seed.sql

-- Clear existing data (in correct order to respect foreign keys). No
-- separate join table since migration 0023 dropped `todo_lists` in favour of
-- a direct `todos.list_id` NOT NULL column.
DELETE FROM todo_urls;
DELETE FROM todos;
DELETE FROM lists;
DELETE FROM users;

-- Insert test user
INSERT INTO users (id, email, created_at, updated_at)
VALUES ('user_test_123', 'test@example.com', unixepoch(), unixepoch());

-- Insert default lists with fractional indexing positions
INSERT INTO lists (id, user_id, name, position, created_at, updated_at) VALUES
  ('list_1', 'user_test_123', 'TODO', 'a0', unixepoch(), unixepoch()),
  ('list_2', 'user_test_123', 'Shopping', 'a1', unixepoch(), unixepoch()),
  ('list_3', 'user_test_123', 'Bills', 'a2', unixepoch(), unixepoch()),
  ('list_4', 'user_test_123', 'Work', 'a3', unixepoch(), unixepoch());

-- Insert sample todos, assigned directly to their list via list_id
INSERT INTO todos (id, user_id, list_id, title, notes, completed, position, created_at, updated_at) VALUES
  ('todo_1', 'user_test_123', 'list_2', 'Buy groceries', 'Milk, eggs, bread, and vegetables', 0, 'a0', unixepoch(), unixepoch()),
  ('todo_2', 'user_test_123', 'list_3', 'Pay electricity bill', 'Due by the end of the month', 0, 'a1', unixepoch(), unixepoch()),
  ('todo_3', 'user_test_123', 'list_4', 'Review project proposal', 'Check the Q2 roadmap document', 1, 'a2', unixepoch(), unixepoch()),
  ('todo_4', 'user_test_123', 'list_1', 'Call dentist', 'Schedule annual checkup', 0, 'a3', unixepoch(), unixepoch()),
  ('todo_5', 'user_test_123', 'list_4', 'Fix navigation bug', 'Mobile menu not closing on route change', 0, 'a4', unixepoch(), unixepoch());
