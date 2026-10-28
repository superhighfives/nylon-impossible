import type { TodoActions } from "@/components/phone/useTodoActions";
import { runToastUndo } from "@/components/phone/useTodoActions";
import { toast } from "@/lib/toast";
import type {
  SerializedList,
  SystemListKind,
  TodoWithUrls,
} from "@/types/database";
import {
  columnRows,
  focusedRow,
  inSidebar,
  sidebarItemFor,
  stepSidebar,
} from "./boardDom";
import type { Board, JumpTarget } from "./commands";

/** What the commands need from the board, as `WideApp` has it this render. */
export interface BoardContext {
  /** The columns with rows, left to right (not the detail). */
  columnIds: string[];
  /** The selection's column if it's on screen, else Today. */
  currentColumn: string | null;
  selectionColumn: string | null;
  detailOpen: boolean;
  byKind: Partial<Record<SystemListKind, SerializedList>>;
  actions: TodoActions;
  todoById: (id: string | undefined) => TodoWithUrls | undefined;
  doneById: (id: string | undefined) => TodoWithUrls | undefined;
  selectedRow: () => HTMLElement | null;
  focusColumn: (listId: string, index?: number, rowId?: string) => void;
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
  const rowColumn = (row: HTMLElement | null) =>
    row?.dataset.rowList && ctx.columnIds.includes(row.dataset.rowList)
      ? row.dataset.rowList
      : ctx.currentColumn;

  return {
    moveRow: (delta) => {
      if (inSidebar()) return stepSidebar(delta);
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
      const at = ctx.columnIds.indexOf(column);
      if (at === 0 && delta === -1) {
        sidebarItemFor(column)?.focus();
        return;
      }
      const to = ctx.columnIds[at + delta];
      if (!to) return;
      const index = row ? columnRows(column).indexOf(row) : 0;
      ctx.focusColumn(to, Math.max(0, index));
    },
    back: () => {
      if (ctx.detailOpen) ctx.closeDetail();
      else sidebarItemFor(ctx.selectionColumn ?? ctx.currentColumn)?.focus();
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
      const first = [...todo.urls].sort((a, b) =>
        a.position.localeCompare(b.position),
      )[0];
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
