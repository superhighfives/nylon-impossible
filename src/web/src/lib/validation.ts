import { z } from "zod";

export const createTodoSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  description: z.string().max(10000).nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  priority: z.enum(["high", "low"]).nullable().optional(),
});

export const updateTodoSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).nullable().optional(),
  completed: z.boolean().optional(),
  position: z.string().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  priority: z.enum(["high", "low"]).nullable().optional(),
});
