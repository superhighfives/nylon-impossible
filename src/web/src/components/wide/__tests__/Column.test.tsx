import { DndContext } from "@dnd-kit/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Column } from "../Column";

const column = (listId: string, title: string, onDelete: () => void) => (
  <Column
    listId={listId}
    title={title}
    subline=""
    rows={[]}
    subtasksOf={() => []}
    checked={new Set()}
    collapsing={new Set()}
    highlightedId={null}
    selectedId={null}
    indicator={null}
    composer={null}
    empty="Nothing here yet."
    loading={false}
    error={null}
    onRename={vi.fn()}
    onDelete={onDelete}
    now={new Date()}
    timeZone="UTC"
    onCheck={vi.fn()}
    onOpen={vi.fn()}
    onMenu={vi.fn()}
  />
);

describe("Column", () => {
  it("gives a list a ⋯ menu of its own and no ×", async () => {
    const deleteGroceries = vi.fn();
    const deleteStudio = vi.fn();
    render(
      <DndContext>
        {column("groceries", "Groceries", deleteGroceries)}
        {column("studio", "Studio", deleteStudio)}
      </DndContext>,
    );
    expect(screen.queryAllByRole("button", { name: /^Close/ })).toEqual([]);

    await userEvent.click(
      screen.getByRole("button", { name: "Studio options" }),
    );
    const menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((i) => i.textContent),
    ).toEqual(["Rename", "Delete list"]);
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Delete list" }),
    );
    expect(deleteStudio).toHaveBeenCalledOnce();
    expect(deleteGroceries).not.toHaveBeenCalled();
  });

  it("clamps a list's title to two lines and keeps the subline's line", () => {
    // jsdom has no layout, so this pins the classes that do it: the rename
    // button clamps itself (the heading's clamp can't reach inside it), and
    // only the banner slot gives way when the title takes two lines.
    render(
      <DndContext>
        {column(
          "market",
          "Records, tapes and the odd zine to find at the weekend market",
          vi.fn(),
        )}
      </DndContext>,
    );
    const title = screen.getByRole("button", {
      name: "Records, tapes and the odd zine to find at the weekend market",
    });
    expect(title.className).toMatch(/\bline-clamp-2\b/);
    const header = title.closest("header");
    expect(title.closest("h2")?.parentElement?.className).toMatch(
      /\bshrink-0\b/,
    );
    expect(header?.querySelector("[data-subline]")?.className).toMatch(
      /\bshrink-0\b/,
    );
    expect(header?.querySelector("[data-banner-slot]")?.className).toMatch(
      /\bmin-h-0\b/,
    );
  });
});
