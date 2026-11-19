import type { DndContextProps } from "@dnd-kit/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
import { LONG_PRESS_MS } from "@/components/phone/TodoRow";
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
/** The todos' first load, after the lists have arrived. */
let todosLoading = false;
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
/**
 * The real todos cache and smart-create, for the tests that need what the
 * mutation itself puts in the cache. Render inside `withCache`'s provider.
 * The cache's refetch never lands, so what onSuccess swaps in stays.
 */
let liveCache = false;
/** The todos query's refetch; a test can have it bring a todo in. */
const refetchTodos = vi.fn(async () => {});
vi.mock("@/server/todos", () => ({
  getTodos: vi.fn(),
  createTodo: vi.fn(),
  updateTodo: vi.fn(),
  deleteTodo: vi.fn(),
}));
vi.mock("@/hooks/useTodos", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useTodos")>();
  const { useQuery } = await import("@tanstack/react-query");
  const useLiveTodos = () =>
    useQuery<TodoWithUrls[]>({
      queryKey: ["todos"],
      queryFn: () => new Promise(() => {}),
      initialData: todos,
      staleTime: Number.POSITIVE_INFINITY,
    }).data;
  return {
    useTodos: () => ({
      // biome-ignore lint/correctness/useHookAtTopLevel: `liveCache` is fixed for a whole test
      data: todosLoading ? undefined : liveCache ? useLiveTodos() : todos,
      isLoading: false,
      error: null,
      refetch: refetchTodos,
      isFetching: false,
    }),
    useUpdateTodo: () => ({
      mutate: update,
      mutateAsync: async (vars: unknown) => update(vars),
    }),
    useDeleteTodo: () => ({ mutate: remove }),
    useSmartCreate: () =>
      // biome-ignore lint/correctness/useHookAtTopLevel: `liveCache` is fixed for a whole test
      liveCache ? actual.useSmartCreate() : { mutateAsync: smartCreate },
    useCreateTodo: () => ({ mutate: vi.fn() }),
    useDeleteTodoUrl: () => ({ mutate: vi.fn() }),
    useAddTodoUrl: () => ({ mutate: addUrl }),
    useProcessTodo: () => ({ mutate: vi.fn() }),
    useUpdateUrlPreview: () => ({ mutate: vi.fn() }),
  };
});
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
  useAuth: () => ({ getToken: async () => "test-token", userId: "user-1" }),
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
const press = (key: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(document.activeElement ?? window, { key, ...init });
/** ⌘N: Quick add, from anywhere. */
const quickAddKey = () => press("n", { metaKey: true });

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
 * Lays the board out `width` px wide, unscrolled: each column and the sheet
 * 272px (17rem), the sheet overlapping its column by 24px. jsdom has no layout.
 */
const layOutBoard = (width: number) => {
  const board = screen.getByRole("main", { name: "Board" });
  const COLUMN_PX = 272;
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
      x += COLUMN_PX;
      if (sib.dataset.slide === "sheet") sheet = true;
    }
    return sheet ? x - 24 : x;
  };
  const restore = [
    ["offsetLeft", (el: HTMLElement) => leftOf(el)],
    ["offsetWidth", () => COLUMN_PX],
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

  it("draws the time columns while it loads, then nothing: no Done to promise where it ends", () => {
    listsLoading = true;
    try {
      render(<WideApp />);
      const board = screen.getByRole("main", { name: "Board" });
      // The three time columns hold their places, by name, and nothing
      // follows: your lists may come before Done.
      expect(
        [...board.querySelectorAll("[data-column]")].map((c) =>
          c.getAttribute("data-column"),
        ),
      ).toEqual(["skeleton-today", "skeleton-thisWeek", "skeleton-someday"]);
      expect(
        within(board)
          .getAllByRole("heading", { level: 2 })
          .map((h) => h.textContent),
      ).toEqual(["Today", "This week", "Someday"]);
      expect(board.lastElementChild).toHaveAttribute("data-skeleton-rest");
      expect(board.lastElementChild?.childElementCount).toBe(0);
      // Placeholder rows fade by column, gone by the fourth.
      expect(
        [...board.querySelectorAll<HTMLElement>("[data-skeleton-rows]")].map(
          (rows) => Number(rows.style.opacity).toFixed(2),
        ),
      ).toEqual(["1.00", "0.67", "0.33"]);
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

  it("gives the skeleton's columns the same width", () => {
    listsLoading = true;
    try {
      render(<WideApp />);
      const board = screen.getByRole("main", { name: "Board" });
      for (const c of board.querySelectorAll("[data-column]")) {
        expect(c).toHaveClass(...COLUMN_WIDTH.split(" "));
      }
    } finally {
      listsLoading = false;
    }
  });

  it("fades the placeholder rows by column once the lists are in, none from the fourth", () => {
    todosLoading = true;
    try {
      render(<WideApp />);
      const board = screen.getByRole("main", { name: "Board" });
      const opacities = [...board.querySelectorAll("[data-column]")].map(
        (c) => {
          const rows = c.querySelector<HTMLElement>("[data-skeleton-rows]");
          return [
            c.getAttribute("data-column"),
            rows ? Number(rows.style.opacity).toFixed(2) : null,
          ];
        },
      );
      expect(opacities).toEqual([
        ["list-today", "1.00"],
        ["list-week", "0.67"],
        ["list-someday", "0.33"],
        ["list-groceries", null],
        ["list-studio", null],
        ["done", null],
      ]);
      // Every column still says it's loading, and Done claims nothing.
      for (const c of board.querySelectorAll("[data-column]")) {
        expect(within(c as HTMLElement).getByText("Loading…")).toHaveClass(
          "sr-only",
        );
      }
      expect(within(board).queryByText("Nothing done yet.")).toBeNull();
    } finally {
      todosLoading = false;
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

  describe("empty Today and This week: what's waiting next", () => {
    const empty = (listId: string) => {
      todos = todos.filter((t) => t.completed || t.listId !== listId);
    };

    it("under an empty Today, links to This week, which takes the keyboard with nothing selected", async () => {
      empty("list-today");
      render(<WideApp />);
      const board = layOutBoard(300);
      const today = column("Today");
      expect(within(today).getByText("Nothing today.")).toBeInTheDocument();
      const link = within(today).getByRole("button", {
        name: "2 waiting in this week",
      });
      await userEvent.click(link);
      // This week is 272–544px: the board scrolls the least that shows it.
      expect(board.scrollTo).toHaveBeenLastCalledWith({
        left: 544 - 300,
        behavior: "auto",
      });
      const week = column("This week");
      expect(document.activeElement).toBe(
        week.querySelector("[data-column-head]"),
      );
      expect(week).toHaveAttribute("data-key-section", "on");
      expect(focusedTitle()).toBeUndefined();
      expect(document.querySelector("[data-selected]")).toBeNull();
    });

    it("under an empty This week, links to Someday; with nothing waiting, no link", async () => {
      empty("list-today");
      empty("list-week");
      render(<WideApp />);
      // This week is empty too, so Today has nothing to point to.
      const today = column("Today");
      expect(within(today).getByText("Nothing today.")).toBeInTheDocument();
      expect(
        within(today).queryByRole("button", { name: /waiting/ }),
      ).toBeNull();
      const week = column("This week");
      expect(within(week).getByText("A clear week.")).toBeInTheDocument();
      await userEvent.click(
        within(week).getByRole("button", { name: "1 waiting in someday" }),
      );
      expect(document.activeElement).toBe(
        column("Someday").querySelector("[data-column-head]"),
      );
    });

    it("draws no link under an empty This week when Someday is empty", () => {
      empty("list-week");
      empty("list-someday");
      render(<WideApp />);
      const week = column("This week");
      expect(within(week).getByText("A clear week.")).toBeInTheDocument();
      expect(
        within(week).queryByRole("button", { name: /waiting/ }),
      ).toBeNull();
      expect(
        within(column("Someday")).getByText("Nothing here yet."),
      ).toBeInTheDocument();
    });
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

  it("z steps back through the last actions, newest first, and ⇧Z forward", async () => {
    vi.useFakeTimers();
    const { rerender } = render(<WideApp />);
    liveUpdates();
    const toasts = () => vi.mocked(toast.success).mock.calls.map((c) => c[0]);
    const finish = async (title: string) => {
      rowButton(title).focus();
      press("x");
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      rerender(<WideApp />);
    };
    await finish("Review PR");
    await finish("Call Mum");
    rowButton("Send invoice").focus();
    press("3");
    rerender(<WideApp />);
    // Long after the last toast has gone.
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });

    update.mockClear();
    vi.mocked(toast.success).mockClear();
    press("z");
    press("z");
    press("z");
    expect(update.mock.calls.map((c) => c[0])).toEqual([
      { id: "w1", input: { listId: "list-week", position: "a0" } },
      { id: "t2", input: { completed: false, position: "a1" } },
      { id: "t1", input: { completed: false, position: "a0" } },
    ]);
    expect(toasts()).toEqual([
      "Undone: Moved to someday",
      "Undone: Done",
      "Undone: Done",
    ]);

    update.mockClear();
    vi.mocked(toast.success).mockClear();
    fireEvent.keyDown(document.activeElement ?? window, {
      key: "Z",
      shiftKey: true,
    });
    fireEvent.keyDown(document.activeElement ?? window, {
      key: "Z",
      shiftKey: true,
    });
    expect(update.mock.calls.map((c) => c[0])).toEqual([
      { id: "t1", input: { completed: true } },
      { id: "t2", input: { completed: true } },
    ]);
    expect(toasts()).toEqual(["Redone: Done", "Redone: Done"]);
    vi.useRealTimers();
  });

  it("a new action clears what ⇧Z could redo", () => {
    const { rerender } = render(<WideApp />);
    liveUpdates();
    rowButton("Review PR").focus();
    press("2");
    rerender(<WideApp />);
    press("z");
    rerender(<WideApp />);
    rowButton("Send invoice").focus();
    press("3");
    rerender(<WideApp />);
    update.mockClear();
    fireEvent.keyDown(document.activeElement ?? window, {
      key: "Z",
      shiftKey: true,
    });
    expect(update).not.toHaveBeenCalled();
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

  it("d opens the Due view in the iPhone's order, No date only with a date", async () => {
    render(<WideApp />);
    rowButton("Review PR").focus();
    press("d");
    const menu = await screen.findByRole("menu", { name: "Due" });
    const names = Array.from(
      menu.querySelectorAll('[role="menuitem"], [role="menuitemradio"]'),
    ).map((i) => i.textContent);
    // The first item is the way back to the menu.
    expect(names).toEqual([
      "Due",
      "Today",
      "Tomorrow",
      "Friday",
      "Next week",
      "Pick a date…",
    ]);
  });

  it("d's No date clears a todo's date, in red after a divider", async () => {
    todos = todos.map((t) =>
      t.id === "t1" ? { ...t, dueDate: "2026-10-18T00:00:00.000Z" } : t,
    );
    render(<WideApp />);
    rowButton("Review PR").focus();
    press("d");
    const menu = await screen.findByRole("menu", { name: "Due" });
    const items = Array.from(
      menu.querySelectorAll('[role="menuitem"], [role="menuitemradio"]'),
    );
    expect(items.map((i) => i.textContent).slice(-2)).toEqual([
      "Pick a date…",
      "No date",
    ]);
    const clear = within(menu).getByRole("menuitem", { name: "No date" });
    expect(clear.previousElementSibling).toBe(
      within(menu).getByRole("separator"),
    );
    expect(clear).toHaveClass("text-n-destructive");
    await userEvent.click(clear);
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

  it("right-click on a todo with a link reads the canonical todo menu", async () => {
    todos = [
      makeTodo({
        id: "w9",
        title: "Plan Lisbon trip",
        listId: "list-week",
        urls: [makeUrl({ id: "u1", position: "a0" })],
      }),
    ];
    render(<WideApp />);
    fireEvent.contextMenu(rowButton("Plan Lisbon trip"), {
      clientX: 200,
      clientY: 200,
    });
    const menu = await screen.findByRole("menu", { name: "Todo actions" });
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((i) => i.querySelector("span")?.textContent),
    ).toEqual([
      "Mark done",
      "Move to Today",
      "Move to Someday",
      "Move to a list…",
      "Open link",
      "Pin to top",
      "Due…",
      "Delete",
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
    expect(dialogKeys("Undo")).toBe("Z");
    expect(dialogKeys("Redo")).toBe("⇧Z");
    // Redo straight after Undo, under Help.
    const labels = [...dialog.querySelectorAll("dt")].map((d) => d.textContent);
    expect(labels.indexOf("Redo")).toBe(labels.indexOf("Undo") + 1);
    // The notes editor's own keys, in their own group after Create.
    const groups = [...dialog.querySelectorAll("h3")].map((h) => h.textContent);
    expect(groups.indexOf("Notes")).toBe(groups.indexOf("Create") + 1);
    const notes = within(
      within(dialog).getByRole("heading", { name: "Notes" })
        .parentElement as HTMLElement,
    );
    expect(notes.getAllByRole("term").map((dt) => dt.textContent)).toEqual([
      "Bold",
      "Italic",
      "Code",
    ]);
    expect(dialogKeys("Bold")).toBe("⌘B");
    expect(dialogKeys("Italic")).toBe("⌘I");
    expect(dialogKeys("Code")).toBe("⌘E");
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

  it("⌘N opens quick add on the selection's column, ⇧N the New list popover", async () => {
    render(<WideApp />);
    act(() => rowButton("Read Piranesi").focus());
    quickAddKey();
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

  it("Esc closes the open todo, steps out to its column, then goes to the column's sidebar item", async () => {
    render(<WideApp />);
    await userEvent.dblClick(rowButton("Send invoice"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    press("Escape");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(rowButton("Send invoice"));
    press("Escape");
    expect(document.activeElement).toHaveAttribute(
      "data-column-head",
      "list-week",
    );
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
    // Its header and Add field recede. Its padding is the sheet's overlap
    // whether or not it's open, so its text doesn't rewrap.
    expect(someday.querySelector("header")).toHaveClass(
      RECEDE,
      "pr-(--n-sheet-overlap)",
    );
    expect(someday.querySelector("[data-column-composer]")).toHaveClass(RECEDE);
    expect(column("Today").querySelector("header")).toHaveClass(
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
    // Studio, 1088–1360px; its sheet overlaps it by 24px, to 1608px.
    await userEvent.dblClick(rowButton("Mix the EP"));
    await screen.findByRole("dialog");
    expect(board.scrollTo).toHaveBeenLastCalledWith({
      left: 1608 - 700,
      behavior: "auto",
    });
  });

  it("Esc from inside the sheet steps out to it, then closes it and leaves the selection on its row", async () => {
    render(<WideApp />);
    await userEvent.dblClick(rowButton("Send invoice"));
    const sheet = await screen.findByRole("dialog");
    const title = within(sheet).getByRole("textbox", { name: "Title" });
    act(() => title.focus());
    await userEvent.keyboard("{Escape}");
    expect(document.activeElement).toBe(sheet);
    expect(sheet).toHaveAttribute("data-key-section", "on");
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

  it("a click-open leaves the keyboard on the row: ↓ moves on, the sheet follows, and Esc closes it", async () => {
    render(<WideApp />);
    await userEvent.click(rowButton("Review PR"));
    await userEvent.click(rowButton("Review PR"));
    const title = () =>
      within(screen.getByRole("dialog")).getByRole("textbox", {
        name: "Title",
      });
    expect(title()).toHaveValue("Review PR");
    // Focus stays on the board, so arrowing shows each todo.
    expect(focusedTitle()).toContain("Review PR");
    press("ArrowDown");
    expect(title()).toHaveValue("Call Mum");
    expect(selection()).toEqual({ id: "t2", column: "list-today" });

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

      // Esc stops typing and stays on Add, then closes the todo there, then
      // steps out to the column.
      await userEvent.keyboard("{Escape}");
      expect(document.activeElement).toBe(add);
      expect(add).toHaveAttribute("readonly");
      expect(sheetTitle()).toBe("Walk dog");
      press("Escape");
      expect(sheet()).toBeNull();
      expect(document.activeElement).toBe(add);
      press("Escape");
      expect(document.activeElement).toHaveAttribute(
        "data-column-head",
        "list-today",
      );
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
      expect(toast.error).toHaveBeenCalledWith("Couldn’t add the todo");
    });

    it("from Quick add: behind the popover, which keeps focus, with no toast", async () => {
      render(<WideApp />);
      quickAddKey();
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
      quickAddKey();
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

    const due = within(detail).getByRole("button", { name: "Due" });
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
  describe("sections (Tab, Return, Esc, the outline)", () => {
    const board = () =>
      document.querySelector<HTMLElement>("[data-wide-ready]") as HTMLElement;
    /** The section with the keyboard, and whether it's on it or in it. */
    const keyed = () => {
      const all = [
        ...document.querySelectorAll<HTMLElement>("[data-key-section]"),
      ];
      expect(all.length).toBe(1);
      const el = all[0];
      const id =
        el.tagName === "ASIDE"
          ? "sidebar"
          : el.hasAttribute("data-detail-column")
            ? "sheet"
            : el.dataset.column;
      return `${id} ${el.dataset.keySection}`;
    };
    const tab = () => press("Tab");
    const backTab = () => press("Tab", { shiftKey: true });
    const add = (name: string) =>
      screen.getByRole("textbox", {
        name: `New todo in ${name}`,
      }) as HTMLTextAreaElement;
    const sheet = () =>
      document.querySelector<HTMLElement>("[data-detail-column]");
    const nextFrame = () =>
      act(async () => {
        await new Promise((r) => requestAnimationFrame(r));
      });

    it("starts on Today with no outline, which the first key press shows", () => {
      render(<WideApp />);
      expect(keyed()).toBe("list-today on");
      expect(board()).not.toHaveAttribute("data-keyboard");
      tab();
      expect(board()).toHaveAttribute("data-keyboard");
      expect(keyed()).toBe("list-week on");
      fireEvent.pointerDown(document.body);
      expect(board()).not.toHaveAttribute("data-keyboard");
      press("ArrowLeft");
      expect(board()).toHaveAttribute("data-keyboard");
      expect(keyed()).toBe("list-today on");
    });

    it("Tab and ⇧Tab visit every section, the sheet straight after its column, and wrap", async () => {
      render(<WideApp />);
      await userEvent.dblClick(rowButton("Send invoice"));
      expect(sheet()).not.toBeNull();
      expect(keyed()).toBe("list-week in");
      const visited = [];
      for (let i = 0; i < 8; i++) {
        tab();
        visited.push(keyed());
      }
      expect(visited).toEqual([
        "sheet on",
        "list-someday on",
        "list-groceries on",
        "list-studio on",
        "done on",
        "sidebar on",
        "list-today on",
        "list-week on",
      ]);
      const back = [];
      for (let i = 0; i < 8; i++) {
        backTab();
        back.push(keyed());
      }
      expect(back).toEqual([
        "list-today on",
        "sidebar on",
        "done on",
        "list-studio on",
        "list-groceries on",
        "list-someday on",
        "sheet on",
        "list-week on",
      ]);
      // Each "on" puts focus on the section itself, nothing selected.
      expect(document.activeElement).toHaveAttribute(
        "data-column-head",
        "list-week",
      );
      expect(selection()).toBeNull();
    });

    it("← → move to the adjacent section and don't wrap; ← from This week reaches an empty Today", () => {
      todos = todos.filter((t) => t.listId !== "list-today" || t.completed);
      render(<WideApp />);
      tab();
      expect(keyed()).toBe("list-week on");
      press("ArrowLeft");
      expect(keyed()).toBe("list-today on");
      expect(document.activeElement).toHaveAttribute(
        "data-column-head",
        "list-today",
      );
      press("h");
      expect(keyed()).toBe("sidebar on");
      expect(document.activeElement).toBe(
        screen.getByRole("complementary", { name: "Sidebar" }),
      );
      press("ArrowLeft");
      expect(keyed()).toBe("sidebar on");
      press("ArrowRight");
      expect(keyed()).toBe("list-today on");
      backTab();
      backTab();
      expect(keyed()).toBe("done on");
      press("l");
      expect(keyed()).toBe("done on");
    });

    it("Return on a column steps in to its first todo, or Add when it has none", () => {
      todos = todos.filter((t) => t.listId !== "list-today" || t.completed);
      render(<WideApp />);
      tab();
      press("Enter");
      expect(selection()).toEqual({ id: "w1", column: "list-week" });
      expect(keyed()).toBe("list-week in");
      press("Escape");
      press("ArrowLeft");
      press("Enter");
      expect(document.activeElement).toBe(add("today"));
      expect(add("today")).toHaveAttribute("readonly");
      expect(keyed()).toBe("list-today in");
    });

    it("Return on the sidebar goes to the entry for the column it came from", () => {
      render(<WideApp />);
      backTab();
      expect(keyed()).toBe("sidebar on");
      press("Enter");
      expect(document.activeElement).toHaveAccessibleName("Today");
      press("Escape");
      expect(keyed()).toBe("sidebar on");
      // From Done, Tab wraps to the sidebar, and Return goes to Done's entry.
      backTab();
      expect(keyed()).toBe("done on");
      tab();
      press("Enter");
      expect(document.activeElement).toHaveAttribute(
        "data-sidebar-item",
        "done",
      );
      expect(keyed()).toBe("sidebar in");
    });

    it("Esc from a todo steps out to its column with nothing selected, then to the sidebar on its entry", () => {
      render(<WideApp />);
      act(() => rowButton("Renew passport").focus());
      expect(keyed()).toBe("list-week in");
      press("Escape");
      expect(keyed()).toBe("list-week on");
      expect(
        rowButton("Renew passport").closest("[data-row-container]"),
      ).not.toHaveAttribute("data-selected");
      press("Escape");
      expect(document.activeElement).toHaveAttribute(
        "data-sidebar-list",
        "list-week",
      );
      expect(keyed()).toBe("sidebar in");
      press("Escape");
      expect(keyed()).toBe("sidebar on");
      // Esc on the sidebar's section goes nowhere.
      press("Escape");
      expect(keyed()).toBe("sidebar on");
    });

    it("↑ from the first todo reaches Add, ready to type with the row's keyboard look; ↓ comes back", () => {
      render(<WideApp />);
      act(() => rowButton("Send invoice").focus());
      press("ArrowUp");
      const field = add("this week");
      expect(document.activeElement).toBe(field);
      expect(field).toHaveAttribute("readonly");
      expect(field.closest("form")).toHaveClass("bg-n-fill");
      expect(field.closest("form")).not.toHaveClass("n-focus-within");
      expect(
        field
          .closest("[data-column-composer]")
          ?.querySelector("[data-row-selection-bar]"),
      ).toBeInTheDocument();
      expect(selection()).toBeNull();
      press("j");
      expect(selection()).toEqual({ id: "w1", column: "list-week" });
      press("k");
      expect(document.activeElement).toBe(field);
    });

    it("Return on Add starts typing; Esc stops and stays on Add, keeping what's typed", async () => {
      render(<WideApp />);
      act(() => rowButton("Send invoice").focus());
      press("ArrowUp");
      const field = add("this week");
      await userEvent.keyboard("{Enter}");
      expect(field).not.toHaveAttribute("readonly");
      expect(smartCreate).not.toHaveBeenCalled();
      await userEvent.keyboard("Milk");
      expect(field).toHaveValue("Milk");
      await userEvent.keyboard("{Escape}");
      expect(document.activeElement).toBe(field);
      expect(field).toHaveAttribute("readonly");
      expect(field).toHaveValue("Milk");
      // Esc again steps out to the column.
      press("Escape");
      expect(keyed()).toBe("list-week on");
    });

    it("↓ from Add with nothing typed goes to the first todo", async () => {
      render(<WideApp />);
      await userEvent.click(add("this week"));
      expect(add("this week")).not.toHaveAttribute("readonly");
      await userEvent.keyboard("{ArrowDown}");
      expect(selection()).toEqual({ id: "w1", column: "list-week" });
    });

    it("Tab while typing in Add moves to the next section and keeps what's typed", async () => {
      render(<WideApp />);
      await userEvent.click(add("this week"));
      await userEvent.keyboard("Half typed");
      tab();
      expect(keyed()).toBe("list-someday on");
      expect(add("this week")).toHaveValue("Half typed");
    });

    it("Tab while renaming a column saves the name and moves to the next section", async () => {
      render(<WideApp />);
      await userEvent.click(
        within(column("Groceries")).getByRole("button", {
          name: "Groceries",
        }),
      );
      const name = screen.getByRole("textbox", { name: "List name" });
      await userEvent.clear(name);
      await userEvent.keyboard("Shopping");
      tab();
      expect(updateList).toHaveBeenCalledWith({
        id: "list-groceries",
        input: { name: "Shopping" },
      });
      await nextFrame();
      expect(keyed()).toBe("list-studio on");
      expect(document.activeElement).toHaveAttribute(
        "data-column-head",
        "list-studio",
      );
    });

    it("n on a column types in its Add", () => {
      render(<WideApp />);
      tab();
      tab();
      expect(keyed()).toBe("list-someday on");
      press("n");
      expect(document.activeElement).toBe(add("someday"));
      expect(add("someday")).not.toHaveAttribute("readonly");
    });

    it("n in a column types in its Add", () => {
      render(<WideApp />);
      act(() => rowButton("Mix the EP").focus());
      press("n");
      expect(document.activeElement).toBe(add("Studio"));
      expect(add("Studio")).not.toHaveAttribute("readonly");
      expect(screen.queryByRole("dialog", { name: "Quick add" })).toBeNull();
    });

    it("n in the sidebar opens Quick add", async () => {
      render(<WideApp />);
      backTab();
      press("n");
      expect(
        await screen.findByRole("dialog", { name: "Quick add" }),
      ).toBeInTheDocument();
    });

    it("n in Done opens Quick add", async () => {
      render(<WideApp />);
      act(() => rowButton("Ship the zine").focus());
      press("n");
      expect(
        await screen.findByRole("dialog", { name: "Quick add" }),
      ).toBeInTheDocument();
    });

    it("n on the sheet opens Quick add", async () => {
      render(<WideApp />);
      act(() => rowButton("Send invoice").focus());
      await userEvent.keyboard("{Enter}");
      await waitFor(() => expect(document.activeElement).toBe(sheet()));
      press("n");
      expect(
        await screen.findByRole("dialog", { name: "Quick add" }),
      ).toBeInTheDocument();
    });

    it("⌘N opens Quick add while typing", async () => {
      render(<WideApp />);
      await userEvent.click(add("today"));
      await userEvent.keyboard("Typing");
      quickAddKey();
      expect(
        await screen.findByRole("dialog", { name: "Quick add" }),
      ).toBeInTheDocument();
    });

    it("Return on a todo puts the keyboard on its sheet: keys act on it, Return goes into the title, Tab wraps, Esc steps out, Esc closes", async () => {
      render(<WideApp />);
      act(() => rowButton("Send invoice").focus());
      await userEvent.keyboard("{Enter}");
      const popup = await screen.findByRole("dialog");
      await waitFor(() => expect(document.activeElement).toBe(popup));
      expect(keyed()).toBe("sheet on");
      const title = within(popup).getByRole("textbox", { name: "Title" });

      // Typing doesn't edit it; p pins it.
      await userEvent.keyboard("q");
      expect(title).toHaveValue("Send invoice");
      press("p");
      expect(update).toHaveBeenCalledWith({
        id: "w1",
        input: expect.objectContaining({ pinned: true }),
      });

      // Return: into the title, ready to edit.
      press("Enter");
      expect(document.activeElement).toBe(title);
      expect(keyed()).toBe("sheet in");

      // Tab wraps within the sheet, from its first stop to its last and back.
      press("Tab", { shiftKey: true });
      const last = document.activeElement as HTMLElement;
      expect(popup.contains(last)).toBe(true);
      expect(last).not.toBe(title);
      expect(keyed()).toBe("sheet in");
      press("Tab");
      expect(document.activeElement).toBe(title);

      // Esc steps out to the sheet; Esc again closes it onto its row.
      press("Escape");
      expect(document.activeElement).toBe(popup);
      expect(keyed()).toBe("sheet on");
      press("Escape");
      expect(sheet()).toBeNull();
      await nextFrame();
      expect(selection()).toEqual({ id: "w1", column: "list-week" });
    });

    it("Tab from the sheet goes to the next section; arrows don't move its todo", async () => {
      render(<WideApp />);
      act(() => rowButton("Send invoice").focus());
      await userEvent.keyboard("{Enter}");
      const popup = await screen.findByRole("dialog");
      await waitFor(() => expect(document.activeElement).toBe(popup));
      press("ArrowDown");
      expect(document.activeElement).toBe(popup);
      tab();
      expect(keyed()).toBe("list-someday on");
      // The sheet stays open beside its column.
      expect(sheet()).not.toBeNull();
    });

    it("a click on a row, the sidebar or the sheet moves the keyboard there", async () => {
      render(<WideApp />);
      await userEvent.click(rowButton("Mix the EP"));
      expect(keyed()).toBe("list-studio in");
      await userEvent.click(screen.getByRole("heading", { name: "Lists" }));
      expect(keyed().startsWith("sidebar")).toBe(true);
      await userEvent.dblClick(rowButton("Parmesan"));
      expect(keyed()).toBe("list-groceries in");
      await userEvent.click(within(sheet() as HTMLElement).getByText(/^In /));
      expect(keyed().startsWith("sheet")).toBe(true);
      // Toolbar clicks leave it where it was.
      await userEvent.click(screen.getByRole("button", { name: /Search/ }));
      expect(keyed().startsWith("sheet")).toBe(true);
    });

    it("draws the outline as an overlay: only the marker attribute changes", () => {
      render(<WideApp />);
      const week = column("This week");
      const before = week.className;
      expect(week).not.toHaveAttribute("data-key-section");
      tab();
      expect(week).toHaveAttribute("data-key-section", "on");
      expect(week.className).toBe(before);
      for (const el of [
        week,
        column("Done"),
        screen.getByRole("complementary", { name: "Sidebar" }),
      ]) {
        expect(el).toHaveClass("n-section-outline", "relative");
      }
    });

    it("the shortcuts dialog lists the section keys", async () => {
      render(<WideApp />);
      fireEvent.keyDown(window, { key: "?" });
      const dialog = await screen.findByRole("dialog", {
        name: "Keyboard shortcuts",
      });
      const dialogKeys = (label: string) =>
        within(dialog)
          .getByText(label, { selector: "dt" })
          .nextElementSibling?.textContent?.replace(/\s/g, "");
      expect(dialogKeys("Next section")).toBe("⇥");
      expect(dialogKeys("Previous section")).toBe("⇧⇥");
      expect(dialogKeys("Step in, or open")).toBe("↵");
      expect(dialogKeys("Step out, or close")).toBe("Esc");
      expect(dialogKeys("Column left, or into the sidebar")).toBe("Hor←");
      expect(dialogKeys("New todo")).toBe("Nor⌘N");
    });
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
    // A mouse drag parts nothing, and its preview isn't the lifted row.
    expect(document.querySelector("[data-drop-gap]")).toBeNull();
    expect(document.querySelector("[data-lifted]")).toBeNull();
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

  it("moves to a hidden list's sidebar entry, and its column stays hidden", () => {
    const before = lists;
    lists = lists.map((l) =>
      l.id === "list-groceries" ? { ...l, columnHidden: true } : l,
    );
    try {
      render(<WideApp />);
      const top = layOut("Today");
      start("t1");
      move("t1", "side:list-groceries", top + 30);
      end("t1", "side:list-groceries");
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "t1",
          input: expect.objectContaining({ listId: "list-groceries" }),
        }),
      );
      expect(screen.queryByRole("region", { name: "Groceries" })).toBeNull();
      expect(updateList).not.toHaveBeenCalled();
    } finally {
      lists = before;
    }
  });

  describe("by touch", () => {
    const animate = vi.fn();
    const realAnimate = Element.prototype.animate;
    const layoutProps = (["offsetTop", "offsetHeight"] as const).map(
      (prop) =>
        [
          prop,
          Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop),
        ] as const,
    );

    beforeEach(() => {
      animate.mockReset();
      Element.prototype.animate = animate;
      // jsdom has no layout: a row sits at its index × ROW in its list, as
      // laid out, whatever transform parts it.
      Object.defineProperty(HTMLElement.prototype, "offsetTop", {
        configurable: true,
        get(this: HTMLElement) {
          const parent = this.parentElement;
          return parent && this.matches("li")
            ? [...parent.children].indexOf(this) * ROW
            : 0;
        },
      });
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        configurable: true,
        get(this: HTMLElement) {
          return this.matches("li") ? ROW : 0;
        },
      });
      document.documentElement.style.setProperty("--n-duration-base", "220ms");
      document.documentElement.style.setProperty(
        "--n-ease-out-strong",
        "cubic-bezier(0.23, 1, 0.32, 1)",
      );
      update.mockImplementation(({ id, input }) => {
        todos = todos.map((t) => (t.id === id ? { ...t, ...input } : t));
      });
    });

    afterEach(() => {
      reducedMotion = "reduce";
      // dnd-kit lets go of the document's click a moment after a drag.
      if (vi.isFakeTimers()) vi.runOnlyPendingTimers();
      vi.useRealTimers();
      Element.prototype.animate = realAnimate;
      for (const [prop, descriptor] of layoutProps) {
        if (descriptor) {
          Object.defineProperty(HTMLElement.prototype, prop, descriptor);
        }
      }
      document.documentElement.removeAttribute("style");
    });

    /** A row's slot in its column. */
    const shell = (id: string) =>
      document
        .querySelector(`[data-column] [data-row-id="${id}"]`)
        ?.closest("li") as HTMLElement;
    const container = (id: string) =>
      shell(id).querySelector("[data-row-container]") as HTMLElement;
    const gaps = () => [
      ...document.querySelectorAll<HTMLElement>("[data-drop-gap]"),
    ];
    const gapIn = (name: string) =>
      column(name).querySelector<HTMLElement>("[data-drop-gap]");
    const shift = (id: string) => shell(id).style.transform;
    const menu = () => screen.queryByRole("menu", { name: "Todo actions" });
    const lifted = () =>
      document.querySelector<HTMLElement>("[data-drag-preview][data-lifted]");

    /**
     * A drag dnd-kit's touch sensor started, driven through the handlers:
     * the finger goes down `grab` px into the row, then moves by `deltaY`.
     */
    const driveTouch = (id: string, grab = 22) => {
      const listId = todo(id).listId;
      const index = todos
        .filter((t) => t.listId === listId)
        .findIndex((t) => t.id === id);
      const top = 168 + index * ROW + grab;
      const activatorEvent = {
        type: "touchstart",
        touches: [{ clientX: 100, clientY: top }],
      };
      const ev = (over: string | null, deltaY: number) =>
        ({
          active: { id, data: { current: { todo: todo(id) } } },
          over: over ? { id: over } : null,
          activatorEvent,
          delta: { x: 0, y: deltaY },
        }) as never;
      act(() => dnd.onDragStart?.(ev(null, 0)));
      return {
        move: (over: string | null, deltaY: number) =>
          act(() => dnd.onDragMove?.(ev(over, deltaY))),
        end: (over: string | null, deltaY: number) =>
          act(() => dnd.onDragEnd?.(ev(over, deltaY))),
        cancel: () => act(() => dnd.onDragCancel?.(ev(null, 0))),
      };
    };

    const touches = (x: number, y: number) => ({
      touches: [{ clientX: x, clientY: y }],
      changedTouches: [{ clientX: x, clientY: y }],
    });
    /** dnd-kit's overlay lets go of its card a microtask after the drop. */
    const overlayGone = () =>
      act(async () => {
        vi.advanceTimersByTime(100);
        await Promise.resolve();
      });
    /** A finger down on `el`, as the browser sends it: pointer, then touch. */
    const fingerDown = (el: Element, x = 100, y = 100) => {
      fireEvent.pointerDown(el, {
        pointerType: "touch",
        button: 0,
        isPrimary: true,
        clientX: x,
        clientY: y,
      });
      fireEvent.touchStart(el, touches(x, y));
    };

    it("lifts a row only after a 450ms hold within 10px", async () => {
      vi.useFakeTimers();
      render(<WideApp />);
      fingerDown(container("t1"));
      act(() => vi.advanceTimersByTime(LONG_PRESS_MS - 1));
      expect(lifted()).toBeNull();
      act(() => vi.advanceTimersByTime(1));
      expect(lifted()).toBeInTheDocument();
      // Lifted, raised and tilted, with no faded original or line.
      expect(lifted()).toHaveClass("n-lifted");
      expect(lifted()?.style.getPropertyValue("--n-drag-tilt")).toMatch(/deg$/);
      expect(shell("t1")).toHaveClass("opacity-0");
      expect(shell("t1")).not.toHaveClass("opacity-35");
      fireEvent.touchEnd(container("t1"), touches(100, 100));
      await overlayGone();
      expect(lifted()).toBeNull();
      expect(shell("t1")).not.toHaveClass("opacity-0");
      expect(update).not.toHaveBeenCalled();

      // Past the slop before the hold is up: a scroll, not a lift.
      fireEvent.keyDown(document, { key: "Escape" });
      fingerDown(container("t2"));
      act(() => vi.advanceTimersByTime(200));
      fireEvent.pointerMove(container("t2"), {
        pointerType: "touch",
        clientX: 100,
        clientY: 115,
      });
      fireEvent.touchMove(container("t2"), touches(100, 115));
      act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
      expect(lifted()).toBeNull();
      expect(menu()).toBeNull();
    });

    it("the hold opens the row's menu, selected; moving after the lift closes it and drags", async () => {
      vi.useFakeTimers();
      render(<WideApp />);
      fingerDown(container("t2"));
      act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
      expect(menu()).toBeInTheDocument();
      expect(container("t2")).toHaveAttribute("data-selected");
      // Let go without moving: the menu stays, nothing is saved.
      fireEvent.pointerUp(container("t2"), { pointerType: "touch" });
      fireEvent.touchEnd(container("t2"), touches(100, 100));
      await overlayGone();
      expect(menu()).toBeInTheDocument();
      expect(lifted()).toBeNull();
      expect(update).not.toHaveBeenCalled();
      fireEvent.keyDown(document.activeElement ?? document, {
        key: "Escape",
      });
      act(() => vi.advanceTimersByTime(500));
      expect(menu()).toBeNull();

      // Held again, then moved past the slop: the menu closes, it drags.
      fingerDown(container("t2"));
      act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
      expect(menu()).toBeInTheDocument();
      fireEvent.touchMove(container("t2"), touches(100, 130));
      act(() => vi.advanceTimersByTime(500));
      expect(menu()).toBeNull();
      expect(lifted()).toBeInTheDocument();
      fireEvent.touchEnd(container("t2"), touches(100, 130));
      await overlayGone();
      expect(lifted()).toBeNull();
    });

    it("parts its own column around a soft yellow gap, with no line", () => {
      reducedMotion = "no-preference";
      render(<WideApp />);
      const top = layOut("Today");
      const drag = driveTouch("t1");
      // Over its own slot: its own space is the gap.
      expect(gapIn("Today")).toHaveStyle({ top: "0px", height: `${ROW}px` });
      expect(gapIn("Today")?.firstElementChild).toHaveClass("bg-n-brand-soft");
      // Down 80: past Call Mum's middle, not Water plants'.
      drag.move("col:list-today", 80);
      expect(shift("t2")).toBe(`translateY(${-ROW}px)`);
      expect(shell("t2").style.transition).toContain("transform");
      expect(shift("t3")).toBe("");
      expect(gapIn("Today")).toHaveStyle({ top: `${ROW}px` });
      expect(gapIn("Today")).toHaveClass("transition-[top]");
      expect(gaps()).toHaveLength(1);
      expect(line()).toBeNull();
      expect(top).toBe(168);

      drag.end("col:list-today", 80);
      expect(update).toHaveBeenCalledTimes(1);
      const { id, input } = update.mock.calls[0][0];
      expect(id).toBe("t1");
      expect(input.position > "a1" && input.position < "a2").toBe(true);
      expect(gaps()).toEqual([]);
    });

    it("closes up its own column over another, which parts instead", () => {
      render(<WideApp />);
      layOut("Today");
      layOut("This week");
      const drag = driveTouch("t1");
      // 30px into This week's rows (Today's and This week's line up):
      // after Send invoke's middle, before Renew passport's.
      drag.move("col:list-week", 8);
      expect(gapIn("Today")).toBeNull();
      expect(gapIn("This week")).toHaveStyle({ top: `${ROW}px` });
      expect(gaps()).toHaveLength(1);
      expect(shift("t2")).toBe(`translateY(${-ROW}px)`);
      expect(shift("t3")).toBe(`translateY(${-ROW}px)`);
      expect(shift("w1")).toBe("");
      expect(shift("w2")).toBe(`translateY(${ROW}px)`);
      expect(line()).toBeNull();

      // Below This week's rows: last.
      drag.move("col:list-week", 200);
      expect(gapIn("This week")).toHaveStyle({ top: `${2 * ROW}px` });
      expect(shift("w2")).toBe("");
      drag.end("col:list-week", 200);
      expect(update).toHaveBeenCalledWith({
        id: "t1",
        input: expect.objectContaining({ listId: "list-week" }),
      });
      expect(update.mock.calls[0][0].input.position > "a1").toBe(true);
    });

    it("keeps a pinned row's gap among the pinned", () => {
      todos = todos.map((t) =>
        t.id === "t1" || t.id === "t2" ? { ...t, pinned: true } : t,
      );
      render(<WideApp />);
      layOut("Today");
      const drag = driveTouch("t1");
      drag.move("col:list-today", 4 * ROW);
      expect(shift("t2")).toBe(`translateY(${-ROW}px)`);
      expect(shift("t3")).toBe("");
      expect(gapIn("Today")).toHaveStyle({ top: `${ROW}px` });
    });

    it("opens the top of an empty column", () => {
      render(<WideApp />);
      layOut("Today");
      layOut("Someday");
      const drag = driveTouch("t1");
      drag.move("col:list-someday", 100);
      expect(gapIn("Someday")).toHaveStyle({ top: "0px" });
      drag.end("col:list-someday", 100);
      expect(update).toHaveBeenCalledWith({
        id: "t1",
        input: expect.objectContaining({ listId: "list-someday" }),
      });
    });

    it("moves to a sidebar list with no gap anywhere", () => {
      render(<WideApp />);
      layOut("Today");
      const drag = driveTouch("t1");
      drag.move("col:list-today", 80);
      drag.move("side:list-groceries", 300);
      expect(gaps()).toEqual([]);
      expect(shift("t2")).toBe(`translateY(${-ROW}px)`);
      drag.end("side:list-groceries", 300);
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "t1",
          input: expect.objectContaining({ listId: "list-groceries" }),
        }),
      );
    });

    it("saves nothing released where it started, over nothing, or cancelled", () => {
      render(<WideApp />);
      layOut("Today");
      let drag = driveTouch("t2");
      drag.move("col:list-today", 60);
      drag.move("col:list-today", 2);
      drag.end("col:list-today", 2);
      // Over Done, the open todo or nothing: no gap, and back it goes.
      drag = driveTouch("t2");
      drag.move("col:list-today", 60);
      drag.move(null, 400);
      expect(gaps()).toEqual([]);
      drag.end(null, 400);
      drag = driveTouch("t2");
      drag.move("col:list-today", 60);
      expect(shift("t3")).toBe(`translateY(${-ROW}px)`);
      drag.cancel();
      expect(shift("t3")).toBe("");
      expect(gaps()).toEqual([]);
      expect(update).not.toHaveBeenCalled();
      expect(rowIds("list-today")).toEqual(["t1", "t2", "t3"]);
    });

    it("scrolls the board near its side edges, following the finger", () => {
      vi.useFakeTimers();
      render(<WideApp />);
      const board = layOutBoard(600);
      const scrolled = () =>
        vi
          .mocked(board.scrollBy)
          .mock.calls.map(([arg]) => (arg as ScrollToOptions).left ?? 0);
      // Only touch events: dnd-kit's touch sensor sends no pointer moves.
      const finger = (x: number) =>
        window.dispatchEvent(
          Object.assign(new Event("touchmove"), {
            touches: [{ clientX: x, clientY: 300 }],
          }),
        );
      const drag = driveTouch("t1");
      drag.move("col:list-today", 40);
      finger(830);
      act(() => vi.advanceTimersByTime(100));
      expect(scrolled().length).toBeGreaterThan(0);
      expect(scrolled().every((left) => left > 0)).toBe(true);
      vi.mocked(board.scrollBy).mockClear();
      finger(500);
      act(() => vi.advanceTimersByTime(100));
      expect(scrolled()).toEqual([]);
      drag.end("col:list-studio", 40);
      expect(update).toHaveBeenCalledWith({
        id: "t1",
        input: expect.objectContaining({ listId: "list-studio" }),
      });
    });

    it("eases the rows into the new order, holding them where they parted", () => {
      reducedMotion = "no-preference";
      const { rerender } = render(<WideApp />);
      layOut("Today");
      const drag = driveTouch("t1");
      drag.move("col:list-today", 80);
      const callMum = shell("t2");
      drag.end("col:list-today", 80);
      rerender(<WideApp />);
      expect(rowIds("list-today")).toEqual(["t2", "t1", "t3"]);
      const framesOf = (el: Element) =>
        animate.mock.calls
          .filter((_, i) => animate.mock.contexts[i] === el)
          .map(([frames]) => frames);
      // Call Mum is held where it parted to until the new order renders,
      // which is where it lands: it doesn't spring back first.
      expect(framesOf(callMum)[0]).toEqual([
        { transform: `translateY(${-ROW}px)` },
        { transform: `translateY(${-ROW}px)` },
      ]);
      // Review PR eases down from its old place.
      expect(framesOf(shell("t1"))).toContainEqual([
        { transform: `translateY(${-ROW}px)` },
        { transform: "none" },
      ]);
    });

    it("doesn't animate under reduced motion", () => {
      const { rerender } = render(<WideApp />);
      layOut("Today");
      const drag = driveTouch("t1");
      drag.move("col:list-today", 80);
      expect(shift("t2")).toBe(`translateY(${-ROW}px)`);
      expect(shell("t2").style.transition).toBe("none");
      expect(gapIn("Today")).not.toHaveClass("transition-[top]");
      drag.end("col:list-today", 80);
      rerender(<WideApp />);
      expect(rowIds("list-today")).toEqual(["t2", "t1", "t3"]);
      expect(animate).not.toHaveBeenCalled();
    });

    it("a tap selects and a second tap opens; the checkbox ticks and never lifts", () => {
      vi.useFakeTimers();
      render(<WideApp />);
      const tap = (el: Element) => {
        fingerDown(el);
        fireEvent.pointerUp(el, { pointerType: "touch" });
        fireEvent.touchEnd(el, touches(100, 100));
        fireEvent.click(el, { detail: 1 });
      };
      tap(container("t2"));
      expect(container("t2")).toHaveAttribute("data-selected");
      expect(document.querySelector("[data-detail-column]")).toBeNull();
      tap(container("t2"));
      expect(
        document.querySelector("[data-detail-column]"),
      ).toBeInTheDocument();

      const check = container("t3").querySelector(
        "[data-row-check]",
      ) as HTMLElement;
      fingerDown(check);
      act(() => vi.advanceTimersByTime(LONG_PRESS_MS * 2));
      expect(lifted()).toBeNull();
      expect(menu()).toBeNull();
      fireEvent.click(check, { detail: 1 });
      expect(check).toHaveAttribute("aria-pressed", "true");
    });

    it("a mouse drag stays as it was: 6px, the line, no hold and no parting", () => {
      vi.useFakeTimers();
      render(<WideApp />);
      layOut("Today");
      const sensors = dnd.sensors ?? [];
      expect(sensors.map((s) => s.options)).toEqual([
        { activationConstraint: { delay: LONG_PRESS_MS, tolerance: 10 } },
        { activationConstraint: { distance: 6 } },
      ]);
      // No hold with a mouse: no menu, no lift.
      fireEvent.pointerDown(container("t1"), {
        pointerType: "mouse",
        button: 0,
        isPrimary: true,
        clientX: 100,
        clientY: 100,
      });
      act(() => vi.advanceTimersByTime(LONG_PRESS_MS * 2));
      expect(menu()).toBeNull();
      expect(lifted()).toBeNull();
      fireEvent.pointerUp(document, { pointerType: "mouse" });

      start("t1");
      move("t1", "col:list-today", 168 + 2 * ROW + 30);
      expect(line()).toBeInTheDocument();
      expect(gaps()).toEqual([]);
      for (const id of ["t2", "t3"]) expect(shift(id)).toBe("");
      end("t1", "col:list-today");
    });
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

  describe("/todo/:id", () => {
    const sheetTitle = () => {
      const sheet = document.querySelector<HTMLElement>("[data-detail-column]");
      return sheet
        ? within(sheet).getByRole<HTMLTextAreaElement>("textbox", {
            name: "Title",
          }).value
        : null;
    };

    it("goes to its column and opens it in the sheet beside it", () => {
      const onNavigate = vi.fn();
      render(
        <WideApp view={{ kind: "todo", id: "w1" }} onNavigate={onNavigate} />,
      );
      expect(selection()).toEqual({ id: "w1", column: "list-week" });
      expect(sheetTitle()).toBe("Send invoice");
      expect(slides().indexOf("sheet")).toBe(slides().indexOf("list-week") + 1);
      // The URL then names the column, as on arriving at /this-week.
      expect(onNavigate).toHaveBeenLastCalledWith({ kind: "thisWeek" });
    });

    it("names one of your lists as /list/:id", () => {
      const onNavigate = vi.fn();
      render(
        <WideApp view={{ kind: "todo", id: "g1" }} onNavigate={onNavigate} />,
      );
      expect(sheetTitle()).toBe("Parmesan");
      expect(onNavigate).toHaveBeenLastCalledWith({
        kind: "list",
        id: "list-groceries",
      });
    });

    it("waits for the todos before going", () => {
      todosLoading = true;
      const onNavigate = vi.fn();
      const { rerender } = render(
        <WideApp view={{ kind: "todo", id: "w1" }} onNavigate={onNavigate} />,
      );
      expect(onNavigate).not.toHaveBeenCalled();
      todosLoading = false;
      rerender(
        <WideApp view={{ kind: "todo", id: "w1" }} onNavigate={onNavigate} />,
      );
      expect(sheetTitle()).toBe("Send invoice");
      expect(onNavigate).not.toHaveBeenCalledWith(null);
    });

    it("sends an unknown todo back to /", async () => {
      const onNavigate = vi.fn();
      render(
        <WideApp view={{ kind: "todo", id: "nope" }} onNavigate={onNavigate} />,
      );
      await waitFor(() => expect(onNavigate).toHaveBeenCalledTimes(1));
      expect(onNavigate).toHaveBeenLastCalledWith(null);
      expect(sheetTitle()).toBeNull();
    });

    it("looks again for a todo that isn't in yet, as one just added on the Mac", async () => {
      const before = todos;
      refetchTodos.mockClear();
      refetchTodos.mockImplementationOnce(async () => {
        todos = [
          ...before,
          makeTodo({ id: "new", title: "Call Kaiser", listId: "list-week" }),
        ];
      });
      const onNavigate = vi.fn();
      render(
        <WideApp view={{ kind: "todo", id: "new" }} onNavigate={onNavigate} />,
      );
      await waitFor(() => expect(sheetTitle()).toBe("Call Kaiser"));
      expect(refetchTodos).toHaveBeenCalledTimes(1);
      expect(onNavigate).toHaveBeenLastCalledWith({ kind: "thisWeek" });
      todos = before;
    });
  });
});

describe("WideApp hidden columns", () => {
  const defaults = lists;
  /** Saves as the server would: the next render has the list's new state. */
  const applyUpdates = () =>
    updateList.mockImplementation(
      ({ id, input }: { id: string; input: Record<string, unknown> }) => {
        lists = lists.map((l) => (l.id === id ? { ...l, ...input } : l));
      },
    );
  const hide = (id: string) => {
    lists = lists.map((l) => (l.id === id ? { ...l, columnHidden: true } : l));
  };
  const sidebarEntry = (name: string) =>
    within(screen.getByRole("navigation", { name: "Lists" })).getByRole(
      "button",
      { name },
    );
  const rightClick = async (name: string) => {
    fireEvent.contextMenu(sidebarEntry(name));
    return screen.findByRole("menu");
  };
  /** Render, then render again once `updateList` has saved. */
  const renderBoard = (props: Parameters<typeof WideApp>[0] = {}) => {
    const view = render(<WideApp {...props} />);
    return () => act(() => view.rerender(<WideApp {...props} />));
  };

  beforeEach(() => {
    lists = defaults;
    updateList.mockReset();
    applyUpdates();
    todos = [
      makeTodo({ id: "t1", title: "Review PR", listId: "list-today" }),
      makeTodo({ id: "s1", title: "Read Piranesi", listId: "list-someday" }),
      makeTodo({ id: "g1", title: "Parmesan", listId: "list-groceries" }),
      makeTodo({ id: "st1", title: "Mix the EP", listId: "list-studio" }),
    ];
  });
  afterEach(() => {
    lists = defaults;
  });

  it("hides your list's column from its sidebar entry, and the others close up", async () => {
    const saved = renderBoard();
    const menu = await rightClick("Groceries");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((i) => i.textContent),
    ).toEqual(["Hide column"]);
    await userEvent.click(within(menu).getByRole("menuitem"));
    expect(updateList).toHaveBeenCalledWith({
      id: "list-groceries",
      input: { columnHidden: true },
    });
    saved();
    expect(screen.queryByRole("region", { name: "Groceries" })).toBeNull();
    expect(slides()).toEqual([
      "list-today",
      "list-week",
      "list-someday",
      "list-studio",
      "done",
      "end",
    ]);
    // No toast: the muted entry is where it comes back from.
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("keeps a hidden list's entry in place, muted, with its count", () => {
    hide("list-groceries");
    render(<WideApp />);
    const entries = document.querySelectorAll<HTMLElement>(
      "[data-sidebar-list]",
    );
    expect([...entries].map((b) => b.dataset.sidebarList)).toEqual([
      "list-today",
      "list-week",
      "list-someday",
      "list-groceries",
      "list-studio",
    ]);
    const groceries = sidebarEntry("Groceries");
    expect(groceries).toHaveAttribute("data-column-hidden");
    const classes = (el: HTMLElement) => el.className.split(" ");
    expect(classes(groceries)).toContain("text-n-ink-muted");
    expect(classes(groceries)).not.toContain("text-n-ink");
    expect(classes(sidebarEntry("Studio"))).toContain("text-n-ink");
    expect(groceries).toHaveAccessibleDescription("1 todo, column hidden");
  });

  it("Show column brings it back in its usual place", async () => {
    hide("list-groceries");
    const saved = renderBoard();
    const menu = await rightClick("Groceries");
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Show column" }),
    );
    expect(updateList.mock.calls[0][0]).toEqual({
      id: "list-groceries",
      input: { columnHidden: false },
    });
    saved();
    expect(slides()).toEqual([
      "list-today",
      "list-week",
      "list-someday",
      "list-groceries",
      "list-studio",
      "done",
      "end",
    ]);
  });

  it("hides a column from the open eye before its count", async () => {
    render(<WideApp />);
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Hide column",
        description: "Groceries",
      }),
    );
    expect(updateList.mock.calls[0][0]).toEqual({
      id: "list-groceries",
      input: { columnHidden: true },
    });
  });

  it("shows a hidden column from its closed eye", async () => {
    hide("list-groceries");
    render(<WideApp />);
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Show column",
        description: "Groceries",
      }),
    );
    expect(updateList.mock.calls[0][0]).toEqual({
      id: "list-groceries",
      input: { columnHidden: false },
    });
  });

  it("gives the time lists no eye", () => {
    render(<WideApp />);
    expect(document.querySelectorAll("[data-column-eye]")).toHaveLength(2);
  });

  const eyeOf = (id: string) => {
    const eye = document.querySelector<HTMLElement>(
      `[data-column-eye="${id}"]`,
    );
    if (!eye) throw new Error(`no eye for ${id}`);
    return eye;
  };
  const classesOf = (el: Element) => el.className.split(" ");

  it("keeps the time lists' counts on the same right edge as yours", () => {
    render(<WideApp />);
    expect(classesOf(sidebarEntry("Today"))).not.toContain("pr-9");
    expect(sidebarEntry("Today").querySelector("[data-eye-space]")).toBeNull();
  });

  it("puts the eye before the count, in space the entry always keeps", () => {
    render(<WideApp />);
    const entry = sidebarEntry("Groceries");
    const space = entry.querySelector("[data-eye-space]");
    expect(space).not.toBeNull();
    // The kept space comes after the name and before the count…
    expect(space?.previousElementSibling).toHaveTextContent("Groceries");
    expect(space?.nextElementSibling).toHaveTextContent("1");
    // …and the eye lies over it, lined up by an invisible copy of the count.
    const eye = eyeOf("list-groceries");
    const copy = eye.nextElementSibling;
    expect(copy).toHaveTextContent("1");
    expect(copy).toHaveClass("invisible");
  });

  it("puts the eye after its entry, so it's on top, but out of the Tab order", () => {
    render(<WideApp />);
    const entry = sidebarEntry("Groceries");
    const eye = eyeOf("list-groceries");
    expect(
      entry.compareDocumentPosition(eye) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Tab moves between sections; the palette's Hide column reaches it.
    expect(eye).toHaveAttribute("tabindex", "-1");
  });

  it("opens the same menu when the eye is right-clicked", async () => {
    render(<WideApp />);
    fireEvent.contextMenu(eyeOf("list-groceries"));
    const menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((i) => i.textContent),
    ).toEqual(["Hide column"]);
  });

  it("shows a shown list's open eye only on hover or focus", () => {
    render(<WideApp />);
    const eye = eyeOf("list-studio");
    expect(eye.querySelector(".lucide-eye")).not.toBeNull();
    const c = classesOf(eye);
    expect(c).toContain("pointer-fine:opacity-0");
    expect(c).toContain("pointer-fine:group-hover/entry:opacity-100");
    expect(c).toContain(
      "pointer-fine:group-has-[:focus-visible]/entry:opacity-100",
    );
  });

  it("always shows a hidden list's closed eye", () => {
    hide("list-groceries");
    render(<WideApp />);
    const eye = eyeOf("list-groceries");
    expect(eye.querySelector(".lucide-eye-off")).not.toBeNull();
    expect(classesOf(eye)).not.toContain("pointer-fine:opacity-0");
  });

  it("lights the whole row on hover, the eye included", () => {
    render(<WideApp />);
    expect(classesOf(sidebarEntry("Groceries"))).toContain(
      "pointer-fine:group-hover/entry:bg-n-surface",
    );
  });

  it("toggles from the eye without going to the list", async () => {
    const onNavigate = vi.fn();
    const saved = renderBoard({ onNavigate });
    onNavigate.mockClear();
    await userEvent.click(eyeOf("list-studio"));
    saved();
    expect(updateList.mock.calls[0][0]).toEqual({
      id: "list-studio",
      input: { columnHidden: true },
    });
    expect(onNavigate).not.toHaveBeenCalledWith({
      kind: "list",
      id: "list-studio",
    });
    // Now hidden, the same eye is closed, and brings it back.
    expect(eyeOf("list-studio")).toHaveAccessibleName("Show column");
    await userEvent.click(eyeOf("list-studio"));
    expect(updateList.mock.calls[1][0]).toEqual({
      id: "list-studio",
      input: { columnHidden: false },
    });
  });

  it("offers no Hide column on Today, This week or Someday", () => {
    render(<WideApp />);
    for (const name of ["Today", "This week", "Someday"]) {
      fireEvent.contextMenu(sidebarEntry(name));
      expect(screen.queryByRole("menu")).toBeNull();
    }
  });

  it("clicking a hidden list's entry shows its column and goes in", async () => {
    hide("list-groceries");
    const saved = renderBoard();
    const board = layOutBoard(600);
    await userEvent.click(sidebarEntry("Groceries"));
    expect(updateList.mock.calls[0][0]).toEqual({
      id: "list-groceries",
      input: { columnHidden: false },
    });
    saved();
    expect(column("Groceries")).toBeInTheDocument();
    expect(focusedTitle()).toContain("Parmesan");
    // The fourth column, 816–1088px: scrolled just far enough.
    expect(board.scrollTo).toHaveBeenLastCalledWith({
      left: 1088 - 600,
      behavior: "auto",
    });
  });

  it("choosing a hidden list in the palette shows its column", async () => {
    hide("list-groceries");
    const saved = renderBoard();
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const palette = await screen.findByRole("dialog", {
      name: "Search and commands",
    });
    await userEvent.type(within(palette).getByRole("combobox"), "Groceries");
    await userEvent.click(
      within(palette).getByRole("option", { name: /^Groceries/ }),
    );
    expect(updateList.mock.calls[0][0]).toEqual({
      id: "list-groceries",
      input: { columnHidden: false },
    });
    saved();
    expect(focusedTitle()).toContain("Parmesan");
  });

  it("opening a hidden list's /list/:id shows its column", () => {
    hide("list-groceries");
    const onNavigate = vi.fn();
    const saved = renderBoard({
      view: { kind: "list", id: "list-groceries" },
      onNavigate,
    });
    expect(updateList.mock.calls[0][0]).toEqual({
      id: "list-groceries",
      input: { columnHidden: false },
    });
    saved();
    expect(focusedTitle()).toContain("Parmesan");
    expect(onNavigate).not.toHaveBeenCalledWith(null);
  });

  it("the palette offers Hide column for the selection's list, not a time list's", async () => {
    const saved = renderBoard();
    const commands = async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
      const palette = await screen.findByRole("dialog", {
        name: "Search and commands",
      });
      await userEvent.type(within(palette).getByRole("combobox"), "column");
      return within(palette).queryAllByRole("option");
    };
    act(() => rowButton("Review PR").focus());
    expect(await commands()).toEqual([]);
    await userEvent.keyboard("{Escape}");

    act(() => rowButton("Mix the EP").focus());
    const [option] = await commands();
    expect(option).toHaveTextContent("Hide column “Studio”");
    await userEvent.click(option);
    saved();
    expect(screen.queryByRole("region", { name: "Studio" })).toBeNull();
    // The keyboard moved to the column before it.
    expect(focusedTitle()).toContain("Parmesan");
  });

  it("hiding the column with the keyboard from its ⋯ menu moves it to the column before", async () => {
    const saved = renderBoard();
    act(() => rowButton("Parmesan").focus());
    await userEvent.click(
      screen.getByRole("button", { name: "Groceries options" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Hide column" }),
    );
    saved();
    expect(screen.queryByRole("region", { name: "Groceries" })).toBeNull();
    expect(focusedTitle()).toContain("Read Piranesi");
    // The sidebar's bar went with the selection, to Someday.
    const nav = screen.getByRole("navigation", { name: "Lists" });
    expect(
      nav.querySelector("[data-selection-bar]")?.closest("button"),
    ).toHaveAccessibleName("Someday");
  });

  it("← → skip a hidden column", () => {
    hide("list-groceries");
    render(<WideApp />);
    rowButton("Read Piranesi").focus();
    press("ArrowRight");
    expect(focusedTitle()).toContain("Mix the EP");
    press("ArrowLeft");
    expect(focusedTitle()).toContain("Read Piranesi");
  });

  it("leaves a hidden column out of the Tab order", () => {
    hide("list-groceries");
    render(<WideApp />);
    const stops = [
      ...document.querySelectorAll<HTMLElement>(
        'main[aria-label="Board"] [data-row-id][tabindex="0"]',
      ),
    ].map((el) => el.dataset.rowList);
    expect(stops).not.toContain("list-groceries");
    expect(stops).toContain("list-studio");
  });

  it("hiding the open todo's column closes its sheet", async () => {
    const saved = renderBoard();
    await userEvent.dblClick(rowButton("Parmesan"));
    await screen.findByRole("dialog");
    expect(slides()).toContain("sheet");
    fireEvent.contextMenu(sidebarEntry("Groceries"));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Hide column" }),
    );
    saved();
    expect(slides()).not.toContain("sheet");
    expect(screen.queryByRole("region", { name: "Groceries" })).toBeNull();
  });

  it("closes the sheet when its column is hidden from another window", async () => {
    const saved = renderBoard();
    await userEvent.dblClick(rowButton("Parmesan"));
    await screen.findByRole("dialog");
    hide("list-groceries");
    saved();
    expect(slides()).not.toContain("sheet");
  });
});

describe("WideApp copy list ID", () => {
  let writeText: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });

  const openMenu = async (name: string) => {
    await userEvent.click(
      screen.getByRole("button", { name: `${name} options` }),
    );
    return screen.findByRole("menu");
  };

  it("sits in your list's ⋯ menu after Hide column, before Delete list", async () => {
    render(<WideApp />);
    const menu = await openMenu("Groceries");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((i) => i.textContent),
    ).toEqual(["Rename", "Hide column", "Copy list ID", "Delete list"]);
  });

  it("isn't offered on Today, This week, Someday or Done", () => {
    render(<WideApp />);
    for (const name of ["Today", "This week", "Someday", "Done"]) {
      expect(
        screen.queryByRole("button", { name: `${name} options` }),
      ).toBeNull();
    }
    // Nor on the sidebar's right-click menu, which only hides and shows.
    fireEvent.contextMenu(
      within(screen.getByRole("navigation", { name: "Lists" })).getByRole(
        "button",
        { name: "Groceries" },
      ),
    );
    expect(screen.queryByRole("menuitem", { name: "Copy list ID" })).toBeNull();
  });

  it("copies the list's id, as /v1/lists/:id takes it, and says so", async () => {
    render(<WideApp />);
    const menu = await openMenu("Studio");
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Copy list ID" }),
    );
    expect(writeText).toHaveBeenCalledWith("list-studio");
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Copied"));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("says when the clipboard refuses", async () => {
    writeText.mockRejectedValue(undefined);
    render(<WideApp />);
    const menu = await openMenu("Studio");
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Copy list ID" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn’t copy"),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("WideApp, a row that fails to draw", () => {
  /** A todo as an older API sent it from smart-create: no `urls`. */
  const withoutUrls = (overrides: Partial<TodoWithUrls>) => {
    const { urls: _, ...bare } = makeTodo(overrides);
    return bare as TodoWithUrls;
  };
  let quiet: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    // React logs the caught error; the test is that it's caught.
    quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    todos = [
      makeTodo({ id: "t1", title: "Review PR", listId: "list-today" }),
      makeTodo({ id: "w1", title: "Send invoice", listId: "list-week" }),
      makeTodo({ id: "g1", title: "Parmesan", listId: "list-groceries" }),
      makeTodo({ id: "st1", title: "Mix the EP", listId: "list-studio" }),
    ];
  });
  afterEach(() => {
    quiet.mockRestore();
    liveCache = false;
    vi.unstubAllGlobals();
  });

  it("takes down only its column, which says so, and comes back once the todos change", () => {
    todos = [
      ...todos,
      withoutUrls({
        id: "g2",
        title: "Olive oil",
        listId: "list-groceries",
        position: "a1",
      }),
    ];
    const { rerender } = render(<WideApp />);
    const groceries = column("Groceries");
    expect(within(groceries).getByText("Couldn't show this")).toHaveClass(
      "text-n-ink-muted",
    );
    expect(within(groceries).queryByText("Parmesan")).toBeNull();
    // The column's head and Add still work around it.
    expect(
      screen.getByRole("textbox", { name: "New todo in Groceries" }),
    ).toBeInTheDocument();
    expect(rowButton("Review PR")).toBeInTheDocument();
    expect(rowButton("Send invoice")).toBeInTheDocument();
    expect(rowButton("Mix the EP")).toBeInTheDocument();

    todos = todos.map((t) => (t.id === "g2" ? makeTodo(t) : t));
    rerender(<WideApp />);
    expect(within(groceries).queryByText("Couldn't show this")).toBeNull();
    expect(rowButton("Olive oil")).toBeInTheDocument();
  });

  it("survives a smart-create that answers without urls, with the todo open beside Today", async () => {
    liveCache = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          todos: [
            withoutUrls({
              id: "added-1",
              title: "Read",
              listId: "list-today",
              position: "0",
            }),
          ],
        }),
      ),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <WideApp />
      </QueryClientProvider>,
    );
    const add = screen.getByRole("textbox", { name: "New todo in today" });
    await userEvent.type(add, "Read https://example.com{Enter}");
    await act(async () => {});
    expect(
      queryClient
        .getQueryData<TodoWithUrls[]>(["todos"])
        ?.find((t) => t.id === "added-1")?.urls,
    ).toEqual([]);
    expect(rowButton("Read")).toBeInTheDocument();
    expect(document.querySelector("[data-detail-column]")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't show this")).toBeNull();
  });
});
