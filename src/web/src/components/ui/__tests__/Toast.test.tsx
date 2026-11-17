import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/lib/toast";
import { Toaster } from "../Toast";

afterEach(() => {
  act(() => toast.dismiss());
});

describe("Toast", () => {
  it("shows its Undo as a brand-filled button on the dark pill", async () => {
    const undo = vi.fn();
    render(<Toaster />);
    act(() => {
      toast.success("Moved to this week", {
        actionProps: { children: "Undo", onClick: undo },
      });
    });
    const action = await screen.findByRole("button", { name: "Undo" });
    expect(action).toHaveClass(
      "bg-n-brand",
      "text-n-brand-ink",
      "font-bold",
      "h-9",
      "px-3.5",
      "rounded-[0.6875rem]",
    );
    // Yellow is a fill with dark ink, never an outline in the text's colour.
    expect(action).not.toHaveClass("border", "border-current");
    // The pill itself is unchanged.
    expect(action.closest(".bg-n-ink")).toHaveClass("text-n-canvas");
    await userEvent.click(action);
    expect(undo).toHaveBeenCalledOnce();
  });
});
