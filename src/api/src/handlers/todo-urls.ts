import type { Context } from "hono";
import { z } from "zod/v4";
import { and, eq, getDb, todos, todoUrls } from "../lib/db";
import { apiError, apiValidationError, readJsonBody } from "../lib/errors";
import { notifySync } from "../lib/notify-sync";
import type { Env } from "../types";

// A link's menu on the iOS detail sheet: Show as URL and Remove. (Web does
// the same through its own server functions.)

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
