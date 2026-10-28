import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { makeList, makeTodo } from "@/components/phone/__tests__/fixtures";
import type { TodoWithUrls } from "@/types/database";

const update = vi.fn();
const remove = vi.fn();
const createList = vi.fn();
const updateList = vi.fn();
const deleteList = vi.fn();
const lists = [
  makeList("list-today", "Today", "today", "a0"),
  makeList("list-week", "This week", "thisWeek", "a1"),
  makeList("list-someday", "Someday", "someday", "a2"),
  makeList("list-groceries", "Groceries", null, "a3"),
  makeList("list-studio", "Studio", null, "a4"),
];
let todos: TodoWithUrls[] = [];
const sweptAt = new Date().toISOString();

vi.mock("@/hooks/useLists", () => ({
  useLists: () => ({ data: lists, isLoading: false }),
  useCreateList: () => ({ mutate: createList }),
  useUpdateList: () => ({ mutate: updateList }),
  useDeleteList: () => ({ mutate: deleteList }),
}));
vi.mock("@/hooks/useTodos", () => ({
  useTodos: () => ({
    data: todos,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
  }),
  useUpdateTodo: () => ({ mutate: update }),
  useDeleteTodo: () => ({ mutate: remove }),
  useSmartCreate: () => ({ mutateAsync: vi.fn() }),
  useCreateTodo: () => ({ mutate: vi.fn() }),
  useDeleteTodoUrl: () => ({ mutate: vi.fn() }),
  useProcessTodo: () => ({ mutate: vi.fn() }),
  useUpdateUrlPreview: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/hooks/useHints", () => ({
  useHints: () => ({ timeZone: "UTC", reducedMotion: "reduce" }),
}));
vi.mock("@/hooks/useLocalMidnightTick", () => ({
  useLocalMidnightTick: () => {},
}));
vi.mock("@/hooks/useUser", () => ({
  useUser: () => ({
    data: {
      timezone: "UTC",
      lastSweep: {
        at: sweptAt,
        movedToThisWeek: 0,
        movedToSomeday: 3,
      },
    },
  }),
  useUpdateUser: () => ({ mutate: vi.fn() }),
  useDeleteCurrentUser: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@clerk/tanstack-react-start", () => ({
  useClerk: () => ({ signOut: vi.fn() }),
}));
vi.mock("@/lib/toast", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/toast")>()),
  toast: {
    success: vi.fn(() => "toast-1"),
    error: vi.fn(),
    info: vi.fn(),
    dismiss: vi.fn(),
  },
}));

import { toast } from "@/lib/toast";
import { WideApp } from "../WideApp";

const column = (name: string) =>
  screen.getByRole("region", { name }) as HTMLElement;
const rowButton = (title: string) =>
  screen
    .getAllByRole("button")
    .find(
      (b) => b.hasAttribute("data-row-id") && b.textContent?.startsWith(title),
    ) as HTMLElement;
const focusedTitle = () =>
  (document.activeElement as HTMLElement | null)
    ?.closest("[data-row-id]")
    ?.textContent?.trim();
