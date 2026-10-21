import { useDraggable, useDroppable } from "@dnd-kit/core";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { TodoRow, type TodoRowProps } from "@/components/phone/TodoRow";
import type { TodoWithUrls } from "@/types/database";

/** Droppable ids for columns, distinct from sidebar entries. */
export const columnDropId = (listId: string) => `col:${listId}`;

/** The slot a drag would drop into, and where to draw the line. */
export interface DropIndicator {
  listId: string;
  index: number;
  /** Offset from the top of the column's row list, in px. */
  y: number;
}

type RowCallbacks = Pick<
  TodoRowProps,
  "now" | "timeZone" | "onCheck" | "onOpen" | "onMenu"
>;

/** A row the pointer can pick up from anywhere except its checkbox. */
function DraggableRow({
  todo,
  listId,
  ...props
}: Omit<TodoRowProps, "bodyProps" | "dragging" | "density"> & {
  listId: string;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: todo.id,
    data: { todo },
  });
  // dnd-kit's attributes make the element a "button" with its own
  // description; the row's button already is one, with a better name.
  const { role: _role, tabIndex: _tabIndex, ...rest } = attributes;
  return (
    <TodoRow
      {...props}
      todo={todo}
      density="wide"
      dragging={isDragging}
      rowRef={setNodeRef}
      bodyProps={{
        ...rest,
        ...listeners,
        "data-row-id": todo.id,
        "data-row-list": listId,
      }}
    />
  );
}

/**
 * One board column: an Archivo title and subline on the shared baseline, a
 * hairline, the "+ Add" composer, then the rows. The whole column accepts a
 * dropped todo; `indicator` marks the slot it would land in.
 */
export function Column({
  listId,
  title,
  subline,
  tinted = false,
  rows,
  subtasksOf,
  checked,
  collapsing,
  highlightedId,
  indicator,
  composer,
  note,
  empty,
  loading,
  error,
  onClose,
  onFocusColumn,
  ...rowCallbacks
}: RowCallbacks & {
  listId: string;
  title: string;
  subline: string;
  tinted?: boolean;
  rows: TodoWithUrls[];
  subtasksOf: (id: string) => TodoWithUrls[];
  checked: ReadonlySet<string>;
  collapsing: ReadonlySet<string>;
  highlightedId: string | null;
  indicator: DropIndicator | null;
  composer: ReactNode;
  /** Above the rows: Today's overnight note. */
  note?: ReactNode;
  empty: string;
  loading: boolean;
  error: ReactNode;
  /** Shown for your list's column: closes it. */
  onClose?: () => void;
  onFocusColumn: (listId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnDropId(listId),
    data: { listId },
  });
  const headingId = `column-${listId}-title`;
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      data-column={listId}
      onFocus={() => onFocusColumn(listId)}
      className={`relative flex h-full min-w-[17rem] flex-1 basis-0 flex-col border-l border-n-hairline first:border-l-0 ${
        tinted ? "bg-n-surface" : ""
      }`}
    >
      <header className="flex h-[10.5rem] shrink-0 flex-col justify-end px-6 pb-[1.125rem]">
        <div className="flex items-end gap-2">
          <h2
            id={headingId}
            tabIndex={-1}
            data-column-head={listId}
            className="m-0 min-w-0 flex-1 truncate rounded-n-chip font-n-display text-[2.5rem] leading-none font-bold tracking-[-0.03em] text-n-ink n-focus"
          >
            {title}
          </h2>
          {onClose && (
            <button
              type="button"
              aria-label={`Close ${title}`}
              onClick={onClose}
              className="-mr-2 mb-0.5 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-n-chip text-n-ink-muted n-focus pointer-fine:hover:bg-n-fill"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
        <p className="m-0 mt-2.5 truncate text-[0.8125rem] leading-[1.125rem] text-n-ink-muted">
          {subline}
        </p>
      </header>
      <div aria-hidden="true" className="mx-6 h-px shrink-0 bg-n-hairline" />
      <div
        data-column-body={listId}
        className="min-h-0 flex-1 overflow-y-auto px-6 pt-2.5 pb-10 [scrollbar-width:thin]"
      >
        {note}
        {composer}
        {loading ? (
          <p
            className="mt-4 text-[0.9375rem] text-n-ink-muted"
            aria-live="polite"
          >
            Loading…
          </p>
        ) : error ? (
          error
        ) : (
          <div className="relative min-h-24">
            {rows.length === 0 ? (
              <p
                className={`m-0 pt-4 font-n-display text-[1.125rem] font-semibold tracking-[-0.01em] transition-colors duration-(--n-duration-fast) ${
                  isOver ? "text-n-ink" : "text-n-ink-muted"
                }`}
              >
                {empty}
              </p>
            ) : (
              <ul data-row-list={listId} className="m-0 list-none p-0">
                {rows.map((todo) => (
                  <DraggableRow
                    key={todo.id}
                    todo={todo}
                    listId={listId}
                    subtasks={subtasksOf(todo.id)}
                    checked={checked.has(todo.id)}
                    collapsing={collapsing.has(todo.id)}
                    highlighted={highlightedId === todo.id}
                    {...rowCallbacks}
                  />
                ))}
              </ul>
            )}
            {indicator && indicator.listId === listId && (
              <div
                aria-hidden="true"
                data-drop-indicator
                style={{ top: indicator.y }}
                className="pointer-events-none absolute -inset-x-1 h-0.5 -translate-y-1/2 rounded-full bg-n-ink"
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}
