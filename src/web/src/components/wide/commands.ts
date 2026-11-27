import type { BoardTimeKind } from "@nylon-impossible/shared";
import type { TodoWithUrls } from "@/types/database";

/**
 * The wide board's one list of commands. The key handler, the shortcuts
 * dialog, the command palette and the right-click menu all read from it,
 * so a key, a label or a command can't exist in one and not the others.
 */

/** Where a jump lands. */
export type JumpTarget =
  | { kind: "time"; list: BoardTimeKind }
  | { kind: "list"; index: number }
  | { kind: "done" };

/** What the board can do; `WideApp` implements it. */
export interface Board {
  moveRow: (delta: 1 | -1) => void;
  moveColumn: (delta: 1 | -1) => void;
  /** Tab (1) and ⇧Tab (-1): the next or previous section, wrapping. */
  nextSection: (delta: 1 | -1) => void;
  back: () => void;
  open: () => void;
  openLink: () => void;
  done: () => void;
  move: (kind: BoardTimeKind) => void;
  moveTo: () => void;
  pin: () => void;
  due: () => void;
  /** The right-click menu, under the selected row. */
  menu: () => void;
  remove: () => void;
  /** Quick add. */
  newTodo: () => void;
  /** n: type in the Add of the column the keyboard is on or in, else Quick add. */
  addHere: () => void;
  newList: () => void;
  undo: () => void;
  redo: () => void;
  palette: () => void;
  jump: (target: JumpTarget) => void;
  /** ⌥↑ (-1) and ⌥↓ (1): the list whose sidebar entry has focus, one place. */
  moveList: (delta: 1 | -1) => void;
  startGo: () => void;
  goToList: () => void;
  shortcuts: () => void;
  feedback: () => void;
}

/** One way to press a command. */
interface Binding {
  /** `KeyboardEvent.key`, lower-cased for letters. */
  key?: string;
  /** `KeyboardEvent.code`, for ⇧-digits: Shift turns `key` into `!`, `@` … */
  code?: string;
  shift?: boolean;
  /** ⌘ on a Mac, Ctrl elsewhere. */
  mod?: boolean;
  /** ⌥ on a Mac, Alt elsewhere. */
  alt?: boolean;
  /** Only straight after G. */
  afterG?: boolean;
  /** Passed to `run`: which of your lists ⇧4…⇧9 means, or `ADD_HERE`. */
  arg?: number;
  /** This way of pressing it works while typing in a field (⌘N). */
  anywhere?: boolean;
}

/** n's `arg`: add where the keyboard is, rather than in Quick add. */
const ADD_HERE = 1;

export type CommandGroup =
  | "Move around"
  | "Todo"
  | "Go to"
  | "Lists"
  | "Create"
  | "Notes"
  | "Help";

export interface Command {
  id: string;
  /** In the shortcuts dialog, and the menu and palette unless overridden. */
  label: string;
  /** Key caps for display; each inner array is one way to press it. */
  keys: string[][];
  bindings: Binding[];
  group: CommandGroup;
  /** Acts on the selected todo. */
  needsSelection?: boolean;
  /** Works while typing in a field (⌘K). */
  anywhere?: boolean;
  /**
   * Works while typing in a column's own field, its Add or its title being
   * renamed (Tab, which leaves it for the next section).
   */
  leavesColumnFields?: boolean;
  /**
   * A focused button or link takes the key itself (Enter presses it); the
   * board only acts where there's none, on a section or on Add.
   */
  native?: boolean;
  /** Admins only. */
  admin?: boolean;
  /** In the right-click menu, labelled for the todo it's for. */
  menu?: (todo: TodoWithUrls) => string;
  /** In the palette's Commands group; given the selection, if any. */
  palette?: (todo: TodoWithUrls | null) => string | null;
  run: (board: Board, arg?: number) => void;
}

const quote = (todo: TodoWithUrls) => `“${todo.title}”`;