const press = (key: string) =>
  fireEvent.keyDown(document.activeElement ?? window, { key });

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("WideApp", () => {
  beforeEach(() => {
    update.mockReset();
    remove.mockReset();
    createList.mockReset();
    updateList.mockReset();
    deleteList.mockReset();
    vi.mocked(toast.success).mockClear();
    window.localStorage.clear();
    todos = [
      makeTodo({
        id: "t1",
        title: "Review PR",
        listId: "list-today",
        position: "a0",
        createdAt: "2020-01-01T00:00:00Z",
      }),
      makeTodo({
        id: "t2",
        title: "Call Mum",
        listId: "list-today",
        position: "a1",
        createdAt: "2020-01-01T00:00:00Z",
      }),
      makeTodo({
        id: "w1",
        title: "Send invoice",
        listId: "list-week",
        position: "a0",
      }),
      makeTodo({
        id: "w2",
        title: "Renew passport",
        listId: "list-week",
        position: "a1",
      }),
      makeTodo({
        id: "s1",
        title: "Read Piranesi",
        listId: "list-someday",
        position: "a0",
      }),
      makeTodo({
        id: "g1",
        title: "Parmesan",
        listId: "list-groceries",
        position: "a0",
      }),
      makeTodo({
        id: "st1",
        title: "Mix the EP",
        listId: "list-studio",
        position: "a0",
      }),
      makeTodo({
        id: "d1",
        title: "Ship the zine",
        listId: "list-today",
        completed: true,
        completedAt: new Date().toISOString(),
      }),
      makeTodo({
        id: "d2",
        title: "Book the venue",
        listId: "list-week",
        completed: true,
        completedAt: new Date(Date.now() - 1000).toISOString(),
      }),
    ];
  });
  afterEach(() => vi.useRealTimers());

  it("shows the sidebar with counts and the three time columns", () => {
    render(<WideApp />);
    const nav = screen.getByRole("navigation", { name: "Lists" });
    // Named by what's visible, with the count read as the description.
    expect(
      within(nav).getByRole("button", { name: "Today" }),
    ).toHaveAccessibleDescription("2 todos");
    const groceries = within(nav).getByRole("button", { name: "Groceries" });
    expect(groceries).toHaveAccessibleDescription("1 todo");
    expect(groceries).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("region", { name: "Groceries" })).toBeNull();
  });

  it("always has a fourth column, Done by default, with no ×", () => {
    render(<WideApp />);
    expect(
      screen.getAllByRole("region").map((r) => r.getAttribute("data-column")),
    ).toEqual(["list-today", "list-week", "list-someday", "done"]);
    expect(
      within(column("Done")).getByText("Ship the zine"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close Done" })).toBeNull();
    const more = screen.getByRole("navigation", { name: "More" });
    expect(within(more).getByRole("button", { name: "Done" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("opens one of your lists in the fourth column, swaps it, and × goes back to Done", async () => {
    render(<WideApp />);
    const nav = screen.getByRole("navigation", { name: "Lists" });
    await userEvent.click(
      within(nav).getByRole("button", { name: /Groceries/ }),
    );
    expect(column("Groceries")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Done" })).toBeNull();
    expect(
      within(nav).getByRole("button", { name: "Groceries" }),
    ).toHaveAttribute("aria-current", "true");
    expect(focusedTitle()).toContain("Parmesan");

    await userEvent.click(within(nav).getByRole("button", { name: /Studio/ }));
    expect(screen.queryByRole("region", { name: "Groceries" })).toBeNull();
    expect(column("Studio")).toBeInTheDocument();

    // Clicking the open list again goes into it; it doesn't close it.
    await userEvent.click(within(nav).getByRole("button", { name: /Studio/ }));
    expect(column("Studio")).toBeInTheDocument();
    expect(focusedTitle()).toContain("Mix the EP");

    await userEvent.click(screen.getByRole("button", { name: "Close Studio" }));
    expect(screen.queryByRole("region", { name: "Studio" })).toBeNull();
    expect(column("Done")).toBeInTheDocument();
  });

  it("goes into a time list from the sidebar, back to its last selection", async () => {
    render(<WideApp />);
    const nav = screen.getByRole("navigation", { name: "Lists" });
    await userEvent.click(
      within(nav).getByRole("button", { name: /This week/ }),
    );
    expect(focusedTitle()).toContain("Send invoice");
    press("j");
    expect(focusedTitle()).toContain("Renew passport");
    await userEvent.click(within(nav).getByRole("button", { name: /Today/ }));
    expect(focusedTitle()).toContain("Review PR");
    await userEvent.click(
      within(nav).getByRole("button", { name: /This week/ }),
    );
    expect(focusedTitle()).toContain("Renew passport");
  });

  it("marks the selection's column in the sidebar with the ink bar", () => {
    render(<WideApp />);
    const nav = screen.getByRole("navigation", { name: "Lists" });
    const bar = () =>
      nav.querySelector("[data-selection-bar]")?.closest("button");
    expect(bar()).toBeFalsy();
    act(() => rowButton("Send invoice").focus());
    expect(bar()).toHaveAccessibleName("This week");
  });

  it("j/k move through rows and h/l and arrows move across columns", () => {
    render(<WideApp />);
    rowButton("Review PR").focus();
    press("j");
    expect(focusedTitle()).toContain("Call Mum");
    press("k");
    expect(focusedTitle()).toContain("Review PR");
    press("l");
    expect(focusedTitle()).toContain("Send invoice");
    press("ArrowRight");
    expect(focusedTitle()).toContain("Read Piranesi");
    press("h");
    expect(focusedTitle()).toContain("Send invoice");
    press("ArrowDown");
    expect(focusedTitle()).toContain("Renew passport");
  });

  it("starts in Today when nothing is focused", () => {
    render(<WideApp />);
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(window, { key: "j" });
    expect(focusedTitle()).toContain("Review PR");
  });

  it("1/2/3 move the focused todo, and focus moves on to its neighbour", () => {
    render(<WideApp />);
    rowButton("Review PR").focus();
    press("2");
    expect(update).toHaveBeenCalledWith({
      id: "t1",
      input: expect.objectContaining({ listId: "list-week" }),
    });
    expect(toast.success).toHaveBeenCalledWith(
      "Moved to This week",
      expect.anything(),
    );
    expect(focusedTitle()).toContain("Call Mum");
    // Already in Today: nothing to do.
    update.mockClear();
    press("1");
    expect(update).not.toHaveBeenCalled();
  });

  it("p pins and x marks done", async () => {
    vi.useFakeTimers();
    render(<WideApp />);
    rowButton("Call Mum").focus();
    press("p");
    expect(update).toHaveBeenCalledWith({ id: "t2", input: { pinned: true } });
    press("x");
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(update).toHaveBeenCalledWith({
      id: "t2",
      input: { completed: true },
    });
  });

  it("Backspace deletes with Undo", () => {
    render(<WideApp />);
    rowButton("Send invoice").focus();
    press("Backspace");
    expect(rowButton("Send invoice")).toBeUndefined();
    expect(toast.success).toHaveBeenCalledWith("Deleted", expect.anything());
    expect(focusedTitle()).toContain("Renew passport");
  });

  it("d opens the Due menu for the focused todo", async () => {
    render(<WideApp />);
    rowButton("Review PR").focus();
    press("d");
    const menu = await screen.findByRole("menu", { name: "Due" });
    await userEvent.click(
      within(menu).getByRole("menuitemradio", { name: "No date" }),
    );
    expect(update).toHaveBeenCalledWith({
      id: "t1",
      input: { dueDate: null, recurrence: null },
    });
  });

  it("right-click opens the registry's commands with their keys", async () => {
    render(<WideApp />);
    fireEvent.contextMenu(rowButton("Review PR"), {
      clientX: 200,
      clientY: 200,
    });
    const menu = await screen.findByRole("menu", { name: "Todo actions" });
    const items = within(menu)
      .getAllByRole("menuitem")
      .map((i) => [
        i.querySelector("span")?.textContent,
        i.getAttribute("aria-keyshortcuts"),
      ]);
    expect(items).toEqual([
      ["Mark done", "X"],
      ["Move to This week", "2"],
      ["Move to Someday", "3"],
      ["Move to a list…", "M"],
      ["Pin to top", "P"],
      ["Due…", "D"],
      ["Delete", "⌫"],
    ]);
  });

  it("the menu, the shortcuts dialog and the palette show the same keys", async () => {
    render(<WideApp />);
    act(() => rowButton("Review PR").focus());
    fireEvent.keyDown(window, { key: "?", shiftKey: true });
    const dialog = await screen.findByRole("dialog", {
      name: "Keyboard shortcuts",
    });
    const dialogKeys = (label: string) =>
      within(dialog)
        .getByText(label, { selector: "dt" })
        .nextElementSibling?.querySelector("span")
        ?.textContent?.replace(/\s/g, "");
    expect(dialogKeys("Mark done")).toBe("X");
    expect(dialogKeys("Move to a list…")).toBe("M");
    expect(dialogKeys("New list")).toBe("⇧N");
    fireEvent.keyDown(document.activeElement ?? window, { key: "Escape" });
    await act(async () => {});

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const palette = await screen.findByRole("dialog", {
      name: "Search and commands",
    });
    const option = (name: RegExp) =>
      within(palette).getByRole("option", { name });
    expect(option(/Mark “Review PR” done/)).toHaveTextContent("X");
    expect(option(/Move “Review PR” to…/)).toHaveTextContent("M");
    expect(option(/^New list/)).toHaveTextContent("⇧N");
  });

  it("n opens quick add on the selection's column, ⇧N the New list popover", async () => {
    render(<WideApp />);
    act(() => rowButton("Read Piranesi").focus());
    press("n");
    const quick = await screen.findByRole("dialog", { name: "Quick add" });
    expect(
      within(quick).getByRole("textbox", { name: "New todo in Someday" }),
    ).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? window, { key: "Escape" });
    await act(async () => {});

    act(() => rowButton("Read Piranesi").focus());
    fireEvent.keyDown(document.activeElement ?? window, {
      key: "N",
      shiftKey: true,
    });
    expect(
      await screen.findByRole("dialog", { name: "New list" }),
    ).toBeInTheDocument();
  });

  it("← from the first column reaches the sidebar; ↑↓ move there, → goes back in", () => {
    render(<WideApp />);
    const nav = screen.getByRole("navigation", { name: "Lists" });
    act(() => rowButton("Call Mum").focus());
    press("h");
    expect(document.activeElement).toBe(
      within(nav).getByRole("button", { name: "Today" }),
    );
    press("j");
    expect(document.activeElement).toHaveAccessibleName("This week");
    press("ArrowDown");
    expect(document.activeElement).toHaveAccessibleName("Someday");
    press("k");
    press("ArrowRight");
    // Into This week, as a click: its first todo.
    expect(focusedTitle()).toContain("Send invoice");
  });

  it("Esc closes the open todo, then goes to the column's sidebar item", async () => {
    render(<WideApp />);
    act(() => rowButton("Send invoice").focus());
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    press("Escape");
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => rowButton("Send invoice").focus());
    press("Escape");
    expect(document.activeElement).toHaveAccessibleName("This week");
    // The selection stays.
    expect(rowButton("Send invoice").closest("div")).toHaveClass("ring-2");
  });

  it("⇧-digits jump to columns and lists, back to where you were", () => {
    render(<WideApp />);
    const shift = (n: number) =>
      fireEvent.keyDown(document.activeElement ?? window, {
        key: ")!@#$%^&*("[n],
        code: `Digit${n}`,
        shiftKey: true,
      });
    act(() => rowButton("Renew passport").focus());
    shift(1);
    expect(focusedTitle()).toContain("Review PR");
    shift(2);
    expect(focusedTitle()).toContain("Renew passport");
    shift(5);
    expect(column("Studio")).toBeInTheDocument();
    expect(focusedTitle()).toContain("Mix the EP");
    shift(0);
    expect(column("Done")).toBeInTheDocument();
    expect(focusedTitle()).toContain("Ship the zine");
  });

  it("G then a letter jumps, with a hint; any other key cancels it", async () => {
    render(<WideApp />);
    act(() => rowButton("Review PR").focus());
    const hint = () =>
      screen
        .queryAllByRole("status")
        .find((s) => s.textContent?.includes("Go to"));
    press("g");
    expect(hint()).toHaveTextContent(/TToday.*WThis week.*LLists/);
    press("w");
    expect(hint()).toBeUndefined();
    expect(focusedTitle()).toContain("Send invoice");
    press("g");
    press("j");
    expect(focusedTitle()).toContain("Renew passport");
    press("g");
    press("l");
    expect(
      await screen.findByRole("dialog", { name: "Go to a list" }),
    ).toBeInTheDocument();
  });

  it("⌘K works while typing, searches todos first, and jumps to one", async () => {
    render(<WideApp />);
    const field = screen.getByRole("textbox", { name: "New todo in Today" });
    field.focus();
    fireEvent.keyDown(field, { key: "k", metaKey: true });
    const palette = await screen.findByRole("dialog", {
      name: "Search and commands",
    });
    const input = within(palette).getByRole("combobox");
    await userEvent.type(input, "parm");
    expect(
      within(palette)
        .getAllByRole("group")
        .map((g) => g.getAttribute("aria-label")),
    ).toEqual(["Todos"]);
    const option = within(palette).getByRole("option", { name: /Parmesan/ });
    expect(option).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", option.id);
    await userEvent.keyboard("{Enter}");
    expect(column("Groceries")).toBeInTheDocument();
    expect(focusedTitle()).toContain("Parmesan");
  });

  it("m moves the selection to one of your lists, with Undo", async () => {
    render(<WideApp />);
    act(() => rowButton("Review PR").focus());
    press("m");
    const dialog = await screen.findByRole("dialog", {
      name: "Move “Review PR”",
    });
    const names = within(dialog)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(names).toEqual([
      "This week22",
      "Someday13",
      "Groceries1",
      "Studio1",
    ]);
    await userEvent.type(within(dialog).getByRole("combobox"), "groc{Enter}");
    expect(update).toHaveBeenCalledWith({
      id: "t1",
      input: expect.objectContaining({ listId: "list-groceries" }),
    });
    expect(toast.success).toHaveBeenCalledWith(
      "Moved to Groceries",
      expect.anything(),
    );
  });

  it("Move to offers a new list when nothing matches", async () => {
    createList.mockImplementation((_input, opts) =>
      opts.onSuccess({ ...lists[3], id: "list-new", name: "Garden" }),
    );
    render(<WideApp />);
    act(() => rowButton("Review PR").focus());
    press("m");
    const dialog = await screen.findByRole("dialog", {
      name: "Move “Review PR”",
    });
    await userEvent.type(within(dialog).getByRole("combobox"), "Garden");
    expect(
      within(dialog)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["New list “Garden”"]);
    await userEvent.keyboard("{Enter}");
    expect(createList).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Garden" }),
      expect.anything(),
    );
    expect(update).toHaveBeenCalledWith({
      id: "t1",
      input: expect.objectContaining({ listId: "list-new" }),
    });
    expect(toast.success).toHaveBeenCalledWith(
      "Moved to Garden",
      expect.anything(),
    );
  });

  it("leaves keys alone while typing", () => {
    render(<WideApp />);
    const field = screen.getByRole("textbox", { name: "New todo in Today" });
    field.focus();
    fireEvent.keyDown(field, { key: "j" });
    fireEvent.keyDown(field, { key: "x" });
    expect(document.activeElement).toBe(field);
    expect(update).not.toHaveBeenCalled();
  });

  it("one click selects, a second click opens the detail in the fourth column", async () => {
    render(<WideApp />);
    await userEvent.click(rowButton("Call Mum"));
    expect(rowButton("Call Mum").closest("div")).toHaveClass("ring-2");
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(rowButton("Call Mum"));
    const detail = await screen.findByRole("dialog");
    expect(detail).toHaveAttribute("data-detail-column");
    expect(detail.closest("[data-column-detail]")).toBeInTheDocument();
    expect(within(detail).getByRole("textbox", { name: "Title" })).toHaveValue(
      "Call Mum",
    );
    // The time columns stay; the detail took Done's place.
    expect(column("Today")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Done" })).toBeNull();
  });

  it("a double click opens straight away", async () => {
    render(<WideApp />);
    await userEvent.dblClick(rowButton("Send invoice"));
    expect(
      within(await screen.findByRole("dialog")).getByRole("textbox", {
        name: "Title",
      }),
    ).toHaveValue("Send invoice");
  });

  it("Enter opens, the detail follows the selection, and Esc closes it", async () => {
    render(<WideApp />);
    rowButton("Review PR").focus();
    await userEvent.keyboard("{Enter}");
    const title = () =>
      within(screen.getByRole("dialog")).getByRole("textbox", {
        name: "Title",
      });
    expect(title()).toHaveValue("Review PR");
    // Focus stays on the board, so arrowing shows each todo.
    expect(focusedTitle()).toContain("Review PR");
    press("j");
    expect(title()).toHaveValue("Call Mum");

    press("Escape");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(column("Done")).toBeInTheDocument();
  });

  it("closing a todo returns to the list it covered", async () => {
    render(<WideApp />);
    const nav = screen.getByRole("navigation", { name: "Lists" });
    await userEvent.click(
      within(nav).getByRole("button", { name: /Groceries/ }),
    );
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Groceries" })).toBeNull();
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Close",
      }),
    );
    expect(column("Groceries")).toBeInTheDocument();
  });

  it("Done's rows select; X puts one back and Delete removes one", () => {
    render(<WideApp />);
    const done = column("Done");
    const row = (title: string) =>
      within(done)
        .getAllByRole("button")
        .find(
          (b) =>
            b.hasAttribute("data-row-id") && b.textContent?.startsWith(title),
        ) as HTMLElement;
    row("Ship the zine").focus();
    press("x");
    expect(update).toHaveBeenCalledWith({
      id: "d1",
      input: expect.objectContaining({ completed: false }),
    });
    row("Book the venue").focus();
    press("Delete");
    expect(toast.success).toHaveBeenLastCalledWith(
      "Deleted",
      expect.anything(),
    );
    expect(row("Book the venue")).toBeUndefined();
  });

  it("renames a list in place from its title", async () => {
    render(<WideApp view={{ kind: "list", id: "list-groceries" }} />);
    await userEvent.click(
      within(column("Groceries")).getByRole("button", { name: "Groceries" }),
    );
    const field = screen.getByRole("textbox", { name: "List name" });
    await userEvent.clear(field);
    await userEvent.type(field, "Food{Enter}");
    expect(updateList).toHaveBeenCalledWith({
      id: "list-groceries",
      input: { name: "Food" },
    });
  });

  it("Esc cancels a rename", async () => {
    render(<WideApp view={{ kind: "list", id: "list-groceries" }} />);
    await userEvent.click(
      within(column("Groceries")).getByRole("button", { name: "Groceries" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "List name" }),
      "zzz{Escape}",
    );
    expect(updateList).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "List name" })).toBeNull();
  });

  it("deletes a list from its ⋯ menu straight away, with Undo", async () => {
    render(<WideApp view={{ kind: "list", id: "list-groceries" }} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Groceries options" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Delete list" }),
    );
    expect(toast.success).toHaveBeenCalledWith(
      "Deleted “Groceries” and 1 todo",
      expect.anything(),
    );
    const nav = screen.getByRole("navigation", { name: "Lists" });
    expect(within(nav).queryByRole("button", { name: /Groceries/ })).toBeNull();
    expect(column("Done")).toBeInTheDocument();
    expect(deleteList).not.toHaveBeenCalled();
  });

  it("quick add starts on the selection's column, with a chip per list", async () => {
    render(<WideApp />);
    rowButton("Read Piranesi").focus();
    await userEvent.click(screen.getByRole("button", { name: "New todo" }));
    const popup = await screen.findByRole("dialog", { name: "Quick add" });
    expect(
      within(popup).getByRole("textbox", { name: "New todo in Someday" }),
    ).toBeInTheDocument();
    expect(
      within(within(popup).getByRole("group", { name: "Add to list" }))
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Today", "This week", "Someday", "Groceries", "Studio"]);
  });

  it("the column composers have no list picker", async () => {
    render(<WideApp />);
    await userEvent.click(
      screen.getByRole("textbox", { name: "New todo in Today" }),
    );
    expect(screen.queryByRole("group", { name: "Add to list" })).toBeNull();
  });

  it("? toggles the shortcuts overlay", async () => {
    render(<WideApp />);
    fireEvent.keyDown(window, { key: "?" });
    expect(
      await screen.findByRole("dialog", { name: "Keyboard shortcuts" }),
    ).toBeInTheDocument();
  });

  it("shows the overnight note on Today and dismisses it", async () => {
    render(<WideApp />);
    const today = column("Today");
    expect(
      within(today).getByText("3 moved to Someday overnight"),
    ).toBeInTheDocument();
    await userEvent.click(
      within(today).getByRole("button", { name: "Dismiss overnight note" }),
    );
    expect(screen.queryByText("3 moved to Someday overnight")).toBeNull();
  });

  it.each([
    ["the sidebar", "Lists"],
    ["the toolbar", null],
  ])("creates a list from %s's New list popover", async (_where, nav) => {
    render(<WideApp />);
    const scope = nav
      ? within(screen.getByRole("navigation", { name: nav }))
      : within(screen.getByRole("main").parentElement as HTMLElement);
    await userEvent.click(scope.getByRole("button", { name: "New list" }));
    const popup = await screen.findByRole("dialog", { name: "New list" });
    await userEvent.type(
      within(popup).getByRole("textbox", { name: "Name" }),
      "Studio B{Enter}",
    );
    expect(createList).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Studio B" }),
      expect.anything(),
    );
  });
});

