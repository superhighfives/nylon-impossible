import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SerializedList, TodoWithUrls } from "@/types/database";
import { TodoGrid } from "../TodoGrid";

vi.mock("@/hooks/useTodos", () => ({
  useTodos: vi.fn(),
  useUpdateTodo: vi.fn(),
  useDeleteTodo: vi.fn(),
  useCreateTodo: vi.fn(),
  usePendingTodoIds: vi.fn(() => ({
    updating: new Set<string>(),
    deleting: new Set<string>(),
  })),
  // TodoGrid renders the floating composer (TodoInput), which smart-creates.
  useSmartCreate: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  // The expanded details panel toggles link previews and retries failed
  // link fetches.
  useUpdateUrlPreview: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useProcessTodo: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock("@/hooks/useLists", () => ({
  useLists: vi.fn(),
  useCreateList: vi.fn(),
  useUpdateList: vi.fn(),
  useDeleteList: vi.fn(),
}));

// Some children read the user (Clerk's useAuth underneath); mock it so the
// board renders without a ClerkProvider.
vi.mock("@/hooks/useUser", () => ({
  useUser: vi.fn(() => ({ data: undefined })),
  useUpdateUser: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

// Completing a todo raises a "Done · Undo" toast; capture it instead of
// rendering the global toaster.
vi.mock("@/lib/toast", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/toast")>()),
  toast: {
    success: vi.fn(() => "toast-1"),
    error: vi.fn(),
    info: vi.fn(),
    dismiss: vi.fn(),
  },
}));

import { COMPLETION_HOLD_MS } from "@/hooks/useCompletionHold";
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
import { useUser } from "@/hooks/useUser";
import { toast } from "@/lib/toast";

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
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    sticky: false,
    urls: [],
    ...overrides,
  };
}

function stubUser() {
  vi.mocked(useUser).mockReturnValue({
    data: undefined,
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

  it("marks only the active todos that have notes", () => {
    stubTodos([
      makeTodo({ id: "a", title: "Has a note", notes: "Ask about pricing" }),
      makeTodo({ id: "b", title: "Blank note", notes: "   ", position: "a1" }),
      makeTodo({ id: "c", title: "No note", notes: null, position: "a2" }),
    ]);

    render(<TodoGrid />);
    expect(screen.getAllByLabelText("Has notes")).toHaveLength(1);
  });

  it("doesn't render completed todos anywhere on the board", () => {
    stubTodos([
      makeTodo({ id: "a", title: "Active thing", completed: false }),
      makeTodo({ id: "b", title: "Done thing", completed: true }),
    ]);

    render(<TodoGrid />);
    expect(screen.getByText("Active thing")).toBeInTheDocument();
    expect(screen.queryByText("Done thing")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /completed/i }),
    ).not.toBeInTheDocument();
  });

  it("completes after the hold and offers Undo from a Done toast", () => {
    vi.useFakeTimers();
    try {
      const mutate = vi.fn();
      vi.mocked(useUpdateTodo).mockReturnValue({
        mutate,
        isPending: false,
      } as unknown as ReturnType<typeof useUpdateTodo>);
      stubTodos([makeTodo({ position: "a5", sticky: true })]);

      render(<TodoGrid />);
      fireEvent.click(
        screen.getByRole("checkbox", { name: 'Mark "Buy milk" as completed' }),
      );
      expect(mutate).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(COMPLETION_HOLD_MS);
      });

      expect(mutate).toHaveBeenCalledWith({
        id: "todo-1",
        input: { completed: true },
      });
      expect(toast.success).toHaveBeenCalledTimes(1);
      const [message, options] = vi.mocked(toast.success).mock.calls[0];
      expect(message).toBe("Done");
      expect(options?.actionProps?.children).toBe("Undo");

      // Undo restores the row where it was, pin included.
      act(() => {
        options?.actionProps?.onClick?.(
          {} as Parameters<
            NonNullable<NonNullable<typeof options.actionProps>["onClick"]>
          >[0],
        );
      });
      expect(mutate).toHaveBeenLastCalledWith({
        id: "todo-1",
        input: { completed: false, position: "a5", sticky: true },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("undoes a completed repeat by restoring its due date and list", () => {
    vi.useFakeTimers();
    try {
      const mutate = vi.fn();
      vi.mocked(useUpdateTodo).mockReturnValue({
        mutate,
        isPending: false,
      } as unknown as ReturnType<typeof useUpdateTodo>);
      stubTodos([
        makeTodo({
          recurrence: { frequency: "daily" },
          dueDate: "2026-03-15T00:00:00.000Z",
        }),
      ]);

      render(<TodoGrid />);
      fireEvent.click(
        screen.getByRole("checkbox", { name: 'Mark "Buy milk" as completed' }),
      );
      act(() => {
        vi.advanceTimersByTime(COMPLETION_HOLD_MS);
      });

      const [, options] = vi.mocked(toast.success).mock.calls[0];
      act(() => {
        options?.actionProps?.onClick?.(
          {} as Parameters<
            NonNullable<NonNullable<typeof options.actionProps>["onClick"]>
          >[0],
        );
      });
      expect(mutate).toHaveBeenLastCalledWith({
        id: "todo-1",
        input: {
          completedAt: null,
          dueDate: new Date("2026-03-15T00:00:00.000Z"),
          listId: "list-today",
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens a todo's details when the row itself is tapped", () => {
    stubTodos([makeTodo()]);
    render(<TodoGrid />);

    fireEvent.click(screen.getByText("Buy milk"));

    expect(screen.getByLabelText("Todo title")).toBeInTheDocument();
  });

  it("ignores clicks that bubble up from the portaled due-date popover", () => {
    stubTodos([makeTodo({ dueDate: "2026-03-15T00:00:00.000Z" })]);
    // Mount on <body>, as the app does, so the portal shares the root's event
    // listener — a detached container would dispatch the click twice.
    render(<TodoGrid />, { container: document.body });

    fireEvent.click(screen.getByRole("button", { name: /Change due date/ }));
    // The month header is plain text inside the calendar, not a control.
    fireEvent.click(screen.getByText("March 2026", { selector: "span" }));

    expect(screen.queryByLabelText("Todo title")).not.toBeInTheDocument();
  });
});
