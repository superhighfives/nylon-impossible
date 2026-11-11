// Re-export Drizzle-inferred types for convenience
export type {
  Recurrence,
  RecurrenceFrequency,
  Todo,
  TodoUrl,
  User,
} from "@/lib/schema";

import type { BoardTimeKind } from "@nylon-impossible/shared";
import type {
  SerializedTodo,
  SerializedTodoUrl as SharedSerializedTodoUrl,
} from "@nylon-impossible/shared/serialize";
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
  pinned?: boolean;
  listId?: string;
}

export interface CreateListInput {
  name: string;
  position?: string;
}

export interface UpdateListInput {
  name?: string;
  position?: string;
}

/** A list (Today/This week/Someday, or a custom list) as returned by the server. */
export interface SerializedList {
  id: string;
  userId: string;
  name: string;
  kind: "system" | "custom";
  systemKind: BoardTimeKind | null;
  position: string;
  createdAt: string;
  updatedAt: string;
}

/** Fetch status for URL metadata */
export type FetchStatus = "pending" | "fetched" | "failed";

/** Serialized URL metadata from the API (the shared `serializeUrl`). */
export type SerializedTodoUrl = SharedSerializedTodoUrl;

/** A todo with its associated URLs, as `getTodos` returns it. */
export type TodoWithUrls = SerializedTodo & { urls: SerializedTodoUrl[] };
