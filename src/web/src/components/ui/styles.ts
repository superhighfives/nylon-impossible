/**
 * A column header's quiet icon buttons (⋯ and ×), shared by the board's
 * columns and the open todo in the fourth column.
 */
export const ICON_BUTTON =
  "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-n-chip text-n-ink-muted n-focus-soft pointer-fine:hover:bg-n-fill";

/**
 * A row's hover on the board, wherever it sits (a time column, the tinted
 * fourth column, Done, an open todo's detail): `fill` at 60%, lighter than a
 * selected row's full `fill`. Pointer only; eases with the row's
 * `transition-colors`.
 */
export const ROW_HOVER = "pointer-fine:hover:bg-n-fill/60";
