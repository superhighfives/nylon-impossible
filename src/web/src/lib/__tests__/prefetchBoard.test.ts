import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeList, makeTodo } from "@/components/phone/__tests__/fixtures";
import { Route } from "@/routes/_board";
import { getLists } from "@/server/lists";
import { getTodos } from "@/server/todos";

vi.mock("@/server/lists", () => ({
  getLists: vi.fn(),
  createList: vi.fn(),
  updateList: vi.fn(),
  deleteList: vi.fn(),
}));
vi.mock("@/server/todos", () => ({
  getTodos: vi.fn(),
  createTodo: vi.fn(),
  updateTodo: vi.fn(),
  deleteTodo: vi.fn(),
  deleteTodoUrl: vi.fn(),
  updateTodoUrlPreview: vi.fn(),
}));

const lists = [makeList("list-today", "Today", "today", "a0")];
const todos = [makeTodo({ id: "t1", title: "Buy milk", listId: "list-today" })];

/** Runs the `_board` route's loader, as the server does before it renders. */
async function load(queryClient: QueryClient) {
  const loader = Route.options.loader as unknown as (ctx: {
    context: { queryClient: QueryClient };
  }) => Promise<void>;
  await loader({ context: { queryClient } });
}

beforeEach(() => {
  vi.mocked(getLists).mockReset().mockResolvedValue(lists);
  vi.mocked(getTodos).mockReset().mockResolvedValue(todos);
});

describe("the board's loader", () => {
  it("puts your lists and todos in the cache, so the server draws the board", async () => {
    const queryClient = new QueryClient();
    await load(queryClient);
    expect(queryClient.getQueryData(["lists"])).toEqual(lists);
    expect(queryClient.getQueryData(["todos"])).toEqual(todos);
  });

  it("doesn't throw when signed out, and leaves nothing in the cache", async () => {
    vi.mocked(getLists).mockRejectedValue(new Error("Unauthorized"));
    vi.mocked(getTodos).mockRejectedValue(new Error("Unauthorized"));
    const queryClient = new QueryClient();
    await expect(load(queryClient)).resolves.toBeUndefined();
    // Asked once each: a retry would hold up the page.
    expect(getLists).toHaveBeenCalledTimes(1);
    expect(getTodos).toHaveBeenCalledTimes(1);
    // The failure doesn't reach the client as the queries' state: the page
    // renders as it did with no data, and the hooks fetch again.
    expect(queryClient.getQueryCache().getAll()).toEqual([]);
  });

  it("keeps what loaded when the other fetch fails", async () => {
    vi.mocked(getTodos).mockRejectedValue(new Error("Something went wrong"));
    const queryClient = new QueryClient();
    await load(queryClient);
    expect(queryClient.getQueryData(["lists"])).toEqual(lists);
    expect(queryClient.getQueryState(["todos"])).toBeUndefined();
  });

  it("fetches nothing when the cache already has both", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["lists"], lists);
    queryClient.setQueryData(["todos"], todos);
    await load(queryClient);
    expect(getLists).not.toHaveBeenCalled();
    expect(getTodos).not.toHaveBeenCalled();
  });
});
