import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LONG_PRESS_MS,
  metaChip,
  TodoRow,
  type TodoRowProps,
} from "../TodoRow";
import { dueIn, makeTodo, NOW, TZ } from "./fixtures";

function setup(overrides: Partial<TodoRowProps> = {}) {
  const props: TodoRowProps = {
    todo: makeTodo({ dueDate: dueIn(-3), notes: "Bring photos" }),
    subtasks: [],
    now: NOW,
    timeZone: TZ,
    checked: false,
    collapsing: false,
    highlighted: false,
    onCheck: vi.fn(),
    onOpen: vi.fn(),
    onMenu: vi.fn(),
    ...overrides,
  };
  render(
    <ul>
      <TodoRow {...props} />
    </ul>,
  );
  const body = screen.getByRole("button", {
    name: "Water the plants",
    hidden: true,
  });
  return { props, body };
}

describe("TodoRow", () => {
  afterEach(() => vi.useRealTimers());

  it("shows the title and meta line, overdue in red, and no other controls", () => {
    setup();
    expect(screen.getByText("3 days overdue")).toHaveClass("text-n-overdue");
    // Just the checkbox and the row body: no handles, chevrons or toolbars.
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("shows the notes' length after their glyph", () => {
    setup();
    const notes = screen.getByText("2 words");
    expect(notes).not.toHaveAttribute("data-meta-chip");
    expect(notes.querySelector("svg")).toHaveClass("lucide-file-text");
    expect(
      screen.getByRole("button", { hidden: true, name: "Water the plants" }),
    ).toHaveAttribute("aria-description", "3 days overdue, Notes, 2 words");
  });

  it("overdue stays red text, not a chip", () => {
    setup();
    const overdue = screen.getByText("3 days overdue");
    expect(overdue).not.toHaveAttribute("data-meta-chip");
    expect(overdue).not.toHaveClass("bg-n-brand", "bg-n-fill");
  });

  it("due today is the row's one yellow chip, keeping the word Today", () => {
    setup({ todo: makeTodo({ dueDate: dueIn(0) }) });
    const today = screen.getByText("Today");
    expect(today).toHaveAttribute("data-meta-chip", "brand");
    expect(today).toHaveClass(
      "bg-n-brand",
      "text-n-brand-ink",
      "rounded-n-chip",
      "h-5",
      "text-n-phone-meta-chip",
    );
  });

  it.each([
    ["Tomorrow", { dueDate: dueIn(1) }],
    ["Pinned", { pinned: true }],
    ["Weekly", { dueDate: dueIn(3), recurrence: { frequency: "weekly" } }],
  ] as const)("%s is a grey chip", (text, todo) => {
    setup({ todo: makeTodo(todo) });
    const chip = screen.getByText(text).closest("span[data-meta-chip]");
    expect(chip).toHaveAttribute("data-meta-chip", "fill");
    expect(chip).toHaveClass("bg-n-fill", "text-n-ink");
    expect(chip).not.toHaveClass("bg-n-brand");
  });

  it("subtasks, notes and links stay plain text", () => {
    expect(metaChip({ kind: "subtasks", text: "1/3" })).toBeNull();
    expect(metaChip({ kind: "notes", text: "2 words" })).toBeNull();
    expect(
      metaChip({ kind: "link", text: "a.com", href: "https://a.com", more: 0 }),
    ).toBeNull();
    expect(
      metaChip({ kind: "due", text: "Oct 30", overdue: false, today: false }),
    ).toBe("fill");
  });

  it("a lifted row tilts by its drag's angle", () => {
    setup({ lifted: true, tilt: -1.2 });
    const card = document.querySelector<HTMLElement>("[data-row-card]");
    expect(card).toHaveClass("n-lifted");
    expect(card?.style.getPropertyValue("--n-drag-tilt")).toBe("-1.2deg");
  });

  it("on wide, hovers with 60% fill; a selected row is the full fill", () => {
    const { body } = setup({ density: "wide" });
    const container = body.closest("[data-row-container]");
    expect(container).toHaveClass("pointer-fine:hover:bg-n-fill/60");
    expect(container).not.toHaveClass("bg-n-fill");
  });

  it("on wide, a selected row drops the hover for the full fill", () => {
    const { body } = setup({ density: "wide", selected: true });
    const container = body.closest("[data-row-container]");
    expect(container).toHaveClass("bg-n-fill");
    expect(container).not.toHaveClass("pointer-fine:hover:bg-n-fill/60");
  });

  it("tapping the checkbox marks done; tapping the row opens it", () => {
    const { props, body } = setup();
    fireEvent.click(
      screen.getByRole("button", { name: "Mark “Water the plants” done" }),
    );
    expect(props.onCheck).toHaveBeenCalledWith(props.todo);
    fireEvent.click(body);
    expect(props.onOpen).toHaveBeenCalledWith(props.todo);
  });

  it("a checked row reads as pressed and struck through", () => {
    setup({ checked: true });
    expect(
      screen.getByRole("button", { name: "Mark “Water the plants” done" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Water the plants")).toHaveClass("line-through");
  });

  it("long-press opens the menu and swallows the click that follows", () => {
    vi.useFakeTimers();
    const { props, body } = setup();
    fireEvent.pointerDown(body, {
      button: 0,
      pointerType: "touch",
      clientX: 10,
      clientY: 10,
    });
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(props.onMenu).toHaveBeenCalledWith(props.todo);
    fireEvent.pointerUp(body);
    fireEvent.click(body);
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it("a mouse press never long-presses: it drags, and right-clicks for the menu", () => {
    vi.useFakeTimers();
    const { props, body } = setup();
    fireEvent.pointerDown(body, { button: 0, pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS * 2));
    expect(props.onMenu).not.toHaveBeenCalled();
    fireEvent.pointerUp(body);
    fireEvent.click(body);
    expect(props.onOpen).toHaveBeenCalledWith(props.todo);
  });

  it("a lifted row is raised like the menu's preview, not faded", () => {
    setup({ lifted: true });
    const li = document.querySelector("[data-phone-row]");
    expect(li).toHaveAttribute("data-lifted");
    expect(li).toHaveClass("z-10");
    expect(li).not.toHaveClass("opacity-35");
    expect(li?.firstElementChild).toHaveClass(
      "bg-n-canvas",
      "rounded-[0.875rem]",
    );
  });

  it("moving during the press cancels it (it's a scroll or a swipe)", () => {
    vi.useFakeTimers();
    const { props, body } = setup();
    fireEvent.pointerDown(body, {
      button: 0,
      pointerType: "touch",
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(body, { clientX: 40, clientY: 12 });
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS * 2));
    expect(props.onMenu).not.toHaveBeenCalled();
  });

  it("right-click, the context-menu key and Shift+F10 open the menu", () => {
    const { props, body } = setup();
    fireEvent.contextMenu(body);
    fireEvent.keyDown(body, { key: "ContextMenu" });
    fireEvent.keyDown(body, { key: "F10", shiftKey: true });
    expect(props.onMenu).toHaveBeenCalledTimes(3);
  });

  it("hides from assistive tech while collapsing out", () => {
    setup({ collapsing: true });
    expect(document.querySelector("[data-phone-row]")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
