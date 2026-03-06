-- Database seed script for local development
-- Run with: wrangler d1 execute nylon-impossible-db --local --persist-to ../../.wrangler/state --file=src/db/seeds/seed.sql

-- Clear existing data (in correct order to respect foreign keys)
DELETE FROM todo_urls;
DELETE FROM todo_lists;
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

-- Insert sample todos
INSERT INTO todos (id, user_id, title, description, completed, priority, position, created_at, updated_at) VALUES
  ('todo_1', 'user_test_123', 'Buy groceries', 'Milk, eggs, bread, and vegetables', 0, 'high', 'a0', unixepoch(), unixepoch()),
  ('todo_2', 'user_test_123', 'Pay electricity bill', 'Due by the end of the month', 0, 'high', 'a1', unixepoch(), unixepoch()),
  ('todo_3', 'user_test_123', 'Review project proposal', 'Check the Q2 roadmap document', 1, 'low', 'a2', unixepoch(), unixepoch()),
  ('todo_4', 'user_test_123', 'Call dentist', 'Schedule annual checkup', 0, 'low', 'a3', unixepoch(), unixepoch()),
  ('todo_5', 'user_test_123', 'Fix navigation bug', 'Mobile menu not closing on route change', 0, 'high', 'a4', unixepoch(), unixepoch());

-- Link todos to lists
INSERT INTO todo_lists (todo_id, list_id, created_at) VALUES
  ('todo_1', 'list_2', unixepoch()),  -- Shopping
  ('todo_2', 'list_3', unixepoch()),  -- Bills
  ('todo_3', 'list_4', unixepoch()),  -- Work
  ('todo_4', 'list_1', unixepoch()),  -- TODO
  ('todo_5', 'list_4', unixepoch());  -- Work
