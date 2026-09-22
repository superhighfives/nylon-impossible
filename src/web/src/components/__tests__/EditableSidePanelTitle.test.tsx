import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TodoWithUrls } from "@/types/database";
import { EditableSidePanelTitle } from "../EditableSidePanelTitle";

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

describe("EditableSidePanelTitle", () => {
  it("auto-saves the title on blur, sending only the changed field", () => {
    const onUpdate = vi.fn();
    render(<EditableSidePanelTitle todo={makeTodo()} onUpdate={onUpdate} />);
    const input = screen.getByLabelText("Todo title") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Buy oat milk" } });
    fireEvent.blur(input);

    expect(onUpdate).toHaveBeenCalledWith({ title: "Buy oat milk" });
  });

  it("commits on Enter by blurring the field", () => {
    const onUpdate = vi.fn();
    render(<EditableSidePanelTitle todo={makeTodo()} onUpdate={onUpdate} />);
    const input = screen.getByLabelText("Todo title") as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "Buy oat milk" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onUpdate).toHaveBeenCalledWith({ title: "Buy oat milk" });
  });

  it("never auto-saves a blank title", () => {
    const onUpdate = vi.fn();
    render(<EditableSidePanelTitle todo={makeTodo()} onUpdate={onUpdate} />);
    const input = screen.getByLabelText("Todo title") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);

    expect(onUpdate).not.toHaveBeenCalled();
    expect(input.value).toBe("Buy milk");
  });
});
