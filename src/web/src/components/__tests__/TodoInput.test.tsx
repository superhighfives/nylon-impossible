import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TodoInput } from "../TodoInput";

vi.mock("@/hooks/useTodos", () => ({
  useSmartCreate: vi.fn(),
}));

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
  messageFromError: (err: unknown, fallback: string) =>
    err instanceof Error && err.message ? err.message : fallback,
}));

import { useSmartCreate } from "@/hooks/useTodos";
import { toast } from "@/lib/toast";

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

    expect(mutate).toHaveBeenCalledWith("Buy milk", expect.any(Object));
  });

  it("submits on Enter but not on Shift+Enter", () => {
    const mutate = stubSmartCreate();
    render(<TodoInput />);
    const textarea = screen.getByLabelText("New todo") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Ship it" } });

    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(mutate).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    expect(mutate).toHaveBeenCalledWith("Ship it", expect.any(Object));
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

  it("disables the textarea and shows a loader while pending", () => {
    stubSmartCreate({ isPending: true });
    render(<TodoInput />);
    expect(screen.getByLabelText("New todo")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /add todo/i }),
    ).not.toBeInTheDocument();
  });

  it("does not submit whitespace-only text", () => {
    const mutate = stubSmartCreate();
    render(<TodoInput />);
    const textarea = screen.getByLabelText("New todo") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "   " } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(mutate).not.toHaveBeenCalled();
  });
});
