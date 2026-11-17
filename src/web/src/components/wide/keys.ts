/**
 * Whether a keydown should be left alone: typing in a field, or focus inside
 * a dialog or menu (the detail, the context menu, the palette, Settings),
 * which own their keys. The keys themselves live in `commands.ts`.
 *
 * Two places look like that but have the board's keys: the open todo's
 * sheet itself, with the keyboard on it and nothing in it being edited, and
 * a column's Add with the keyboard on it but not typing (read-only until
 * Return, n or a click).
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.hasAttribute("data-detail-column")) return false;
  if (target instanceof HTMLTextAreaElement && target.readOnly) {
    if (target.closest("[data-column]")) return false;
  }
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return !!target.closest(
    'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [role="alertdialog"]',
  );
}

/** A column's own field: its Add, or its title while it's being renamed. */
export function isColumnField(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.matches("input, textarea") &&
    !!target.closest("[data-column]")
  );
}

/** A control that takes Enter itself: a button presses, a link follows. */
export function isNativeControl(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !!target.closest('button, a[href], select, summary, [role="button"]')
  );
}
