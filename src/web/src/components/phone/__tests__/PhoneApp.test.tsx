import {
  type DndContextProps,
  PointerSensor,
  TouchSensor,
} from "@dnd-kit/core";
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
import { dropPlacement } from "@/lib/dragOrder";
import type { TodoWithUrls } from "@/types/database";
import { splitLists } from "../model";
import { LONG_PRESS_MS } from "../TodoRow";
import { makeList, makeTodo } from "./fixtures";

const lists = [
  makeList("list-today", "Today", "today"),
  makeList("list-week", "This week", "thisWeek"),
  makeList("list-someday", "Someday", "someday"),
  makeList("list-groceries", "Groceries", null),
];
const startingTodos = [
  makeTodo({ id: "open", title: "Water the plants" }),
  makeTodo({
    id: "finished",
    title: "Email the landlord",
    completed: true,
    completedAt: new Date().toISOString(),
  }),
];
let todos: TodoWithUrls[] = startingTodos;
const { byKind, collections } = splitLists(lists);
const place = vi.fn();
/** The client's Reduce motion hint; the drag tests turn it off. */
let reducedMotion = "reduce";

vi.mock("../useBoardData", () => ({
  useBoardData: () => ({
    timeZone: "UTC",
    lists,
    todos,
    byKind,
    collections,
    listName: (id: string) => lists.find((l) => l.id === id)?.name ?? "List",
    actions: {
      checked: new Set(),
      collapsing: new Set(),
      complete: vi.fn(),
      restore: vi.fn(),
      place,
    },
    subtasksOf: () => [],
    rowsFor: (id: string | undefined) =>
      todos.filter((t) => t.listId === id && !t.completed),
    targets: [],
    loading: false,
    todosLoading: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
  }),
}));
vi.mock("../OvernightNote", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../OvernightNote")>()),
  useOvernightNote: () => ({
    text: "2 moved to This week overnight",
    dismiss: vi.fn(),
    seeKind: "thisWeek",
  }),
}));
vi.mock("@/hooks/useHints", () => ({
  useHints: () => ({ reducedMotion, timeZone: "UTC" }),
}));
vi.mock("@/hooks/useLists", () => ({
  useCreateList: () => ({ mutate: vi.fn() }),
}));
vi.mock("@clerk/tanstack-react-start", () => ({
  useUser: () => ({ user: null }),
  useClerk: () => ({ signOut: vi.fn() }),
}));
vi.mock("../../FeedbackDialog", () => ({
  FeedbackDialog: () => null,
  useCanSendFeedback: () => false,
}));
vi.mock("../Composer", () => ({ Composer: () => null }));
vi.mock("../DetailSheet", () => ({ DetailSheet: () => null }));
vi.mock("../ContextMenu", () => ({
  ContextMenu: ({ todo }: { todo: TodoWithUrls | null }) =>
    todo ? <div role="dialog" aria-label={`Menu for ${todo.title}`} /> : null,
  moveMenuFocus: vi.fn(),
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
vi.mock("../SettingsScreen", () => ({ SettingsScreen: () => null }));

import { PhoneApp } from "../PhoneApp";

beforeAll(() => {
  // jsdom doesn't scroll; the pager's position is set by hand below.
  Element.prototype.scrollTo = vi.fn();
});

const switcher = () => screen.getByRole("navigation", { name: "Lists" });
const doneButton = () =>
  within(switcher()).getByRole("button", { name: "Done" });
const page = (key: string) =>
  document.getElementById(`phone-page-${key}`) as HTMLElement;
const indicator = () =>
  switcher().querySelector("span[aria-hidden=true]") as HTMLElement;

describe("PhoneApp", () => {
  it("puts Done after Lists in the switcher, current only when showing", async () => {
    render(<PhoneApp />);
    const names = within(switcher())
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(names).toEqual(["Today", "This week", "Someday", "Lists", "Done"]);
    expect(doneButton()).not.toHaveAttribute("aria-current");
    expect(page("done")).toHaveAttribute("inert");

    await userEvent.click(doneButton());
    expect(doneButton()).toHaveAttribute("aria-current", "page");
    expect(page("done")).not.toHaveAttribute("inert");
    expect(page("today")).toHaveAttribute("inert");
    // Done has no tab, so the underline goes.
    expect(indicator().style.opacity).toBe("0");
    expect(
      within(page("done")).getByRole("heading", { name: "Done" }),
    ).toBeInTheDocument();
    expect(within(page("done")).getByText("Email the landlord")).toBeVisible();
  });

  it("reaches Done with → from Lists, and End", async () => {
    render(<PhoneApp />);
    const tab = within(switcher()).getByRole("button", { name: "Lists" });
    await userEvent.click(tab);
    expect(indicator().style.opacity).toBe("1");
    await userEvent.keyboard("{ArrowRight}");
    expect(doneButton()).toHaveFocus();
    expect(doneButton()).toHaveAttribute("aria-current", "page");

    await userEvent.keyboard("{Home}");
    expect(
      within(switcher()).getByRole("button", { name: "Today" }),
    ).toHaveAttribute("aria-current", "page");
    await userEvent.keyboard("{End}");
    expect(doneButton()).toHaveAttribute("aria-current", "page");
  });

  it("leaves Done out of the account sheet", async () => {
    render(<PhoneApp />);
    await userEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(
      (await screen.findAllByRole("menuitem")).map((i) => i.textContent),
    ).toEqual(["Settings", "Sign out"]);
  });

  it("keeps the banner's space on every top-level page, with the pill on Today", async () => {
    render(<PhoneApp />);
    for (const key of ["today", "thisWeek", "someday", "lists", "done"]) {
      expect(page(key).querySelector("[data-banner-slot]")).not.toBeNull();
    }
    const pill = within(page("today")).getByRole("status");
    expect(pill.closest("[data-banner-slot]")).not.toBeNull();
    await userEvent.click(
      within(pill).getByRole("button", { name: "2 moved to This week" }),
    );
    expect(
      within(switcher()).getByRole("button", { name: "This week" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("swiping settles on the page it lands on, even after a tab tap", async () => {
    render(<PhoneApp />);
    const pager = page("today").parentElement as HTMLElement;
    Object.defineProperty(pager, "clientWidth", { value: 390 });
    // A tab tap starts a scroll to Done that a trackpad swipe cuts short.
    await userEvent.click(doneButton());
    act(() => {
      pager.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
      pager.scrollLeft = 390;
      pager.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    expect(
      within(switcher()).getByRole("button", { name: "This week" }),
    ).toHaveAttribute("aria-current", "page");
  });
});

describe("PhoneApp reordering", () => {
  const ROW = 48;
  const realOffsetTop = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "offsetTop",
  );
  const realOffsetHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "offsetHeight",
  );
  const realRect = Element.prototype.getBoundingClientRect;
  const realAnimate = Element.prototype.animate;
  const animate = vi.fn();

  const today = () => [
    makeTodo({ id: "p1", title: "Pinned", position: "a0", pinned: true }),
    makeTodo({ id: "t1", title: "Review PR", position: "a0" }),
    makeTodo({ id: "t2", title: "Call Mum", position: "a1" }),
    makeTodo({ id: "t3", title: "Water plants", position: "a2" }),
    makeTodo({ id: "t4", title: "Send invoice", position: "a3" }),
  ];

  beforeEach(() => {
    todos = today();
    place.mockReset();
    animate.mockReset();
    // jsdom has no layout: a row sits at its index × ROW in its list, and
    // on screen where its transform puts it.
    Object.defineProperty(HTMLElement.prototype, "offsetTop", {
      configurable: true,
      get(this: HTMLElement) {
        const parent = this.parentElement;
        return parent ? [...parent.children].indexOf(this) * ROW : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get: () => ROW,
    });
    Element.prototype.getBoundingClientRect = function (this: HTMLElement) {
      const dy = Number(
        /translateY\((-?[\d.]+)px\)/.exec(this.style?.transform ?? "")?.[1] ??
          0,
      );
      const top = this.matches("li[data-phone-row]") ? this.offsetTop + dy : 0;
      return { top, bottom: top + ROW, height: ROW } as DOMRect;
    };
    Element.prototype.animate = animate;
    document.documentElement.style.setProperty("--n-duration-base", "220ms");
    document.documentElement.style.setProperty(
      "--n-ease-out-strong",
      "cubic-bezier(0.23, 1, 0.32, 1)",
    );
  });

  afterEach(() => {
    todos = startingTodos;
    reducedMotion = "reduce";
    vi.useRealTimers();
    if (realOffsetTop) {
      Object.defineProperty(HTMLElement.prototype, "offsetTop", realOffsetTop);
    }
    if (realOffsetHeight) {
      Object.defineProperty(
        HTMLElement.prototype,
        "offsetHeight",
        realOffsetHeight,
      );
    }
    Element.prototype.getBoundingClientRect = realRect;
    Element.prototype.animate = realAnimate;
    document.documentElement.removeAttribute("style");
  });

  const todo = (id: string) => todos.find((t) => t.id === id) as TodoWithUrls;
  const body = (title: string) =>
    within(page("today"))
      .getAllByRole("button")
      .find(
        (b) =>
          b.hasAttribute("data-row-id") && b.textContent?.startsWith(title),
      ) as HTMLElement;
  const row = (id: string) =>
    page("today")
      .querySelector(`[data-row-id="${id}"]`)
      ?.closest("li") as HTMLElement;
  const titles = () =>
    [...page("today").querySelectorAll("li[data-phone-row]")].map((li) =>
      li.querySelector("[data-row-id]")?.getAttribute("data-row-id"),
    );
  const line = () =>
    page("today").querySelector<HTMLElement>("[data-drop-indicator]");
  const menu = () => screen.queryByRole("dialog", { name: /^Menu for/ });

  // Each row is grabbed 22px down; a touch starts with a touch event.
  const touchAt = (y: number) =>
    ({ type: "touchstart", touches: [{ clientX: 20, clientY: y }] }) as never;
  const mouseAt = (y: number) => new MouseEvent("pointerdown", { clientY: y });
  const event = (id: string, activatorEvent: unknown, deltaY = 0) =>
    ({
      active: {
        id,
        data: { current: { todo: todo(id), listId: "list-today" } },
      },
      over: null,
      activatorEvent,
      delta: { x: 0, y: deltaY },
    }) as never;
  const drive = (id: string, at: unknown) => {
    const index = todos.findIndex((t) => t.id === id);
    const grab = index * ROW + 22;
    const activator = typeof at === "function" ? at(grab) : at;
    act(() => dnd.onDragStart?.(event(id, activator)));
    return {
      move: (deltaY: number) =>
        act(() => dnd.onDragMove?.(event(id, activator, deltaY))),
      end: (deltaY: number) =>
        act(() => dnd.onDragEnd?.(event(id, activator, deltaY))),
      cancel: () => act(() => dnd.onDragCancel?.(event(id, activator))),
    };
  };

  it("touch: a long-press lifts the row, and dragging saves the slot's position", () => {
    reducedMotion = "no-preference";
    render(<PhoneApp />);
    const drag = drive("t1", touchAt);
    expect(row("t1")).toHaveAttribute("data-lifted");
    // Review PR's middle is at 72: down 80 is past Call Mum's middle (120)
    // but not Water plants' (168), so it goes after Call Mum.
    drag.move(80);
    expect(row("t2").style.transform).toBe(`translateY(${-ROW}px)`);
    expect(row("t2").style.transition).toContain("transform");
    expect(row("t3").style.transform).toBe("");
    expect(row("p1").style.transform).toBe("");
    // Touch parts the rows; there's no line.
    expect(line()).toBeNull();
    // The lifted row keeps its look and doesn't fade.
    expect(row("t1")).not.toHaveClass("opacity-35");

    const expected = dropPlacement(today(), todo("t1"), 2).position;
    drag.end(80);
    expect(place).toHaveBeenCalledTimes(1);
    expect(place).toHaveBeenCalledWith(todo("t1"), "list-today", expected);
    // The dropped order shows straight away, and settles from where the
    // lifted row was.
    expect(titles()).toEqual(["p1", "t2", "t1", "t3", "t4"]);
    expect(row("t1")).not.toHaveAttribute("data-lifted");
    expect(row("t2").style.transform).toBe("");
    const t1 = animate.mock.contexts.indexOf(row("t1"));
    expect(t1).toBeGreaterThanOrEqual(0);
    expect(animate.mock.calls[t1][0][0]).toEqual({
      transform: `translateY(${-ROW}px)`,
    });
  });

  it("touch: rows part and settle without sliding under reduced motion", () => {
    render(<PhoneApp />);
    const drag = drive("t1", touchAt);
    drag.move(80);
    expect(row("t2").style.transform).toBe(`translateY(${-ROW}px)`);
    expect(row("t2").style.transition).toBe("none");
    drag.end(80);
    expect(place).toHaveBeenCalledTimes(1);
    expect(animate).not.toHaveBeenCalled();
  });

  it("touch: holding still keeps the menu; moving after the lift closes it and drags", () => {
    vi.useFakeTimers();
    render(<PhoneApp />);
    fireEvent.pointerDown(body("Review PR"), {
      button: 0,
      pointerType: "touch",
      clientX: 20,
      clientY: 70,
    });
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(menu()).toHaveAccessibleName("Menu for Review PR");

    // The finger lifts without moving: the menu stays, nothing is saved.
    let drag = drive("t1", touchAt);
    drag.move(4);
    drag.end(4);
    expect(menu()).not.toBeNull();
    expect(place).not.toHaveBeenCalled();

    // Lifted again, it moves past the slop: the menu closes and it drags.
    drag = drive("t1", touchAt);
    drag.move(30);
    expect(menu()).toBeNull();
    drag.move(80);
    expect(row("t2").style.transform).toBe(`translateY(${-ROW}px)`);
  });

  it("touch: a pinned row's gap stays among the pinned", () => {
    todos = [
      makeTodo({ id: "p1", title: "Pinned", position: "a0", pinned: true }),
      makeTodo({
        id: "p2",
        title: "Also pinned",
        position: "a1",
        pinned: true,
      }),
      ...today().slice(1),
    ];
    render(<PhoneApp />);
    const drag = drive("p1", touchAt);
    // Down past every row: the gap stops after the last pinned one.
    drag.move(4 * ROW);
    expect(row("p2").style.transform).toBe(`translateY(${-ROW}px)`);
    for (const id of ["t1", "t2", "t3", "t4"]) {
      expect(row(id).style.transform).toBe("");
    }
    const { index, position } = dropPlacement(todos, todo("p1"), 5);
    expect(index).toBe(1);
    expect(position > "a1").toBe(true);
    drag.end(4 * ROW);
    expect(place).toHaveBeenCalledWith(todo("p1"), "list-today", position);
    expect(titles()).toEqual(["p2", "p1", "t1", "t2", "t3", "t4"]);
  });

  it("releasing where it started, or a cancelled touch, saves nothing", () => {
    render(<PhoneApp />);
    let drag = drive("t2", touchAt);
    drag.move(60);
    drag.move(5);
    drag.end(5);
    drag = drive("t2", touchAt);
    drag.move(80);
    expect(row("t3").style.transform).toBe(`translateY(${-ROW}px)`);
    drag.cancel();
    expect(row("t3").style.transform).toBe("");
    expect(place).not.toHaveBeenCalled();
    expect(titles()).toEqual(["p1", "t1", "t2", "t3", "t4"]);
  });

  it("a mouse drags after 6px, with no long-press, the line and no parting", () => {
    vi.useFakeTimers();
    render(<PhoneApp />);
    // No long-press with a mouse: right-click opens the menu instead.
    fireEvent.pointerDown(body("Review PR"), {
      button: 0,
      pointerType: "mouse",
    });
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS * 2));
    expect(menu()).toBeNull();
    vi.useRealTimers();

    const sensors = dnd.sensors ?? [];
    const touch = sensors.find((s) => s.sensor === TouchSensor);
    expect(touch?.options).toEqual({
      activationConstraint: { delay: LONG_PRESS_MS, tolerance: 10 },
    });
    const pointer = sensors.find(
      (s) => s.sensor.prototype instanceof PointerSensor,
    );
    expect(pointer?.options).toEqual({ activationConstraint: { distance: 6 } });
    const activate = (pointerType: string) =>
      pointer?.sensor.activators[0].handler(
        {
          nativeEvent: { pointerType, isPrimary: true, button: 0 },
        } as never,
        {},
        {} as never,
      );
    expect(activate("touch")).toBe(false);
    expect(activate("mouse")).toBe(true);
    expect(activate("pen")).toBe(true);

    const drag = drive("t1", mouseAt);
    drag.move(80);
    // The line between Call Mum and Water plants; the original fades.
    expect(line()).toHaveStyle({ top: `${3 * ROW}px` });
    expect(line()).toHaveClass("bg-n-brand");
    expect(row("t1")).toHaveClass("opacity-35");
    expect(row("t1")).not.toHaveAttribute("data-lifted");
    for (const id of ["p1", "t2", "t3", "t4"]) {
      expect(row(id).style.transform).toBe("");
    }
    drag.end(80);
    expect(line()).toBeNull();
    expect(place).toHaveBeenCalledWith(
      todo("t1"),
      "list-today",
      dropPlacement(today(), todo("t1"), 2).position,
    );
  });
});
