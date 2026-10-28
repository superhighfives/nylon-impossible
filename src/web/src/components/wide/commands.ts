import type { SystemListKind, TodoWithUrls } from "@/types/database";

/**
 * The wide board's one list of commands. The key handler, the shortcuts
 * dialog, the command palette and the right-click menu all read from it,
 * so a key, a label or a command can't exist in one and not the others.
 */

/** Where a jump lands. */
export type JumpTarget =
  | { kind: "time"; list: SystemListKind }
  | { kind: "list"; index: number }
  | { kind: "done" };

/** What the board can do; `WideApp` implements it. */
export interface Board {
  moveRow: (delta: 1 | -1) => void;
  moveColumn: (delta: 1 | -1) => void;
  back: () => void;
  open: () => void;
  done: () => void;
  move: (kind: SystemListKind) => void;
  moveTo: () => void;
  pin: () => void;
  due: () => void;
  remove: () => void;
  newTodo: () => void;
  newList: () => void;
  undo: () => void;
  palette: () => void;
  jump: (target: JumpTarget) => void;
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
  /** Only straight after G. */
  afterG?: boolean;
  /** Passed to `run`: which of your lists ⇧4…⇧9 means. */
  arg?: number;
}

export type CommandGroup = "Move around" | "Todo" | "Go to" | "Create" | "Help";

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
  /** Enter is handled by the focused button; listed, never matched. */
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
    id: "open",
    label: "Open, or go into a list",
    keys: [["↵"]],
    bindings: [],
    native: true,
    group: "Move around",
    run: (b) => b.open(),
  },
  {
    id: "back",
    label: "Back out: close, then the sidebar",
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

  // Create
  {
    id: "new-todo",
    label: "New todo",
    keys: [["N"]],
    bindings: [{ key: "n" }],
    group: "Create",
    palette: () => "New todo",
    run: (b) => b.newTodo(),
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
    id: "shortcuts",
    label: "Keyboard shortcuts",
    keys: [["?"]],
    bindings: [{ key: "?", shift: true }],
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
  "Create",
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
  if (!!b.mod !== mod || e.altKey) return false;
  if (b.code) return e.code === b.code && !!e.shiftKey === !!b.shift;
  if (!b.key) return false;
  // Letters compare case-blind; Shift has to match where it's part of the
  // binding (⇧N), and is ignored for keys that need it to type (?).
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (key !== b.key) return false;
  if (b.key.length === 1 && /[a-z]/.test(b.key)) {
    return !!e.shiftKey === !!b.shift;
  }
  return true;
}

/** The command a key press means, if any, with its argument. */
export function commandForKey(
  e: KeyEventLike,
  { afterG = false }: { afterG?: boolean } = {},
): { command: Command; arg?: number } | null {
  for (const command of COMMANDS) {
    if (command.native) continue;
    for (const b of command.bindings) {
      if (matches(b, e, afterG)) return { command, arg: b.arg };
    }
  }
  return null;
}
