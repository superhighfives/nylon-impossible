import {
  type CollisionDetection,
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  type DropAnimation,
  defaultDropAnimationSideEffects,
  getFirstCollision,
  type KeyboardCoordinateGetter,
  KeyboardSensor,
  MeasuringStrategy,
  type Modifier,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { splitTodoText } from "@nylon-impossible/shared";
import { previousDueDate } from "@nylon-impossible/shared/recurrence";
import { generateKeyBetween } from "fractional-indexing";
import { GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
  type WheelEvent,
} from "react";
import { EditableSidePanelTitle } from "@/components/EditableSidePanelTitle";
import {
  CompletedColumn,
  ErrorState,
  ExpandedSection,
  getIncompleteOrder,
  TodoListColumn,
  TodoRowPreview,
  TodoSkeleton,
} from "@/components/TodoList";
import { useHints } from "@/hooks/useHints";
import {
  useCreateList,
  useDeleteList,
  useLists,
  useUpdateList,
} from "@/hooks/useLists";
import { useLocalMidnightTick } from "@/hooks/useLocalMidnightTick";
import {
  useCreateTodo,
  useDeleteTodo,
  useTodos,
  useUpdateTodo,
} from "@/hooks/useTodos";
import { useUser } from "@/hooks/useUser";
import { insertInTier, positionAt } from "@/lib/dragOrder";
import { messageFromError, toast } from "@/lib/toast";
import { sortTopLevelTodos } from "@/lib/todoOrder";
import type {
  SerializedList,
  TodoWithUrls,
  UpdateTodoInput,
} from "@/types/database";
import { Button, ConfirmDialog, focusRing, Input, SidePanel } from "./ui";

const HORIZONTAL_DRAG_DEAD_ZONE = 12;

// Pointer drags ignore a few px of incidental sideways jitter so ordinary
// in-column reordering feels vertical-only; past that the overlay follows the
// pointer so it can travel into another column. Keyboard drags are left
// alone — their coordinates come from `boardKeyboardCoordinates`, which keeps
// x fixed for up/down and jumps it for left/right.
const pointerDeadZone =
  (isKeyboardDragging: boolean): Modifier =>
  ({ transform }) => {
    if (isKeyboardDragging) return transform;
    if (Math.abs(transform.x) < HORIZONTAL_DRAG_DEAD_ZONE) {
      return { ...transform, x: 0 };
    }
    return transform;
  };

// Rows move between columns mid-drag, so droppable rects must be re-measured
// continuously rather than once at drag start.
const DROPPABLE_MEASURING = {
  droppable: { strategy: MeasuringStrategy.Always },
};

// The overlay settles into the row's slot with the same strong ease-out used
// elsewhere, rather than dnd-kit's default linear-ish curve.
const DROP_ANIMATION: DropAnimation = {
  duration: 220,
  easing: "cubic-bezier(0.23, 1, 0.32, 1)",
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0.4" } },
  }),
};

// Each list column registers itself as a droppable under this prefix, so a
// drag can resolve to a list even when it's over empty space rather than a row.
const COLUMN_DROP_PREFIX = "column-";

// Keyboard drags: up/down step to the next row in the same column; left/right
// jump to the neighbouring list's column at the same height, where
// handleDragOver moves the row in just as it would for a pointer drag.
const boardKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { context: { active, collisionRect, droppableContainers } },
) => {
  const horizontal = event.code === "ArrowLeft" || event.code === "ArrowRight";
  const vertical = event.code === "ArrowDown" || event.code === "ArrowUp";
  if ((!horizontal && !vertical) || !active || !collisionRect) return undefined;
  event.preventDefault();

  const rows: DOMRect[] = [];
  const columns: DOMRect[] = [];
  for (const container of droppableContainers.getEnabled()) {
    if (!container || container.disabled || container.id === active.id)
      continue;
    const rect = container.node.current?.getBoundingClientRect();
    if (!rect) continue;
    if (String(container.id).startsWith(COLUMN_DROP_PREFIX)) columns.push(rect);
    else rows.push(rect);
  }

  if (horizontal) {
    const centerX = collisionRect.left + collisionRect.width / 2;
    const toRight = event.code === "ArrowRight";
    const column = columns
      .filter((r) => {
        const x = r.left + r.width / 2;
        return toRight ? x > centerX + 1 : x < centerX - 1;
      })
      .sort((a, b) => (toRight ? a.left - b.left : b.left - a.left))[0];
    if (!column) return undefined;
    const maxTop = Math.max(column.top, column.bottom - collisionRect.height);
    return {
      x: column.left + (column.width - collisionRect.width) / 2,
      y: Math.min(Math.max(collisionRect.top, column.top), maxTop),
    };
  }

  // Only rows in the same column — ones that overlap horizontally.
  const sameColumn = rows.filter(
    (r) => r.right > collisionRect.left && r.left < collisionRect.right,
  );
  const activeTop = collisionRect.top;
  if (event.code === "ArrowDown") {
    const below = sameColumn
      .filter((r) => r.top > activeTop + 1)
      .sort((a, b) => a.top - b.top)[0];
    if (!below) return undefined;
    return { x: collisionRect.left, y: activeTop + below.height };
  }

  const above = sameColumn
    .filter((r) => r.top < activeTop - 1)
    .sort((a, b) => b.top - a.top)[0];
  if (!above) return undefined;
  return { x: collisionRect.left, y: above.top };
};

