/**
 * Whether a keydown should be left alone: typing in a field, or focus inside
 * a dialog or menu (the detail, the context menu, the palette, Settings),
 * which own their keys. The keys themselves live in `commands.ts`.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return !!target.closest(
    'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [role="alertdialog"]',
  );
}
