import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SerializedTodoMessage, TodoWithUrls } from "@/types/database";
import { ConversationSection } from "../ConversationSection";

vi.mock("@/hooks/useTodos", () => ({
  useReplyToTodo: vi.fn(),
  useDismissTodoQuestion: vi.fn(),
}));

import { useDismissTodoQuestion, useReplyToTodo } from "@/hooks/useTodos";

function makeMessage(
  overrides?: Partial<SerializedTodoMessage>,
): SerializedTodoMessage {
  return {
    id: "m1",
    todoId: "t1",
    role: "assistant",
    content: "Where to, and when?",
    createdAt: "2026-01-01T00:00:00.000Z",
    awaitingReply: true,
    ...overrides,
  };
}

function makeTodo(overrides?: Partial<TodoWithUrls>): TodoWithUrls {
  return {
    id: "t1",
    userId: "u1",
    title: "Book a flight",
    notes: null,
    completed: false,
    position: "a0",
    dueDate: null,
    priority: null,
    recurrence: null,
    aiStatus: null,
    needsInput: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    research: null,
    messages: [],
    urls: [],
    ...overrides,
  };
}

describe("ConversationSection", () => {
  const reply = { mutate: vi.fn(), isPending: false };
  const dismiss = { mutate: vi.fn(), isPending: false };

  beforeEach(() => {
    reply.mutate.mockClear();
    dismiss.mutate.mockClear();
    vi.mocked(useReplyToTodo).mockReturnValue(
      reply as unknown as ReturnType<typeof useReplyToTodo>,
    );
    vi.mocked(useDismissTodoQuestion).mockReturnValue(
      dismiss as unknown as ReturnType<typeof useDismissTodoQuestion>,
    );
  });

  it("renders nothing when there are no messages", () => {
    const { container } = render(
      <ConversationSection todo={makeTodo({ messages: [] })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders messages in chronological order", () => {
    const todo = makeTodo({
      messages: [
        makeMessage({ id: "m1", content: "first", awaitingReply: false }),
        makeMessage({
          id: "m2",
          role: "user",
          content: "second",
          createdAt: "2026-01-02T00:00:00.000Z",
          awaitingReply: false,
        }),
      ],
    });
    render(<ConversationSection todo={todo} />);
    const first = screen.getByText("first");
    const second = screen.getByText("second");
    expect(first).toBeInTheDocument();
    expect(second).toBeInTheDocument();
    // first appears before second in document order
    expect(
      first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows the reply form only when needsInput is true", () => {
    const { rerender } = render(
      <ConversationSection
        todo={makeTodo({ needsInput: false, messages: [makeMessage()] })}
      />,
    );
    expect(screen.queryByPlaceholderText("Reply...")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Dismiss" }),
    ).not.toBeInTheDocument();

    rerender(
      <ConversationSection
        todo={makeTodo({ needsInput: true, messages: [makeMessage()] })}
      />,
    );
    expect(screen.getByPlaceholderText("Reply...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("submits a trimmed reply via useReplyToTodo", () => {
    const todo = makeTodo({ needsInput: true, messages: [makeMessage()] });
    render(<ConversationSection todo={todo} />);

    fireEvent.change(screen.getByPlaceholderText("Reply..."), {
      target: { value: "  Lisbon next Friday  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(reply.mutate).toHaveBeenCalledWith({
      todoId: "t1",
      content: "Lisbon next Friday",
    });
  });

  it("dismisses the question via useDismissTodoQuestion", () => {
    const todo = makeTodo({ needsInput: true, messages: [makeMessage()] });
    render(<ConversationSection todo={todo} />);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(dismiss.mutate).toHaveBeenCalledWith({ todoId: "t1" });
  });
});