const SYSTEM_ORDER: Record<string, number> = {
  today: 0,
  thisWeek: 1,
  sometime: 2,
};

/*
 * Editorial board geometry, shared by every column (list columns, the New
 * List column, and the loading/error scaffold) so the full-height hairline
 * rules and the list-title baseline stay aligned across all of them.
 *
 * - Columns are fixed-width and snap-scroll horizontally; on phones a column
 *   fills most of the viewport so the board pages list-by-list.
 * - The title band is a fixed-height spacer with titles set on its bottom
 *   edge — the deep whitespace above them is the design's header zone.
 */
const COLUMN_CLASS =
  "relative flex h-full w-[min(85vw,21rem)] xl:w-[23rem] shrink-0 snap-start scroll-ml-4 flex-col border-l border-gray-subtle px-4 sm:px-6";
const TITLE_BAND_CLASS =
  "flex h-[clamp(6.5rem,24vh,13rem)] shrink-0 items-end pb-5";
const LIST_TITLE_CLASS =
  "font-display text-[1.35rem] font-bold leading-tight tracking-tight";
/** Leading gutter before the first hairline; the logotype floats above it. */
const GUTTER_CLASS = "w-4 shrink-0 sm:w-6 lg:w-10";

/**
 * The board frame minus the columns: full-viewport, horizontally scrollable,
 * snap-paging on narrow screens. Loading/error states reuse it so the shell
 * doesn't jump when data arrives.
 */
function BoardScaffold({
  children,
  scrollRef,
}: {
  children: ReactNode;
  scrollRef?: RefObject<HTMLDivElement | null>;
}) {
  // Rows only fade in once the board has painted — otherwise every row would
  // play its enter animation on page load (see `data-todo-row` in styles.css).
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // overscroll-x-contain stops edge swipes chaining into the page's
  // rubber-band / browser back gesture.
  return (
    <div
      ref={scrollRef}
      data-board-ready={ready ? "" : undefined}
      className="fixed inset-0 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain md:snap-none"
    >
      <div className="flex h-full min-w-max">
        <div aria-hidden className={GUTTER_CLASS} />
        {children}
      </div>
    </div>
  );
}

// The Completed list is a real `lists` row (so it has a stable id/position
// like the other system lists), but it's always rendered last regardless of
// that position — never interleaved by the position-based sort below — and
// is rendered separately from this array's map (see TodoGrid), since its
// contents are a synthesized aggregate, not real todos pointing at its id.
function sortLists(lists: SerializedList[]): SerializedList[] {
  const completed = lists.find((l) => l.systemKind === "completed");
  const rest = lists.filter((l) => l.systemKind !== "completed");
  const sorted = [...rest].sort((a, b) => {
    const aSystem = a.kind === "system";
    const bSystem = b.kind === "system";
    if (aSystem !== bSystem) return aSystem ? -1 : 1;
    if (aSystem && bSystem) {
      return (
        (SYSTEM_ORDER[a.systemKind ?? ""] ?? 0) -
        (SYSTEM_ORDER[b.systemKind ?? ""] ?? 0)
      );
    }
    return a.position.localeCompare(b.position);
  });
  return completed ? [...sorted, completed] : sorted;
}

