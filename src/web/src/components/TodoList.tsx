import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  KeyboardSensor,
  type Modifier,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { previousDueDate } from "@nylon-impossible/shared/recurrence";
import { generateKeyBetween } from "fractional-indexing";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  GripVertical,
  Inbox,
  MessageCircle,
  RefreshCw,
  Repeat,
} from "lucide-react";
import { useEffect, useState } from "react";
import { TodoItemExpanded } from "@/components/TodoItemExpanded";
import { useHints } from "@/hooks/useHints";
import { useImportReview } from "@/hooks/useImportReview";
import { useLocalMidnightTick } from "@/hooks/useLocalMidnightTick";
import {
  STALE_AI_MS,
  STALE_RESEARCH_MS,
  useDeleteTodo,
  useTodos,
  useUpdateTodo,
} from "@/hooks/useTodos";
import { useUpdateUser, useUser } from "@/hooks/useUser";
import { formatDate, isEffectivelyCompleted, relativeDay } from "@/lib/date";
import { recurrenceLabel } from "@/lib/recurrence";
import { messageFromError, toast } from "@/lib/toast";
import type { TodoWithUrls, UpdateTodoInput } from "@/types/database";
import { TodoActionsMenu } from "./TodoActionsMenu";
import { Button, Checkbox, Loader, UrlCardCompact } from "./ui";

// This is a single-column vertical list, so lock dragging to the Y axis —
// otherwise the lifted row drifts sideways as it tracks the pointer/keyboard.
const restrictToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
});

// Custom keyboard movement. dnd-kit's default sortableKeyboardCoordinates
// mis-offsets across variable-height rows: arrowing a short row past a tall one
// moves it by the wrong distance, so it lands overlapping its neighbor instead
// of in the gap. This reads each row's live position and lands the dragged row
// flush against the neighbor it passes, using that neighbor's actual height.
const verticalKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { context: { active, collisionRect, droppableContainers } },
) => {
  if (event.code !== "ArrowDown" && event.code !== "ArrowUp") return undefined;
  if (!active || !collisionRect) return undefined;
  event.preventDefault();

  const activeTop = collisionRect.top;
  const others: DOMRect[] = [];
  for (const container of droppableContainers.getEnabled()) {
    if (!container || container.disabled || container.id === active.id)
      continue;
    const node = container.node.current;
    if (node) others.push(node.getBoundingClientRect());
  }

  if (event.code === "ArrowDown") {
    // Nearest row below; land just past its bottom (its top + its height).
    const below = others
      .filter((r) => r.top > activeTop + 1)
      .sort((a, b) => a.top - b.top)[0];
    if (!below) return undefined;
    return { x: collisionRect.left, y: activeTop + below.height };
  }

  // Nearest row above; take its slot at its top.
  const above = others
    .filter((r) => r.top < activeTop - 1)
    .sort((a, b) => b.top - a.top)[0];
  if (!above) return undefined;
  return { x: collisionRect.left, y: above.top };
};

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

