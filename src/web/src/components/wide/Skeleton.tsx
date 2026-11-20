import { Plus } from "lucide-react";

/**
 * What a column shows before its todos arrive: grey bars where rows will be,
 * so the board has its shape from the first paint instead of Done filling
 * it. Decorative; the column says "Loading…" to screen readers, and none of
 * it can take focus. The bars pulse unless motion is reduced.
 *
 * They fade across the board by column, full in the first and gone by the
 * fourth, so the skeleton doesn't promise how many columns will load.
 */
export const SKELETON_COLUMNS = 3;

const WIDTHS = [
  ["78%", "34%"],
  ["62%", "26%"],
  ["84%", "40%"],
  ["55%", "30%"],
];

export function SkeletonRows({
  count = 4,
  column = 0,
}: {
  count?: number;
  /** The column's place on the board, from 0. */
  column?: number;
}) {
  const opacity = 1 - column / SKELETON_COLUMNS;
  if (opacity <= 0) return null;
  return (
    <ul
      aria-hidden="true"
      data-skeleton-rows
      style={{ opacity }}
      className="pt-1"
    >
      {WIDTHS.slice(0, count).map(([title, meta], i) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholder rows
          key={i}
          className="flex items-start gap-3 py-2.5"
        >
          <span className="mt-px size-[1.375rem] shrink-0 rounded-[0.4375rem] bg-n-fill motion-safe:animate-pulse" />
          <span className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
            <span
              style={{ width: title }}
              className="block h-3.5 rounded-n-chip bg-n-fill motion-safe:animate-pulse"
            />
            <span
              style={{ width: meta }}
              className="block h-2.5 rounded-n-chip bg-n-fill motion-safe:animate-pulse"
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The column's "+ Add" row, drawn but inert, so the rows below it start
 * where they will once the real composer is there.
 */
export function SkeletonComposer() {
  return (
    <div aria-hidden="true" className="-mx-2.5 flex items-start gap-3 px-2.5">
      <Plus
        size={16}
        strokeWidth={2.2}
        className="mt-3 ml-[3px] shrink-0 text-n-ink-muted"
      />
      <span className="block min-h-10 py-2.5 text-n-wide-body text-n-ink-muted">
        Add
      </span>
    </div>
  );
}
