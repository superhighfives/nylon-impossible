import { useDroppable } from "@dnd-kit/core";
import { Check, Plus } from "lucide-react";
import type { ReactNode } from "react";
import type { SerializedList } from "@/types/database";
import { NewListPopover } from "./NewListPopover";

/** Droppable ids for sidebar entries, distinct from column ids. */
export const sidebarDropId = (listId: string) => `side:${listId}`;

const ENTRY =
  "relative flex h-9 w-full cursor-pointer items-center gap-2 rounded-[0.5rem] px-2.5 text-left text-[0.9375rem] text-n-ink n-focus transition-colors duration-(--n-duration-fast) pointer-fine:hover:bg-n-surface";

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
 */
function ListEntry({
  list,
  count,
  open,
  current,
  strong,
  onSelect,
}: {
  list: SerializedList;
  count: number;
  /** Your list is showing in the fourth column: grey fill, semibold. */
  open?: boolean;
  /** The selection is in this list's column: the ink bar. */
  current: boolean;
  /** The time lists read heavier than your own. */
  strong?: boolean;
  onSelect: (list: SerializedList) => void;
}) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: sidebarDropId(list.id),
    data: { listId: list.id },
  });
  const dropping = isOver && !!active;
  return (
    <li ref={setNodeRef}>
      <button
        type="button"
        data-sidebar-list={list.id}
        aria-describedby={`sidebar-count-${list.id}`}
        aria-current={open ? "true" : undefined}
        onClick={() => onSelect(list)}
        className={`${ENTRY} ${strong || open ? "font-semibold" : "font-medium"} ${
          dropping ? "bg-n-brand text-n-brand-ink" : open ? "bg-n-fill" : ""
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
        </span>
      </button>
    </li>
  );
}

/**
 * The wide sidebar: the wordmark; Today, This week and Someday with counts;
 * a "Lists" heading, your lists and New list; then Done, Settings, Send
 * feedback (admins) and Keyboard shortcuts. Every list is a drop target.
 *
 * Two indicators, which can combine: the grey fill marks the list open in
 * the fourth column (Done never takes it; its label goes from muted to ink
 * instead), and the ink bar marks the column the selection is in.
 */
export function Sidebar({
  timeLists,
  collections,
  countFor,
  openListId,
  selectionColumn,
  doneShowing,
  doneCount,
  onTimeList,
  onCollection,
  onCreateList,
  onDone,
  onSettings,
  onShortcuts,
  onFeedback,
}: {
  timeLists: SerializedList[];
  collections: SerializedList[];
  countFor: (listId: string) => number;
  openListId: string | null;
  /** The column the selection is in: a list id, `done`, or none. */
  selectionColumn: string | null;
  /** Done is what the fourth column is showing. */
  doneShowing: boolean;
  doneCount: number;
  onTimeList: (list: SerializedList) => void;
  onCollection: (list: SerializedList) => void;
  onCreateList: (name: string) => void;
  onDone: () => void;
  onSettings: () => void;
  onShortcuts: () => void;
  /** Shown only when set — the caller passes it for admins. */
  onFeedback?: () => void;
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
              open={openListId === list.id}
              current={selectionColumn === list.id}
              onSelect={onCollection}
            />
          ))}
          <li>
            <NewListPopover
              side="right"
              onCreate={onCreateList}
              trigger={
                <button
                  type="button"
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
          current={doneShowing}
        >
          <SelectionBar on={selectionColumn === "done"} />
          <Check
            size={15}
            strokeWidth={2.4}
            aria-hidden="true"
            className="shrink-0"
          />
          <span className="flex-1">Done</span>
          <span aria-hidden="true" className="font-normal tabular-nums">
            {doneCount}
          </span>
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
  current,
  children,
}: {
  onClick: () => void;
  describedBy?: string;
  keyShortcut?: string;
  /** Done only: showing in the fourth column, so ink rather than muted. */
  current?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-describedby={describedBy}
      aria-keyshortcuts={keyShortcut}
      aria-current={current ? "true" : undefined}
      onClick={onClick}
      className={`${ENTRY} font-medium ${current === false ? "text-n-ink-muted" : ""}`}
    >
      {children}
    </button>
  );
}
