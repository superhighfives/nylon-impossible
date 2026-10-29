import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { splitLists } from "../model";
import { makeList, makeTodo } from "./fixtures";

const lists = [
  makeList("list-today", "Today", "today"),
  makeList("list-week", "This week", "thisWeek"),
  makeList("list-someday", "Someday", "someday"),
  makeList("list-groceries", "Groceries", null),
];
const todos = [
  makeTodo({ id: "open", title: "Water the plants" }),
  makeTodo({
    id: "finished",
    title: "Email the landlord",
    completed: true,
    completedAt: new Date().toISOString(),
  }),
];
const { byKind, collections } = splitLists(lists);

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
  useHints: () => ({ reducedMotion: "reduce", timeZone: "UTC" }),
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
  ContextMenu: () => null,
  moveMenuFocus: vi.fn(),
}));
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
