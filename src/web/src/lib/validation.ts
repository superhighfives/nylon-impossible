import { z } from "zod";

export const recurrenceSchema = z.object({
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
});

export const createTodoSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  notes: z.string().max(10000).nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  priority: z.enum(["high", "low"]).nullable().optional(),
  recurrence: recurrenceSchema.nullable().optional(),
});

export const updateTodoSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  notes: z.string().max(10000).nullable().optional(),
  completed: z.boolean().optional(),
  position: z.string().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  priority: z.enum(["high", "low"]).nullable().optional(),
  recurrence: recurrenceSchema.nullable().optional(),
  // Only sent to undo a completed repeat (cleared to null). Normal completions
  // are stamped server-side, not by the client.
  completedAt: z.coerce.date().nullable().optional(),
});
