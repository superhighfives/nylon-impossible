/**
 * Demo data for a signed-in web session: the marketing screenshots
 * (src/marketing/generate.ts) write it into the local D1 before the dev server
 * starts, and the smoke suite (src/web/e2e) writes it into the preview D1 for
 * its own throwaway user. The Clerk Backend API helpers below find, create and
 * delete those users, so the two can't drift apart.
 *
 * It mirrors the iOS app's DEBUG `SampleData` (Views/Shell/ScreenRoute.swift),
 * so the web and iOS screenshots show the same todos in the same lists. Due
 * days are relative to the day the capture runs, so labels read "Today",
 * "Tomorrow", "Fri" and "4 days overdue" rather than drifting into months
 * overdue the way fixed dates did.
 *
 * The SQL is generated rather than checked in because the user id is the
 * Clerk id of whoever signs in, which differs between the CI marketing
 * account, a local developer account and each smoke run's user.
 */

import { createHash } from "node:crypto";

export type SeedListKind = "today" | "thisWeek" | "someday";

interface SeedList {
  key: string;
  name: string;
  systemKind: SeedListKind | null;
}

interface SeedTodo {
  title: string;
  list: string;
  due?: number;
  pinned?: boolean;
  notes?: string;
  repeats?: "daily" | "weekly" | "monthly" | "yearly";
  doneDaysAgo?: number;
  link?: { url: string; title: string; siteName: string };
  subtasks?: { title: string; done: boolean }[];
}

export const SEED_LISTS: SeedList[] = [
  { key: "today", name: "Today", systemKind: "today" },
  { key: "week", name: "This week", systemKind: "thisWeek" },
  { key: "someday", name: "Someday", systemKind: "someday" },
  { key: "groceries", name: "Groceries", systemKind: null },
  { key: "studio", name: "Studio", systemKind: null },
];

export const SEED_TODOS: SeedTodo[] = [
  { title: "Review PR for the sync engine", list: "today", pinned: true },
  { title: "Call Mum about Sunday lunch", list: "today", due: 0 },
  {
    title: "Finish quarterly report",
    list: "today",
    due: 0,
    notes: "Q3 numbers are in the shared sheet. Draft before the 2pm call.",
  },
  { title: "Water the plants", list: "today", due: 0, repeats: "weekly" },

  { title: "Send invoice to Pika", list: "week", due: 1 },
  { title: "Renew passport", list: "week", due: -4 },
  {
    title: "Plan Lisbon trip",
    list: "week",
    due: 4,
    notes:
      "Flights land **Thursday 9:40am**. Ask Rita for the pastelaria list.\n\nBefore we go:\n- check the [tram 28 pass](https://www.visitlisboa.com/tram-28) covers Belém\n- pack the travel adapter",
    link: {
      url: "https://www.visitlisboa.com/tram-28",
      title: "Tram 28 — the complete guide",
      siteName: "Visit Lisboa",
    },
    subtasks: [
      { title: "Book flights", done: true },
      { title: "Find an apartment in Alfama", done: false },
      { title: "Reserve dinner at Taberna", done: false },
      { title: "Buy a travel adapter", done: false },
    ],
  },
  { title: "Book dentist appointment", list: "week" },

  { title: "Repaint the hallway", list: "someday" },
  {
    title: "Learn to make sourdough",
    list: "someday",
    link: {
      url: "https://www.theperfectloaf.com/beginners-sourdough-bread",
      title: "Beginner sourdough bread",
      siteName: "The Perfect Loaf",
    },
  },
  { title: "Read Piranesi", list: "someday" },
  { title: "Fix the bike’s back brake", list: "someday" },

  { title: "Parmesan", list: "groceries" },
  { title: "Coffee beans", list: "groceries" },
  { title: "Sourdough loaf", list: "groceries" },
  { title: "Oat milk", list: "groceries" },
  { title: "Order more vinyl mailers", list: "studio" },
  { title: "Update portfolio site", list: "studio" },
  { title: "Mix the new EP", list: "studio", due: 12 },

  { title: "Email the landlord", list: "today", doneDaysAgo: 0 },
  { title: "Pick up dry cleaning", list: "week", doneDaysAgo: 1 },
  { title: "Lemons", list: "groceries", doneDaysAgo: 1 },
];

