import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/lib/toast";
import { Toaster } from "../Toast";

afterEach(() => {
  act(() => toast.dismiss());
});

/** The pill: the toast's root, the element carrying its fill. */
function pill(inside: HTMLElement): HTMLElement {
  const root = inside.closest<HTMLElement>(".rounded-\\[0\\.875rem\\]");
  if (!root) throw new Error("no toast pill around the element");
  return root;
}

describe("Toast", () => {
  it("is a yellow pill with its Undo as a brandInk outline button", async () => {
    const undo = vi.fn();
    render(<Toaster />);
    act(() => {
      toast.success("Moved to this week", {
        actionProps: { children: "Undo", onClick: undo },
      });
    });
    const action = await screen.findByRole("button", { name: "Undo" });
    expect(pill(action)).toHaveClass("bg-n-brand", "text-n-brand-ink");
    expect(pill(action)).not.toHaveClass("bg-n-ink", "text-n-canvas");
    // An outline in the pill's dark ink, never a fill: yellow is the pill's.
    expect(action).toHaveClass(
      "border",
      "border-n-brand-ink",
      "text-n-brand-ink",
      "font-bold",
      "h-9",
      "px-3.5",
      "rounded-[0.6875rem]",
    );
    expect(action.className).not.toMatch(/\bbg-/);
    expect(pill(action).querySelector("svg.lucide-circle-alert")).toBeNull();
    await userEvent.click(action);
    expect(undo).toHaveBeenCalledOnce();
  });

  it("gives info toasts the same yellow pill", async () => {
    render(<Toaster />);
    act(() => {
      toast.info("Added to someday");
    });
    const title = await screen.findByText("Added to someday");
    expect(pill(title)).toHaveClass("bg-n-brand", "text-n-brand-ink");
  });

  it("is a red pill with the alert icon and a white outline action on error", async () => {
    render(<Toaster />);
    act(() => {
      toast.error("Couldn’t rename the list", {
        actionProps: { children: "Retry" },
      });
    });
    // Base UI hides a high-priority toast's pill from the accessibility
    // tree and announces it through its own live region instead.
    const action = await screen.findByRole("button", {
      name: "Retry",
      hidden: true,
    });
    const root = pill(action);
    expect(root).toHaveClass(
      "bg-n-destructive-solid",
      "text-n-destructive-solid-ink",
    );
    expect(root).not.toHaveClass("bg-n-brand", "bg-n-ink");
    expect(root.querySelector("svg.lucide-circle-alert")).not.toBeNull();
    expect(action).toHaveClass(
      "border",
      "border-n-destructive-solid-ink",
      "text-n-destructive-solid-ink",
    );
    expect(action.className).not.toMatch(/\bbg-/);
  });

  it("rings the action and × in the toast's ink, not brand", async () => {
    render(<Toaster />);
    act(() => {
      toast.success("Done", { actionProps: { children: "Undo" } });
    });
    const action = await screen.findByRole("button", { name: "Undo" });
    // Base UI hides the × from assistive tech (Escape and swipe dismiss).
    const close = pill(action).querySelector<HTMLElement>(
      'button[aria-label="Dismiss"]',
    );
    if (!close) throw new Error("no ×");
    for (const control of [action, close]) {
      expect(control).toHaveClass("n-focus-toast");
      expect(control).not.toHaveClass("n-focus");
    }
  });
});
