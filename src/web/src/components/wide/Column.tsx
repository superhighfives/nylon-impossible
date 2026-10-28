import { Menu } from "@base-ui/react/menu";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Ellipsis, X } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
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
  "now" | "timeZone" | "onCheck" | "onOpen" | "onMenu" | "onSelect"
>;

const ICON_BUTTON =
  "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-n-chip text-n-ink-muted n-focus-soft pointer-fine:hover:bg-n-fill";

const MENU_ITEM =
  "flex h-10 w-full cursor-pointer items-center border-t border-n-hairline px-3.5 text-left text-[0.9375rem] outline-none first:border-t-0 data-highlighted:bg-[color-mix(in_srgb,currentColor_12%,transparent)]";

/**
 * A column's title and subline on the shared baseline. Your lists' titles
 * rename in place (Enter or blur saves, Esc cancels) and carry a ⋯ menu and
 * a × that closes the column.
 */
export function ColumnHeader({
  listId,
  title,
  subline,
  muted = false,
  banner,
  onRename,
  onDelete,
  onClose,
}: {
  listId: string;
  title: string;
  subline: string;
  /** Done's title reads like a subline: it's the resting state. */
  muted?: boolean;
  /**
   * Today's overnight pill. Every column keeps its space (two lines, 20px
   * clear of the title) whether or not it's showing, so titles don't move.
   */
  banner?: ReactNode;
  onRename?: (name: string) => void;
  onDelete?: () => void;
  onClose?: () => void;
}) {
  const [renaming, setRenamingState] = useState(false);
  // Set once Enter, Esc or blur has finished a rename, so the blur that
  // follows the field unmounting doesn't save twice.
  const finished = useRef(false);
  const fromMenu = useRef(false);
  const setRenaming = (on: boolean) => {
    finished.current = !on;
    setRenamingState(on);
  };
  const titleButton = useRef<HTMLButtonElement>(null);
  const headingId = `column-${listId}-title`;
  const titleClass = `font-n-display text-[2.5rem] leading-none font-bold tracking-[-0.03em] ${
    muted ? "text-n-ink-muted" : "text-n-ink"
  }`;

  const finish = (name: string | null) => {
    if (finished.current) return;
    setRenaming(false);
    fromMenu.current = false;
    const next = name?.replace(/\s+/g, " ").trim();
    if (next && next !== title) onRename?.(next);
    requestAnimationFrame(() => titleButton.current?.focus());
  };

  return (
    <header className="relative flex h-[10.5rem] shrink-0 flex-col justify-end px-6 pb-[1.125rem]">
      <div
        data-banner-slot
        className="mb-5 flex h-[2.75rem] min-w-0 flex-col justify-end"
      >
        {banner}
      </div>
      <div className="flex items-end">
        <h2
          id={headingId}
          tabIndex={-1}
          data-column-head={listId}
          className={`m-0 line-clamp-2 min-w-0 flex-1 rounded-n-chip wrap-break-word n-focus ${titleClass}`}
        >
          {renaming ? (
            <input
              // biome-ignore lint/a11y/noAutofocus: opened by an explicit rename
              autoFocus
              defaultValue={title}
              aria-label="List name"
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  finish(e.currentTarget.value);
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  finish(null);
                }
              }}
              onBlur={(e) => finish(e.currentTarget.value)}
              className={`-mx-1 w-[calc(100%+0.5rem)] rounded-n-chip bg-n-fill px-1 outline-none ${titleClass}`}
            />
          ) : onRename ? (
            <button
              ref={titleButton}
              type="button"
              aria-description="Rename"
              onClick={() => setRenaming(true)}
              className="-mx-1 max-w-full cursor-text rounded-n-chip px-1 text-left n-focus-soft pointer-fine:hover:bg-n-fill"
            >
              {title}
            </button>
          ) : (
            title
          )}
        </h2>
      </div>
      {/* In the header's top corner, so the title keeps the column's full
          width: a list name at 40px doesn't fit beside two buttons. */}
      <div className="absolute top-3 right-4 flex items-center gap-0.5">
        {onDelete && (
          <Menu.Root>
            <Menu.Trigger
              aria-label={`${title} options`}
              className={ICON_BUTTON}
            >
              <Ellipsis size={16} aria-hidden="true" />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner align="end" sideOffset={4} className="z-50">
                <Menu.Popup
                  finalFocus={() => !fromMenu.current}
                  className="min-w-44 overflow-hidden rounded-[0.875rem] bg-n-canvas text-n-ink shadow-[0_10px_30px_color-mix(in_srgb,black_14%,transparent)] outline-none transition-opacity duration-(--n-duration-fast) data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-n-fill"
                >
                  {onRename && (
                    <Menu.Item
                      className={MENU_ITEM}
                      onClick={() => {
                        fromMenu.current = true;
                        setRenaming(true);
                      }}
                    >
                      Rename
                    </Menu.Item>
                  )}
                  <Menu.Item
                    className={`${MENU_ITEM} text-n-destructive`}
                    onClick={onDelete}
                  >
                    Delete list
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        )}
        {onClose && (
          <button
            type="button"
            aria-label={`Close ${title}`}
            onClick={onClose}
            className={ICON_BUTTON}
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="m-0 mt-2.5 truncate text-[0.8125rem] leading-[1.125rem] text-n-ink-muted">
        {subline}
      </p>
    </header>
  );
}

/** A row the pointer can pick up from anywhere except its checkbox. */
function DraggableRow({
  todo,
  listId,
  ...props
}: Omit<
  TodoRowProps,
  "bodyProps" | "containerProps" | "dragging" | "density"
> & {
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
      // The pointer drags the whole row; the title keeps the data hooks the
      // board's keys and focus use.
      containerProps={listeners}
      bodyProps={{
        ...rest,
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
  selectedId,
  indicator,
  composer,
  banner,
  empty,
  loading,
  error,
  onClose,
  onRename,
  onDelete,
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
  selectedId: string | null;
  indicator: DropIndicator | null;
  composer: ReactNode;
  /** Today's overnight pill, in the header's reserved space. */
  banner?: ReactNode;
  empty: string;
  loading: boolean;
  error: ReactNode;
  /** Your list's column: × closes it, back to Done. */
  onClose?: () => void;
  /** Your list's column: rename in place. */
  onRename?: (name: string) => void;
  /** Your list's column: Delete list, in the ⋯ menu. */
  onDelete?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnDropId(listId),
    data: { listId },
  });
  const headingId = `column-${listId}-title`;
  // One tab stop per column: its selected row, else its first.
  const tabStopId = rows.some((r) => r.id === selectedId)
    ? selectedId
    : (rows[0]?.id ?? null);
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      data-column={listId}
      className={`relative flex h-full min-w-[17rem] flex-1 basis-0 flex-col border-l border-n-hairline first:border-l-0 ${
        tinted ? "bg-n-surface" : ""
      }`}
    >
      <ColumnHeader
        listId={listId}
        title={title}
        subline={subline}
        banner={banner}
        onRename={onRename}
        onDelete={onDelete}
        onClose={onClose}
      />
      <div aria-hidden="true" className="mx-6 h-px shrink-0 bg-n-hairline" />
      <div
        data-column-body={listId}
        className="min-h-0 flex-1 overflow-y-auto px-6 pt-2.5 pb-10 [scrollbar-width:thin]"
      >
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
                    selected={selectedId === todo.id}
                    tabStop={tabStopId === todo.id}
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
