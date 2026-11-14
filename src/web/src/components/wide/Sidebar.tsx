import { ContextMenu } from "@base-ui/react/context-menu";
import { useDroppable } from "@dnd-kit/core";
import { Check, Eye, EyeOff, Plus } from "lucide-react";
import type { ReactNode } from "react";
import type { SerializedList } from "@/types/database";
import { MENU_ITEM, MENU_POPUP } from "./Column";
import { NewListPopover } from "./NewListPopover";

/** Droppable ids for sidebar entries, distinct from column ids. */
export const sidebarDropId = (listId: string) => `side:${listId}`;

/** A sidebar entry, less its text colour: each sets one, so none compete. */
const ENTRY =
  "relative flex h-9 w-full cursor-pointer items-center gap-2 rounded-[0.5rem] px-2.5 text-left text-[0.9375rem] n-focus-soft transition-colors duration-(--n-duration-fast) pointer-fine:hover:bg-n-surface";

/**
 * The 3px ink bar on the left edge: the column the selection is in. Ink, not
 * yellow — yellow on white is about 1.3:1, under the 3:1 an indicator needs.
 */
function SelectionBar({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <span
      aria-hidden="true"
      data-selection-bar
      className="absolute top-1.5 bottom-1.5 -left-2.5 w-[3px] rounded-full bg-n-ink"
    />
  );
}

/**
 * One list in the sidebar: a button that also accepts a dropped todo. While
 * a todo is dragged over it, it fills, so the drop target is unmistakable.
 * Your lists' entries have a right-click menu with Hide column (or Show
 * column); a hidden list's entry stays in place, muted, with its count. An
 * eye beside the count does the same: closed and always there when hidden,
 * open and on hover (or focus) when shown. Its space is always kept, so the
 * count doesn't move.
 */
function ListEntry({
  list,
  count,
  current,
  strong,
  onSelect,
  onToggleColumn,
}: {
  list: SerializedList;
  count: number;
  /** The selection is in this list's column: the ink bar. */
  current: boolean;
  /** The time lists read heavier than your own. */
  strong?: boolean;
  onSelect: (list: SerializedList) => void;
  /** Your lists only: hide its column, or show it again. */
  onToggleColumn?: (list: SerializedList) => void;
}) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: sidebarDropId(list.id),
    data: { listId: list.id },
  });
  const dropping = isOver && !!active;
  const hidden = list.columnHidden;
  const button = (
    <button
      type="button"
      data-sidebar-list={list.id}
      data-sidebar-nav
      data-column-hidden={hidden ? "" : undefined}
      aria-describedby={`sidebar-count-${list.id}`}
      onClick={() => onSelect(list)}
      className={`${ENTRY} pr-9 ${strong ? "font-semibold" : "font-medium"} ${
        dropping
          ? "bg-n-brand text-n-brand-ink"
          : hidden
            ? "text-n-ink-muted"
            : "text-n-ink"
      }`}
    >
      <SelectionBar on={current} />
      <span className="min-w-0 flex-1 truncate">{list.name}</span>
      {/* The name is what's visible ("Groceries"); the count is read as
          its description ("4 todos"). */}
      <span
        aria-hidden="true"
        className={`font-normal tabular-nums ${dropping ? "" : "text-n-ink-muted"}`}
      >
        {count}
      </span>
      <span id={`sidebar-count-${list.id}`} hidden>
        {count} {count === 1 ? "todo" : "todos"}
        {hidden ? ", column hidden" : ""}
      </span>
    </button>
  );
  const eye = onToggleColumn ? (
    <button
      type="button"
      data-column-eye={list.id}
      aria-label={hidden ? "Show column" : "Hide column"}
      aria-describedby={`sidebar-eye-${list.id}`}
      onClick={() => onToggleColumn(list)}
      className={`absolute top-1/2 right-2 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-n-chip text-n-ink-muted n-focus-soft transition-opacity duration-(--n-duration-fast) pointer-fine:hover:text-n-ink ${
        hidden
          ? ""
          : "pointer-fine:opacity-0 pointer-fine:group-hover/entry:opacity-100 pointer-fine:focus-visible:opacity-100"
      }`}
    >
      {hidden ? (
        <EyeOff size={15} aria-hidden="true" />
      ) : (
        <Eye size={15} aria-hidden="true" />
      )}
    </button>
  ) : null;
  return (
    <li ref={setNodeRef} className="group/entry relative">
      {eye}
      {eye && (
        <span id={`sidebar-eye-${list.id}`} hidden>
          {list.name}
        </span>
      )}
      {onToggleColumn ? (
        <ContextMenu.Root>
          <ContextMenu.Trigger render={button} />
          <ContextMenu.Portal>
            <ContextMenu.Positioner className="z-50">
              <ContextMenu.Popup className={MENU_POPUP}>
                <ContextMenu.Item
                  className={MENU_ITEM}
                  onClick={() => onToggleColumn(list)}
                >
                  {hidden ? "Show column" : "Hide column"}
                </ContextMenu.Item>
              </ContextMenu.Popup>
            </ContextMenu.Positioner>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      ) : (
        button
      )}
    </li>
  );
}

const TIME_PLACEHOLDERS = ["Today", "This week", "Someday"];

/**
 * The wide sidebar: the wordmark; Today, This week and Someday with counts;
 * a "Lists" heading, your lists and New list; then Done, Settings, Send
 * feedback (admins) and Keyboard shortcuts. Every list is a drop target.
 *
 * Every list you haven't hidden, and Done, are columns on the board, so an
 * entry scrolls to its column rather than opening it; a hidden list's entry
 * brings its column back first. The ink bar marks the column the selection
 * is in.
 */
