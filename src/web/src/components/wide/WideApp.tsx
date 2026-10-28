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
import { ListPlus, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Composer } from "@/components/phone/Composer";
import {
  ContextMenu,
  type MenuCommand,
  type MenuView,
} from "@/components/phone/ContextMenu";
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
import {
  CommandPalette,
  filterItems,
  type PaletteGroup,
  type PaletteItem,
} from "./CommandPalette";
import {
  type Board,
  COMMANDS,
  commandForKey,
  type JumpTarget,
  keyHint,
  visibleCommands,
} from "./commands";
import { DONE_COLUMN, DoneColumn } from "./DoneColumn";
import { resolveDrop } from "./drop";
import { isTypingTarget } from "./keys";
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

/** How long the G hint waits for the next key. */
const GO_HINT_MS = 1200;

/** A column to focus once it renders: a row, its Add field, or its title. */
interface PendingFocus {
  column: string;
  target: "row" | "composer" | "head";
  /** `row`: this todo's row rather than the remembered one. */
  rowId?: string;
}

type PaletteState =
  | { mode: "all" }
  | { mode: "lists" }
  | { mode: "move"; todoId: string };

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
  const [newListOpen, setNewListOpen] = useState(false);
  const [palette, setPalette] = useState<PaletteState | null>(null);
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
  const listKind = (listId: string) =>
    timeLists.find((l) => l.id === listId)?.systemKind ?? null;
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
   * Focus (and so select) a row in a column: `rowId`, else `index`, else
   * the column's last-selected todo, else its first. Its title when it has
   * no rows.
   */
  const focusColumn = useCallback(
    (listId: string, index?: number, rowId?: string) => {
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
      const remembered = rowId ?? lastSelected.current.get(listId);
      const target =
        (index === undefined || rowId
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
      focusColumn(pending.column, undefined, pending.rowId);
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
    rowId?: string,
  ) => {
    // Already showing: nothing re-renders, so go straight in.
    if (fourth === "list" && openListId === list.id && target === "row") {
      focusColumn(list.id, undefined, rowId);
      return;
    }
    setDetailId(null);
    setOpenListId(list.id);
    pendingFocus.current = { column: list.id, target, rowId };
  };

  const showDone = (target: PendingFocus["target"] = "row", rowId?: string) => {
    if (fourth === "done" && target === "row") {
      focusColumn(DONE_COLUMN, undefined, rowId);
      return;
    }
    setDetailId(null);
    setOpenListId(null);
    pendingFocus.current = { column: DONE_COLUMN, target, rowId };
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
  // Every key is a command in `commands.ts`; this is what each one does.

  const sidebar = () =>
    document.querySelector<HTMLElement>('aside[aria-label="Sidebar"]');
  const sidebarItemFor = (column: string | null) =>
    column
      ? sidebar()?.querySelector<HTMLElement>(
          column === DONE_COLUMN
            ? '[data-sidebar-item="done"]'
            : `[data-sidebar-list="${CSS.escape(column)}"]`,
        )
      : null;
  const inSidebar = () => !!sidebar()?.contains(document.activeElement);

  /** The selected row and its todo: open, or finished (in Done). */
  const current = () => {
    const row = focusedRow() ?? selectedRow();
    return {
      row,
      todo: todoById(row?.dataset.rowId),
      done: doneById(row?.dataset.rowId),
    };
  };
  const rowColumn = (row: HTMLElement | null) =>
    row?.dataset.rowList && columnIds.includes(row.dataset.rowList)
      ? row.dataset.rowList
      : currentColumn;

  const goPending = useRef(false);
  const goTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [goHint, setGoHint] = useState(false);
  const endGo = () => {
    goPending.current = false;
    if (goTimer.current) clearTimeout(goTimer.current);
    setGoHint(false);
  };
  useEffect(
    () => () => {
      if (goTimer.current) clearTimeout(goTimer.current);
    },
    [],
  );

  /** Go into a column: its remembered row, or `rowId` when given. */
  const jump = (target: JumpTarget, rowId?: string) => {
    if (target.kind === "done") return showDone("row", rowId);
    if (target.kind === "list") {
      const list = collections[target.index];
      if (list) openCollection(list, "row", rowId);
      return;
    }
    const list = byKind[target.list];
    if (list) focusColumn(list.id, undefined, rowId);
  };

  /** A todo chosen in the palette: its column, opened if need be, and it. */
  const goToTodo = (todo: TodoWithUrls) => {
    if (todo.completed) return jump({ kind: "done" }, todo.id);
    const index = collections.findIndex((l) => l.id === todo.listId);
    if (index !== -1) return jump({ kind: "list", index }, todo.id);
    focusColumn(todo.listId, undefined, todo.id);
  };

  const board: Board = {
    moveRow: (delta) => {
      if (inSidebar()) {
        const items = Array.from(
          sidebar()?.querySelectorAll<HTMLElement>("[data-sidebar-nav]") ?? [],
        );
        const at = items.indexOf(document.activeElement as HTMLElement);
        items[at + delta]?.focus();
        return;
      }
      const { row } = current();
      const column = rowColumn(row);
      if (!column) return;
      const rows = columnRows(column);
      const at = row ? rows.indexOf(row) : -1;
      if (at === -1) rows[0]?.focus();
      else rows[at + delta]?.focus();
    },
    moveColumn: (delta) => {
      if (inSidebar()) {
        // → goes into the column, as a click; New list, Settings and
        // Keyboard shortcuts take Enter instead.
        const el = document.activeElement as HTMLElement;
        if (delta === 1 && (el.dataset.sidebarList || el.dataset.sidebarItem)) {
          el.click();
        }
        return;
      }
      const { row } = current();
      const column = rowColumn(row);
      if (!column) return;
      const at = columnIds.indexOf(column);
      if (at === 0 && delta === -1) {
        sidebarItemFor(column)?.focus();
        return;
      }
      const to = columnIds[at + delta];
      if (!to) return;
      const index = row ? columnRows(column).indexOf(row) : 0;
      focusColumn(to, Math.max(0, index));
    },
    back: () => {
      if (detailTodo) closeDetail();
      else sidebarItemFor(selectionColumn ?? currentColumn)?.focus();
    },
    open: () => {
      const { todo } = current();
      if (todo) onOpen(todo);
    },
    done: () => {
      const { row, todo, done } = current();
      if (!row) return;
      if (done) {
        focusNeighbour(row);
        actions.restore(done);
      } else if (todo) {
        focusNeighbour(row);
        actions.complete(todo);
      }
    },
    move: (kind) => {
      const { row, todo } = current();
      const target = byKind[kind];
      if (!row || !todo || !target || target.id === todo.listId) return;
      focusNeighbour(row);
      actions.move(todo, target.id);
    },
    moveTo: () => {
      const { todo } = current();
      if (todo) setPalette({ mode: "move", todoId: todo.id });
    },
    pin: () => {
      const { todo } = current();
      if (todo) actions.togglePin(todo);
    },
    due: () => {
      const { row, todo } = current();
      if (!row || !todo) return;
      const rect = row.getBoundingClientRect();
      setMenu({
        id: todo.id,
        anchor: { x: rect.left, y: rect.bottom + 4 },
        view: "due",
      });
    },
    remove: () => {
      const { row, todo, done } = current();
      const target = todo ?? done;
      if (!row || !target) return;
      focusNeighbour(row);
      actions.destroy(target);
    },
    newTodo: () => setQuickAdd(true),
    newList: () => setNewListOpen(true),
    undo: () => runToastUndo(),
    palette: () => setPalette((p) => (p ? null : { mode: "all" })),
    jump,
    startGo: () => {
      goPending.current = true;
      setGoHint(true);
      if (goTimer.current) clearTimeout(goTimer.current);
      goTimer.current = setTimeout(endGo, GO_HINT_MS);
    },
    goToList: () => setPalette({ mode: "lists" }),
    shortcuts: () => setShortcuts((s) => !s),
    feedback: () => {
      if (canSendFeedback) setFeedback(true);
    },
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      // After G, the next key is a destination; anything else cancels the
      // G and does its usual job.
      const afterG = goPending.current;
      if (afterG) endGo();
      const hit =
        (afterG ? commandForKey(e, { afterG: true }) : null) ??
        commandForKey(e);
      if (!hit) return;
      const { command, arg } = hit;
      if (!command.anywhere && isTypingTarget(e.target)) return;
      if (command.admin && !canSendFeedback) return;
      // Settings and Send feedback are modal; leave their keys alone, ⌘K
      // included, or the palette would act on the board behind them.
      if (settings || feedback) return;
      // Keys that act on a todo act on the selection while focus is on the
      // board (or nowhere), not from the sidebar or toolbar.
      if (command.needsSelection) {
        const active = document.activeElement;
        const onBoard =
          !active || active === document.body || !!active.closest("main");
        if (!onBoard) return;
      }
      e.preventDefault();
      command.run(board, arg);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // --- Palette --------------------------------------------------------------

  const countLabel = (n: number) => String(n);
  const goToItems = (): PaletteItem[] => [
    ...timeLists.map((l) => ({
      id: `go:${l.id}`,
      label: l.name,
      meta: countLabel(rowsFor(l.id).length),
      hint: keyHint(`go-${l.systemKind}`),
      run: () => focusColumn(l.id),
    })),
    ...collections.map((l, index) => ({
      id: `go:${l.id}`,
      label: l.name,
      meta: countLabel(rowsFor(l.id).length),
      hint: index < 6 ? `⇧${index + 4}` : undefined,
      run: () => openCollection(l),
    })),
    {
      id: "go:done",
      label: "Done",
      meta: countLabel(doneCount),
      hint: keyHint("go-done"),
      run: () => showDone(),
    },
  ];

  const commandItems = (): PaletteItem[] => {
    const selected = current().todo ?? null;
    return visibleCommands(canSendFeedback).flatMap((c) => {
      const label = c.palette?.(selected);
      if (!label) return [];
      return [
        {
          id: `cmd:${c.id}`,
          label,
          hint: keyHint(c.id),
          run: () => c.run(board),
        },
      ];
    });
  };

  const todoItems = (query: string): PaletteItem[] => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return todos
      .filter(
        (t) =>
          t.parentId == null &&
          !actions.hidden.has(t.id) &&
          !actions.hiddenLists.has(t.listId) &&
          displayTitle(t).toLowerCase().includes(q),
      )
      .slice(0, 8)
      .map((t) => ({
        id: `todo:${t.id}`,
        label: displayTitle(t),
        meta: t.completed ? "Done" : listName(t.listId),
        run: () => goToTodo(t),
      }));
  };

  const moveToNewList = (todo: TodoWithUrls, name: string) => {
    const last = collections[collections.length - 1];
    createList.mutate(
      { name, position: generateKeyBetween(last?.position ?? null, null) },
      { onSuccess: (created) => actions.move(todo, created.id, { name }) },
    );
  };

  const paletteTodo =
    palette?.mode === "move" ? todoById(palette.todoId) : undefined;

  const paletteGroups = (query: string): PaletteGroup[] => {
    if (palette?.mode === "lists") {
      return [{ label: "Lists", items: filterItems(goToItems(), query) }];
    }
    if (palette?.mode === "move") {
      const todo = paletteTodo;
      if (!todo) return [];
      const lists = [...timeLists, ...collections].filter(
        (l) => l.id !== todo.listId,
      );
      const items: PaletteItem[] = filterItems(
        lists.map((l) => ({
          id: `move:${l.id}`,
          label: l.name,
          meta: countLabel(rowsFor(l.id).length),
          hint: l.systemKind ? keyHint(`move-${l.systemKind}`) : undefined,
          run: () => {
            const row = selectedRow();
            if (row && selectedId === todo.id) focusNeighbour(row);
            actions.move(todo, l.id);
          },
        })),
        query,
      );
      const name = query.replace(/\s+/g, " ").trim();
      const exists = [...timeLists, ...collections].some(
        (l) => l.name.toLowerCase() === name.toLowerCase(),
      );
      if (name && !exists) {
        items.push({
          id: "move:new",
          label: `New list “${name}”`,
          run: () => {
            const row = selectedRow();
            if (row && selectedId === todo.id) focusNeighbour(row);
            moveToNewList(todo, name);
          },
        });
      }
      return [{ label: "Move to", items }];
    }
    return [
      { label: "Todos", items: todoItems(query) },
      { label: "Go to", items: filterItems(goToItems(), query) },
      { label: "Commands", items: filterItems(commandItems(), query) },
    ];
  };

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
  /** The right-click menu: the registry's menu commands for this todo. */
  const menuCommands = (todo: TodoWithUrls): MenuCommand[] =>
    COMMANDS.flatMap((c) => {
      if (!c.menu) return [];
      if (c.id === `move-${listKind(todo.listId)}`) return [];
      return [
        {
          id: c.id,
          label: c.menu(todo),
          hint: keyHint(c.id),
          run: () => c.run(board),
        },
      ];
    });

  const onMenu = (todo: TodoWithUrls, at?: { x: number; y: number }) => {
    // The menu's commands act on the selection, so right-click selects.
    select(todo);
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
              <button
                type="button"
                aria-label="Search and commands"
                title="Search and commands (⌘K)"
                aria-keyshortcuts="Meta+K Control+K"
                onClick={() => setPalette({ mode: "all" })}
                className={TOOL_BUTTON}
              >
                <Search size={16} strokeWidth={2.2} aria-hidden="true" />
              </button>
              <QuickAdd
                open={quickAdd}
                onOpenChange={setQuickAdd}
                trigger={
                  <button
                    type="button"
                    aria-label="New todo"
                    title="New todo (N)"
                    aria-keyshortcuts="N"
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
                returnFocus={selectedRow}
              />
              <NewListPopover
                align="end"
                open={newListOpen}
                onOpenChange={setNewListOpen}
                returnFocus={selectedRow}
                onCreate={addList}
                trigger={
                  <button
                    type="button"
                    aria-label="New list"
                    title="New list (⇧N)"
                    aria-keyshortcuts="Shift+N"
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
        commands={menuTodo ? menuCommands(menuTodo) : undefined}
      />

      <CommandPalette
        open={!!palette && (palette.mode !== "move" || !!paletteTodo)}
        onClose={() => setPalette(null)}
        title={
          palette?.mode === "move" && paletteTodo
            ? `Move “${displayTitle(paletteTodo)}”`
            : palette?.mode === "lists"
              ? "Go to a list"
              : undefined
        }
        placeholder={
          palette?.mode === "move"
            ? "Move to a list…"
            : palette?.mode === "lists"
              ? "Go to a list…"
              : "Search todos, lists and commands…"
        }
        groups={paletteGroups}
        returnFocus={selectedRow}
      />

      {goHint && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 animate-n-fade-in items-center gap-3 rounded-[0.75rem] border border-n-hairline bg-n-surface px-4 py-2.5 text-[0.8125rem] text-n-ink-muted shadow-[0_10px_30px_color-mix(in_srgb,black_14%,transparent)]"
        >
          {[
            ["G", "Go to"],
            ["T", "Today"],
            ["W", "This week"],
            ["S", "Someday"],
            ["D", "Done"],
            ["L", "Lists"],
          ].map(([key, label]) => (
            <span key={key} className="flex items-center gap-1.5">
              <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-n-chip border border-n-hairline bg-n-canvas px-1.5 font-n-text font-medium text-n-ink">
                {key}
              </kbd>
              {label}
            </span>
          ))}
        </div>
      )}

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
