import type {
  SerializedList,
  SerializedTodoUrl,
  TodoWithUrls,
} from "@/types/database";

export function makeTodo(overrides: Partial<TodoWithUrls> = {}): TodoWithUrls {
  return {
    id: "todo-1",
    userId: "user-1",
    parentId: null,
    listId: "list-today",
    title: "Water the plants",
    notes: null,
    completed: false,
    completedAt: null,
    position: "a0",
    dueDate: null,
    recurrence: null,
    pinned: false,
    createdAt: "2026-10-12T10:00:00.000Z",
    updatedAt: "2026-10-12T10:00:00.000Z",
    urls: [],
    ...overrides,
  };
}

export function makeUrl(
  overrides: Partial<SerializedTodoUrl> = {},
): SerializedTodoUrl {
  return {
    id: "url-1",
    todoId: "todo-1",
    url: "https://www.visitlisboa.com/tram-28",
    title: "Tram 28 — the complete guide",
    description: null,
    siteName: null,
    favicon: null,
    image: null,
    showPreview: true,
    position: "a0",
    fetchStatus: "fetched",
    fetchedAt: null,
    createdAt: "2026-10-12T10:00:00.000Z",
    updatedAt: "2026-10-12T10:00:00.000Z",
    ...overrides,
  };
}

export function makeList(
  id: string,
  name: string,
  systemKind: SerializedList["systemKind"],
  position = "a0",
): SerializedList {
  return {
    id,
    userId: "user-1",
    name,
    kind: systemKind ? "system" : "custom",
    systemKind,
    position,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

/** Sunday 18 October 2026, mid-morning in Los Angeles. */
export const NOW = new Date("2026-10-18T17:00:00.000Z");
export const TZ = "America/Los_Angeles";
/** A due day `n` days from NOW's calendar day, in stored (UTC-midnight) form. */
export const dueIn = (n: number) =>
  new Date(Date.UTC(2026, 9, 18 + n)).toISOString();