function NewTodoInline({
  listId,
  firstPosition,
}: {
  listId: string;
  /**
   * Position of the list's current top incomplete todo. Quick-adds insert
   * above it (top of the non-sticky tier), right where this affordance sits —
   * so new rows appear next to the control that created them.
   */
  firstPosition: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const createTodo = useCreateTodo();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const overflowsToNotes = splitTodoText(title).notes !== null;

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    setTitle("");
  };

  const submit = () => {
    if (!title.trim()) {
      close();
      return;
    }
    // Long pastes (a 2KB URL, a copied paragraph) keep their overflow in
    // notes instead of failing the 500-char title limit.
    const { title: todoTitle, notes } = splitTodoText(title);
    createTodo.mutate(
      {
        title: todoTitle,
        notes,
        listId,
        position: generateKeyBetween(null, firstPosition),
      },
      {
        onError: (err) =>
          toast.error(messageFromError(err, "Couldn't add todo")),
      },
    );
    setTitle("");
    inputRef.current?.focus();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`mb-1 flex min-h-9 w-full items-center gap-3 rounded-lg py-2 text-left text-sm text-gray-placeholder transition-[opacity,color] hover:text-gray-muted pointer-fine:opacity-0 pointer-fine:focus-visible:opacity-100 pointer-fine:group-hover/column:opacity-100 pointer-fine:group-focus-within/column:opacity-100 ${focusRing}`}
      >
        <span
          aria-hidden="true"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 border-dashed border-gray-strong"
        >
          <Plus size={12} />
        </span>
        New todo
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="mb-1 flex min-h-9 w-full items-start gap-3 py-1"
    >
      <span
        aria-hidden="true"
        className="mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 border-dashed border-gray-strong"
      >
        <Plus size={12} />
      </span>
      <div className="min-w-0 flex-1">
        {/* Negative margin + matching padding gives the text room inside the
            focus ring while keeping it flush with the row titles below. */}
        <textarea
          ref={inputRef}
          rows={1}
          value={title}
          aria-label="New todo"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => (title.trim() ? submit() : close())}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="New todo"
          className="field-sizing-content -mx-2 block max-h-48 w-[calc(100%+1rem)] resize-none rounded-md bg-transparent px-2 py-1 text-[15px] font-semibold leading-snug text-gray outline-none wrap-anywhere placeholder:font-normal placeholder:text-gray-muted focus-visible:ring-2 focus-visible:ring-accent-strong [@supports(-webkit-touch-callout:none)]:!text-base"
        />
        {overflowsToNotes && (
          <p className="mt-1 text-xs text-gray-muted">
            The rest will be saved to notes.
          </p>
        )}
      </div>
    </form>
  );
}

function ListHeader({
  list,
  isDraggable,
  todoCount,
}: {
  list: SerializedList;
  isDraggable: boolean;
  todoCount: number;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(list.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const updateList = useUpdateList();
  const deleteList = useDeleteList();
  // Only custom lists are sortable — the three system lists (Today/This
  // Week/Sometime) stay fixed first, so this hook is a no-op (no listeners
  // attached, isDragging always false) for them.
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useSortable({ id: list.id, disabled: !isDraggable });
  const style = { transform: CSS.Translate.toString(transform) };

  const commitRename = () => {
    const trimmed = name.trim();
    setRenaming(false);
    if (!trimmed || trimmed === list.name) {
      setName(list.name);
      return;
    }
    updateList.mutate({ id: list.id, input: { name: trimmed } });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group/header flex w-full items-center gap-2 ${isDragging ? "z-10 opacity-70" : ""}`}
    >
      {isDraggable && (
        <button
          type="button"
          aria-label={`Reorder "${list.name}"`}
          className={`relative cursor-grab touch-none select-none text-gray-muted transition-opacity before:absolute before:content-[''] before:-inset-2.5 active:cursor-grabbing pointer-fine:opacity-0 pointer-fine:group-hover/header:opacity-100 pointer-fine:group-focus-within/header:opacity-100 ${focusRing}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>
      )}
      {renaming ? (
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") {
              setName(list.name);
              setRenaming(false);
            }
          }}
          inputSize="sm"
          ringOffset="app"
          className="flex-1 font-display font-bold"
        />
      ) : (
        <h2 className={`${LIST_TITLE_CLASS} min-w-0 flex-1 truncate text-gray`}>
          {list.name}
        </h2>
      )}
      {list.kind === "custom" && !renaming && (
        <div className="flex items-center gap-0.5 transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover/header:opacity-100 pointer-fine:group-focus-within/header:opacity-100">
          <Button
            variant="ghost"
            size="xs"
            shape="square"
            ringOffset="app"
            type="button"
            aria-label={`Rename "${list.name}"`}
            onClick={() => setRenaming(true)}
          >
            <Pencil size={12} />
          </Button>
          <Button
            variant="ghost"
            size="xs"
            shape="square"
            ringOffset="app"
            type="button"
            aria-label={`Delete "${list.name}"`}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={12} />
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete "${list.name}"?`}
        description={
          todoCount > 0
            ? `This will also delete ${todoCount} ${todoCount === 1 ? "todo" : "todos"} in this list. This can't be undone.`
            : "This can't be undone."
        }
        onConfirm={() => {
          deleteList.mutate(list.id);
          setConfirmDelete(false);
        }}
        confirmPending={deleteList.isPending}
      />
    </div>
  );
}

