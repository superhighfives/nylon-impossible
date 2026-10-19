#!/usr/bin/env node
// Dump one account's rows (or every account's, with --all) from a D1 database
// still on the pre-reset schema, as JSON that import.mjs turns into SQL for the
// baseline schema. Read-only against the source: it only runs SELECTs.
//
// Usage (from the repo root):
//   node scripts/db-reset/export.mjs \
//     --db nylon-impossible-db -c src/api/wrangler.jsonc --remote \
//     --email you@example.com --out .wrangler/db-reset
//
// Source selection is passed straight through to `wrangler d1 execute`:
//   --remote                      the real (remote) database
//   --local [--persist-to <dir>]  a local miniflare copy
//   --preview                     the binding's preview_database_id
//
// Account selection: --user-id <clerk id>, --email <address>, or --all.
// Writes <out>/export.json.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    db: { type: "string" },
    config: { type: "string", short: "c" },
    remote: { type: "boolean", default: false },
    local: { type: "boolean", default: false },
    preview: { type: "boolean", default: false },
    "persist-to": { type: "string" },
    "user-id": { type: "string" },
    email: { type: "string" },
    all: { type: "boolean", default: false },
    out: { type: "string", default: ".wrangler/db-reset" },
  },
});

function fail(message) {
  console.error(`✘ ${message}`);
  process.exit(1);
}

if (!args.db) fail("--db <database name or binding> is required");
if (!args.config) fail("-c <wrangler config> is required");
if (args.remote === args.local) fail("pass exactly one of --remote / --local");
const selectors = [args["user-id"], args.email, args.all || undefined].filter(
  Boolean,
);
if (selectors.length !== 1) {
  fail("pass exactly one of --user-id, --email or --all");
}

// Values are interpolated into SQL (wrangler d1 execute --command has no bind
// parameters), so only accept shapes that can't break out of a literal.
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
if (args["user-id"] && !/^[A-Za-z0-9_-]+$/.test(args["user-id"])) {
  fail(`--user-id doesn't look like a Clerk id: ${args["user-id"]}`);
}

function query(sql) {
  const wranglerArgs = [
    "wrangler",
    "d1",
    "execute",
    args.db,
    "-c",
    args.config,
    "--json",
    "--command",
    sql,
  ];
  if (args.remote) wranglerArgs.push("--remote");
  if (args.local) wranglerArgs.push("--local");
  if (args.preview) wranglerArgs.push("--preview");
  if (args["persist-to"]) {
    wranglerArgs.push("--persist-to", args["persist-to"]);
  }
  const stdout = execFileSync("npx", wranglerArgs, {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
    // No WRANGLER_LOG override: below "log", wrangler drops the --json output too.
    env: { ...process.env, CI: "true" },
  });
  const parsed = JSON.parse(stdout);
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!first?.success) fail(`query failed: ${sql}\n${stdout}`);
  return first.results ?? [];
}

// Only columns the baseline keeps, plus `lists.kind`/`system_kind` which the
// import needs to remap. Listing them explicitly (not SELECT *) is what drops
// users.location / plan / hide_completed.
const COLUMNS = {
  users: ["id", "email", "theme", "timezone", "created_at", "updated_at"],
  lists: [
    "id",
    "user_id",
    "name",
    "kind",
    "system_kind",
    "position",
    "created_at",
    "updated_at",
  ],
  todos: [
    "id",
    "user_id",
    "parent_id",
    "list_id",
    "list_entered_at",
    "title",
    "completed",
    "completed_at",
    "position",
    "notes",
    "due_date",
    "recurrence",
    "created_at",
    "updated_at",
    "sticky",
  ],
  todo_urls: [
    "id",
    "todo_id",
    "url",
    "title",
    "description",
    "site_name",
    "favicon",
    "image",
    "show_preview",
    "position",
    "fetch_status",
    "fetched_at",
    "created_at",
    "updated_at",
  ],
  gmail_addon_links: ["google_sub", "clerk_user_id", "email", "created_at"],
};

const cols = (table, alias) =>
  COLUMNS[table].map((c) => `${alias}.${c}`).join(", ");

let userFilter;
if (args.all) userFilter = "1 = 1";
else if (args["user-id"]) userFilter = `u.id = ${quote(args["user-id"])}`;
else userFilter = `lower(u.email) = lower(${quote(args.email)})`;

const users = query(
  `SELECT ${cols("users", "u")} FROM users u WHERE ${userFilter} ORDER BY u.created_at`,
);
if (users.length === 0) fail("no matching users in the source database");

const userIds = users.map((u) => quote(u.id)).join(", ");
const lists = query(
  `SELECT ${cols("lists", "l")} FROM lists l WHERE l.user_id IN (${userIds}) ORDER BY l.user_id, l.position`,
);
const todos = query(
  `SELECT ${cols("todos", "t")} FROM todos t WHERE t.user_id IN (${userIds}) ORDER BY t.user_id, t.parent_id IS NOT NULL, t.position`,
);
const todoUrls = query(
  `SELECT ${cols("todo_urls", "x")} FROM todo_urls x JOIN todos t ON t.id = x.todo_id WHERE t.user_id IN (${userIds}) ORDER BY x.todo_id, x.position`,
);
const gmailAddonLinks = query(
  `SELECT ${cols("gmail_addon_links", "g")} FROM gmail_addon_links g WHERE g.clerk_user_id IN (${userIds})`,
);

const outDir = resolve(args.out);
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, "export.json");
writeFileSync(
  outFile,
  `${JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      source: {
        db: args.db,
        config: args.config,
        remote: args.remote,
        preview: args.preview,
      },
      users,
      lists,
      todos,
      todo_urls: todoUrls,
      gmail_addon_links: gmailAddonLinks,
    },
    null,
    2,
  )}\n`,
);

console.log(
  `✓ Exported ${users.length} user(s), ${lists.length} list(s), ${todos.length} todo(s), ` +
    `${todoUrls.length} link(s), ${gmailAddonLinks.length} Gmail link(s) → ${outFile}`,
);