export function Sidebar({
  timeLists,
  collections,
  countFor,
  selectionColumn,
  doneCount,
  onTimeList,
  onCollection,
  onToggleColumn,
  onCreateList,
  onDone,
  onSettings,
  onShortcuts,
  onFeedback,
  loading = false,
}: {
  timeLists: SerializedList[];
  collections: SerializedList[];
  countFor: (listId: string) => number;
  /** The column the selection is in: a list id, `done`, or none. */
  selectionColumn: string | null;
  doneCount: number;
  onTimeList: (list: SerializedList) => void;
  onCollection: (list: SerializedList) => void;
  /** Hide or show one of your lists' columns, from its right-click menu. */
  onToggleColumn?: (list: SerializedList) => void;
  onCreateList: (name: string) => void;
  onDone: () => void;
  onSettings: () => void;
  onShortcuts: () => void;
  /** Shown only when set — the caller passes it for admins. */
  onFeedback?: () => void;
  /** Lists haven't arrived: draw the time lists as placeholders. */
  loading?: boolean;
}) {
  return (
    <aside
      aria-label="Sidebar"
      className="flex w-60 shrink-0 flex-col gap-7 overflow-y-auto border-r border-n-hairline px-5 pt-7 pb-5 [scrollbar-width:thin]"
    >
      <p className="m-0 px-2.5 font-n-display text-xl font-extrabold tracking-[-0.02em] text-n-ink">
        Nylon
      </p>
      <nav aria-label="Lists">
        <ul className="flex flex-col gap-0.5">
          {/* Before the lists arrive the time lists are already known by
              name, so they hold their place (not focusable; the columns
              say "Loading…"). */}
          {loading &&
            timeLists.length === 0 &&
            TIME_PLACEHOLDERS.map((name) => (
              <li
                key={name}
                aria-hidden="true"
                data-skeleton-entry
                className="flex h-9 items-center gap-2 px-2.5 text-[0.9375rem] font-semibold text-n-ink"
              >
                <span className="min-w-0 flex-1 truncate">{name}</span>
                <span className="h-2.5 w-3 rounded-n-chip bg-n-fill motion-safe:animate-pulse" />
              </li>
            ))}
          {timeLists.map((list) => (
            <ListEntry
              key={list.id}
              list={list}
              count={countFor(list.id)}
              current={selectionColumn === list.id}
              strong
              onSelect={onTimeList}
            />
          ))}
        </ul>
        <h2 className="mt-[1.125rem] mb-1.5 ml-2.5 text-xs font-semibold text-n-ink-muted">
          Lists
        </h2>
        <ul className="flex flex-col gap-0.5">
          {collections.map((list) => (
            <ListEntry
              key={list.id}
              list={list}
              count={countFor(list.id)}
              current={selectionColumn === list.id}
              onSelect={onCollection}
              onToggleColumn={onToggleColumn}
            />
          ))}
          <li>
            <NewListPopover
              side="right"
              onCreate={onCreateList}
              trigger={
                <button
                  type="button"
                  data-sidebar-nav
                  aria-keyshortcuts="Shift+N"
                  className={`${ENTRY} font-medium text-n-ink-muted`}
                >
                  <Plus size={15} aria-hidden="true" className="shrink-0" />
                  New list
                </button>
              }
            />
          </li>
        </ul>
      </nav>
      <nav aria-label="More" className="mt-auto flex flex-col gap-0.5">
        <SidebarButton
          onClick={onDone}
          describedBy="sidebar-done-count"
          item="done"
        >
          <SelectionBar on={selectionColumn === "done"} />
          <Check
            size={15}
            strokeWidth={2.4}
            aria-hidden="true"
            className="shrink-0"
          />
          <span className="flex-1">Done</span>
          {/* Not a false "0" before the todos arrive. */}
          {loading ? (
            <span
              aria-hidden="true"
              className="h-2.5 w-3 rounded-n-chip bg-n-fill motion-safe:animate-pulse"
            />
          ) : (
            <span aria-hidden="true" className="font-normal tabular-nums">
              {doneCount}
            </span>
          )}
          <span id="sidebar-done-count" hidden>
            {doneCount} {doneCount === 1 ? "todo" : "todos"}
          </span>
        </SidebarButton>
        <SidebarButton onClick={onSettings}>Settings</SidebarButton>
        {onFeedback && (
          <SidebarButton onClick={onFeedback} keyShortcut="f">
            <span className="flex-1">Send feedback</span>
            <span
              aria-hidden="true"
              className="font-n-text text-xs font-normal"
            >
              f
            </span>
          </SidebarButton>
        )}
        <SidebarButton onClick={onShortcuts} keyShortcut="?">
          <span className="flex-1">Keyboard shortcuts</span>
          <span aria-hidden="true" className="font-n-text text-xs font-normal">
            ?
          </span>
        </SidebarButton>
      </nav>
    </aside>
  );
}

function SidebarButton({
  onClick,
  describedBy,
  keyShortcut,
  item,
  children,
}: {
  onClick: () => void;
  describedBy?: string;
  keyShortcut?: string;
  /** Names a column item for the keyboard: `done`. */
  item?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-sidebar-nav
      data-sidebar-item={item}
      aria-describedby={describedBy}
      aria-keyshortcuts={keyShortcut}
      onClick={onClick}
      className={`${ENTRY} font-medium text-n-ink`}
    >
      {children}
    </button>
  );
}