function NewListColumn() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const createList = useCreateList();
  const { data: lists } = useLists();

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const customLists = (lists ?? []).filter((l) => l.kind === "custom");
    const lastPosition = customLists.at(-1)?.position ?? null;
    createList.mutate(
      { name: trimmed, position: generateKeyBetween(lastPosition, null) },
      {
        onError: (err) =>
          toast.error(messageFromError(err, "Couldn't create list")),
      },
    );
    setName("");
    setOpen(false);
  };

  // A full board column: "+ New List" sits on the same title baseline as the
  // real list titles, styled as a yellow wordmark per the design. Opening it
  // swaps the wordmark for the name input in place.
  return (
    <section className={COLUMN_CLASS}>
      <div className={TITLE_BAND_CLASS}>
        {open ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex w-full items-center gap-1"
          >
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => (name.trim() ? submit() : setOpen(false))}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
              }}
              placeholder="List name"
              inputSize="sm"
              ringOffset="app"
              className="flex-1 font-display font-bold"
            />
            <Button
              variant="ghost"
              size="xs"
              shape="square"
              ringOffset="app"
              type="button"
              aria-label="Cancel"
              onClick={() => setOpen(false)}
            >
              <X size={14} />
            </Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={`${LIST_TITLE_CLASS} rounded-lg text-left text-accent-muted transition-[color,transform] active:scale-[0.98] hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:ring-offset-4 focus-visible:ring-offset-gray-app`}
          >
            + New List
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * Wraps a column's scrollable row list. The top/bottom fades only show while
 * there's a real row still hidden past that edge — a pair of 1px sentinels
 * bracket the actual rows (inside the scroll container's own padding, not
 * past it), so scrolling into the trailing `pb-28` reserved for the floating
 * composer correctly clears the bottom fade instead of leaving it "stuck on"
 * once every row is already visible.
 */
