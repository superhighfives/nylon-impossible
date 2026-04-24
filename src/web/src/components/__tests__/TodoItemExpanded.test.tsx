import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TodoWithUrls } from "@/types/database";
import { TodoItemExpanded } from "../TodoItemExpanded";

vi.mock("@/hooks/useUser", () => ({
  useUser: vi.fn(),
}));

vi.mock("../ResearchSection", () => ({
  ResearchSection: ({ todoId }: { todoId: string }) => (
    <div data-testid="research-section">research:{todoId}</div>
  ),
}));

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
    aiStatus: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    research: null,
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
      onUpdate={onUpdate}
      isUpdating={false}
      onDelete={onDelete}
      deletePending={false}
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

  it("disables Save when there are no pending changes", () => {
    renderExpanded();
    expect(
      screen.getByRole("button", { name: /save changes/i }),
    ).toBeDisabled();
  });

  it("enables Save after editing the title and sends only changed fields", () => {
    const { onUpdate } = renderExpanded();
    const input = screen.getByLabelText("Title") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Buy oat milk" } });

    const save = screen.getByRole("button", { name: /save changes/i });
    expect(save).not.toBeDisabled();
    fireEvent.click(save);

    expect(onUpdate).toHaveBeenCalledWith({ title: "Buy oat milk" });
  });

  it("does not submit an empty title", () => {
    const { onUpdate } = renderExpanded();
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "   " },
    });
    expect(
      screen.getByRole("button", { name: /save changes/i }),
    ).toBeDisabled();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("calls onDelete with the todo id", () => {
    const { onDelete } = renderExpanded();
    fireEvent.click(screen.getByRole("button", { name: /delete "buy milk"/i }));
    expect(onDelete).toHaveBeenCalledWith("todo-1");
  });

  it("shows a clear button that wipes the due date", () => {
    renderExpanded({ dueDate: "2026-05-01T00:00:00.000Z" });
    const input = screen.getByLabelText("Due date") as HTMLInputElement;
    expect(input.value).toBe("2026-05-01");

    fireEvent.click(screen.getByRole("button", { name: /clear due date/i }));
    expect(input.value).toBe("");
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

  it("shows the AI hint when the user has AI enabled", () => {
    vi.mocked(useUser).mockReturnValue({
      data: { aiEnabled: true },
      isLoading: false,
    } as unknown as ReturnType<typeof useUser>);
    renderExpanded();
    expect(screen.getByText(/not used by ai/i)).toBeInTheDocument();
  });
});
