import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TodoActions } from "../useTodoActions";
import { makeTodo, makeUrl } from "./fixtures";

const createTodo = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useTodos", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false });
  return {
    useAddTodoUrl: mutation,
    useCreateTodo: () => ({ mutate: createTodo, isPending: false }),
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
        listInSentence={() => "today"}
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

  it("marks the open todo as a todo at the start of its subline, on wide", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      <DetailSheet
        todo={makeTodo({ title: "Camera", listId: "list-today" })}
        subtasks={[]}
        listTargets={[]}
        listName={() => "Today"}
        listInSentence={() => "today"}
        timeZone="UTC"
        actions={{ save: vi.fn(), destroy: vi.fn() } as unknown as TodoActions}
        onClose={vi.fn()}
        variant="column"
        container={container}
        animated={false}
      />,
    );
    const subline = screen.getByText("In today").parentElement;
    const icon = subline?.firstElementChild;
    expect(icon).toHaveAttribute("data-icon", "todo");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).toHaveAttribute("width", "16");
    container.remove();
  });

  it("leaves the phone sheet's subline without an icon", () => {
    render(
      <DetailSheet
        todo={makeTodo({ title: "Camera" })}
        subtasks={[]}
        listTargets={[]}
        listName={() => "Today"}
        listInSentence={() => "today"}
        timeZone="UTC"
        actions={{ save: vi.fn(), destroy: vi.fn() } as unknown as TodoActions}
        onClose={vi.fn()}
      />,
    );
    expect(document.querySelector("[data-icon]")).toBeNull();
  });

  it("shows subtasks and links by code point, and adds a subtask last", () => {
    const parent = makeTodo({
      urls: [
        makeUrl({ id: "l-a0", url: "https://example.com/a0", position: "a0" }),
        makeUrl({ id: "l-Zz", url: "https://example.com/Zz", position: "Zz" }),
      ],
    });
    const sub = (title: string, position: string) =>
      makeTodo({ id: title, title, position, parentId: parent.id });
    render(
      <DetailSheet
        todo={parent}
        subtasks={[
          sub("a0", "a0"),
          sub("aa", "aa"),
          sub("Zz", "Zz"),
          sub("aZ", "aZ"),
        ]}
        listTargets={[]}
        listName={() => "Today"}
        listInSentence={() => "today"}
        timeZone="UTC"
        actions={{ save: vi.fn(), destroy: vi.fn() } as unknown as TodoActions}
        onClose={vi.fn()}
      />,
    );
    const subtasks = screen.getByRole("region", { name: /Subtasks/ });
    expect(
      within(subtasks)
        .getAllByRole("button", { pressed: false })
        .map((b) => b.getAttribute("aria-label")),
    ).toEqual(["Zz", "a0", "aZ", "aa"]);
    const links = screen.getByRole("region", { name: "Links" });
    expect(
      within(links)
        .getAllByRole("link")
        .map((a) => a.getAttribute("href")),
    ).toEqual(["https://example.com/Zz", "https://example.com/a0"]);

    const input = screen.getByRole("textbox", { name: "New subtask" });
    fireEvent.change(input, { target: { value: "Pack" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(createTodo).toHaveBeenCalledTimes(1);
    expect(createTodo.mock.calls[0][0].position > "aa").toBe(true);
  });
});