function ColumnScroller({
  onWheel,
  isDropZone = false,
  children,
}: {
  onWheel: (e: WheelEvent<HTMLDivElement>) => void;
  /**
   * True while a cross-column drag has carried a row into this column. A
   * quiet tint marks the destination list; the row's own dashed slot shows
   * exactly where it will land.
   */
  isDropZone?: boolean;
  children: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const [topRowVisible, setTopRowVisible] = useState(true);
  const [bottomRowVisible, setBottomRowVisible] = useState(true);

  useEffect(() => {
    const root = scrollRef.current;
    const top = topSentinelRef.current;
    const bottom = bottomSentinelRef.current;
    if (!root || !top || !bottom) return;

    const topObserver = new IntersectionObserver(
      ([entry]) => setTopRowVisible(entry.isIntersecting),
      { root },
    );
    const bottomObserver = new IntersectionObserver(
      ([entry]) => setBottomRowVisible(entry.isIntersecting),
      { root },
    );
    topObserver.observe(top);
    bottomObserver.observe(bottom);

    return () => {
      topObserver.disconnect();
      bottomObserver.disconnect();
    };
  }, []);

  return (
    // `isolate` so the drop-zone frame's negative z-index stays behind the rows
    // without falling behind the column (and the page) entirely.
    <div className="relative isolate min-h-0 flex-1">
      <div
        aria-hidden
        className={`pointer-events-none absolute -inset-x-2 inset-y-0 -z-10 rounded-2xl bg-accent-base/25 ring-1 ring-accent-subtle transition-opacity duration-200 ${
          isDropZone ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        ref={scrollRef}
        // -mx/px cancel out to the same content position as the
        // column's own padding, but move that padding onto this
        // scroller's box. overflow-y-auto forces overflow-x to
        // auto too (browsers won't mix scroll with visible), so
        // without its own padding this clips the reorder grip,
        // which hangs left of each row via -translate-x-full.
        className="-mx-4 h-full overflow-y-auto overscroll-contain px-4 sm:-mx-6 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onWheel={onWheel}
      >
        <div ref={topSentinelRef} aria-hidden />
        {children}
        <div ref={bottomSentinelRef} aria-hidden />
      </div>
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white to-transparent transition-opacity duration-200 dark:from-graydark-1 ${
          topRowVisible ? "opacity-0" : "opacity-100"
        }`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent transition-opacity duration-200 dark:from-graydark-1 ${
          bottomRowVisible ? "opacity-0" : "opacity-100"
        }`}
      />
    </div>
  );
}

/**
 * Fetches every list + todo once, groups todos by listId, and renders one
 * `TodoListColumn` per list side by side (Today, This Week, Sometime, then
 * custom lists in position order). Owns the single `DndContext` that spans
 * every column, so a drag can move a todo between lists as well as reorder
 * within one — each column is its own `SortableContext` inside this shared
 * context, per dnd-kit's multi-container pattern.
 */
export function TodoGrid() {
  const { data: lists, isLoading: listsLoading } = useLists();
  const {
    data: todos,
    isLoading: todosLoading,
    error,
    refetch,
    isFetching,
  } = useTodos();
  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();
  const createTodo = useCreateTodo();
  const updateList = useUpdateList();
  const { data: user } = useUser();
  const { timeZone } = useHints();
  useLocalMidnightTick();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isKeyboardDragging, setIsKeyboardDragging] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeWidth, setActiveWidth] = useState<number | undefined>(undefined);
  // The list the dragged row currently sits in. It starts as the row's own
  // list and changes as the drag crosses columns (handleDragOver moves the row
  // into the hovered list's local order). Mirrored in a ref because collision
  // detection and the drag handlers need the latest value between renders.
  const [dragListId, setDragListId] = useState<string | null>(null);
  const dragListIdRef = useRef<string | null>(null);
  // Multiple-containers bookkeeping, as in dnd-kit's own example: the last
  // resolved drop target, and whether the row just changed lists (so the
  // collision pass doesn't bounce while the new column's layout settles).
  const lastOverIdRef = useRef<string | null>(null);
  const recentlyMovedRef = useRef(false);
  const [localOrderByList, setLocalOrderByList] = useState<
    Record<string, TodoWithUrls[] | null>
  >({});
  // The aggregate Completed column's collapse state — seeded from (but not
  // synced back to) the shared `hideCompleted` preference, same as the old
  // per-list accordion's behavior.
  const [completedColumnCollapsed, setCompletedColumnCollapsed] = useState<
    boolean | null
  >(null);
  const boardScrollRef = useRef<HTMLDivElement>(null);
  // Columns scroll vertically in their own container, so a horizontal
  // trackpad/wheel gesture over a column would otherwise be swallowed by
  // that container instead of paging the board. When a wheel event is
  // clearly more horizontal than vertical, redirect it to the board's own
  // scroller. A mostly-vertical trackpad scroll is rarely axis-locked — it
  // regularly emits ticks where a few px of deltaX jitter edges out an even
  // smaller deltaY, so a plain deltaX > deltaY check hijacks the board mid-
  // scroll and reads as the whole board jittering left/right. Requiring
  // deltaX to clearly dominate (not just edge out) filters that jitter while
  // still catching genuine horizontal gestures.
  const handleColumnWheel = (e: WheelEvent<HTMLDivElement>) => {
    const absX = Math.abs(e.deltaX);
    const absY = Math.abs(e.deltaY);
    if (absX > 2 && absX > absY * 2) {
      boardScrollRef.current?.scrollBy({ left: e.deltaX });
    }
  };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: boardKeyboardCoordinates,
    }),
  );

  // Separate sensor set for the header-reorder DndContext (horizontal,
  // default keyboard coordinates — headers are a single row, not variable-
  // height rows, so the todo list's custom vertical getter doesn't apply).
  const headerSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: todos is intentionally used as a trigger to reset local order when server data refreshes
  useEffect(() => {
    // Not mid-drag, though: a sync refetch landing then would yank the
    // dragged row back out of the list it's hovering. handleDragEnd/Cancel
    // settle the order themselves.
    if (dragListIdRef.current) return;
    setLocalOrderByList({});
  }, [todos]);

  // Clear the "just changed lists" flag once the new column has laid out.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs after each local order change
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      recentlyMovedRef.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [localOrderByList]);

  if (listsLoading || todosLoading) {
    return (
      <BoardScaffold>
        <div className={COLUMN_CLASS}>
          <div className={TITLE_BAND_CLASS}>
            <div className="h-6 w-24 animate-pulse rounded-md bg-gray-base" />
          </div>
          <TodoSkeleton />
        </div>
      </BoardScaffold>
    );
  }

  if (error) {
    return (
      <BoardScaffold>
        <div className={COLUMN_CLASS}>
          <div className={TITLE_BAND_CLASS} />
          <ErrorState onRetry={() => refetch()} isRetrying={isFetching} />
        </div>
      </BoardScaffold>
    );
  }

  const sortedLists = sortLists(lists ?? []);
  // Only custom lists participate in header drag-reorder — the three system
  // lists are excluded from this SortableContext entirely, so they can never
  // be dragged out of their fixed first-three position, and nothing can be
  // dropped before/between them.
  const customListIds = sortedLists
    .filter((l) => l.kind === "custom")
    .map((l) => l.id);

  const todosByList = new Map<string, TodoWithUrls[]>();
  for (const todo of todos ?? []) {
    const existing = todosByList.get(todo.listId) ?? [];
    existing.push(todo);
    todosByList.set(todo.listId, existing);
  }

  const todoCountByList = new Map<string, number>();
  for (const [listId, listTodos] of todosByList) {
    todoCountByList.set(listId, listTodos.length);
  }

  const allTodos = todos ?? [];
  const listIdByTodoId = new Map(allTodos.map((t) => [t.id, t.listId]));

  const handleRequestDelete = (id: string) => setConfirmDeleteId(id);
  const handleToggleExpand = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  const handleConfirmDelete = () => {
    if (!confirmDeleteId) return;
    deleteTodo.mutate(confirmDeleteId);
    setConfirmDeleteId(null);
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

  const handleToggleCompletedColumn = () => {
    setCompletedColumnCollapsed(
      !(completedColumnCollapsed ?? user?.hideCompleted ?? false),
    );
  };

  // Un-completes a todo from the aggregate Completed column, restoring it to
  // the end of its own list's incomplete order — mirrors the per-list logic
  // the old inline accordion used (see git history), now computed here since
  // this column spans every list rather than belonging to one.
  const handleUncomplete = (todo: TodoWithUrls) => {
    if (!todo.completed && todo.completedAt) {
      const input: UpdateTodoInput = { completedAt: null };
      if (todo.recurrence && todo.dueDate) {
        input.dueDate = previousDueDate(
          todo.recurrence,
          new Date(todo.dueDate),
        );
      }
      updateTodo.mutate({ id: todo.id, input });
      return;
    }
    const sourceListTodos = todosByList.get(todo.listId) ?? [];
    const sourceOrder =
      localOrderByList[todo.listId] ??
      getIncompleteOrder(sourceListTodos, timeZone);
    const lastPosition =
      sourceOrder.length > 0
        ? sourceOrder[sourceOrder.length - 1].position
        : null;
    const newPosition = generateKeyBetween(lastPosition ?? null, null);
    updateTodo.mutate({
      id: todo.id,
      input: { completed: false, position: newPosition },
    });
  };

  // The incomplete order a list shows right now: the mid-drag override if
  // there is one, otherwise derived from the cache.
  const orderFor = (listId: string): TodoWithUrls[] =>
    localOrderByList[listId] ??
    getIncompleteOrder(todosByList.get(listId) ?? [], timeZone);

  const endDrag = () => {
    setIsKeyboardDragging(false);
    setActiveId(null);
    setDragListId(null);
    dragListIdRef.current = null;
    lastOverIdRef.current = null;
  };

  const handleDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    setIsKeyboardDragging(activatorEvent instanceof KeyboardEvent);
    setActiveId(active.id as string);
    setActiveWidth(active.rect.current.initial?.width);
    const listId = listIdByTodoId.get(active.id as string) ?? null;
    setDragListId(listId);
    dragListIdRef.current = listId;
  };

  // Escape puts everything back: the dragged row may have been moved into
  // another list's local order on the way, so drop every override and let
  // the columns re-derive from the cache.
  const handleDragCancel = () => {
    endDrag();
    setLocalOrderByList({});
  };

  // Column-header reorder — custom lists only, drag the header to move a
  // list among the other custom lists. Separate DndContext/sensors from the
  // todo-item drag above: the two never target the same draggable ids, and
  // keeping them independent avoids the header drag accidentally picking up
  // cross-list-drop collision logic meant for todos.
  const handleHeaderDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = customListIds.indexOf(active.id as string);
    const newIndex = customListIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(customListIds, oldIndex, newIndex);
    const reorderedIndex = reordered.indexOf(active.id as string);
    const customLists = sortedLists.filter((l) => l.kind === "custom");
    const byId = new Map(customLists.map((l) => [l.id, l]));
    const prevList =
      reorderedIndex > 0 ? byId.get(reordered[reorderedIndex - 1]) : null;
    const nextList =
      reorderedIndex < reordered.length - 1
        ? byId.get(reordered[reorderedIndex + 1])
        : null;
    const newPosition = generateKeyBetween(
      prevList?.position ?? null,
      nextList?.position ?? null,
    );
    updateList.mutate({
      id: active.id as string,
      input: { position: newPosition },
    });
  };

  // Multiple-containers collision: find what the pointer is over, and if
  // that's a column with rows in it, resolve to the closest of *those* rows so
  // the drop lands at a precise index. The last hit is remembered so the
  // target doesn't flicker to nothing while rows shift under the pointer —
  // the same approach as dnd-kit's multiple-containers example.
  const itemCollisionDetection: CollisionDetection = (args) => {
    const pointerHits = pointerWithin(args);
    const hits = pointerHits.length > 0 ? pointerHits : rectIntersection(args);
    let overId = getFirstCollision(hits, "id") as string | null;
    if (overId != null) {
      if (overId.startsWith(COLUMN_DROP_PREFIX)) {
        const rowIds = new Set(
          orderFor(overId.slice(COLUMN_DROP_PREFIX.length)).map((t) => t.id),
        );
        if (rowIds.size > 0) {
          const closest = closestCenter({
            ...args,
            droppableContainers: args.droppableContainers.filter((c) =>
              rowIds.has(c.id as string),
            ),
          });
          overId = (closest[0]?.id as string | undefined) ?? overId;
        }
      }
      lastOverIdRef.current = overId;
      return [{ id: overId }];
    }
    // Just moved into a new list: the layout hasn't settled, so hold on the
    // dragged row itself rather than snapping back to the old target.
    if (recentlyMovedRef.current) {
      lastOverIdRef.current = args.active.id as string;
    }
    return lastOverIdRef.current ? [{ id: lastOverIdRef.current }] : [];
  };

  // Crossing into another list moves the dragged row into that list's local
  // order at the hovered slot, so the target column's own SortableContext
  // opens a gap there (and keeps sorting it) exactly as it would for one of
  // its own rows. Same-list hovers are left to dnd-kit's sorting.
  const handleDragOver = ({ active, over }: DragOverEvent) => {
    const overId = over?.id as string | undefined;
    if (!over || !overId || overId === active.id) return;
    const dragged = allTodos.find((t) => t.id === active.id);
    if (!dragged) return;

    const fromListId = dragListIdRef.current ?? dragged.listId;
    const toListId = overId.startsWith(COLUMN_DROP_PREFIX)
      ? overId.slice(COLUMN_DROP_PREFIX.length)
      : listIdByTodoId.get(overId);
    if (!toListId || toListId === fromListId) return;

    const fromItems = orderFor(fromListId).filter((t) => t.id !== dragged.id);
    const toItems = orderFor(toListId).filter((t) => t.id !== dragged.id);
    let index = toItems.length;
    if (!overId.startsWith(COLUMN_DROP_PREFIX)) {
      const overIndex = toItems.findIndex((t) => t.id === overId);
      const translated = active.rect.current.translated;
      const isBelowOver =
        !!translated &&
        translated.top + translated.height / 2 >
          over.rect.top + over.rect.height / 2;
      if (overIndex !== -1) index = overIndex + (isBelowOver ? 1 : 0);
    }

    recentlyMovedRef.current = true;
    dragListIdRef.current = toListId;
    setDragListId(toListId);
    setLocalOrderByList((prev) => ({
      ...prev,
      [fromListId]: fromItems,
      [toListId]: insertInTier(toItems, dragged, index),
    }));
  };

  // Commits wherever the row ended up — one path for same-list reorders and
  // cross-list moves, since by now the row already sits in its final list's
  // local order.
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const dragged = allTodos.find((t) => t.id === active.id);
    const listId = dragListIdRef.current ?? dragged?.listId;
    endDrag();
    if (!dragged || !listId || !over) {
      setLocalOrderByList({});
      return;
    }

    let items = orderFor(listId);
    const from = items.findIndex((t) => t.id === dragged.id);
    if (from === -1) {
      setLocalOrderByList({});
      return;
    }
    const overIndex = items.findIndex((t) => t.id === over.id);
    if (overIndex !== -1 && overIndex !== from) {
      const rest = items.filter((t) => t.id !== dragged.id);
      items = insertInTier(rest, dragged, overIndex);
    }
    const index = items.findIndex((t) => t.id === dragged.id);

    const changedList = listId !== dragged.listId;
    const original = getIncompleteOrder(
      todosByList.get(dragged.listId) ?? [],
      timeZone,
    );
    const unchanged =
      !changedList &&
      items.length === original.length &&
      items.every((t, i) => t.id === original[i].id);
    if (unchanged) {
      setLocalOrderByList({});
      return;
    }

    const position = positionAt(items, index);
    setLocalOrderByList((prev) => ({ ...prev, [listId]: items }));
    updateTodo.mutate({
      id: dragged.id,
      input: changedList ? { listId, position } : { position },
    });
  };

  const expandedTodo = expandedId
    ? (allTodos.find((t) => t.id === expandedId) ?? null)
    : null;
  const confirmDeleteTodo = confirmDeleteId
    ? (allTodos.find((t) => t.id === confirmDeleteId) ?? null)
    : null;
  const expandedTodoSubtasks = expandedTodo
    ? allTodos.filter((t) => t.parentId === expandedTodo.id)
    : [];

  const completedTodos = sortTopLevelTodos(allTodos, timeZone).completed;

  const activeTodo = activeId
    ? (allTodos.find((t) => t.id === activeId) ?? null)
    : null;

  // The list a cross-column drag has carried the row into, or null while it's
  // still in its own list. Frames that column as the destination.
  const crossListTargetId =
    activeTodo && dragListId && dragListId !== activeTodo.listId
      ? dragListId
      : null;

  return (
    // Two independent DndContexts: this outer one reorders custom-list
    // headers (horizontal); the inner one (below) reorders/cross-list-moves
    // todo rows (vertical + cross-column). Each binds only to the
    // useSortable/useDroppable calls nested inside it, so a drag started on
    // a header grip never triggers the todo drag logic and vice versa.
    <DndContext
      sensors={headerSensors}
      collisionDetection={closestCenter}
      onDragEnd={handleHeaderDragEnd}
    >
      <SortableContext
        items={customListIds}
        strategy={horizontalListSortingStrategy}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={itemCollisionDetection}
          measuring={DROPPABLE_MEASURING}
          modifiers={[pointerDeadZone(isKeyboardDragging)]}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <BoardScaffold scrollRef={boardScrollRef}>
            {sortedLists
              .filter((list) => list.systemKind !== "completed")
              .map((list) => {
                const listTodos = todosByList.get(list.id) ?? [];
                const incompleteOrder =
                  localOrderByList[list.id] ??
                  getIncompleteOrder(listTodos, timeZone);
                const isDropZone = crossListTargetId === list.id;
                return (
                  <section
                    key={list.id}
                    className={`${COLUMN_CLASS} group/column`}
                  >
                    <div className={TITLE_BAND_CLASS}>
                      <ListHeader
                        list={list}
                        isDraggable={list.kind === "custom"}
                        todoCount={todoCountByList.get(list.id) ?? 0}
                      />
                    </div>
                    <NewTodoInline
                      listId={list.id}
                      firstPosition={
                        incompleteOrder.find((t) => !t.sticky)?.position ?? null
                      }
                    />
                    <ColumnScroller
                      onWheel={handleColumnWheel}
                      isDropZone={isDropZone}
                    >
                      <TodoListColumn
                        listId={list.id}
                        todos={listTodos}
                        expandedId={expandedId}
                        onToggleExpand={handleToggleExpand}
                        onRequestDelete={handleRequestDelete}
                        updateTodo={updateTodo}
                        deleteTodo={deleteTodo}
                        createTodo={createTodo}
                        timeZone={timeZone}
                        isKeyboardDragging={isKeyboardDragging}
                        localIncompleteTodos={localOrderByList[list.id] ?? null}
                      />
                    </ColumnScroller>
                  </section>
                );
              })}
            <NewListColumn />
            {/* Backed by the real `completed` system list (always sorted
                last, excluded from the map above and from drag/reorder), but
                its contents are still every completed todo across every
                list, synthesized here rather than filtered by listId. */}
            <section className={`${COLUMN_CLASS} group/column`}>
              <div className={TITLE_BAND_CLASS}>
                <h2 className={`${LIST_TITLE_CLASS} text-gray-muted`}>
                  Completed
                </h2>
              </div>
              <ColumnScroller onWheel={handleColumnWheel}>
                <CompletedColumn
                  completedTodos={completedTodos}
                  allTodos={allTodos}
                  expandedId={expandedId}
                  onToggleExpand={handleToggleExpand}
                  onRequestDelete={handleRequestDelete}
                  onUncomplete={handleUncomplete}
                  collapsed={
                    completedColumnCollapsed ?? user?.hideCompleted ?? false
                  }
                  onToggleCollapsed={handleToggleCompletedColumn}
                  known={!!user}
                />
              </ColumnScroller>
            </section>
          </BoardScaffold>
          <DragOverlay
            modifiers={[pointerDeadZone(isKeyboardDragging)]}
            dropAnimation={DROP_ANIMATION}
          >
            {activeTodo && (
              <TodoRowPreview
                todo={activeTodo}
                subtasks={allTodos.filter((t) => t.parentId === activeTodo.id)}
                isExpanded={false}
                onToggle={() => {}}
                onDelete={() => {}}
                onToggleExpand={() => {}}
                onInlineUpdate={() => {}}
                updatePending={false}
                deletePending={false}
                width={activeWidth}
              />
            )}
          </DragOverlay>
          <ConfirmDialog
            open={confirmDeleteId !== null}
            onOpenChange={(open) => {
              if (!open) setConfirmDeleteId(null);
            }}
            title="Delete this todo?"
            description={
              confirmDeleteTodo
                ? `"${confirmDeleteTodo.title}" and any subtasks will be deleted. This can't be undone.`
                : "This can't be undone."
            }
            onConfirm={handleConfirmDelete}
            confirmPending={deleteTodo.isPending}
          />
          <SidePanel
            open={expandedTodo !== null}
            onOpenChange={(open) => {
              if (!open) setExpandedId(null);
            }}
            title={
              expandedTodo ? (
                <EditableSidePanelTitle
                  key={expandedTodo.id}
                  todo={expandedTodo}
                  onUpdate={handleUpdateExpanded(expandedTodo.id)}
                />
              ) : (
                "Todo details"
              )
            }
          >
            {expandedTodo && (
              <ExpandedSection
                todo={expandedTodo}
                subtasks={expandedTodoSubtasks}
                onUpdate={handleUpdateExpanded(expandedTodo.id)}
                onDelete={handleRequestDelete}
                deletePending={deleteTodo.isPending}
                subtaskHandlers={{
                  onAdd: (parentId, title, position) =>
                    createTodo.mutate({ title, parentId, position }),
                  onToggle: (id, completed) =>
                    updateTodo.mutate({ id, input: { completed: !completed } }),
                  onDelete: (id) => deleteTodo.mutate(id),
                  onReorder: (id, position) =>
                    updateTodo.mutate({ id, input: { position } }),
                }}
              />
            )}
          </SidePanel>
        </DndContext>
      </SortableContext>
    </DndContext>
  );
}
