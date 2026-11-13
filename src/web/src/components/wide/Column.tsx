import { Menu } from "@base-ui/react/menu";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Ellipsis } from "lucide-react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { EmptyLine } from "@/components/phone/EmptyLine";
import { TodoRow, type TodoRowProps } from "@/components/phone/TodoRow";
import { ICON_BUTTON, SUBLINE } from "@/components/ui/styles";
import type { TodoWithUrls } from "@/types/database";
import { SkeletonRows } from "./Skeleton";
import { type Settle, settleRows, settleTiming } from "./settle";

/**
 * The rows beside the open sheet: all but the selected one recede, and the
 * selected row's fill runs on under the sheet's edge (a copy of the fill,
 * offset by the overlap, so its text keeps its width), so the row and the
 * sheet read as joined.
 */
const SHEET_ROWS =
  "[&_[data-row-container]]:transition-[color,background-color,opacity] [&_[data-row-container]:not([data-selected])]:opacity-(--n-sheet-recede) [&_[data-row-container][data-selected]]:shadow-[var(--n-sheet-overlap)_0_0_var(--n-color-fill)]";

/** Droppable ids for columns, distinct from sidebar entries. */
export const columnDropId = (listId: string) => `col:${listId}`;

/**
 * A click that landed on a column's empty space, not on a row, a control
 * or a field: it focuses the column without picking a todo.
 */
export function isColumnBackground(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !target.closest(
      'a, button, input, textarea, select, [contenteditable], [role="menu"], [role="dialog"], [data-row-container], [data-row-id], li',
    )
  );
}

/** The slot a drag would drop into, and where to draw the line. */
export interface DropIndicator {
  listId: string;
  index: number;
  /** Offset from the top of the column's row list (`data-drop-area`), in px. */
  y: number;
}

type RowCallbacks = Pick<
  TodoRowProps,
  "now" | "timeZone" | "onCheck" | "onOpen" | "onMenu" | "onSelect"
>;

/** Done's tint: the only column with a style of its own. */
export const TINTED = "bg-n-surface";

/**
 * Every column's width: a quarter of the board (`main`, the size container),
 * from the board tokens' minimum to their maximum. It follows the window
 * only, never the column count or the open sheet, so columns don't squeeze:
 * the board is one row that scrolls sideways when they don't all fit.
 */
export const COLUMN_WIDTH =
  "w-[clamp(var(--n-board-column-min-width),25cqi,var(--n-board-column-max-width))] shrink-0";

/**
 * A column's side padding: 24px on the left, and the sheet's overlap on the
 * right, open or not. The sheet only ever covers that padding, so opening a
 * todo never rewraps the column's text (principle 8).
 */
const COLUMN_PADDING = "pl-6 pr-(--n-sheet-overlap)";

/** Behind the open sheet, the column recedes; its selected row doesn't. */
const RECEDE = "opacity-(--n-sheet-recede)";

/**
 * A focused column head. A click on the column's empty space focuses it so
 * the keys know which column you're in, and shows nothing; with the keyboard
 * in use (the board root's `data-keyboard`) it takes the sidebar cursor's
 * soft tint. Gated on the board's own modality rather than `:focus-visible`,
 * whose guess after a programmatic `focus()` varies by browser. Forced
 * colours drop the tint, so there it gets a system-coloured outline instead.
 */
export const HEAD_FOCUS =
  "outline-none transition-colors duration-(--n-duration-fast) group-data-[keyboard]/board:focus:bg-[color-mix(in_srgb,currentColor_20%,transparent)] forced-colors:group-data-[keyboard]/board:focus:outline-2 forced-colors:group-data-[keyboard]/board:focus:outline-solid";

/** A menu's popup and items: the column's ⋯ menu, the sidebar's right-click. */
export const MENU_POPUP =
  "min-w-44 overflow-clip rounded-[0.875rem] bg-n-canvas text-n-ink shadow-[0_10px_30px_color-mix(in_srgb,black_14%,transparent)] outline-none transition-opacity duration-(--n-duration-fast) data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-n-fill";

export const MENU_ITEM =
  "flex h-10 w-full cursor-pointer items-center border-t border-n-hairline px-3.5 text-left text-[0.9375rem] outline-none first:border-t-0 data-highlighted:bg-[color-mix(in_srgb,currentColor_12%,transparent)]";

