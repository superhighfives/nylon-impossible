// Re-export Drizzle-inferred types for convenience
export type {
  Recurrence,
  RecurrenceFrequency,
  Todo,
  TodoUrl,
  User,
} from "@/lib/schema";

import type { Recurrence } from "@/lib/schema";

export interface CreateTodoInput {
  title: string;
  notes?: string | null;
  dueDate?: Date | null;
  recurrence?: Recurrence | null;
  // Parent todo id when creating a subtask; omit/null for a top-level todo.
  parentId?: string | null;
  // Explicit fractional-index position; omit to append to the sibling group.
  position?: string;
  // Which list to create into; omit to default to Today.
  listId?: string;
}

export interface UpdateTodoInput {
  title?: string;
  notes?: string | null;
  completed?: boolean;
  position?: string;
  dueDate?: Date | null;
  recurrence?: Recurrence | null;
  // Set explicitly only to undo a completed repeat (clear it to null). On a
  // normal completion the server stamps this itself.
  completedAt?: Date | null;
  sticky?: boolean;
  listId?: string;
}

/** Which built-in bucket a system list represents. */
export type SystemListKind = "today" | "thisWeek" | "sometime" | "completed";

export interface CreateListInput {
  name: string;
  position?: string;
}

export interface UpdateListInput {
  name?: string;
  position?: string;
}

/** A list (Today/This Week/Sometime, or a custom list) as returned by the server. */
export interface SerializedList {
  id: string;
  userId: string;
  name: string;
  kind: "system" | "custom";
  systemKind: SystemListKind | null;
  position: string;
  createdAt: string;
  updatedAt: string;
}

/** Fetch status for URL metadata */
export type FetchStatus = "pending" | "fetched" | "failed";

/** Serialized URL metadata from the API */
export interface SerializedTodoUrl {
  id: string;
  todoId: string;
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
  listId: string;
  title: string;
  notes: string | null;
  completed: boolean;
  completedAt: string | null;
  position: string;
  dueDate: string | null;
  recurrence: Recurrence | null;
  sticky: boolean;
  createdAt: string;
  updatedAt: string;
  urls: SerializedTodoUrl[];
}
