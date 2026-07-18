import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TodoWithUrls } from "@/types/database";
import { TodoItemExpanded } from "../TodoItemExpanded";

vi.mock("@/hooks/useUser", () => ({
  useUser: vi.fn(),
}));

const updateUrlPreviewMutate = vi.fn();
const enrichMutate = vi.fn();
const reresearchMutate = vi.fn();
vi.mock("@/hooks/useTodos", () => ({
  useUpdateUrlPreview: () => ({ mutate: updateUrlPreviewMutate }),
  useEnrichTodo: () => ({ mutate: enrichMutate, isPending: false }),
  useReresearch: () => ({ mutate: reresearchMutate, isPending: false }),
}));

vi.mock("../ResearchSection", () => ({
  ResearchSection: ({ todoId }: { todoId: string }) => (
    <div data-testid="research-section">research:{todoId}</div>
  ),
}));

vi.mock("../ConversationSection", () => ({
  ConversationSection: ({ todo }: { todo: { id: string } }) => (
    <div data-testid="conversation-section">conversation:{todo.id}</div>
  ),
}));

import { useUser } from "@/hooks/useUser";

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
    vi.mocked(useUser).mockReturnValue({
      data: { aiEnabled: false },
      isLoading: false,
    } as unknown as ReturnType<typeof useUser>);
  });

  it("has no Save button — edits auto-save", () => {
    renderExpanded();
    expect(
      screen.queryByRole("button", { name: /save changes/i }),
    ).not.toBeInTheDocument();
  });

  it("auto-saves the title on blur, sending only the changed field", () => {
    const { onUpdate } = renderExpanded();
    const input = screen.getByLabelText("Title") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Buy oat milk" } });
    fireEvent.blur(input);

    expect(onUpdate).toHaveBeenCalledWith({ title: "Buy oat milk" });
  });

  it("auto-saves the title after the debounce elapses", () => {
    vi.useFakeTimers();
    try {
      const { onUpdate } = renderExpanded();
      fireEvent.change(screen.getByLabelText("Title"), {
        target: { value: "Buy oat milk" },
      });
      expect(onUpdate).not.toHaveBeenCalled();
      vi.advanceTimersByTime(700);
      expect(onUpdate).toHaveBeenCalledWith({ title: "Buy oat milk" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("never auto-saves a blank title", () => {
    const { onUpdate } = renderExpanded();
    const input = screen.getByLabelText("Title");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);
    expect(onUpdate).not.toHaveBeenCalled();
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

  it("renders the research section when research is present", () => {
    renderExpanded({
      research: {
        id: "r1",
        status: "completed",
        researchType: "general",
        summary: "Summary",
        researchedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });
    expect(screen.getByTestId("research-section")).toHaveTextContent(
      "research:todo-1",
    );
  });

  it("shows the AI hint for a pro user with AI enabled", () => {
    vi.mocked(useUser).mockReturnValue({
      data: { plan: "pro", aiEnabled: true },
      isLoading: false,
    } as unknown as ReturnType<typeof useUser>);
    renderExpanded();
    expect(screen.getByText(/not used by ai/i)).toBeInTheDocument();
  });

  it("shows the AI hint for a free user with AI enabled (plan-independent)", () => {
    vi.mocked(useUser).mockReturnValue({
      data: { plan: "free", aiEnabled: true },
      isLoading: false,
    } as unknown as ReturnType<typeof useUser>);
    renderExpanded();
    expect(screen.getByText(/not used by ai/i)).toBeInTheDocument();
  });

  it("runs enrich and research from the AI actions for a free user with AI enabled", () => {
    vi.mocked(useUser).mockReturnValue({
      data: { plan: "free", aiEnabled: true },
      isLoading: false,
    } as unknown as ReturnType<typeof useUser>);
    renderExpanded();

    fireEvent.click(screen.getByRole("button", { name: /enrich/i }));
    expect(enrichMutate).toHaveBeenCalledWith("todo-1");

    fireEvent.click(screen.getByRole("button", { name: /research/i }));
    expect(reresearchMutate).toHaveBeenCalledWith("todo-1");
  });

  it("hides the AI actions when AI is unavailable", () => {
    // beforeEach sets aiEnabled:false → AI unavailable.
    renderExpanded();
    expect(
      screen.queryByRole("button", { name: /enrich/i }),
    ).not.toBeInTheDocument();
  });

  function urlFixture(overrides: Partial<TodoWithUrls["urls"][number]> = {}) {
    return {
      id: "url-1",
      todoId: "todo-1",
      researchId: null,
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
