import { normalizeLink } from "@nylon-impossible/shared";
import { generateKeyBetween } from "fractional-indexing";
import type { Context } from "hono";
import { z } from "zod/v4";
import { and, desc, eq, getDb, todos, todoUrls } from "../lib/db";
import { apiError, apiValidationError, readJsonBody } from "../lib/errors";
import { notifySync } from "../lib/notify-sync";
import { finishTodoLinks } from "../lib/process-todo";
import type { Env } from "../types";
import { serializeUrl } from "./todos";

// Adding a link from the detail's "Paste a link" field (web and iOS), and a
// link's menu on the iOS detail sheet: Show as URL and Remove. (Web does
// those two through its own server functions.)

const createTodoUrlSchema = z.object({ url: z.string().max(2048) });
const updateTodoUrlSchema = z.object({ showPreview: z.boolean() });

/** The link, if it belongs to this todo and the todo to this user. */
async function findOwnedUrl(c: Context<Env>) {
  const todoId = c.req.param("id");
  const urlId = c.req.param("urlId");
  if (!todoId || !urlId) return null;
  const db = getDb(c.env.DB);
  const [row] = await db
    .select({ id: todoUrls.id, todoId: todoUrls.todoId })
    .from(todoUrls)
    .innerJoin(todos, eq(todoUrls.todoId, todos.id))
    .where(
      and(
        eq(todoUrls.id, urlId),
        eq(todoUrls.todoId, todoId),
        eq(todos.userId, c.get("userId")),
      ),
    );
  return row ?? null;
}

/** Bump the parent so other clients pull the change on their next sync. */
async function touchTodo(c: Context<Env>, todoId: string) {
  const db = getDb(c.env.DB);
  await db
    .update(todos)
    .set({ updatedAt: new Date() })
    .where(eq(todos.id, todoId));
  await notifySync(c.env, c.get("userId"));
}

// POST /todos/:id/urls - Add a link to a todo, after its others. Its title
// is fetched in the background, the same way smart-create's links are.
export async function createTodoUrl(c: Context<Env>) {
  const json = await readJsonBody(c);
  if (!json.ok) return json.response;
  const parsed = createTodoUrlSchema.safeParse(json.body);
  if (!parsed.success) return apiValidationError(c, parsed.error);
  const href = normalizeLink(parsed.data.url);
  if (!href) return apiError(c, "invalid_url");

  const todoId = c.req.param("id");
  const userId = c.get("userId");
  const db = getDb(c.env.DB);
  const [todo] = todoId
    ? await db
        .select({ id: todos.id })
        .from(todos)
        .where(and(eq(todos.id, todoId), eq(todos.userId, userId)))
    : [];
  if (!todo) return apiError(c, "todo_not_found");

  const [last] = await db
    .select({ position: todoUrls.position })
    .from(todoUrls)
    .where(eq(todoUrls.todoId, todo.id))
    .orderBy(desc(todoUrls.position))
    .limit(1);
  const now = new Date();
  const [created] = await db
    .insert(todoUrls)
    .values({
      id: crypto.randomUUID(),
      todoId: todo.id,
      url: href,
      position: generateKeyBetween(last?.position ?? null, null),
      fetchStatus: "pending",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await touchTodo(c, todo.id);
  c.executionCtx.waitUntil(
    finishTodoLinks(db, c.env, userId, [
      { id: created.id, url: created.url, todoId: todo.id },
    ]),
  );
  return c.json(serializeUrl(created), 201);
}

// PATCH /todos/:id/urls/:urlId - Show a link as its preview or its bare URL
export async function updateTodoUrl(c: Context<Env>) {
  const json = await readJsonBody(c);
  if (!json.ok) return json.response;
  const parsed = updateTodoUrlSchema.safeParse(json.body);
  if (!parsed.success) return apiValidationError(c, parsed.error);

  const url = await findOwnedUrl(c);
  if (!url) return apiError(c, "link_not_found");

  const db = getDb(c.env.DB);
  await db
    .update(todoUrls)
    .set({ showPreview: parsed.data.showPreview, updatedAt: new Date() })
    .where(eq(todoUrls.id, url.id));
  await touchTodo(c, url.todoId);
  return c.json({ success: true });
}

// DELETE /todos/:id/urls/:urlId - Remove a link from a todo
export async function deleteTodoUrl(c: Context<Env>) {
  const url = await findOwnedUrl(c);
  if (!url) return apiError(c, "link_not_found");

  const db = getDb(c.env.DB);
  await db.delete(todoUrls).where(eq(todoUrls.id, url.id));
  await touchTodo(c, url.todoId);
  return c.json({ success: true });
}
