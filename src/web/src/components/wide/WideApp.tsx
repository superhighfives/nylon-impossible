import {
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { BoardView } from "@nylon-impossible/shared";
import { generateKeyBetween } from "fractional-indexing";
import { ListPlus, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Composer } from "@/components/phone/Composer";
import { ContextMenu, type MenuView } from "@/components/phone/ContextMenu";
import { DetailSheet } from "@/components/phone/DetailSheet";
import {
  boardViewKey,
  columnSubline,
  displayTitle,
  TIME_KINDS,
} from "@/components/phone/model";
import {
  OvernightNote,
  useOvernightNote,
} from "@/components/phone/OvernightNote";
import { SettingsScreen } from "@/components/phone/SettingsScreen";
import { useBoardData } from "@/components/phone/useBoardData";
import { runToastUndo } from "@/components/phone/useTodoActions";
import { useHints } from "@/hooks/useHints";
import { useCreateList, useUpdateList } from "@/hooks/useLists";
import { dropPlacement, slotAt } from "@/lib/dragOrder";
import type { SerializedList, TodoWithUrls } from "@/types/database";
import { FeedbackDialog, useCanSendFeedback } from "../FeedbackDialog";
import { Column, type DropIndicator } from "./Column";
import { DONE_COLUMN, DoneColumn } from "./DoneColumn";
import { resolveDrop } from "./drop";
import { boardKeyAction, isTypingTarget } from "./keys";
import { NewListPopover } from "./NewListPopover";
import { QuickAdd } from "./QuickAdd";
import { ShortcutsOverlay } from "./ShortcutsOverlay";
import { Sidebar } from "./Sidebar";

const EMPTY_COPY: Record<string, string> = {
  today: "Nothing today.",
  thisWeek: "A clear week.",
  someday: "Nothing here yet.",
};

const TOOL_BUTTON =
  "flex size-9 cursor-pointer items-center justify-center rounded-full text-n-ink-muted n-focus pointer-fine:hover:bg-n-fill pointer-fine:hover:text-n-ink";

/** A column to focus once it renders: a row, its Add field, or its title. */
interface PendingFocus {
  column: string;
  target: "row" | "composer" | "head";
}

interface MenuState {
  id: string;
  anchor: { x: number; y: number };
  view: MenuView;
}

/** The board's rows in a column, in DOM order (collapsing rows excluded). */
function columnRows(listId: string): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      `[data-column="${CSS.escape(listId)}"] li:not([aria-hidden]) [data-row-id]`,
    ),
  );
}

function focusedRow(): HTMLElement | null {
  const el = document.activeElement;
  return el instanceof HTMLElement ? el.closest("[data-row-id]") : null;
}

/**
 * The wide layout (web 1024px and up): the sidebar, a toolbar, then four
 * columns that never change width: Today, This week, Someday, and a fourth
 * that shows the open todo's detail, else the list picked in the sidebar,
 * else Done.
 *
 * Selection is state, not DOM focus. Focusing a row selects it; one click
 * selects, a second click, a double click or Enter opens it in the fourth
 * column, and while a todo is open the detail follows the selection. Rows,
 * menus, the composer and the detail are the phone's components at board
 * density, driven by the same `useBoardData`.
 */
