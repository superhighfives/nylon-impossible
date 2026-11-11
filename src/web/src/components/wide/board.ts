import type { BoardTimeKind } from "@nylon-impossible/shared";
import type { TodoActions } from "@/components/phone/useTodoActions";
import { runToastUndo } from "@/components/phone/useTodoActions";
import { byPosition } from "@/lib/dragOrder";
import { toast } from "@/lib/toast";
import type { SerializedList, TodoWithUrls } from "@/types/database";
import {
  columnRows,
  focusedColumn,
  focusedRow,
  inSidebar,
  sidebarItemFor,
  stepSidebar,
} from "./boardDom";
import type { Board, JumpTarget } from "./commands";

/** One place on the wide board's row, left to right. */
export type BoardSlot =
  | { kind: "list"; list: SerializedList }
  | { kind: "done" }
  | { kind: "sheet" }
  | { kind: "end" };

/**
 * The wide board's row: `lists` (the time lists, then yours in the
 * sidebar's order), then Done, then the end: the rest of the board's width,
 * zero when the columns overflow. Nothing is swapped in or out. With a todo
 * open, its sheet goes straight after the todo's column (`sheetAfter`), and
 * the columns after it keep their order.
 */
export function boardSlots(
  lists: SerializedList[],
  sheetAfter: string | null,
): BoardSlot[] {
  const slots: BoardSlot[] = [];
  for (const list of lists) {
    slots.push({ kind: "list", list });
    if (list.id === sheetAfter) slots.push({ kind: "sheet" });
  }
  slots.push({ kind: "done" }, { kind: "end" });
  return slots;
}

/** A horizontal stretch of the board, in its scrolled content's px. */
export interface Span {
  left: number;
  right: number;
}

/** The board's scrolled viewport. */
export interface BoardView {
  scrollLeft: number;
  width: number;
}

/**
 * The least scroll that shows `span` whole: unchanged if it already shows,
 * else just far enough. A span wider than the view shows its start.
 */
export function revealSpan(view: BoardView, span: Span): number {
  if (span.left < view.scrollLeft) return Math.max(0, span.left);
  if (span.right > view.scrollLeft + view.width) {
    return Math.max(0, Math.min(span.left, span.right - view.width));
  }
  return view.scrollLeft;
}

/**
 * Where to scroll the board so the open todo's whole column and its whole
 * sheet show, by the least amount. If both don't fit, the sheet wins: it
 * sits against the right edge, with as much of its column as fits beside.
 */
export function sheetScrollTarget(
  view: BoardView,
  column: Span,
  sheet: Span,
): number {
  if (sheet.right - column.left <= view.width) {
    return revealSpan(view, { left: column.left, right: sheet.right });
  }
  return Math.max(0, Math.min(sheet.left, sheet.right - view.width));
}

/** What the commands need from the board, as `WideApp` has it this render. */
export interface BoardContext {
  /** The columns with rows, left to right (not the sheet). */
  columnIds: string[];
  /** The selection's column if it's on screen, else Today. */
  currentColumn: string | null;
  selectionColumn: string | null;
  detailOpen: boolean;
  byKind: Partial<Record<BoardTimeKind, SerializedList>>;
  actions: TodoActions;
  todoById: (id: string | undefined) => TodoWithUrls | undefined;
  doneById: (id: string | undefined) => TodoWithUrls | undefined;
  selectedRow: () => HTMLElement | null;
  focusColumn: (listId: string, index?: number, rowId?: string) => void;
  /** Let go of the selected todo; its column remembers it. */
  clearSelection: () => void;
  /** Before a row leaves its column, hand focus (and the selection) on. */
  focusNeighbour: (row: HTMLElement) => void;
  open: (todo: TodoWithUrls) => void;
  closeDetail: () => void;
  openDueMenu: (todo: TodoWithUrls, row: HTMLElement) => void;
  openMoveTo: (todo: TodoWithUrls) => void;
  jump: (target: JumpTarget) => void;
  startGo: () => void;
  newTodo: () => void;
  newList: () => void;
  togglePalette: () => void;
  goToList: () => void;
  toggleShortcuts: () => void;
  feedback: () => void;
}

