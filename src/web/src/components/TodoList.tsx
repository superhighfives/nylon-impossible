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
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  GripVertical,
} from "lucide-react";
import { useEffect, useState } from "react";
import { TodoItemExpanded } from "@/components/TodoItemExpanded";
import { useDeleteTodo, useTodos, useUpdateTodo } from "@/hooks/useTodos";
import type { TodoWithUrls } from "@/types/database";
import { Button, Checkbox, Loader, UrlCardCompact } from "./ui";

interface TodoItemProps {
  todo: TodoWithUrls;
  isExpanded: boolean;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
  onToggleExpand: (id: string) => void;
  updatePending: boolean;
  deletePending: boolean;
}

/** Indicator badges for due date and priority */
function TodoIndicators({ todo }: { todo: TodoWithUrls }) {
  const hasDueDate = !!todo.dueDate;
  // Only show priority badge for explicit "high" or "low" values
  const hasPriority = todo.priority === "high" || todo.priority === "low";

  if (!hasDueDate && !hasPriority) return null;

  const dueDate = todo.dueDate ? new Date(todo.dueDate) : null;
  const isOverdue = dueDate && dueDate < new Date() && !todo.completed;

  return (
    <div className="flex items-center gap-1.5 mt-1">
      {hasPriority && (
        <span
          className={`text-xs px-1.5 py-0.5 rounded-md ${
            todo.priority === "high"
              ? "bg-yellow-base hover:bg-yellow-hover active:bg-yellow-active text-yellow-muted"
              : "bg-gray-base hover:bg-gray-hover active:bg-gray-active text-gray-muted"
          }`}
        >
          {todo.priority === "high" ? "High" : "Low"}
        </span>
      )}
      {hasDueDate && dueDate && (
        <span
          className={`text-xs px-1.5 py-0.5 rounded-md flex items-center gap-1 ${
            isOverdue
              ? "bg-red-base hover:bg-red-hover active:bg-red-active text-red-muted"
              : "bg-gray-base hover:bg-gray-hover active:bg-gray-active text-gray-muted"
          }`}
        >
          {isOverdue && <AlertCircle size={10} />}
          {dueDate.toLocaleDateString()}
        </span>
      )}
    </div>
  );
}

function TodoItemContent({
  todo,
  isExpanded,
  onToggle,
  onDelete,
  onToggleExpand,
  updatePending,
  deletePending,
}: TodoItemProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="pt-0.5">
        <Checkbox
          checked={todo.completed}
          onCheckedChange={() => onToggle(todo.id, todo.completed)}
          disabled={updatePending}
          aria-label={
            todo.completed
              ? `Mark "${todo.title}" as not completed`
              : `Mark "${todo.title}" as completed`
          }
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p
            className={`text-sm leading-snug break-words ${
              todo.completed ? "line-through text-gray-muted" : "text-gray"
            }`}
          >
            {todo.title}
          </p>
          {(todo.aiStatus === "pending" || todo.aiStatus === "processing") && (
            <output
              className="flex items-center gap-1 text-gray-muted text-xs"
              aria-label="AI is processing"
            >
              <Loader size="sm" className="text-gray-8 dark:text-graydark-8" />
            </output>
          )}
        </div>
        {todo.urls && todo.urls.length > 0 && (
          <div className="flex flex-col gap-1 mt-1.5">
            {todo.urls.map((url) => (
              <UrlCardCompact key={url.id} url={url} />
            ))}
          </div>
        )}
        <TodoIndicators todo={todo} />
      </div>
      <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => onToggleExpand(todo.id)}
          aria-label={isExpanded ? "Collapse details" : "Expand details"}
        >
          Edit
          {isExpanded ? (
            <ChevronUp size={14} className="ml-1" />
          ) : (
            <ChevronDown size={14} className="ml-1" />
          )}
        </Button>
        <Button
          variant="destructive"
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

/** Wrapper that displays expanded todo details */
function ExpandedSection({
  todo,
  onUpdate,
  isUpdating,
}: {
  todo: TodoWithUrls;
  onUpdate: (updates: {
    title?: string;
    description?: string | null;
    dueDate?: Date | null;
    priority?: "high" | "low" | null;
  }) => void;
  isUpdating: boolean;
}) {
  return (
    <TodoItemExpanded todo={todo} onUpdate={onUpdate} isUpdating={isUpdating} />
  );
}

