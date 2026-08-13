import { z } from "zod";

export const recurrenceSchema = z.object({
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
});

// List ids come in two shapes: dashed UUIDs from `crypto.randomUUID()` (lists
// created at runtime) and dashless 32-hex from migration 0023's
// `lower(hex(randomblob(16)))` (every pre-existing user's system lists). A
// plain `.uuid()` check rejects the latter, which broke per-column create and
// cross-list drag for migrated accounts.
export const listIdSchema = z
  .string()
  .regex(
    /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})$/i,
    "Invalid list id",
  );

export const createTodoSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  notes: z.string().max(10000).nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  recurrence: recurrenceSchema.nullable().optional(),
  // Parent todo id when creating a subtask; omit/null for a top-level todo.
  parentId: z.string().uuid().nullable().optional(),
  // Explicit fractional-index position. When omitted the server appends to the
  // end of the sibling group; callers pass this to insert elsewhere (e.g. a new
  // subtask at the top of its parent's list).
  position: z.string().optional(),
  // Which list to create into; omit to default to Today.
  listId: listIdSchema.optional(),
});

export const updateTodoSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  notes: z.string().max(10000).nullable().optional(),
  completed: z.boolean().optional(),
  position: z.string().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  recurrence: recurrenceSchema.nullable().optional(),
  // Only sent to undo a completed repeat (cleared to null). Normal completions
  // are stamped server-side, not by the client.
  completedAt: z.coerce.date().nullable().optional(),
  sticky: z.boolean().optional(),
  listId: listIdSchema.optional(),
});

export const updateTodoUrlSchema = z.object({
  id: z.string(),
  showPreview: z.boolean(),
});

export const createListSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  position: z.string().optional(),
});

export const updateListSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  position: z.string().optional(),
});