/**
 * A column's title and subline on the shared baseline. Your lists' titles
 * rename in place (Enter or blur saves, Esc cancels) and carry a ⋯ menu:
 * Rename, Hide column and Delete list. There's no ×: a hidden list's column
 * comes back from the sidebar.
 */
export function ColumnHeader({
  listId,
  title,
  subline,
  muted = false,
  icon,
  banner,
  onRename,
  onHide,
  onDelete,
  sheetOpen = false,
}: {
  listId: string;
  title: string;
  subline: string;
  /** Done's title reads like a subline: it's the resting state. */
  muted?: boolean;
  /**
   * Your list's column: marks it as a list at the start of the subline, as
   * the open todo's sheet marks a todo. Today and the others have none.
   */
  icon?: ReactNode;
  /**
   * Today's overnight pill. Every column keeps its space (two lines, 20px
   * clear of the title) whether or not it's showing, so titles don't move.
   * A list's two-line title rises into it: the slot is the part of the
   * header that gives way, never the title or the subline.
   */
  banner?: ReactNode;
  onRename?: (name: string) => void;
  /** Your list's column: Hide column, which takes it off the board. */
  onHide?: () => void;
  onDelete?: () => void;
  /** The column's todo is open: clear of the sheet, and receded. */
  sheetOpen?: boolean;
}) {
  const [renaming, setRenamingState] = useState(false);
  // Set once Enter, Esc or blur has finished a rename, so the blur that
  // follows the field unmounting doesn't save twice.
  const finished = useRef(false);
  const fromMenu = useRef(false);
  // Hide column waits for the menu to close: it holds focus until then, and
  // the keyboard is handed to the column before this one.
  const hideOnClose = useRef(false);
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
    <header
      className={`relative flex h-[10.5rem] shrink-0 flex-col justify-end pb-[1.125rem] transition-opacity ${COLUMN_PADDING} ${
        sheetOpen ? RECEDE : ""
      }`}
    >
      <div
        data-banner-slot
        className="mb-5 flex h-[2.75rem] min-h-0 min-w-0 flex-col justify-end"
      >
        {banner}
      </div>
      <div className="flex shrink-0 items-end">
        <h2
          id={headingId}
          tabIndex={-1}
          data-column-head={listId}
          className={`m-0 -mx-1 line-clamp-2 min-w-0 flex-1 rounded-n-chip px-1 wrap-break-word ${HEAD_FOCUS} ${titleClass}`}
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
              // A button is one box to the heading's clamp, so it clamps
              // its own lines.
              className="-mx-1 line-clamp-2 max-w-full cursor-text rounded-n-chip px-1 text-left n-focus-soft pointer-fine:hover:bg-n-fill"
            >
              {title}
            </button>
          ) : (
            title
          )}
        </h2>
      </div>
      {/* In the header's top corner, so the title keeps the column's full
          width: a list name at 40px doesn't fit beside a button. */}
      <div className="absolute top-3 right-(--n-sheet-overlap) flex items-center gap-0.5">
        {onDelete && (
          <Menu.Root
            onOpenChangeComplete={(open) => {
              if (open || !hideOnClose.current) return;
              hideOnClose.current = false;
              onHide?.();
            }}
          >
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
                  className={MENU_POPUP}
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
                  {onHide && (
                    <Menu.Item
                      className={MENU_ITEM}
                      onClick={() => {
                        // The column leaves, so the keyboard goes to the
                        // one before it, not back to this menu's button.
                        fromMenu.current = true;
                        hideOnClose.current = true;
                      }}
                    >
                      Hide column
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
      </div>
      <p data-subline className={SUBLINE}>
        {icon}
        <span className="truncate">{subline}</span>
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
 * dropped todo; `indicator` marks the slot it would land in. While its todo
 * is open (`sheetOpen`) the sheet lies over its right edge: the contents
 * move in clear of it, and everything but the selected row recedes.
 */
export function Column({
  listId,
  title,
  subline,
  rows,
  subtasksOf,
  checked,
  collapsing,
  highlightedId,
  selectedId,
  indicator,
  settle = null,
  composer,
  icon,
  banner,
  empty,
  loading,
  error,
  onRename,
  onHide,
  onDelete,
  onBackgroundClick,
  sheetOpen = false,
  ...rowCallbacks
}: RowCallbacks & {
  listId: string;
  title: string;
  subline: string;
  rows: TodoWithUrls[];
  subtasksOf: (id: string) => TodoWithUrls[];
  checked: ReadonlySet<string>;
  collapsing: ReadonlySet<string>;
  highlightedId: string | null;
  selectedId: string | null;
  indicator: DropIndicator | null;
  /** Where rows sat at a drop, so they ease into the new order. */
  settle?: Settle | null;
  composer: ReactNode;
  /** Your list's column: the list icon at the start of the subline. */
  icon?: ReactNode;
  /** Today's overnight pill, in the header's reserved space. */
  banner?: ReactNode;
  empty: string;
  loading: boolean;
  error: ReactNode;
  /** Your list's column: rename in place. */
  onRename?: (name: string) => void;
  /** Your list's column: Hide column, in the ⋯ menu. */
  onHide?: () => void;
  /** Your list's column: Delete list, in the ⋯ menu. */
  onDelete?: () => void;
  /** A click on the column's empty space: focus it, select nothing. */
  onBackgroundClick?: () => void;
  /** Its todo is open, in the sheet beside it. */
  sheetOpen?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnDropId(listId),
    data: { listId },
  });
  const headingId = `column-${listId}-title`;
  const listRef = useRef<HTMLUListElement>(null);
  const settled = useRef<Settle | null>(null);
  // Runs as `rows` changes, so it catches the render where the drop's new
  // order lands, then plays once per drop.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!settle || settled.current === settle || !list || !rows.length) return;
    const timing = settleTiming();
    if (
      timing &&
      settleRows(list, listId, settle.from, timing, settle.landing)
    ) {
      settled.current = settle;
    }
  }, [settle, rows, listId]);
  // One tab stop per column: its selected row, else its first.
  const tabStopId = rows.some((r) => r.id === selectedId)
    ? selectedId
    : (rows[0]?.id ?? null);
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard reaches a column through its rows and title
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      data-column={listId}
      data-slide={listId}
      onClick={(e) => {
        if (isColumnBackground(e.target)) onBackgroundClick?.();
      }}
      data-sheet-open={sheetOpen ? "" : undefined}
      className={`relative flex h-full ${COLUMN_WIDTH} flex-col border-l border-n-hairline first:border-l-0`}
    >
      <ColumnHeader
        listId={listId}
        title={title}
        subline={subline}
        icon={icon}
        banner={banner}
        onRename={onRename}
        onHide={onHide}
        onDelete={onDelete}
        sheetOpen={sheetOpen}
      />
      <div
        aria-hidden="true"
        className={`mr-(--n-sheet-overlap) ml-6 h-px shrink-0 bg-n-hairline transition-opacity duration-(--n-duration-base) ease-n-out ${
          sheetOpen ? RECEDE : ""
        }`}
      />
      <div
        data-column-body={listId}
        className={`min-h-0 flex-1 overflow-y-auto pt-2.5 pb-10 [scrollbar-gutter:stable] [scrollbar-width:thin] ${COLUMN_PADDING}`}
      >
        <div
          data-column-composer
          className={`transition-opacity duration-(--n-duration-base) ${
            sheetOpen ? RECEDE : ""
          }`}
        >
          {composer}
        </div>
        {loading ? (
          <>
            <p className="sr-only" aria-live="polite">
              Loading…
            </p>
            <SkeletonRows />
          </>
        ) : error ? (
          error
        ) : (
          <div data-drop-area={listId} className="relative min-h-24">
            {rows.length === 0 ? (
              <div
                className={`transition-colors duration-(--n-duration-fast) ${
                  isOver ? "text-n-ink" : "text-n-ink-subtle"
                }`}
              >
                <EmptyLine text={empty} density="wide" />
              </div>
            ) : (
              <ul
                ref={listRef}
                data-row-list={listId}
                className={`m-0 list-none p-0 ${sheetOpen ? SHEET_ROWS : ""}`}
              >
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
                className="pointer-events-none absolute -inset-x-2.5 h-0.5 -translate-y-1/2 rounded-full bg-n-brand"
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}
