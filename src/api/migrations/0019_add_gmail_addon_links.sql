-- Links a Google identity (from the Gmail side-panel add-on) to a Nylon Clerk
-- user. The add-on runs as a Google identity; card actions look up the matching
-- Clerk user_id here so they can reuse the same create/list/update code paths
-- as the REST API. Keyed on the Google `sub` (stable per-user). The verified
-- email is kept for the auto-link fast path and for support/debugging.
-- Deleting a user cascades their link away (ON DELETE CASCADE).

CREATE TABLE gmail_addon_links (
  google_sub TEXT PRIMARY KEY NOT NULL,
  clerk_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_gmail_addon_links_clerk_user ON gmail_addon_links(clerk_user_id);
