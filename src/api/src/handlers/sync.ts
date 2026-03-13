import { createClerkClient } from "@clerk/backend";
import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";
import type { Context } from "hono";
import { z } from "zod/v4";
import {
  and,
  asc,
  eq,
  getDb,
  gt,
  inArray,
  lists,
  type Todo,
  type TodoUrl,
  todos,
  todoUrls,
  users,
} from "../lib/db";
import type { Env } from "../types";

const DEFAULT_LISTS = ["TODO", "Shopping", "Bills", "Work"];

// Sync request schema
const syncRequestSchema = z.object({
  lastSyncedAt: z.union([z.null(), z.coerce.date()]).optional(),
  changes: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string().min(1).max(500).optional(),
      description: z.string().max(10000).nullable().optional(),
      completed: z.boolean().optional(),
      position: z.string().optional(),
      dueDate: z.coerce.date().nullable().optional(),
      priority: z.enum(["high", "low"]).nullable().optional(),
      updatedAt: z.coerce.date(),
      deleted: z.boolean().optional(),
    }),
  ),
});

interface SyncConflict {
  id: string;
  resolution: "local" | "remote";
  localUpdatedAt: Date;
  remoteUpdatedAt: Date;
}

// Serialize a URL with explicit ISO8601 dates and lowercase IDs
function serializeUrl(url: TodoUrl) {
  return {
    id: url.id.toLowerCase(),
    todoId: url.todoId.toLowerCase(),
    url: url.url,
    title: url.title,
    description: url.description,
    siteName: url.siteName,
    favicon: url.favicon,
    position: url.position,
    fetchStatus: url.fetchStatus,
    fetchedAt: url.fetchedAt?.toISOString() ?? null,
    createdAt: url.createdAt.toISOString(),
    updatedAt: url.updatedAt.toISOString(),
  };
}

// Serialize a todo with explicit ISO8601 dates and lowercase ID
function serializeTodo(
  todo: typeof todos.$inferSelect,
  urls: ReturnType<typeof serializeUrl>[] = [],
) {
  return {
    id: todo.id.toLowerCase(),
    userId: todo.userId,
    title: todo.title,
    description: todo.description,
    completed: todo.completed,
    position: todo.position,
    dueDate: todo.dueDate?.toISOString() ?? null,
    priority: todo.priority,
    createdAt: todo.createdAt.toISOString(),
    updatedAt: todo.updatedAt.toISOString(),
    urls,
  };
}

// POST /todos/sync - Bidirectional sync
export async function syncTodos(c: Context<Env>) {
  const body = await c.req.json();
  const parsed = syncRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.message }, 400);
  }

  const { lastSyncedAt, changes } = parsed.data;
  const userId = c.get("userId");
  const db = getDb(c.env.DB);
  const conflicts: SyncConflict[] = [];
  const syncedAt = new Date();

  // Ensure user exists before inserting todos (FK constraint)
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId));

  if (!existingUser) {
    const clerk = createClerkClient({ secretKey: c.env.CLERK_SECRET_KEY });
    const clerkUser = await clerk.users.getUser(userId);
    const email = clerkUser.emailAddresses[0]?.emailAddress ?? "";

    await db.insert(users).values({ id: userId, email }).onConflictDoNothing();

    // Seed default lists for new user
    const positions = generateNKeysBetween(null, null, DEFAULT_LISTS.length);
    const now = new Date();
    await db.insert(lists).values(
      DEFAULT_LISTS.map((name, i) => ({
        id: crypto.randomUUID(),
        userId,
        name,
        position: positions[i],
        createdAt: now,
        updatedAt: now,
      })),
    );
  }

  // 1. Apply client changes (with conflict resolution)
  // Normalize UUIDs to lowercase to match web-generated IDs
  for (const change of changes) {
    const normalizedId = change.id.toLowerCase();

    const [existing] = await db
      .select()
      .from(todos)
      .where(and(eq(todos.id, normalizedId), eq(todos.userId, userId)));

    if (change.deleted) {
      // Delete if exists and owned by user
      if (existing) {
        // Last write wins for deletes too
        if (change.updatedAt >= existing.updatedAt) {
          await db.delete(todos).where(eq(todos.id, normalizedId));
        } else {
          conflicts.push({
            id: normalizedId,
            resolution: "remote",
            localUpdatedAt: change.updatedAt,
            remoteUpdatedAt: existing.updatedAt,
          });
        }
      }
      // If doesn't exist, nothing to delete
    } else if (existing) {
      // Update existing - last write wins
      if (change.updatedAt >= existing.updatedAt) {
        await db
          .update(todos)
          .set({
            title: change.title ?? existing.title,
            description:
              change.description !== undefined
                ? change.description
                : existing.description,
            completed: change.completed ?? existing.completed,
            position: change.position ?? existing.position,
            dueDate:
              change.dueDate !== undefined ? change.dueDate : existing.dueDate,
            priority:
              change.priority !== undefined
                ? change.priority
                : existing.priority,
            updatedAt: change.updatedAt,
          })
          .where(eq(todos.id, normalizedId));
      } else {
        conflicts.push({
          id: normalizedId,
          resolution: "remote",
          localUpdatedAt: change.updatedAt,
          remoteUpdatedAt: existing.updatedAt,
        });
      }
    } else {
      // Create new
      if (change.title) {
        await db.insert(todos).values({
          id: normalizedId,
          userId,
          title: change.title,
          description: change.description ?? null,
          completed: change.completed ?? false,
          position: change.position ?? generateKeyBetween(null, null),
          dueDate: change.dueDate ?? null,
          priority: change.priority ?? null,
          createdAt: change.updatedAt,
          updatedAt: change.updatedAt,
        });
      }
    }
  }

  // 2. Fetch all todos updated since lastSyncedAt (or all if first sync)
  let serverTodos: Todo[];
  if (lastSyncedAt) {
    serverTodos = await db
      .select()
      .from(todos)
      .where(and(eq(todos.userId, userId), gt(todos.updatedAt, lastSyncedAt)))
      .orderBy(todos.createdAt);
  } else {
    serverTodos = await db
      .select()
      .from(todos)
      .where(eq(todos.userId, userId))
      .orderBy(todos.createdAt);
  }

  // 3. Fetch all URLs for the returned todos
  const todoIds = serverTodos.map((t) => t.id);
  let allUrls: TodoUrl[] = [];
  if (todoIds.length > 0) {
    allUrls = await db
      .select()
      .from(todoUrls)
      .where(inArray(todoUrls.todoId, todoIds))
      .orderBy(asc(todoUrls.position));
  }

  // Group URLs by todoId
  const urlsByTodoId = new Map<string, ReturnType<typeof serializeUrl>[]>();
  for (const url of allUrls) {
    const serialized = serializeUrl(url);
    const existing = urlsByTodoId.get(url.todoId) ?? [];
    existing.push(serialized);
    urlsByTodoId.set(url.todoId, existing);
  }

  return c.json({
    todos: serverTodos.map((todo) =>
      serializeTodo(todo, urlsByTodoId.get(todo.id) ?? []),
    ),
    syncedAt: syncedAt.toISOString(),
    conflicts,
  });
}
