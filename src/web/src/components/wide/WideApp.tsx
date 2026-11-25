import { DndContext, DragOverlay, pointerWithin } from "@dnd-kit/core";
import {
  BOARD_TIME_KINDS,
  type BoardTimeKind,
  type BoardView,
  EMPTY_COPY,
  EMPTY_NEXT,
  waitingIn,
} from "@nylon-impossible/shared";
import { useHydrated } from "@tanstack/react-router";
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
  viewForList,
} from "@/components/phone/model";
import {
  OvernightPill,
  useOvernightNote,
} from "@/components/phone/OvernightNote";
import { SettingsScreen } from "@/components/phone/SettingsScreen";
import { useBoardData } from "@/components/phone/useBoardData";
import { useHints } from "@/hooks/useHints";
import {
  useCreateList,
  useReorderLists,
  useUpdateList,
} from "@/hooks/useLists";
import { stepMoves } from "@/lib/listOrder";
import { messageFromError, toast } from "@/lib/toast";
import type { SerializedList, TodoWithUrls } from "@/types/database";
import { FeedbackDialog, useCanSendFeedback } from "../FeedbackDialog";
import {
  boardSlots,
  createBoard,
  revealSpan,
  sheetScrollTarget,
  shownColumns,
} from "./board";
import {
  columnHead,
  columnRows,
  rowById,
  sectionOf,
  sheetPopup,
  sidebar,
} from "./boardDom";
import {
  COLUMN_HEAD_HEIGHT,
  COLUMN_PADDING,
  COLUMN_WIDTH,
  Column,
} from "./Column";
import { CommandPalette } from "./CommandPalette";
import { COMMANDS, type JumpTarget, keyHint } from "./commands";
import { DONE_COLUMN, DoneColumn } from "./DoneColumn";
import { GoHint } from "./GoHint";
import { type PaletteState, paletteGroups } from "./paletteGroups";
import { ShortcutsOverlay } from "./ShortcutsOverlay";
import { Sidebar } from "./Sidebar";
import { SkeletonComposer } from "./Skeleton";
import {
  isColumnSection,
  type KeySection,
  SHEET,
  SIDEBAR,
  sectionOrder,
} from "./sections";
import { settleTiming } from "./settle";
import {
  fitBoardEnd,
  holdLeavingSheet,
  type Placed,
  slideColumns,
  spanOf,
} from "./slide";
import { Toolbar } from "./Toolbar";
import { DragPreview, useBoardDrag } from "./useBoardDrag";
import { useBoardKeys } from "./useBoardKeys";
import { useGoSequence } from "./useGoSequence";
import { useKeyboardModality } from "./useKeyboardModality";
import { routeDrag, useListDrag } from "./useListDrag";

/** The time columns' names, known before the lists arrive. */
const TIME_TITLES: Record<BoardTimeKind, string> = {
  today: "Today",
  thisWeek: "This week",
  someday: "Someday",
};
const EMPTY_ROWS: TodoWithUrls[] = [];

/** Bring a row into view within its column, without scrolling the board. */
function revealInColumn(row: HTMLElement) {
  const body = row.closest<HTMLElement>("[data-column-body]");
  const box = (row.closest("li") ?? row).getBoundingClientRect();
  if (!body) return;
  const view = body.getBoundingClientRect();
  if (box.top < view.top) body.scrollTop -= view.top - box.top;
  else if (box.bottom > view.bottom) body.scrollTop += box.bottom - view.bottom;
}

/**
 * A column to go to once it renders: its Add field, its title, a todo that's
 * on its way there (`row`, as `focusColumn`), or just into view.
 */
type PendingFocus =
  | { column: string; target: "composer" | "head" | "reveal" }
  | { column: string; target: "row"; rowId?: string };

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
 * your lists you haven't hidden, in the sidebar's order, then Done. Nothing
 * else is swapped in or out, and every column keeps its width.
 *
 * Selection is state, not DOM focus. Focusing a row selects it; one click
 * selects, a second click, a double click or Enter opens it in a sheet laid
 * on the board right after its column, and while a todo is open the sheet
 * follows the selection. The columns after it slide along to make room.
 *
 * The keyboard is on or in one section at a time: the sidebar, a column or
 * the sheet (`sections.ts`). Which one follows focus, and is drawn as the
 * section's `data-key-section`, outlined while the keyboard is in use.
 * Rows, menus, the composer and the detail are the phone's components at
 * board density, driven by the same `useBoardData`.
 */