/**
 * The board the command registry runs against. Commands act on the selected
 * row (or the focused one); ↑ ↓ → act on the sidebar when focus is there.
 */
export function createBoard(ctx: BoardContext): Board {
  const { actions } = ctx;

  /** The selected row and its todo: open, or finished (in Done). */
  const current = () => {
    const row = focusedRow() ?? ctx.selectedRow();
    return {
      row,
      todo: ctx.todoById(row?.dataset.rowId),
      done: ctx.doneById(row?.dataset.rowId),
    };
  };
  /** With no row, the column focus is in (its title, after a click). */
  const focusColumnId = () => {
    const column = focusedColumn();
    return column && ctx.columnIds.includes(column) ? column : null;
  };
  const rowColumn = (row: HTMLElement | null) =>
    row?.dataset.rowList && ctx.columnIds.includes(row.dataset.rowList)
      ? row.dataset.rowList
      : (focusColumnId() ?? ctx.currentColumn);

  return {
    moveRow: (delta) => {
      if (inSidebar()) return stepSidebar(delta);
      const { row } = current();
      const column = rowColumn(row);
      if (!column) return;
      const rows = columnRows(column);
      const at = row ? rows.indexOf(row) : -1;
      // From a column with nothing selected, ↓ starts at the top, ↑ at the end.
      if (at === -1) (delta > 0 ? rows[0] : rows.at(-1))?.focus();
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
      const at = ctx.columnIds.indexOf(column);
      if (at === 0 && delta === -1) {
        // Into the sidebar, as Esc: let go of the todo; → reselects it.
        sidebarItemFor(column)?.focus();
        ctx.clearSelection();
        return;
      }
      const to = ctx.columnIds[at + delta];
      if (!to) return;
      const index = row ? columnRows(column).indexOf(row) : 0;
      ctx.focusColumn(to, Math.max(0, index));
    },
    back: () => {
      if (ctx.detailOpen) return ctx.closeDetail();
      // Into the sidebar at this column, letting go of the todo. → back in
      // reselects the column's last todo.
      sidebarItemFor(
        ctx.selectionColumn ?? focusColumnId() ?? ctx.currentColumn,
      )?.focus();
      ctx.clearSelection();
    },
    open: () => {
      const { todo } = current();
      if (todo) ctx.open(todo);
    },
    done: () => {
      const { row, todo, done } = current();
      if (!row) return;
      if (done) {
        ctx.focusNeighbour(row);
        actions.restore(done);
      } else if (todo) {
        ctx.focusNeighbour(row);
        actions.complete(todo);
      }
    },
    move: (kind) => {
      const { row, todo } = current();
      const target = ctx.byKind[kind];
      if (!row || !todo || !target || target.id === todo.listId) return;
      ctx.focusNeighbour(row);
      actions.move(todo, target.id);
    },
    moveTo: () => {
      const { todo } = current();
      if (todo) ctx.openMoveTo(todo);
    },
    openLink: () => {
      const { todo } = current();
      if (!todo) return;
      const first = [...todo.urls].sort(byPosition)[0];
      if (first) window.open(first.url, "_blank", "noopener,noreferrer");
      else toast.info("No link on this todo");
    },
    pin: () => {
      const { todo } = current();
      if (todo) actions.togglePin(todo);
    },
    due: () => {
      const { row, todo } = current();
      if (row && todo) ctx.openDueMenu(todo, row);
    },
    remove: () => {
      const { row, todo, done } = current();
      const target = todo ?? done;
      if (!row || !target) return;
      ctx.focusNeighbour(row);
      actions.destroy(target);
    },
    newTodo: ctx.newTodo,
    newList: ctx.newList,
    undo: () => {
      runToastUndo();
    },
    palette: ctx.togglePalette,
    jump: ctx.jump,
    startGo: ctx.startGo,
    goToList: ctx.goToList,
    shortcuts: ctx.toggleShortcuts,
    feedback: ctx.feedback,
  };
}
