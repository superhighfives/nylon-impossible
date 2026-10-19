#!/usr/bin/env node
// Turn export.json (from export.mjs, pre-reset schema) into a SQL file of
// INSERTs for a database created from migrations/0000_baseline.sql. Pure: it
// reads a file and writes a file, and never talks to D1 — apply the output
// with `wrangler d1 execute <db> --file <out>` (see README.md).
//
// Usage:
//   node scripts/db-reset/import.mjs \
//     --in .wrangler/db-reset/export.json \
//     --out .wrangler/db-reset/import.sql \
//     [--include-gmail-links]
//
// Mapping into the baseline:
//   - users: location / plan / hide_completed are already gone (export.mjs
//     never selects them); theme and timezone carry over.
//   - lists: the `completed` system list is dropped; `sometime` becomes
//     `someday` and a system list still named "Sometime" is renamed "Someday".
//     A user missing one of today / thisWeek / someday gets it created.
//   - ids are kept, so every todo keeps its list_id and parent_id. The one
//     exception is a 32-hex dashless id (what migration 0023 seeded before
//     0024 fixed most of them), which is rewritten to the dashed UUID form
//     everywhere it appears — iOS only decodes the dashed form.
//   - a todo whose list didn't survive (pointed at Completed, or at a list
//     that wasn't exported) moves to that user's Today list; a subtask whose
//     parent is missing becomes top-level; links whose todo is missing are
//     skipped. Each of these is reported.
//   - gmail_addon_links are left out unless --include-gmail-links, so the
//     add-on is reconnected once through its "Connect Nylon" card.

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    in: { type: "string", default: ".wrangler/db-reset/export.json" },
    out: { type: "string", default: ".wrangler/db-reset/import.sql" },
    "include-gmail-links": { type: "boolean", default: false },
  },
});

const data = JSON.parse(readFileSync(resolve(args.in), "utf8"));
const warnings = [];
const warn = (message) => warnings.push(message);

const SYSTEM_KINDS = [
  { kind: "today", name: "Today" },
  { kind: "thisWeek", name: "This Week" },
  { kind: "someday", name: "Someday" },
];
const RENAMED_KINDS = { sometime: "someday" };
const DROPPED_KINDS = new Set(["completed"]);

/** Dashless 32-hex → canonical dashed UUID; anything else unchanged. */
function normalizeId(id) {
  if (typeof id === "string" && /^[0-9a-fA-F]{32}$/.test(id)) {
    const h = id.toLowerCase();
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  return id;
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`non-finite number: ${value}`);
    return String(value);
  }
  if (typeof value === "object") return sqlValue(JSON.stringify(value));
  return `'${String(value).replaceAll("'", "''")}'`;
}

const statements = [];
function insert(table, row) {
  const columns = Object.keys(row);
  statements.push(
    `INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(", ")}) VALUES (${columns
      .map((c) => sqlValue(row[c]))
      .join(", ")});`,
  );
}

const now = Math.floor(Date.now() / 1000);

// ── users ────────────────────────────────────────────────────────────────
const userIds = new Set();
for (const u of data.users) {
  userIds.add(u.id);
  insert("users", {
    id: u.id,
    email: u.email,
    theme: u.theme ?? "system",
    timezone: u.timezone ?? "UTC",
    created_at: u.created_at,
    updated_at: u.updated_at,
  });
}

// ── lists ────────────────────────────────────────────────────────────────
const listIds = new Set();
const systemListId = new Map(); // `${userId}:${kind}` → id
let droppedLists = 0;
for (const l of data.lists) {
  if (!userIds.has(l.user_id)) continue;
  let systemKind = l.system_kind ?? null;
  if (systemKind && DROPPED_KINDS.has(systemKind)) {
    droppedLists++;
    continue;
  }
  if (systemKind && RENAMED_KINDS[systemKind]) {
    systemKind = RENAMED_KINDS[systemKind];
  }
  if (systemKind && !SYSTEM_KINDS.some((s) => s.kind === systemKind)) {
    warn(
      `list ${l.id} has unknown system_kind "${systemKind}"; kept as custom`,
    );
    systemKind = null;
  }
  const id = normalizeId(l.id);
  const kind = systemKind ? "system" : "custom";
  const name =
    systemKind === "someday" && l.name === "Sometime" ? "Someday" : l.name;
  if (systemKind) systemListId.set(`${l.user_id}:${systemKind}`, id);
  listIds.add(id);
  insert("lists", {
    id,
    user_id: l.user_id,
    name,
    kind,
    system_kind: systemKind,
    position: l.position,
    created_at: l.created_at,
    updated_at: l.updated_at,
  });
}
for (const userId of userIds) {
  SYSTEM_KINDS.forEach(({ kind, name }, i) => {
    const key = `${userId}:${kind}`;
    if (systemListId.has(key)) return;
    const id = randomUUID();
    warn(`user ${userId} had no ${kind} list; created ${id}`);
    systemListId.set(key, id);
    listIds.add(id);
    insert("lists", {
      id,
      user_id: userId,
      name,
      kind: "system",
      system_kind: kind,
      position: `a${i}`,
      created_at: now,
      updated_at: now,
    });
  });
}

