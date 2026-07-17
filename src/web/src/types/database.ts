// Re-export Drizzle-inferred types for convenience
export type {
  List,
  Recurrence,
  RecurrenceFrequency,
  Todo,
  TodoList,
  TodoUrl,
  User,
} from "@/lib/schema";

import type { Recurrence } from "@/lib/schema";

export interface CreateTodoInput {
  title: string;
  notes?: string | null;
  dueDate?: Date | null;
  priority?: "high" | "low" | null;
  recurrence?: Recurrence | null;
  // Parent todo id when creating a subtask; omit/null for a top-level todo.
  parentId?: string | null;
  // Explicit fractional-index position; omit to append to the sibling group.
  position?: string;
}

export interface UpdateTodoInput {
  title?: string;
  notes?: string | null;
  completed?: boolean;
  position?: string;
  dueDate?: Date | null;
  priority?: "high" | "low" | null;
  recurrence?: Recurrence | null;
  // Set explicitly only to undo a completed repeat (clear it to null). On a
  // normal completion the server stamps this itself.
  completedAt?: Date | null;
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

/** Serialized conversation message from the API */
export interface SerializedTodoMessage {
  id: string;
  todoId: string;
  role: "assistant" | "user";
  content: string;
  createdAt: string; // ISO
  awaitingReply: boolean;
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
  /** When false, clients render just the raw URL instead of the fetched preview. */
  showPreview: boolean;
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
  parentId: string | null;
  title: string;
  notes: string | null;
  completed: boolean;
  completedAt: string | null;
  position: string;
  dueDate: string | null;
  priority: "high" | "low" | null;
  recurrence: Recurrence | null;
  aiStatus: AiStatus | null;
  needsInput: boolean;
  createdAt: string;
  updatedAt: string;
  research: SerializedResearch | null;
  messages: SerializedTodoMessage[];
  urls: SerializedTodoUrl[];
}
