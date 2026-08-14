import type { Context } from "hono";
import { z } from "zod/v4";
import { and, count, eq, getDb, lists, todos } from "../lib/db";
import { apiError, apiValidationError, readJsonBody } from "../lib/errors";
import { listIdSchema } from "../lib/list-id";
import { notifySync } from "../lib/notify-sync";
import type { Env } from "../types";

function serializeList(list: typeof lists.$inferSelect) {
  return {
    id: list.id.toLowerCase(),
    userId: list.userId,
    name: list.name,
    kind: list.kind,
    systemKind: list.systemKind,
    position: list.position,
    createdAt: list.createdAt.toISOString(),
    updatedAt: list.updatedAt.toISOString(),
  };
}

// GET /lists - all of the user's lists (system + custom), position order
export async function getLists(c: Context<Env>) {
  const db = getDb(c.env.DB);
  const userId = c.get("userId");

  const userLists = await db
    .select()
    .from(lists)
    .where(eq(lists.userId, userId))
    .orderBy(lists.position);

  return c.json(userLists.map(serializeList));
}

// GET /lists/:id - a single list plus its todo count, for the "this will
// delete N todos" confirmation the client shows before issuing DELETE.
export async function getList(c: Context<Env>) {
  const listId = c.req.param("id");
  if (!listId) {
    return apiError(c, "list_id_required");
  }
  const db = getDb(c.env.DB);
  const userId = c.get("userId");

  const [existing] = await db
    .select()
    .from(lists)
    .where(and(eq(lists.id, listId), eq(lists.userId, userId)));

  if (!existing) {
    return apiError(c, "list_not_found");
  }

  const [{ todoCount }] = await db
    .select({ todoCount: count() })
    .from(todos)
    .where(eq(todos.listId, listId));

  return c.json({ ...serializeList(existing), todoCount });
}

const createListSchema = z.object({
  id: listIdSchema.optional(),
  name: z.string().min(1).max(200),
  position: z.string().optional(),
});

// POST /lists - create a custom list. System lists are only ever provisioned
// at account creation (sync.ts) — a client can never create one.
export async function createList(c: Context<Env>) {
  const json = await readJsonBody(c);
  if (!json.ok) return json.response;
  const parsed = createListSchema.safeParse(json.body);
  if (!parsed.success) {
    return apiValidationError(c, parsed.error);
  }

  const db = getDb(c.env.DB);
  const userId = c.get("userId");
  const id = parsed.data.id ?? crypto.randomUUID();
  const now = new Date();

  await db.insert(lists).values({
    id,
    userId,
    name: parsed.data.name,
    kind: "custom",
    position: parsed.data.position ?? "a0",
    createdAt: now,
    updatedAt: now,
  });

  const [newList] = await db.select().from(lists).where(eq(lists.id, id));

  await notifySync(c.env, userId);

  return c.json(serializeList(newList), 201);
}

const updateListSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  position: z.string().optional(),
});

// PATCH /lists/:id - rename/reposition a custom list. Rejects system lists.
export async function updateList(c: Context<Env>) {
  const listId = c.req.param("id");
  if (!listId) {
    return apiError(c, "list_id_required");
  }
  const json = await readJsonBody(c);
  if (!json.ok) return json.response;
  const parsed = updateListSchema.safeParse(json.body);
  if (!parsed.success) {
    return apiValidationError(c, parsed.error);
  }

  const db = getDb(c.env.DB);
  const userId = c.get("userId");

  const [existing] = await db
    .select()
    .from(lists)
    .where(and(eq(lists.id, listId), eq(lists.userId, userId)));

  if (!existing) {
    return apiError(c, "list_not_found");
  }
  if (existing.kind === "system") {
    return apiError(c, "system_list_immutable");
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.position !== undefined)
    updates.position = parsed.data.position;

  await db.update(lists).set(updates).where(eq(lists.id, listId));

  const [updated] = await db.select().from(lists).where(eq(lists.id, listId));

  await notifySync(c.env, userId);

  return c.json(serializeList(updated));
}

// DELETE /lists/:id - cascade-deletes the list's todos via the FK. Rejects
// system lists. Returns the todo count so the client can show a "this will
// delete N todos" warning before issuing the delete.
export async function deleteList(c: Context<Env>) {
  const listId = c.req.param("id");
  if (!listId) {
    return apiError(c, "list_id_required");
  }
  const db = getDb(c.env.DB);
  const userId = c.get("userId");

  const [existing] = await db
    .select()
    .from(lists)
    .where(and(eq(lists.id, listId), eq(lists.userId, userId)));

  if (!existing) {
    return apiError(c, "list_not_found");
  }
  if (existing.kind === "system") {
    return apiError(c, "system_list_immutable");
  }

  const [{ todoCount }] = await db
    .select({ todoCount: count() })
    .from(todos)
    .where(eq(todos.listId, listId));

  await db.delete(lists).where(eq(lists.id, listId));

  await notifySync(c.env, userId);

  return c.json({ success: true, deletedTodoCount: todoCount });
}
