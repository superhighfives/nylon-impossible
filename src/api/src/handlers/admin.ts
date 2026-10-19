import type { Context } from "hono";
import { desc, eq, getDb, lt, sql, users } from "../lib/db";
import { deleteUserCascade } from "../lib/delete-user";
import { apiError } from "../lib/errors";
import type { Env } from "../types";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function parseCursor(cursor: string | undefined): Date | null {
  if (!cursor) return null;
  const ms = Number(cursor);
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date;
}

// GET /admin/users
export async function listUsers(c: Context<Env>) {
  const cursor = c.req.query("cursor");
  const requestedLimit = Number(c.req.query("limit") ?? DEFAULT_PAGE_SIZE);
  const limit = Math.min(
    Math.max(
      Number.isFinite(requestedLimit) ? requestedLimit : DEFAULT_PAGE_SIZE,
      1,
    ),
    MAX_PAGE_SIZE,
  );

  const db = getDb(c.env.DB);
  const cursorDate = parseCursor(cursor);

  const baseQuery = db
    .select({
      id: users.id,
      email: users.email,
      createdAt: users.createdAt,
      // Columns must be table-qualified: drizzle renders interpolated column
      // refs unqualified, and a bare `id` inside `FROM todos` binds to todos.id
      // (its own PK) instead of the outer users.id — silently counting 0.
      todoCount: sql<number>`(SELECT COUNT(*) FROM todos WHERE todos.user_id = users.id)`,
    })
    .from(users);

  const rows = await (cursorDate
    ? baseQuery.where(lt(users.createdAt, cursorDate))
    : baseQuery
  )
    .orderBy(desc(users.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore
    ? String(page[page.length - 1].createdAt.getTime())
    : null;

  return c.json({
    users: page.map((u) => ({
      id: u.id,
      email: u.email,
      todoCount: Number(u.todoCount),
      createdAt: u.createdAt.toISOString(),
    })),
    nextCursor,
  });
}

// DELETE /admin/users/:id
export async function deleteUserAsAdmin(c: Context<Env>) {
  const id = c.req.param("id");
  if (!id) return apiError(c, "user_id_required");
  const db = getDb(c.env.DB);

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!existing) return apiError(c, "user_not_found");

  await deleteUserCascade(c.env, id, { deleteClerk: true });
  return c.json({ id, deleted: true });
}