const SHIFT_DIGITS = [4, 5, 6, 7, 8, 9].map((n) => ({
  code: `Digit${n}`,
  shift: true,
  arg: n - 4,
}));

export const COMMANDS: Command[] = [
  // Move around
  {
    id: "next",
    label: "Next todo",
    keys: [["J"], ["↓"]],
    bindings: [{ key: "j" }, { key: "ArrowDown" }],
    group: "Move around",
    run: (b) => b.moveRow(1),
  },
  {
    id: "previous",
    label: "Previous todo",
    keys: [["K"], ["↑"]],
    bindings: [{ key: "k" }, { key: "ArrowUp" }],
    group: "Move around",
    run: (b) => b.moveRow(-1),
  },
  {
    id: "left",
    label: "Column left, or into the sidebar",
    keys: [["H"], ["←"]],
    bindings: [{ key: "h" }, { key: "ArrowLeft" }],
    group: "Move around",
    run: (b) => b.moveColumn(-1),
  },
  {
    id: "right",
    label: "Column right, or out of the sidebar",
    keys: [["L"], ["→"]],
    bindings: [{ key: "l" }, { key: "ArrowRight" }],
    group: "Move around",
    run: (b) => b.moveColumn(1),
  },
  {
    id: "next-section",
    label: "Next section",
    keys: [["⇥"]],
    bindings: [{ key: "Tab", shift: false }],
    group: "Move around",
    leavesColumnFields: true,
    run: (b) => b.nextSection(1),
  },
  {
    id: "previous-section",
    label: "Previous section",
    keys: [["⇧", "⇥"]],
    bindings: [{ key: "Tab", shift: true }],
    group: "Move around",
    leavesColumnFields: true,
    run: (b) => b.nextSection(-1),
  },
  {
    id: "open",
    label: "Step in, or open",
    keys: [["↵"]],
    bindings: [{ key: "Enter" }],
    native: true,
    group: "Move around",
    run: (b) => b.open(),
  },
  {
    id: "back",
    label: "Step out, or close",
    keys: [["Esc"]],
    bindings: [{ key: "Escape" }],
    group: "Move around",
    run: (b) => b.back(),
  },

  // Todo
  {
    id: "done",
    label: "Mark done",
    keys: [["X"]],
    bindings: [{ key: "x" }],
    group: "Todo",
    needsSelection: true,
    menu: () => "Mark done",
    palette: (t) => (t ? `Mark ${quote(t)} done` : null),
    run: (b) => b.done(),
  },
  ...(
    [
      ["today", "Today", "1"],
      ["thisWeek", "This week", "2"],
      ["someday", "Someday", "3"],
    ] as const
  ).map(
    ([kind, name, key]): Command => ({
      id: `move-${kind}`,
      label: `Move to ${name}`,
      keys: [[key]],
      bindings: [{ key }],
      group: "Todo",
      needsSelection: true,
      menu: () => `Move to ${name}`,
      run: (b) => b.move(kind),
    }),
  ),
  {
    id: "move-to",
    label: "Move to a list…",
    keys: [["M"]],
    bindings: [{ key: "m" }],
    group: "Todo",
    needsSelection: true,
    menu: () => "Move to a list…",
    palette: (t) => (t ? `Move ${quote(t)} to…` : null),
    run: (b) => b.moveTo(),
  },
  {
    id: "open-link",
    label: "Open link",
    keys: [["O"]],
    bindings: [{ key: "o" }],
    group: "Todo",
    needsSelection: true,
    menu: () => "Open link",
    palette: (t) => (t?.urls.length ? `Open ${quote(t)}’s link` : null),
    run: (b) => b.openLink(),
  },
  {
    id: "pin",
    label: "Pin or unpin",
    keys: [["P"]],
    bindings: [{ key: "p" }],
    group: "Todo",
    needsSelection: true,
    menu: (t) => (t.pinned ? "Unpin" : "Pin to top"),
    palette: (t) => (t ? `${t.pinned ? "Unpin" : "Pin"} ${quote(t)}` : null),
    run: (b) => b.pin(),
  },
  {
    id: "due",
    label: "Due…",
    keys: [["D"]],
    bindings: [{ key: "d" }],
    group: "Todo",
    needsSelection: true,
    menu: () => "Due…",
    run: (b) => b.due(),
  },
  {
    id: "menu",
    label: "Open menu",
    keys: [["."], ["⇧", "F10"]],
    // ⇧F10 and the Menu key are how Windows and Linux open a context menu.
    bindings: [
      { key: "." },
      { key: "F10", shift: true },
      { key: "ContextMenu" },
    ],
    group: "Todo",
    needsSelection: true,
    run: (b) => b.menu(),
  },
  {
    id: "delete",
    label: "Delete",
    keys: [["⌫"]],
    bindings: [{ key: "Backspace" }, { key: "Delete" }],
    group: "Todo",
    needsSelection: true,
    menu: () => "Delete",
    run: (b) => b.remove(),
  },

  // Go to
  ...(
    [
      ["today", "Today", "1", "t"],
      ["thisWeek", "This week", "2", "w"],
      ["someday", "Someday", "3", "s"],
    ] as const
  ).map(
    ([kind, name, digit, letter]): Command => ({
      id: `go-${kind}`,
      label: name,
      keys: [
        ["⇧", digit],
        ["G", letter.toUpperCase()],
      ],
      bindings: [
        { code: `Digit${digit}`, shift: true },
        { key: letter, afterG: true },
      ],
      group: "Go to",
      run: (b) => b.jump({ kind: "time", list: kind }),
    }),
  ),
  {
    id: "go-list",
    label: "Your lists, in sidebar order",
    keys: [["⇧", "4–9"]],
    bindings: SHIFT_DIGITS,
    group: "Go to",
    run: (b, index = 0) => b.jump({ kind: "list", index }),
  },
  {
    id: "go-done",
    label: "Done",
    keys: [
      ["⇧", "0"],
      ["G", "D"],
    ],
    bindings: [
      { code: "Digit0", shift: true },
      { key: "d", afterG: true },
    ],
    group: "Go to",
    run: (b) => b.jump({ kind: "done" }),
  },
  {
    id: "go-lists",
    label: "Go to a list",
    keys: [["G", "L"]],
    bindings: [{ key: "l", afterG: true }],
    group: "Go to",
    run: (b) => b.goToList(),
  },
  {
    id: "go",
    label: "Go to…",
    keys: [["G"]],
    bindings: [{ key: "g" }],
    group: "Go to",
    run: (b) => b.startGo(),
  },
  {
    id: "palette",
    label: "Search and commands",
    keys: [["⌘", "K"]],
    bindings: [{ key: "k", mod: true }],
    group: "Go to",
    anywhere: true,
    run: (b) => b.palette(),
  },

  // Lists: on one of your lists' sidebar entries. The palette offers them
  // for that list, or the one with the selection (`paletteGroups`).
  {
    id: "move-list-up",
    label: "Move list up",
    keys: [["⌥", "↑"]],
    bindings: [{ key: "ArrowUp", alt: true }],
    group: "Lists",
    run: (b) => b.moveList(-1),
  },
  {
    id: "move-list-down",
    label: "Move list down",
    keys: [["⌥", "↓"]],
    bindings: [{ key: "ArrowDown", alt: true }],
    group: "Lists",
    run: (b) => b.moveList(1),
  },

  // Create
  {
    id: "new-todo",
    label: "New todo",
    keys: [["N"], ["⌘", "N"]],
    // n adds where you are; ⌘N, and the palette, always open Quick add.
    bindings: [
      { key: "n", arg: ADD_HERE },
      { key: "n", mod: true, anywhere: true },
    ],
    group: "Create",
    palette: () => "New todo",
    run: (b, arg) => (arg === ADD_HERE ? b.addHere() : b.newTodo()),
  },
  {
    id: "new-list",
    label: "New list",
    keys: [["⇧", "N"]],
    bindings: [{ key: "n", shift: true }],
    group: "Create",
    palette: () => "New list",
    run: (b) => b.newList(),
  },

  // Notes: listed only. The notes editor binds them itself (`Notes`), since
  // they work only while typing there, where the board's keys don't.
  {
    id: "notes-bold",
    label: "Bold",
    keys: [["⌘", "B"]],
    bindings: [],
    group: "Notes",
    run: () => {},
  },
  {
    id: "notes-italic",
    label: "Italic",
    keys: [["⌘", "I"]],
    bindings: [],
    group: "Notes",
    run: () => {},
  },
  {
    id: "notes-code",
    label: "Code",
    keys: [["⌘", "E"]],
    bindings: [],
    group: "Notes",
    run: () => {},
  },

  // Help
  {
    id: "undo",
    label: "Undo",
    keys: [["Z"]],
    bindings: [{ key: "z" }],
    group: "Help",
    run: (b) => b.undo(),
  },
  {
    id: "redo",
    label: "Redo",
    keys: [["⇧", "Z"]],
    bindings: [{ key: "z", shift: true }],
    group: "Help",
    run: (b) => b.redo(),
  },
  {
    id: "shortcuts",
    label: "Keyboard shortcuts",
    keys: [["?"]],
    bindings: [{ key: "?" }],
    group: "Help",
    palette: () => "Keyboard shortcuts",
    run: (b) => b.shortcuts(),
  },
  {
    id: "feedback",
    label: "Send feedback",
    keys: [["F"]],
    bindings: [{ key: "f" }],
    group: "Help",
    admin: true,
    run: (b) => b.feedback(),
  },
];

