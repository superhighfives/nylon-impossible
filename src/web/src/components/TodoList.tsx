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
import { generateKeyBetween } from "fractional-indexing";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Inbox,
  RefreshCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import { TodoItemExpanded } from "@/components/TodoItemExpanded";
import {
  STALE_AI_MS,
  STALE_RESEARCH_MS,
  useDeleteTodo,
  useTodos,
  useUpdateTodo,
} from "@/hooks/useTodos";
import type { TodoWithUrls } from "@/types/database";
import { TodoActionsMenu } from "./TodoActionsMenu";
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

interface ExpandedSectionProps {
  todo: TodoWithUrls;
  onUpdate: (updates: {
    title?: string;
    notes?: string | null;
    dueDate?: Date | null;
    priority?: "high" | "low" | null;
  }) => void;
  isUpdating: boolean;
  onDelete: (id: string) => void;
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
  onToggleExpand,
  onDelete,
  updatePending,
  deletePending,
}: TodoItemProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="relative -top-px">
        <Checkbox
          checked={todo.completed}
          onCheckedChange={() => onToggle(todo.id, todo.completed)}
          disabled={updatePending}
          variant={todo.completed ? "subtle" : "default"}
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
            className={`leading-snug break-words ${
              todo.completed
                ? "text-xs line-through text-gray-muted"
                : "text-sm text-gray"
            }`}
          >
            {todo.title}
          </p>
          {(todo.aiStatus === "pending" || todo.aiStatus === "processing") &&
            Date.now() - new Date(todo.createdAt).getTime() < STALE_AI_MS && (
              <output
                className="flex items-center gap-1 text-gray-muted text-xs"
                aria-label="AI is processing"
              >
                <Loader size="sm" className="text-gray-muted" />
              </output>
            )}
          {todo.research?.status === "pending" &&
            Date.now() - new Date(todo.research.createdAt).getTime() <
              STALE_RESEARCH_MS && (
              <output
                className="flex items-center gap-1 text-gray-muted text-xs"
                aria-label="Researching"
              >
                <Loader
                  size="sm"
                  className="text-yellow-8 dark:text-yellowdark-8"
                />
              </output>
            )}
        </div>
        {!isExpanded &&
          todo.research?.status === "completed" &&
          todo.research.summary && (
            <p className="text-xs text-gray-muted mt-1.5 line-clamp-2 leading-relaxed">
              {todo.research.summary.replace(/\[\d+\]/g, "")}
            </p>
          )}
        {todo.urls &&
          (() => {
            const nonResearchUrls = todo.urls.filter((url) => !url.researchId);
            if (nonResearchUrls.length === 0) return null;
            const overflow = nonResearchUrls.length - 2;
            return (
              <div className="flex flex-col gap-1 mt-1.5">
                {todo.completed
                  ? null
                  : nonResearchUrls
                      .slice(0, 2)
                      .map((url) => <UrlCardCompact key={url.id} url={url} />)}
                {(todo.completed
                  ? nonResearchUrls.length > 0
                  : overflow > 0) && (
                  <span className="text-xs text-gray-muted">
                    +{todo.completed ? nonResearchUrls.length : overflow}{" "}
                    {(todo.completed ? nonResearchUrls.length : overflow) === 1
                      ? "link"
                      : "links"}
                  </span>
                )}
              </div>
            );
          })()}
        <TodoIndicators todo={todo} />
      </div>
      {/* Mobile: popover actions menu */}
      <div className="flex sm:hidden">
        <TodoActionsMenu
          todoId={todo.id}
          todoTitle={todo.title}
          isExpanded={isExpanded}
          onToggleExpand={onToggleExpand}
          onDelete={onDelete}
          deletePending={deletePending}
        />
      </div>

      {/* Desktop: inline button revealed on hover */}
      <div className="hidden sm:flex sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="xs"
          shape="square"
          type="button"
          onClick={() => onToggleExpand(todo.id)}
          aria-label={isExpanded ? "Collapse details" : "Expand details"}
        >
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
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
  onDelete,
  deletePending,
}: ExpandedSectionProps) {
  return (
    <TodoItemExpanded
      todo={todo}
      onUpdate={onUpdate}
      isUpdating={isUpdating}
      onDelete={onDelete}
      deletePending={deletePending}
    />
  );
}

