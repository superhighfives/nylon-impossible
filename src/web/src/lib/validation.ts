import { z } from "zod";

export const createTodoSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  dueDate: z.coerce.date().optional(),
});

export const updateTodoSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  completed: z.boolean().optional(),
  position: z.string().optional(),
  dueDate: z.coerce.date().nullable().optional(),
});
