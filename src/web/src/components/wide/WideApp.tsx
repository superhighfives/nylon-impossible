import { DndContext, DragOverlay, pointerWithin } from "@dnd-kit/core";
import type { BoardView } from "@nylon-impossible/shared";
import { generateKeyBetween } from "fractional-indexing";
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
  OvernightPill,
  useOvernightNote,
} from "@/components/phone/OvernightNote";
import { SettingsScreen } from "@/components/phone/SettingsScreen";
import { useBoardData } from "@/components/phone/useBoardData";
import { useHints } from "@/hooks/useHints";
import { useCreateList, useUpdateList } from "@/hooks/useLists";
import type { SerializedList, TodoWithUrls } from "@/types/database";
import { FeedbackDialog, useCanSendFeedback } from "../FeedbackDialog";
import { createBoard } from "./board";
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
import { Toolbar } from "./Toolbar";
import { DragPreview, useBoardDrag } from "./useBoardDrag";
import { useBoardKeys } from "./useBoardKeys";
import { useGoSequence } from "./useGoSequence";
import { useKeyboardModality } from "./useKeyboardModality";

/** The time columns' names, known before the lists arrive. */
const TIME_TITLES: Record<(typeof TIME_KINDS)[number], string> = {
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

/** A column to focus once it renders: a row, its Add field, or its title. */
interface PendingFocus {
  column: string;
  target: "row" | "composer" | "head";
  /** `row`: this todo's row rather than the remembered one. */
  rowId?: string;
}

interface MenuState {
  id: string;
  anchor: { x: number; y: number };
  view: MenuView;
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
  const composers = useRef(new Map<string, HTMLTextAreaElement>());
  const drag = useBoardDrag({
    rowsFor,
    actions,
    onStart: () => setMenu(null),
  });
  const go = useGoSequence();
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
    // A list that isn't there is about to close (above); pointing the URL at
    // it would reopen it and loop.
    if (openListId && !openList) return;
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

  const selectedRow = () => rowById(selectedId);

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
  // Every key is a command in `commands.ts`, run against this board.

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
        openList: (list) => openCollection(list),
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
        tinted={!kind}
        rows={rowsFor(list.id)}
        subtasksOf={subtasksOf}
        checked={actions.checked}
        collapsing={actions.collapsing}
        highlightedId={menu?.id ?? null}
        selectedId={selectedId}
        indicator={drag.indicator}
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
  const renderSkeletonColumn = (kind: (typeof TIME_KINDS)[number]) => (
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
              returnFocus: selectedRow,
            }}
            newList={{
              open: newListOpen,
              onOpenChange: setNewListOpen,
              returnFocus: selectedRow,
              onCreate: addList,
            }}
          />
          <main
            aria-label="Board"
            className="flex min-h-0 flex-1 overflow-x-auto"
          >
            {skeleton
              ? TIME_KINDS.map(renderSkeletonColumn)
              : timeLists.map((list) => renderColumn(list))}
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
                onBackgroundClick={() => softFocus(DONE_COLUMN)}
                loading={loading}
              />
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
