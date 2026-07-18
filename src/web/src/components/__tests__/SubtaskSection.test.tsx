import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TodoWithUrls } from "@/types/database";
import { SubtaskSection } from "../SubtaskSection";

function makeSubtask(overrides: Partial<TodoWithUrls> = {}): TodoWithUrls {
  return {
    id: "sub-1",
    userId: "user-1",
    parentId: "parent-1",
    title: "A subtask",
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

function renderSection(subtasks: TodoWithUrls[]) {
  const handlers = {
    onAdd: vi.fn(),
    onToggle: vi.fn(),
    onDelete: vi.fn(),
    onReorder: vi.fn(),
  };
  render(
    <SubtaskSection
      parentId="parent-1"
      subtasks={subtasks}
      onAdd={handlers.onAdd}
      onToggle={handlers.onToggle}
      onDelete={handlers.onDelete}
      onReorder={handlers.onReorder}
    />,
  );
  return handlers;
}

describe("SubtaskSection", () => {
  it("shows an n/m progress count", () => {
    renderSection([
      makeSubtask({ id: "a", completed: true, position: "a0" }),
      makeSubtask({ id: "b", completed: false, position: "a1" }),
      makeSubtask({ id: "c", completed: false, position: "a2" }),
    ]);
    expect(screen.getByText("1/3")).toBeInTheDocument();
  });

  it("adds a subtask with the parent id and clears the input", () => {
    const { onAdd } = renderSection([]);
    const input = screen.getByPlaceholderText(
      "Add a subtask...",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  Buy candles  " } });
    fireEvent.click(screen.getByRole("button", { name: /add subtask/i }));

    // Empty list: position is a key between null/null.
    expect(onAdd).toHaveBeenCalledWith(
      "parent-1",
      "Buy candles",
      expect.any(String),
    );
    expect(input.value).toBe("");
  });

  it("inserts a new subtask above the current first active subtask", () => {
    const { onAdd } = renderSection([
      makeSubtask({ id: "a", completed: false, position: "a1" }),
      makeSubtask({ id: "b", completed: false, position: "a2" }),
    ]);
    fireEvent.change(screen.getByPlaceholderText("Add a subtask..."), {
      target: { value: "Buy candles" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add subtask/i }));

    const position = onAdd.mock.calls[0][2] as string;
    // Sorts before the current first active subtask ("a1").
    expect(position < "a1").toBe(true);
  });

  it("does not add an empty subtask", () => {
    const { onAdd } = renderSection([]);
    fireEvent.change(screen.getByPlaceholderText("Add a subtask..."), {
      target: { value: "   " },
    });
    expect(screen.getByRole("button", { name: /add subtask/i })).toBeDisabled();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("toggles a subtask with its current completion state", () => {
    const { onToggle } = renderSection([
      makeSubtask({ id: "a", title: "Active one", completed: false }),
    ]);
    fireEvent.click(
      screen.getByRole("checkbox", { name: /mark "Active one" as completed/i }),
    );
    expect(onToggle).toHaveBeenCalledWith("a", false);
  });

  it("deletes a subtask by id", () => {
    const { onDelete } = renderSection([
      makeSubtask({ id: "a", title: "Doomed", completed: false }),
    ]);
    fireEvent.click(
      screen.getByRole("button", { name: /delete subtask "Doomed"/i }),
    );
    expect(onDelete).toHaveBeenCalledWith("a");
  });

  it("renders completed subtasks after active ones", () => {
    renderSection([
      makeSubtask({ id: "done", title: "Done one", completed: true }),
      makeSubtask({ id: "active", title: "Active one", completed: false }),
    ]);
    const active = screen.getByText("Active one");
    const done = screen.getByText("Done one");
    // Active row appears before the completed row in document order.
    expect(
      active.compareDocumentPosition(done) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
