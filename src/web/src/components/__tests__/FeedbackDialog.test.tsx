import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

let isAdmin: boolean | undefined = true;
const mutate = vi.fn();

vi.mock("@/hooks/useUser", () => ({
  useUser: () => ({ data: { isAdmin } }),
}));
vi.mock("@/hooks/useFeedback", () => ({
  useSendFeedback: () => ({ mutate, isPending: false }),
}));
vi.mock("@/lib/feedback", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/feedback")>()),
  // jsdom has no createImageBitmap or canvas encoding.
  prepareImage: vi.fn(async () => ({ contentType: "image/png", data: "AAAA" })),
}));
vi.mock("@/lib/toast", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/toast")>()),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}));

import { toast } from "@/lib/toast";
import { FeedbackDialog } from "../FeedbackDialog";

const onClose = vi.fn();
const renderDialog = () =>
  render(<FeedbackDialog open onClose={onClose} variant="centered" />);

describe("FeedbackDialog", () => {
  beforeEach(() => {
    isAdmin = true;
    mutate.mockReset();
    onClose.mockReset();
    vi.mocked(toast.success).mockClear();
    URL.createObjectURL = vi.fn(() => "blob:preview");
    URL.revokeObjectURL = vi.fn();
  });

  it("renders nothing for an account that isn't an admin", () => {
    isAdmin = false;
    renderDialog();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("can't send until there's a description", async () => {
    renderDialog();
    const send = await screen.findByRole("button", { name: "Send" });
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText("What’s wrong?"), "Hi");
    expect(send).toBeEnabled();
  });

  it("sends the description, images and context, then toasts the issue", async () => {
    mutate.mockImplementation((_body, { onSuccess }) =>
      onSuccess({
        issueNumber: 7,
        issueUrl: "https://github.com/x/y/issues/7",
      }),
    );
    renderDialog();
    await userEvent.type(
      await screen.findByPlaceholderText("What’s wrong?"),
      "  Tick jumps  ",
    );
    const file = new File(["png"], "shot.png", { type: "image/png" });
    await userEvent.upload(screen.getByTestId("feedback-file"), file);
    expect(await screen.findByAltText("Screenshot 1")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    const [body] = mutate.mock.calls[0];
    expect(body.description).toBe("Tick jumps");
    expect(body.images).toEqual([{ contentType: "image/png", data: "AAAA" }]);
    expect(body.context.platform).toBe("web");
    expect(onClose).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(
      "Filed #7",
      expect.objectContaining({ actionProps: expect.any(Object) }),
    );
  });

  it("takes an image pasted anywhere while open", async () => {
    renderDialog();
    await screen.findByRole("dialog");
    const file = new File(["png"], "paste.png", { type: "image/png" });
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { files: [file] },
    });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() =>
      expect(screen.getByAltText("Screenshot 1")).toBeInTheDocument(),
    );
  });

  it("removes a screenshot", async () => {
    renderDialog();
    const file = new File(["png"], "shot.png", { type: "image/png" });
    await userEvent.upload(await screen.findByTestId("feedback-file"), file);
    await userEvent.click(
      await screen.findByRole("button", { name: "Remove screenshot 1" }),
    );
    expect(screen.queryByAltText("Screenshot 1")).toBeNull();
  });
});
