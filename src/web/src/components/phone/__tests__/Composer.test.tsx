import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mutateAsync = vi.fn();
vi.mock("@/hooks/useTodos", () => ({
  useSmartCreate: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("@/hooks/useLists", () => ({
  useDeleteList: () => ({ mutate: vi.fn() }),
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
import { Composer } from "../Composer";
import { dueIn, NOW, TZ } from "./fixtures";

const TARGETS = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "someday", label: "Someday" },
  { id: "groceries", label: "Groceries" },
];

function setup(currentListId = "today") {
  const onView = vi.fn();
  render(
    <Composer
      currentListId={currentListId}
      targets={TARGETS}
      timeZone={TZ}
      onView={onView}
    />,
  );
  return { field: screen.getByLabelText("New todo"), onView };
}

describe("Composer", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    mutateAsync.mockReset().mockResolvedValue({ todos: [] });
    vi.mocked(toast.success).mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("aims at the list on screen", () => {
    const { field } = setup("week");
    expect(field).toHaveAttribute("placeholder", "Add to This week…");
  });

  it("shows the list chips only while focused or drafting", async () => {
    const { field } = setup();
    expect(screen.queryByRole("group", { name: "Add to list" })).toBeNull();
    fireEvent.focus(field);
    const chips = screen.getByRole("group", { name: "Add to list" });
    expect(chips).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps quick add's chips in one scrolling row, the chosen one in view", async () => {
    const scrolled: string[] = [];
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = function () {
      scrolled.push(this.textContent ?? "");
    };
    try {
      const user = userEvent.setup();
      render(
        <Composer
          variant="popover"
          currentListId="today"
          targets={TARGETS}
          timeZone={TZ}
          onView={vi.fn()}
          countFor={() => 0}
        />,
      );
      const row = document.querySelector("[data-composer-chips]");
      // One row that scrolls sideways, however many lists there are.
      expect(row?.className).toContain("overflow-x-auto");
      expect(row?.className).not.toContain("flex-wrap");
      expect(scrolled.at(-1)).toBe("Today");
      await user.click(screen.getByRole("button", { name: "Groceries" }));
      expect(scrolled.at(-1)).toBe("Groceries");
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  });

  it("picking a chip retargets the placeholder and the create", async () => {
    const user = userEvent.setup();
    const { field } = setup();
    await user.click(field);
    await user.click(screen.getByRole("button", { name: "Groceries" }));
    expect(field).toHaveAttribute("placeholder", "Add to Groceries…");
    await user.type(field, "Oat milk{Enter}");
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        text: "Oat milk",
        listId: "groceries",
        parseDate: false,
        dueDate: null,
      }),
    );
    // Added somewhere off-screen → "Added to Groceries · View".
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Added to Groceries",
        expect.anything(),
      ),
    );
  });

  it("shows Due Fri for typed dates and strips the words on Enter", async () => {
    const user = userEvent.setup();
    const { field } = setup();
    await user.type(field, "Send invoice friday");
    expect(screen.getByText("Due Fri")).toBeInTheDocument();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const call = mutateAsync.mock.calls[0][0];
    expect(call.text).toBe("Send invoice");
    expect(call.dueDate.toISOString()).toBe(dueIn(5));
    // Enter clears and keeps focus for the next one.
    expect(field).toHaveValue("");
    expect(field).toHaveFocus();
  });

  it("× keeps the words as typed", async () => {
    const user = userEvent.setup();
    const { field } = setup();
    await user.type(field, "Call about friday");
    await user.click(
      screen.getByRole("button", { name: "Don’t treat as a date" }),
    );
    expect(screen.queryByText("Due Fri")).toBeNull();
    await user.type(field, "{Enter}");
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ text: "Call about friday", dueDate: null }),
      ),
    );
  });

  it("Shift-Enter makes a newline instead of adding", async () => {
    const user = userEvent.setup();
    const { field } = setup();
    await user.type(field, "Milk{Shift>}{Enter}{/Shift}Eggs");
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(field).toHaveValue("Milk\nEggs");
  });

  it("adds one todo per line, keeping the pasted order", async () => {
    const user = userEvent.setup();
    const { field } = setup();
    await user.click(field);
    await user.paste("Milk\nEggs\nBread");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(3));
    // Smart-create prepends, so lines are sent bottom-up.
    expect(mutateAsync.mock.calls.map((c) => c[0].text)).toEqual([
      "Bread",
      "Eggs",
      "Milk",
    ]);
  });

  it("hands the text back if the create fails", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    const { field } = setup();
    await user.type(field, "Renew passport{Enter}");
    await waitFor(() => expect(field).toHaveValue("Renew passport"));
    expect(toast.error).toHaveBeenCalledWith("offline");
  });

  it("hands back only the lines that failed from a pasted list", async () => {
    mutateAsync.mockImplementation(async ({ text }: { text: string }) => {
      if (text === "Eggs") throw new Error("offline");
      return { todos: [] };
    });
    const user = userEvent.setup();
    const { field } = setup();
    await user.click(field);
    await user.paste("Milk\nEggs tomorrow\nBread");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(field).toHaveValue("Eggs tomorrow"));
    expect(mutateAsync).toHaveBeenCalledTimes(3);
    expect(toast.error).toHaveBeenCalledWith("2 todos added. offline");
  });

  it("notes when long text will spill into notes", async () => {
    setup();
    fireEvent.change(screen.getByLabelText("New todo"), {
      target: { value: "x".repeat(600) },
    });
    expect(
      screen.getByText("The rest will be saved to notes."),
    ).toBeInTheDocument();
  });
});
