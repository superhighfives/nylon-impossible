import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LONG_PRESS_MS, TodoRow, type TodoRowProps } from "../TodoRow";
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
    fireEvent.pointerDown(body, { button: 0, clientX: 10, clientY: 10 });
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(props.onMenu).toHaveBeenCalledWith(props.todo);
    fireEvent.pointerUp(body);
    fireEvent.click(body);
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it("moving during the press cancels it (it's a scroll or a swipe)", () => {
    vi.useFakeTimers();
    const { props, body } = setup();
    fireEvent.pointerDown(body, { button: 0, clientX: 10, clientY: 10 });
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