function SortableTodoItem(
  props: TodoItemProps & {
    onUpdateExpanded: (updates: {
      title?: string;
      notes?: string | null;
      dueDate?: Date | null;
      priority?: "high" | "low" | null;
    }) => void;
  },
) {
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
    isSorting,
    activeIndex,
    overIndex,
    index,
  } = useSortable({ id: props.todo.id, disabled: props.isExpanded });

  // The list stays still while dragging — the floating overlay clone carries
  // the motion and the snap line marks the target — so no sort transform is
  // applied here. The source row just dims to show it's been lifted out.

  // Drop indicator: a guide line at the insertion point. It sits on the
  // leading edge of the hovered row, on the side the dragged item will land —
  // above when moving up, below when moving down. The line snaps between rows
  // rather than animating, so placement reads instantly.
  const isDropTarget =
    isSorting &&
    !isDragging &&
    index === overIndex &&
    activeIndex !== overIndex;
  const lineAbove = isDropTarget && overIndex < activeIndex;
  const lineBelow = isDropTarget && overIndex > activeIndex;

  return (
    <div
      ref={setNodeRef}
      className={`group relative py-2 transition-opacity ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      {(lineAbove || lineBelow) && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 h-0.5 rounded-full bg-yellow-solid ${
            lineAbove ? "top-0" : "bottom-0"
          }`}
        />
      )}
      <div className="flex items-start gap-2">
        <button
          type="button"
          disabled={props.isExpanded}
          className="pt-0.5 cursor-grab active:cursor-grabbing text-gray-muted hover:text-gray touch-none transition-transform active:scale-[0.96] disabled:opacity-50 disabled:cursor-default disabled:hover:text-gray-muted"
          aria-label={`Reorder "${props.todo.title}"`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <TodoItemContent {...props} />
          {props.isExpanded && (
            <ExpandedSection
              todo={props.todo}
              onUpdate={props.onUpdateExpanded}
              isUpdating={props.updatePending}
              onDelete={props.onDelete}
              deletePending={props.deletePending}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TodoSkeleton() {
  return (
    <output className="block space-y-4 py-2" aria-label="Loading todos">
      {[72, 56, 80].map((width) => (
        <div key={width} className="flex items-start gap-2 animate-pulse">
          <div className="w-4 shrink-0" />
          <div className="flex-1 flex items-start gap-3">
            <div className="relative -top-px">
              <div className="h-4 w-4 rounded bg-gray-base" />
            </div>
            <div className="flex-1 space-y-2">
              <div
                className="h-3 rounded bg-gray-base"
                style={{ width: `${width}%` }}
              />
              <div className="h-2.5 rounded bg-gray-base w-1/3" />
            </div>
          </div>
        </div>
      ))}
    </output>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center text-center py-16 px-4">
      <div className="w-12 h-12 rounded-full bg-gray-base flex items-center justify-center text-gray-muted mb-4">
        <Inbox size={20} aria-hidden="true" />
      </div>
      <h2 className="text-sm font-medium text-gray">Nothing to do yet</h2>
      <p className="text-xs text-gray-muted mt-1 max-w-xs">
        Add a todo above to get started. Try &ldquo;Buy groceries
        tomorrow&rdquo; or paste a link to research.
      </p>
    </div>
  );
}

function ErrorState({
  onRetry,
  isRetrying,
}: {
  onRetry: () => void;
  isRetrying: boolean;
}) {
  return (
    <div className="flex flex-col items-center text-center py-16 px-4">
      <div className="w-12 h-12 rounded-full bg-red-base flex items-center justify-center text-red-muted mb-4">
        <AlertCircle size={20} aria-hidden="true" />
      </div>
      <h2 className="text-sm font-medium text-gray">
        Couldn&apos;t load todos
      </h2>
      <p className="text-xs text-gray-muted mt-1 max-w-xs">
        Something went wrong fetching your list. Check your connection and try
        again.
      </p>
      <Button
        variant="secondary"
        size="sm"
        onClick={onRetry}
        loading={isRetrying}
        disabled={isRetrying}
        className="mt-4"
      >
        <RefreshCw size={14} />
        Try again
      </Button>
    </div>
  );
}

export function TodoList() {
  const { data: todos, isLoading, error, refetch, isFetching } = useTodos();
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
    return <TodoSkeleton />;
  }

  if (error) {
    return <ErrorState onRetry={() => refetch()} isRetrying={isFetching} />;
  }

  if (!todos || todos.length === 0) {
    return <EmptyState />;
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
      notes?: string | null;
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
  const activeTodo = activeId
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
      <div>
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
        <DragOverlay dropAnimation={null}>
          {activeTodo ? (
            // Extend the card 12px past the row on each side (px-3 -mx-3) for a
            // lifted feel while the content still overlays the source row 1:1.
            // The grip is hidden — the cursor sits over it — but keeps its space
            // so the text stays aligned with the rest of the list.
            <div className="cursor-grabbing -mx-3 rounded-xl bg-gray-surface px-3 py-2 shadow-xl ring-1 ring-gray-subtle">
              <div className="flex items-start gap-2">
                <span
                  className="pt-0.5 text-gray-muted opacity-0"
                  aria-hidden="true"
                >
                  <GripVertical size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <TodoItemContent
                    {...sharedProps(activeTodo)}
                    isExpanded={false}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </DragOverlay>
        {completedTodos.map((todo) => (
          <div key={todo.id} className="group py-2">
            <div className="flex items-start gap-2">
              <div className="w-4 shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <TodoItemContent {...sharedProps(todo)} />
                {expandedId === todo.id && (
                  <ExpandedSection
                    todo={todo}
                    onUpdate={handleUpdateExpanded(todo.id)}
                    isUpdating={updateTodo.isPending}
                    onDelete={handleDelete}
                    deletePending={deleteTodo.isPending}
                  />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </DndContext>
  );
}
