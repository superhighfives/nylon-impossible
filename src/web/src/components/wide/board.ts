import type { BoardTimeKind } from "@nylon-impossible/shared";
import type { MenuView } from "@/components/phone/ContextMenu";
import type { TodoActions } from "@/components/phone/useTodoActions";
import { byPosition } from "@/lib/dragOrder";
import { toast } from "@/lib/toast";
import type { SerializedList, TodoWithUrls } from "@/types/database";
import {
  columnRows,
  focusedColumn,
  focusedRow,
  inSidebar,
  sectionOf,
  sidebarItemFor,
  stepSidebar,
} from "./boardDom";
import type { Board, JumpTarget } from "./commands";
import {
  adjacentSection,
  isColumnSection,
  type KeySection,
  nextSection,
  SHEET,
  SIDEBAR,
  stepIn,
  stepOut,
} from "./sections";

/** One place on the wide board's row, left to right. */
export type BoardSlot =
  | { kind: "list"; list: SerializedList }
  | { kind: "done" }
  | { kind: "sheet" }
  | { kind: "end" };

/**
 * The lists with a column on the board: all but the ones you've hidden
 * (Settled "Wide layout"). The sidebar keeps every list.
 */
export function shownColumns(lists: SerializedList[]): SerializedList[] {
  return lists.filter((l) => !l.columnHidden);
}

/**
 * The wide board's row: `lists` (the time lists, then yours in the
 * sidebar's order, less the hidden ones), then the end, then Done. The end
 * is the hatch that keeps Done just past the board's right edge (`doneGap`),
 * zero when the columns overflow; nothing follows Done. Nothing else is
 * swapped in or out. With a todo open, its sheet goes straight after the
 * todo's column (`sheetAfter`), and the columns after it keep their order.
 */
export function boardSlots(
  lists: SerializedList[],
  sheetAfter: string | null,
): BoardSlot[] {
  const slots: BoardSlot[] = [];
  for (const list of shownColumns(lists)) {
    slots.push({ kind: "list", list });
    if (list.id === sheetAfter) slots.push({ kind: "sheet" });
  }
  slots.push({ kind: "end" }, { kind: "done" });
  return slots;
}

/** What fills the board's row before its end, in px. */
export interface BoardFill {
  /** The board's width: what shows at once. */
  board: number;
  /** A column's width; every column, Done's included, is the same. */
  column: number;
  /** How many columns come before the end. */
  columns: number;
  /** What the open todo's sheet adds: its width less the padding it lies over. 0 with none. */
  sheet: number;
}

/** What three fractional column widths can fall short of the board by. */
const SUBPIXEL = 0.01;

/**
 * The end's width: the board left over once the columns (and sheet) are
 * laid out, so Done starts exactly at its right edge at scroll 0, with none
 * of it in view (principle 3). Zero once they reach the edge. Rounded up, so
 * a fraction of a pixel never lets Done's hairline in. Columns a third of
 * the board are fractional, so three can sum to a hair under it; less than
 * `SUBPIXEL` left over is float error, not room for a hatch.
 */
