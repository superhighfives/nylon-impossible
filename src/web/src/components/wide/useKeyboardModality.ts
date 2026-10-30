import { type RefObject, useEffect } from "react";

const MODIFIERS = new Set(["Shift", "Meta", "Control", "Alt"]);

/**
 * Marks `root` with `data-keyboard` while the last input was the keyboard:
 * set by a key press (a modifier alone doesn't count), cleared by a pointer
 * going down. The board shows its selection bar only then; a click selects
 * with the fill alone. It writes the attribute directly, so a key press
 * doesn't re-render the board.
 */
export function useKeyboardModality(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const set = (on: boolean) => {
      root.current?.toggleAttribute("data-keyboard", on);
    };
    const onKey = (e: KeyboardEvent) => {
      if (!MODIFIERS.has(e.key)) set(true);
    };
    const onPointer = () => set(false);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, [root]);
}
