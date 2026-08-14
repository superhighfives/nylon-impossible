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
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { generateKeyBetween } from "fractional-indexing";
import { GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { TodoInput } from "@/components/TodoInput";
import {
  ErrorState,
  ExpandedSection,
  getIncompleteOrder,
  TodoListColumn,
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
import { useUpdateUser, useUser } from "@/hooks/useUser";
import { messageFromError, toast } from "@/lib/toast";
import type { SerializedList, TodoWithUrls } from "@/types/database";
import { Button, ConfirmDialog, Input, SidePanel } from "./ui";

// The grid's own vertical-drag lock (matches the single-list behavior) —
// rows only move up/down within a column, never sideways mid-drag.
const restrictToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
});

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
function BoardScaffold({ children }: { children: ReactNode }) {
  return (
    {/* overscroll-x-contain stops edge swipes chaining into the page's
        rubber-band / browser back gesture. */}
    <div className="fixed inset-0 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain md:snap-none">
      <div className="flex h-full min-w-max">
        <div aria-hidden className={GUTTER_CLASS} />
        {children}
      </div>
    </div>
  );
}

function sortLists(lists: SerializedList[]): SerializedList[] {
  return [...lists].sort((a, b) => {
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
      className="mb-1 flex min-h-9 items-center gap-1 py-1"
    >
      <Input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => (title.trim() ? submit() : close())}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
        placeholder="New todo"
        inputSize="sm"
        className="flex-1"
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
  // real list titles, styled as an orange wordmark per the design. Opening it
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
            className={`${LIST_TITLE_CLASS} rounded-lg text-left text-accent-solid transition-[color,transform] active:scale-[0.98] hover:text-accent-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:ring-offset-4 focus-visible:ring-offset-gray-app`}
          >
            + New List
          </button>
        )}
      </div>
    </section>
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
  const updateUser = useUpdateUser();
  const { highlightIds, hiddenIds } = useImportReview();
  const { timeZone } = useHints();
  useLocalMidnightTick();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isKeyboardDragging, setIsKeyboardDragging] = useState(false);
  const [localOrderByList, setLocalOrderByList] = useState<
    Record<string, TodoWithUrls[] | null>
  >({});
  const composerRef = useRef<HTMLTextAreaElement>(null);

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

  // Global `n` shortcut: focuses the bottom composer (which creates into
  // Today), unless focus is already inside a text field.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "n" && e.key !== "N") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) {
        return;
      }
      e.preventDefault();
      composerRef.current?.focus();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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

  const handleToggleCompleted = () => {
    updateUser.mutate(
      { hideCompleted: !(user?.hideCompleted ?? false) },
      {
        onError: (err) =>
          toast.error(messageFromError(err, "Couldn't change setting")),
      },
    );
  };

  const handleDragStart = ({ activatorEvent }: DragStartEvent) => {
    setIsKeyboardDragging(activatorEvent instanceof KeyboardEvent);
  };

  const handleDragCancel = () => setIsKeyboardDragging(false);

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

    // Cross-list: insert at the drop index in the target list's own order,
    // then compute a fresh position against that list's neighbors. Sticky
    // tier is preserved but not re-scoped on the destination — good enough
    // for "moved to a new list", which is a coarser action than reordering.
    const targetListTodos = todosByList.get(targetListId) ?? [];
    const targetOrder =
      localOrderByList[targetListId] ??
      getIncompleteOrder(targetListTodos, timeZone, hiddenIds);

    const overIndex = targetOrder.findIndex((t) => t.id === over.id);
    const insertIndex = overIndex === -1 ? targetOrder.length : overIndex;

    const prevItem = insertIndex > 0 ? targetOrder[insertIndex - 1] : null;
    const nextItem =
      insertIndex < targetOrder.length ? targetOrder[insertIndex] : null;
    const newPosition = generateKeyBetween(
      prevItem?.position ?? null,
      nextItem?.position ?? null,
    );

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
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <BoardScaffold>
            {sortedLists.map((list) => {
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
                  {/* The rows scroll independently per column; the fade at
                        the bottom keeps long lists from ending in a hard cut
                        behind the floating composer. */}
                  <div className="relative min-h-0 flex-1">
                    <div className="h-full overflow-y-auto overscroll-contain pb-28 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                        completedCollapsed={user?.hideCompleted ?? false}
                        hideCompletedKnown={!!user}
                        onToggleCompleted={handleToggleCompleted}
                        updateUserPending={updateUser.isPending}
                        isKeyboardDragging={isKeyboardDragging}
                        localIncompleteTodos={localOrderByList[list.id] ?? null}
                      />
                    </div>
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent dark:from-graydark-1"
                    />
                  </div>
                </section>
              );
            })}
            <NewListColumn />
          </BoardScaffold>
          {/* Floating composer: the quick-add-to-Today surface. Focused by
              the global `n` shortcut; smart-create defaults into Today. */}
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4 sm:pb-6">
            <div className="pointer-events-auto w-full max-w-md">
              <TodoInput textareaRef={composerRef} />
            </div>
          </div>
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
