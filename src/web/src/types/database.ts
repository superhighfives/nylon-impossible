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

/** Research status */
export type ResearchStatus = "pending" | "completed" | "failed";

/** Research type */
export type ResearchType = "general" | "location";

/** Serialized research data from the API */
export interface SerializedResearch {
  id: string;
  status: ResearchStatus;
  researchType: ResearchType;
  summary: string | null;
  researchedAt: string | null;
  createdAt: string;
}

/** Serialized URL metadata from the API */
export interface SerializedTodoUrl {
  id: string;
  todoId: string;
  researchId: string | null;
  url: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
  favicon: string | null;
  image: string | null;
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
  research: SerializedResearch | null;
  urls: SerializedTodoUrl[];
}
