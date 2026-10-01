import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SerializedTodoUrl, TodoWithUrls } from "@/types/database";
import { EditableSidePanelTitle } from "../EditableSidePanelTitle";

function makeUrl(overrides?: Partial<SerializedTodoUrl>): SerializedTodoUrl {
  return {
    id: "u1",
    todoId: "todo-1",
    url: "https://www.interfacecraft.dev/post",
    title: null,
    description: null,
    siteName: null,
    favicon: null,
    image: null,
    showPreview: true,
    position: "a0",
    fetchStatus: "fetched",
    fetchedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

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

  it("clearing the title of a single-link todo saves the placeholder instead of reverting", () => {
    const onUpdate = vi.fn();
    const todo = makeTodo({
      title: "Use for inspiration",
      urls: [makeUrl()],
    });
    render(<EditableSidePanelTitle todo={todo} onUpdate={onUpdate} />);
    const input = screen.getByLabelText("Todo title") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  " } });
    fireEvent.blur(input);

    expect(onUpdate).toHaveBeenCalledWith({
      title: "Check interfacecraft.dev",
    });
  });

  it("renders a placeholder title (raw URL or 'Check {domain}') muted", () => {
    const onUpdate = vi.fn();
    const todo = makeTodo({
      title: "Check interfacecraft.dev",
      urls: [makeUrl()],
    });
    render(<EditableSidePanelTitle todo={todo} onUpdate={onUpdate} />);
    const input = screen.getByLabelText("Todo title") as HTMLInputElement;

    expect(input.className).toContain("text-gray-muted");
  });

  it("does not mute a real, user-written title", () => {
    const onUpdate = vi.fn();
    const todo = makeTodo({
      title: "Use for inspiration",
      urls: [makeUrl()],
    });
    render(<EditableSidePanelTitle todo={todo} onUpdate={onUpdate} />);
    const input = screen.getByLabelText("Todo title") as HTMLInputElement;

    expect(input.className).not.toContain("text-gray-muted");
  });
});