/** Indicator badges for due date, priority, and recurrence */
function TodoIndicators({ todo }: { todo: TodoWithUrls }) {
  const { timeZone } = useHints();
  const now = new Date();
  const hasDueDate = !!todo.dueDate;
  // Only show priority badge for explicit "high" or "low" values
  const hasPriority = todo.priority === "high" || todo.priority === "low";
  const hasRecurrence = !!todo.recurrence;

  if (!hasDueDate && !hasPriority && !hasRecurrence) return null;

  const dueDate = todo.dueDate ? new Date(todo.dueDate) : null;
  const isCompleted = isEffectivelyCompleted(todo, timeZone, now);

  // A completed repeat has already rolled its dueDate forward to the next
  // occurrence, so instead of the schedule label ("Weekly on Wednesday") show
  // when it next comes back ("Next: Tomorrow").
  if (isCompleted && hasRecurrence && dueDate) {
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
        <span className="text-xs px-1.5 py-0.5 rounded-md flex items-center gap-1 border border-gray-line text-gray-muted">
          <Clock size={10} />
          Next: {relativeDay(dueDate, timeZone, now)}
          <Repeat size={10} />
        </span>
      </div>
    );
  }

  // A repeat sitting in Completed (completedAt today) has already rolled its
  // dueDate forward, so it's never overdue; guard on effective completion too.
  const isOverdue = dueDate && dueDate < now && !isCompleted;

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
          className={`text-xs tabular-nums px-1.5 py-0.5 rounded-md flex items-center gap-1 ${
            isOverdue
              ? "bg-red-base hover:bg-red-hover active:bg-red-active text-red-muted"
              : "bg-gray-base hover:bg-gray-hover active:bg-gray-active text-gray-muted"
          }`}
        >
          {isOverdue && <AlertCircle size={10} />}
          {formatDate(dueDate, timeZone)}
        </span>
      )}
      {todo.recurrence && (
        <span className="text-xs px-1.5 py-0.5 rounded-md flex items-center gap-1 bg-gray-base hover:bg-gray-hover active:bg-gray-active text-gray-muted">
          <Repeat size={10} />
          {recurrenceLabel(todo.recurrence, dueDate, timeZone)}
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
  showActions = true,
}: TodoItemProps & { showActions?: boolean }) {
  const { timeZone } = useHints();
  // A repeat completed today reads as done (checkbox, strike-through) until the
  // user's local midnight, even though `completed` stays false in the DB.
  const isCompleted = isEffectivelyCompleted(todo, timeZone, new Date());
  return (
    <div className="flex items-start gap-3">
      <div className="relative -top-px">
        <Checkbox
          checked={isCompleted}
          onCheckedChange={() => onToggle(todo.id, isCompleted)}
          disabled={updatePending}
          variant={isCompleted ? "subtle" : "default"}
          aria-label={
            isCompleted
              ? `Mark "${todo.title}" as not completed`
              : `Mark "${todo.title}" as completed`
          }
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p
            className={`min-w-0 leading-snug wrap-anywhere ${
              isCompleted
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
          {todo.needsInput && (
            <Button
              variant="ghost"
              size="xs"
              shape="circle"
              type="button"
              onClick={() => onToggleExpand(todo.id)}
              aria-label="The assistant has a question — open to reply"
              className="bg-yellow-base hover:bg-yellow-hover text-yellow"
            >
              <MessageCircle size={12} />
            </Button>
          )}
        </div>
        {isCompleted && todo.recurrence && todo.completedAt && (
          <p className="text-xs text-gray-muted mt-0.5">
            Completed:{" "}
            {formatDate(todo.completedAt, timeZone, {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}
          </p>
        )}
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
                {isCompleted
                  ? null
                  : nonResearchUrls
                      .slice(0, 2)
                      .map((url) => <UrlCardCompact key={url.id} url={url} />)}
                {(isCompleted ? nonResearchUrls.length > 0 : overflow > 0) && (
                  <span className="text-xs text-gray-muted">
                    +{isCompleted ? nonResearchUrls.length : overflow}{" "}
                    {(isCompleted ? nonResearchUrls.length : overflow) === 1
                      ? "link"
                      : "links"}
                  </span>
                )}
              </div>
            );
          })()}
        <TodoIndicators todo={todo} />
      </div>
      {/* Actions are hidden in the drag overlay clone so the lifted card
          hugs the title instead of stretching to the taller control. */}
      {showActions && (
        <>
          {/* Mobile: popover actions menu. The h-5 wrapper centers the taller
              control on the title line so it doesn't stretch the row height on
              todos without a description. */}
          <div className="flex h-5 items-center sm:hidden">
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
          <div className="hidden h-5 items-center sm:flex sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
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
        </>
      )}
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
    isKeyboardDragging: boolean;
    highlighted: boolean;
    onUpdateExpanded: (updates: {
      title?: string;
      notes?: string | null;
      dueDate?: Date | null;
      priority?: "high" | "low" | null;
    }) => void;
  },
) {
  const {
    active,
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
    isSorting,
    activeIndex,
    overIndex,
    index,
  } = useSortable({ id: props.todo.id, disabled: props.isExpanded });

  // Rows reflow to open a gap at the target so it's clear where the item lands.
  // No transition — rows (and the drop line) snap into place instead of sliding,
  // which is what kept the line from feeling static. Translate only, no scaleY,
  // so variable-height rows never squish or stretch.
  const style = { transform: CSS.Translate.toString(transform) };

  // Drop indicator: a guide line at the insertion point. It sits on the leading
  // edge of the hovered row, on the side the dragged item will land — above when
  // moving up, below when moving down.
  const isDropTarget =
    isSorting &&
    !isDragging &&
    index === overIndex &&
    activeIndex !== overIndex;
  const lineAbove = isDropTarget && overIndex < activeIndex;
  const lineBelow = isDropTarget && overIndex > activeIndex;

  // Reflow opens a gap the height of the dragged row beyond the row edge, so
  // nudge the line by half that height to sit centered in the gap. Since nothing
  // animates, it snaps straight to the centered position.
  const draggedHeight = active?.rect.current.initial?.height ?? 0;
  const lineShift = lineAbove ? -draggedHeight / 2 : draggedHeight / 2;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-lg py-2 transition-colors duration-1000 ease-out ${
        // Freshly imported rows glow briefly, then the tint transitions out
        // once the highlight clears — a gentle "these are new" cue.
        !isDragging && props.highlighted ? "bg-yellow-base" : ""
      } ${
        isDragging
          ? `z-10 -mx-3 cursor-grabbing rounded-xl bg-gray-surface/80 px-3 shadow-xl backdrop-blur-sm ${
              // Yellow border only for keyboard drags — it flags the selected
              // row when there's no cursor on it. Pointer drags keep the gray
              // ring since the cursor already shows what's being moved.
              props.isKeyboardDragging
                ? "ring-2 ring-yellow-strong"
                : "ring-1 ring-gray-subtle"
            }`
          : ""
      }`}
    >
      {/* Drop line is for pointer drags; keyboard drags use the dragged row's
          own yellow border to show the destination, so the line is redundant. */}
      {(lineAbove || lineBelow) && !props.isKeyboardDragging && (
        <span
          aria-hidden="true"
          style={{ transform: `translateY(${lineShift}px)` }}
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
          <GripVertical size={16} className="block" />
        </button>
        <div className="flex-1 min-w-0">
          <TodoItemContent {...props} showActions={!isDragging} />
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
        {!isRetrying && <RefreshCw size={14} />}
        Try again
      </Button>
    </div>
  );
}

export function TodoList() {
  const { data: todos, isLoading, error, refetch, isFetching } = useTodos();
  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();
  const { data: user } = useUser();
  const updateUser = useUpdateUser();
  const { highlightIds, hiddenIds } = useImportReview();
  const { timeZone } = useHints();
  // Re-render at each local midnight so completed repeats derive back to active
  // (their completedAt is no longer "today") without needing a server round-trip.
  useLocalMidnightTick();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isKeyboardDragging, setIsKeyboardDragging] = useState(false);
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
      coordinateGetter: verticalKeyboardCoordinates,
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
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;
    if (completed) {
      // Undo a repeat that's checked via completedAt (stamped, not persistently
      // done). Always clear the stamp so it can never stay stuck as completed —
      // even if the recurrence or dueDate was since removed. When both are still
      // present, also roll dueDate back one occurrence so it returns to today's
      // occurrence rather than the next one.
      if (!todo.completed && todo.completedAt) {
        const input: UpdateTodoInput = { completedAt: null };
        if (todo.recurrence && todo.dueDate) {
          input.dueDate = previousDueDate(
            todo.recurrence,
            new Date(todo.dueDate),
          );
        }
        updateTodo.mutate({ id, input });
        return;
      }
      // Unchecking a normal todo: move to end of incomplete list so it doesn't
      // snap back to its original position.
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

  // "Effective" completion counts a repeat completed today as done, so it sits
  // in Completed until the user's local midnight. The midnight tick re-renders
  // so it flips back to active on time. Computed once per todo into a map here —
  // the sort comparator and the two filters below would otherwise re-run the
  // (Intl-formatting) derivation many times per render.
  const now = new Date();
  const effectiveCompletedById = new Map(
    todos.map((t) => [t.id, isEffectivelyCompleted(t, timeZone, now)]),
  );
  const effectiveCompleted = (t: TodoWithUrls) =>
    effectiveCompletedById.get(t.id) ??
    isEffectivelyCompleted(t, timeZone, now);

  // Sort: incomplete first (by position), then completed (most recently completed first)
  const sortedTodos = [...todos].sort((a, b) => {
    const aDone = effectiveCompleted(a);
    const bDone = effectiveCompleted(b);
    if (aDone !== bDone) return aDone ? 1 : -1;
    if (!aDone) {
      const aPos = a.position ?? "a0";
      const bPos = b.position ?? "a0";
      if (aPos < bPos) return -1;
      if (aPos > bPos) return 1;
      return 0;
    }
    // Most recently completed first — completedAt for repeats, updatedAt for
    // ordinary todos (which don't stamp completedAt).
    const aUpdated = new Date(a.completedAt ?? a.updatedAt).getTime();
    const bUpdated = new Date(b.completedAt ?? b.updatedAt).getTime();
    return bUpdated - aUpdated;
  });

  // Imports under repeat-schedule review are held out of the list until the
  // user finishes, so they don't pop in behind the review modal.
  const incompleteTodos = sortedTodos.filter(
    (t) => !effectiveCompleted(t) && !hiddenIds.has(t.id),
  );
  // Imports under review are held out of the completed section too, so they
  // don't surface early and the accordion count stays accurate.
  const completedTodos = sortedTodos.filter(
    (t) => effectiveCompleted(t) && !hiddenIds.has(t.id),
  );
  // The completed section collapses into an accordion; the collapsed/expanded
  // state is the synced `hideCompleted` preference (true = collapsed).
  const completedCollapsed = user?.hideCompleted ?? false;

  const handleToggleCompleted = () => {
    updateUser.mutate(
      { hideCompleted: !completedCollapsed },
      {
        onError: (err) =>
          toast.error(messageFromError(err, "Couldn't change setting")),
      },
    );
  };

  const displayIncompleteTodos = localIncompleteTodos ?? incompleteTodos;

  const handleDragStart = ({ activatorEvent }: DragStartEvent) => {
    // The drag was started by the keyboard sensor when a keyboard event kicked
    // it off (Space/Enter on the grip) rather than a pointer.
    setIsKeyboardDragging(activatorEvent instanceof KeyboardEvent);
  };

  const handleDragCancel = () => {
    setIsKeyboardDragging(false);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setIsKeyboardDragging(false);
    const { active, over } = event;
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
      modifiers={[restrictToVerticalAxis]}
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
              isKeyboardDragging={isKeyboardDragging}
              highlighted={highlightIds.has(todo.id)}
              onUpdateExpanded={handleUpdateExpanded(todo.id)}
            />
          ))}
        </SortableContext>
        {/* Hold the completed section until the synced `hideCompleted`
            preference is known (i.e. `user` has loaded). Rendering before then
            would default to expanded and flash the completed items open, then
            collapse them once the preference arrives. Gating on `user` — rather
            than just "not loading" — also covers the errored/signed-out cases
            where the query settles without ever producing a preference. */}
        {user && completedTodos.length > 0 && (
          <div className="mt-2 border-t border-gray-base pt-1">
            <button
              type="button"
              onClick={handleToggleCompleted}
              disabled={updateUser.isPending}
              aria-expanded={!completedCollapsed}
              className="flex min-h-10 w-full items-center gap-1.5 rounded-lg py-2 text-xs font-medium text-gray-muted transition-colors hover:text-gray focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-strong disabled:opacity-50"
            >
              <ChevronRight
                size={14}
                aria-hidden="true"
                className={`shrink-0 transition-transform ${
                  completedCollapsed ? "" : "rotate-90"
                }`}
              />
              <span>Completed</span>
              <span className="rounded-md bg-gray-base px-1.5 py-0.5 tabular-nums text-gray-muted">
                {completedTodos.length}
              </span>
            </button>
            {!completedCollapsed &&
              completedTodos.map((todo) => (
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
        )}
      </div>
    </DndContext>
  );
}