export const GROUPS: CommandGroup[] = [
  "Move around",
  "Todo",
  "Go to",
  "Lists",
  "Create",
  "Notes",
  "Help",
];

/** The commands an account sees: Send feedback only for admins. */
export function visibleCommands(admin: boolean): Command[] {
  return COMMANDS.filter((c) => admin || !c.admin);
}

export function commandById(id: string): Command {
  const command = COMMANDS.find((c) => c.id === id);
  if (!command) throw new Error(`Unknown command ${id}`);
  return command;
}

/** A command's keys as one hint: "⇧1", "⌘K", "X". */
export function keyHint(id: string): string {
  return commandById(id).keys[0].join("");
}

interface KeyEventLike {
  key: string;
  code?: string;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}

function matches(b: Binding, e: KeyEventLike, afterG: boolean): boolean {
  if (!!b.afterG !== afterG) return false;
  const mod = !!(e.metaKey || e.ctrlKey);
  if (!!b.mod !== mod || !!b.alt !== !!e.altKey) return false;
  if (b.code) return e.code === b.code && !!e.shiftKey === !!b.shift;
  if (!b.key) return false;
  // Letters compare case-blind. Shift has to match for letters (⇧N) and
  // where the binding names it (⇥, ⇧⇥), and is ignored for keys that need
  // it to type (?).
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (key !== b.key) return false;
  if (b.shift !== undefined || /^[a-z]$/.test(b.key)) {
    return !!e.shiftKey === !!b.shift;
  }
  return true;
}

/** The command a key press means, if any, with its argument. */
export function commandForKey(
  e: KeyEventLike,
  { afterG = false }: { afterG?: boolean } = {},
): { command: Command; arg?: number; anywhere?: boolean } | null {
  for (const command of COMMANDS) {
    for (const b of command.bindings) {
      if (matches(b, e, afterG)) {
        return {
          command,
          arg: b.arg,
          anywhere: command.anywhere || b.anywhere,
        };
      }
    }
  }
  return null;
}
