import { DndContext, DragOverlay, pointerWithin } from "@dnd-kit/core";
import {
  BOARD_TIME_KINDS,
  type BoardTimeKind,
  type BoardView,
} from "@nylon-impossible/shared";
import { generateKeyBetween } from "fractional-indexing";
import { List } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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
} from "@/components/phone/model";
import {
  OvernightPill,
  useOvernightNote,
} from "@/components/phone/OvernightNote";
import { SettingsScreen } from "@/components/phone/SettingsScreen";
import { useBoardData } from "@/components/phone/useBoardData";
import { useHints } from "@/hooks/useHints";
import { useCreateList, useUpdateList } from "@/hooks/useLists";
import type { SerializedList, TodoWithUrls } from "@/types/database";
import { FeedbackDialog, useCanSendFeedback } from "../FeedbackDialog";
import {
  boardSlots,
  createBoard,
  revealSpan,
  sheetScrollTarget,
} from "./board";
import { columnRows, rowById } from "./boardDom";
import { Column } from "./Column";
import { CommandPalette } from "./CommandPalette";
import { COMMANDS, type JumpTarget, keyHint } from "./commands";
import { DONE_COLUMN, DoneColumn } from "./DoneColumn";
import { GoHint } from "./GoHint";
import { type PaletteState, paletteGroups } from "./paletteGroups";
import { ShortcutsOverlay } from "./ShortcutsOverlay";
import { Sidebar } from "./Sidebar";
import { SkeletonComposer } from "./Skeleton";
import { settleTiming } from "./settle";
import { holdLeavingSheet, type Placed, slideColumns, spanOf } from "./slide";
import { Toolbar } from "./Toolbar";
import { DragPreview, useBoardDrag } from "./useBoardDrag";
import { useBoardKeys } from "./useBoardKeys";
import { useGoSequence } from "./useGoSequence";
import { useKeyboardModality } from "./useKeyboardModality";

/** The time columns' names, known before the lists arrive. */
const TIME_TITLES: Record<BoardTimeKind, string> = {
  today: "Today",
  thisWeek: "This week",
  someday: "Someday",
};
const EMPTY_ROWS: TodoWithUrls[] = [];

const EMPTY_COPY: Record<string, string> = {
  today: "Nothing today.",
  thisWeek: "A clear week.",
  someday: "Nothing here yet.",
};

/** Bring a row into view within its column, without scrolling the board. */
function revealInColumn(row: HTMLElement) {
  const body = row.closest<HTMLElement>("[data-column-body]");
  const box = (row.closest("li") ?? row).getBoundingClientRect();
  if (!body) return;
  const view = body.getBoundingClientRect();
  if (box.top < view.top) body.scrollTop -= view.top - box.top;
  else if (box.bottom > view.bottom) body.scrollTop += box.bottom - view.bottom;
}

/** A column to focus once it renders: its Add field, or its title. */
interface PendingFocus {
  column: string;
  target: "composer" | "head";
}

interface MenuState {
  id: string;
  anchor: { x: number; y: number };
  view: MenuView;
}

/** The sheet as drawn: the open todo, or the last one while it slides away. */
interface ShownSheet {
  todo: TodoWithUrls;
  /** The column it's laid beside. */
  column: string;
  leaving: boolean;
}

/** How long a closing sheet may take before it's taken away regardless. */
const SHEET_EXIT_MS = 1000;

/**
 * The wide layout (web 1024px and up): the sidebar, a toolbar, then one row
 * of columns that scrolls sideways: Today, This week, Someday, every one of
 * your lists in the sidebar's order, then Done. Nothing is swapped in or
 * out, and every column keeps its width.
 *
 * Selection is state, not DOM focus. Focusing a row selects it; one click
 * selects, a second click, a double click or Enter opens it in a sheet laid
 * on the board right after its column, and while a todo is open the sheet
 * follows the selection. The columns after it slide along to make room.
 * Rows, menus, the composer and the detail are the phone's components at
 * board density, driven by the same `useBoardData`.
 */
