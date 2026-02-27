import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TodoPreview } from "../TodoPreview";

// Mock Kumo components to basic HTML
vi.mock("@cloudflare/kumo", () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
  Checkbox: ({ checked, onChange, ...props }: any) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      {...props}
    />
  ),
  Input: ({ ...props }: any) => <input {...props} />,
}));

function makeTodo(overrides: Partial<any> = {}) {
  return {
    tempId: crypto.randomUUID(),
    title: "Test todo",
    selected: true,
    dueDate: null,
    ...overrides,
  };
}

describe("TodoPreview", () => {
  const defaultProps = {
    onTodosChange: vi.fn(),
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    isCreating: false,
  };

  it("renders empty state when no todos", () => {
    render(<TodoPreview {...defaultProps} todos={[]} />);
    expect(screen.getByText("No todos extracted.")).toBeInTheDocument();
    expect(screen.getByText("Try again")).toBeInTheDocument();
  });

  it("calls onCancel when 'Try again' is clicked in empty state", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<TodoPreview {...defaultProps} todos={[]} onCancel={onCancel} />);

    await user.click(screen.getByText("Try again"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("renders todo items with titles", () => {
    const todos = [
      makeTodo({ title: "Buy milk" }),
      makeTodo({ title: "Walk dog" }),
    ];
    render(<TodoPreview {...defaultProps} todos={todos} />);

    expect(screen.getByDisplayValue("Buy milk")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Walk dog")).toBeInTheDocument();
  });

  it("shows extracted count", () => {
    const todos = [makeTodo(), makeTodo(), makeTodo()];
    render(<TodoPreview {...defaultProps} todos={todos} />);
    expect(screen.getByText("3 extracted")).toBeInTheDocument();
  });

  it("shows selected count in confirm button", () => {
    const todos = [
      makeTodo({ selected: true }),
      makeTodo({ selected: true }),
      makeTodo({ selected: false }),
    ];
    render(<TodoPreview {...defaultProps} todos={todos} />);
    expect(screen.getByText("Add 2")).toBeInTheDocument();
  });

  it("calls onTodosChange with toggled selection when checkbox clicked", async () => {
    const user = userEvent.setup();
    const onTodosChange = vi.fn();
    const todo = makeTodo({ selected: true });
    render(
      <TodoPreview
        {...defaultProps}
        todos={[todo]}
        onTodosChange={onTodosChange}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);

    expect(onTodosChange).toHaveBeenCalledWith([
      expect.objectContaining({ selected: false }),
    ]);
  });

  it("calls onTodosChange when Remove is clicked", async () => {
    const user = userEvent.setup();
    const onTodosChange = vi.fn();
    const todos = [makeTodo({ title: "Remove me" }), makeTodo({ title: "Keep me" })];
    render(
      <TodoPreview
        {...defaultProps}
        todos={todos}
        onTodosChange={onTodosChange}
      />,
    );

    const removeButtons = screen.getAllByText("Remove");
    await user.click(removeButtons[0]);

    expect(onTodosChange).toHaveBeenCalledWith([
      expect.objectContaining({ title: "Keep me" }),
    ]);
  });

  it("disables confirm button when no todos selected", () => {
    const todos = [makeTodo({ selected: false })];
    render(<TodoPreview {...defaultProps} todos={todos} />);
    expect(screen.getByText("Add 0")).toBeDisabled();
  });

  it("disables confirm button when isCreating is true", () => {
    const todos = [makeTodo({ selected: true })];
    render(<TodoPreview {...defaultProps} todos={todos} isCreating={true} />);
    expect(screen.getByText("Add 1")).toBeDisabled();
  });

  it("calls onConfirm when confirm button is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const todos = [makeTodo({ selected: true })];
    render(
      <TodoPreview {...defaultProps} todos={todos} onConfirm={onConfirm} />,
    );

    await user.click(screen.getByText("Add 1"));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("toggles select all / deselect all", async () => {
    const user = userEvent.setup();
    const onTodosChange = vi.fn();
    const todos = [makeTodo({ selected: true }), makeTodo({ selected: true })];
    render(
      <TodoPreview
        {...defaultProps}
        todos={todos}
        onTodosChange={onTodosChange}
      />,
    );

    // All selected -> clicking should deselect all
    await user.click(screen.getByText("Deselect all"));
    expect(onTodosChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ selected: false }),
        expect.objectContaining({ selected: false }),
      ]),
    );
  });
});
