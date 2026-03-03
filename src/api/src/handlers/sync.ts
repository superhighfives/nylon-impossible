import { createClerkClient } from "@clerk/backend";
import { generateKeyBetween } from "fractional-indexing";
import type { Context } from "hono";
import { z } from "zod/v4";
import { and, eq, getDb, gt, type Todo, todos, users } from "../lib/db";
import type { Env } from "../types";

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

// Serialize a todo with explicit ISO8601 dates and lowercase ID
function serializeTodo(todo: typeof todos.$inferSelect) {
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

  return c.json({
    todos: serverTodos.map(serializeTodo),
    syncedAt: syncedAt.toISOString(),
    conflicts,
  });
}
