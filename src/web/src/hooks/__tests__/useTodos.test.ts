import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useCreateTodo,
  useDeleteTodo,
  useTodos,
  useUpdateTodo,
} from "../useTodos";
import type { TodoWithUrls } from "@/types/database";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/server/todos", () => ({
  getTodos: vi.fn(),
  createTodo: vi.fn(),
  updateTodo: vi.fn(),
  deleteTodo: vi.fn(),
}));

vi.mock("@/hooks/useWebSocket", () => ({
  useWebSocketSync: () => ({ notifyChanged: vi.fn() }),
}));

vi.mock("@clerk/tanstack-react-start", () => ({
  useAuth: () => ({ getToken: vi.fn().mockResolvedValue("test-token") }),
}));

// ---------------------------------------------------------------------------
// Typed access to mocked server functions
// ---------------------------------------------------------------------------

import * as serverTodos from "@/server/todos";

const mockGetTodos = vi.mocked(serverTodos.getTodos);
const mockCreateTodo = vi.mocked(serverTodos.createTodo);
const mockUpdateTodo = vi.mocked(serverTodos.updateTodo);
const mockDeleteTodo = vi.mocked(serverTodos.deleteTodo);

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeTodo(overrides?: Partial<TodoWithUrls>): TodoWithUrls {
  return {
    id: "todo-1",
    userId: "user-1",
    title: "Buy milk",
    description: null,
    completed: false,
    position: "a0",
    dueDate: null,
    priority: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    urls: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test wrapper providing a fresh QueryClient per test
// ---------------------------------------------------------------------------

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  }

  return { queryClient, Wrapper };
}

// ---------------------------------------------------------------------------
// useTodos
// ---------------------------------------------------------------------------

