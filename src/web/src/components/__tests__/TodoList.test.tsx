import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SerializedList, TodoWithUrls } from "@/types/database";
import { TodoGrid } from "../TodoGrid";

vi.mock("@/hooks/useTodos", () => ({
  STALE_AI_MS: 60_000,
  STALE_RESEARCH_MS: 5 * 60 * 1_000,
  useTodos: vi.fn(),
  useUpdateTodo: vi.fn(),
  useDeleteTodo: vi.fn(),
  useCreateTodo: vi.fn(),
  // TodoGrid renders the floating composer (TodoInput), which smart-creates.
  useSmartCreate: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock("@/hooks/useLists", () => ({
  useLists: vi.fn(),
  useCreateList: vi.fn(),
  useUpdateList: vi.fn(),
  useDeleteList: vi.fn(),
}));

// TodoGrid reads the synced hideCompleted preference via useUser and toggles
// it via useUpdateUser (both call Clerk's useAuth); mock them so the
// component renders without a ClerkProvider.
vi.mock("@/hooks/useUser", () => ({
  useUser: vi.fn(() => ({ data: undefined })),
  useUpdateUser: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

import {
  useCreateList,
  useDeleteList,
  useLists,
  useUpdateList,
} from "@/hooks/useLists";
import {
  useCreateTodo,
  useDeleteTodo,
  useTodos,
  useUpdateTodo,
} from "@/hooks/useTodos";
import { useUpdateUser, useUser } from "@/hooks/useUser";

const TODAY_LIST: SerializedList = {
  id: "list-today",
  userId: "user-1",
  name: "Today",
  kind: "system",
  systemKind: "today",
  position: "a0",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

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
    aiStatus: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    needsInput: false,
    sticky: false,
    research: null,
    messages: [],
    urls: [],
    suggestions: [],
    ...overrides,
  };
}

function stubUser(hideCompleted?: boolean) {
  vi.mocked(useUser).mockReturnValue({
    data: hideCompleted === undefined ? undefined : { hideCompleted },
    isLoading: false,
  } as unknown as ReturnType<typeof useUser>);
}

function stubLists(lists: SerializedList[] = [TODAY_LIST]) {
  vi.mocked(useLists).mockReturnValue({
    data: lists,
    isLoading: false,
  } as unknown as ReturnType<typeof useLists>);
}

function stubTodos(
  data: TodoWithUrls[] | undefined,
  overrides: Partial<ReturnType<typeof useTodos>> = {},
) {
  vi.mocked(useTodos).mockReturnValue({
    data,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
    ...overrides,
  } as unknown as ReturnType<typeof useTodos>);
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
  vi.mocked(useCreateList).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useCreateList>);
  vi.mocked(useUpdateList).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateList>);
  vi.mocked(useDeleteList).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useDeleteList>);
}

describe("TodoGrid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubMutations();
    stubUser();
    stubLists();
  });

  it("renders a skeleton while loading", () => {
    stubTodos(undefined, { isLoading: true, isFetching: true });

    render(<TodoGrid />);
    expect(screen.getByLabelText("Loading todos")).toBeInTheDocument();
  });

  it("renders an error state with a working retry button", () => {
    const refetch = vi.fn();
    stubTodos(undefined, { error: new Error("offline"), refetch });

    render(<TodoGrid />);
    expect(screen.getByText(/couldn't load todos/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("renders each todo title when data is present", () => {
    stubTodos([
      makeTodo({ id: "a", title: "First thing", position: "a0" }),
      makeTodo({ id: "b", title: "Second thing", position: "a1" }),
    ]);

    render(<TodoGrid />);
    expect(screen.getByText("First thing")).toBeInTheDocument();
    expect(screen.getByText("Second thing")).toBeInTheDocument();
  });

  it("shows a accent dot only when a todo has a pending suggestion", () => {
    stubTodos([
      makeTodo({
        id: "a",
        title: "Has a suggestion",
        suggestions: [
          {
            id: "s1",
            todoId: "a",
            type: "title",
            payload: { title: "Renamed" },
            label: 'Rename to "Renamed"',
            status: "pending",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
      makeTodo({ id: "b", title: "No suggestions", suggestions: [] }),
    ]);

    render(<TodoGrid />);
    expect(
      screen.getByRole("button", {
        name: "AI has suggestions — open to review",
      }),
    ).toBeInTheDocument();
  });

  it("marks only the active todos that have notes", () => {
    stubTodos([
      makeTodo({ id: "a", title: "Has a note", notes: "Ask about pricing" }),
      makeTodo({ id: "b", title: "Blank note", notes: "   ", position: "a1" }),
      makeTodo({ id: "c", title: "No note", notes: null, position: "a2" }),
    ]);

    render(<TodoGrid />);
    expect(screen.getAllByLabelText("Has notes")).toHaveLength(1);
  });

  it("shows completed todos when hideCompleted is false", () => {
    stubUser(false);
    stubTodos([
      makeTodo({ id: "a", title: "Active thing", completed: false }),
      makeTodo({ id: "b", title: "Done thing", completed: true }),
    ]);

    render(<TodoGrid />);
    expect(screen.getByText("Active thing")).toBeInTheDocument();
    expect(screen.getByText("Done thing")).toBeInTheDocument();
  });

  it("hides completed todos when hideCompleted is true", () => {
    stubUser(true);
    stubTodos([
      makeTodo({ id: "a", title: "Active thing", completed: false }),
      makeTodo({ id: "b", title: "Done thing", completed: true }),
    ]);

    render(<TodoGrid />);
    expect(screen.getByText("Active thing")).toBeInTheDocument();
    expect(screen.queryByText("Done thing")).not.toBeInTheDocument();
  });

  it("shows a collapsed completed accordion with a count when hideCompleted is true", () => {
    stubUser(true);
    stubTodos([
      makeTodo({ id: "a", title: "Active thing", completed: false }),
      makeTodo({ id: "b", title: "Done one", completed: true }),
      makeTodo({ id: "c", title: "Done two", completed: true }),
    ]);

    render(<TodoGrid />);
    const accordion = screen.getByRole("button", { name: /completed/i });
    expect(accordion).toHaveAttribute("aria-expanded", "false");
    expect(accordion).toHaveTextContent("2");
    expect(screen.queryByText("Done one")).not.toBeInTheDocument();
  });

  it("expands the completed accordion locally when clicked, without syncing the preference", () => {
    const mutate = vi.fn();
    vi.mocked(useUpdateUser).mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateUser>);
    stubUser(true);
    stubTodos([makeTodo({ id: "b", title: "Done thing", completed: true })]);

    render(<TodoGrid />);
    const accordion = screen.getByRole("button", { name: /completed/i });
    expect(accordion).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(accordion);

    expect(accordion).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Done thing")).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("aggregates completed todos from every list into a single Completed column", () => {
    const workList: SerializedList = {
      ...TODAY_LIST,
      id: "list-work",
      name: "Work",
      kind: "custom",
      systemKind: null,
      position: "a1",
    };
    stubLists([TODAY_LIST, workList]);
    stubUser(true);
    stubTodos([
      makeTodo({
        id: "a",
        listId: "list-today",
        title: "Today done",
        completed: true,
      }),
      makeTodo({
        id: "b",
        listId: "list-work",
        title: "Work done",
        completed: true,
      }),
    ]);

    render(<TodoGrid />);
    // One aggregate accordion, not one per list.
    const accordions = screen.getAllByRole("button", { name: /completed/i });
    expect(accordions).toHaveLength(1);
    expect(accordions[0]).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(accordions[0]);

    expect(accordions[0]).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Today done")).toBeInTheDocument();
    expect(screen.getByText("Work done")).toBeInTheDocument();
  });

  it("does not flash completed todos while the hideCompleted preference is loading", () => {
    stubUser(undefined);
    stubTodos([
      makeTodo({ id: "a", title: "Active thing", completed: false }),
      makeTodo({ id: "b", title: "Done thing", completed: true }),
    ]);

    render(<TodoGrid />);
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
    stubTodos([makeTodo({ id: "a", title: "Active thing", completed: false })]);

    render(<TodoGrid />);
    expect(
      screen.queryByRole("button", { name: /completed/i }),
    ).not.toBeInTheDocument();
  });
});
