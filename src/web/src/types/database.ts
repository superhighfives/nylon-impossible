// Re-export Drizzle-inferred types for convenience
export type { Todo, User } from "@/lib/schema";

export interface CreateTodoInput {
  title: string;
  dueDate?: Date;
}

export interface UpdateTodoInput {
  title?: string;
  completed?: boolean;
  position?: string;
  dueDate?: Date | null;
}
