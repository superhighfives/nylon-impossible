import { Button, Checkbox, Input } from "@cloudflare/kumo";
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
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={onCancel}
          className="mt-2"
        >
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">
          {todos.length} extracted
        </span>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={handleSelectAll}
        >
          {todos.every((t) => t.selected) ? "Deselect all" : "Select all"}
        </Button>
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
                <Input
                  type="text"
                  value={todo.title}
                  onChange={(e) => handleTitleChange(todo.tempId, e.target.value)}
                  disabled={!todo.selected}
                  className="w-full"
                  aria-label="Todo title"
                  size="sm"
                />
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={todo.dueDate || ""}
                    onChange={(e) =>
                      handleDueDateChange(todo.tempId, e.target.value || null)
                    }
                    disabled={!todo.selected}
                    aria-label="Due date"
                    size="sm"
                  />
                  {todo.dueDate && todo.selected && (
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => handleDueDateChange(todo.tempId, null)}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
              <Button
                variant="secondary-destructive"
                size="sm"
                type="button"
                onClick={() => handleRemove(todo.tempId)}
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={onCancel}
          disabled={isCreating}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          type="button"
          onClick={onConfirm}
          disabled={selectedCount === 0 || isCreating}
          loading={isCreating}
        >
          {`Add ${selectedCount}`}
        </Button>
      </div>
    </div>
  );
}
