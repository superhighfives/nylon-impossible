import { Checkbox } from "@cloudflare/kumo";
import type { ExtractedTodo } from "@/lib/ai-types";

interface TodoPreviewProps {
  todos: ExtractedTodo[];
  onTodosChange: (todos: ExtractedTodo[]) => void;
  onConfirm: () => void;
  onCancel: () => void;
  isCreating: boolean;
}

export function TodoPreview({
  todos,
  onTodosChange,
  onConfirm,
  onCancel,
  isCreating,
}: TodoPreviewProps) {
  const selectedCount = todos.filter((t) => t.selected).length;

  const handleToggleSelect = (tempId: string) => {
    onTodosChange(
      todos.map((todo) =>
        todo.tempId === tempId ? { ...todo, selected: !todo.selected } : todo,
      ),
    );
  };

  const handleTitleChange = (tempId: string, title: string) => {
    onTodosChange(
      todos.map((todo) => (todo.tempId === tempId ? { ...todo, title } : todo)),
    );
  };

  const handleDueDateChange = (tempId: string, dueDate: string | null) => {
    onTodosChange(
      todos.map((todo) =>
        todo.tempId === tempId ? { ...todo, dueDate } : todo,
      ),
    );
  };

  const handleRemove = (tempId: string) => {
    onTodosChange(todos.filter((todo) => todo.tempId !== tempId));
  };

  const handleSelectAll = () => {
    const allSelected = todos.every((t) => t.selected);
    onTodosChange(todos.map((todo) => ({ ...todo, selected: !allSelected })));
  };

  if (todos.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-muted">No todos extracted.</p>
        <button
          type="button"
          onClick={onCancel}
          className="mt-2 text-xs text-muted hover:text-surface"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">
          {todos.length} extracted
        </span>
        <button
          type="button"
          onClick={handleSelectAll}
          className="text-muted hover:text-surface"
        >
          {todos.every((t) => t.selected) ? "Deselect all" : "Select all"}
        </button>
      </div>

      <div className="divide-y divide-color">
        {todos.map((todo) => (
          <div
            key={todo.tempId}
            className={`py-3 ${!todo.selected ? "opacity-40" : ""}`}
          >
            <div className="flex items-start gap-3">
              <div className="pt-0.5">
                <Checkbox
                  checked={todo.selected}
                  onChange={() => handleToggleSelect(todo.tempId)}
                />
              </div>
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={todo.title}
                  onChange={(e) => handleTitleChange(todo.tempId, e.target.value)}
                  disabled={!todo.selected}
                  className="w-full bg-transparent text-surface text-sm border-b border-color pb-1 focus:outline-none focus:border-surface disabled:text-muted"
                  aria-label="Todo title"
                />
                <div className="flex items-center gap-3">
                  <input
                    type="date"
                    value={todo.dueDate || ""}
                    onChange={(e) =>
                      handleDueDateChange(todo.tempId, e.target.value || null)
                    }
                    disabled={!todo.selected}
                    className="bg-transparent text-muted text-xs focus:outline-none disabled:opacity-50"
                    aria-label="Due date"
                  />
                  {todo.dueDate && todo.selected && (
                    <button
                      type="button"
                      onClick={() => handleDueDateChange(todo.tempId, null)}
                      className="text-xs text-muted hover:text-surface"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(todo.tempId)}
                className="text-xs text-muted hover:text-error"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2 text-xs">
        <button
          type="button"
          onClick={onCancel}
          disabled={isCreating}
          className="text-muted hover:text-surface disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={selectedCount === 0 || isCreating}
          className="text-surface font-medium disabled:text-muted disabled:cursor-not-allowed"
        >
          {isCreating ? "Adding..." : `Add ${selectedCount}`}
        </button>
      </div>
    </div>
  );
}