/** Fractional-index keys in order: a0…a9, aA…aZ, aa…az. */
const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
function position(index: number): string {
  return `a${DIGITS[index]}`;
}

function sql(value: string | number | null): string {
  if (value === null) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${value.replace(/'/g, "''")}'`;
}

const DAY_S = 86_400;

/** Midnight UTC of `today + days`, in seconds — the stored form of a due day. */
function dueDay(todayMidnight: number, days: number): number {
  return todayMidnight + days * DAY_S;
}

/**
 * SQL that replaces `userId`'s data with the demo set. Safe to re-run: it
 * clears that user's rows first, and any stale row holding the same email
 * under a different id (a previous Clerk instance) so the unique email index
 * can't trip.
 */
export function buildSeedSql(opts: {
  userId: string;
  email: string;
  timeZone: string;
  now?: Date;
  /**
   * Prefix for every row id. The default suits the one marketing account on
   * a local D1; the smoke suite passes one per run, because every preview
   * shares one D1 and a fixed prefix would clear another run's rows. Ids are
   * a UUID hashed from the prefix and the row's name, because the API rejects
   * any other shape in a list id.
   */
  idPrefix?: string;
}): string {
  const now = opts.now ?? new Date();
  const nowS = Math.floor(now.getTime() / 1000);
  // "Today" is the calendar day in the run's zone, stored as that day's UTC
  // midnight like every due day.
  const todayKey = now.toLocaleDateString("en-CA", {
    timeZone: opts.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayMidnight = Math.floor(Date.parse(`${todayKey}T00:00:00Z`) / 1000);
  const createdS = nowS - 6 * DAY_S;
  const prefix = opts.idPrefix ?? "mktg_";
  const ids = new Set<string>();
  const id = (suffix: string) => {
    const hex = createHash("sha256").update(`${prefix}${suffix}`).digest("hex");
    // Version 4 and variant 1 bits, so it passes any UUID check.
    const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
    ids.add(uuid);
    return uuid;
  };
  const user = sql(opts.userId);

  const lines: string[] = [
    "-- Generated by src/shared/src/seed-account.ts. Do not edit.",
    `DELETE FROM users WHERE email = ${sql(opts.email)} AND id != ${user};`,
    `DELETE FROM todo_urls WHERE todo_id IN (SELECT id FROM todos WHERE user_id = ${user});`,
    `DELETE FROM todos WHERE user_id = ${user};`,
    `DELETE FROM lists WHERE user_id = ${user};`,
    // Ids are fixed, so clear any left by a seed for a different account
    // (filled in once every id is known).
    "",
    "",
    "",
    // Pin the timezone the browser runs in, follow the system theme (the
    // capture sets the colour scheme), and clear the last sweep so the
    // overnight note stays out of the shots.
    `INSERT INTO users (id, email, theme, timezone, timezone_auto, last_sweep_at, created_at, updated_at) VALUES (${user}, ${sql(opts.email)}, 'system', ${sql(opts.timeZone)}, 0, NULL, ${createdS}, ${nowS})`,
    "  ON CONFLICT(id) DO UPDATE SET email = excluded.email, theme = 'system', timezone = excluded.timezone, timezone_auto = 0, last_sweep_at = NULL;",
  ];

  for (const [index, list] of SEED_LISTS.entries()) {
    lines.push(
      `INSERT INTO lists (id, user_id, name, kind, system_kind, position, created_at, updated_at) VALUES (${sql(id(`list_${list.key}`))}, ${user}, ${sql(list.name)}, ${sql(list.systemKind ? "system" : "custom")}, ${sql(list.systemKind)}, ${sql(position(index))}, ${createdS}, ${nowS});`,
    );
  }

  const perList = new Map<string, number>();
  for (const [index, todo] of SEED_TODOS.entries()) {
    const n = perList.get(todo.list) ?? 0;
    perList.set(todo.list, n + 1);
    const todoId = id(`todo_${index}`);
    const done = todo.doneDaysAgo !== undefined;
    const doneAt = done ? nowS - (todo.doneDaysAgo ?? 0) * DAY_S - 3600 : null;
    lines.push(
      `INSERT INTO todos (id, user_id, parent_id, list_id, list_entered_at, title, completed, completed_at, position, notes, due_date, recurrence, sticky, created_at, updated_at) VALUES (${[
        sql(todoId),
        user,
        "NULL",
        sql(id(`list_${todo.list}`)),
        nowS,
        sql(todo.title),
        done ? 1 : 0,
        sql(doneAt),
        sql(position(n)),
        sql(todo.notes ?? null),
        sql(todo.due === undefined ? null : dueDay(todayMidnight, todo.due)),
        sql(todo.repeats ? JSON.stringify({ frequency: todo.repeats }) : null),
        todo.pinned ? 1 : 0,
        createdS,
        doneAt ?? nowS,
      ].join(", ")});`,
    );
    if (todo.link) {
      lines.push(
        `INSERT INTO todo_urls (id, todo_id, url, title, site_name, position, fetch_status, fetched_at, created_at, updated_at) VALUES (${[
          sql(id(`url_${index}`)),
          sql(todoId),
          sql(todo.link.url),
          sql(todo.link.title),
          sql(todo.link.siteName),
          sql("a0"),
          sql("fetched"),
          nowS,
          createdS,
          nowS,
        ].join(", ")});`,
      );
    }
    for (const [s, subtask] of (todo.subtasks ?? []).entries()) {
      lines.push(
        `INSERT INTO todos (id, user_id, parent_id, list_id, list_entered_at, title, completed, position, created_at, updated_at) VALUES (${[
          sql(id(`todo_${index}_${s}`)),
          user,
          sql(todoId),
          sql(id(`list_${todo.list}`)),
          nowS,
          sql(subtask.title),
          subtask.done ? 1 : 0,
          sql(position(s)),
          createdS,
          nowS,
        ].join(", ")});`,
      );
    }
  }

  const idList = [...ids].map(sql).join(", ");
  const at = lines.indexOf("");
  lines.splice(
    at,
    3,
    `DELETE FROM todo_urls WHERE id IN (${idList});`,
    `DELETE FROM todos WHERE id IN (${idList});`,
    `DELETE FROM lists WHERE id IN (${idList});`,
  );

  return `${lines.join("\n")}\n`;
}

/** SQL that deletes `userId` and every row that belongs to them. */
export function buildResetSql(userId: string): string {
  const user = sql(userId);
  return [
    `DELETE FROM todo_urls WHERE todo_id IN (SELECT id FROM todos WHERE user_id = ${user});`,
    `DELETE FROM todos WHERE user_id = ${user};`,
    `DELETE FROM lists WHERE user_id = ${user};`,
    `DELETE FROM api_tokens WHERE user_id = ${user};`,
    `DELETE FROM gmail_addon_links WHERE clerk_user_id = ${user};`,
    `DELETE FROM users WHERE id = ${user};`,
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Clerk Backend API
// ---------------------------------------------------------------------------

const CLERK_API = "https://api.clerk.com/v1";

async function clerkFetch(
  secretKey: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const res = await fetch(`${CLERK_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(
      `Clerk ${init.method ?? "GET"} ${path} failed: ${res.status} ${await res.text()}`,
    );
  }
  return res;
}

/** The Clerk user id for `email`, or null if there's no such user. */
export async function findClerkUserId(
  secretKey: string,
  email: string,
): Promise<string | null> {
  const res = await clerkFetch(
    secretKey,
    `/users?email_address=${encodeURIComponent(email)}`,
  );
  const users = (await res.json()) as { id: string }[];
  return users[0]?.id ?? null;
}

/**
 * The Clerk user id for `email`, creating the user if it doesn't exist. Meant
 * for `+clerk_test` addresses on a development instance, which need no inbox.
 */
export async function findOrCreateClerkUser(
  secretKey: string,
  email: string,
): Promise<string> {
  const existing = await findClerkUserId(secretKey, email);
  if (existing) return existing;
  const res = await clerkFetch(secretKey, "/users", {
    method: "POST",
    body: JSON.stringify({
      email_address: [email],
      skip_password_requirement: true,
    }),
  });
  return ((await res.json()) as { id: string }).id;
}

/** Delete a Clerk user. Already gone counts as done. */
export async function deleteClerkUser(
  secretKey: string,
  userId: string,
): Promise<void> {
  await clerkFetch(secretKey, `/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}
