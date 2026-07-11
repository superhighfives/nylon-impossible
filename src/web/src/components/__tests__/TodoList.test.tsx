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
  useCreateTodo: vi.fn(),
}));

// TodoList reads the synced hideCompleted preference via useUser and toggles it
// via useUpdateUser (both call Clerk's useAuth); mock them so the component
// renders without a ClerkProvider.
vi.mock("@/hooks/useUser", () => ({
  useUser: vi.fn(() => ({ data: undefined })),
  useUpdateUser: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

import {
  useCreateTodo,
  useDeleteTodo,
  useTodos,
  useUpdateTodo,
} from "@/hooks/useTodos";
import { useUpdateUser, useUser } from "@/hooks/useUser";

function makeTodo(overrides?: Partial<TodoWithUrls>): TodoWithUrls {
  return {
    id: "todo-1",
    userId: "user-1",
    parentId: null,
    title: "Buy milk",
    notes: null,
    completed: false,
    completedAt: null,
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
    isLoading: false,
  } as unknown as ReturnType<typeof useUser>);
}

function stubUserLoading() {
  vi.mocked(useUser).mockReturnValue({
    data: undefined,
    isLoading: true,
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
  vi.mocked(useCreateTodo).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useCreateTodo>);
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

  it("shows a collapsed completed accordion with a count when hideCompleted is true", () => {
    stubUser(true);
    vi.mocked(useTodos).mockReturnValue({
      data: [
        makeTodo({ id: "a", title: "Active thing", completed: false }),
        makeTodo({ id: "b", title: "Done one", completed: true }),
        makeTodo({ id: "c", title: "Done two", completed: true }),
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    } as unknown as ReturnType<typeof useTodos>);

    render(<TodoList />);
    const accordion = screen.getByRole("button", { name: /completed/i });
    expect(accordion).toHaveAttribute("aria-expanded", "false");
    expect(accordion).toHaveTextContent("2");
    expect(screen.queryByText("Done one")).not.toBeInTheDocument();
  });

  it("toggles the hideCompleted preference when the accordion is clicked", () => {
    const mutate = vi.fn();
    vi.mocked(useUpdateUser).mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateUser>);
    stubUser(false);
    vi.mocked(useTodos).mockReturnValue({
      data: [makeTodo({ id: "b", title: "Done thing", completed: true })],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    } as unknown as ReturnType<typeof useTodos>);

    render(<TodoList />);
    fireEvent.click(screen.getByRole("button", { name: /completed/i }));
    expect(mutate).toHaveBeenCalledWith(
      { hideCompleted: true },
      expect.anything(),
    );
  });

  it("does not flash completed todos while the hideCompleted preference is loading", () => {
    stubUserLoading();
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
    // Incomplete todos render immediately, but the completed section stays out
    // of the DOM until the preference resolves so it can't flash open.
    expect(screen.getByText("Active thing")).toBeInTheDocument();
    expect(screen.queryByText("Done thing")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /completed/i }),
    ).not.toBeInTheDocument();
  });

  it("renders no completed accordion when there are no completed todos", () => {
    stubUser(false);
    vi.mocked(useTodos).mockReturnValue({
      data: [makeTodo({ id: "a", title: "Active thing", completed: false })],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    } as unknown as ReturnType<typeof useTodos>);

    render(<TodoList />);
    expect(
      screen.queryByRole("button", { name: /completed/i }),
    ).not.toBeInTheDocument();
  });
});
