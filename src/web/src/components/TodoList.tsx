import { Checkbox } from "@cloudflare/kumo";
import { useEffect, useRef, useState } from "react";
import { useDeleteTodo, useTodos, useUpdateTodo } from "@/hooks/useTodos";

function formatDueDate(date: Date | null | undefined): string {
  if (!date) return "";

  const now = new Date();
  const dueDate = new Date(date);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dueDateOnly = new Date(
    dueDate.getFullYear(),
    dueDate.getMonth(),
    dueDate.getDate(),
  );

  if (dueDateOnly.getTime() === today.getTime()) {
    return "Today";
  }
  if (dueDateOnly.getTime() === tomorrow.getTime()) {
    return "Tomorrow";
  }

  const daysUntil = Math.ceil(
    (dueDateOnly.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (daysUntil > 0 && daysUntil <= 7) {
    return dueDate.toLocaleDateString("en-US", { weekday: "short" });
  }

  return dueDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function isOverdue(date: Date | null | undefined): boolean {
  if (!date) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDate = new Date(date);
  const dueDateOnly = new Date(
    dueDate.getFullYear(),
    dueDate.getMonth(),
    dueDate.getDate(),
  );
  return dueDateOnly < today;
}

function toDateInputValue(date: Date | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toISOString().split("T")[0];
}

export function TodoList() {
  const { data: todos, isLoading, error } = useTodos();
  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDueDate, setEditDueDate] = useState<string>("");
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingId]);

  if (isLoading) {
    return <p className="text-center text-muted text-sm py-12">Loading...</p>;
  }

  if (error) {
    return (
      <p className="text-center text-error text-sm py-12">
        Failed to load todos.
      </p>
    );
  }

  if (!todos || todos.length === 0) {
    return (
      <p className="text-center text-muted text-sm py-12">No todos yet.</p>
    );
  }

  const handleToggle = (id: string, completed: boolean) => {
    updateTodo.mutate({ id, input: { completed: !completed } });
  };

  const handleEdit = (
    id: string,
    title: string,
    dueDate: Date | null | undefined,
  ) => {
    setEditingId(id);
    setEditTitle(title);
    setEditDueDate(toDateInputValue(dueDate));
  };

  const handleSaveEdit = (id: string) => {
    if (!editTitle.trim()) return;

    updateTodo.mutate(
      {
        id,
        input: {
          title: editTitle.trim(),
          dueDate: editDueDate ? new Date(editDueDate) : null,
        },
      },
      {
        onSuccess: () => {
          setEditingId(null);
          setEditTitle("");
          setEditDueDate("");
        },
      },
    );
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditTitle("");
    setEditDueDate("");
  };

  const handleDelete = (id: string) => {
    deleteTodo.mutate(id);
  };

  // Sort: incomplete first, then by due date
  const sortedTodos = [...todos].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (!a.completed) {
      const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      if (aDue !== bDue) return aDue - bDue;
    }
    return 0;
  });

  return (
    <div className="divide-y divide-color">
      {sortedTodos.map((todo) => {
        const isEditing = editingId === todo.id;
        const overdue = isOverdue(todo.dueDate) && !todo.completed;

        return (
          <div key={todo.id} className="py-3 group">
            {isEditing ? (
              <div className="space-y-3">
                <input
                  ref={editInputRef}
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveEdit(todo.id);
                    if (e.key === "Escape") handleCancelEdit();
                  }}
                  className="w-full bg-transparent text-surface text-sm border-b border-color pb-1 focus:outline-none focus:border-surface"
                  aria-label="Edit todo title"
                />
                <div className="flex items-center justify-between">
                  <input
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="bg-transparent text-muted text-xs border-b border-color pb-1 focus:outline-none focus:border-surface"
                    aria-label="Due date"
                  />
                  <div className="flex gap-3 text-xs">
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="text-muted hover:text-surface"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(todo.id)}
                      className="text-surface font-medium"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <div className="pt-0.5">
                  <Checkbox
                    checked={todo.completed}
                    onChange={() => handleToggle(todo.id, todo.completed)}
                    disabled={updateTodo.isPending}
                    aria-label={`Mark "${todo.title}" as ${todo.completed ? "incomplete" : "complete"}`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm leading-snug ${
                      todo.completed ? "line-through text-muted" : "text-surface"
                    }`}
                  >
                    {todo.title}
                  </p>
                  {todo.dueDate && (
                    <p
                      className={`text-xs mt-1 ${
                        overdue ? "text-error" : "text-muted"
                      }`}
                    >
                      {formatDueDate(todo.dueDate)}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      handleEdit(todo.id, todo.title, todo.dueDate)
                    }
                    className="text-muted hover:text-surface"
                    aria-label={`Edit "${todo.title}"`}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(todo.id)}
                    disabled={deleteTodo.isPending}
                    className="text-muted hover:text-error"
                    aria-label={`Delete "${todo.title}"`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