function SortableTodoItem(
  props: TodoItemProps & {
    onUpdateExpanded: (updates: {
      title?: string;
      description?: string | null;
      dueDate?: Date | null;
      priority?: "high" | "low" | null;
    }) => void;
  },
) {
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
    opacity: isDragging ? 0 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="py-3 group">
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="pt-1.75 cursor-grab active:cursor-grabbing text-gray-muted hover:text-gray touch-none"
          aria-label={`Reorder "${props.todo.title}"`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <TodoItemContent {...props} />
          {props.isExpanded && !isDragging && (
            <ExpandedSection
              todo={props.todo}
              onUpdate={props.onUpdateExpanded}
              isUpdating={props.updatePending}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function TodoList() {
  const { data: todos, isLoading, error } = useTodos();
  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [localIncompleteTodos, setLocalIncompleteTodos] = useState<
    TodoWithUrls[] | null
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: todos is intentionally used as a trigger to reset local order when server data refreshes
  useEffect(() => {
    setLocalIncompleteTodos(null);
  }, [todos]);

  if (isLoading) {
    return (
      <p className="text-center text-gray-muted text-sm py-12">Loading...</p>
    );
  }

  if (error) {
    return (
      <p className="text-center text-red-muted text-sm py-12">
        Failed to load todos.
      </p>
    );
  }

  if (!todos || todos.length === 0) {
    return (
      <p className="text-center text-gray-muted text-sm py-12">No todos yet.</p>
    );
  }

  const handleToggle = (id: string, completed: boolean) => {
    if (completed) {
      // Unchecking: move to end of incomplete list so it doesn't snap back to original position
      const lastPosition =
        displayIncompleteTodos.length > 0
          ? displayIncompleteTodos[displayIncompleteTodos.length - 1].position
          : null;
      const newPosition = generateKeyBetween(lastPosition ?? null, null);
      updateTodo.mutate({
        id,
        input: { completed: false, position: newPosition },
      });
    } else {
      updateTodo.mutate({ id, input: { completed: true } });
    }
  };

  const handleDelete = (id: string) => {
    deleteTodo.mutate(id);
  };

  const handleToggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleUpdateExpanded =
    (id: string) =>
    (updates: {
      title?: string;
      description?: string | null;
      dueDate?: Date | null;
      priority?: "high" | "low" | null;
    }) => {
      updateTodo.mutate({ id, input: updates });
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

  const sharedProps = (todo: TodoWithUrls) => ({
    todo,
    isExpanded: expandedId === todo.id,
    onToggle: handleToggle,
    onDelete: handleDelete,
    onToggleExpand: handleToggleExpand,
    updatePending: updateTodo.isPending,
    deletePending: deleteTodo.isPending,
  });

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="divide-y divide-gray-subtle">
        <SortableContext
          items={displayIncompleteTodos.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {displayIncompleteTodos.map((todo) => (
            <SortableTodoItem
              key={todo.id}
              {...sharedProps(todo)}
              onUpdateExpanded={handleUpdateExpanded(todo.id)}
            />
          ))}
        </SortableContext>
        <DragOverlay>
          {activeItem ? (
            <div
              className="py-3 bg-gray-surface shadow-lg rounded-lg opacity-95 pointer-events-none"
              aria-hidden="true"
            >
              <div className="flex items-start gap-2">
                <div className="pt-1 cursor-grabbing text-gray-muted">
                  <GripVertical size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <TodoItemContent {...sharedProps(activeItem)} />
                </div>
              </div>
            </div>
          ) : null}
        </DragOverlay>
        {completedTodos.map((todo) => (
          <div key={todo.id} className="py-3 group">
            <TodoItemContent {...sharedProps(todo)} />
            {expandedId === todo.id && (
              <ExpandedSection
                todo={todo}
                onUpdate={handleUpdateExpanded(todo.id)}
                isUpdating={updateTodo.isPending}
              />
            )}
          </div>
        ))}
      </div>
    </DndContext>
  );
}
