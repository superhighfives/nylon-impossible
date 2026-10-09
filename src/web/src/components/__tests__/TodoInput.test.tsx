import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TodoInput } from "../TodoInput";

vi.mock("@/hooks/useTodos", () => ({
  useSmartCreate: vi.fn(),
}));

vi.mock("@/hooks/useLists", () => ({
  useLists: vi.fn(() => ({ data: undefined })),
}));

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
  messageFromError: (err: unknown, fallback: string) =>
    err instanceof Error && err.message ? err.message : fallback,
}));

import { useLists } from "@/hooks/useLists";
import { useSmartCreate } from "@/hooks/useTodos";
import { toast } from "@/lib/toast";

const LISTS = [
  { id: "today-id", name: "Today", systemKind: "today" },
  { id: "week-id", name: "This Week", systemKind: "thisWeek" },
  { id: "sometime-id", name: "Sometime", systemKind: "sometime" },
  { id: "completed-id", name: "Completed", systemKind: "completed" },
  { id: "custom-id", name: "Groceries", systemKind: null, position: "a0" },
];

type MutateCallbacks = {
  onSuccess?: (result: { todos: unknown[]; ai: boolean }) => void;
  onError?: (err: unknown) => void;
};

function stubSmartCreate({ isPending = false }: { isPending?: boolean } = {}) {
  const mutate = vi.fn((_text: string, cbs?: MutateCallbacks) => cbs);
  vi.mocked(useSmartCreate).mockReturnValue({
    mutate,
    isPending,
  } as unknown as ReturnType<typeof useSmartCreate>);
  return mutate;
}

