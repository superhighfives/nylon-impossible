import {
  type CollisionDetection,
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  KeyboardSensor,
  type Modifier,
  PointerSensor,
  pointerWithin,
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
import { useImportReview } from "@/hooks/useImportReview";
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
import { messageFromError, toast } from "@/lib/toast";
import { sortTopLevelTodos } from "@/lib/todoOrder";
import type {
  SerializedList,
  TodoWithUrls,
  UpdateTodoInput,
} from "@/types/database";
import { Button, ConfirmDialog, Input, SidePanel } from "./ui";

// Keyboard reorder only ever moves up/down (see `verticalKeyboardCoordinates`
// below), so it's always locked to vertical. Pointer/touch drags used to be
// locked unconditionally too, which silently broke cross-list drag: the
// collision rect never left the source column's x position, so `over` could
// never resolve to a todo or column in a different list. A small dead zone
// (a few px of incidental horizontal jitter from an imperfectly-vertical
// mouse/finger movement) keeps ordinary in-column reordering feeling
// vertical-only; past that, the transform follows the pointer's real x so
// the item can visibly travel into — and register a drop against — another
// column.
const HORIZONTAL_DRAG_DEAD_ZONE = 12;

const restrictToVerticalAxisForKeyboard =
  (isKeyboardDragging: boolean): Modifier =>
  ({ transform }) => {
    if (isKeyboardDragging) return { ...transform, x: 0 };
    if (Math.abs(transform.x) < HORIZONTAL_DRAG_DEAD_ZONE) {
      return { ...transform, x: 0 };
    }
    return transform;
  };

// Multi-container drag needs a collision strategy that can tell a column
// drop zone from a row drop zone reliably. `pointerWithin` — is the pointer
// actually over this rect? — gets that right for pointer/touch drags;
// `closestCenter` is the fallback for keyboard drags, which have no pointer
// position to test against.
//
// Row-level precision only applies within the dragged item's own list —
// crossing into a different list is a coarse, whole-column drop (it always
// lands at the top of its tier there; see handleDragEnd). So hits against
// individual rows belonging to a *different* list are filtered out here,
// leaving only same-list rows (fine-grained reorder) and column droppables
// (`column-*`, coarse cross-list move) as valid targets.
const makeItemCollisionDetection = (
  listIdByTodoId: Map<string, string>,
): CollisionDetection => {
  const isValidHit = (id: string, sourceListId: string | undefined) =>
    id.startsWith("column-") ||
    !listIdByTodoId.has(id) ||
    listIdByTodoId.get(id) === sourceListId;

  return (args) => {
    const sourceListId = listIdByTodoId.get(args.active.id as string);
    const hits = pointerWithin(args).filter((hit) =>
      isValidHit(hit.id as string, sourceListId),
    );
    if (hits.length > 0) return hits;
    return closestCenter(args).filter((hit) =>
      isValidHit(hit.id as string, sourceListId),
    );
  };
};

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
    const below = others
      .filter((r) => r.top > activeTop + 1)
      .sort((a, b) => a.top - b.top)[0];
    if (!below) return undefined;
    return { x: collisionRect.left, y: activeTop + below.height };
  }

  const above = others
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
  // overscroll-x-contain stops edge swipes chaining into the page's
  // rubber-band / browser back gesture.
  return (
    <div
      ref={scrollRef}
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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    setTitle("");
  };

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      close();
      return;
    }
    createTodo.mutate(
      {
        title: trimmed,
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
        className="mb-1 flex min-h-9 w-full items-center gap-3 rounded-lg py-2 text-left text-sm text-gray-placeholder opacity-0 transition-[opacity,color] hover:text-gray-muted focus-visible:opacity-100 group-hover/column:opacity-100 group-focus-within/column:opacity-100 max-sm:opacity-100"
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
      className="mb-1 flex min-h-9 w-full items-center gap-3 rounded-lg py-2"
    >
      <span
        aria-hidden="true"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 border-dashed border-gray-strong"
      >
        <Plus size={12} />
      </span>
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => (title.trim() ? submit() : close())}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
        placeholder="New todo"
        className="flex-1 border-none bg-transparent p-0 text-sm text-gray outline-none placeholder:text-gray-muted"
      />
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
          className="cursor-grab touch-none select-none text-gray-muted opacity-0 transition-opacity active:cursor-grabbing group-hover/header:opacity-100"
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
          className="flex-1 font-display font-bold"
        />
      ) : (
        <h2 className={`${LIST_TITLE_CLASS} min-w-0 flex-1 truncate text-gray`}>
          {list.name}
        </h2>
      )}
      {list.kind === "custom" && !renaming && (
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/header:opacity-100 group-focus-within/header:opacity-100">
          <Button
            variant="ghost"
            size="xs"
            shape="square"
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
              className="flex-1 font-display font-bold"
            />
            <Button
              variant="ghost"
              size="xs"
              shape="square"
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
  children,
}: {
  onWheel: (e: WheelEvent<HTMLDivElement>) => void;
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
    <div className="relative min-h-0 flex-1">
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
  const { highlightIds, hiddenIds } = useImportReview();
  const { timeZone } = useHints();
  useLocalMidnightTick();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isKeyboardDragging, setIsKeyboardDragging] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeWidth, setActiveWidth] = useState<number | undefined>(undefined);
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
      coordinateGetter: verticalKeyboardCoordinates,
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
    setLocalOrderByList({});
  }, [todos]);

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
  const itemCollisionDetection = makeItemCollisionDetection(listIdByTodoId);

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
      getIncompleteOrder(sourceListTodos, timeZone, hiddenIds);
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

  const handleDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    setIsKeyboardDragging(activatorEvent instanceof KeyboardEvent);
    setActiveId(active.id as string);
    setActiveWidth(active.rect.current.initial?.width);
  };

  const handleDragCancel = () => {
    setIsKeyboardDragging(false);
    setActiveId(null);
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

  const resolveListIdFromOverId = (overId: string): string | null => {
    if (overId.startsWith("column-")) return overId.slice("column-".length);
    const todo = allTodos.find((t) => t.id === overId);
    return todo?.listId ?? null;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setIsKeyboardDragging(false);
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const draggedItem = allTodos.find((t) => t.id === active.id);
    if (!draggedItem) return;

    const sourceListId = draggedItem.listId;
    const targetListId = resolveListIdFromOverId(over.id as string);
    if (!targetListId) return;

    const sourceListTodos = todosByList.get(sourceListId) ?? [];
    const sourceOrder =
      localOrderByList[sourceListId] ??
      getIncompleteOrder(sourceListTodos, timeZone, hiddenIds);

    if (targetListId === sourceListId) {
      if (active.id === over.id) return;
      // Same-list: reorder within the sticky/non-sticky tier only, mirroring
      // the single-list drag behavior.
      const tierItems = sourceOrder.filter(
        (t) => t.sticky === draggedItem.sticky,
      );
      const oldIndex = tierItems.findIndex((t) => t.id === active.id);
      if (oldIndex === -1) return;
      let newIndex = tierItems.findIndex((t) => t.id === over.id);
      if (newIndex === -1) {
        const overIndexInAll = sourceOrder.findIndex((t) => t.id === over.id);
        const oldIndexInAll = sourceOrder.findIndex((t) => t.id === active.id);
        if (overIndexInAll === -1) return;
        newIndex = overIndexInAll > oldIndexInAll ? tierItems.length - 1 : 0;
      }

      const reorderedTier = arrayMove(tierItems, oldIndex, newIndex);
      let tierCursor = 0;
      const reordered = sourceOrder.map((t) =>
        t.sticky === draggedItem.sticky ? reorderedTier[tierCursor++] : t,
      );
      setLocalOrderByList((prev) => ({ ...prev, [sourceListId]: reordered }));

      const prevItem =
        newIndex > 0 ? reorderedTier[newIndex - 1].position : null;
      const nextItem =
        newIndex < reorderedTier.length - 1
          ? reorderedTier[newIndex + 1].position
          : null;
      const newPosition = generateKeyBetween(
        prevItem ?? null,
        nextItem ?? null,
      );
      updateTodo.mutate({
        id: active.id as string,
        input: { position: newPosition },
      });
      return;
    }

    // Cross-list: the whole column is the dropzone (collision detection
    // above never resolves `over` to an individual row in a different list),
    // so there's no drop-index to honor — the item always lands at the top
    // of its own tier in the target list, preserving the "pinned always
    // first" invariant instead of trying to land at an arbitrary row.
    const targetListTodos = todosByList.get(targetListId) ?? [];
    const targetOrder =
      localOrderByList[targetListId] ??
      getIncompleteOrder(targetListTodos, timeZone, hiddenIds);

    const prevItem = draggedItem.sticky
      ? null
      : (targetOrder.filter((t) => t.sticky).at(-1) ?? null);
    const firstOfTier = targetOrder.find(
      (t) => t.sticky === draggedItem.sticky,
    );
    const newPosition = generateKeyBetween(
      prevItem?.position ?? null,
      firstOfTier?.position ?? null,
    );
    const insertIndex = draggedItem.sticky
      ? 0
      : targetOrder.filter((t) => t.sticky).length;

    setLocalOrderByList((prev) => ({
      ...prev,
      [sourceListId]: sourceOrder.filter((t) => t.id !== active.id),
      [targetListId]: [
        ...targetOrder.slice(0, insertIndex),
        draggedItem,
        ...targetOrder.slice(insertIndex),
      ],
    }));

    updateTodo.mutate({
      id: active.id as string,
      input: { listId: targetListId, position: newPosition },
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

  const completedTodos = sortTopLevelTodos(allTodos, timeZone).completed.filter(
    (t) => !hiddenIds.has(t.id),
  );

  const activeTodo = activeId
    ? (allTodos.find((t) => t.id === activeId) ?? null)
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
          modifiers={[restrictToVerticalAxisForKeyboard(isKeyboardDragging)]}
          onDragStart={handleDragStart}
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
                  getIncompleteOrder(listTodos, timeZone, hiddenIds);
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
                    <ColumnScroller onWheel={handleColumnWheel}>
                      <TodoListColumn
                        listId={list.id}
                        todos={listTodos}
                        expandedId={expandedId}
                        onToggleExpand={handleToggleExpand}
                        onRequestDelete={handleRequestDelete}
                        updateTodo={updateTodo}
                        deleteTodo={deleteTodo}
                        createTodo={createTodo}
                        highlightIds={highlightIds}
                        hiddenIds={hiddenIds}
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
                  updateTodo={updateTodo}
                  deleteTodo={deleteTodo}
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
            modifiers={[restrictToVerticalAxisForKeyboard(isKeyboardDragging)]}
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
            title={expandedTodo?.title ?? "Todo details"}
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
