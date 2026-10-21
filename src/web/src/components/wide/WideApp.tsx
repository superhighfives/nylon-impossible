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
import { generateKeyBetween } from "fractional-indexing";
import { useCallback, useEffect, useRef, useState } from "react";
import { Composer } from "@/components/phone/Composer";
import { ContextMenu, type MenuView } from "@/components/phone/ContextMenu";
import { DetailSheet } from "@/components/phone/DetailSheet";
import { DoneScreen } from "@/components/phone/DoneScreen";
import {
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
import { useHints } from "@/hooks/useHints";
import { useCreateList } from "@/hooks/useLists";
import { dropPlacement, slotAt } from "@/lib/dragOrder";
import type { SerializedList, TodoWithUrls } from "@/types/database";
import { Column, type DropIndicator } from "./Column";
import { resolveDrop } from "./drop";
import { boardKeyAction, isTypingTarget } from "./keys";
import { ShortcutsOverlay } from "./ShortcutsOverlay";
import { Sidebar } from "./Sidebar";

const EMPTY_COPY: Record<string, string> = {
  today: "Nothing today.",
  thisWeek: "A clear week.",
  someday: "Nothing here yet.",
};

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
 * The wide layout (web 1024px and up): the sidebar, the three time columns
 * always side by side, one of your lists as an optional fourth column, and
 * the detail as a right-hand panel. Rows, menus, the composer and the detail
 * are the phone's components at board density, driven by the same
 * `useBoardData`.
 */
export function WideApp() {
  const { reducedMotion } = useHints();
  const {
    timeZone,
    todos,
    byKind,
    collections,
    listName,
    actions,
    subtasksOf,
    rowsFor,
    targets,
    doneCount,
    loading,
    todosLoading,
    error,
    refetch,
    isFetching,
  } = useBoardData();
  const createList = useCreateList();

  const [openListId, setOpenListId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [screen, setScreen] = useState<"done" | "settings" | null>(null);
  const [shortcuts, setShortcuts] = useState(false);
  const [activeColumn, setActiveColumn] = useState<string | null>(null);
  const [dragging, setDragging] = useState<TodoWithUrls | null>(null);
  const [indicator, setIndicator] = useState<DropIndicator | null>(null);
  const composers = useRef(new Map<string, HTMLTextAreaElement>());
  const justDragged = useRef(false);
  const pendingFocus = useRef<string | null>(null);

  const now = new Date();
  const overnight = useOvernightNote(todos, byKind.today?.id);
  const timeLists = TIME_KINDS.map((kind) => byKind[kind]).filter(
    (l): l is SerializedList => l !== undefined,
  );
  const openList = openListId
    ? collections.find((l) => l.id === openListId)
    : undefined;
  const columns = openList ? [...timeLists, openList] : timeLists;
  const columnIds = columns.map((c) => c.id);
  const todayId = byKind.today?.id ?? null;
  const currentColumn =
    activeColumn && columnIds.includes(activeColumn) ? activeColumn : todayId;

  // Your list was deleted elsewhere: close its column.
  useEffect(() => {
    if (openListId && !loading && !openList) setOpenListId(null);
  }, [openListId, openList, loading]);

  // --- Focus ----------------------------------------------------------------

  const focusColumn = useCallback(
    (listId: string, index = 0) => {
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
      const target =
        rows[Math.min(index, rows.length - 1)] ??
        section.querySelector<HTMLElement>("[data-column-head]");
      target?.focus({ preventScroll: rows.length === 0 });
      setActiveColumn(listId);
      return true;
    },
    [reducedMotion],
  );

  // A list opened from the sidebar takes focus once its column renders.
  useEffect(() => {
    const id = pendingFocus.current;
    if (id && columnIds.includes(id)) {
      pendingFocus.current = null;
      focusColumn(id);
    }
  });

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

  const todoById = useCallback(
    (id: string | undefined) =>
      id ? todos.find((t) => t.id === id && !t.completed) : undefined,
    [todos],
  );

  // --- Sidebar --------------------------------------------------------------

  const toggleCollection = (list: SerializedList) => {
    if (openListId === list.id) {
      setOpenListId(null);
      if (currentColumn === list.id && todayId) focusColumn(todayId);
      return;
    }
    setOpenListId(list.id);
    pendingFocus.current = list.id;
  };

  const addList = (name: string) => {
    const last = collections[collections.length - 1];
    createList.mutate(
      { name, position: generateKeyBetween(last?.position ?? null, null) },
      {
        onSuccess: (created) => {
          setOpenListId(created.id);
          pendingFocus.current = created.id;
        },
      },
    );
  };

  /** "View" on an "Added to …" toast. */
  const view = (listId: string) => {
    if (columnIds.includes(listId)) {
      focusColumn(listId);
      return;
    }
    setOpenListId(listId);
    pendingFocus.current = listId;
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
      // Screens and the shortcuts overlay are modal; leave their keys alone.
      if (screen || shortcuts) return;

      const row = focusedRow();
      const listId = row?.dataset.rowList ?? currentColumn;
      const todo = todoById(row?.dataset.rowId);

      switch (action.type) {
        case "row": {
          if (!listId) return;
          e.preventDefault();
          const rows = columnRows(listId);
          if (!row) {
            rows[0]?.focus();
            setActiveColumn(listId);
            return;
          }
          rows[rows.indexOf(row) + action.delta]?.focus();
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
          composers.current.get(listId)?.focus();
          return;
        }
        default:
          break;
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

  const detailTodo = detailId ? (todoById(detailId) ?? null) : null;
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

  return (
    <div
      data-wide-ready={loading ? undefined : ""}
      className="fixed inset-0 z-10 flex bg-n-canvas font-n-text text-n-ink antialiased"
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
          openListId={openList ? openList.id : null}
          doneCount={doneCount}
          onTimeList={(list) => focusColumn(list.id)}
          onCollection={toggleCollection}
          onCreateList={addList}
          onDone={() => setScreen("done")}
          onSettings={() => setScreen("settings")}
          onShortcuts={() => setShortcuts(true)}
        />
        <main
          aria-label="Board"
          className={`flex min-w-0 flex-1 overflow-x-auto transition-[padding] duration-(--n-duration-base) ease-n-out ${
            detailTodo ? "pr-[max(22rem,min(28rem,40vw))]" : ""
          }`}
        >
          {columns.map((list) => {
            const kind = list.systemKind ?? null;
            const rows = rowsFor(list.id);
            return (
              <Column
                key={list.id}
                listId={list.id}
                title={list.name}
                subline={columnSubline(kind, now, timeZone)}
                tinted={!kind}
                rows={rows}
                subtasksOf={subtasksOf}
                checked={actions.checked}
                collapsing={actions.collapsing}
                highlightedId={menu?.id ?? detailTodo?.id ?? null}
                indicator={indicator}
                loading={loading}
                error={errorView}
                empty={EMPTY_COPY[kind ?? ""] ?? "Nothing here yet."}
                onClose={kind ? undefined : () => setOpenListId(null)}
                onFocusColumn={setActiveColumn}
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
                    onView={view}
                    textareaRef={(el) => {
                      if (el) composers.current.set(list.id, el);
                      else composers.current.delete(list.id);
                    }}
                  />
                }
                now={now}
                timeZone={timeZone}
                onCheck={actions.complete}
                onOpen={onOpen}
                onMenu={onMenu}
              />
            );
          })}
        </main>
        <DragOverlay dropAnimation={null}>
          {dragging ? (
            <div className="flex w-72 cursor-grabbing items-start gap-3 rounded-n-field border border-n-hairline bg-n-canvas px-3 py-2.5 shadow-[0_10px_30px_color-mix(in_srgb,black_14%,transparent)]">
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
        variant="panel"
        todo={detailTodo}
        subtasks={detailTodo ? subtasksOf(detailTodo.id) : []}
        listTargets={targets}
        listName={listName}
        timeZone={timeZone}
        actions={actions}
        onClose={() => {
          const id = detailId;
          setDetailId(null);
          // Back to the row it opened from.
          if (id) {
            requestAnimationFrame(() =>
              document
                .querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`)
                ?.focus(),
            );
          }
        }}
      />

      <ShortcutsOverlay open={shortcuts} onClose={() => setShortcuts(false)} />

      <DoneScreen
        open={screen === "done"}
        onClose={() => setScreen(null)}
        todos={todos}
        listName={listName}
        timeZone={timeZone}
        onRestore={actions.restore}
      />
      <SettingsScreen
        open={screen === "settings"}
        onClose={() => setScreen(null)}
      />
    </div>
  );
}
