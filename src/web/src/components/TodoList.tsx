import { useDroppable } from "@dnd-kit/core";
import {
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
  Clock,
  FileText,
  GripVertical,
  Inbox,
  Link2,
  ListTree,
  MessageCircle,
  Pin,
  PinOff,
  RefreshCw,
  Repeat,
  Sparkles,
  Trash2,
} from "lucide-react";
import { InlineDueDate } from "@/components/InlineTodoControls";
import { LinkifiedText } from "@/components/LinkifiedText";
import { TodoItemExpanded } from "@/components/TodoItemExpanded";
import { useHints } from "@/hooks/useHints";
import {
  STALE_AI_MS,
  STALE_RESEARCH_MS,
  type useCreateTodo,
  type useDeleteTodo,
  type useUpdateTodo,
} from "@/hooks/useTodos";
import { formatDate, isEffectivelyCompleted, relativeDay } from "@/lib/date";
import { recurrenceLabel } from "@/lib/recurrence";
import { sortTopLevelTodos } from "@/lib/todoOrder";
import { getFetchedPreviewTitle, getUrlOnlyUrl } from "@/lib/url-display";
import type { TodoWithUrls, UpdateTodoInput } from "@/types/database";
import { TodoActionsMenu } from "./TodoActionsMenu";
import { Button, Checkbox, focusRing, Loader, UrlPreviewCard } from "./ui";

/**
 * Sorted, hidden-filtered incomplete todos for one list — sticky-first, by
 * position within each tier. Shared by `TodoListColumn` (its own display
 * order) and `TodoGrid` (computing the source/target list's neighbors when a
 * cross-list drag needs a new position), so the two orderings never drift.
 */
export function getIncompleteOrder(
  todos: TodoWithUrls[],
  timeZone: string,
  hiddenIds: ReadonlySet<string>,
): TodoWithUrls[] {
  return sortTopLevelTodos(todos, timeZone).incomplete.filter(
    (t) => !hiddenIds.has(t.id),
  );
}

interface SubtaskHandlers {
  onAdd: (parentId: string, title: string, position?: string) => void;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
  onReorder: (id: string, position: string) => void;
}

interface TodoItemProps {
  todo: TodoWithUrls;
  subtasks: TodoWithUrls[];
  isExpanded: boolean;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onInlineUpdate: (id: string, updates: UpdateTodoInput) => void;
  updatePending: boolean;
  deletePending: boolean;
}

interface ExpandedSectionProps {
  todo: TodoWithUrls;
  subtasks: TodoWithUrls[];
  onUpdate: (updates: {
    title?: string;
    notes?: string | null;
    dueDate?: Date | null;
    sticky?: boolean;
  }) => void;
  onDelete: (id: string) => void;
  deletePending: boolean;
  subtaskHandlers: SubtaskHandlers;
}