export function WideApp({
  view = null,
  onNavigate,
}: {
  /**
   * The view the URL names: `/list/:id` goes to that list's column, and
   * `/todo/:id` to its todo's, with the todo open beside it.
   */
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
    collections: savedCollections,
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
    listsFailed,
    refetchLists,
    listsFetching,
  } = useBoardData();
  // What the smoke suite and the marketing captures wait for: loaded and
  // hydrated. The server renders the board with its data (#830), so without
  // the second they'd act before the rows answer.
  const hydrated = useHydrated();
  const createList = useCreateList();
  const updateList = useUpdateList();
  const reorderLists = useReorderLists();
  const listDrag = useListDrag({
    lists: savedCollections,
    onMove: reorderLists,
  });
  /** Your lists, in the sidebar's order: a just-dropped one until it's saved. */
  const collections = listDrag.ordered(savedCollections);

  const [detailId, setDetailId] = useState<string | null>(null);
  /** The column last gone to or selected in, which the URL names. */
  const [urlColumn, setUrlColumn] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdNow = useRef(selectedId);
  selectedIdNow.current = selectedId;
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [settings, setSettings] = useState(false);
  const [quickAdd, setQuickAdd] = useState(false);
  const [newListOpen, setNewListOpen] = useState(false);
  const [palette, setPalette] = useState<PaletteState | null>(null);
  const [sheetEl, setSheetEl] = useState<HTMLElement | null>(null);
  const boardRow = useRef<HTMLElement>(null);
  const boardRoot = useRef<HTMLDivElement>(null);
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
  /** The section with the keyboard; at first, Today (`keyAt`). */
  const [keySection, setKeySection] = useState<KeySection | null>(null);
  /** Set while focus goes to a column's head to put the keyboard on it. */
  const headOn = useRef(false);
  /** The column whose Add has the keyboard but isn't typing. */
  const [addIdle, setAddIdle] = useState<string | null>(null);
  /** Bumped to put the keyboard on the sheet once it shows (Return). */
  const [sheetFocus, setSheetFocus] = useState(0);
  /** The column the keyboard was last on or in. */
  const cameFrom = useRef<string | null>(null);
  /** Where n opened Quick add from, to go back to. */
  const quickAddFrom = useRef<Element | null>(null);

  const now = new Date();
  const overnight = useOvernightNote(todos, byKind.today?.id);
  const timeLists = BOARD_TIME_KINDS.map((kind) => byKind[kind]).filter(
    (l): l is SerializedList => l !== undefined,
  );
  /** Every list, in the board's (and the sidebar's) order. */
  const boardLists = [...timeLists, ...collections];
  /** The lists with a column: all but the ones you've hidden. */
  const shownLists = shownColumns(boardLists);
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
  const columnIds = [...shownLists.map((l) => l.id), DONE_COLUMN];
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
  const selectedIn = selectedTodo
    ? selectedTodo.completed
      ? DONE_COLUMN
      : selectedTodo.listId
    : null;
  /** The column the selection is in: a list id, Done, or none (never hidden). */
  const selectionColumn =
    selectedIn && columnIds.includes(selectedIn) ? selectedIn : null;
  // The sections in Tab order, and the one with the keyboard. One that's
  // gone (a hidden column, the closed sheet) hands it to the column the
  // keyboard was last in, else Today.
  const sections = sectionOrder(columnIds, sheetColumn);
  const keyAt: KeySection =
    keySection && sections.includes(keySection.id)
      ? keySection
      : {
          id:
            cameFrom.current && sections.includes(cameFrom.current)
              ? cameFrom.current
              : (todayId ?? DONE_COLUMN),
          level: "on",
        };
  // Only where the keyboard really was counts: before the lists load, the
  // fallback is Done, and remembering that would keep it there.
  if (keyAt === keySection) {
    if (isColumnSection(keyAt.id)) cameFrom.current = keyAt.id;
    else if (keyAt.id === SHEET) cameFrom.current = sheetColumn;
  }
  const keyOn = (id: string) => (keyAt.id === id ? keyAt.level : undefined);
  const currentColumn =
    selectionColumn ?? (isColumnSection(keyAt.id) ? keyAt.id : todayId);

  // --- Board motion -------------------------------------------------------
  // After every render: the closing sheet leaves the row, the end resizes
  // to keep Done just out of view, the columns that moved slide to their
  // new places, and a todo that opened or changed column brings its column
  // and sheet into view together.

  const placed = useRef<Placed>(new Map());
  const revealedFor = useRef<string | null>(null);
  useLayoutEffect(() => {
    const row = boardRow.current;
    if (!row) return;
    holdLeavingSheet(sheetEl, !!sheet?.leaving);
    fitBoardEnd(row);
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

  // The columns are a third of the board wide, so a resize changes what
  // they leave: refit the end before the frame paints, and record where
  // that leaves Done without sliding it there.
  useEffect(() => {
    const row = boardRow.current;
    if (!row || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      fitBoardEnd(row);
      slideColumns(row, placed.current, null);
    });
    observer.observe(row);
    return () => observer.disconnect();
  }, []);

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
      // An empty column takes the keyboard on its head, with nothing
      // selected: let go of the todo it came from, as toSection does.
      if (rows.length === 0) setSelectedId(null);
      // The board scrolls itself, smoothly; the focus only brings the row
      // into view within its column.
      target?.focus({ preventScroll: true });
      if (target && rows.length > 0) revealInColumn(target);
      return true;
    },
    [revealColumn],
  );

  // A column that's about to render (a new list) or move (beside a deleted
  // one) takes focus once it has; a moved todo, once its row is there.
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending || !columnIds.includes(pending.column)) return;
    const row =
      pending.target === "row" && pending.rowId
        ? columnRows(pending.column).find(
            (r) => r.dataset.rowId === pending.rowId,
          )
        : undefined;
    if (pending.target === "row" && pending.rowId && !row) return;
    pendingFocus.current = null;
    if (pending.target === "row") {
      focusColumn(pending.column, undefined, pending.rowId);
      return;
    }
    const section = document.querySelector<HTMLElement>(
      `[data-column="${CSS.escape(pending.column)}"]`,
    );
    // An open todo's sheet brings its new column into view with it.
    if (section && !(row && sheetColumn === pending.column)) {
      revealColumn(section);
    }
    if (pending.target === "reveal") return;
    const target =
      row ??
      (pending.target === "composer"
        ? composers.current.get(pending.column)
        : section?.querySelector<HTMLElement>("[data-column-head]"));
    target?.focus({ preventScroll: true });
    if (row) revealInColumn(row);
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
  // A `/todo/:id` that wasn't in the todos: looked for again, then done.
  const [recheckedTodo, setRecheckedTodo] = useState<string | null>(null);
  const recheckingTodo = useRef<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the URL changes, once lists are in
  useEffect(() => {
    if (loading || urlKey === appliedUrlKey.current) return;
    // A todo's URL waits for the todos too.
    if (view?.kind === "todo") {
      if (!todosLoading) openTodoFromUrl(view.id);
      return;
    }
    appliedUrlKey.current = urlKey;
    const kind = BOARD_TIME_KINDS.find((k) => k === urlKey);
    const id = urlKey.startsWith("list:")
      ? urlKey.slice(5)
      : kind
        ? byKind[kind]?.id
        : undefined;
    // Only an explicit `/this-week` moves focus; `/` leaves the page alone.
    if (!view || !id) return;
    // A list that's gone: back to `/`. A hidden one shows again.
    if (!goTo(id) && urlKey.startsWith("list:")) {
      appliedUrlKey.current = boardViewKey(null, lists);
      onNavigate?.(null);
    }
  }, [urlKey, loading, todosLoading, recheckedTodo]);

  /**
   * `/todo/:id` (the Mac's menu bar hands a todo over this way): its column,
   * with the todo selected and open in the sheet beside it, and then the URL
   * names the column. A done todo is shown in Done, which doesn't open; one
   * that's gone or isn't yours goes to `/`, as a missing `/list/:id` does.
   * One the Mac added a moment ago can reach the server after this page's
   * first fetch, so a todo that isn't there is looked for once more first.
   */
  const openTodoFromUrl = (id: string) => {
    const todo = todoById(id) ?? doneById(id);
    if (!todo && recheckedTodo !== id) {
      if (recheckingTodo.current !== id) {
        recheckingTodo.current = id;
        void refetch().finally(() => setRecheckedTodo(id));
      }
      return;
    }
    const next =
      todo && !todo.completed ? viewForList(todo.listId, lists) : null;
    appliedUrlKey.current = boardViewKey(next, lists);
    if (todo) {
      goToTodo(todo);
      if (!todo.completed) setDetailId(todo.id);
    }
    onNavigate?.(next);
  };

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
    // Another todo chosen: a moved one no longer takes the keyboard back.
    const pending = pendingFocus.current;
    if (pending?.target === "row" && pending.rowId !== todo.id) {
      pendingFocus.current = null;
    }
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

  /** Select a todo, and give it the keyboard, once it's in `listId`. */
  const followTodo = (todoId: string, listId: string) => {
    pendingFocus.current = { column: listId, target: "row", rowId: todoId };
  };

  /**
   * Move a todo by command (1/2/3, Move to…, the menu): unlike Done and
   * Delete, the selection stays on it, in its new column, and on Undo (or
   * a move the server refused) goes back with it, and on Redo forward again.
   */
  const moveTodo = (todo: TodoWithUrls, listId: string, name?: string) => {
    if (todo.listId === listId) return;
    followTodo(todo.id, listId);
    const followBack = () => {
      if (selectedIdNow.current === todo.id) {
        followTodo(todo.id, todo.listId);
      } else if (
        pendingFocus.current?.target === "row" &&
        pendingFocus.current.rowId === todo.id
      ) {
        pendingFocus.current = null;
      }
    };
    actions.move(todo, listId, {
      name,
      onUndo: followBack,
      onRedo: () => {
        if (selectedIdNow.current === todo.id) followTodo(todo.id, listId);
      },
      onFailed: followBack,
    });
  };

  /** Close the open todo; `toRow` puts the keyboard back on its row. */
  const closeDetail = (toRow: boolean) => {
    const open = detailId;
    setDetailId(null);
    if (toRow) requestAnimationFrame(() => rowById(open)?.focus());
  };

  // --- Sections -------------------------------------------------------------
  // Focus says which section has the keyboard: wherever it lands, a click or
  // a key, the section it's in takes it. Focus outside them (the toolbar, a
  // popup) leaves it where it was.

  useEffect(() => {
    const root = boardRoot.current;
    if (!root) return;
    const onFocus = (e: FocusEvent) => {
      const at = sectionOf(e.target as Element);
      if (!at) return;
      // A column's head is "on" the column only when the keys put it there;
      // a click on the column's space, or going to an empty column, is in.
      const on = at.anchor && (!isColumnSection(at.id) || headOn.current);
      const level = on ? "on" : "in";
      setKeySection((cur) =>
        cur?.id === at.id && cur.level === level ? cur : { id: at.id, level },
      );
    };
    root.addEventListener("focusin", onFocus);
    return () => root.removeEventListener("focusin", onFocus);
  }, []);

  /**
   * Put the keyboard on a section, with nothing in it chosen: the sidebar
   * or the sheet itself, or a column's head. Leaving for the sidebar or a
   * column lets go of the selected todo; the sheet keeps it.
   */
  const toSection = (id: string) => {
    if (id === SIDEBAR) {
      setSelectedId(null);
      sidebar()?.focus();
    } else if (id === SHEET) {
      sheetPopup()?.focus({ preventScroll: true });
    } else {
      const head = columnHead(id);
      const section = head?.closest<HTMLElement>("[data-column]");
      if (!head || !section) return;
      revealColumn(section);
      setSelectedId(null);
      setUrlColumn(id);
      headOn.current = true;
      head.focus({ preventScroll: true });
      headOn.current = false;
    }
    setKeySection({ id, level: "on" });
  };

  /** A column's Add: typing, or on it ready to type (`typing` false). */
  const focusAdd = (listId: string, typing: boolean) => {
    const field = composers.current.get(listId);
    const section = field?.closest<HTMLElement>("[data-column]");
    if (!field || !section) return;
    revealColumn(section);
    setSelectedId(null);
    setUrlColumn(listId);
    setAddIdle(typing ? null : listId);
    field.focus({ preventScroll: true });
  };

  // --- Hidden columns -------------------------------------------------------
  // Your lists' columns can be hidden from the sidebar, the ⋯ menu and the
  // palette. The list stays in the sidebar, muted, and going to it from
  // anywhere shows its column again.

  /**
   * Take your list's column off the board. From the board (its ⋯ menu, the
   * palette) the keyboard moves to the column before it; from the sidebar it
   * stays there. Either way the selection and an open todo leave with it.
   */
  const hideColumn = (list: SerializedList, from: "board" | "sidebar") => {
    const at = columnIds.indexOf(list.id);
    if (list.systemKind || at === -1) return;
    const before = columnIds[at - 1];
    if (detailTodo?.listId === list.id) setDetailId(null);
    if (selectionColumn === list.id) setSelectedId(null);
    if (from === "board" && before) focusColumn(before);
    else if (urlColumn === list.id) setUrlColumn(before ?? null);
    updateList.mutate({ id: list.id, input: { columnHidden: true } });
  };

  /**
   * Bring a hidden column back in its place, then go to it (`row`: as
   * `focusColumn`, at `rowId`) or only scroll it into view (`reveal`).
   */
  const showColumn = (
    list: SerializedList,
    target: "row" | "reveal",
    rowId?: string,
  ) => {
    pendingFocus.current = { column: list.id, target, rowId };
    updateList.mutate(
      { id: list.id, input: { columnHidden: false } },
      {
        onError: () => {
          if (pendingFocus.current?.column === list.id) {
            pendingFocus.current = null;
          }
        },
      },
    );
  };

  /** Right-click in the sidebar, or the palette: Hide or Show column. */
  const toggleColumn = (list: SerializedList, from: "board" | "sidebar") => {
    if (list.columnHidden)
      showColumn(list, from === "board" ? "row" : "reveal");
    else hideColumn(list, from);
  };

  /**
   * Go to a list's column, at `rowId` if given, showing it first if it's
   * hidden. False when there's no such list.
   */
  const goTo = (listId: string, rowId?: string) => {
    const hidden = collections.find((l) => l.id === listId && l.columnHidden);
    if (!hidden) return focusColumn(listId, undefined, rowId);
    showColumn(hidden, "row", rowId);
    return true;
  };

  // A hidden column takes its open todo's sheet with it, wherever it was
  // hidden (another window included).
  useEffect(() => {
    const list = detailTodo
      ? collections.find((l) => l.id === detailTodo.listId)
      : undefined;
    if (list?.columnHidden) setDetailId(null);
  }, [detailTodo, collections]);

  // --- Sidebar --------------------------------------------------------------
  // Every list you haven't hidden is on the board: an entry scrolls to its
  // column and goes in. A hidden list's entry shows its column first.

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

  /**
   * Your list's id, for the personal API (`/v1/lists/:id`). The time lists
   * go by their aliases there (`today`, `this-week`, `someday`), so they
   * have no menu to offer it from. The toast matches Settings' Copy.
   */
  const copyListId = (list: SerializedList) => {
    navigator.clipboard.writeText(list.id).then(
      () => toast.success("Copied"),
      (err: unknown) => toast.error(messageFromError(err, "Couldn’t copy")),
    );
  };

  /** "View" on an "Added to …" toast. */
  const viewList = (listId: string) => {
    goTo(listId);
  };

  // --- Reordering your lists -----------------------------------------------
  // By dragging an entry in the sidebar (`listDrag`), or one place at a time
  // with ⌥↑ / ⌥↓ on an entry and the palette's Move list up / down.

  /** Your list whose sidebar entry has focus, if one has. */
  const focusedEntryList = () => {
    const id = document.activeElement
      ?.closest<HTMLElement>("[data-sidebar-list]")
      ?.getAttribute("data-sidebar-list");
    return collections.find((l) => l.id === id) ?? null;
  };
  /** A list moved from its entry keeps focus there once it's re-rendered. */
  const entryFocus = useRef<string | null>(null);
  useEffect(() => {
    const id = entryFocus.current;
    if (!id) return;
    entryFocus.current = null;
    const entry = sidebar()?.querySelector<HTMLElement>(
      `[data-sidebar-list="${CSS.escape(id)}"]`,
    );
    if (entry && document.activeElement !== entry) {
      entry.focus({ preventScroll: true });
    }
  });

  /** One place up (-1) or down (1); nothing past the first or last. */
  const stepList = (list: SerializedList, delta: 1 | -1) => {
    const moves = stepMoves(collections, list.id, delta);
    if (moves.length === 0) return;
    if (focusedEntryList()?.id === list.id) entryFocus.current = list.id;
    reorderLists(moves);
  };

  // --- Keyboard -------------------------------------------------------------
  // Every key is a command in `commands.ts`, run against this board.

  /** Go into a column: its remembered row, or `rowId` when given. */
  const jump = (target: JumpTarget, rowId?: string) => {
    if (target.kind === "done") return showDone(rowId);
    const list =
      target.kind === "list" ? collections[target.index] : byKind[target.list];
    if (list) goTo(list.id, rowId);
  };

  /** A todo chosen in the palette: its column, and it. */
  const goToTodo = (todo: TodoWithUrls) => {
    if (todo.completed) return showDone(todo.id);
    goTo(todo.listId, todo.id);
  };

  const board = createBoard({
    columnIds,
    sections,
    keySection: keyAt,
    cameFrom: cameFrom.current ?? todayId ?? DONE_COLUMN,
    currentColumn,
    selectionColumn,
    detailOpen: !!detailTodo,
    byKind,
    actions,
    todoById,
    doneById,
    selectedRow,
    sheetRow: () => rowById(detailId),
    focusColumn,
    toSection,
    hasAdd: (listId) => composers.current.has(listId),
    focusAdd,
    focusSheetTitle: () =>
      sheetPopup()?.querySelector<HTMLElement>("[data-detail-title]")?.focus(),
    clearSelection: () => setSelectedId(null),
    focusNeighbour: (row) => focusNeighbour(row),
    moveTodo: (todo, listId) => moveTodo(todo, listId),
    open: (todo) => onOpen(todo, "keyboard"),
    closeDetail,
    openMenu: (todo, row, view) => {
      const rect = row.getBoundingClientRect();
      setMenu({
        id: todo.id,
        anchor: { x: rect.left, y: rect.bottom + 4 },
        view,
      });
    },
    openMoveTo: (todo) => setPalette({ mode: "move", todoId: todo.id }),
    jump,
    moveList: (delta) => {
      const list = focusedEntryList();
      if (list) stepList(list, delta);
    },
    startGo: go.start,
    newTodo: () => {
      quickAddFrom.current = document.activeElement;
      setQuickAdd(true);
    },
    newList: () => setNewListOpen(true),
    togglePalette: () => {
      // Opened from one of your lists' entries, its Move list up / down are
      // for that list.
      const listId = focusedEntryList()?.id;
      setPalette((p) => (p ? null : { mode: "all", listId }));
    },
    goToList: () => setPalette({ mode: "lists" }),
    toggleShortcuts: () => setShortcuts((s) => !s),
    feedback: () => {
      if (canSendFeedback) setFeedback(true);
    },
  });

  // Moving with the keys adds a bar beside the selected row (TodoRow), and
  // the outline to the section with the keyboard.
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
      { onSuccess: (created) => moveTodo(todo, created.id, name) },
    );
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
        columnList:
          collections.find((l) => l.id === (selectionColumn ?? urlColumn)) ??
          null,
        toggleColumn: (list) => toggleColumn(list, "board"),
        orderList:
          collections.find(
            (l) =>
              l.id ===
              (palette?.mode === "all" && palette.listId
                ? palette.listId
                : (selectionColumn ?? urlColumn)),
          ) ?? null,
        moveList: stepList,
        admin: canSendFeedback,
        board,
        goToColumn: (list) => goTo(list.id),
        showDone: () => showDone(),
        goToTodo,
        moveTodo: (todo, listId) => moveTodo(todo, listId),
        moveToNewList,
      },
      query,
    );

  // --- Rendering ------------------------------------------------------------

  const menuTodo = menu ? (todos.find((t) => t.id === menu.id) ?? null) : null;

  useEffect(() => {
    if (detailId && !todosLoading && !detailTodo) setDetailId(null);
  }, [detailId, detailTodo, todosLoading]);

  /** A failed load: what didn't load, and Try again. */
  const loadError = (what: string, retry: () => unknown, fetching: boolean) => (
    <div className="mt-4" role="alert">
      <p className="m-0 font-n-display text-n-wide-heading text-n-ink">
        Couldn’t load your {what}.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        disabled={fetching}
        className="-ml-2 mt-1 min-h-11 cursor-pointer rounded-n-chip px-2 text-n-wide-action text-n-ink-muted n-focus"
      >
        {fetching ? "Trying again…" : "Try again"}
      </button>
    </div>
  );
  const errorView = error ? loadError("todos", refetch, isFetching) : null;

  /**
   * Open a todo beside its column. From the keyboard (Return), the keyboard
   * goes on its sheet; after a click it stays on the row, so ↓ moves on and
   * the sheet follows.
   */
  const onOpen = (todo: TodoWithUrls, by?: "keyboard" | "pointer") => {
    if (drag.justDragged.current) return;
    select(todo);
    setDetailId(todo.id);
    if (by === "keyboard") setSheetFocus((n) => n + 1);
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
    // ⇧F10 and the Menu key open the menu under the row (`openMenu`), and
    // the browser can then send the row its own contextmenu: the menu stays
    // where it opened.
    setMenu((open) =>
      open?.id === todo.id
        ? open
        : {
            id: todo.id,
            anchor: at ?? {
              x: fallback?.left ?? 24,
              y: (fallback?.bottom ?? 24) + 4,
            },
            view: "main",
          },
    );
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

  /**
   * Under an empty Today or This week: "4 waiting in this week →", when the
   * next time list has todos. It goes to that column, selecting nothing.
   */
  const waitingFor = (kind: BoardTimeKind | null) => {
    const next = kind ? EMPTY_NEXT[kind] : undefined;
    const id = next ? byKind[next]?.id : undefined;
    const count = id ? rowsFor(id).length : 0;
    if (!next || !id || count === 0) return null;
    return { text: waitingIn(count, next), onGo: () => toSection(id) };
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
        keySection={keyOn(list.id)}
        addSelected={addIdle === list.id}
        rows={rowsFor(list.id)}
        resetKey={todos}
        subtasksOf={subtasksOf}
        checked={actions.checked}
        collapsing={actions.collapsing}
        highlightedId={menu?.id ?? null}
        selectedId={selectedId}
        lift={drag.lift}
        animate={animated}
        settle={drag.settle}
        loading={loading}
        position={columnIds.indexOf(list.id)}
        error={errorView}
        empty={EMPTY_COPY[kind ?? "list"]}
        waiting={waitingFor(kind)}
        onRename={
          kind
            ? undefined
            : (name) => updateList.mutate({ id: list.id, input: { name } })
        }
        onHide={kind ? undefined : () => hideColumn(list, "board")}
        onCopyId={kind ? undefined : () => copyListId(list)}
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
            idle={addIdle === list.id}
            onIdleChange={(idle) =>
              setAddIdle((cur) =>
                idle ? list.id : cur === list.id ? null : cur,
              )
            }
            onLeaveDown={() => columnRows(list.id)[0]?.focus()}
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
  const renderSkeletonColumn = (kind: BoardTimeKind, position: number) => (
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
      loading
      position={position}
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

  /**
   * The lists failed to load: no columns to put "Couldn’t load your todos."
   * in, and none drawn either, or it reads as an account with every list
   * deleted. The message takes the first column's place, at its width and
   * where its error would sit, and Done and the hatch follow as usual.
   */
  const renderListsError = () => (
    <div
      key="lists-error"
      data-slide="lists-error"
      data-lists-error
      className={`flex h-full ${COLUMN_WIDTH} flex-col bg-n-canvas`}
    >
      <div aria-hidden="true" className={`${COLUMN_HEAD_HEIGHT} shrink-0`} />
      <div className={`pt-2.5 ${COLUMN_PADDING}`}>
        {loadError("lists", refetchLists, listsFetching)}
      </div>
    </div>
  );

  // The board's end, before Done: the hatch, as wide as the columns leave,
  // so Done starts just past the right edge (`fitBoardEnd`). Always in the
  // row, so it resizes rather than appears. Filled first, so the row's own
  // hatch doesn't show through and double its lines. Nothing in it to click
  // (principle 4).
  const renderEnd = () => (
    <div
      key="end"
      aria-hidden="true"
      data-slide="end"
      data-board-end
      className="n-board-hatch shrink-0 bg-n-canvas"
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
      keySection={keyOn(DONE_COLUMN)}
    />
  );

  return (
    <div
      data-wide-ready={loading || !hydrated ? undefined : ""}
      ref={boardRoot}
      aria-busy={loading || undefined}
      className="group/board fixed inset-x-0 top-[var(--n-offline-inset,0px)] bottom-0 z-10 flex bg-n-canvas pb-[env(safe-area-inset-bottom,0px)] font-n-text text-n-ink antialiased"
    >
      <DndContext
        sensors={drag.sensors}
        collisionDetection={pointerWithin}
        {...routeDrag(listDrag.handlers, drag.handlers)}
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
          onCollection={(list) => {
            // The click that ends a drag isn't a click on the entry.
            if (!listDrag.justDragged.current) goTo(list.id);
          }}
          onToggleColumn={(list) => toggleColumn(list, "sidebar")}
          onCreateList={addList}
          onDone={() => showDone()}
          onSettings={() => setSettings(true)}
          onShortcuts={() => setShortcuts(true)}
          onFeedback={canSendFeedback ? () => setFeedback(true) : undefined}
          loading={loading}
          listsFailed={listsFailed}
          keySection={keyOn(SIDEBAR)}
          listDrag={listDrag.drag}
          listSettle={listDrag.settle}
          animate={animated}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Toolbar
            onSearch={() => setPalette({ mode: "all" })}
            quickAdd={{
              open: quickAdd,
              onOpenChange: (open) => {
                // The toolbar's button: back to the selection on close.
                if (open) quickAddFrom.current = null;
                setQuickAdd(open);
              },
              startListId:
                selectionColumn && selectionColumn !== DONE_COLUMN
                  ? selectionColumn
                  : (todayId ?? ""),
              targets,
              timeZone,
              countFor: (id) => rowsFor(id).length,
              isVisible: (id) => columnIds.includes(id),
              onView: viewList,
              // Back to the section n opened it from, else the selection.
              returnFocus: () => {
                const from = quickAddFrom.current;
                return from instanceof HTMLElement &&
                  from.isConnected &&
                  sectionOf(from)?.anchor
                  ? from
                  : selectedRow();
              },
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
              container the columns' width is a third of. Its background
              is what a trackpad's bounce shows: the hatch past Done, plain
              before Today. Every slot fills itself so it only shows
              there. Its overscroll stays its own, so a swipe past an end
              bounces rather than going back a page. */}
          <main
            ref={boardRow}
            aria-label="Board"
            className="@container n-board-overscroll relative flex min-h-0 flex-1 overflow-x-auto overscroll-x-contain [scrollbar-width:thin]"
          >
            {/* Before the lists arrive, the three time columns and then
                nothing: no Done, since your lists may come before it. The
                time columns are where they'll load, so your lists and Done
                arrive in the empty space after them and nothing already
                drawn moves (principle 8). A skeleton Done would have to
                slide out of their way. */}
            {skeleton
              ? [
                  ...BOARD_TIME_KINDS.map(renderSkeletonColumn),
                  <div
                    key="skeleton-rest"
                    aria-hidden="true"
                    data-skeleton-rest
                    className="min-w-0 flex-1 bg-n-canvas"
                  />,
                ]
              : [
                  listsFailed ? renderListsError() : null,
                  ...boardSlots(boardLists, sheet?.column ?? null).map(
                    (slot) =>
                      slot.kind === "list" ? (
                        renderColumn(slot.list)
                      ) : slot.kind === "done" ? (
                        renderDone()
                      ) : slot.kind === "end" ? (
                        renderEnd()
                      ) : (
                        // The open todo's sheet: as wide as a column, laid over
                        // its column's right padding, above the columns around it.
                        // Filled, since the sheet is inset from its edges.
                        <div
                          key="sheet"
                          ref={setSheetEl}
                          data-slide="sheet"
                          data-board-sheet
                          className={`relative top-0 bottom-0 z-10 -ml-(--n-sheet-overlap) bg-n-canvas ${COLUMN_WIDTH}`}
                        />
                      ),
                  ),
                ]}
          </main>
        </div>
        <DragOverlay dropAnimation={null}>
          {drag.dragging ? (
            <DragPreview todo={drag.dragging} tilt={drag.tilt} />
          ) : null}
        </DragOverlay>
      </DndContext>

      <ContextMenu
        todo={menuTodo}
        where={menuTodo ? listName(menuTodo.listId) : ""}
        listKind={menuTodo ? listKind(menuTodo.listId) : null}
        moveTargets={targets.filter((t) => t.id !== menuTodo?.listId)}
        onClose={() => setMenu(null)}
        onMove={(todo, listId) => moveTodo(todo, listId)}
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
        onClose={() => closeDetail(true)}
        keySection={keyOn(SHEET)}
        focusRequest={sheetFocus}
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
