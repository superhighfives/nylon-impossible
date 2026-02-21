import { z } from "zod/v4";
import { getDb, todos, eq, and, gt } from "../lib/db";
import { json, error } from "../lib/response";
import type { Env, AuthenticatedRequest } from "../types";

// Sync request schema
const syncRequestSchema = z.object({
  lastSyncedAt: z.coerce.date().nullable(),
  changes: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string().min(1).max(500).optional(),
      completed: z.boolean().optional(),
      updatedAt: z.coerce.date(),
      deleted: z.boolean().optional(),
    })
  ),
});

interface SyncConflict {
  id: string;
  resolution: "local" | "remote";
  localUpdatedAt: Date;
  remoteUpdatedAt: Date;
}

// POST /todos/sync - Bidirectional sync
export async function syncTodos(
  req: AuthenticatedRequest,
  env: Env
): Promise<Response> {
  const body = await req.json();
  const parsed = syncRequestSchema.safeParse(body);

  if (!parsed.success) {
    return error(parsed.error.message);
  }

  const { lastSyncedAt, changes } = parsed.data;
  const db = getDb(env.DB);
  const conflicts: SyncConflict[] = [];
  const syncedAt = new Date();

  // 1. Apply client changes (with conflict resolution)
  for (const change of changes) {
    const [existing] = await db
      .select()
      .from(todos)
      .where(and(eq(todos.id, change.id), eq(todos.userId, req.userId)));

    if (change.deleted) {
      // Delete if exists and owned by user
      if (existing) {
        // Last write wins for deletes too
        if (change.updatedAt >= existing.updatedAt) {
          await db.delete(todos).where(eq(todos.id, change.id));
        } else {
          conflicts.push({
            id: change.id,
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
            completed: change.completed ?? existing.completed,
            updatedAt: change.updatedAt,
          })
          .where(eq(todos.id, change.id));
      } else {
        conflicts.push({
          id: change.id,
          resolution: "remote",
          localUpdatedAt: change.updatedAt,
          remoteUpdatedAt: existing.updatedAt,
        });
      }
    } else {
      // Create new
      if (change.title) {
        await db.insert(todos).values({
          id: change.id,
          userId: req.userId,
          title: change.title,
          completed: change.completed ?? false,
          createdAt: change.updatedAt,
          updatedAt: change.updatedAt,
        });
      }
    }
  }

  // 2. Fetch all todos updated since lastSyncedAt (or all if first sync)
  let serverTodos;
  if (lastSyncedAt) {
    serverTodos = await db
      .select()
      .from(todos)
      .where(and(eq(todos.userId, req.userId), gt(todos.updatedAt, lastSyncedAt)))
      .orderBy(todos.createdAt);
  } else {
    serverTodos = await db
      .select()
      .from(todos)
      .where(eq(todos.userId, req.userId))
      .orderBy(todos.createdAt);
  }

  return json({
    todos: serverTodos,
    syncedAt: syncedAt.toISOString(),
    conflicts,
  });
}