export function doneGap({ board, column, columns, sheet }: BoardFill): number {
  return Math.max(0, Math.ceil(board - columns * column - sheet - SUBPIXEL));
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
  /** The sections in Tab order: the sidebar, the columns, the sheet. */
  sections: string[];
  /**
   * The section with the keyboard as `WideApp` last saw it: where keys act
   * when focus is outside the sections (the toolbar, nowhere).
   */
  keySection: KeySection;
  /** The column the keyboard was last on or in: Return on the sidebar's entry. */
  cameFrom: string;
  /** The selection's column if it's on screen, else the keyboard's, else Today. */
  currentColumn: string | null;
  selectionColumn: string | null;
  detailOpen: boolean;
  byKind: Partial<Record<BoardTimeKind, SerializedList>>;
  actions: TodoActions;
  todoById: (id: string | undefined) => TodoWithUrls | undefined;
  doneById: (id: string | undefined) => TodoWithUrls | undefined;
  selectedRow: () => HTMLElement | null;
  /** The open todo's row. */
  sheetRow: () => HTMLElement | null;
  focusColumn: (listId: string, index?: number, rowId?: string) => void;
  /** Put the keyboard on a section, with nothing in it chosen. */
  toSection: (id: string) => void;
  /** Whether a column has Add (every column but Done). */
  hasAdd: (listId: string) => boolean;
  /** Put the keyboard on a column's Add: typing, or on it ready to type. */
  focusAdd: (listId: string, typing: boolean) => void;
  /** Into the open todo's title, ready to edit. */
  focusSheetTitle: () => void;
  /** Let go of the selected todo; its column remembers it. */
  clearSelection: () => void;
  /** Before a row leaves its column, hand focus (and the selection) on. */
  focusNeighbour: (row: HTMLElement) => void;
  /** Move a todo to another list; the selection goes with it. */
  moveTodo: (todo: TodoWithUrls, listId: string) => void;
  open: (todo: TodoWithUrls) => void;
  /** Close the open todo; `toRow` puts the keyboard back on its row. */
  closeDetail: (toRow: boolean) => void;
  /** The right-click menu, under `row`, at `view`. */
  openMenu: (todo: TodoWithUrls, row: HTMLElement, view: MenuView) => void;
  /** Your list's ⋯ menu, from the keys (the time lists have none). */
  openColumnMenu: (listId: string) => void;
  openMoveTo: (todo: TodoWithUrls) => void;
  jump: (target: JumpTarget) => void;
  /** Move the list whose sidebar entry has focus one place up or down. */
  moveList: (delta: 1 | -1) => void;
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
 * row (or the focused one, or the open todo from its sheet); the arrows,
 * Tab, Return and Esc move between and within sections (`sections.ts`).
 */
export function createBoard(ctx: BoardContext): Board {
  const { actions } = ctx;

  /**
   * Where the keyboard is: the section focus is in, on it if focus is on its
   * anchor. A column's head is either: a click on the column's space puts
   * focus there, in it; Esc puts it there, on it. Focus elsewhere (the
   * toolbar, nowhere) leaves the keyboard where it was.
   */
  const here = (): KeySection => {
    const at = sectionOf(document.activeElement);
    if (!at) return ctx.keySection;
    if (!isColumnSection(at.id)) {
      return { id: at.id, level: at.anchor ? "on" : "in" };
    }
    if (!at.anchor) return { id: at.id, level: "in" };
    return {
      id: at.id,
      level: ctx.keySection.id === at.id ? ctx.keySection.level : "in",
    };
  };
  /** Focus is on a column's Add. */
  const onAdd = () =>
    !!document.activeElement?.closest("[data-column-composer]");

  /** The selected row and its todo: open, or finished (in Done). */
  const current = () => {
    const row =
      here().id === SHEET
        ? ctx.sheetRow()
        : (focusedRow() ?? ctx.selectedRow());
    return {
      row,
      todo: ctx.todoById(row?.dataset.rowId),
      done: ctx.doneById(row?.dataset.rowId),
    };
  };
  /** With no row, the column focus is in (its title, after a click). */
  const focusedColumnId = () => {
    const column = focusedColumn();
    return column && ctx.columnIds.includes(column) ? column : null;
  };
  const rowColumn = (row: HTMLElement | null) =>
    row?.dataset.rowList && ctx.columnIds.includes(row.dataset.rowList)
      ? row.dataset.rowList
      : (focusedColumnId() ?? ctx.currentColumn);

  return {
    moveRow: (delta) => {
      if (inSidebar()) return stepSidebar(delta);
      if (here().id === SHEET) return;
      const add = onAdd();
      const { row } = current();
      const column = add ? focusedColumnId() : rowColumn(row);
      if (!column) return;
      const rows = columnRows(column);
      // Add sits above the first todo: ↓ from it is the first todo.
      if (add) {
        if (delta > 0) rows[0]?.focus();
        return;
      }
      const at = row ? rows.indexOf(row) : -1;
      // From a column with nothing selected, ↓ starts at the top (Add, where
      // there is one), ↑ at the end.
      if (at === -1) {
        if (delta > 0 && ctx.hasAdd(column)) ctx.focusAdd(column, false);
        else (delta > 0 ? rows[0] : rows.at(-1))?.focus();
      }
      // ↑ from the first todo reaches Add.
      else if (at === 0 && delta < 0 && ctx.hasAdd(column)) {
        ctx.focusAdd(column, false);
      } else rows[at + delta]?.focus();
    },
    moveColumn: (delta) => {
      const at = here();
      if (at.id === SIDEBAR && at.level === "in") {
        // → goes into the column, as a click; New list, Settings and
        // Keyboard shortcuts take Enter instead.
        const el = document.activeElement;
        if (
          delta === 1 &&
          el instanceof HTMLElement &&
          (el.dataset.sidebarList || el.dataset.sidebarItem)
        ) {
          el.click();
        }
        return;
      }
      // On a section, or the sheet: the adjacent section.
      if (at.level === "on" || at.id === SHEET) {
        const to = adjacentSection(ctx.sections, at.id, delta);
        if (to) ctx.toSection(to);
        return;
      }
      // In a column: the same place in the next one, skipping the sheet.
      const add = onAdd();
      const { row } = current();
      const column = add ? focusedColumnId() : rowColumn(row);
      if (!column) return;
      const index = ctx.columnIds.indexOf(column);
      if (index === 0 && delta === -1) {
        // Into the sidebar, as Esc: let go of the todo; → reselects it.
        sidebarItemFor(column)?.focus();
        ctx.clearSelection();
        return;
      }
      const to = ctx.columnIds[index + delta];
      if (!to) return;
      if (add && ctx.hasAdd(to)) return ctx.focusAdd(to, false);
      const position = row ? columnRows(column).indexOf(row) : 0;
      ctx.focusColumn(to, Math.max(0, position));
    },
    nextSection: (delta) => {
      ctx.toSection(nextSection(ctx.sections, here().id, delta));
    },
    back: () => {
      const at = here();
      const out = stepOut(at, ctx.detailOpen);
      switch (out.to) {
        case "section":
          return ctx.toSection(out.id);
        case "entry":
          // Into the sidebar at this column, letting go of the todo. → back
          // in reselects the column's last todo.
          sidebarItemFor(out.column)?.focus();
          return ctx.clearSelection();
        case "close":
          return ctx.closeDetail(false);
        case "close-to-row":
          return ctx.closeDetail(true);
      }
    },
    open: () => {
      const at = here();
      const step = stepIn(at.id, {
        rows: isColumnSection(at.id) ? columnRows(at.id).length : 0,
        hasAdd: ctx.hasAdd(at.id),
        cameFrom: ctx.cameFrom,
      });
      switch (step.to) {
        case "entry":
          sidebarItemFor(step.column)?.focus();
          return;
        case "title":
          return ctx.focusSheetTitle();
        case "row":
          return ctx.focusColumn(at.id, 0);
        case "add":
          return ctx.focusAdd(at.id, false);
      }
    },
    addHere: () => {
      const at = here();
      if (isColumnSection(at.id) && ctx.hasAdd(at.id)) {
        ctx.focusAdd(at.id, true);
      } else ctx.newTodo();
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
      const { todo } = current();
      const target = ctx.byKind[kind];
      if (!todo || !target || target.id === todo.listId) return;
      ctx.moveTodo(todo, target.id);
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
      if (row && todo) ctx.openMenu(todo, row, "due");
    },
    menu: () => {
      const { row, todo } = current();
      if (row && todo) return ctx.openMenu(todo, row, "main");
      // On a column with nothing selected: your list's ⋯ menu, as `.` opens
      // a todo's (principle 7).
      const at = here();
      if (!row && isColumnSection(at.id) && !onAdd()) {
        ctx.openColumnMenu(at.id);
      }
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
      actions.undo();
    },
    redo: () => {
      actions.redo();
    },
    palette: ctx.togglePalette,
    jump: ctx.jump,
    moveList: ctx.moveList,
    startGo: ctx.startGo,
    goToList: ctx.goToList,
    shortcuts: ctx.toggleShortcuts,
    feedback: ctx.feedback,
  };
}
