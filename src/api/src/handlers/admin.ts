import type { Context } from "hono";
import { z } from "zod/v4";
import {
  count,
  desc,
  eq,
  getDb,
  lt,
  sql,
  todoMessages,
  todoResearch,
  todos,
  users,
} from "../lib/db";
import { deleteUserCascade } from "../lib/delete-user";
import { apiError, apiValidationError, readJsonBody } from "../lib/errors";
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
      plan: users.plan,
      aiEnabled: users.aiEnabled,
      createdAt: users.createdAt,
      todoCount: sql<number>`(SELECT COUNT(*) FROM ${todos} WHERE ${todos.userId} = ${users.id})`,
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
      plan: u.plan,
      aiEnabled: u.aiEnabled,
      todoCount: Number(u.todoCount),
      createdAt: u.createdAt.toISOString(),
    })),
    nextCursor,
  });
}

// GET /admin/users/:id
export async function getUser(c: Context<Env>) {
  const id = c.req.param("id");
  if (!id) return apiError(c, "user_id_required");
  const db = getDb(c.env.DB);

  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) return apiError(c, "user_not_found");

  const [todoCountRow] = await db
    .select({ value: count() })
    .from(todos)
    .where(eq(todos.userId, id));

  const [messageCountRow] = await db
    .select({ value: count() })
    .from(todoMessages)
    .innerJoin(todos, eq(todoMessages.todoId, todos.id))
    .where(eq(todos.userId, id));

  const [researchCountRow] = await db
    .select({ value: count() })
    .from(todoResearch)
    .innerJoin(todos, eq(todoResearch.todoId, todos.id))
    .where(eq(todos.userId, id));

  const lastTodo = await db
    .select({ updatedAt: todos.updatedAt })
    .from(todos)
    .where(eq(todos.userId, id))
    .orderBy(desc(todos.updatedAt))
    .limit(1)
    .then((rows) => rows[0]);

  return c.json({
    id: user.id,
    email: user.email,
    plan: user.plan,
    aiEnabled: user.aiEnabled,
    location: user.location,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    diagnostics: {
      todoCount: todoCountRow?.value ?? 0,
      messageCount: messageCountRow?.value ?? 0,
      researchCount: researchCountRow?.value ?? 0,
      lastTodoUpdatedAt: lastTodo?.updatedAt.toISOString() ?? null,
    },
  });
}

const updatePlanSchema = z.object({
  plan: z.enum(["free", "pro"]),
});

// PATCH /admin/users/:id/plan
export async function updateUserPlan(c: Context<Env>) {
  const id = c.req.param("id");
  if (!id) return apiError(c, "user_id_required");
  const json = await readJsonBody(c);
  if (!json.ok) return json.response;
  const parsed = updatePlanSchema.safeParse(json.body);
  if (!parsed.success) return apiValidationError(c, parsed.error);

  const db = getDb(c.env.DB);
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!existing) return apiError(c, "user_not_found");

  await db
    .update(users)
    .set({ plan: parsed.data.plan, updatedAt: new Date() })
    .where(eq(users.id, id));

  return c.json({ id, plan: parsed.data.plan });
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