describe("WideApp URLs", () => {
  beforeEach(() => {
    todos = [
      makeTodo({ id: "w1", title: "Send invoice", listId: "list-week" }),
      makeTodo({ id: "g1", title: "Parmesan", listId: "list-groceries" }),
    ];
  });

  it("opens /list/:id as the fourth column and clears the URL on close", async () => {
    const onNavigate = vi.fn();
    render(
      <WideApp
        view={{ kind: "list", id: "list-groceries" }}
        onNavigate={onNavigate}
      />,
    );
    expect(column("Groceries")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Close Groceries" }),
    );
    expect(screen.queryByRole("region", { name: "Groceries" })).toBeNull();
    expect(onNavigate).toHaveBeenLastCalledWith(null);
  });

  it("writes /list/:id when a list opens from the sidebar", async () => {
    const onNavigate = vi.fn();
    render(<WideApp onNavigate={onNavigate} />);
    const nav = screen.getByRole("navigation", { name: "Lists" });
    await userEvent.click(within(nav).getByRole("button", { name: /Studio/ }));
    expect(onNavigate).toHaveBeenLastCalledWith({
      kind: "list",
      id: "list-studio",
    });
  });

  it("focuses This week's column for /this-week", () => {
    render(<WideApp view={{ kind: "thisWeek" }} />);
    expect(focusedTitle()).toContain("Send invoice");
  });
});