// ── todos (parents before subtasks) ─────────────────────────────────────
const todoIds = new Set();
const topLevel = data.todos.filter((t) => t.parent_id == null);
const subtasks = data.todos.filter((t) => t.parent_id != null);
for (const t of [...topLevel, ...subtasks]) {
  if (!userIds.has(t.user_id)) continue;
  const id = normalizeId(t.id);
  let listId = normalizeId(t.list_id);
  if (!listIds.has(listId)) {
    const today = systemListId.get(`${t.user_id}:today`);
    warn(`todo ${id} pointed at missing list ${t.list_id}; moved to Today`);
    listId = today;
  }
  let parentId = t.parent_id == null ? null : normalizeId(t.parent_id);
  if (parentId && !todoIds.has(parentId)) {
    warn(`todo ${id} had missing parent ${t.parent_id}; made top-level`);
    parentId = null;
  }
  todoIds.add(id);
  insert("todos", {
    id,
    user_id: t.user_id,
    parent_id: parentId,
    list_id: listId,
    list_entered_at: t.list_entered_at ?? t.updated_at ?? now,
    title: t.title,
    completed: t.completed ? 1 : 0,
    completed_at: t.completed_at ?? null,
    position: t.position,
    notes: t.notes ?? null,
    due_date: t.due_date ?? null,
    recurrence: t.recurrence ?? null,
    created_at: t.created_at,
    updated_at: t.updated_at,
    sticky: t.sticky ? 1 : 0,
  });
}

// ── todo_urls ─────────────────────────────────────────────────────────────
let urlCount = 0;
for (const x of data.todo_urls) {
  const todoId = normalizeId(x.todo_id);
  if (!todoIds.has(todoId)) {
    warn(`link ${x.id} belongs to missing todo ${x.todo_id}; skipped`);
    continue;
  }
  urlCount++;
  insert("todo_urls", {
    id: normalizeId(x.id),
    todo_id: todoId,
    url: x.url,
    title: x.title ?? null,
    description: x.description ?? null,
    site_name: x.site_name ?? null,
    favicon: x.favicon ?? null,
    image: x.image ?? null,
    show_preview: x.show_preview ? 1 : 0,
    position: x.position,
    fetch_status: x.fetch_status,
    fetched_at: x.fetched_at ?? null,
    created_at: x.created_at,
    updated_at: x.updated_at,
  });
}

// ── gmail_addon_links (opt-in) ───────────────────────────────────────────
let gmailCount = 0;
if (args["include-gmail-links"]) {
  for (const g of data.gmail_addon_links ?? []) {
    if (!userIds.has(g.clerk_user_id)) continue;
    gmailCount++;
    insert("gmail_addon_links", g);
  }
}

const summary = {
  users: userIds.size,
  lists: listIds.size,
  droppedCompletedLists: droppedLists,
  todos: todoIds.size,
  todoUrls: urlCount,
  gmailAddonLinks: gmailCount,
};

const header = [
  "-- Generated by scripts/db-reset/import.mjs. Apply to a database created",
  "-- from migrations/0000_baseline.sql (and nothing else).",
  `-- Source export: ${data.exportedAt ?? "unknown"}`,
  `-- Expect: ${JSON.stringify(summary)}`,
  ...warnings.map((w) => `-- warning: ${w}`),
  "",
];
const outFile = resolve(args.out);
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${[...header, ...statements].join("\n")}\n`);

for (const w of warnings) console.warn(`! ${w}`);
console.log(`✓ Wrote ${statements.length} statements → ${outFile}`);
console.log(`  ${JSON.stringify(summary)}`);
