import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ContextMenu } from "../ContextMenu";
import { makeTodo } from "./fixtures";

function setup(todo = makeTodo()) {
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
      moveTargets={[
        { id: "list-week", label: "This week" },
        { id: "list-someday", label: "Someday" },
      ]}
      {...handlers}
    />,
  );
  return { todo, ...handlers };
}

describe("ContextMenu", () => {
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
