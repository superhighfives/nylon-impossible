import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SystemListKind } from "@/types/database";
import { ContextMenu, type MenuTarget } from "../ContextMenu";
import { recordRecentMove } from "../moveMenu";
import { makeTodo } from "./fixtures";

const TIME_TARGETS: MenuTarget[] = [
  { id: "list-week", label: "This week", kind: "thisWeek" },
  { id: "list-someday", label: "Someday", kind: "someday" },
];

function setup(
  todo = makeTodo(),
  {
    moveTargets = TIME_TARGETS,
    listKind = "today",
  }: { moveTargets?: MenuTarget[]; listKind?: SystemListKind | null } = {},
) {
  const handlers = {
    onClose: vi.fn(),
    onMove: vi.fn(),
    onTogglePin: vi.fn(),
    onDelete: vi.fn(),
  };
  render(
    <ContextMenu
      todo={todo}
      where="Today"
      moveTargets={moveTargets}
      listKind={listKind}
      {...handlers}
    />,
  );
  return { todo, ...handlers };
}

describe("ContextMenu", () => {
  beforeEach(() => window.localStorage.clear());

  it("groups the moves under Move to, with plain list names", () => {
    setup();
    const group = screen.getByRole("group", { name: "Move to" });
    const items = within(group).getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["This week", "Someday"]);
  });

  it("points each time list's arrow the way it lies", () => {
    setup(makeTodo(), {
      moveTargets: [
        { id: "list-today", label: "Today", kind: "today" },
        { id: "list-someday", label: "Someday", kind: "someday" },
      ],
      listKind: "thisWeek",
    });
    const icon = (name: string) =>
      screen
        .getByRole("menuitem", { name: `Move to ${name}` })
        .querySelector("svg")
        ?.getAttribute("class");
    expect(icon("Today")).toContain("arrow-left");
    expect(icon("Someday")).toContain("arrow-right");
  });

  it("shows the two lists moved to most recently, the rest under More", async () => {
    recordRecentMove("list-c");
    const { todo, onMove } = setup(makeTodo(), {
      moveTargets: [
        ...TIME_TARGETS,
        { id: "list-a", label: "A", kind: null },
        { id: "list-b", label: "B", kind: null },
        { id: "list-c", label: "C", kind: null },
      ],
    });
    const group = screen.getByRole("group", { name: "Move to" });
    expect(
      within(group)
        .getAllByRole("menuitem")
        .map((i) => i.textContent),
    ).toEqual(["This week", "Someday", "C", "A", "More"]);
    await userEvent.click(screen.getByRole("menuitem", { name: "More" }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Move to B" }),
    );
    expect(onMove).toHaveBeenCalledWith(todo, "list-b");
  });

  it("names the todo and where it is", () => {
    setup();
    expect(screen.getByRole("dialog")).toHaveTextContent("Water the plants");
    expect(screen.getByRole("dialog")).toHaveTextContent("Today");
  });

  it("moves to another list and closes", async () => {
    const { todo, onMove, onClose } = setup();
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Move to Someday" }),
    );
    expect(onMove).toHaveBeenCalledWith(todo, "list-someday");
    expect(onClose).toHaveBeenCalled();
  });

  it("offers Pin to top, or Unpin when pinned", async () => {
    const { todo, onTogglePin } = setup();
    await userEvent.click(screen.getByRole("menuitem", { name: "Pin to top" }));
    expect(onTogglePin).toHaveBeenCalledWith(todo);
  });

  it("says Unpin for a pinned todo", () => {
    setup(makeTodo({ pinned: true }));
    expect(screen.getByRole("menuitem", { name: "Unpin" })).toBeInTheDocument();
  });

  it("deletes without a confirmation", async () => {
    const { todo, onDelete } = setup();
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith(todo);
  });

  it("arrow keys move between items", async () => {
    setup();
    const first = screen.getByRole("menuitem", { name: "Move to This week" });
    // Opens with focus on the first action.
    await waitFor(() => expect(first).toHaveFocus());
    await userEvent.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("menuitem", { name: "Move to Someday" }),
    ).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(first).toHaveFocus();
  });
});
