import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TodoActions } from "../useTodoActions";
import { makeTodo } from "./fixtures";

vi.mock("@/hooks/useTodos", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false });
  return {
    useAddTodoUrl: mutation,
    useCreateTodo: mutation,
    useDeleteTodo: mutation,
    useDeleteTodoUrl: mutation,
    useProcessTodo: mutation,
    useUpdateTodo: mutation,
    useUpdateUrlPreview: mutation,
  };
});

import { DetailSheet } from "../DetailSheet";

describe("DetailSheet", () => {
  it("keeps each footer stamp whole, so Edited wraps as one piece", () => {
    render(
      <DetailSheet
        todo={makeTodo({
          createdAt: "2025-10-07T12:00:00.000Z",
          updatedAt: "2025-10-22T12:00:00.000Z",
        })}
        subtasks={[]}
        listTargets={[]}
        listName={() => "Today"}
        timeZone="UTC"
        actions={{ save: vi.fn(), destroy: vi.fn() } as unknown as TodoActions}
        onClose={vi.fn()}
      />,
    );
    const created = screen.getByText("Created Oct 7");
    const edited = screen.getByText("Edited Oct 22");
    expect(created.parentElement).toBe(edited.parentElement);
    for (const stamp of [created, edited]) {
      expect(stamp).toHaveClass("whitespace-nowrap");
    }
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass(
      "shrink-0",
    );
  });
});
