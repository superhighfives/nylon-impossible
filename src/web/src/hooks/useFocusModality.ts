import { useEffect } from "react";

const MODIFIERS = new Set(["Shift", "Meta", "Control", "Alt"]);

/** The attribute on `<html>` while focus last arrived from the keyboard. */
export const KEY_FOCUS_ATTRIBUTE = "data-key-focus";

/**
 * Marks `<html>` with `data-key-focus` when focus moves after a key press (a
 * modifier alone doesn't count). A pointer press clears it, so a click into
 * a field that already has focus drops the ring too. `n-focus` draws its `ink` ring on a text field only then:
 * a field matches `:focus-visible` however it was focused, so a click into
 * one would otherwise draw the keyboard ring (Visual, "A mouse click never
 * draws a keyboard-strength ring"). It's decided when focus arrives, so
 * typing into a field that was clicked doesn't add the ring.
 */
export function useFocusModality() {
  useEffect(() => {
    let keyboard = false;
    const root = document.documentElement;
    const onKey = (e: KeyboardEvent) => {
      if (!MODIFIERS.has(e.key)) keyboard = true;
    };
    const onPointer = () => {
      keyboard = false;
      root.removeAttribute(KEY_FOCUS_ATTRIBUTE);
    };
    const onFocus = () => root.toggleAttribute(KEY_FOCUS_ATTRIBUTE, keyboard);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("focusin", onFocus, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("focusin", onFocus, true);
      root.removeAttribute(KEY_FOCUS_ATTRIBUTE);
    };
  }, []);
}
