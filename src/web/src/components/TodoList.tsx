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
  Pin,
  PinOff,
  RefreshCw,
  Repeat,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";
import { InlineDueDate } from "@/components/InlineTodoControls";
import { LinkifiedText } from "@/components/LinkifiedText";
import { TodoItemExpanded } from "@/components/TodoItemExpanded";
import { useHints } from "@/hooks/useHints";
import type {
  useCreateTodo,
  useDeleteTodo,
  useUpdateTodo,
} from "@/hooks/useTodos";
import { formatDate, isEffectivelyCompleted, relativeDay } from "@/lib/date";
import { recurrenceLabel } from "@/lib/recurrence";
import { sortTopLevelTodos } from "@/lib/todoOrder";
import { getFetchedPreviewTitle, getUrlOnlyUrl } from "@/lib/url-display";
import type { TodoWithUrls, UpdateTodoInput } from "@/types/database";
import { Button, Checkbox, focusRing, UrlPreviewCard } from "./ui";

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
 * links — in place of the full previews shown while it's active. Keeps
 * the Completed section terse: a glance tells you what's inside, expand for more.
 */
function CompletedContentBadges({ todo }: { todo: TodoWithUrls }) {
  const hasNotes = !!todo.notes?.trim();
  const linkCount = todo.urls?.length ?? 0;

  if (!hasNotes && linkCount === 0) return null;

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
  // Active URL-only rows always render as a single hoverable card (favicon +
  // title + description + URL), for consistency with the URL card in the
  // expanded editor — UrlPreviewCard has its own loading/failed/raw-URL
  // states, so there's no need to gate this on a title having fetched yet.
  // Completed rows stay terse, so they keep the inline title treatment below.
  const showUrlOnlyCard = !isCompleted && !!urlOnly;
  // Notes are only visible once a row is expanded, so an active row carrying
  // one gets a quiet inline mark to say there's something to open. Completed
  // rows already spell it out in CompletedContentBadges.
  const hasNotes = !!todo.notes?.trim();
  // Skip the inline title line entirely for a URL-only card with no status
  // badges, so the card sits flush at the top of the row. space-y-1 then only
  // adds a gap when the title line is actually present.
  const showTitleLine =
    !showUrlOnlyCard || subtasks.length > 0 || (hasNotes && !isCompleted);

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

  // Shared between the desktop hover pill and the always-visible mobile row
  // below — same controls, just different containers.
  const rowActions = (
    <>
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
      {showInlineEditing && (
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
      {showInlineEditing && (
        <Button
          variant="ghost"
          size="xs"
          shape="square"
          type="button"
          onClick={() => onDelete(todo.id)}
          disabled={deletePending}
          aria-label={`Delete "${todo.title}"`}
          className="text-gray-muted hover:text-red-muted hover:bg-red-base"
        >
          <Trash2 size={14} />
        </Button>
      )}
    </>
  );

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
        <div className="flex-1 min-w-0">
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
                {hasNotes && !isCompleted && (
                  <span
                    role="img"
                    className="ml-2 inline-flex shrink-0 align-middle text-gray-muted"
                    aria-label="Has notes"
                  >
                    <FileText size={12} aria-hidden="true" />
                  </span>
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
            !urlOnly &&
            todo.urls &&
            (() => {
              const urls = todo.urls;
              if (urls.length === 0) return null;
              const overflow = urls.length - 2;
              return (
                <div className="flex flex-col gap-1 mt-1.5">
                  {urls.slice(0, 2).map((url) => (
                    <UrlPreviewCard key={url.id} url={url} />
                  ))}
                  {overflow > 0 && (
                    <span className="text-xs text-gray-muted">
                      +{overflow} {overflow === 1 ? "link" : "links"}
                    </span>
                  )}
                </div>
              );
            })()
          )}
          {/* Active rows edit due date inline in the right-hand cluster; only
              completed rows keep the read-only indicators below the title. */}
          {!showInlineEditing && <TodoIndicators todo={todo} />}
        </div>
      </div>
      {/* Desktop: actions float as a pill over the row instead of reserving
          their own line — it stays put when it's carrying real state (due
          date, recurrence, pin) and is otherwise a hover/focus affordance.
          Touch has no hover, so mobile gets its own always-visible row
          below instead of this floating pill. */}
      {showActions && (
        <div
          className={`absolute right-1 top-1 z-10 hidden items-center gap-0.5 rounded-full bg-gray-surface/95 px-1 py-0.5 shadow-sm ring-1 ring-gray-subtle backdrop-blur-sm transition-opacity sm:flex ${
            hasVisiblePillState
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          }`}
        >
          {rowActions}
        </div>
      )}
      {/* Touch: same actions as the desktop pill, always visible as a row
          below the content instead of a hover-revealed overlay. */}
      {showActions && (
        <div className="flex items-center gap-0.5 sm:hidden">{rowActions}</div>
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

/**
 * The reorder grip's box, as far as layout is concerned. Below `sm` the grip is
 * in the row's flow and takes ~26px of width off the content; at `sm` it hangs
 * out of the flow instead, off the row's left edge. A drag stand-in has to
 * reserve the same box or its hidden sizing copy measures against a wider
 * content box than the real row did — and a title near its wrap threshold then
 * makes the outline a line taller than the row it stands in for. Shared so the
 * two can't drift; the grip button adds its own non-layout classes on top.
 */
const GRIP_BOX_CLASS =
  "mr-1.5 flex rounded-md p-0.5 sm:absolute sm:left-0 sm:top-3.5 sm:mr-0 sm:-translate-x-full";

/**
 * A row's content in exactly the layout the real row gives it, grip box
 * included. Only ever rendered hidden, as the thing a stand-in takes its size
 * from — see `RowGhost`.
 */
function GhostRowContent(props: TodoItemProps) {
  return (
    <div className="flex items-start">
      <span aria-hidden="true" className={GRIP_BOX_CLASS}>
        <GripVertical size={16} className="block" />
      </span>
      <div className="flex-1 min-w-0">
        <TodoItemContent {...props} />
      </div>
    </div>
  );
}

/**
 * The dashed outline drawn over a row that's mid-drag, plus the solid brand
 * line marking the insertion point along its leading edge.
 *
 * The space it fills comes from `children` — a hidden copy of the row's own
 * content — rather than a measured height. That's deliberate: with a
 * `DragOverlay` mounted, dnd-kit's `active.rect` describes the floating
 * overlay, not the row, and there's nothing to measure at all in a column the
 * row hasn't reached yet. Laying the outline over the real content instead
 * makes "exactly the size of the item" true by construction in both places.
 */
function RowGhost({
  children,
  variant = "target",
  ring = false,
}: {
  children: ReactNode;
  /**
   * `target` is the slot the row will land in — brand-tinted, with the
   * insertion line. `origin` is the space it vacated in a column it's on its
   * way out of: neutral, and without a line, since nothing lands there.
   */
  variant?: "target" | "origin";
  /** Keyboard drags get a stronger outline — there's no pointer to follow. */
  ring?: boolean;
}) {
  return (
    <>
      <div aria-hidden="true" className="invisible">
        {children}
      </div>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 rounded-lg border border-dashed ${
          variant === "target"
            ? "border-accent-strong bg-accent-base/60"
            : "border-gray-strong bg-gray-base/40"
        } ${ring ? "ring-2 ring-accent-strong" : ""}`}
      >
        {variant === "target" && (
          <span className="absolute inset-x-0 -top-px h-0.5 rounded-full bg-accent-solid" />
        )}
      </span>
    </>
  );
}

/**
 * A standalone stand-in for a row that isn't in this column yet: the slot a
 * cross-column drag will land in. `SortableTodoItem` draws the same thing
 * inside the row the drag lifted, so both columns show the same shape.
 */
export function TodoRowGhost(props: TodoItemProps) {
  return (
    <div className="relative rounded-lg py-3">
      <RowGhost>
        <GhostRowContent {...props} />
      </RowGhost>
    </div>
  );
}

function SortableTodoItem(
  props: TodoItemProps & {
    isKeyboardDragging: boolean;
    /** True while this row is being dragged toward a different list — its
     * stand-in stays put and goes neutral, because the slot it's headed for is
     * shown in that other column instead. */
    isLeavingList: boolean;
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
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
    activeIndex,
    over,
    overIndex,
    rect,
  } = useSortable({ id: props.todo.id, disabled: props.isExpanded });

  // Rows reflow to open a gap at the target so it's clear where the item lands.
  // No transition — rows (and the placeholder) snap into place instead of
  // sliding, which is what kept the drop cue from feeling static. Translate
  // only, no scaleY, so variable-height rows never squish or stretch.
  //
  // The dragged row never follows the pointer — a DragOverlay (rendered in
  // TodoGrid) does that, so the moving card isn't clipped by the column's
  // overflow-y-auto scroller. What's left here is the row's stand-in, and it
  // *is* translated: by the offset that puts it in the gap the reflow just
  // opened, so the dashed outline marks the destination rather than sitting
  // back at the origin behind the rows that shifted over it.
  //
  // Every row between origin and target shifts by exactly the dragged row's
  // height, so the gap lines up with the far edge of the row being hovered:
  // its bottom when moving down, its top when moving up. `rect` and
  // `over.rect` are both droppable rects, measured when the drag started and
  // before any transform was applied, so their difference is the plain layout
  // offset — which is what a transform needs. (`active.rect` is *not* the row:
  // with a DragOverlay mounted it describes the floating overlay instead.)
  const draggedRect = rect.current;
  const gapShift = (() => {
    if (!isDragging || props.isLeavingList) return 0;
    if (!over || !draggedRect || overIndex === -1) return 0;
    if (overIndex === activeIndex) return 0;
    return overIndex > activeIndex
      ? over.rect.top +
          over.rect.height -
          (draggedRect.top + draggedRect.height)
      : over.rect.top - draggedRect.top;
  })();

  const style = {
    transform: isDragging
      ? gapShift
        ? `translate3d(0, ${gapShift}px, 0)`
        : undefined
      : CSS.Translate.toString(transform),
  };

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
      {isDragging ? (
        // The row's visible content moves to the DragOverlay (see
        // TodoRowPreview in TodoGrid) so the card that follows the pointer
        // isn't clipped by this column's overflow-y-auto scroller. What stays
        // here is a hidden copy of that content — holding the row's exact
        // space — under the dashed outline.
        //
        // The grip button stays mounted (just visually hidden) rather than
        // unmounted: it's the node that holds keyboard focus when a
        // keyboard drag starts, and dnd-kit's KeyboardSensor keeps driving
        // the drag from it via document-level listeners — unmounting it
        // would drop focus to <body> for the rest of the drag.
        <>
          <RowGhost
            variant={props.isLeavingList ? "origin" : "target"}
            ring={props.isKeyboardDragging && !props.isLeavingList}
          >
            <GhostRowContent {...props} />
          </RowGhost>
          <button
            type="button"
            disabled={props.isExpanded}
            className="absolute h-px w-px overflow-hidden opacity-0"
            aria-label={`Reorder "${props.todo.title}"`}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={16} />
          </button>
        </>
      ) : (
        <div className="flex items-start">
          {/* Reorder grip: inline on mobile; on desktop it hangs off the left
              edge (out of the row's flow) so checkboxes sit flush with the
              column title, per the design. Hover-revealed either way. */}
          <button
            type="button"
            disabled={props.isExpanded}
            className={`${GRIP_BOX_CLASS} cursor-grab active:cursor-grabbing text-gray-muted hover:text-gray touch-none select-none [-webkit-touch-callout:none] transition-[transform,opacity,color] active:scale-[0.96] sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 disabled:opacity-50 disabled:cursor-default disabled:hover:text-gray-muted ${focusRing}`}
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
  /**
   * Set only on the column a cross-list drag is currently over: where the
   * dragged row will land (an index into this column's displayed order) and
   * the stand-in to show there — a `TodoRowGhost` built by TodoGrid, which is
   * the only place that knows which row is being dragged.
   */
  crossListDrop: { index: number; ghost: ReactNode } | null;
  /** True while one of *this* list's rows is being dragged toward another list. */
  isLeavingList: boolean;
}

/**
 * One list's rows: sticky-tier sort, subtasks, URL previews. Completed todos
 * across every list render in their own aggregate
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
  crossListDrop,
  isLeavingList,
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
    return (
      <div ref={setColumnDropRef} className="h-full min-h-24">
        {crossListDrop?.ghost}
      </div>
    );
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

  const rows: ReactNode[] = displayIncompleteTodos.map((todo) => (
    <SortableTodoItem
      key={todo.id}
      {...sharedProps(todo)}
      isKeyboardDragging={isKeyboardDragging}
      isLeavingList={isLeavingList}
      highlighted={highlightIds.has(todo.id)}
      onUpdateExpanded={handleUpdateExpanded(todo.id)}
      subtaskHandlers={subtaskHandlers}
    />
  ));

  // A cross-list drag lands at the top of its own tier here (see
  // TodoGrid.handleDragEnd), so the stand-in goes in at that index rather than
  // under the pointer — it shows where the row will actually end up.
  if (crossListDrop) {
    rows.splice(crossListDrop.index, 0, crossListDrop.ghost);
  }

  return (
    <div ref={setColumnDropRef}>
      <SortableContext
        id={`list:${listId}`}
        items={displayIncompleteTodos.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        {rows}
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
