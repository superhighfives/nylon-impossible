/**
 * Canonical keyboard-focus ring for interactive controls. Matches the yellow
 * ring used by `Button` and `Checkbox` so every focusable control in a todo row
 * (grip, expand toggle, inline due-date control) shares one look instead of
 * falling back to the browser's default blue outline. Offset sits on the app
 * background, which is what these row controls render against.
 */
export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-strong focus-visible:ring-offset-2 focus-visible:ring-offset-gray-app";
