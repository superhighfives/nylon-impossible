import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SerializedTodoSuggestion, TodoWithUrls } from "@/types/database";
import { SuggestionsSection } from "../SuggestionsSection";

vi.mock("@/hooks/useTodos", () => ({
  useAcceptSuggestion: vi.fn(),
  useDismissSuggestion: vi.fn(),
}));

import { useAcceptSuggestion, useDismissSuggestion } from "@/hooks/useTodos";

function makeSuggestion(
  overrides?: Partial<SerializedTodoSuggestion>,
): SerializedTodoSuggestion {
  return {
    id: "s1",
    todoId: "t1",
    type: "title",
    payload: { title: "Book DMV appointment" },
    label: 'Rename to "Book DMV appointment"',
    status: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeTodo(overrides?: Partial<TodoWithUrls>): TodoWithUrls {
  return {
    id: "t1",
    userId: "u1",
    parentId: null,
    title: "Book DMV appointment https://dmv.ca.gov",
    notes: null,
    completed: false,
    completedAt: null,
    position: "a0",
    dueDate: null,
    recurrence: null,
    aiStatus: null,
    needsInput: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    research: null,
    messages: [],
    urls: [],
    suggestions: [],
    ...overrides,
  };
}

describe("SuggestionsSection", () => {
  const accept = { mutate: vi.fn(), isPending: false };
  const dismiss = { mutate: vi.fn(), isPending: false };

  beforeEach(() => {
    accept.mutate.mockClear();
    dismiss.mutate.mockClear();
    vi.mocked(useAcceptSuggestion).mockReturnValue(
      accept as unknown as ReturnType<typeof useAcceptSuggestion>,
    );
    vi.mocked(useDismissSuggestion).mockReturnValue(
      dismiss as unknown as ReturnType<typeof useDismissSuggestion>,
    );
  });

  it("renders nothing when there are no pending suggestions", () => {
    const { container } = render(
      <SuggestionsSection todo={makeTodo({ suggestions: [] })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when all suggestions are already resolved", () => {
    const { container } = render(
      <SuggestionsSection
        todo={makeTodo({
          suggestions: [
            makeSuggestion({ id: "s1", status: "accepted" }),
            makeSuggestion({ id: "s2", status: "dismissed" }),
          ],
        })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders each pending suggestion's label", () => {
    const todo = makeTodo({
      suggestions: [
        makeSuggestion({ id: "s1", label: 'Rename to "Book DMV"' }),
        makeSuggestion({
          id: "s2",
          type: "due_date",
          label: "Set due date to Fri 25 Jul",
        }),
      ],
    });
    render(<SuggestionsSection todo={todo} />);
    expect(screen.getByText('Rename to "Book DMV"')).toBeInTheDocument();
    expect(screen.getByText("Set due date to Fri 25 Jul")).toBeInTheDocument();
  });

  it("only shows Accept all when more than one suggestion is pending", () => {
    const { rerender } = render(
      <SuggestionsSection
        todo={makeTodo({ suggestions: [makeSuggestion({ id: "s1" })] })}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Accept all" }),
    ).not.toBeInTheDocument();

    rerender(
      <SuggestionsSection
        todo={makeTodo({
          suggestions: [
            makeSuggestion({ id: "s1" }),
            makeSuggestion({ id: "s2" }),
          ],
        })}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Accept all" }),
    ).toBeInTheDocument();
  });

  it("accepts a single suggestion via useAcceptSuggestion", () => {
    const todo = makeTodo({ suggestions: [makeSuggestion({ id: "s1" })] });
    render(<SuggestionsSection todo={todo} />);

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(accept.mutate).toHaveBeenCalledWith({
      todoId: "t1",
      suggestionId: "s1",
    });
  });

  it("dismisses a single suggestion via useDismissSuggestion", () => {
    const todo = makeTodo({ suggestions: [makeSuggestion({ id: "s1" })] });
    render(<SuggestionsSection todo={todo} />);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(dismiss.mutate).toHaveBeenCalledWith({
      todoId: "t1",
      suggestionId: "s1",
    });
  });

  it("accepts every pending suggestion when Accept all is clicked", () => {
    const todo = makeTodo({
      suggestions: [makeSuggestion({ id: "s1" }), makeSuggestion({ id: "s2" })],
    });
    render(<SuggestionsSection todo={todo} />);

    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    expect(accept.mutate).toHaveBeenCalledTimes(2);
    expect(accept.mutate).toHaveBeenCalledWith({
      todoId: "t1",
      suggestionId: "s1",
    });
    expect(accept.mutate).toHaveBeenCalledWith({
      todoId: "t1",
      suggestionId: "s2",
    });
  });
});
