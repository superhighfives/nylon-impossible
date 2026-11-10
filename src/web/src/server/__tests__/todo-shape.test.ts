import {
  loadUrlsByTodoId,
  serializeTodo,
  serializeUrl,
} from "@nylon-impossible/shared/serialize";
import { describe, expect, it } from "vitest";
import type { Todo, TodoUrl } from "@/lib/schema";
import type { TodoWithUrls } from "@/types/database";

// getTodos answers with the shared serializers, the same shape the API sends:
// lowercased IDs, and `sticky` alongside `pinned`.

const TODO_ID = "AAAAAAAA-0000-4000-8000-000000000001";
const PARENT_ID = "AAAAAAAA-0000-4000-8000-000000000000";
const URL_ID = "CCCCCCCC-0000-4000-8000-000000000001";
const at = new Date("2026-11-01T09:30:00.000Z");

const todo: Todo = {
  id: TODO_ID,
  userId: "user_ABC",
  parentId: PARENT_ID,
  listId: "list-today",
  listEnteredAt: at,
  title: "Water the plants",
  notes: null,
  completed: true,
  completedAt: at,
  position: "a0",
  dueDate: null,
  recurrence: null,
  pinned: true,
  createdAt: at,
  updatedAt: at,
};

const url: TodoUrl = {
  id: URL_ID,
  todoId: TODO_ID,
  url: "https://example.com",
  title: null,
  description: null,
  siteName: null,
  favicon: null,
  image: null,
  showPreview: false,
  position: "a0",
  fetchStatus: "fetched",
  fetchedAt: at,
  createdAt: at,
  updatedAt: at,
};

describe("getTodos' todo shape", () => {
  it("lowercases IDs and carries sticky alongside pinned", () => {
    const shaped: TodoWithUrls = {
      ...serializeTodo(todo),
      urls: [url].map(serializeUrl),
    };

    expect(shaped.id).toBe(TODO_ID.toLowerCase());
    expect(shaped.parentId).toBe(PARENT_ID.toLowerCase());
    expect(shaped.userId).toBe("user_ABC");
    expect(shaped.pinned).toBe(true);
    expect(shaped.sticky).toBe(true);
    expect(shaped.completedAt).toBe(at.toISOString());
    expect(shaped.urls[0].id).toBe(URL_ID.toLowerCase());
    expect(shaped.urls[0].todoId).toBe(TODO_ID.toLowerCase());
    expect(shaped.urls[0].showPreview).toBe(false);
  });

  it("groups links under the lowercased todo ID, in position order", async () => {
    const rows = [
      { ...url, id: "u1", position: "a0" },
      { ...url, id: "u2", position: "a1" },
      { ...url, id: "u3", todoId: "other", position: "a0" },
    ];
    const queried: unknown[] = [];
    // Just enough of drizzle's select chain to hand back the rows.
    const db = {
      select: () => ({
        from: () => ({
          where: (cond: unknown) => {
            queried.push(cond);
            return { orderBy: async () => rows };
          },
        }),
      }),
    } as unknown as Parameters<typeof loadUrlsByTodoId>[0];

    const byTodo = await loadUrlsByTodoId(db, [TODO_ID, "other"]);
    expect(queried).toHaveLength(1);
    expect(byTodo.get(TODO_ID.toLowerCase())?.map((u) => u.id)).toEqual([
      "u1",
      "u2",
    ]);
    expect(byTodo.get("other")?.map((u) => u.id)).toEqual(["u3"]);
    expect(byTodo.has(TODO_ID)).toBe(false);
  });

  it("makes no query for no todos", async () => {
    const db = {
      select: () => {
        throw new Error("queried");
      },
    } as unknown as Parameters<typeof loadUrlsByTodoId>[0];
    expect((await loadUrlsByTodoId(db, [])).size).toBe(0);
  });
});