/** Indicator badges for due date and recurrence */
function TodoIndicators({ todo }: { todo: TodoWithUrls }) {
  const { timeZone } = useHints();
  const now = new Date();
  const hasDueDate = !!todo.dueDate;
  const hasRecurrence = !!todo.recurrence;

  if (!hasDueDate && !hasRecurrence) return null;

  const dueDate = todo.dueDate ? new Date(todo.dueDate) : null;
  const isCompleted = isEffectivelyCompleted(todo, timeZone, now);

  // A completed repeat has already rolled its dueDate forward to the next
  // occurrence, so instead of the schedule label ("Weekly on Wednesday") show
  // when it next comes back ("Next: Tomorrow").
  if (isCompleted && hasRecurrence && dueDate) {
    return (
      <div className="flex items-center gap-1.5 mt-1">
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

/**
 * Compact outline badges summarizing a completed todo's content — notes,
 * research, links — in place of the full previews shown while it's active. Keeps
 * the Completed section terse: a glance tells you what's inside, expand for more.
 */
function CompletedContentBadges({ todo }: { todo: TodoWithUrls }) {
  const hasNotes = !!todo.notes?.trim();
  const hasResearch =
    todo.research?.status === "completed" && !!todo.research.summary;
  const linkCount = todo.urls?.filter((url) => !url.researchId).length ?? 0;

  if (!hasNotes && !hasResearch && linkCount === 0) return null;

  const badge =
    "text-xs px-1.5 py-0.5 rounded-md flex items-center gap-1 border border-gray-line text-gray-muted";

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
      {hasNotes && (
        <span className={badge}>
          <FileText size={10} />
          Notes
        </span>
      )}
      {hasResearch && (
        <span className={badge}>
          <Sparkles size={10} />
          Research
        </span>
      )}
      {linkCount > 0 && (
        <span className={badge}>
          <Link2 size={10} />
          {linkCount} {linkCount === 1 ? "link" : "links"}
        </span>
      )}
    </div>
  );
}

/**
 * Editable indicators for an active todo: inline due-date control (set values
 * render as badges; unset ones as faint hover affordances) plus a read-only
 * recurrence badge. Rendered inline in the row's right-hand action cluster,
 * next to the expand control.
 */
function InlineIndicators({
  dueValue,
  dueLabel,
  isOverdue,
  onDueChange,
  recurrence,
  recurrenceLabel,
  sticky,
  onStickyToggle,
  disabled,
}: {
  dueValue: string | null;
  dueLabel: string | null;
  isOverdue: boolean;
  onDueChange: (date: Date | null) => void;
  recurrence: TodoWithUrls["recurrence"];
  recurrenceLabel: string | null;
  sticky: boolean;
  onStickyToggle: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <InlineDueDate
        value={dueValue}
        label={dueLabel}
        isOverdue={isOverdue}
        onChange={onDueChange}
        disabled={disabled}
      />
      {recurrence && (
        <span className="flex items-center gap-1 rounded-md bg-gray-base px-1.5 py-0.5 text-xs text-gray-muted">
          <Repeat size={10} aria-hidden="true" />
          {recurrenceLabel}
        </span>
      )}
      <Button
        variant="ghost"
        size="xs"
        shape="square"
        type="button"
        onClick={onStickyToggle}
        disabled={disabled}
        aria-label={sticky ? "Unpin todo" : "Pin todo to top"}
        aria-pressed={sticky}
        className={
          sticky
            ? "text-gray hover:bg-gray-base"
            : "text-gray-muted hover:bg-gray-base"
        }
      >
        {sticky ? <Pin size={14} /> : <PinOff size={14} />}
      </Button>
    </div>
  );
}

function TodoItemContent({
  todo,
  subtasks,
  isExpanded,
  onToggle,
  onToggleExpand,
  onDelete,
  onInlineUpdate,
  updatePending,
  deletePending,
  showActions = true,
}: TodoItemProps & { showActions?: boolean }) {
  const { timeZone } = useHints();
  // A repeat completed today reads as done (checkbox, strike-through) until the
  // user's local midnight, even though `completed` stays false in the DB.
  const isCompleted = isEffectivelyCompleted(todo, timeZone, new Date());
  // A todo that is essentially just a captured URL renders the fetched page
  // title as its main line instead of the "Check {domain}" placeholder — for
  // completed rows too, so the title stays consistent after completion. Active
  // rows also get the URL as a subtitle; completed rows stay terse (the URL is
  // summarized by the link badge below). Removing the preview (showPreview =
  // false) collapses it back to just the URL.
  const urlOnly = getUrlOnlyUrl(todo);
  const previewTitle = urlOnly?.showPreview
    ? getFetchedPreviewTitle(urlOnly)
    : null;
  // Active URL-only rows with a fetched title render as a single hoverable card
  // (favicon + title + description + URL) instead of an inline title line, for
  // consistency with the URL card in the expanded editor. Completed rows stay
  // terse, so they keep the inline title treatment below.
  const showUrlOnlyCard = !isCompleted && !!urlOnly && !!previewTitle;
  const now = Date.now();
  const aiProcessing =
    (todo.aiStatus === "pending" || todo.aiStatus === "processing") &&
    now - new Date(todo.createdAt).getTime() < STALE_AI_MS;
  const researchPending =
    todo.research?.status === "pending" &&
    now - new Date(todo.research.createdAt).getTime() < STALE_RESEARCH_MS;
  const hasPendingSuggestions = todo.suggestions.some(
    (s) => s.status === "pending",
  );
  // Skip the inline title line entirely for a URL-only card with no status
  // badges, so the card sits flush at the top of the row. space-y-1 then only
  // adds a gap when the title line is actually present.
  const showTitleLine =
    !showUrlOnlyCard ||
    subtasks.length > 0 ||
    aiProcessing ||
    researchPending ||
    !!todo.needsInput ||
    hasPendingSuggestions;

  // Inline due-date editing on active rows. Set values render as editable
  // badges (bottom-left); the quick-add affordances for unset values live in
  // the right-side hover cluster. Recurrence stays read-only inline (its
  // anchor logic belongs in the expanded form).
  const dueDateObj = todo.dueDate ? new Date(todo.dueDate) : null;
  const dueValueStr = dueDateObj
    ? dueDateObj.toISOString().split("T")[0]
    : null;
  const dueLabel = dueDateObj ? formatDate(dueDateObj, timeZone) : null;
  const isOverdue = !!dueDateObj && dueDateObj < new Date() && !isCompleted;
  const hasRecurrence = !!todo.recurrence;
  const showInlineEditing = !isCompleted;

  const handleInlineDueDate = (date: Date | null) => {
    // Clearing a due date also clears any recurrence — a repeat has no anchor
    // without a due date. Setting/changing a date leaves recurrence untouched.
    if (date === null && hasRecurrence) {
      onInlineUpdate(todo.id, { dueDate: null, recurrence: null });
    } else {
      onInlineUpdate(todo.id, { dueDate: date });
    }
  };

  // Non-destructive, instantly reversible — toggle directly, no confirm step.
  const handleStickyToggle = () => {
    onInlineUpdate(todo.id, { sticky: !todo.sticky });
  };

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
        <div className="space-y-1">
          {showTitleLine && (
            <div className="flex items-center gap-2">
              {!showUrlOnlyCard && (
                <p
                  className={`min-w-0 leading-snug wrap-anywhere ${
                    isCompleted
                      ? "text-xs line-through text-gray-muted"
                      : "text-sm text-gray"
                  }`}
                >
                  {urlOnly ? (
                    previewTitle ? (
                      previewTitle
                    ) : (
                      <LinkifiedText text={urlOnly.url} />
                    )
                  ) : (
                    <LinkifiedText text={todo.title} />
                  )}
                </p>
              )}
              {subtasks.length > 0 &&
                (() => {
                  const doneSubtasks = subtasks.filter(
                    (s) => s.completed,
                  ).length;
                  return (
                    <span
                      role="img"
                      className="flex shrink-0 items-center gap-1 rounded-md bg-gray-base px-1.5 py-0.5 text-xs tabular-nums text-gray-muted"
                      aria-label={`${doneSubtasks} of ${subtasks.length} subtasks complete`}
                    >
                      <ListTree size={10} aria-hidden="true" />
                      {doneSubtasks}/{subtasks.length}
                    </span>
                  );
                })()}
              {aiProcessing && (
                <output
                  className="flex items-center gap-1 text-gray-muted text-xs"
                  aria-label="AI is processing"
                >
                  <Loader size="sm" className="text-gray-muted" />
                </output>
              )}
              {researchPending && (
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
              {hasPendingSuggestions && (
                <button
                  type="button"
                  onClick={() => onToggleExpand(todo.id)}
                  aria-label="AI has suggestions — open to review"
                  className="flex shrink-0 items-center justify-center p-1"
                >
                  <span
                    className="block size-2 rounded-full bg-yellow-8 dark:bg-yellowdark-8"
                    aria-hidden="true"
                  />
                </button>
              )}
            </div>
          )}
          {showUrlOnlyCard && urlOnly && <UrlPreviewCard url={urlOnly} />}
        </div>
        {isCompleted && (
          <p className="text-xs text-gray-muted mt-0.5">
            Completed:{" "}
            {formatDate(todo.completedAt ?? todo.updatedAt, timeZone, {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}
          </p>
        )}
        {isCompleted ? (
          <CompletedContentBadges todo={todo} />
        ) : (
          <>
            {!isExpanded &&
              todo.research?.status === "completed" &&
              todo.research.summary && (
                <p className="text-xs text-gray-muted mt-1.5 line-clamp-2 leading-relaxed">
                  {todo.research.summary.replace(/\[\d+\]/g, "")}
                </p>
              )}
            {!urlOnly &&
              todo.urls &&
              (() => {
                const nonResearchUrls = todo.urls.filter(
                  (url) => !url.researchId,
                );
                if (nonResearchUrls.length === 0) return null;
                const overflow = nonResearchUrls.length - 2;
                return (
                  <div className="flex flex-col gap-1 mt-1.5">
                    {nonResearchUrls.slice(0, 2).map((url) => (
                      <UrlPreviewCard key={url.id} url={url} />
                    ))}
                    {overflow > 0 && (
                      <span className="text-xs text-gray-muted">
                        +{overflow} {overflow === 1 ? "link" : "links"}
                      </span>
                    )}
                  </div>
                );
              })()}
          </>
        )}
        {/* Active rows edit due date inline in the right-hand cluster; only
            completed rows keep the read-only indicators below the title. */}
        {!showInlineEditing && <TodoIndicators todo={todo} />}
      </div>
      {/* Actions are hidden in the drag overlay clone so the lifted card
          hugs the title instead of stretching to the taller control. */}
      {showActions && (
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Inline due-date control sits on one line with the expand
              control. Hidden when expanded — the expanded form has its own
              full editors. */}
          {showInlineEditing && !isExpanded && (
            <InlineIndicators
              dueValue={dueValueStr}
              dueLabel={dueLabel}
              isOverdue={isOverdue}
              onDueChange={handleInlineDueDate}
              recurrence={todo.recurrence}
              recurrenceLabel={
                todo.recurrence
                  ? recurrenceLabel(todo.recurrence, dueDateObj, timeZone)
                  : null
              }
              sticky={todo.sticky}
              onStickyToggle={handleStickyToggle}
              disabled={updatePending}
            />
          )}
          {/* Desktop: row-level delete, next to the priority/date icons.
              Mobile keeps delete inside TodoActionsMenu instead of
              duplicating the affordance here. */}
          {showInlineEditing && !isExpanded && (
            <Button
              variant="ghost"
              size="xs"
              shape="square"
              type="button"
              onClick={() => onDelete(todo.id)}
              disabled={deletePending}
              aria-label={`Delete "${todo.title}"`}
              className="hidden text-gray-muted hover:text-red-muted hover:bg-red-base sm:inline-flex"
            >
              <Trash2 size={14} />
            </Button>
          )}
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
        </div>
      )}
    </div>
  );
}

/** Wrapper that displays expanded todo details. Rendered once at the grid
 * level (TodoGrid) inside a single shared SidePanel — not per column. */
export function ExpandedSection({
  todo,
  subtasks,
  onUpdate,
  onDelete,
  deletePending,
  subtaskHandlers,
}: ExpandedSectionProps) {
  return (
    <TodoItemExpanded
      todo={todo}
      subtasks={subtasks}
      onUpdate={onUpdate}
      onDelete={onDelete}
      deletePending={deletePending}
      onAddSubtask={subtaskHandlers.onAdd}
      onToggleSubtask={subtaskHandlers.onToggle}
      onDeleteSubtask={subtaskHandlers.onDelete}
      onReorderSubtask={subtaskHandlers.onReorder}
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
    }) => void;
    subtaskHandlers: SubtaskHandlers;
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
        // Stays visually selected while its side panel is open, for context.
        !isDragging && props.isExpanded ? "bg-gray-base" : ""
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
      {/* Desktop: expand toggle hangs off the left edge, revealed when the row
          is hovered or any control in it is focused. Styled as a bare icon
          button to match the grip and checkbox rather than a filled box. */}
      {!isDragging && (
        <div className="pointer-events-none absolute left-0 top-2 hidden -translate-x-full sm:block">
          <button
            type="button"
            onClick={() => props.onToggleExpand(props.todo.id)}
            aria-label={
              props.isExpanded ? "Collapse details" : "Expand details"
            }
            className={`pointer-events-auto flex rounded-md p-0.5 text-gray-muted transition-[opacity,color] hover:text-gray sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 ${focusRing}`}
          >
            {props.isExpanded ? (
              <ChevronRight size={16} className="block" />
            ) : (
              <ChevronDown size={16} className="block" />
            )}
          </button>
        </div>
      )}
      <div className="flex items-start">
        <button
          type="button"
          disabled={props.isExpanded}
          className={`mr-1.5 flex rounded-md p-0.5 cursor-grab active:cursor-grabbing text-gray-muted hover:text-gray touch-none select-none [-webkit-touch-callout:none] transition-[transform,opacity,color] active:scale-[0.96] sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 disabled:opacity-50 disabled:cursor-default disabled:hover:text-gray-muted ${focusRing}`}
          aria-label={`Reorder "${props.todo.title}"`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} className="block" />
        </button>
        <div className="flex-1 min-w-0">
          <TodoItemContent {...props} showActions={!isDragging} />
        </div>
      </div>
    </div>
  );
}

export function TodoSkeleton() {
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

export function EmptyState() {
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

export function ErrorState({
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

export interface TodoListColumnProps {
  /** The list this column renders. Every todo in `todos` belongs to it. */
  listId: string;
  /**
   * This list's todos only — top-level rows and their subtasks — already
   * scoped by the caller (TodoGrid). Mirrors the SubtaskSection precedent:
   * this component never filters by `listId` itself.
   */
  todos: TodoWithUrls[];
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  /** Opens the shared (grid-level) delete confirmation for this todo. */
  onRequestDelete: (id: string) => void;
  updateTodo: ReturnType<typeof useUpdateTodo>;
  deleteTodo: ReturnType<typeof useDeleteTodo>;
  createTodo: ReturnType<typeof useCreateTodo>;
  highlightIds: ReadonlySet<string>;
  hiddenIds: ReadonlySet<string>;
  timeZone: string;
  completedCollapsed: boolean;
  /** True once the synced `hideCompleted` preference has loaded (gates the Completed section so it doesn't flash open). */
  hideCompletedKnown: boolean;
  onToggleCompleted: () => void;
  updateUserPending: boolean;
  /** True while a keyboard-initiated drag is in progress anywhere on the board. */
  isKeyboardDragging: boolean;
  /** Mid-drag optimistic order override for this list, or null to use the derived order. */
  localIncompleteTodos: TodoWithUrls[] | null;
}

/**
 * One list's rows: sticky-tier sort, subtasks, URL previews, AI status
 * badges, and the collapsible Completed section. Drag-and-drop *within* this
 * list is driven by dnd-kit hooks here (`useSortable` on each row); the
 * shared `DndContext` those hooks attach to — along with cross-list drop
 * handling, the delete-confirm dialog, and the expanded side panel — lives
 * one level up in `TodoGrid`, since a drag (and only one open panel/dialog)
 * spans every column.
 */
export function TodoListColumn({
  listId,
  todos,
  expandedId,
  onToggleExpand,
  onRequestDelete,
  updateTodo,
  deleteTodo,
  createTodo,
  highlightIds,
  hiddenIds,
  timeZone,
  completedCollapsed,
  hideCompletedKnown,
  onToggleCompleted,
  updateUserPending,
  isKeyboardDragging,
  localIncompleteTodos,
}: TodoListColumnProps) {
  // Registers the whole column as a drop target so a drag can land in empty
  // space (an empty list, or below the last row) and still resolve to this
  // list, not just onto another row.
  const { setNodeRef: setColumnDropRef } = useDroppable({
    id: `column-${listId}`,
  });

  if (todos.length === 0) {
    return <div ref={setColumnDropRef} className="min-h-8" />;
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

  // Inline row edits (due date) go straight through the optimistic
  // updateTodo mutation — no expanded form, no save step.
  const handleInlineUpdate = (id: string, updates: UpdateTodoInput) => {
    updateTodo.mutate({ id, input: updates });
  };

  const handleUpdateExpanded =
    (id: string) =>
    (updates: {
      title?: string;
      notes?: string | null;
      dueDate?: Date | null;
      sticky?: boolean;
    }) => {
      updateTodo.mutate({ id, input: updates });
    };

  // Subtask handlers. Toggling a parent cascades to children server-side (and
  // optimistically in useUpdateTodo); a subtask toggle is a plain flip since a
  // subtask has no children. Delete/reorder reuse the todo mutations — a
  // subtask is a full todo. Subtasks have no independent list membership, so
  // adding one never passes listId — it's implied by the parent (server-side).
  const subtaskHandlers: SubtaskHandlers = {
    onAdd: (parentId, title, position) =>
      createTodo.mutate({ title, parentId, position }),
    onToggle: (id, completed) =>
      updateTodo.mutate({ id, input: { completed: !completed } }),
    onDelete: (id) => deleteTodo.mutate(id),
    onReorder: (id, position) => updateTodo.mutate({ id, input: { position } }),
  };

  // Subtasks live inside their parent's expanded view, not as their own rows.
  // Group children by parent id and render only top-level todos in the list.
  const subtasksByParent = new Map<string, TodoWithUrls[]>();
  for (const t of todos) {
    if (t.parentId) {
      const siblings = subtasksByParent.get(t.parentId) ?? [];
      siblings.push(t);
      subtasksByParent.set(t.parentId, siblings);
    }
  }

  const displayIncompleteTodos =
    localIncompleteTodos ?? getIncompleteOrder(todos, timeZone, hiddenIds);
  const completedTodos = sortTopLevelTodos(todos, timeZone).completed.filter(
    (t) => !hiddenIds.has(t.id),
  );

  const sharedProps = (todo: TodoWithUrls) => ({
    todo,
    subtasks: subtasksByParent.get(todo.id) ?? [],
    isExpanded: expandedId === todo.id,
    onToggle: handleToggle,
    onDelete: onRequestDelete,
    onToggleExpand,
    onInlineUpdate: handleInlineUpdate,
    updatePending: updateTodo.isPending,
    deletePending: deleteTodo.isPending,
  });

  return (
    <div ref={setColumnDropRef}>
      <SortableContext
        id={`list:${listId}`}
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
            subtaskHandlers={subtaskHandlers}
          />
        ))}
      </SortableContext>
      {/* Hold the completed section until the synced `hideCompleted`
          preference is known. Rendering before then would default to expanded
          and flash the completed items open, then collapse them once the
          preference arrives. */}
      {hideCompletedKnown && completedTodos.length > 0 && (
        <div className="mt-2 border-t border-gray-base pt-1">
          <button
            type="button"
            onClick={onToggleCompleted}
            disabled={updateUserPending}
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
              <div
                key={todo.id}
                className={`group rounded-lg py-2 ${
                  expandedId === todo.id ? "bg-gray-base" : ""
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="w-4 shrink-0" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <TodoItemContent {...sharedProps(todo)} />
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
