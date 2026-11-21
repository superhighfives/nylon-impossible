import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ListNotSavedError } from "@/lib/pending-lists";
import { toast } from "@/lib/toast";
import type { SerializedList, TodoWithUrls } from "@/types/database";
import { useCreateList } from "../useLists";
import { useCreateTodo, useSmartCreate, useUpdateTodo } from "../useTodos";

// #783 (NYLON-IMPOSSIBLE-WEB-D): a new list shows straight away under a
// temp- id. An add or move aimed at it before its create returns waits for
// the real id, and never sends the temp- one.

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

vi.mock("@/hooks/useWebSocket", () => ({
  useWebSocketSync: () => ({ notifyChanged: vi.fn() }),
}));

vi.mock("@clerk/tanstack-react-start", () => ({
  useAuth: () => ({ getToken: vi.fn().mockResolvedValue("test-token") }),
}));

import * as serverLists from "@/server/lists";
import * as serverTodos from "@/server/todos";

const mockCreateList = vi.mocked(serverLists.createList);
const mockGetLists = vi.mocked(serverLists.getLists);
const mockCreateTodo = vi.mocked(serverTodos.createTodo);
const mockUpdateTodo = vi.mocked(serverTodos.updateTodo);
const mockGetTodos = vi.mocked(serverTodos.getTodos);

const REAL_ID = "0b1c2d3e-4f50-4617-8293-a4b5c6d7e8f9";

function makeList(overrides?: Partial<SerializedList>): SerializedList {
  return {
    id: REAL_ID,
    userId: "user-1",
    name: "Slow list",
    kind: "custom",
    systemKind: null,
    position: "a1",
    columnHidden: false,
    createdAt: "2026-11-20T00:00:00.000Z",
    updatedAt: "2026-11-20T00:00:00.000Z",
    ...overrides,
  };
}

function makeTodo(overrides?: Partial<TodoWithUrls>): TodoWithUrls {
  return {
    id: "todo-1",
    userId: "user-1",
    parentId: null,
    listId: "list-today",
    title: "Buy milk",
    notes: null,
    completed: false,
    completedAt: null,
    position: "a0",
    dueDate: null,
    recurrence: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    pinned: false,
    sticky: false,
    urls: [],
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(todos: TodoWithUrls[] = []) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData<SerializedList[]>(["lists"], []);
  queryClient.setQueryData<TodoWithUrls[]>(["todos"], todos);
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  }
  const { result } = renderHook(
    () => ({
      createList: useCreateList(),
      smartCreate: useSmartCreate(),
      createTodo: useCreateTodo(),
      updateTodo: useUpdateTodo(),
    }),
    { wrapper: Wrapper },
  );
  return { queryClient, result };
}

