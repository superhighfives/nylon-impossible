import { Button, Checkbox, Input } from "@cloudflare/kumo";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { generateKeyBetween } from "fractional-indexing";
import { GripVertical } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDeleteTodo, useTodos, useUpdateTodo } from "@/hooks/useTodos";
import type { Todo } from "@/types/database";

interface TodoItemProps {
  todo: Todo;
  isEditing: boolean;
  editTitle: string;
  editInputRef: React.RefObject<HTMLInputElement | null>;
  onToggle: (id: string, completed: boolean) => void;
  onEdit: (id: string, title: string) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
  onEditTitleChange: (value: string) => void;
  updatePending: boolean;
  deletePending: boolean;
}

function TodoItemContent({
  todo,
  isEditing,
  editTitle,
  editInputRef,
  onToggle,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onEditTitleChange,
  updatePending,
  deletePending,
}: TodoItemProps) {
  if (isEditing) {
    return (
      <div className="space-y-3">
        <Input
          ref={editInputRef}
          type="text"
          value={editTitle}
          onChange={(e) => onEditTitleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSaveEdit(todo.id);
            if (e.key === "Escape") onCancelEdit();
          }}
          className="w-full"
          aria-label="Edit todo title"
          size="sm"
        />
        <div className="flex items-center justify-end">
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={onCancelEdit}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="button"
              onClick={() => onSaveEdit(todo.id)}
            >
              Save
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <div className="pt-0.5">
        <Checkbox
          checked={todo.completed}
          onCheckedChange={() => onToggle(todo.id, todo.completed)}
          disabled={updatePending}
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
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => onEdit(todo.id, todo.title)}
          aria-label={`Edit "${todo.title}"`}
        >
          Edit
        </Button>
        <Button
          variant="secondary-destructive"
          size="sm"
          type="button"
          onClick={() => onDelete(todo.id)}
          disabled={deletePending}
          aria-label={`Delete "${todo.title}"`}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}

function SortableTodoItem(props: TodoItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.todo.id });

  const style = {
    transform: isDragging ? undefined : CSS.Transform.toString(transform),
    transition: isDragging ? "none" : transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="py-3 group">
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="pt-1 cursor-grab active:cursor-grabbing text-muted hover:text-surface touch-none"
          aria-label={`Reorder "${props.todo.title}"`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <TodoItemContent {...props} />
        </div>
      </div>
    </div>
  );
}

export function TodoList() {
  const { data: todos, isLoading, error } = useTodos();
  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [localIncompleteTodos, setLocalIncompleteTodos] = useState<
    Todo[] | null
  >(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: todos is intentionally used as a trigger to reset local order when server data refreshes
  useEffect(() => {
    setLocalIncompleteTodos(null);
  }, [todos]);

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

  const handleEdit = (id: string, title: string) => {
    setEditingId(id);
    setEditTitle(title);
  };

  const handleSaveEdit = (id: string) => {
    if (!editTitle.trim()) return;

    updateTodo.mutate(
      {
        id,
        input: {
          title: editTitle.trim(),
        },
      },
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

  // Sort: incomplete first (by position), then completed (most recently completed first)
  const sortedTodos = [...todos].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (!a.completed) {
      const aPos = a.position ?? "a0";
      const bPos = b.position ?? "a0";
      if (aPos < bPos) return -1;
      if (aPos > bPos) return 1;
      return 0;
    }
    const aUpdated = new Date(a.updatedAt).getTime();
    const bUpdated = new Date(b.updatedAt).getTime();
    return bUpdated - aUpdated;
  });

  const incompleteTodos = sortedTodos.filter((t) => !t.completed);
  const completedTodos = sortedTodos.filter((t) => t.completed);

  const displayIncompleteTodos = localIncompleteTodos ?? incompleteTodos;
  const activeItem = activeId
    ? (displayIncompleteTodos.find((t) => t.id === activeId) ?? null)
    : null;

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(active.id as string);
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const currentItems = localIncompleteTodos ?? incompleteTodos;
    const oldIndex = currentItems.findIndex((t) => t.id === active.id);
    const newIndex = currentItems.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(currentItems, oldIndex, newIndex);
    setLocalIncompleteTodos(reordered);

    const prev = newIndex > 0 ? reordered[newIndex - 1].position : null;
    const next =
      newIndex < reordered.length - 1 ? reordered[newIndex + 1].position : null;
    const newPosition = generateKeyBetween(prev ?? null, next ?? null);

    updateTodo.mutate({
      id: active.id as string,
      input: { position: newPosition },
    });
  };

  const sharedProps = (todo: Todo) => ({
    todo,
    isEditing: editingId === todo.id,
    editTitle,
    editInputRef,
    onToggle: handleToggle,
    onEdit: handleEdit,
    onSaveEdit: handleSaveEdit,
    onCancelEdit: handleCancelEdit,
    onDelete: handleDelete,
    onEditTitleChange: setEditTitle,
    updatePending: updateTodo.isPending,
    deletePending: deleteTodo.isPending,
  });

  return (
    <div className="divide-y divide-color">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext
          items={displayIncompleteTodos.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {displayIncompleteTodos.map((todo) => (
            <SortableTodoItem key={todo.id} {...sharedProps(todo)} />
          ))}
        </SortableContext>
        <DragOverlay>
          {activeItem ? (
            <div
              className="py-3 bg-surface shadow-lg rounded-md opacity-95 pointer-events-none"
              aria-hidden="true"
            >
              <div className="flex items-start gap-2">
                <div className="pt-1 cursor-grabbing text-muted">
                  <GripVertical size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <TodoItemContent {...sharedProps(activeItem)} />
                </div>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {completedTodos.map((todo) => (
        <div key={todo.id} className="py-3 group">
          <TodoItemContent {...sharedProps(todo)} />
        </div>
      ))}
    </div>
  );
}