export function WideApp({
  view = null,
  onNavigate,
}: {
  /** The view the URL names: `/list/:id` opens that list's column. */
  view?: BoardView | null;
  /** Keeps the URL in step as your list's column opens and closes. */
  onNavigate?: (view: BoardView | null) => void;
} = {}) {
  const { reducedMotion } = useHints();
  const {
    timeZone,
    lists,
    todos,
    byKind,
    collections,
    listName,
    actions,
    subtasksOf,
    rowsFor,
    targets,
    doneTodos,
    doneCount,
    loading,
    todosLoading,
    error,
    refetch,
    isFetching,
  } = useBoardData();
  const createList = useCreateList();
  const updateList = useUpdateList();

  const [openListId, setOpenListId] = useState<string | null>(() =>
    view?.kind === "list" ? view.id : null,
  );
  const [detailId, setDetailId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [settings, setSettings] = useState(false);
  const [quickAdd, setQuickAdd] = useState(false);
  const [fourthEl, setFourthEl] = useState<HTMLElement | null>(null);
  const [shortcuts, setShortcuts] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const canSendFeedback = useCanSendFeedback();
  const [dragging, setDragging] = useState<TodoWithUrls | null>(null);
  const [indicator, setIndicator] = useState<DropIndicator | null>(null);
  const composers = useRef(new Map<string, HTMLTextAreaElement>());
  const justDragged = useRef(false);
  const pendingFocus = useRef<PendingFocus | null>(null);
  /** The last todo selected in each column, so going back lands on it. */
  const lastSelected = useRef(new Map<string, string>());

  const now = new Date();
  const overnight = useOvernightNote(todos, byKind.today?.id);
  const timeLists = TIME_KINDS.map((kind) => byKind[kind]).filter(
    (l): l is SerializedList => l !== undefined,
  );
  const openList = openListId
    ? collections.find((l) => l.id === openListId)
    : undefined;
  const todoById = useCallback(
    (id: string | null | undefined) =>
      id ? todos.find((t) => t.id === id && !t.completed) : undefined,
    [todos],
  );
  const doneById = useCallback(
    (id: string | null | undefined) =>
      id ? doneTodos.find((t) => t.id === id) : undefined,
    [doneTodos],
  );
  const detailTodo = detailId ? (todoById(detailId) ?? null) : null;
  /** What the fourth column shows: the detail, else your list, else Done. */
  const fourth = detailTodo ? "detail" : openList ? "list" : "done";
  // The columns with rows, left to right; the detail has none.
  const columnIds = [
    ...timeLists.map((l) => l.id),
    ...(fourth === "list" && openList ? [openList.id] : []),
    ...(fourth === "done" ? [DONE_COLUMN] : []),
  ];
  const todayId = byKind.today?.id ?? null;
  const selectedTodo = todoById(selectedId) ?? doneById(selectedId);
  /** The column the selection is in: a list id, Done, or none. */
  const selectionColumn = selectedTodo
    ? selectedTodo.completed
      ? DONE_COLUMN
      : selectedTodo.listId
    : null;
  const currentColumn =
    selectionColumn && columnIds.includes(selectionColumn)
      ? selectionColumn
      : todayId;

  // Your list was deleted elsewhere: close its column.
  useEffect(() => {
    if (openListId && !loading && !openList) setOpenListId(null);
  }, [openListId, openList, loading]);

  // --- Focus ----------------------------------------------------------------

  /**
   * Focus (and so select) a row in a column: `index`, else the column's
   * last-selected todo, else its first. Its title when it has no rows.
   */
  const focusColumn = useCallback(
    (listId: string, index?: number) => {
      const section = document.querySelector<HTMLElement>(
        `[data-column="${CSS.escape(listId)}"]`,
      );
      if (!section) return false;
      section.scrollIntoView({
        inline: "nearest",
        block: "nearest",
        behavior: reducedMotion === "reduce" ? "auto" : "smooth",
      });
      const rows = columnRows(listId);
      const remembered = lastSelected.current.get(listId);
      const target =
        (index === undefined
          ? rows.find((r) => r.dataset.rowId === remembered)
          : rows[Math.min(index, rows.length - 1)]) ??
        rows[0] ??
        section.querySelector<HTMLElement>("[data-column-head]");
      target?.focus({ preventScroll: rows.length === 0 });
      return true;
    },
    [reducedMotion],
  );

  // A column opened from the sidebar takes focus once it renders.
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending || !columnIds.includes(pending.column)) return;
    pendingFocus.current = null;
    if (pending.target === "composer") {
      composers.current.get(pending.column)?.focus();
    } else if (pending.target === "head") {
      document
        .querySelector<HTMLElement>(
          `[data-column-head="${CSS.escape(pending.column)}"]`,
        )
        ?.focus();
    } else {
      focusColumn(pending.column);
    }
  });

  // --- URL ------------------------------------------------------------------
  // `/list/:id` is your list's column; the time lists' URLs focus their
  // column on arrival. Opening and closing a column rewrites the URL.

  const urlKey = boardViewKey(view, lists);
  const appliedUrlKey = useRef<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the URL changes, once lists are in
  useEffect(() => {
    if (loading || urlKey === appliedUrlKey.current) return;
    appliedUrlKey.current = urlKey;
    if (urlKey.startsWith("list:")) {
      const id = urlKey.slice(5);
      if (openListId !== id) setOpenListId(id);
      pendingFocus.current = { column: id, target: "row" };
      return;
    }
    if (openListId) setOpenListId(null);
    const kind = TIME_KINDS.find((k) => k === urlKey);
    const id = kind ? byKind[kind]?.id : undefined;
    // Only an explicit `/this-week` moves focus; `/` leaves the page alone.
    if (view && id) focusColumn(id);
  }, [urlKey, loading]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the column opens or closes
  useEffect(() => {
    if (loading) return;
    if (openListId) {
      if (urlKey !== `list:${openListId}`) {
        onNavigate?.({ kind: "list", id: openListId });
      }
    } else if (urlKey.startsWith("list:")) {
      onNavigate?.(null);
    }
  }, [openListId, loading]);

  /** Before a row leaves its column, hand focus to its neighbour. */
  const focusNeighbour = (row: HTMLElement) => {
    const listId = row.dataset.rowList;
    if (!listId) return;
    const rows = columnRows(listId);
    const at = rows.indexOf(row);
    const next = rows[at + 1] ?? rows[at - 1];
    if (next) next.focus();
    else
      document
        .querySelector<HTMLElement>(
          `[data-column-head="${CSS.escape(listId)}"]`,
        )
        ?.focus();
  };

  // --- Selection ------------------------------------------------------------

  const select = useCallback((todo: TodoWithUrls) => {
    const column = todo.completed ? DONE_COLUMN : todo.listId;
    lastSelected.current.set(column, todo.id);
    setSelectedId(todo.id);
    // While a todo is open, the detail follows the selection.
    if (!todo.completed) {
      setDetailId((open) => (open && open !== todo.id ? todo.id : open));
    }
  }, []);

  const selectedRow = () =>
    selectedId
      ? document.querySelector<HTMLElement>(
          `[data-row-id="${CSS.escape(selectedId)}"]`,
        )
      : null;

  const closeDetail = () => {
    setDetailId(null);
    // Back to the selected row, which is where the keyboard left off.
    requestAnimationFrame(() => selectedRow()?.focus());
  };

  // --- Sidebar --------------------------------------------------------------

  /** Your list in the fourth column, its first todo selected. */
  const openCollection = (
    list: SerializedList,
    target: PendingFocus["target"] = "row",
  ) => {
    // Already showing: nothing re-renders, so go straight in.
    if (fourth === "list" && openListId === list.id && target === "row") {
      focusColumn(list.id);
      return;
    }
    setDetailId(null);
    setOpenListId(list.id);
    pendingFocus.current = { column: list.id, target };
  };

  const showDone = (target: PendingFocus["target"] = "row") => {
    if (fourth === "done" && target === "row") {
      focusColumn(DONE_COLUMN);
      return;
    }
    setDetailId(null);
    setOpenListId(null);
    pendingFocus.current = { column: DONE_COLUMN, target };
  };

  const addList = (name: string) => {
    const last = collections[collections.length - 1];
    createList.mutate(
      { name, position: generateKeyBetween(last?.position ?? null, null) },
      {
        // Open it and put the cursor in its Add field.
        onSuccess: (created) => openCollection(created, "composer"),
      },
    );
  };

  /** "View" on an "Added to …" toast. */
  const viewList = (listId: string) => {
    if (columnIds.includes(listId)) {
      focusColumn(listId);
      return;
    }
    const list = collections.find((l) => l.id === listId);
    if (list) openCollection(list);
  };

  // --- Keyboard -------------------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target)) return;
      const action = boardKeyAction(e);
      if (!action) return;
      if (action.type === "shortcuts") {
        e.preventDefault();
        setShortcuts((s) => !s);
        return;
      }
      // Screens and the overlays are modal; leave their keys alone.
      if (settings || shortcuts || feedback) return;
      if (action.type === "back") {
        if (detailTodo) {
          e.preventDefault();
          closeDetail();
        }
        return;
      }
      if (action.type === "undo") {
        if (runToastUndo()) e.preventDefault();
        return;
      }
      if (action.type === "feedback") {
        if (!canSendFeedback) return;
        e.preventDefault();
        setFeedback(true);
        return;
      }

      // Keys act on the selection while focus is on the board (or nowhere).
      // The sidebar and toolbar keep their own keys until they get a
      // keyboard model of their own.
      const active = document.activeElement;
      const onBoard =
        !active || active === document.body || !!active.closest("main");
      const row = focusedRow() ?? (onBoard ? selectedRow() : null);
      const listId =
        row?.dataset.rowList && columnIds.includes(row.dataset.rowList)
          ? row.dataset.rowList
          : currentColumn;
      const todo = todoById(row?.dataset.rowId);
      const done = doneById(row?.dataset.rowId);

      switch (action.type) {
        case "row": {
          if (!listId) return;
          e.preventDefault();
          const rows = columnRows(listId);
          const at = row ? rows.indexOf(row) : -1;
          if (at === -1) {
            rows[0]?.focus();
            return;
          }
          rows[at + action.delta]?.focus();
          return;
        }
        case "column": {
          if (!listId) return;
          e.preventDefault();
          const at = columnIds.indexOf(listId);
          const to = columnIds[at + action.delta];
          if (!to) return;
          const index = row ? columnRows(listId).indexOf(row) : 0;
          focusColumn(to, Math.max(0, index));
          return;
        }
        case "new": {
          if (!listId) return;
          e.preventDefault();
          const field = composers.current.get(listId);
          if (field) field.focus();
          else setQuickAdd(true);
          return;
        }
        default:
          break;
      }

      // Done's rows: X puts one back, Delete removes it.
      if (row && done) {
        if (action.type === "done" || action.type === "delete") {
          e.preventDefault();
          focusNeighbour(row);
          if (action.type === "done") actions.restore(done);
          else actions.destroy(done);
        }
        return;
      }

      if (!row || !todo) return;
      e.preventDefault();
      switch (action.type) {
        case "done":
          focusNeighbour(row);
          actions.complete(todo);
          return;
        case "move": {
          const target = byKind[action.kind];
          if (!target || target.id === todo.listId) return;
          focusNeighbour(row);
          actions.move(todo, target.id);
          return;
        }
        case "pin":
          actions.togglePin(todo);
          return;
        case "due": {
          const rect = row.getBoundingClientRect();
          setMenu({
            id: todo.id,
            anchor: { x: rect.left, y: rect.bottom + 4 },
            view: "due",
          });
          return;
        }
        case "delete":
          focusNeighbour(row);
          actions.destroy(todo);
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // --- Drag -----------------------------------------------------------------

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  /** Pointer y for a drag event: where it started plus how far it moved. */
  const pointerY = (e: DragMoveEvent | DragEndEvent) => {
    const start = e.activatorEvent as PointerEvent | MouseEvent;
    return (start?.clientY ?? 0) + e.delta.y;
  };

  const slotFor = (listId: string, todo: TodoWithUrls, y: number) => {
    const rowEls = columnRows(listId).filter(
      (el) => el.dataset.rowId !== todo.id,
    );
    const mids = rowEls.map((el) => {
      const r =
        el.closest("li")?.getBoundingClientRect() ?? el.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    const { index } = dropPlacement(rowsFor(listId), todo, slotAt(mids, y));
    return { index, rowEls };
  };

  const onDragStart = (e: DragStartEvent) => {
    const todo = e.active.data.current?.todo as TodoWithUrls | undefined;
    setDragging(todo ?? null);
    setMenu(null);
  };

  const onDragMove = (e: DragMoveEvent) => {
    const todo = dragging;
    const overId = e.over?.id;
    if (!todo || typeof overId !== "string" || !overId.startsWith("col:")) {
      setIndicator(null);
      return;
    }
    const listId = overId.slice(4);
    const y = pointerY(e);
    const { index, rowEls } = slotFor(listId, todo, y);
    const list = document.querySelector<HTMLElement>(
      `[data-column-body="${CSS.escape(listId)}"] .relative`,
    );
    if (!list) return;
    const base = list.getBoundingClientRect().top;
    const li = (el: HTMLElement | undefined) =>
      el?.closest("li")?.getBoundingClientRect();
    const before = li(rowEls[index]);
    const after = li(rowEls[index - 1]);
    const top = before ? before.top - base : after ? after.bottom - base : 8;
    setIndicator((cur) =>
      cur && cur.listId === listId && cur.index === index && cur.y === top
        ? cur
        : { listId, index, y: top },
    );
  };

  const endDrag = () => {
    setDragging(null);
    setIndicator(null);
    // The pointer-up that ends a drag can land as a click on a row.
    justDragged.current = true;
    setTimeout(() => {
      justDragged.current = false;
    }, 0);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const todo = dragging;
    const overId = e.over?.id;
    endDrag();
    if (!todo || typeof overId !== "string") return;
    const slot = overId.startsWith("col:")
      ? slotFor(overId.slice(4), todo, pointerY(e)).index
      : 0;
    const drop = resolveDrop({ overId, todo, rowsFor, slot });
    if (drop?.kind === "move") actions.move(todo, drop.listId);
    else if (drop?.kind === "place") {
      actions.place(todo, drop.listId, drop.position);
    }
  };

  // --- Rendering ------------------------------------------------------------

  const menuTodo = menu ? (todos.find((t) => t.id === menu.id) ?? null) : null;

  useEffect(() => {
    if (detailId && !todosLoading && !detailTodo) setDetailId(null);
  }, [detailId, detailTodo, todosLoading]);

  const errorView = error ? (
    <div className="mt-4" role="alert">
      <p className="m-0 font-n-display text-[1.125rem] font-semibold text-n-ink">
        Couldn’t load your todos.
      </p>
      <button
        type="button"
        onClick={() => refetch()}
        disabled={isFetching}
        className="-ml-2 mt-1 min-h-11 cursor-pointer rounded-n-chip px-2 text-[0.9375rem] font-medium text-n-ink-muted n-focus"
      >
        {isFetching ? "Trying again…" : "Try again"}
      </button>
    </div>
  ) : null;

  const onOpen = (todo: TodoWithUrls) => {
    if (justDragged.current) return;
    select(todo);
    setDetailId(todo.id);
  };
  const onMenu = (todo: TodoWithUrls, at?: { x: number; y: number }) => {
    const fallback = document
      .querySelector(`[data-row-id="${CSS.escape(todo.id)}"]`)
      ?.getBoundingClientRect();
    setMenu({
      id: todo.id,
      anchor: at ?? {
        x: fallback?.left ?? 24,
        y: (fallback?.bottom ?? 24) + 4,
      },
      view: "main",
    });
  };

  const renderColumn = (list: SerializedList) => {
    const kind = list.systemKind ?? null;
    return (
      <Column
        key={list.id}
        listId={list.id}
        title={list.name}
        subline={columnSubline(kind, now, timeZone)}
        tinted={!kind}
        rows={rowsFor(list.id)}
        subtasksOf={subtasksOf}
        checked={actions.checked}
        collapsing={actions.collapsing}
        highlightedId={menu?.id ?? null}
        selectedId={selectedId}
        indicator={indicator}
        loading={loading}
        error={errorView}
        empty={EMPTY_COPY[kind ?? ""] ?? "Nothing here yet."}
        onClose={kind ? undefined : () => showDone("head")}
        onRename={
          kind
            ? undefined
            : (name) => updateList.mutate({ id: list.id, input: { name } })
        }
        onDelete={
          kind
            ? undefined
            : () => {
                actions.destroyList(list);
                showDone("head");
              }
        }
        note={
          kind === "today" && overnight.text ? (
            <OvernightNote
              text={overnight.text}
              onDismiss={overnight.dismiss}
              className="pt-1 pb-1.5"
            />
          ) : null
        }
        composer={
          <Composer
            variant="inline"
            currentListId={list.id}
            targets={targets}
            timeZone={timeZone}
            onView={viewList}
            textareaRef={(el) => {
              if (el) composers.current.set(list.id, el);
              else composers.current.delete(list.id);
            }}
          />
        }
        now={now}
        timeZone={timeZone}
        onSelect={select}
        onCheck={actions.complete}
        onOpen={onOpen}
        onMenu={onMenu}
      />
    );
  };

  return (
    <div
      data-wide-ready={loading ? undefined : ""}
      className="fixed inset-x-0 top-[var(--n-offline-inset,0px)] bottom-0 z-10 flex bg-n-canvas font-n-text text-n-ink antialiased"
    >
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={endDrag}
        autoScroll={{ layoutShiftCompensation: false }}
      >
        <Sidebar
          timeLists={timeLists}
          collections={collections}
          countFor={(id) => rowsFor(id).length}
          openListId={fourth === "list" && openList ? openList.id : null}
          selectionColumn={selectionColumn}
          doneShowing={fourth === "done"}
          doneCount={doneCount}
          onTimeList={(list) => focusColumn(list.id)}
          onCollection={(list) => openCollection(list)}
          onCreateList={addList}
          onDone={() => showDone()}
          onSettings={() => setSettings(true)}
          onShortcuts={() => setShortcuts(true)}
          onFeedback={canSendFeedback ? () => setFeedback(true) : undefined}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-16 shrink-0 items-center justify-end border-b border-n-hairline px-4">
            <div className="flex items-center gap-0.5 rounded-full border border-n-hairline bg-n-surface p-[3px]">
              <QuickAdd
                open={quickAdd}
                onOpenChange={setQuickAdd}
                trigger={
                  <button
                    type="button"
                    aria-label="New todo"
                    title="New todo"
                    className={TOOL_BUTTON}
                  >
                    <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                }
                startListId={
                  selectionColumn && selectionColumn !== DONE_COLUMN
                    ? selectionColumn
                    : (todayId ?? "")
                }
                targets={targets}
                timeZone={timeZone}
                countFor={(id) => rowsFor(id).length}
                isVisible={(id) => columnIds.includes(id)}
                onView={viewList}
              />
              <NewListPopover
                align="end"
                onCreate={addList}
                trigger={
                  <button
                    type="button"
                    aria-label="New list"
                    title="New list"
                    className={TOOL_BUTTON}
                  >
                    <ListPlus size={16} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                }
              />
            </div>
          </div>
          <main
            aria-label="Board"
            className="flex min-h-0 flex-1 overflow-x-auto"
          >
            {timeLists.map((list) => renderColumn(list))}
            {fourth === "detail" ? (
              <section
                ref={setFourthEl}
                aria-label="Todo"
                data-column-detail
                className="relative flex h-full min-w-[17rem] flex-1 basis-0 flex-col border-l border-n-hairline"
              />
            ) : fourth === "list" && openList ? (
              renderColumn(openList)
            ) : (
              <DoneColumn
                todos={doneTodos}
                listName={listName}
                now={now}
                timeZone={timeZone}
                selectedId={selectedId}
                onSelect={select}
                onRestore={actions.restore}
              />
            )}
          </main>
        </div>
        <DragOverlay dropAnimation={null}>
          {dragging ? (
            <div className="flex w-72 cursor-grabbing items-start gap-3 rounded-n-field border border-n-hairline bg-n-surface px-3 py-2.5">
              <span
                aria-hidden="true"
                className="mt-px size-[1.375rem] shrink-0 rounded-[6px] border-[1.75px] border-n-ink"
              />
              <span className="line-clamp-2 text-[0.9375rem] leading-[1.4] font-medium text-n-ink">
                {displayTitle(dragging)}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <ContextMenu
        todo={menuTodo}
        where={menuTodo ? listName(menuTodo.listId) : ""}
        moveTargets={targets.filter((t) => t.id !== menuTodo?.listId)}
        onClose={() => setMenu(null)}
        onMove={actions.move}
        onTogglePin={actions.togglePin}
        onDelete={actions.destroy}
        onSetDue={actions.setDue}
        timeZone={timeZone}
        anchor={menu?.anchor ?? null}
        initialView={menu?.view ?? "main"}
      />

      <DetailSheet
        variant="column"
        container={fourth === "detail" ? fourthEl : null}
        todo={detailTodo}
        subtasks={detailTodo ? subtasksOf(detailTodo.id) : []}
        listTargets={targets}
        listName={listName}
        timeZone={timeZone}
        actions={actions}
        onClose={closeDetail}
      />

      <ShortcutsOverlay
        open={shortcuts}
        onClose={() => setShortcuts(false)}
        feedback={canSendFeedback}
      />
      {canSendFeedback && (
        <FeedbackDialog
          open={feedback}
          onClose={() => setFeedback(false)}
          variant="centered"
        />
      )}

      <SettingsScreen open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}
