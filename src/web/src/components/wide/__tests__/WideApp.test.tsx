import type { DndContextProps } from "@dnd-kit/core";
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
import {
  makeList,
  makeTodo,
  makeUrl,
} from "@/components/phone/__tests__/fixtures";
import type { TodoWithUrls } from "@/types/database";

const update = vi.fn();
const addUrl = vi.fn();
const remove = vi.fn();
const createList = vi.fn();
const updateList = vi.fn();
const deleteList = vi.fn();
const smartCreate = vi.fn();
let lists = [
  makeList("list-today", "Today", "today", "a0"),
  makeList("list-week", "This week", "thisWeek", "a1"),
  makeList("list-someday", "Someday", "someday", "a2"),
  makeList("list-groceries", "Groceries", null, "a3"),
  makeList("list-studio", "Studio", null, "a4"),
];
let todos: TodoWithUrls[] = [];
/** The lists' first load, before they arrive. */
let listsLoading = false;
const sweptAt = new Date().toISOString();

vi.mock("@/hooks/useLists", () => ({
  useLists: () => ({
    data: listsLoading ? undefined : lists,
    // As in the server render: no data, but nothing fetching yet either, so
    // `isLoading` is false. The board has to go by the missing data.
    isLoading: false,
    error: null,
  }),
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
  useUpdateTodo: () => ({
    mutate: update,
    mutateAsync: async (vars: unknown) => update(vars),
  }),
  useDeleteTodo: () => ({ mutate: remove }),
  useSmartCreate: () => ({ mutateAsync: smartCreate }),
  useCreateTodo: () => ({ mutate: vi.fn() }),
  useDeleteTodoUrl: () => ({ mutate: vi.fn() }),
  useAddTodoUrl: () => ({ mutate: addUrl }),
  useProcessTodo: () => ({ mutate: vi.fn() }),
  useUpdateUrlPreview: () => ({ mutate: vi.fn() }),
}));
/** The client's Reduce motion hint; the drag tests turn it off. */
let reducedMotion = "reduce";
vi.mock("@/hooks/useHints", () => ({
  useHints: () => ({ timeZone: "UTC", reducedMotion }),
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

// The real DndContext, with its handlers kept so tests can drive a drag:
// jsdom has no layout for dnd-kit's own pointer maths.
let dnd: DndContextProps;
vi.mock("@dnd-kit/core", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@dnd-kit/core")>();
  const { createElement } = await import("react");
  return {
    ...mod,
    DndContext: (props: DndContextProps) => {
      dnd = props;
      return createElement(mod.DndContext, props);
    },
  };
});

import { toast } from "@/lib/toast";
import { COLUMN_WIDTH } from "../Column";
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

/** The selected todo, and the column it's in. */
const selection = () => {
  const row = (
    document.activeElement as HTMLElement | null
  )?.closest<HTMLElement>("[data-row-id]");
  if (!row?.closest("[data-row-container]")?.hasAttribute("data-selected")) {
    return null;
  }
  return {
    id: row.dataset.rowId,
    column: row.closest<HTMLElement>("[data-column]")?.dataset.column,
  };
};
/** A column's todos, top to bottom. */
const rowIds = (listId: string) =>
  [
    ...document.querySelectorAll<HTMLElement>(
      `[data-column="${listId}"] [data-row-id]`,
    ),
  ].map((r) => r.dataset.rowId);
/** `update` as the cache applies it; the next render shows the change. */
const liveUpdates = () =>
  update.mockImplementation(
    ({ id, input }: { id: string; input: Partial<TodoWithUrls> }) => {
      todos = todos.map((t) => (t.id === id ? { ...t, ...input } : t));
    },
  );

/** The board row's children, left to right: columns, the sheet and the end. */
const slides = () =>
  [
    ...document.querySelectorAll<HTMLElement>(
      'main[aria-label="Board"] > [data-slide]',
    ),
  ].map((el) => el.dataset.slide);

/**
 * Lays the board out `width` px wide, unscrolled: each column 272px (17rem)
 * and the sheet 400px, overlapping its column by 48px. jsdom has no layout.
 */
const layOutBoard = (width: number) => {
  const board = screen.getByRole("main", { name: "Board" });
  const widthOf = (el: HTMLElement) =>
    el.dataset.slide === "sheet" ? 400 : 272;
  Object.defineProperty(board, "clientWidth", {
    configurable: true,
    value: width,
  });
  board.scrollLeft = 0;
  board.scrollTo = vi.fn();
  board.scrollBy = vi.fn();
  board.getBoundingClientRect = () =>
    ({
      left: 240,
      right: 240 + width,
      top: 50,
      bottom: 850,
      width,
      height: 800,
    }) as DOMRect;
  const leftOf = (el: HTMLElement) => {
    let x = 0;
    let sheet = el.dataset.slide === "sheet";
    for (
      let sib = el.previousElementSibling as HTMLElement | null;
      sib;
      sib = sib.previousElementSibling as HTMLElement | null
    ) {
      x += widthOf(sib);
      if (sib.dataset.slide === "sheet") sheet = true;
    }
    return sheet ? x - 48 : x;
  };
  const restore = [
    ["offsetLeft", (el: HTMLElement) => leftOf(el)],
    ["offsetWidth", (el: HTMLElement) => widthOf(el)],
  ] as const;
  for (const [prop, get] of restore) {
    Object.defineProperty(HTMLElement.prototype, prop, {
      configurable: true,
      get(this: HTMLElement) {
        return this.parentElement === board && this.dataset.slide
          ? get(this)
          : 0;
      },
    });
  }
  return board;
};

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const jsdomLayout = (["offsetLeft", "offsetWidth"] as const).map(
  (prop) =>
    [
      prop,
      Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop),
    ] as const,
);
afterEach(() => {
  // `layOutBoard`'s layout, back to jsdom's none.
  for (const [prop, descriptor] of jsdomLayout) {
    if (descriptor) {
      Object.defineProperty(HTMLElement.prototype, prop, descriptor);
    }
  }
});

describe("WideApp", () => {
  beforeEach(() => {
    update.mockReset();
    addUrl.mockReset();
    remove.mockReset();
    createList.mockReset();
    updateList.mockReset();
    deleteList.mockReset();
    // Saves the todo as the API would, at the top of its list.
    let added = 0;
    smartCreate.mockReset();
    smartCreate.mockImplementation(
      async ({ text, listId }: { text: string; listId: string }) => {
        added += 1;
        const todo = makeTodo({
          id: `added-${added}`,
          title: text,
          listId,
          position: `0${100 - added}`,
        });
        todos = [todo, ...todos];
        return { todos: [todo] };
      },
    );
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
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
    // No list is "the open one": every list is on the board.
    expect(groceries).not.toHaveAttribute("aria-current");
  });

  it("draws the board's shape while it loads, instead of Done across it", () => {
    listsLoading = true;
    try {
      render(<WideApp />);
      const board = screen.getByRole("main", { name: "Board" });
      // The three time columns hold their places, by name, beside Done.
      expect(
        [...board.querySelectorAll("[data-column]")].map((c) =>
          c.getAttribute("data-column"),
        ),
      ).toEqual([
        "skeleton-today",
        "skeleton-thisWeek",
        "skeleton-someday",
        "done",
      ]);
      expect(
        within(board)
          .getAllByRole("heading", { level: 2 })
          .map((h) => h.textContent),
      ).toEqual(["Today", "This week", "Someday", "Done"]);
      // Placeholder rows everywhere, and no false empty state for Done.
      expect(board.querySelectorAll("[data-skeleton-rows]")).toHaveLength(4);
      expect(within(board).queryByText("Nothing done yet.")).toBeNull();
      // Screen readers hear "Loading…"; nothing in a placeholder takes focus.
      expect(within(board).getAllByText("Loading…").length).toBeGreaterThan(0);
      for (const column of board.querySelectorAll(
        '[data-column^="skeleton-"]',
      )) {
        expect(
          column.querySelectorAll("button, input, textarea, [tabindex='0']"),
        ).toHaveLength(0);
      }
      // The sidebar shows the time lists too, as placeholders.
      expect(
        [...document.querySelectorAll("[data-skeleton-entry]")].map(
          (e) => e.textContent,
        ),
      ).toEqual(["Today", "This week", "Someday"]);
    } finally {
      listsLoading = false;
    }
  });

  it("lays out the time lists, every list in the sidebar's order, then Done", () => {
    render(<WideApp />);
    expect(
      screen.getAllByRole("region").map((r) => r.getAttribute("data-column")),
    ).toEqual([
      "list-today",
      "list-week",
      "list-someday",
      "list-groceries",
      "list-studio",
      "done",
    ]);
    expect(
      within(column("Done")).getByText("Ship the zine"),
    ).toBeInTheDocument();
    // Nothing to close: no column has a ×.
    expect(screen.queryAllByRole("button", { name: /^Close / })).toEqual([]);
    // Every column keeps one width; only Done has a tint.
    for (const region of screen.getAllByRole("region")) {
      expect(region).toHaveClass(...COLUMN_WIDTH.split(" "));
      expect(region.classList.contains("bg-n-surface")).toBe(
        region === column("Done"),
      );
    }
    const more = screen.getByRole("navigation", { name: "More" });
    expect(
      within(more).getByRole("button", { name: "Done" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("sizes every column as a quarter of the board, between the board tokens", () => {
    render(<WideApp />);
    expect(COLUMN_WIDTH).toBe(
      "w-[clamp(var(--n-board-column-min-width),25cqi,var(--n-board-column-max-width))] shrink-0",
    );
    // The quarter is of `main`, the board, whatever the sidebar takes.
    expect(screen.getByRole("main", { name: "Board" })).toHaveClass(
      "@container",
    );
  });

  it("gives the skeleton's columns the same width, and the end after Done", () => {
    listsLoading = true;
    try {
      render(<WideApp />);
      const board = screen.getByRole("main", { name: "Board" });
      for (const c of board.querySelectorAll("[data-column]")) {
        expect(c).toHaveClass(...COLUMN_WIDTH.split(" "));
      }
      expect(board.lastElementChild).toHaveAttribute("data-board-end");
    } finally {
      listsLoading = false;
    }
  });

  it("ends the board after Done with a hairline and the hatch, and nothing to click", async () => {
    render(<WideApp />);
    const board = screen.getByRole("main", { name: "Board" });
    const end = () => board.lastElementChild as HTMLElement;
    // Done closes on a hairline whether or not the columns fill the board.
    expect(column("Done")).toHaveClass("border-x", "border-n-hairline");
    expect(end()).toHaveAttribute("data-board-end");
    expect(end().previousElementSibling).toBe(column("Done"));
    // Fills what's left, down to nothing, so it shrinks rather than appears.
    expect(end()).toHaveClass("n-board-hatch", "flex-1", "min-w-0");
    expect(end()).toHaveAttribute("aria-hidden", "true");
    expect(end().childElementCount).toBe(0);
    expect(end()).not.toHaveAttribute("tabindex");
    // A click there selects nothing and opens nothing.
    await userEvent.click(rowButton("Call Mum"));
    await userEvent.click(end());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      rowButton("Call Mum").closest("[data-row-container]"),
    ).toHaveAttribute("data-selected");

    // Still last, after Done, with a todo open.
    await userEvent.click(rowButton("Call Mum"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(end()).toHaveAttribute("data-board-end");
    expect(end().previousElementSibling).toBe(column("Done"));
  });

  it("opening a todo changes no column's width", async () => {
    render(<WideApp />);
    const expectShared = () => {
      const columns = document.querySelectorAll<HTMLElement>(
        'main[aria-label="Board"] > [data-column]',
      );
      expect(columns).toHaveLength(6);
      for (const c of columns)
        expect(c).toHaveClass(...COLUMN_WIDTH.split(" "));
    };
    expectShared();
    await userEvent.dblClick(rowButton("Call Mum"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(slides()).toContain("sheet");
    // Its own column too: only the padding moves in clear of the sheet.
    expectShared();
  });

  it("a new list arrives before Done, and the others keep their width", () => {
    const { rerender } = render(<WideApp />);
    const before = lists;
    lists = [...lists, makeList("list-zines", "Zines", null, "a5")];
    try {
      rerender(<WideApp />);
      expect(slides()).toEqual([
        "list-today",
        "list-week",
        "list-someday",
        "list-groceries",
        "list-studio",
        "list-zines",
        "done",
        "end",
      ]);
      for (const region of screen.getAllByRole("region")) {
        expect(region).toHaveClass(...COLUMN_WIDTH.split(" "));
      }
    } finally {
      lists = before;
    }
  });

  it("rows hover with the same 60% fill in every column and the open todo", async () => {
    const HOVER = "pointer-fine:hover:bg-n-fill/60";
    const container = (title: string) =>
      rowButton(title).closest("[data-row-container]");
    render(<WideApp />);
    expect(container("Review PR")).toHaveClass(HOVER);
    // Done, in the tinted fourth column: no surface hover to vanish into it.
    const done = within(column("Done"))
      .getByText("Ship the zine")
      .closest("[data-row-container]");
    expect(done).toHaveClass(HOVER);
    // Going to your list selects its first row: the full fill instead, so
    // hovered and selected differ.
    const nav = screen.getByRole("navigation", { name: "Lists" });
    await userEvent.click(
      within(nav).getByRole("button", { name: /Groceries/ }),
    );
    expect(container("Parmesan")).toHaveClass("bg-n-fill");
    expect(container("Parmesan")).not.toHaveClass(HOVER);
    // The open todo's rows.
    act(() => rowButton("Send invoice").focus());
    await userEvent.keyboard("{Enter}");
    const detail = screen.getByRole("dialog");
    expect(
      within(detail)
        .getAllByRole("button")
        .some((b) => b.classList.contains(HOVER)),
    ).toBe(true);
    expect(detail.innerHTML).not.toContain("n-row-hover");
  });

  it("the sidebar scrolls a narrow board the least that shows the column, and goes in", async () => {
    render(<WideApp />);
    const board = layOutBoard(600);
    const nav = screen.getByRole("navigation", { name: "Lists" });
    // Studio is the fifth column: 1088–1360px.
    await userEvent.click(within(nav).getByRole("button", { name: /Studio/ }));
    expect(board.scrollTo).toHaveBeenLastCalledWith({
      left: 1360 - 600,
      behavior: "auto",
    });
    expect(focusedTitle()).toContain("Mix the EP");
    // Nothing was swapped to get there.
    expect(column("Groceries")).toBeInTheDocument();
    expect(column("Done")).toBeInTheDocument();

    // Back to Today, at the start.
    board.scrollLeft = 760;
    await userEvent.click(within(nav).getByRole("button", { name: /Today/ }));
    expect(board.scrollTo).toHaveBeenLastCalledWith({
      left: 0,
      behavior: "auto",
    });
    // Already in view: no scroll.
    board.scrollLeft = 0;
    vi.mocked(board.scrollTo).mockClear();
    await userEvent.click(
      within(nav).getByRole("button", { name: /This week/ }),
    );
    expect(board.scrollTo).not.toHaveBeenCalled();
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

  it("1/2/3 move the focused todo, and it stays selected in its new column", () => {
    const { container, rerender } = render(<WideApp />);
    liveUpdates();
    rowButton("Review PR").focus();
    press("2");
    expect(update).toHaveBeenCalledWith({
      id: "t1",
      input: expect.objectContaining({ listId: "list-week" }),
    });
    expect(toast.success).toHaveBeenCalledWith(
      "Moved to this week",
      expect.anything(),
    );
    rerender(<WideApp />);
    // At the top of This week, with the keyboard's bar; Today's next todo
    // isn't selected.
    expect(selection()).toEqual({ id: "t1", column: "list-week" });
    expect(rowIds("list-week")[0]).toBe("t1");
    expect(container.querySelector("[data-wide-ready]")).toHaveAttribute(
      "data-keyboard",
    );
    expect(
      rowButton("Review PR")
        .closest("li")
        ?.querySelector("[data-row-selection-bar]"),
    ).toBeInTheDocument();
    expect(
      rowButton("Call Mum").closest("[data-row-container]"),
    ).not.toHaveAttribute("data-selected");

    press("3");
    rerender(<WideApp />);
    expect(selection()).toEqual({ id: "t1", column: "list-someday" });
    press("1");
    rerender(<WideApp />);
    expect(selection()).toEqual({ id: "t1", column: "list-today" });
    // Already in Today: nothing to do.
    update.mockClear();
    press("1");
    expect(update).not.toHaveBeenCalled();
  });

  it("Undo puts a moved todo back, still selected", () => {
    const { rerender } = render(<WideApp />);
    liveUpdates();
    rowButton("Review PR").focus();
    press("2");
    rerender(<WideApp />);
    expect(selection()).toEqual({ id: "t1", column: "list-week" });
    press("z");
    expect(update).toHaveBeenLastCalledWith({
      id: "t1",
      input: { listId: "list-today", position: "a0" },
    });
    rerender(<WideApp />);
    expect(selection()).toEqual({ id: "t1", column: "list-today" });
  });

  it("a move the server refuses goes back, still selected", async () => {
    const { rerender } = render(<WideApp />);
    liveUpdates();
    // The server refuses every move, and each is rolled back.
    const refusals: (() => void)[] = [];
    update.mockImplementation(
      ({ id, input }: { id: string; input: Partial<TodoWithUrls> }) => {
        const before = todos.find((t) => t.id === id);
        todos = todos.map((t) => (t.id === id ? { ...t, ...input } : t));
        return new Promise((_, reject) => {
          refusals.push(() => {
            todos = todos.map((t) => (t.id === id && before ? before : t));
            reject(new Error("refused"));
          });
        });
      },
    );
    rowButton("Review PR").focus();
    press("2");
    rerender(<WideApp />);
    expect(selection()).toEqual({ id: "t1", column: "list-week" });
    // A second move before the first is refused: the first's refusal is
    // still heard, not only the latest call's.
    press("3");
    rerender(<WideApp />);
    expect(selection()).toEqual({ id: "t1", column: "list-someday" });
    await act(async () => refusals[1]());
    rerender(<WideApp />);
    expect(selection()).toEqual({ id: "t1", column: "list-week" });
    await act(async () => refusals[0]());
    rerender(<WideApp />);
    expect(selection()).toEqual({ id: "t1", column: "list-today" });
  });

  it("x and Delete still hand the selection to the next todo", () => {
    render(<WideApp />);
    rowButton("Review PR").focus();
    press("x");
    expect(focusedTitle()).toContain("Call Mum");
    rowButton("Send invoice").focus();
    press("Backspace");
    expect(focusedTitle()).toContain("Renew passport");
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
      within(quick).getByRole("textbox", { name: "New todo in someday" }),
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

  it("moving with the keys adds the bar beside the selection; a click takes it away", async () => {
    const { container } = render(<WideApp />);
    const board = container.querySelector("[data-wide-ready]");
    const bar = () =>
      rowButton("Call Mum")
        .closest("li")
        ?.querySelector("[data-row-selection-bar]");
    await userEvent.click(rowButton("Review PR"));
    expect(board).not.toHaveAttribute("data-keyboard");
    press("j");
    expect(focusedTitle()).toContain("Call Mum");
    expect(board).toHaveAttribute("data-keyboard");
    expect(bar()).toBeInTheDocument();
    await userEvent.click(rowButton("Send invoice"));
    expect(board).not.toHaveAttribute("data-keyboard");
  });

  it("← into the sidebar lets go of the todo, as Esc does; → reselects it", () => {
    render(<WideApp />);
    const container = () =>
      rowButton("Call Mum").closest("[data-row-container]");
    act(() => rowButton("Call Mum").focus());
    expect(container()).toHaveAttribute("data-selected");
    press("ArrowLeft");
    expect(document.activeElement).toHaveAccessibleName("Today");
    expect(container()).not.toHaveAttribute("data-selected");
    press("ArrowRight");
    expect(document.activeElement).toBe(rowButton("Call Mum"));
    expect(container()).toHaveAttribute("data-selected");
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
    // Into the sidebar lets go of the todo…
    const container = () =>
      rowButton("Send invoice").closest("[data-row-container]");
    expect(container()).not.toHaveAttribute("data-selected");
    // …and → goes back in to the column's last one.
    press("ArrowRight");
    expect(document.activeElement).toBe(rowButton("Send invoice"));
    expect(container()).toHaveAttribute("data-selected");
  });

  it("a click on a column's empty space focuses it and selects nothing", async () => {
    render(<WideApp />);
    act(() => rowButton("Send invoice").focus());
    const container = () =>
      rowButton("Send invoice").closest("[data-row-container]");
    expect(container()).toHaveAttribute("data-selected");
    const week =
      rowButton("Send invoice").closest<HTMLElement>("[data-column]");
    const someday = document.querySelector<HTMLElement>(
      `[data-column]:not([data-column="${week?.dataset.column}"]) [data-column-body]`,
    );
    // The empty space under Someday's rows.
    await userEvent.click(someday as HTMLElement);
    expect(container()).not.toHaveAttribute("data-selected");
    expect(document.activeElement?.hasAttribute("data-column-head")).toBe(true);
    // ↓ starts at the top of the column that has focus.
    const column =
      document.activeElement?.closest<HTMLElement>("[data-column]");
    press("ArrowDown");
    expect(document.activeElement?.closest("[data-column]")).toBe(column);
    expect(document.activeElement?.hasAttribute("data-row-id")).toBe(true);
  });

  it("a click on a column's empty space shows no ring, even after key presses", async () => {
    const { container } = render(<WideApp />);
    const board = container.querySelector("[data-wide-ready]");
    act(() => rowButton("Send invoice").focus());
    press("ArrowDown");
    press("ArrowUp");
    expect(board).toHaveAttribute("data-keyboard");
    const someday =
      column("Someday").querySelector<HTMLElement>("[data-column-body]");
    await userEvent.click(someday as HTMLElement);
    const head = document.activeElement as HTMLElement;
    expect(head).toHaveAttribute("data-column-head", "list-someday");
    expect(board).not.toHaveAttribute("data-keyboard");
    // Its only focus look waits for the keyboard: no ring of its own.
    expect(head).not.toHaveClass("n-focus");
    expect(head.className).toMatch(
      /(^| )group-data-\[keyboard\]\/board:focus:bg-/,
    );
  });

  it("→ into an empty column tints its head", () => {
    todos = todos.filter((t) => t.listId !== "list-someday");
    const { container } = render(<WideApp />);
    const board = container.querySelector("[data-wide-ready]");
    act(() => rowButton("Send invoice").focus());
    press("ArrowRight");
    const head = document.activeElement as HTMLElement;
    expect(head).toHaveAttribute("data-column-head", "list-someday");
    expect(board).toHaveAttribute("data-keyboard");
    expect(head.className).toContain(
      "group-data-[keyboard]/board:focus:bg-[color-mix(in_srgb,currentColor_20%,transparent)]",
    );
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
    const field = screen.getByRole("textbox", { name: "New todo in today" });
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

  it("Move to keeps the todo selected, and scrolls to a list off screen", async () => {
    const { rerender } = render(<WideApp />);
    liveUpdates();
    const board = layOutBoard(600);
    act(() => rowButton("Review PR").focus());
    press("m");
    const dialog = await screen.findByRole("dialog", {
      name: "Move “Review PR”",
    });
    await userEvent.type(within(dialog).getByRole("combobox"), "stud{Enter}");
    rerender(<WideApp />);
    expect(selection()).toEqual({ id: "t1", column: "list-studio" });
    // Studio is the fifth column: 1088–1360px.
    expect(board.scrollTo).toHaveBeenLastCalledWith({
      left: 1360 - 600,
      behavior: "auto",
    });
  });

  it("the right-click menu's Move keeps the todo selected", async () => {
    const { rerender } = render(<WideApp />);
    liveUpdates();
    fireEvent.contextMenu(rowButton("Review PR"), {
      clientX: 200,
      clientY: 200,
    });
    const menu = await screen.findByRole("menu", { name: "Todo actions" });
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: /Move to This week/ }),
    );
    rerender(<WideApp />);
    expect(selection()).toEqual({ id: "t1", column: "list-week" });
  });

  it("with a todo open, 2 keeps it open, beside its new column", async () => {
    const { rerender } = render(<WideApp />);
    liveUpdates();
    rowButton("Review PR").focus();
    await userEvent.keyboard("{Enter}");
    press("2");
    rerender(<WideApp />);
    expect(
      within(screen.getByRole("dialog")).getByRole("textbox", {
        name: "Title",
      }),
    ).toHaveValue("Review PR");
    expect(selection()).toEqual({ id: "t1", column: "list-week" });
    expect(slides()).toEqual([
      "list-today",
      "list-week",
      "sheet",
      "list-someday",
      "list-groceries",
      "list-studio",
      "done",
      "end",
    ]);
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

  it("Move to a new list keeps the todo selected in the new column", async () => {
    const garden = makeList("list-new", "Garden", null, "a5");
    const before = lists;
    createList.mockImplementation((_input, opts) => {
      lists = [...lists, garden];
      opts.onSuccess(garden);
    });
    try {
      const { rerender } = render(<WideApp />);
      liveUpdates();
      act(() => rowButton("Review PR").focus());
      press("m");
      const dialog = await screen.findByRole("dialog", {
        name: "Move “Review PR”",
      });
      await userEvent.type(
        within(dialog).getByRole("combobox"),
        "Garden{Enter}",
      );
      rerender(<WideApp />);
      expect(selection()).toEqual({ id: "t1", column: "list-new" });
    } finally {
      lists = before;
    }
  });

  it("leaves keys alone while typing", () => {
    render(<WideApp />);
    const field = screen.getByRole("textbox", { name: "New todo in today" });
    field.focus();
    fireEvent.keyDown(field, { key: "j" });
    fireEvent.keyDown(field, { key: "x" });
    expect(document.activeElement).toBe(field);
    expect(update).not.toHaveBeenCalled();
  });

  it("marks your lists' columns with the list icon, and the time columns and Done with none", () => {
    render(<WideApp />);
    for (const name of ["Groceries", "Studio"]) {
      const icons = column(name).querySelectorAll("header [data-icon]");
      expect([...icons].map((i) => i.getAttribute("data-icon"))).toEqual([
        "list",
      ]);
      expect(icons[0]).toHaveAttribute("aria-hidden", "true");
    }
    for (const name of ["Today", "This week", "Someday", "Done"]) {
      expect(column(name).querySelector("[data-icon]")).toBeNull();
    }
  });

  it("the open todo's header marks it as a todo, on the line where a list's has its icon", async () => {
    render(<WideApp />);
    await userEvent.dblClick(rowButton("Parmesan"));
    const detail = await screen.findByRole("dialog");
    const icon = detail.querySelector("header [data-icon]");
    expect(icon).toHaveAttribute("data-icon", "todo");
    expect(icon?.parentElement).toHaveTextContent("In Groceries");
    expect(icon?.parentElement?.className).toBe(
      column("Groceries").querySelector("header [data-icon]")?.parentElement
        ?.className,
    );
  });

  it("one click selects, a second click opens the todo in a sheet right after its column", async () => {
    render(<WideApp />);
    await userEvent.click(rowButton("Call Mum"));
    expect(
      rowButton("Call Mum").closest("[data-row-container]"),
    ).toHaveAttribute("data-selected");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(slides()).not.toContain("sheet");

    await userEvent.click(rowButton("Call Mum"));
    const detail = await screen.findByRole("dialog");
    expect(detail).toHaveAttribute("data-detail-column");
    expect(detail.closest("[data-board-sheet]")).toBeInTheDocument();
    expect(within(detail).getByRole("textbox", { name: "Title" })).toHaveValue(
      "Call Mum",
    );
    // Laid in after Today; everything after it keeps its order.
    expect(slides()).toEqual([
      "list-today",
      "sheet",
      "list-week",
      "list-someday",
      "list-groceries",
      "list-studio",
      "done",
      "end",
    ]);
  });

  it("a todo open in a list puts the sheet after that list, before the rest", async () => {
    render(<WideApp />);
    await userEvent.dblClick(rowButton("Parmesan"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(slides()).toEqual([
      "list-today",
      "list-week",
      "list-someday",
      "list-groceries",
      "sheet",
      "list-studio",
      "done",
      "end",
    ]);
  });

  it("the open todo's column recedes, bar its selected row, and nothing else does", async () => {
    const RECEDE = "opacity-(--n-sheet-recede)";
    render(<WideApp />);
    await userEvent.dblClick(rowButton("Read Piranesi"));
    await screen.findByRole("dialog");
    const someday = column("Someday");
    expect(someday).toHaveAttribute("data-sheet-open");
    // Its header and Add field recede, and its contents move in clear of
    // the sheet's overlap.
    expect(someday.querySelector("header")).toHaveClass(
      RECEDE,
      "pr-(--n-sheet-overlap)",
    );
    expect(someday.querySelector("[data-column-composer]")).toHaveClass(RECEDE);
    expect(someday.querySelector("[data-column-body]")).toHaveClass(
      "pr-(--n-sheet-overlap)",
    );
    // The rows recede unless selected; the selected row's fill runs on
    // under the sheet.
    const rows = someday.querySelector("[data-row-list]");
    expect(rows?.className).toContain(
      `[&_[data-row-container]:not([data-selected])]:${RECEDE}`,
    );
    expect(rows?.className).toContain(
      "[&_[data-row-container][data-selected]]:shadow-",
    );
    expect(
      rowButton("Read Piranesi").closest("[data-row-container]"),
    ).toHaveAttribute("data-selected");
    // No other column recedes.
    for (const region of screen.getAllByRole("region")) {
      if (region === someday) continue;
      expect(region).not.toHaveAttribute("data-sheet-open");
      expect(region.innerHTML).not.toContain(RECEDE);
    }
  });

  it("the sheet follows the selection to a list from the sidebar, and Done closes it", async () => {
    render(<WideApp />);
    await userEvent.dblClick(rowButton("Review PR"));
    await screen.findByRole("dialog");
    const nav = screen.getByRole("navigation", { name: "Lists" });
    await userEvent.click(
      within(nav).getByRole("button", { name: /Groceries/ }),
    );
    expect(
      within(screen.getByRole("dialog")).getByRole("textbox", {
        name: "Title",
      }),
    ).toHaveValue("Parmesan");
    expect(slides().indexOf("sheet")).toBe(
      slides().indexOf("list-groceries") + 1,
    );
    expect(column("Groceries")).toHaveAttribute("data-sheet-open");
    expect(column("Today")).not.toHaveAttribute("data-sheet-open");

    const more = screen.getByRole("navigation", { name: "More" });
    await userEvent.click(within(more).getByRole("button", { name: /Done/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(slides()).not.toContain("sheet");
  });

  it("opening a todo scrolls its column and the sheet into view together", async () => {
    render(<WideApp />);
    const board = layOutBoard(700);
    // Studio, 1088–1360px; its sheet overlaps it by 48px, to 1712px.
    await userEvent.dblClick(rowButton("Mix the EP"));
    await screen.findByRole("dialog");
    expect(board.scrollTo).toHaveBeenLastCalledWith({
      left: 1712 - 700,
      behavior: "auto",
    });
  });

  it("Esc from inside the sheet closes it and leaves the selection on its row", async () => {
    render(<WideApp />);
    await userEvent.dblClick(rowButton("Send invoice"));
    const title = within(await screen.findByRole("dialog")).getByRole(
      "textbox",
      { name: "Title" },
    );
    act(() => title.focus());
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(r));
    });
    expect(document.activeElement).toBe(rowButton("Send invoice"));
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

  it("closing the sheet takes it off the board and leaves the selection on its row", async () => {
    render(<WideApp />);
    const nav = screen.getByRole("navigation", { name: "Lists" });
    await userEvent.click(
      within(nav).getByRole("button", { name: /Groceries/ }),
    );
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    // The list it came from stays in view beside it.
    expect(column("Groceries")).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Close",
      }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(slides()).not.toContain("sheet");
    expect(column("Groceries")).not.toHaveAttribute("data-sheet-open");
    expect(
      rowButton("Parmesan").closest("[data-row-container]"),
    ).toHaveAttribute("data-selected");
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
      within(popup).getByRole("textbox", { name: "New todo in someday" }),
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
      screen.getByRole("textbox", { name: "New todo in today" }),
    );
    expect(screen.queryByRole("group", { name: "Add to list" })).toBeNull();
  });

  describe("adding opens the new todo, and focus stays in Add", () => {
    const sheet = () =>
      document.querySelector<HTMLElement>("[data-detail-column]");
    const sheetTitle = () =>
      sheet() &&
      within(sheet() as HTMLElement).getByRole<HTMLTextAreaElement>("textbox", {
        name: "Title",
      }).value;
    /** Lets each add's save land, as the composer awaits them in turn. */
    const settle = () => act(async () => {});

    it("from Today's Add: beside Today, the next add replaces it, and Esc lands on it", async () => {
      render(<WideApp />);
      const add = screen.getByRole("textbox", { name: "New todo in today" });
      await userEvent.type(add, "Get Rex{Enter}");
      await settle();
      expect(sheetTitle()).toBe("Get Rex");
      expect(slides().indexOf("sheet")).toBe(
        slides().indexOf("list-today") + 1,
      );
      expect(document.activeElement).toBe(add);
      expect(add).toHaveValue("");

      await userEvent.type(add, "Walk dog{Enter}");
      await settle();
      expect(sheetTitle()).toBe("Walk dog");
      expect(document.activeElement).toBe(add);

      // Esc leaves Add, then closes the todo onto its row.
      await userEvent.keyboard("{Escape}");
      expect(document.activeElement).not.toBe(add);
      expect(sheetTitle()).toBe("Walk dog");
      press("Escape");
      expect(sheet()).toBeNull();
      expect(
        rowButton("Walk dog").closest("[data-row-container]"),
      ).toHaveAttribute("data-selected");
    });

    it("from one of your lists' Add: beside that list", async () => {
      render(<WideApp />);
      const add = screen.getByRole("textbox", {
        name: "New todo in Groceries",
      });
      await userEvent.type(add, "Buy stamps{Enter}");
      await settle();
      expect(sheetTitle()).toBe("Buy stamps");
      expect(slides().indexOf("sheet")).toBe(
        slides().indexOf("list-groceries") + 1,
      );
      expect(column("Groceries")).toHaveAttribute("data-sheet-open");
      expect(document.activeElement).toBe(add);
    });

    it("a pasted list opens nothing, and leaves an open todo open", async () => {
      render(<WideApp />);
      const add = screen.getByRole("textbox", { name: "New todo in today" });
      await userEvent.click(add);
      await userEvent.paste("Eggs\nFlour");
      await userEvent.keyboard("{Enter}");
      await settle();
      expect(smartCreate).toHaveBeenCalledTimes(2);
      expect(sheet()).toBeNull();

      await userEvent.dblClick(rowButton("Send invoice"));
      expect(sheetTitle()).toBe("Send invoice");
      await userEvent.click(add);
      await userEvent.paste("Milk\nButter");
      await userEvent.keyboard("{Enter}");
      await settle();
      expect(smartCreate).toHaveBeenCalledTimes(4);
      expect(sheetTitle()).toBe("Send invoice");
    });

    it("an add that fails to save opens nothing", async () => {
      smartCreate.mockRejectedValueOnce(new Error("Offline"));
      render(<WideApp />);
      const add = screen.getByRole("textbox", { name: "New todo in today" });
      await userEvent.type(add, "Get Rex{Enter}");
      await settle();
      expect(sheet()).toBeNull();
      expect(add).toHaveValue("Get Rex");
      expect(toast.error).toHaveBeenCalledWith("Offline");
    });

    it("from Quick add: behind the popover, which keeps focus, with no toast", async () => {
      render(<WideApp />);
      press("n");
      const popup = await screen.findByRole("dialog", { name: "Quick add" });
      await userEvent.click(
        within(popup).getByRole("button", { name: "Groceries" }),
      );
      const field = within(popup).getByRole("textbox", {
        name: "New todo in Groceries",
      });
      await userEvent.type(field, "Call vet{Enter}");
      await settle();
      expect(sheetTitle()).toBe("Call vet");
      expect(slides().indexOf("sheet")).toBe(
        slides().indexOf("list-groceries") + 1,
      );
      expect(screen.getByRole("dialog", { name: "Quick add" })).toBe(popup);
      expect(document.activeElement).toBe(field);
      expect(toast.success).not.toHaveBeenCalled();
      expect(
        rowButton("Call vet").closest("[data-row-container]"),
      ).toHaveAttribute("data-selected");

      // A pasted list opens nothing new.
      await userEvent.paste("Eggs\nFlour");
      await userEvent.keyboard("{Enter}");
      await settle();
      expect(smartCreate).toHaveBeenCalledTimes(3);
      expect(sheetTitle()).toBe("Call vet");
    });

    it("a pasted list from Quick add opens nothing", async () => {
      render(<WideApp />);
      press("n");
      const popup = await screen.findByRole("dialog", { name: "Quick add" });
      await userEvent.click(
        within(popup).getByRole("textbox", { name: "New todo in today" }),
      );
      await userEvent.paste("Eggs\nFlour");
      await userEvent.keyboard("{Enter}");
      await settle();
      expect(smartCreate).toHaveBeenCalledTimes(2);
      expect(sheet()).toBeNull();
      expect(screen.getByRole("dialog", { name: "Quick add" })).toBe(popup);
    });
  });

  it("? toggles the shortcuts overlay", async () => {
    render(<WideApp />);
    fireEvent.keyDown(window, { key: "?" });
    expect(
      await screen.findByRole("dialog", { name: "Keyboard shortcuts" }),
    ).toBeInTheDocument();
  });

  it("shows the overnight pill above Today's title, which goes to Someday", async () => {
    render(<WideApp />);
    const today = column("Today");
    const pill = within(today)
      .getAllByRole("status")
      .find((s) => s.hasAttribute("data-overnight-note")) as HTMLElement;
    expect(pill.closest("header")).toBeInTheDocument();
    await userEvent.click(
      within(pill).getByRole("button", { name: "3 moved to someday" }),
    );
    expect(focusedTitle()).toContain("Read Piranesi");
    await userEvent.click(
      within(pill).getByRole("button", { name: "Dismiss overnight note" }),
    );
    expect(screen.queryByText("3 moved to someday")).toBeNull();
  });

  it("every column keeps the banner's space, so titles line up", () => {
    render(<WideApp />);
    for (const region of screen.getAllByRole("region")) {
      expect(region.querySelector("[data-banner-slot]")).toBeInTheDocument();
    }
  });

  it("each column is one tab stop: its selected row, else its first", () => {
    render(<WideApp />);
    const stops = () =>
      within(column("Today"))
        .getAllByRole("button")
        .filter((b) => b.hasAttribute("data-row-id"))
        .map((b) => [b.textContent?.slice(0, 9), b.tabIndex]);
    expect(stops()).toEqual([
      ["Review PR", 0],
      ["Call Mum", -1],
    ]);
    act(() => rowButton("Call Mum").focus());
    expect(stops()).toEqual([
      ["Review PR", -1],
      ["Call Mum", 0],
    ]);
    // The checkbox is out of the tab order; X covers it.
    expect(
      within(column("Today")).getByRole("button", {
        name: "Mark “Call Mum” done",
      }),
    ).toHaveAttribute("tabindex", "-1");
  });

  it("a row's link opens in a new tab without changing the selection", async () => {
    todos = [
      makeTodo({
        id: "l1",
        title: "Plan Lisbon trip",
        listId: "list-today",
        urls: [
          makeUrl({ id: "u1", position: "a0" }),
          makeUrl({ id: "u2", url: "https://example.com", position: "a1" }),
        ],
      }),
      makeTodo({ id: "l2", title: "Book flights", listId: "list-today" }),
    ];
    render(<WideApp />);
    act(() => rowButton("Book flights").focus());
    const link = within(column("Today")).getByText("visitlisboa.com");
    expect(link.closest("a")).toHaveAttribute("target", "_blank");
    expect(link.closest("a")).toHaveAttribute("tabindex", "-1");
    expect(link.parentElement).toHaveTextContent("visitlisboa.com +1");
    fireEvent.click(link);
    expect(focusedTitle()).toContain("Book flights");
  });

  it("o opens the first link, or says there isn't one", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    todos = [
      makeTodo({
        id: "l1",
        title: "Plan Lisbon trip",
        listId: "list-today",
        urls: [makeUrl({ id: "u1", position: "a0" })],
      }),
      makeTodo({ id: "l2", title: "Book flights", listId: "list-today" }),
    ];
    render(<WideApp />);
    act(() => rowButton("Plan Lisbon trip").focus());
    press("o");
    expect(open).toHaveBeenCalledWith(
      "https://www.visitlisboa.com/tram-28",
      "_blank",
      "noopener,noreferrer",
    );
    act(() => rowButton("Book flights").focus());
    press("o");
    expect(toast.info).toHaveBeenCalledWith("No link on this todo");
    open.mockRestore();
  });

  it("the detail's properties are rows: List and Due open their choices, Pin toggles", async () => {
    render(<WideApp />);
    act(() => rowButton("Call Mum").focus());
    await userEvent.keyboard("{Enter}");
    const detail = screen.getByRole("dialog");
    // Built like a column: the list is the header's subline.
    expect(within(detail).getByText("In today")).toBeInTheDocument();

    const list = within(detail).getByRole("button", { name: "List: Today" });
    expect(list).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(list);
    expect(list).toHaveAttribute("aria-expanded", "true");
    expect(
      within(detail).getByRole("group", { name: "Move to list" }),
    ).toBeInTheDocument();

    const due = within(detail).getByRole("button", { name: "Due date" });
    await userEvent.click(due);
    expect(due).toHaveAttribute("aria-expanded", "true");
    // One set of choices at a time.
    expect(list).toHaveAttribute("aria-expanded", "false");
    expect(
      within(detail).getByRole("group", { name: "Due" }),
    ).toBeInTheDocument();
    expect(
      within(detail).queryByRole("group", { name: "Move to list" }),
    ).toBeNull();

    const pin = within(detail).getByRole("button", { name: "Pin" });
    expect(pin).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(pin);
    expect(update).toHaveBeenCalledWith({ id: "t2", input: { pinned: true } });
  });

  it("adding a subtask closes Repeat's choices for good", async () => {
    const { rerender } = render(<WideApp />);
    act(() => rowButton("Call Mum").focus());
    await userEvent.keyboard("{Enter}");
    const detail = () => screen.getByRole("dialog");
    await userEvent.click(
      within(detail()).getByRole("button", { name: "Repeat" }),
    );
    expect(
      within(detail()).getByRole("group", { name: "Repeat" }),
    ).toBeInTheDocument();

    const subtask = makeTodo({
      id: "t2-sub",
      title: "Buy flowers",
      listId: "list-today",
      parentId: "t2",
    });
    todos = [...todos, subtask];
    rerender(<WideApp />);
    expect(
      within(detail()).queryByRole("button", { name: "Repeat" }),
    ).toBeNull();
    expect(
      within(detail()).queryByRole("group", { name: "Repeat" }),
    ).toBeNull();

    todos = todos.filter((t) => t.id !== subtask.id);
    rerender(<WideApp />);
    expect(
      within(detail()).getByRole("button", { name: "Repeat" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      within(detail()).queryByRole("group", { name: "Repeat" }),
    ).toBeNull();
  });

  it("the detail always shows Links, and adds a pasted link", async () => {
    render(<WideApp />);
    act(() => rowButton("Call Mum").focus());
    await userEvent.keyboard("{Enter}");
    const detail = screen.getByRole("dialog");
    const field = within(detail).getByRole("textbox", { name: "Add a link" });
    await userEvent.type(field, "hello{Enter}");
    expect(within(detail).getByRole("alert")).toHaveTextContent(
      "That doesn’t look like a link.",
    );
    expect(addUrl).not.toHaveBeenCalled();
    await userEvent.clear(field);
    await userEvent.type(field, "visitlisboa.com{Enter}");
    expect(addUrl).toHaveBeenCalledWith({
      todoId: "t2",
      url: "https://visitlisboa.com/",
    });
    expect(field).toHaveValue("");
  });

  it("pasting a link the todo already has just clears the field", async () => {
    todos = [
      makeTodo({
        id: "l1",
        title: "Plan Lisbon trip",
        listId: "list-today",
        urls: [makeUrl({ id: "u1", position: "a0" })],
      }),
    ];
    render(<WideApp />);
    act(() => rowButton("Plan Lisbon trip").focus());
    await userEvent.keyboard("{Enter}");
    const field = within(screen.getByRole("dialog")).getByRole("textbox", {
      name: "Add a link",
    });
    await userEvent.type(field, "https://www.visitlisboa.com/tram-28{Enter}");
    expect(addUrl).not.toHaveBeenCalled();
    expect(field).toHaveValue("");
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

describe("WideApp drag and drop", () => {
  const ROW = 48;
  const box = (top: number, height: number) =>
    ({
      top,
      bottom: top + height,
      height,
      left: 0,
      right: 300,
      width: 300,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;

  /**
   * Lays out a column: its "+ Add" composer `composer` px tall from y 100,
   * then the rows' wrapper, with each row 48px tall. Returns the wrapper's top.
   */
  const layOut = (name: string, composer = 60) => {
    const col = column(name);
    const body = col.querySelector<HTMLElement>("[data-column-body]");
    const area = col.querySelector<HTMLElement>("[data-drop-area]");
    if (!body || !area) throw new Error(`${name} isn't laid out`);
    const top = 100 + composer + 8;
    (body.firstElementChild as HTMLElement).getBoundingClientRect = () =>
      box(100, composer);
    area.getBoundingClientRect = () => box(top, 400);
    col.querySelectorAll("li").forEach((li, i) => {
      li.getBoundingClientRect = () => box(top + i * ROW, ROW);
    });
    return top;
  };

  const todo = (id: string) => todos.find((t) => t.id === id) as TodoWithUrls;
  const pointerAt = (y: number) =>
    window.dispatchEvent(new MouseEvent("pointermove", { clientY: y }));
  const event = (id: string, over: string | null, deltaY = 0) =>
    ({
      active: { id, data: { current: { todo: todo(id) } } },
      over: over ? { id: over } : null,
      activatorEvent: new MouseEvent("pointerdown", { clientY: 0 }),
      delta: { x: 0, y: deltaY },
    }) as never;
  const start = (id: string) => act(() => dnd.onDragStart?.(event(id, null)));
  const move = (id: string, over: string | null, y: number) => {
    pointerAt(y);
    act(() => dnd.onDragMove?.(event(id, over)));
  };
  const end = (id: string, over: string | null) =>
    act(() => dnd.onDragEnd?.(event(id, over)));
  const line = () =>
    document.querySelector<HTMLElement>("[data-drop-indicator]");

  beforeEach(() => {
    update.mockReset();
    todos = [
      ["t1", "Review PR", "list-today", "a0"],
      ["t2", "Call Mum", "list-today", "a1"],
      ["t3", "Water plants", "list-today", "a2"],
      ["w1", "Send invoice", "list-week", "a0"],
      ["w2", "Renew passport", "list-week", "a1"],
      ["g1", "Parmesan", "list-groceries", "a0"],
    ].map(([id, title, listId, position]) =>
      makeTodo({ id, title, listId, position }),
    );
  });

  it("draws a yellow line between rows, measured from the rows, not the composer", () => {
    render(<WideApp />);
    let top = layOut("Today", 60);
    start("t3");
    // Below Review PR's middle: between it and Call Mum.
    move("t3", "col:list-today", top + 30);
    expect(line()).toHaveStyle({ top: `${ROW}px` });
    expect(line()).toHaveClass("bg-n-brand");

    // A taller composer moves the rows, not the line within them.
    top = layOut("Today", 140);
    move("t3", "col:list-today", top + 30);
    expect(line()).toHaveStyle({ top: `${ROW}px` });

    // Above the first row, and below the last.
    move("t1", "col:list-today", top + 2);
    expect(line()).toHaveStyle({ top: "0px" });
  });

  it("follows the real pointer when the column has scrolled", () => {
    render(<WideApp />);
    const top = layOut("Today");
    start("t1");
    // dnd-kit's delta includes the scroll; the pointer is just under Call Mum's middle.
    pointerAt(top + ROW + 30);
    act(() => dnd.onDragMove?.(event("t1", "col:list-today", 900)));
    // Its own slot is 0; Call Mum's bottom half points at the gap after it.
    expect(line()).toHaveStyle({ top: `${2 * ROW}px` });
  });

  it("drops exactly where the line last showed", () => {
    render(<WideApp />);
    const top = layOut("Today");
    start("t3");
    move("t3", "col:list-today", top + 5);
    expect(line()).toHaveStyle({ top: "0px" });
    // The pointer moves on before the release, with no move event between.
    pointerAt(top + 2 * ROW + 40);
    end("t3", "col:list-today");
    expect(line()).toBeNull();
    expect(update).toHaveBeenCalledTimes(1);
    const { id, input } = update.mock.calls[0][0];
    expect(id).toBe("t3");
    expect(input.position < "a0").toBe(true);
  });

  it("changes nothing when dropped on the row's own faded slot", () => {
    render(<WideApp />);
    const top = layOut("Today");
    start("t2");
    // Over the top half of Call Mum's own row: the line is at its top edge.
    move("t2", "col:list-today", top + ROW + 12);
    expect(line()).toHaveStyle({ top: `${ROW}px` });
    // The bottom half: its bottom edge.
    move("t2", "col:list-today", top + ROW + 40);
    expect(line()).toHaveStyle({ top: `${2 * ROW}px` });
    end("t2", "col:list-today");
    expect(update).not.toHaveBeenCalled();
  });

  it("drops into another column at the line's slot", () => {
    render(<WideApp />);
    layOut("Today");
    const top = layOut("This week");
    start("t1");
    // Between Send invoice and Renew passport.
    move("t1", "col:list-week", top + 30);
    expect(
      column("This week").querySelector("[data-drop-indicator]"),
    ).toHaveStyle({ top: `${ROW}px` });
    expect(column("Today").querySelector("[data-drop-indicator]")).toBeNull();
    end("t1", "col:list-week");
    const { id, input } = update.mock.calls[0][0];
    expect(id).toBe("t1");
    expect(input.listId).toBe("list-week");
    expect(input.position > "a0" && input.position < "a1").toBe(true);
  });

  it("fades the dragged row and fills a sidebar list yellow while it's over it", () => {
    render(<WideApp />);
    // A real pointer drag through dnd-kit, so its own active and over state
    // (which the row's fade and the entry's fill read) is set.
    const entry = document.querySelector<HTMLElement>(
      '[data-sidebar-list="list-groceries"]',
    ) as HTMLElement;
    (entry.closest("li") as HTMLElement).getBoundingClientRect = () =>
      box(500, 40);
    const shell = rowButton("Review PR").closest("li") as HTMLElement;
    const container = shell.querySelector("[data-row-container]") as Element;
    const at = (y: number) => ({
      clientX: 100,
      clientY: y,
      isPrimary: true,
      button: 0,
    });
    fireEvent.pointerDown(container, at(100));
    fireEvent.pointerMove(document, at(130));
    fireEvent.pointerMove(document, at(520));
    expect(shell).toHaveClass("opacity-35");
    expect(entry).toHaveClass("bg-n-brand", "text-n-brand-ink");
    expect(document.querySelector("[data-drag-preview]")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    expect(shell).not.toHaveClass("opacity-35");
    expect(entry).not.toHaveClass("bg-n-brand");
  });

  it("scrolls the board near its side edges, so a todo drops into a list off screen", () => {
    vi.useFakeTimers();
    try {
      render(<WideApp />);
      // 240–840px across; Studio is off to the right.
      const board = layOutBoard(600);
      const scrolled = () =>
        vi
          .mocked(board.scrollBy)
          .mock.calls.map(([arg]) => (arg as ScrollToOptions).left ?? 0);
      const pointer = (x: number) =>
        window.dispatchEvent(
          new MouseEvent("pointermove", { clientX: x, clientY: 300 }),
        );
      start("t1");
      pointer(830);
      act(() => vi.advanceTimersByTime(100));
      expect(scrolled().length).toBeGreaterThan(0);
      expect(scrolled().every((left) => left > 0)).toBe(true);
      // Away from the edges, it stays put; near the left, it goes back.
      vi.mocked(board.scrollBy).mockClear();
      pointer(500);
      act(() => vi.advanceTimersByTime(100));
      expect(scrolled()).toEqual([]);
      pointer(250);
      act(() => vi.advanceTimersByTime(100));
      expect(scrolled().every((left) => left < 0)).toBe(true);

      end("t1", "col:list-studio");
      expect(update).toHaveBeenCalledWith({
        id: "t1",
        input: expect.objectContaining({ listId: "list-studio" }),
      });
      // The drag is over: no more scrolling.
      vi.mocked(board.scrollBy).mockClear();
      pointer(830);
      act(() => vi.advanceTimersByTime(100));
      expect(scrolled()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("moves to a sidebar list with no line", () => {
    render(<WideApp />);
    const top = layOut("Today");
    start("t1");
    move("t1", "col:list-today", top + 30);
    move("t1", "side:list-groceries", top + 30);
    expect(line()).toBeNull();
    end("t1", "side:list-groceries");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "t1",
        input: expect.objectContaining({ listId: "list-groceries" }),
      }),
    );
  });

  describe("easing rows into place", () => {
    const animate = vi.fn();
    const realAnimate = Element.prototype.animate;
    const realOffsetTop = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetTop",
    );

    beforeEach(() => {
      animate.mockReset();
      Element.prototype.animate = animate;
      // jsdom has no layout: a row sits at its index × ROW in its list.
      Object.defineProperty(HTMLElement.prototype, "offsetTop", {
        configurable: true,
        get(this: HTMLElement) {
          const parent = this.parentElement;
          return parent ? [...parent.children].indexOf(this) * ROW : 0;
        },
      });
      document.documentElement.style.setProperty("--n-duration-base", "220ms");
      document.documentElement.style.setProperty(
        "--n-ease-out-strong",
        "cubic-bezier(0.23, 1, 0.32, 1)",
      );
      // The drop lands as the server's answer would.
      update.mockImplementation(({ id, input }) => {
        todos = todos.map((t) => (t.id === id ? { ...t, ...input } : t));
      });
    });

    afterEach(() => {
      reducedMotion = "reduce";
      Element.prototype.animate = realAnimate;
      if (realOffsetTop) {
        Object.defineProperty(
          HTMLElement.prototype,
          "offsetTop",
          realOffsetTop,
        );
      }
      document.documentElement.removeAttribute("style");
    });

    const dropFirst = () => {
      const { rerender } = render(<WideApp />);
      const top = layOut("Today");
      start("t3");
      move("t3", "col:list-today", top + 5);
      end("t3", "col:list-today");
      expect(update).toHaveBeenCalledTimes(1);
      rerender(<WideApp />);
    };

    it("eases the rows from where they were dropped", () => {
      reducedMotion = "no-preference";
      dropFirst();
      const rows = [...column("Today").querySelectorAll("li")];
      // Water plants rises from the bottom; the two above it step down.
      expect(rows[0]).toHaveTextContent("Water plants");
      expect(animate.mock.contexts).toEqual(rows);
      expect(animate.mock.calls.map(([frames]) => frames[0])).toEqual([
        { transform: `translateY(${2 * ROW}px)` },
        { transform: `translateY(${-ROW}px)` },
        { transform: `translateY(${-ROW}px)` },
      ]);
      expect(animate).toHaveBeenCalledWith(expect.anything(), {
        duration: 220,
        easing: "cubic-bezier(0.23, 1, 0.32, 1)",
      });
    });

    it("doesn't under reduced motion", () => {
      dropFirst();
      expect(column("Today").querySelector("li")).toHaveTextContent(
        "Water plants",
      );
      expect(animate).not.toHaveBeenCalled();
    });
  });
});

describe("WideApp URLs", () => {
  beforeEach(() => {
    todos = [
      makeTodo({ id: "w1", title: "Send invoice", listId: "list-week" }),
      makeTodo({ id: "g1", title: "Parmesan", listId: "list-groceries" }),
    ];
  });

  it("goes to /list/:id's column, and clears the URL on leaving it", async () => {
    const onNavigate = vi.fn();
    render(
      <WideApp
        view={{ kind: "list", id: "list-groceries" }}
        onNavigate={onNavigate}
      />,
    );
    expect(focusedTitle()).toContain("Parmesan");
    expect(onNavigate).not.toHaveBeenCalled();
    await userEvent.click(rowButton("Send invoice"));
    expect(onNavigate).toHaveBeenLastCalledWith(null);
  });

  it("sends a /list/:id that's gone back to /", () => {
    const onNavigate = vi.fn();
    render(
      <WideApp
        view={{ kind: "list", id: "list-gone" }}
        onNavigate={onNavigate}
      />,
    );
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
