import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TodoWithUrls } from "@/types/database";
import { TodoList } from "../TodoList";

vi.mock("@/hooks/useTodos", () => ({
  STALE_AI_MS: 60_000,
  STALE_RESEARCH_MS: 5 * 60 * 1_000,
  useTodos: vi.fn(),
  useUpdateTodo: vi.fn(),
  useDeleteTodo: vi.fn(),
}));

// TodoList reads the synced hideCompleted preference via useUser (which calls
// Clerk's useAuth); mock it so the component renders without a ClerkProvider.
vi.mock("@/hooks/useUser", () => ({
  useUser: vi.fn(() => ({ data: undefined })),
}));

import { useDeleteTodo, useTodos, useUpdateTodo } from "@/hooks/useTodos";
import { useUser } from "@/hooks/useUser";

function makeTodo(overrides?: Partial<TodoWithUrls>): TodoWithUrls {
  return {
    id: "todo-1",
    userId: "user-1",
    title: "Buy milk",
    notes: null,
    completed: false,
    position: "a0",
    dueDate: null,
    priority: null,
    recurrence: null,
    aiStatus: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    needsInput: false,
    research: null,
    messages: [],
    urls: [],
    ...overrides,
  };
}

function stubUser(hideCompleted?: boolean) {
  vi.mocked(useUser).mockReturnValue({
    data: hideCompleted === undefined ? undefined : { hideCompleted },
  } as unknown as ReturnType<typeof useUser>);
}

function stubMutations() {
  vi.mocked(useUpdateTodo).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateTodo>);
  vi.mocked(useDeleteTodo).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useDeleteTodo>);
}

describe("TodoList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubMutations();
    stubUser();
  });

  it("renders a skeleton while loading", () => {
    vi.mocked(useTodos).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
      isFetching: true,
    } as unknown as ReturnType<typeof useTodos>);

    render(<TodoList />);
    expect(screen.getByLabelText("Loading todos")).toBeInTheDocument();
  });

  it("renders an error state with a working retry button", () => {
    const refetch = vi.fn();
    vi.mocked(useTodos).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("offline"),
      refetch,
      isFetching: false,
    } as unknown as ReturnType<typeof useTodos>);

    render(<TodoList />);
    expect(screen.getByText(/couldn't load todos/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("renders an empty state when there are no todos", () => {
    vi.mocked(useTodos).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    } as unknown as ReturnType<typeof useTodos>);

    render(<TodoList />);
    expect(screen.getByText("Nothing to do yet")).toBeInTheDocument();
  });

  it("renders each todo title when data is present", () => {
    vi.mocked(useTodos).mockReturnValue({
      data: [
        makeTodo({ id: "a", title: "First thing", position: "a0" }),
        makeTodo({ id: "b", title: "Second thing", position: "a1" }),
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    } as unknown as ReturnType<typeof useTodos>);

    render(<TodoList />);
    expect(screen.getByText("First thing")).toBeInTheDocument();
    expect(screen.getByText("Second thing")).toBeInTheDocument();
  });

  it("shows completed todos when hideCompleted is false", () => {
    stubUser(false);
    vi.mocked(useTodos).mockReturnValue({
      data: [
        makeTodo({ id: "a", title: "Active thing", completed: false }),
        makeTodo({ id: "b", title: "Done thing", completed: true }),
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    } as unknown as ReturnType<typeof useTodos>);

    render(<TodoList />);
    expect(screen.getByText("Active thing")).toBeInTheDocument();
    expect(screen.getByText("Done thing")).toBeInTheDocument();
  });

  it("hides completed todos when hideCompleted is true", () => {
    stubUser(true);
    vi.mocked(useTodos).mockReturnValue({
      data: [
        makeTodo({ id: "a", title: "Active thing", completed: false }),
        makeTodo({ id: "b", title: "Done thing", completed: true }),
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    } as unknown as ReturnType<typeof useTodos>);

    render(<TodoList />);
    expect(screen.getByText("Active thing")).toBeInTheDocument();
    expect(screen.queryByText("Done thing")).not.toBeInTheDocument();
  });
});
