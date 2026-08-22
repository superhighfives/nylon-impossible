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
  ('todo_5', 'user_test_123', 'list_4', 'Fix navigation bug', 'Mobile menu not closing on route change', 0, 'a4', unixepoch(), unixepoch()),
  ('todo_6', 'user_test_123', 'list_1', 'Read this thread on focus', 'Saved from x.com', 0, 'a4', unixepoch(), unixepoch()),
  ('todo_7', 'user_test_123', 'list_1', 'Finish reading article on fractional indexing', NULL, 0, 'a5', unixepoch(), unixepoch()),
  ('todo_8', 'user_test_123', 'list_4', 'Read up on Cloudflare Durable Objects', 'For the queue rework', 0, 'a5', unixepoch(), unixepoch()),
  ('todo_9', 'user_test_123', 'list_1', 'Watch this talk later', NULL, 0, 'a6', unixepoch(), unixepoch());

-- Insert sample todo_urls covering a mix of resource types (social/tweet,
-- article, video, and an unfetched link) so link previews have real data to
-- render against in dev.
INSERT INTO todo_urls (id, todo_id, url, title, description, site_name, favicon, image, show_preview, position, fetch_status, fetched_at, created_at, updated_at) VALUES
  ('todo_url_1', 'todo_6', 'https://x.com/dhh/status/1755654577321156699', 'DHH on X: "Writing is thinking..."', 'Writing is thinking. If you can''t explain it simply, you don''t understand it well enough.', 'x.com', 'https://abs.twimg.com/favicons/twitter.3.ico', NULL, 1, 'a0', 'fetched', unixepoch(), unixepoch(), unixepoch()),
  ('todo_url_2', 'todo_7', 'https://vickiboykis.com/2024/02/06/fractional-indexing/', 'Fractional Indexing', 'A deep dive into how ordering keys work in collaborative apps, and why they beat re-numbering rows on every drag.', 'vickiboykis.com', 'https://vickiboykis.com/favicon.ico', 'https://vickiboykis.com/images/fractional-indexing-og.png', 1, 'a0', 'fetched', unixepoch(), unixepoch(), unixepoch()),
  ('todo_url_3', 'todo_8', 'https://developers.cloudflare.com/durable-objects/', 'Durable Objects · Cloudflare Workers docs', 'Durable Objects provide low-latency coordination and consistent storage for the Workers platform.', 'developers.cloudflare.com', 'https://developers.cloudflare.com/favicon.ico', 'https://developers.cloudflare.com/_astro/durable-objects-og.png', 1, 'a0', 'fetched', unixepoch(), unixepoch(), unixepoch()),
  ('todo_url_4', 'todo_9', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', NULL, NULL, NULL, NULL, NULL, 1, 'a0', 'pending', NULL, unixepoch(), unixepoch());