describe("TodoInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks resets calls but not a previous mockReturnValue, so
    // explicitly restore the "lists haven't loaded" default each test.
    vi.mocked(useLists).mockReturnValue({
      data: undefined,
    } as unknown as ReturnType<typeof useLists>);
  });

  it("hides the submit button when the input is empty", () => {
    stubSmartCreate();
    render(<TodoInput />);
    expect(screen.queryByRole("button", { name: /add todo/i })).toBeNull();
  });

  it("reveals the submit button once the user types", () => {
    stubSmartCreate();
    render(<TodoInput />);
    fireEvent.change(screen.getByLabelText("New todo"), {
      target: { value: "Buy milk" },
    });
    expect(
      screen.getByRole("button", { name: /add todo/i }),
    ).toBeInTheDocument();
  });

  it("submits the trimmed text via smartCreate", () => {
    const mutate = stubSmartCreate();
    render(<TodoInput />);
    const textarea = screen.getByLabelText("New todo") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "  Buy milk  " } });
    fireEvent.click(screen.getByRole("button", { name: /add todo/i }));

    expect(mutate).toHaveBeenCalledWith(
      { text: "Buy milk" },
      expect.any(Object),
    );
  });

  it("submits on Enter but not on Shift+Enter", () => {
    const mutate = stubSmartCreate();
    render(<TodoInput />);
    const textarea = screen.getByLabelText("New todo") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Ship it" } });

    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(mutate).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    expect(mutate).toHaveBeenCalledWith(
      { text: "Ship it" },
      expect.any(Object),
    );
  });

  it("clears the textarea and toasts success when multiple todos come back", () => {
    const mutate = vi.fn((_text: string, cbs?: MutateCallbacks) => {
      cbs?.onSuccess?.({
        todos: [{ id: "a" } as unknown, { id: "b" } as unknown] as unknown[],
        ai: true,
      });
    });
    vi.mocked(useSmartCreate).mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useSmartCreate>);

    render(<TodoInput />);
    const textarea = screen.getByLabelText("New todo") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Two things at once" } });
    fireEvent.click(screen.getByRole("button", { name: /add todo/i }));

    expect(textarea.value).toBe("");
    expect(toast.success).toHaveBeenCalledWith("Added 2 items");
  });

  it("does not toast success when a single todo is added", () => {
    const mutate = vi.fn((_text: string, cbs?: MutateCallbacks) => {
      cbs?.onSuccess?.({
        todos: [{ id: "a" } as unknown] as unknown[],
        ai: false,
      });
    });
    vi.mocked(useSmartCreate).mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useSmartCreate>);

    render(<TodoInput />);
    fireEvent.change(screen.getByLabelText("New todo"), {
      target: { value: "Just one" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add todo/i }));

    expect(toast.success).not.toHaveBeenCalled();
  });

  it("toasts an error when the mutation fails", () => {
    const mutate = vi.fn((_text: string, cbs?: MutateCallbacks) => {
      cbs?.onError?.(new Error("Network down"));
    });
    vi.mocked(useSmartCreate).mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useSmartCreate>);

    render(<TodoInput />);
    fireEvent.change(screen.getByLabelText("New todo"), {
      target: { value: "broken" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add todo/i }));

    expect(toast.error).toHaveBeenCalledWith("Network down");
  });

  it("keeps the textarea usable while a create is in flight", () => {
    stubSmartCreate({ isPending: true });
    render(<TodoInput />);
    const textarea = screen.getByLabelText("New todo") as HTMLTextAreaElement;
    expect(textarea).not.toBeDisabled();
    // Rapid multi-add: typing during a pending create still offers submit.
    fireEvent.change(textarea, { target: { value: "Next one" } });
    expect(
      screen.getByRole("button", { name: /add todo/i }),
    ).toBeInTheDocument();
  });

  it("clears immediately on submit and restores the text on failure", () => {
    let fail: ((err: unknown) => void) | undefined;
    const mutate = vi.fn((_text: string, cbs?: MutateCallbacks) => {
      fail = cbs?.onError;
    });
    vi.mocked(useSmartCreate).mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useSmartCreate>);

    render(<TodoInput />);
    const textarea = screen.getByLabelText("New todo") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Buy milk" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(textarea.value).toBe("");

    act(() => fail?.(new Error("Network down")));
    expect(textarea.value).toBe("Buy milk");
  });

  it("hints that overflowing text will go to notes", () => {
    stubSmartCreate();
    render(<TodoInput />);
    expect(screen.queryByText(/saved to notes/i)).toBeNull();
    fireEvent.change(screen.getByLabelText("New todo"), {
      target: { value: "a".repeat(501) },
    });
    expect(screen.getByText(/saved to notes/i)).toBeInTheDocument();
  });

  it("does not submit whitespace-only text", () => {
    const mutate = stubSmartCreate();
    render(<TodoInput />);
    const textarea = screen.getByLabelText("New todo") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "   " } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("defaults the list picker to Today and submits with its id", () => {
    vi.mocked(useLists).mockReturnValue({
      data: LISTS,
    } as unknown as ReturnType<typeof useLists>);
    const mutate = stubSmartCreate();
    render(<TodoInput />);

    expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.change(screen.getByLabelText("New todo"), {
      target: { value: "Buy milk" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add todo/i }));

    expect(mutate).toHaveBeenCalledWith(
      { text: "Buy milk", listId: "today-id" },
      expect.any(Object),
    );
  });

  it("submits to the segment the user picks", () => {
    vi.mocked(useLists).mockReturnValue({
      data: LISTS,
    } as unknown as ReturnType<typeof useLists>);
    const mutate = stubSmartCreate();
    render(<TodoInput />);

    fireEvent.click(screen.getByRole("button", { name: "This Week" }));
    expect(screen.getByLabelText("New todo")).toHaveAttribute(
      "placeholder",
      "Add to This Week…",
    );
    fireEvent.change(screen.getByLabelText("New todo"), {
      target: { value: "Plan trip" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add todo/i }));

    expect(mutate).toHaveBeenCalledWith(
      { text: "Plan trip", listId: "week-id" },
      expect.any(Object),
    );
  });

  it("offers system lists as segments, custom lists behind more, never Completed", () => {
    vi.mocked(useLists).mockReturnValue({
      data: LISTS,
    } as unknown as ReturnType<typeof useLists>);
    stubSmartCreate();
    render(<TodoInput />);

    expect(
      screen.getByRole("button", { name: "Sometime" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Completed" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Groceries" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "More lists" }),
    ).toBeInTheDocument();
  });

  it("does not render a list picker while lists haven't loaded", () => {
    stubSmartCreate();
    render(<TodoInput />);
    expect(screen.queryByLabelText("List to add to")).toBeNull();
  });
});