export function WideApp({
  view = null,
  onNavigate,
}: {
  /** The view the URL names: `/list/:id` goes to that list's column. */
  view?: BoardView | null;
  /** Keeps the URL naming your list while the selection is in it. */
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
    listInSentence,
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

  const [detailId, setDetailId] = useState<string | null>(null);
  /** The column last gone to or selected in, which the URL names. */
  const [urlColumn, setUrlColumn] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [settings, setSettings] = useState(false);
  const [quickAdd, setQuickAdd] = useState(false);
  const [newListOpen, setNewListOpen] = useState(false);
  const [palette, setPalette] = useState<PaletteState | null>(null);
  const [sheetEl, setSheetEl] = useState<HTMLElement | null>(null);
  const boardRow = useRef<HTMLElement>(null);
  const [shortcuts, setShortcuts] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const canSendFeedback = useCanSendFeedback();
  const composers = useRef(new Map<string, HTMLTextAreaElement>());
  const drag = useBoardDrag({
    rowsFor,
    actions,
    onStart: () => setMenu(null),
    board: () => boardRow.current,
  });
  const go = useGoSequence();
  const pendingFocus = useRef<PendingFocus | null>(null);
  /** The last todo selected in each column, so going back lands on it. */
  const lastSelected = useRef(new Map<string, string>());

  const now = new Date();
  const overnight = useOvernightNote(todos, byKind.today?.id);
  const timeLists = BOARD_TIME_KINDS.map((kind) => byKind[kind]).filter(
    (l): l is SerializedList => l !== undefined,
  );
  /** Every list, in the board's (and the sidebar's) order. */
  const boardLists = [...timeLists, ...collections];
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
  // The columns with rows, left to right; the sheet has none.
  const columnIds = [...boardLists.map((l) => l.id), DONE_COLUMN];
  const animated = reducedMotion !== "reduce";

  // The sheet stays drawn while it slides away, so the open todo's state is
  // kept a render longer than `detailTodo`. Adjusted while rendering, so
  // the sheet never drops out of the row for a frame. It compares the todo
  // itself, not its id: an edit or a move to another list arrives as a new
  // object, and the sheet has to draw it (and follow it to its new column).
  const [sheet, setSheet] = useState<ShownSheet | null>(null);
  if (detailTodo) {
    if (sheet?.todo !== detailTodo || sheet.leaving) {
      setSheet({ todo: detailTodo, column: detailTodo.listId, leaving: false });
    }
  } else if (sheet && !sheet.leaving) {
    setSheet(animated ? { ...sheet, leaving: true } : null);
  }
  /** The column whose todo is open, while it's open. */
  const sheetColumn = sheet && !sheet.leaving ? sheet.column : null;
  const sheetGone = useCallback(
    () => setSheet((s) => (s?.leaving ? null : s)),
    [],
  );
  // In case its exit never reports back (its column went with it).
  useEffect(() => {
    if (!sheet?.leaving) return;
    const gone = setTimeout(sheetGone, SHEET_EXIT_MS);
    return () => clearTimeout(gone);
  }, [sheet?.leaving, sheetGone]);
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

  // --- Board motion -------------------------------------------------------
  // After every render: the closing sheet leaves the row, the columns that
  // moved slide to their new places, and a todo that opened or changed
  // column brings its column and sheet into view together.

  const placed = useRef<Placed>(new Map());
  const revealedFor = useRef<string | null>(null);
  useLayoutEffect(() => {
    const row = boardRow.current;
    if (!row) return;
    holdLeavingSheet(sheetEl, !!sheet?.leaving);
    slideColumns(row, placed.current, animated ? settleTiming() : null);
    if (sheetColumn === revealedFor.current) return;
    if (!sheetColumn) {
      revealedFor.current = null;
      return;
    }
    const section = row.querySelector<HTMLElement>(
      `:scope > [data-column="${CSS.escape(sheetColumn)}"]`,
    );
    // The sheet's element arrives a render after it does.
    if (!section || !sheetEl) return;
    revealedFor.current = sheetColumn;
    const left = sheetScrollTarget(
      { scrollLeft: row.scrollLeft, width: row.clientWidth },
      spanOf(section),
      spanOf(sheetEl),
    );
    if (left !== row.scrollLeft) {
      row.scrollTo?.({ left, behavior: animated ? "smooth" : "auto" });
    }
  });

  // --- Focus ----------------------------------------------------------------

  /** Scroll the board the least that shows a column whole. */
  const revealColumn = useCallback(
    (section: HTMLElement) => {
      const row = boardRow.current;
      if (!row) return;
      const left = revealSpan(
        { scrollLeft: row.scrollLeft, width: row.clientWidth },
        spanOf(section),
      );
      if (left !== row.scrollLeft) {
        row.scrollTo?.({ left, behavior: animated ? "smooth" : "auto" });
      }
    },
    [animated],
  );

  /**
   * Focus (and so select) a row in a column: `rowId`, else `index`, else
   * the column's last-selected todo, else its first. Its title when it has
   * no rows. The board scrolls to show the column.
   */
  const focusColumn = useCallback(
    (listId: string, index?: number, rowId?: string) => {
      const section = document.querySelector<HTMLElement>(
        `[data-column="${CSS.escape(listId)}"]`,
      );
      if (!section) return false;
      revealColumn(section);
      setUrlColumn(listId);
      const rows = columnRows(listId);
      const remembered = rowId ?? lastSelected.current.get(listId);
      const target =
        (index === undefined || rowId
          ? rows.find((r) => r.dataset.rowId === remembered)
          : rows[Math.min(index, rows.length - 1)]) ??
        rows[0] ??
        section.querySelector<HTMLElement>("[data-column-head]");
      // The board scrolls itself, smoothly; the focus only brings the row
      // into view within its column.
      target?.focus({ preventScroll: true });
      if (target && rows.length > 0) revealInColumn(target);
      return true;
    },
    [revealColumn],
  );

  // A column that's about to render (a new list) or move (beside a deleted
  // one) takes focus once it has.
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending || !columnIds.includes(pending.column)) return;
    pendingFocus.current = null;
    const section = document.querySelector<HTMLElement>(
      `[data-column="${CSS.escape(pending.column)}"]`,
    );
    if (section) revealColumn(section);
    const target =
      pending.target === "composer"
        ? composers.current.get(pending.column)
        : section?.querySelector<HTMLElement>("[data-column-head]");
    target?.focus({ preventScroll: true });
  });

  // --- URL ------------------------------------------------------------------
  // `/list/:id` and the time lists' URLs go to their column on arrival.
  // While you're in one of your lists, the URL names it.

  const urlKey = boardViewKey(view, lists);
  // The URL the board has already acted on. Both effects below write it:
  // the first when a new URL arrives, the second just before it navigates,
  // so the URL it asks for is already "applied" when it lands and the first
  // doesn't move focus again. They run in this order in the same commit
  // (the lists arriving), so the first has to stay above the second.
  const appliedUrlKey = useRef<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the URL changes, once lists are in
  useEffect(() => {
    if (loading || urlKey === appliedUrlKey.current) return;
    appliedUrlKey.current = urlKey;
    const kind = BOARD_TIME_KINDS.find((k) => k === urlKey);
    const id = urlKey.startsWith("list:")
      ? urlKey.slice(5)
      : kind
        ? byKind[kind]?.id
        : undefined;
    // Only an explicit `/this-week` moves focus; `/` leaves the page alone.
    if (!view || !id) return;
    // A list that's gone: back to `/`.
    if (!focusColumn(id) && urlKey.startsWith("list:")) {
      appliedUrlKey.current = boardViewKey(null, lists);
      onNavigate?.(null);
    }
  }, [urlKey, loading]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when you go to another column
  useEffect(() => {
    if (loading || !urlColumn) return;
    if (collections.some((l) => l.id === urlColumn)) {
      const key = `list:${urlColumn}`;
      if (urlKey === key) return;
      // Already there: don't go to it again when the URL arrives.
      appliedUrlKey.current = key;
      onNavigate?.({ kind: "list", id: urlColumn });
    } else if (urlKey.startsWith("list:")) {
      appliedUrlKey.current = boardViewKey(null, lists);
      onNavigate?.(null);
    }
  }, [urlColumn, loading]);

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
    setUrlColumn(column);
    // While a todo is open, the sheet follows the selection; Done's todos
    // don't open, so going into Done closes it.
    setDetailId((open) =>
      open && todo.completed ? null : open && open !== todo.id ? todo.id : open,
    );
  }, []);

  const selectedRow = () => rowById(selectedId);

  const closeDetail = () => {
    setDetailId(null);
    // Back to the selected row, which is where the keyboard left off.
    requestAnimationFrame(() => selectedRow()?.focus());
  };

  // --- Sidebar --------------------------------------------------------------
  // Every list is on the board: an entry scrolls to its column and goes in.

  /** Done: its column, closing the open todo. */
  const showDone = (rowId?: string) => {
    setDetailId(null);
    focusColumn(DONE_COLUMN, undefined, rowId);
  };

  const addList = (name: string) => {
    const last = collections[collections.length - 1];
    createList.mutate(
      { name, position: generateKeyBetween(last?.position ?? null, null) },
      {
        // Its column arrives in place; put the cursor in its Add field.
        onSuccess: (created) => {
          pendingFocus.current = { column: created.id, target: "composer" };
        },
      },
    );
  };

  /** Delete your list; the column it leaves beside takes the keyboard. */
  const deleteList = (list: SerializedList) => {
    const at = columnIds.indexOf(list.id);
    if (detailTodo?.listId === list.id) setDetailId(null);
    actions.destroyList(list);
    const before = columnIds[at - 1];
    if (before) pendingFocus.current = { column: before, target: "head" };
  };

  /** "View" on an "Added to …" toast. */
  const viewList = (listId: string) => {
    focusColumn(listId);
  };

  // --- Keyboard -------------------------------------------------------------
  // Every key is a command in `commands.ts`, run against this board.

  /** Go into a column: its remembered row, or `rowId` when given. */
  const jump = (target: JumpTarget, rowId?: string) => {
    if (target.kind === "done") return showDone(rowId);
    const list =
      target.kind === "list" ? collections[target.index] : byKind[target.list];
    if (list) focusColumn(list.id, undefined, rowId);
  };

  /** A todo chosen in the palette: its column, and it. */
  const goToTodo = (todo: TodoWithUrls) => {
    if (todo.completed) return showDone(todo.id);
    focusColumn(todo.listId, undefined, todo.id);
  };

  const board = createBoard({
    columnIds,
    currentColumn,
    selectionColumn,
    detailOpen: !!detailTodo,
    byKind,
    actions,
    todoById,
    doneById,
    selectedRow,
    focusColumn,
    clearSelection: () => setSelectedId(null),
    focusNeighbour: (row) => focusNeighbour(row),
    open: (todo) => onOpen(todo),
    closeDetail: () => closeDetail(),
    openDueMenu: (todo, row) => {
      const rect = row.getBoundingClientRect();
      setMenu({
        id: todo.id,
        anchor: { x: rect.left, y: rect.bottom + 4 },
        view: "due",
      });
    },
    openMoveTo: (todo) => setPalette({ mode: "move", todoId: todo.id }),
    jump,
    startGo: go.start,
    newTodo: () => setQuickAdd(true),
    newList: () => setNewListOpen(true),
    togglePalette: () => setPalette((p) => (p ? null : { mode: "all" })),
    goToList: () => setPalette({ mode: "lists" }),
    toggleShortcuts: () => setShortcuts((s) => !s),
    feedback: () => {
      if (canSendFeedback) setFeedback(true);
    },
  });

  // Moving with the keys adds a bar beside the selected row (TodoRow).
  const boardRoot = useRef<HTMLDivElement>(null);
  useKeyboardModality(boardRoot);

  useBoardKeys({
    board,
    takeGo: go.take,
    admin: canSendFeedback,
    modal: settings || feedback,
  });

  // --- Palette --------------------------------------------------------------

  const moveToNewList = (todo: TodoWithUrls, name: string) => {
    const last = collections[collections.length - 1];
    createList.mutate(
      { name, position: generateKeyBetween(last?.position ?? null, null) },
      { onSuccess: (created) => actions.move(todo, created.id, { name }) },
    );
  };

  /** Moving from the palette hands the selection on, as 1/2/3 do. */
  const leaveRow = (todo: TodoWithUrls) => {
    const row = selectedRow();
    if (row && selectedId === todo.id) focusNeighbour(row);
  };

  const paletteTodo =
    palette?.mode === "move" ? todoById(palette.todoId) : undefined;

  const groupsFor = (query: string) =>
    paletteGroups(
      palette,
      paletteTodo,
      {
        timeLists,
        collections,
        countFor: (id) => rowsFor(id).length,
        doneCount,
        todos,
        searchable: (t) =>
          !actions.hidden.has(t.id) && !actions.hiddenLists.has(t.listId),
        listName,
        selected: todoById(selectedId) ?? null,
        admin: canSendFeedback,
        board,
        goToColumn: (list) => focusColumn(list.id),
        showDone: () => showDone(),
        goToTodo,
        moveTodo: (todo, listId) => {
          leaveRow(todo);
          actions.move(todo, listId);
        },
        moveToNewList: (todo, name) => {
          leaveRow(todo);
          moveToNewList(todo, name);
        },
      },
      query,
    );

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
    if (drag.justDragged.current) return;
    select(todo);
    setDetailId(todo.id);
  };
  /**
   * A single todo just added, from a column's Add or Quick add: it opens
   * beside its column and becomes the selection, while focus stays where
   * you were typing (the sheet doesn't take it).
   */
  const onAdded = (todo: TodoWithUrls) => {
    select(todo);
    setDetailId(todo.id);
  };
  /** The right-click menu: the registry's menu commands for this todo. */
  const menuCommands = (todo: TodoWithUrls): MenuCommand[] =>
    COMMANDS.flatMap((c) => {
      if (!c.menu) return [];
      if (c.id === `move-${listKind(todo.listId)}`) return [];
      if (c.id === "open-link" && todo.urls.length === 0) return [];
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

  /**
   * A click on a column's empty space: the column takes the keyboard (its
   * title has focus), but nothing is selected, so ↓ starts at its top. An
   * open todo stays open, as on Apple.
   */
  const softFocus = (listId: string) => {
    setSelectedId(null);
    setUrlColumn(listId);
    document
      .querySelector<HTMLElement>(
        `[data-column="${CSS.escape(listId)}"] [data-column-head]`,
      )
      ?.focus({ preventScroll: true });
  };

  const renderColumn = (list: SerializedList) => {
    const kind = list.systemKind ?? null;
    return (
      <Column
        key={list.id}
        listId={list.id}
        onBackgroundClick={() => softFocus(list.id)}
        title={list.name}
        subline={columnSubline(kind, now, timeZone)}
        sheetOpen={sheetColumn === list.id}
        rows={rowsFor(list.id)}
        subtasksOf={subtasksOf}
        checked={actions.checked}
        collapsing={actions.collapsing}
        highlightedId={menu?.id ?? null}
        selectedId={selectedId}
        indicator={drag.indicator}
        settle={drag.settle}
        loading={loading}
        error={errorView}
        empty={EMPTY_COPY[kind ?? ""] ?? "Nothing here yet."}
        onRename={
          kind
            ? undefined
            : (name) => updateList.mutate({ id: list.id, input: { name } })
        }
        onDelete={kind ? undefined : () => deleteList(list)}
        icon={
          kind ? undefined : (
            <List size={16} aria-hidden="true" data-icon="list" />
          )
        }
        banner={
          kind === "today" && overnight.text ? (
            <OvernightPill
              text={overnight.text}
              onSee={() => {
                const target = byKind[overnight.seeKind];
                if (target) focusColumn(target.id, 0);
              }}
              onDismiss={overnight.dismiss}
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
            onAdded={onAdded}
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

  /**
   * A time column before the lists arrive. Their names are fixed, so the
   * board is drawn at its real widths from the first paint (the same header,
   * subline and banner space as the loaded column), with placeholder rows,
   * rather than Done filling the board. Nothing in it takes focus.
   */
  const renderSkeletonColumn = (kind: BoardTimeKind) => (
    <Column
      key={`skeleton-${kind}`}
      listId={`skeleton-${kind}`}
      title={TIME_TITLES[kind]}
      subline={columnSubline(kind, now, timeZone)}
      rows={EMPTY_ROWS}
      subtasksOf={() => EMPTY_ROWS}
      checked={actions.checked}
      collapsing={actions.collapsing}
      highlightedId={null}
      selectedId={null}
      indicator={null}
      loading
      error={null}
      empty=""
      composer={<SkeletonComposer />}
      now={now}
      timeZone={timeZone}
      onSelect={select}
      onCheck={actions.complete}
      onOpen={onOpen}
      onMenu={onMenu}
    />
  );
  const skeleton = loading && timeLists.length === 0;

  // The board's end, past Done: the hatch, in whatever width the columns
  // leave. Always in the row, so it shrinks rather than appears. Nothing in
  // it to click (principle 4).
  const renderEnd = () => (
    <div
      key="end"
      aria-hidden="true"
      data-slide="end"
      data-board-end
      className="n-board-hatch min-w-0 flex-1"
    />
  );

  const renderDone = () => (
    <DoneColumn
      key={DONE_COLUMN}
      todos={doneTodos}
      listName={listName}
      listInSentence={listInSentence}
      now={now}
      timeZone={timeZone}
      selectedId={selectedId}
      onSelect={select}
      onRestore={actions.restore}
      onBackgroundClick={() => softFocus(DONE_COLUMN)}
      loading={loading}
    />
  );

  return (
    <div
      data-wide-ready={loading ? undefined : ""}
      ref={boardRoot}
      aria-busy={loading || undefined}
      className="group/board fixed inset-x-0 top-[var(--n-offline-inset,0px)] bottom-0 z-10 flex bg-n-canvas pb-[env(safe-area-inset-bottom,0px)] font-n-text text-n-ink antialiased"
    >
      <DndContext
        sensors={drag.sensors}
        collisionDetection={pointerWithin}
        {...drag.handlers}
        // The board's sideways scroll is the drag's own (`useBoardDrag`),
        // from its edges; dnd-kit scrolls the columns up and down.
        autoScroll={{
          layoutShiftCompensation: false,
          canScroll: (el) => el !== boardRow.current,
        }}
      >
        <Sidebar
          timeLists={timeLists}
          collections={collections}
          countFor={(id) => rowsFor(id).length}
          selectionColumn={selectionColumn}
          doneCount={doneCount}
          onTimeList={(list) => focusColumn(list.id)}
          onCollection={(list) => focusColumn(list.id)}
          onCreateList={addList}
          onDone={() => showDone()}
          onSettings={() => setSettings(true)}
          onShortcuts={() => setShortcuts(true)}
          onFeedback={canSendFeedback ? () => setFeedback(true) : undefined}
          loading={loading}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Toolbar
            onSearch={() => setPalette({ mode: "all" })}
            quickAdd={{
              open: quickAdd,
              onOpenChange: setQuickAdd,
              startListId:
                selectionColumn && selectionColumn !== DONE_COLUMN
                  ? selectionColumn
                  : (todayId ?? ""),
              targets,
              timeZone,
              countFor: (id) => rowsFor(id).length,
              isVisible: (id) => columnIds.includes(id),
              onView: viewList,
              onAdded,
              returnFocus: selectedRow,
            }}
            newList={{
              open: newListOpen,
              onOpenChange: setNewListOpen,
              returnFocus: selectedRow,
              onCreate: addList,
            }}
          />
          {/* One row of columns that scrolls sideways; each child is named
              by `data-slide` so it slides when the row changes. The size
              container the columns' width is a quarter of. */}
          <main
            ref={boardRow}
            aria-label="Board"
            className="@container relative flex min-h-0 flex-1 overflow-x-auto [scrollbar-width:thin]"
          >
            {skeleton
              ? [
                  ...BOARD_TIME_KINDS.map(renderSkeletonColumn),
                  renderDone(),
                  renderEnd(),
                ]
              : boardSlots(boardLists, sheet?.column ?? null).map((slot) =>
                  slot.kind === "list" ? (
                    renderColumn(slot.list)
                  ) : slot.kind === "done" ? (
                    renderDone()
                  ) : slot.kind === "end" ? (
                    renderEnd()
                  ) : (
                    // The open todo's sheet: laid over its column's right
                    // edge, above the columns around it.
                    <div
                      key="sheet"
                      ref={setSheetEl}
                      data-slide="sheet"
                      data-board-sheet
                      className="relative top-0 bottom-0 z-10 -ml-(--n-sheet-overlap) w-(--n-sheet-width) shrink-0"
                    />
                  ),
                )}
          </main>
        </div>
        <DragOverlay dropAnimation={null}>
          {drag.dragging ? <DragPreview todo={drag.dragging} /> : null}
        </DragOverlay>
      </DndContext>

      <ContextMenu
        todo={menuTodo}
        where={menuTodo ? listName(menuTodo.listId) : ""}
        listKind={menuTodo ? listKind(menuTodo.listId) : null}
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
        groups={groupsFor}
        returnFocus={selectedRow}
      />

      {go.hint && <GoHint />}

      <DetailSheet
        variant="column"
        container={sheetEl}
        todo={sheet?.todo ?? null}
        open={!!sheet && !sheet.leaving}
        onExited={sheetGone}
        animated={animated}
        subtasks={sheet ? subtasksOf(sheet.todo.id) : []}
        listTargets={targets}
        listName={listName}
        listInSentence={listInSentence}
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