/** Start a list create that stays open, and return its optimistic id. */
async function startList(
  queryClient: QueryClient,
  run: () => Promise<unknown>,
): Promise<string> {
  act(() => {
    run().catch(() => {});
  });
  let tempId = "";
  await waitFor(() => {
    tempId =
      queryClient.getQueryData<SerializedList[]>(["lists"])?.[0]?.id ?? "";
    expect(tempId).toMatch(/^temp-/);
  });
  return tempId;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetLists.mockReturnValue(new Promise(() => {}));
  mockGetTodos.mockReturnValue(new Promise(() => {}));
  fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ todos: [makeTodo({ id: "todo-new" })] }), {
        status: 200,
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

function sentListIds(): unknown[] {
  return fetchMock.mock.calls.map(
    ([, init]) => JSON.parse(String((init as RequestInit).body)).listId,
  );
}

describe("adding to a list that's still saving", () => {
  it("waits for the create, then sends the real id", async () => {
    const create = deferred<SerializedList>();
    mockCreateList.mockReturnValue(create.promise);
    const { queryClient, result } = setup();
    const tempId = await startList(queryClient, () =>
      result.current.createList.mutateAsync({ name: "Slow list" }),
    );

    let added: Promise<unknown> = Promise.resolve();
    act(() => {
      added = result.current.smartCreate.mutateAsync({
        text: "Pack the tent",
        listId: tempId,
      });
    });
    // The row shows in the new list straight away; nothing is sent yet.
    await waitFor(() =>
      expect(
        queryClient.getQueryData<TodoWithUrls[]>(["todos"])?.[0]?.listId,
      ).toBe(tempId),
    );
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      create.resolve(makeList());
      await added;
    });
    expect(sentListIds()).toEqual([REAL_ID]);
  });

  // useCreateList's onSuccess moves cached todos from the temp- id to the
  // real one; without it the row drops out of the list until its add returns.
  it("keeps the waiting row in the list once it has its real id", async () => {
    const create = deferred<SerializedList>();
    mockCreateList.mockReturnValue(create.promise);
    // The add stays in flight after the list is saved.
    fetchMock.mockReturnValue(new Promise(() => {}));
    const { queryClient, result } = setup();
    const tempId = await startList(queryClient, () =>
      result.current.createList.mutateAsync({ name: "Slow list" }),
    );
    act(() => {
      result.current.smartCreate
        .mutateAsync({ text: "Pack the tent", listId: tempId })
        .catch(() => {});
    });
    await waitFor(() =>
      expect(
        queryClient.getQueryData<TodoWithUrls[]>(["todos"])?.[0]?.listId,
      ).toBe(tempId),
    );
    await act(async () => {
      create.resolve(makeList());
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(
      queryClient.getQueryData<TodoWithUrls[]>(["todos"])?.[0]?.listId,
    ).toBe(REAL_ID);
  });

  it("sends the real id for a subtask-style create too", async () => {
    const create = deferred<SerializedList>();
    mockCreateList.mockReturnValue(create.promise);
    mockCreateTodo.mockResolvedValue(makeTodo({ listId: REAL_ID }) as never);
    const { queryClient, result } = setup();
    const tempId = await startList(queryClient, () =>
      result.current.createList.mutateAsync({ name: "Slow list" }),
    );
    let added: Promise<unknown> = Promise.resolve();
    act(() => {
      added = result.current.createTodo.mutateAsync({
        title: "Tent pegs",
        listId: tempId,
      });
    });
    await act(async () => {
      create.resolve(makeList());
      await added;
    });
    expect(mockCreateTodo).toHaveBeenCalledWith({
      data: { title: "Tent pegs", listId: REAL_ID },
    });
  });

  it("sends nothing if the create fails, and only the create toasts", async () => {
    const create = deferred<SerializedList>();
    mockCreateList.mockReturnValue(create.promise);
    const error = vi.spyOn(toast, "error");
    const { queryClient, result } = setup();
    const tempId = await startList(queryClient, () =>
      result.current.createList.mutateAsync({ name: "Slow list" }),
    );

    let failure: unknown;
    let added: Promise<unknown> = Promise.resolve();
    act(() => {
      added = result.current.smartCreate
        .mutateAsync({ text: "Pack the tent", listId: tempId })
        .catch((err) => {
          failure = err;
        });
    });
    await act(async () => {
      create.reject(new Error("Request failed (500)"));
      await added;
    });

    expect(fetchMock).not.toHaveBeenCalled();
    // The composer puts the lines back when it sees this, without a toast.
    expect(failure).toBeInstanceOf(ListNotSavedError);
    expect(error.mock.calls.map(([m]) => m)).toEqual([
      "Couldn’t create the list",
    ]);
    await waitFor(() =>
      expect(queryClient.getQueryData<TodoWithUrls[]>(["todos"])).toEqual([]),
    );
    error.mockRestore();
  });
});

describe("moving to a list that's still saving", () => {
  it("waits for the create, then sends the real id", async () => {
    const create = deferred<SerializedList>();
    mockCreateList.mockReturnValue(create.promise);
    mockUpdateTodo.mockResolvedValue(makeTodo({ listId: REAL_ID }) as never);
    const { queryClient, result } = setup([makeTodo()]);
    const tempId = await startList(queryClient, () =>
      result.current.createList.mutateAsync({ name: "Slow list" }),
    );

    let moved: Promise<unknown> = Promise.resolve();
    act(() => {
      moved = result.current.updateTodo.mutateAsync({
        id: "todo-1",
        input: { listId: tempId, position: "a0" },
      });
    });
    await waitFor(() =>
      expect(
        queryClient.getQueryData<TodoWithUrls[]>(["todos"])?.[0]?.listId,
      ).toBe(tempId),
    );
    expect(mockUpdateTodo).not.toHaveBeenCalled();

    await act(async () => {
      create.resolve(makeList());
      await moved;
    });
    expect(mockUpdateTodo).toHaveBeenCalledWith({
      data: { id: "todo-1", input: { listId: REAL_ID, position: "a0" } },
    });
  });

  it("keeps the moved todo in the list once it has its real id", async () => {
    const create = deferred<SerializedList>();
    mockCreateList.mockReturnValue(create.promise);
    // The move stays in flight after the list is saved.
    mockUpdateTodo.mockReturnValue(new Promise(() => {}));
    const { queryClient, result } = setup([makeTodo()]);
    const tempId = await startList(queryClient, () =>
      result.current.createList.mutateAsync({ name: "Slow list" }),
    );
    act(() => {
      result.current.updateTodo
        .mutateAsync({ id: "todo-1", input: { listId: tempId } })
        .catch(() => {});
    });
    await waitFor(() =>
      expect(
        queryClient.getQueryData<TodoWithUrls[]>(["todos"])?.[0]?.listId,
      ).toBe(tempId),
    );
    await act(async () => {
      create.resolve(makeList());
    });
    await waitFor(() => expect(mockUpdateTodo).toHaveBeenCalled());
    expect(
      queryClient.getQueryData<TodoWithUrls[]>(["todos"])?.[0]?.listId,
    ).toBe(REAL_ID);
  });

  it("leaves the todo where it was if the create fails, and only the create toasts", async () => {
    const create = deferred<SerializedList>();
    mockCreateList.mockReturnValue(create.promise);
    const error = vi.spyOn(toast, "error");
    const { queryClient, result } = setup([makeTodo()]);
    const tempId = await startList(queryClient, () =>
      result.current.createList.mutateAsync({ name: "Slow list" }),
    );

    let moved: Promise<unknown> = Promise.resolve();
    act(() => {
      moved = result.current.updateTodo
        .mutateAsync({ id: "todo-1", input: { listId: tempId } })
        .catch(() => {});
    });
    await act(async () => {
      create.reject(new Error("Request failed (500)"));
      await moved;
    });

    expect(mockUpdateTodo).not.toHaveBeenCalled();
    expect(
      queryClient.getQueryData<TodoWithUrls[]>(["todos"])?.[0]?.listId,
    ).toBe("list-today");
    expect(error.mock.calls.map(([m]) => m)).toEqual([
      "Couldn’t create the list",
    ]);
    error.mockRestore();
  });
});