describe("useTodos", () => {
  it("fetches todos and returns them", async () => {
    const todos = [makeTodo(), makeTodo({ id: "todo-2", title: "Call mom" })];
    mockGetTodos.mockResolvedValue(todos);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useTodos(), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data![0].title).toBe("Buy milk");
  });

  it("exposes loading state while fetching", () => {
    mockGetTodos.mockImplementation(() => new Promise(() => {})); // never resolves

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useTodos(), { wrapper: Wrapper });

    expect(result.current.isPending).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// useCreateTodo
// ---------------------------------------------------------------------------

describe("useCreateTodo", () => {
  beforeEach(() => {
    mockGetTodos.mockResolvedValue([]);
  });

  it("calls createTodo server function with the provided input", async () => {
    const newTodo = makeTodo({ id: "todo-new", title: "New task" });
    mockCreateTodo.mockResolvedValue(newTodo as never);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCreateTodo(), { wrapper: Wrapper });

    result.current.mutate({ title: "New task" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockCreateTodo).toHaveBeenCalledWith({
      data: { title: "New task" },
    });
  });
});

// ---------------------------------------------------------------------------
// useUpdateTodo – optimistic updates
// ---------------------------------------------------------------------------

describe("useUpdateTodo", () => {
  const TODO_QUERY_KEY = ["todos"];

  function seedQueryClient(
    queryClient: QueryClient,
    todos: TodoWithUrls[],
  ): void {
    queryClient.setQueryData(TODO_QUERY_KEY, todos);
  }

  it("optimistically updates the matching todo before the server responds", async () => {
    // Server response resolves after we inspect the optimistic state
    let resolveUpdate!: (value: TodoWithUrls) => void;
    const serverPromise = new Promise<TodoWithUrls>((res) => {
      resolveUpdate = res;
    });
    mockUpdateTodo.mockReturnValue(serverPromise as never);

    const initialTodo = makeTodo();
    const { queryClient, Wrapper } = createWrapper();
    seedQueryClient(queryClient, [initialTodo]);

    const { result } = renderHook(() => useUpdateTodo(), { wrapper: Wrapper });

    result.current.mutate({
      id: "todo-1",
      input: { title: "Updated title" },
    });

    // Optimistic cache update should be visible immediately
    await waitFor(() => {
      const cached = queryClient.getQueryData<TodoWithUrls[]>(TODO_QUERY_KEY);
      expect(cached?.[0]?.title).toBe("Updated title");
    });

    // Let the mutation settle
    resolveUpdate(makeTodo({ title: "Updated title" }));
  });

  it("rolls back to the snapshot when the mutation errors", async () => {
    mockUpdateTodo.mockRejectedValue(new Error("Server error"));

    const initialTodo = makeTodo({ title: "Original title" });
    const { queryClient, Wrapper } = createWrapper();
    seedQueryClient(queryClient, [initialTodo]);

    const { result } = renderHook(() => useUpdateTodo(), { wrapper: Wrapper });

    result.current.mutate({
      id: "todo-1",
      input: { title: "Should be rolled back" },
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const cached = queryClient.getQueryData<TodoWithUrls[]>(TODO_QUERY_KEY);
    expect(cached?.[0]?.title).toBe("Original title");
  });

  it("does not mutate todos that don't match the id", async () => {
    mockUpdateTodo.mockResolvedValue(makeTodo() as never);

    const todos = [
      makeTodo({ id: "todo-1", title: "First" }),
      makeTodo({ id: "todo-2", title: "Second" }),
    ];
    const { queryClient, Wrapper } = createWrapper();
    seedQueryClient(queryClient, todos);

    const { result } = renderHook(() => useUpdateTodo(), { wrapper: Wrapper });

    result.current.mutate({ id: "todo-1", input: { title: "First Updated" } });

    await waitFor(() => {
      const cached = queryClient.getQueryData<TodoWithUrls[]>(TODO_QUERY_KEY);
      expect(cached?.[0]?.title).toBe("First Updated");
      expect(cached?.[1]?.title).toBe("Second"); // untouched
    });
  });

  it("applies completed flag optimistically", async () => {
    let resolveUpdate!: (v: TodoWithUrls) => void;
    mockUpdateTodo.mockReturnValue(
      new Promise<TodoWithUrls>((res) => {
        resolveUpdate = res;
      }) as never,
    );

    const initialTodo = makeTodo({ completed: false });
    const { queryClient, Wrapper } = createWrapper();
    seedQueryClient(queryClient, [initialTodo]);

    const { result } = renderHook(() => useUpdateTodo(), { wrapper: Wrapper });

    result.current.mutate({ id: "todo-1", input: { completed: true } });

    await waitFor(() => {
      const cached = queryClient.getQueryData<TodoWithUrls[]>(TODO_QUERY_KEY);
      expect(cached?.[0]?.completed).toBe(true);
    });

    resolveUpdate(makeTodo({ completed: true }));
  });
});

// ---------------------------------------------------------------------------
// useDeleteTodo – optimistic removal
// ---------------------------------------------------------------------------

describe("useDeleteTodo", () => {
  const TODO_QUERY_KEY = ["todos"];

  function seedQueryClient(
    queryClient: QueryClient,
    todos: TodoWithUrls[],
  ): void {
    queryClient.setQueryData(TODO_QUERY_KEY, todos);
  }

  it("optimistically removes the todo before the server responds", async () => {
    let resolveDelete!: (v: unknown) => void;
    mockDeleteTodo.mockReturnValue(
      new Promise((res) => {
        resolveDelete = res;
      }) as never,
    );

    const todos = [
      makeTodo({ id: "todo-1", title: "First" }),
      makeTodo({ id: "todo-2", title: "Second" }),
    ];
    const { queryClient, Wrapper } = createWrapper();
    seedQueryClient(queryClient, todos);

    const { result } = renderHook(() => useDeleteTodo(), { wrapper: Wrapper });

    result.current.mutate("todo-1");

    // todo-1 should be removed from cache optimistically
    await waitFor(() => {
      const cached = queryClient.getQueryData<TodoWithUrls[]>(TODO_QUERY_KEY);
      expect(cached).toHaveLength(1);
      expect(cached?.[0]?.id).toBe("todo-2");
    });

    resolveDelete({ success: true });
  });

  it("rolls back the removed todo when the mutation errors", async () => {
    mockDeleteTodo.mockRejectedValue(new Error("Server error"));

    const todos = [
      makeTodo({ id: "todo-1", title: "First" }),
      makeTodo({ id: "todo-2", title: "Second" }),
    ];
    const { queryClient, Wrapper } = createWrapper();
    seedQueryClient(queryClient, todos);

    const { result } = renderHook(() => useDeleteTodo(), { wrapper: Wrapper });

    result.current.mutate("todo-1");

    await waitFor(() => expect(result.current.isError).toBe(true));

    const cached = queryClient.getQueryData<TodoWithUrls[]>(TODO_QUERY_KEY);
    expect(cached).toHaveLength(2);
    expect(cached?.[0]?.id).toBe("todo-1");
  });
});
