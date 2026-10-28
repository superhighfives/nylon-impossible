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
    expect(groceries).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual(expect.arrayContaining(["Today", "This week", "Someday"]));
    expect(screen.queryByRole("region", { name: "Groceries" })).toBeNull();
  });

  it("opens one of your lists as a fourth column, swaps it, and closes it", async () => {
    render(<WideApp />);
    const nav = screen.getByRole("navigation", { name: "Lists" });
    await userEvent.click(
      within(nav).getByRole("button", { name: /Groceries/ }),
    );
    expect(column("Groceries")).toBeInTheDocument();
    expect(focusedTitle()).toContain("Parmesan");

    await userEvent.click(within(nav).getByRole("button", { name: /Studio/ }));
    expect(screen.queryByRole("region", { name: "Groceries" })).toBeNull();
    expect(column("Studio")).toBeInTheDocument();

    await userEvent.click(within(nav).getByRole("button", { name: /Studio/ }));
    expect(screen.queryByRole("region", { name: "Studio" })).toBeNull();
  });

  it("focuses a time list's column from the sidebar", async () => {
    render(<WideApp />);
    const nav = screen.getByRole("navigation", { name: "Lists" });
    await userEvent.click(
      within(nav).getByRole("button", { name: /This week/ }),
    );
    expect(focusedTitle()).toContain("Send invoice");
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

  it("right-click opens the context menu with your lists and Due…", async () => {
    render(<WideApp />);
    fireEvent.contextMenu(rowButton("Review PR"), {
      clientX: 200,
      clientY: 200,
    });
    const menu = await screen.findByRole("menu", { name: "Todo actions" });
    const names = within(menu)
      .getAllByRole("menuitem")
      .map((i) => i.textContent);
    expect(names).toEqual([
      "Move to This week",
      "Move to Someday",
      "Move to Groceries",
      "Move to Studio",
      "Due…",
      "Pin to top",
      "Delete",
    ]);
  });

  it("n focuses the focused column's composer, Today by default", () => {
    render(<WideApp />);
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(window, { key: "n" });
    expect(document.activeElement).toHaveAccessibleName("New todo in Today");
    rowButton("Read Piranesi").focus();
    press("n");
    expect(document.activeElement).toHaveAccessibleName("New todo in Someday");
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

  it("Enter opens the detail as a panel", async () => {
    render(<WideApp />);
    await userEvent.click(rowButton("Call Mum"));
    const panel = await screen.findByRole("dialog");
    expect(panel).toHaveAttribute("data-detail-panel");
    expect(within(panel).getByRole("textbox", { name: "Title" })).toHaveValue(
      "Call Mum",
    );
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

  it("creates a list from the sidebar and opens it", async () => {
    render(<WideApp />);
    await userEvent.type(
      screen.getByRole("textbox", { name: "New list name" }),
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
