/**
 * A column header's quiet icon buttons: a list's ⋯, and the open todo's ×
 * in its sheet.
 */
export const ICON_BUTTON =
  "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-n-chip text-n-ink-muted n-focus-soft pointer-fine:hover:bg-n-fill";

/**
 * A column header's subline, and the open todo sheet's, on one line. An
 * icon at its start (16px, `aria-hidden`) fits in the line's height, so the
 * title above doesn't move.
 */
export const SUBLINE =
  "m-0 mt-2.5 flex min-w-0 items-center gap-2 text-[0.8125rem] leading-[1.125rem] text-n-ink-muted [&>svg]:shrink-0";

/**
 * A row's hover on the board, wherever it sits (a time column, your list,
 * the tinted Done, an open todo's sheet): `fill` at 60%, lighter than a
 * selected row's full `fill`. Pointer only; eases with the row's
 * `transition-colors`.
 */
export const ROW_HOVER = "pointer-fine:hover:bg-n-fill/60";

/**
 * The context menu's raised card: its row preview and item groups, and a
 * phone row lifted by a long-press.
 */
export const RAISED =
  "rounded-[0.875rem] bg-n-canvas shadow-[0_10px_30px_color-mix(in_srgb,black_14%,transparent)] dark:bg-n-fill";
