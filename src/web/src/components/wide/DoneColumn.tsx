import { Check } from "lucide-react";
import { displayTitle, groupDoneByDay } from "@/components/phone/model";
import type { TodoWithUrls } from "@/types/database";
import { ColumnHeader, isColumnBackground, TINTED } from "./Column";
import { SkeletonRows } from "./Skeleton";

/** Done's column id: the fourth column's resting state, not a list. */
export const DONE_COLUMN = "done";

/**
 * Done as the board's fourth column: finished todos grouped by day. Rows
 * select like any column's; the check, Enter, Space or X puts one back, and
 * Delete removes it (both handled by the board's keys, bar Enter and Space,
 * which press the row).
 */
export function DoneColumn({
  todos,
  listName,
  now,
  timeZone,
  selectedId,
  onSelect,
  onRestore,
  onBackgroundClick,
  loading = false,
}: {
  todos: TodoWithUrls[];
  listName: (id: string) => string;
  now: Date;
  timeZone: string;
  selectedId: string | null;
  onSelect: (todo: TodoWithUrls) => void;
  onRestore: (todo: TodoWithUrls) => void;
  /** A click on the column's empty space: focus it, select nothing. */
  onBackgroundClick?: () => void;
  /** Todos haven't arrived: placeholder rows, not "Nothing done yet." */
  loading?: boolean;
}) {
  const groups = groupDoneByDay(todos, now, timeZone);
  // One tab stop: the selected row, else the first.
  const all = groups.flatMap((g) => g.items);
  const tabStopId = all.some((t) => t.id === selectedId)
    ? selectedId
    : (all[0]?.id ?? null);
  const headingId = `column-${DONE_COLUMN}-title`;
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard reaches a column through its rows and title
    <section
      aria-labelledby={headingId}
      data-column={DONE_COLUMN}
      onClick={(e) => {
        if (isColumnBackground(e.target)) onBackgroundClick?.();
      }}
      className={`relative flex h-full min-w-[17rem] flex-1 basis-0 flex-col border-l border-n-hairline ${TINTED}`}
    >
      <ColumnHeader
        listId={DONE_COLUMN}
        title="Done"
        subline="Finished todos, by day"
        muted
      />
      <div aria-hidden="true" className="mx-6 h-px shrink-0 bg-n-hairline" />
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-2.5 pb-10 [scrollbar-width:thin]">
        {loading ? (
          <>
            <p className="sr-only" aria-live="polite">
              Loading…
            </p>
            <SkeletonRows count={3} />
          </>
        ) : groups.length === 0 ? (
          <p className="m-0 pt-4 font-n-display text-[1.125rem] font-semibold tracking-[-0.01em] text-n-ink-muted">
            Nothing done yet.
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.label} className="pt-2 pb-1">
              <h3 className="m-0 mb-1 text-[0.8125rem] font-semibold text-n-ink-muted">
                {group.label}
              </h3>
              <ul className="m-0 list-none p-0">
                {group.items.map((todo) => (
                  <DoneRow
                    key={todo.id}
                    todo={todo}
                    where={listName(todo.listId)}
                    selected={selectedId === todo.id}
                    tabStop={tabStopId === todo.id}
                    onSelect={onSelect}
                    onRestore={onRestore}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </section>
  );
}

function DoneRow({
  todo,
  where,
  selected,
  tabStop,
  onSelect,
  onRestore,
}: {
  todo: TodoWithUrls;
  where: string;
  selected: boolean;
  tabStop: boolean;
  onSelect: (todo: TodoWithUrls) => void;
  onRestore: (todo: TodoWithUrls) => void;
}) {
  const title = displayTitle(todo);
  return (
    <li>
      <div
        data-row-container
        className={`-mx-2.5 flex items-start gap-3 rounded-n-field px-2.5 transition-colors duration-(--n-duration-fast) ${
          selected
            ? "bg-n-fill ring-2 ring-n-ink ring-inset"
            : "pointer-fine:hover:bg-[var(--n-row-hover,var(--color-n-surface))]"
        }`}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Put “${title}” back in ${where}`}
          onClick={() => onRestore(todo)}
          className="-my-0.5 -mr-1.5 -ml-2.5 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-n-field n-focus-inset"
        >
          <span className="flex size-[1.375rem] items-center justify-center rounded-[6px] bg-n-fill text-n-ink-muted">
            <Check size={14} strokeWidth={3} aria-hidden="true" />
          </span>
        </button>
        <button
          type="button"
          data-row-id={todo.id}
          data-row-list={DONE_COLUMN}
          tabIndex={tabStop ? 0 : -1}
          aria-description={`Done, from ${where}. Enter puts it back.`}
          onFocus={() => onSelect(todo)}
          // A pointer only selects; Enter and Space (a click with no
          // detail) put the todo back.
          onClick={(e) => {
            if (e.detail === 0) onRestore(todo);
            else onSelect(todo);
          }}
          className="-ml-1.5 min-w-0 flex-1 cursor-pointer py-2.5 pr-2 pl-1.5 text-left outline-none"
        >
          <span className="line-clamp-3 block text-[0.9375rem] leading-[1.4] text-n-ink-muted line-through wrap-anywhere">
            {title}
          </span>
          <span className="mt-0.5 block text-[0.8125rem] leading-[1.125rem] text-n-ink-muted">
            {where}
          </span>
        </button>
      </div>
    </li>
  );
}
