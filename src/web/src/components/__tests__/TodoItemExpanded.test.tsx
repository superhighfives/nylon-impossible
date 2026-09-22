import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TodoWithUrls } from "@/types/database";
import { TodoItemExpanded } from "../TodoItemExpanded";

const updateUrlPreviewMutate = vi.fn();
const processMutate = vi.fn();
vi.mock("@/hooks/useTodos", () => ({
  useUpdateUrlPreview: () => ({ mutate: updateUrlPreviewMutate }),
  useProcessTodo: () => ({ mutate: processMutate, isPending: false }),
}));

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

function renderExpanded(overrides: Partial<TodoWithUrls> = {}) {
  const onUpdate = vi.fn();
  const onDelete = vi.fn();
  render(
    <TodoItemExpanded
      todo={makeTodo(overrides)}
      subtasks={[]}
      onUpdate={onUpdate}
      onDelete={onDelete}
      deletePending={false}
      onAddSubtask={vi.fn()}
      onToggleSubtask={vi.fn()}
      onDeleteSubtask={vi.fn()}
      onReorderSubtask={vi.fn()}
    />,
  );
  return { onUpdate, onDelete };
}

describe("TodoItemExpanded", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("has no Save button — edits auto-save", () => {
    renderExpanded();
    expect(
      screen.queryByRole("button", { name: /save changes/i }),
    ).not.toBeInTheDocument();
  });

  it("calls onDelete with the todo id", () => {
    const { onDelete } = renderExpanded();
    fireEvent.click(screen.getByRole("button", { name: /delete "buy milk"/i }));
    expect(onDelete).toHaveBeenCalledWith("todo-1");
  });

  it("clears the due date and auto-saves it as null", () => {
    const { onUpdate } = renderExpanded({
      dueDate: "2026-05-01T00:00:00.000Z",
    });
    const input = screen.getByLabelText("Due date") as HTMLInputElement;
    expect(input.value).toBe("2026-05-01");

    fireEvent.click(screen.getByRole("button", { name: /clear due date/i }));
    expect(input.value).toBe("");
    expect(onUpdate).toHaveBeenCalledWith({ dueDate: null });
  });

  it("auto-saves a due-date change immediately", () => {
    const { onUpdate } = renderExpanded();
    fireEvent.change(screen.getByLabelText("Due date"), {
      target: { value: "2026-05-01" },
    });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0].dueDate).toBeInstanceOf(Date);
  });

  function urlFixture(overrides: Partial<TodoWithUrls["urls"][number]> = {}) {
    return {
      id: "url-1",
      todoId: "todo-1",
      url: "https://www.interfacecraft.dev/",
      title: "Interface Craft",
      description: "A working library for those committed to design.",
      siteName: "Interface Craft",
      favicon: null,
      image: null,
      showPreview: true,
      position: "a0",
      fetchStatus: "fetched" as const,
      fetchedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    };
  }

  it("processes links without AI", () => {
    renderExpanded();
    fireEvent.click(screen.getByRole("button", { name: /process links/i }));
    expect(processMutate).toHaveBeenCalledWith("todo-1");
  });

  it("names the failed link and offers a retry that re-processes", () => {
    renderExpanded({
      urls: [urlFixture({ fetchStatus: "failed", title: null })],
    });
    expect(screen.getByText(/couldn't reach this link/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(processMutate).toHaveBeenCalledWith("todo-1");
  });

  it("counts multiple failed links in the retry prompt", () => {
    renderExpanded({
      urls: [
        urlFixture({ fetchStatus: "failed", title: null }),
        urlFixture({ id: "url-2", fetchStatus: "failed", title: null }),
      ],
    });
    expect(screen.getByText(/couldn't reach 2 links/i)).toBeInTheDocument();
  });

  it("says nothing about failures when every link fetched", () => {
    renderExpanded({ urls: [urlFixture()] });
    expect(screen.queryByText(/couldn't reach/i)).not.toBeInTheDocument();
  });

  it("toggles a link's preview off, persisting showPreview=false", () => {
    renderExpanded({ urls: [urlFixture()] });
    fireEvent.click(screen.getByRole("button", { name: /show just the url/i }));
    expect(updateUrlPreviewMutate).toHaveBeenCalledWith({
      id: "url-1",
      showPreview: false,
    });
  });

  it("offers to restore the preview when it has been removed", () => {
    renderExpanded({ urls: [urlFixture({ showPreview: false })] });
    fireEvent.click(screen.getByRole("button", { name: /show preview/i }));
    expect(updateUrlPreviewMutate).toHaveBeenCalledWith({
      id: "url-1",
      showPreview: true,
    });
  });
});
