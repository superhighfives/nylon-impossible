import type { SystemListKind } from "@/types/database";

/** What a key on the wide board does. See `SHORTCUTS` for the overlay. */
export type BoardKeyAction =
  | { type: "row"; delta: 1 | -1 }
  | { type: "column"; delta: 1 | -1 }
  | { type: "done" }
  | { type: "move"; kind: SystemListKind }
  | { type: "pin" }
  | { type: "due" }
  | { type: "delete" }
  | { type: "new" }
  | { type: "undo" }
  | { type: "back" }
  | { type: "feedback" }
  | { type: "shortcuts" };

const KINDS: Record<string, SystemListKind> = {
  "1": "today",
  "2": "thisWeek",
  "3": "someday",
};

/**
 * The keyboard map. Plain keys only: with ⌘, Ctrl or Alt held the browser
 * (or the OS) keeps the key. Enter isn't here — a focused row is a button,
 * so Enter opens it natively.
 */
export function boardKeyAction(e: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}): BoardKeyAction | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  switch (e.key) {
    case "j":
    case "ArrowDown":
      return { type: "row", delta: 1 };
    case "k":
    case "ArrowUp":
      return { type: "row", delta: -1 };
    case "l":
    case "ArrowRight":
      return { type: "column", delta: 1 };
    case "h":
    case "ArrowLeft":
      return { type: "column", delta: -1 };
    case "x":
      return { type: "done" };
    case "p":
      return { type: "pin" };
    case "d":
      return { type: "due" };
    case "Backspace":
    case "Delete":
      return { type: "delete" };
    case "n":
      return { type: "new" };
    case "z":
      return { type: "undo" };
    case "Escape":
      return { type: "back" };
    case "f":
      return { type: "feedback" };
    case "?":
      return { type: "shortcuts" };
    default: {
      const kind = KINDS[e.key];
      return kind ? { type: "move", kind } : null;
    }
  }
}

/**
 * Whether a keydown should be left alone: typing in a field, or focus inside
 * a dialog or menu (the detail panel, the context menu, Settings), which own
 * their keys.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return !!target.closest(
    'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [role="alertdialog"]',
  );
}

/** The overlay's rows, in the order the spec lists them. */
export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["j", "k"], label: "Move through todos" },
  { keys: ["h", "l"], label: "Move across columns" },
  { keys: ["x"], label: "Mark done" },
  { keys: ["Enter"], label: "Open" },
  { keys: ["1", "2", "3"], label: "Move to Today, This week, Someday" },
  { keys: ["p"], label: "Pin or unpin" },
  { keys: ["d"], label: "Due…" },
  { keys: ["⌫"], label: "Delete" },
  { keys: ["n"], label: "New todo in this column" },
  { keys: ["z"], label: "Undo" },
  { keys: ["?"], label: "Show shortcuts" },
];

/** Admins also get this row (see `FeedbackDialog`). */
export const FEEDBACK_SHORTCUT = { keys: ["f"], label: "Send feedback" };
