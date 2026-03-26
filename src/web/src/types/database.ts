// Re-export Drizzle-inferred types for convenience
export type { List, Todo, TodoList, TodoUrl, User } from "@/lib/schema";

export interface CreateTodoInput {
  title: string;
  description?: string | null;
  dueDate?: Date | null;
  priority?: "high" | "low" | null;
}

export interface UpdateTodoInput {
  title?: string;
  description?: string | null;
  completed?: boolean;
  position?: string;
  dueDate?: Date | null;
  priority?: "high" | "low" | null;
}

/** Fetch status for URL metadata */
export type FetchStatus = "pending" | "fetched" | "failed";

/** AI processing status for todos */
export type AiStatus = "pending" | "processing" | "complete" | "failed";

/** Serialized URL metadata from the API */
export interface SerializedTodoUrl {
  id: string;
  todoId: string;
  url: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
  favicon: string | null;
  position: string;
  fetchStatus: FetchStatus;
  fetchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A todo with its associated URLs */
export interface TodoWithUrls {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  completed: boolean;
  position: string;
  dueDate: string | null;
  priority: "high" | "low" | null;
  aiStatus: AiStatus | null;
  createdAt: string;
  updatedAt: string;
  urls: SerializedTodoUrl[];
}
