import { Button, Checkbox, Input } from "@cloudflare/kumo";
import { useState } from "react";
import { useDeleteTodo, useTodos, useUpdateTodo } from "@/hooks/useTodos";

export function TodoList() {
  const { data: todos, isLoading, error } = useTodos();
  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  if (isLoading) {
    return <p className="text-center text-muted">Loading todos...</p>;
  }

  if (error) {
    return (
      <p className="text-center text-error">
        Failed to load todos. Please try again.
      </p>
    );
  }

  if (!todos || todos.length === 0) {
    return (
      <p className="text-center text-muted">No todos yet. Add one above!</p>
    );
  }

  const handleToggle = (id: string, completed: boolean) => {
    updateTodo.mutate({ id, input: { completed: !completed } });
  };

  const handleEdit = (id: string, title: string) => {
    setEditingId(id);
    setEditTitle(title);
  };

  const handleSaveEdit = (id: string) => {
    if (!editTitle.trim()) return;

    updateTodo.mutate(
      { id, input: { title: editTitle.trim() } },
      {
        onSuccess: () => {
          setEditingId(null);
          setEditTitle("");
        },
      },
    );
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditTitle("");
  };

  const handleDelete = (id: string) => {
    deleteTodo.mutate(id);
  };

  return (
    <div className="space-y-2">
      {todos.map((todo) => (
        <div
          key={todo.id}
          className="rounded-xl border border-color bg-surface p-4 shadow-sm"
        >
          {editingId === todo.id ? (
            <div className="flex gap-2">
              <Input
                type="text"
                value={editTitle}
				size="sm"
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveEdit(todo.id);
                  if (e.key === "Escape") handleCancelEdit();
                }}
                autoFocus
                className="flex-1"
              />
              <Button
                size="sm"
                onClick={() => handleSaveEdit(todo.id)}
                disabled={updateTodo.isPending}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCancelEdit}
                disabled={updateTodo.isPending}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Checkbox
                checked={todo.completed}
                onChange={() => handleToggle(todo.id, todo.completed)}
                disabled={updateTodo.isPending}
              />
              <span
                className={`flex-1 ${todo.completed ? "line-through text-muted" : ""}`}
              >
                {todo.title}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleEdit(todo.id, todo.title)}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDelete(todo.id)}
                disabled={deleteTodo.isPending}
              >
                Delete
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
