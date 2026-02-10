import { Button, Checkbox, Input } from "@cloudflare/kumo";
import { Calendar, Sparkles, X } from "lucide-react";
import type { ExtractedTodo } from "@/lib/ai-types";

interface TodoPreviewProps {
  todos: ExtractedTodo[];
  onTodosChange: (todos: ExtractedTodo[]) => void;
  onConfirm: () => void;
  onCancel: () => void;
  isCreating: boolean;
}

/**
 * Preview component for AI-extracted todos
 * Allows users to review, edit, and select which todos to add
 */
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
      <div className="rounded-xl border border-color bg-surface p-6 text-center">
        <p className="text-muted">No todos were extracted from the text.</p>
        <Button variant="ghost" onClick={onCancel} className="mt-4">
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-secondary">
          <Sparkles className="h-4 w-4" />
          <span className="text-sm font-medium">
            {todos.length} todo{todos.length !== 1 ? "s" : ""} extracted
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleSelectAll}>
          {todos.every((t) => t.selected) ? "Deselect all" : "Select all"}
        </Button>
      </div>

      {/* Todo list */}
      <div className="space-y-2">
        {todos.map((todo) => (
          <div
            key={todo.tempId}
            className={`rounded-xl border bg-surface p-4 shadow-sm transition-opacity ${
              todo.selected ? "border-color" : "border-color opacity-50"
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Selection checkbox */}
              <Checkbox
                checked={todo.selected}
                onChange={() => handleToggleSelect(todo.tempId)}
                className="mt-1"
              />

              {/* Content */}
              <div className="flex-1 space-y-2">
                {/* Title input */}
                <Input
                  type="text"
                  value={todo.title}
                  onChange={(e) =>
                    handleTitleChange(todo.tempId, e.target.value)
                  }
                  size="sm"
                  className="w-full"
                  disabled={!todo.selected}
                />

                {/* Due date */}
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted" />
                  <Input
                    type="date"
                    value={todo.dueDate ?? ""}
                    onChange={(e) =>
                      handleDueDateChange(todo.tempId, e.target.value || null)
                    }
                    size="sm"
                    className="w-auto"
                    disabled={!todo.selected}
                  />
                  {todo.dueDate && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleDueDateChange(todo.tempId, null)}
                      disabled={!todo.selected}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              {/* Remove button */}
              <Button
                variant="ghost"
                size="sm"
                shape="square"
                onClick={() => handleRemove(todo.tempId)}
                className="text-muted hover:text-error"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" onClick={onCancel} disabled={isCreating}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={onConfirm}
          disabled={selectedCount === 0 || isCreating}
        >
          {isCreating
            ? "Adding..."
            : `Add ${selectedCount} todo${selectedCount !== 1 ? "s" : ""}`}
        </Button>
      </div>
    </div>
  );
}
