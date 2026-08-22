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
  recurrence,
  recurrenceLabel,
  sticky,
  onStickyToggle,
  disabled,
}: {
  recurrence: TodoWithUrls["recurrence"];
  recurrenceLabel: string | null;
  sticky: boolean;
  onStickyToggle: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {recurrence && (
        <span className="flex items-center gap-1 rounded-md bg-gray-base px-1.5 py-0.5 text-xs text-gray-muted">
          <Repeat size={10} aria-hidden="true" />
          {recurrenceLabel}
        </span>
      )}
      {/* A pinned todo keeps its pin visible (it's state, not just an
          action); the pin affordance on unpinned rows is hover-revealed like
          the rest of the row's quiet controls. */}
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
            : "text-gray-muted hover:bg-gray-base sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
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
  // The actions pill floats over the row instead of reserving its own line —
  // it stays visible when it's carrying real state (recurrence or pin), and
  // is otherwise a hover/focus affordance on desktop (always visible on
  // touch, where hover doesn't exist). Due date lives inline with the title
  // instead, so it doesn't force the pill open.
  const hasVisiblePillState = hasRecurrence || !!todo.sticky;

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
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start gap-3">
        <div className="mt-[3px]">
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
        <div className={`flex-1 min-w-0 ${showActions ? "pr-20" : ""}`}>
          <div className="space-y-1">
            {showTitleLine && (
              <div>
                {!showUrlOnlyCard && (
                  <p
                    className={`inline leading-snug wrap-anywhere ${
                      isCompleted
                        ? "text-sm line-through text-gray-placeholder"
                        : "text-[15px] font-semibold text-gray"
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
                {showInlineEditing && (
                  <InlineDueDate
                    value={dueValueStr}
                    label={dueLabel}
                    isOverdue={isOverdue}
                    onChange={handleInlineDueDate}
                    disabled={updatePending}
                    className="ml-2 align-middle"
                  />
                )}
                {subtasks.length > 0 &&
                  (() => {
                    const doneSubtasks = subtasks.filter(
                      (s) => s.completed,
                    ).length;
                    return (
                      <span
                        role="img"
                        className="ml-2 inline-flex shrink-0 items-center gap-1 rounded-md bg-gray-base px-1.5 py-0.5 align-middle text-xs tabular-nums text-gray-muted"
                        aria-label={`${doneSubtasks} of ${subtasks.length} subtasks complete`}
                      >
                        <ListTree size={10} aria-hidden="true" />
                        {doneSubtasks}/{subtasks.length}
                      </span>
                    );
                  })()}
                {aiProcessing && (
                  <output
                    className="ml-2 inline-flex items-center gap-1 align-middle text-gray-muted text-xs"
                    aria-label="AI is processing"
                  >
                    <Loader size="sm" className="text-gray-muted" />
                  </output>
                )}
                {researchPending && (
                  <output
                    className="ml-2 inline-flex items-center gap-1 align-middle text-gray-muted text-xs"
                    aria-label="Researching"
                  >
                    <Loader size="sm" className="text-accent-muted" />
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
                    className="ml-2 inline-flex align-middle bg-accent-base hover:bg-accent-hover text-accent"
                  >
                    <MessageCircle size={12} />
                  </Button>
                )}
                {hasPendingSuggestions && (
                  <button
                    type="button"
                    onClick={() => onToggleExpand(todo.id)}
                    aria-label="AI has suggestions — open to review"
                    className="ml-2 inline-flex shrink-0 items-center justify-center p-1 align-middle"
                  >
                    <span
                      className="block size-2 rounded-full bg-accent-solid"
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
                  <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-pretty text-gray-muted">
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
      </div>
      {/* Actions float as a pill over the row instead of reserving their own
          line — it stays put when it's carrying real state (due date,
          recurrence, pin) and is otherwise a hover/focus affordance on
          desktop (always visible on touch, where there's no hover). */}
      {showActions && (
        <div
          className={`absolute right-1 top-1 z-10 flex items-center gap-0.5 rounded-full bg-gray-surface/95 px-1 py-0.5 shadow-sm ring-1 ring-gray-subtle backdrop-blur-sm transition-opacity ${
            hasVisiblePillState
              ? "opacity-100"
              : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
          }`}
        >
          {/* Opens the details panel — the title itself is now a plain,
              linkified text line so URLs inside it stay clickable. */}
          <Button
            variant="ghost"
            size="xs"
            shape="square"
            type="button"
            onClick={() => onToggleExpand(todo.id)}
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? "Collapse" : "Expand"} "${todo.title}" details`}
            className="text-gray-muted hover:text-gray"
          >
            <ChevronRight size={14} />
          </Button>
          {/* Hidden once expanded — the expanded form has its own full
              editors. */}
          {showInlineEditing && !isExpanded && (
            <InlineIndicators
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
          {/* Mobile: popover actions menu. */}
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
  // so variable-height rows never squish or stretch. The dragged row itself
  // never moves via transform — a DragOverlay (rendered in TodoGrid) tracks
  // the pointer instead, so it isn't clipped by this row's column's
  // overflow-y-auto scroller. Applying transform here too would just repeat
  // that motion on a node still confined to the source column's box.
  const style = {
    transform: isDragging ? undefined : CSS.Translate.toString(transform),
  };

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
      className={`group relative rounded-lg py-3 transition-colors duration-1000 ease-out ${
        // Freshly imported rows glow briefly, then the tint transitions out
        // once the highlight clears — a gentle "these are new" cue.
        !isDragging && props.highlighted ? "bg-accent-base" : ""
      } ${
        // Stays visually selected while its side panel is open, for context.
        !isDragging && props.isExpanded ? "bg-gray-base" : ""
      }`}
    >
      {/* Drop line is for pointer drags; keyboard drags use the ghost's own
          accent border to show the destination, so the line is redundant. */}
      {(lineAbove || lineBelow) && !props.isKeyboardDragging && (
        <span
          aria-hidden="true"
          style={{ transform: `translateY(${lineShift}px)` }}
          className={`pointer-events-none absolute inset-x-0 h-0.5 rounded-full bg-accent-solid ${
            lineAbove ? "top-0" : "bottom-0"
          }`}
        />
      )}
      {isDragging ? (
        // The real content moves to the DragOverlay (see TodoRowPreview in
        // TodoGrid) so it isn't clipped by this column's overflow-y-auto
        // scroller. This row just holds its own space as a ghost — fixed to
        // its pre-drag height so nothing jumps when the drag starts/ends.
        <div
          style={{ height: draggedHeight || undefined }}
          className={`rounded-lg border border-dashed bg-gray-base/40 ${
            props.isKeyboardDragging
              ? "border-accent-strong ring-2 ring-accent-strong"
              : "border-gray-strong"
          }`}
        />
      ) : (
        <div className="flex items-start">
          {/* Reorder grip: inline on mobile; on desktop it hangs off the left
              edge (out of the row's flow) so checkboxes sit flush with the
              column title, per the design. Hover-revealed either way. */}
          <button
            type="button"
            disabled={props.isExpanded}
            className={`mr-1.5 flex rounded-md p-0.5 cursor-grab active:cursor-grabbing text-gray-muted hover:text-gray touch-none select-none [-webkit-touch-callout:none] transition-[transform,opacity,color] active:scale-[0.96] sm:absolute sm:left-0 sm:top-3.5 sm:mr-0 sm:-translate-x-full sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 disabled:opacity-50 disabled:cursor-default disabled:hover:text-gray-muted ${focusRing}`}
            aria-label={`Reorder "${props.todo.title}"`}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={16} className="block" />
          </button>
          <div className="flex-1 min-w-0">
            <TodoItemContent {...props} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The floating preview rendered inside dnd-kit's `DragOverlay` (in TodoGrid)
 * while a row is being dragged — the moving visual the user actually tracks
 * with their pointer. Portaled to `document.body` by `DragOverlay`, so
 * (unlike the origin row) it's never clipped by a column's overflow-y-auto
 * scroller. `width` is pinned to the origin row's own width since the
 * overlay isn't constrained by a column once portaled.
 */
export function TodoRowPreview(
  props: TodoItemProps & { width: number | undefined },
) {
  return (
    <div
      style={{ width: props.width }}
      className="pointer-events-none cursor-grabbing rounded-xl bg-gray-surface/80 px-3 py-3 shadow-xl ring-1 ring-gray-subtle backdrop-blur-sm"
    >
      <div className="flex items-start">
        <div className="flex-1 min-w-0">
          <TodoItemContent {...props} showActions={false} />
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
  /** True while a keyboard-initiated drag is in progress anywhere on the board. */
  isKeyboardDragging: boolean;
  /** Mid-drag optimistic order override for this list, or null to use the derived order. */
  localIncompleteTodos: TodoWithUrls[] | null;
}

/**
 * One list's rows: sticky-tier sort, subtasks, URL previews, AI status
 * badges. Completed todos across every list render in their own aggregate
 * `CompletedColumn` instead of an inline accordion here. Drag-and-drop
 * *within* this list is driven by dnd-kit hooks here (`useSortable` on each row); the
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
    // Fills the column so a cross-list drag can drop anywhere in the empty
    // space, not just a sliver under the title.
    return <div ref={setColumnDropRef} className="h-full min-h-24" />;
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
    </div>
  );
}

export interface CompletedColumnProps {
  /** Every completed, top-level todo across every list — already
   * hidden-filtered and sorted (most recently completed first) by the
   * caller (TodoGrid, via `sortTopLevelTodos`). */
  completedTodos: TodoWithUrls[];
  /** All todos (any list, any completion state) — used to look up subtasks
   * for a completed row's expanded badges. */
  allTodos: TodoWithUrls[];
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onRequestDelete: (id: string) => void;
  updateTodo: ReturnType<typeof useUpdateTodo>;
  deleteTodo: ReturnType<typeof useDeleteTodo>;
  /** Un-completes a todo, restoring it to the end of its own list's
   * incomplete order (or rolling back a stamped recurrence) — the same
   * logic the old per-list accordion used, now computed once at the grid
   * level since this column spans every list. */
  onUncomplete: (todo: TodoWithUrls) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** True once the synced `hideCompleted` preference has loaded (gates this
   * column so it doesn't flash open before the collapsed default is known). */
  known: boolean;
}

/**
 * Aggregate "Completed" column: every completed todo across every list, in
 * one place, instead of a collapsible section duplicated inside each list's
 * own column. Collapsed by default when the synced `hideCompleted`
 * preference says so; toggling it is local to this session, matching the
 * old per-list accordion's behavior (never synced back to the preference).
 */
export function CompletedColumn({
  completedTodos,
  allTodos,
  expandedId,
  onToggleExpand,
  onRequestDelete,
  updateTodo,
  deleteTodo,
  onUncomplete,
  collapsed,
  onToggleCollapsed,
  known,
}: CompletedColumnProps) {
  const subtasksByParent = new Map<string, TodoWithUrls[]>();
  for (const t of allTodos) {
    if (t.parentId) {
      const siblings = subtasksByParent.get(t.parentId) ?? [];
      siblings.push(t);
      subtasksByParent.set(t.parentId, siblings);
    }
  }

  // Hold the whole column until the synced `hideCompleted` preference is
  // known — rendering before then would default to expanded and flash the
  // completed items open, then collapse once the preference arrives.
  if (!known || completedTodos.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? "Show" : "Hide"} completed items`}
        className="flex min-h-10 w-full items-center gap-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider text-gray-muted transition-colors hover:text-gray focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong"
      >
        <ChevronRight
          size={14}
          aria-hidden="true"
          className={`shrink-0 transition-transform ${
            collapsed ? "" : "rotate-90"
          }`}
        />
        <span>
          {collapsed
            ? `View completed (${completedTodos.length} ${
                completedTodos.length === 1 ? "item" : "items"
              })`
            : "Hide completed"}
        </span>
      </button>
      {!collapsed &&
        completedTodos.map((todo) => (
          <div
            key={todo.id}
            className={`group rounded-lg py-2 ${
              expandedId === todo.id ? "bg-gray-base" : ""
            }`}
          >
            <div className="flex items-start gap-2">
              {/* Mobile-only spacer matching the active rows' inline grip
                  width; on desktop the grip hangs in the margin, so
                  completed rows are already flush. */}
              <div className="w-4 shrink-0 sm:hidden" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <TodoItemContent
                  todo={todo}
                  subtasks={subtasksByParent.get(todo.id) ?? []}
                  isExpanded={expandedId === todo.id}
                  onToggle={() => onUncomplete(todo)}
                  onDelete={onRequestDelete}
                  onToggleExpand={onToggleExpand}
                  onInlineUpdate={() => {}}
                  updatePending={updateTodo.isPending}
                  deletePending={deleteTodo.isPending}
                />
              </div>
            </div>
          </div>
        ))}
    </div>
  );
}
