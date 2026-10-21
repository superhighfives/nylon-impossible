import { useDroppable } from "@dnd-kit/core";
import { Keyboard, Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { SerializedList } from "@/types/database";

/** Droppable ids for sidebar entries, distinct from column ids. */
export const sidebarDropId = (listId: string) => `side:${listId}`;

const ENTRY =
  "flex h-9 w-full cursor-pointer items-center gap-2 rounded-[0.5rem] px-2.5 text-left text-[0.9375rem] text-n-ink n-focus transition-colors duration-(--n-duration-fast) pointer-fine:hover:bg-n-surface";

/**
 * One list in the sidebar: a button that also accepts a dropped todo. While
 * a todo is dragged over it, it fills, so the drop target is unmistakable.
 */
function ListEntry({
  list,
  count,
  selected,
  strong,
  onSelect,
}: {
  list: SerializedList;
  count: number;
  /** Your list is open as the fourth column. */
  selected?: boolean;
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
        aria-pressed={selected === undefined ? undefined : selected}
        onClick={() => onSelect(list)}
        className={`${ENTRY} ${strong || selected ? "font-semibold" : "font-medium"} ${
          dropping ? "bg-n-brand text-n-brand-ink" : selected ? "bg-n-fill" : ""
        }`}
      >
        <span className="min-w-0 flex-1 truncate">{list.name}</span>
        <span
          className={`font-normal tabular-nums ${dropping ? "" : "text-n-ink-muted"}`}
        >
          <span className="sr-only">, </span>
          {count}
          <span className="sr-only"> {count === 1 ? "todo" : "todos"}</span>
        </span>
      </button>
    </li>
  );
}

/**
 * The wide sidebar: the wordmark; Today, This Week and Someday with counts;
 * a "Lists" heading, your lists and an inline "New list"; then Done and
 * Settings. Every list is a drop target.
 */
export function Sidebar({
  timeLists,
  collections,
  countFor,
  openListId,
  doneCount,
  onTimeList,
  onCollection,
  onCreateList,
  onDone,
  onSettings,
  onShortcuts,
}: {
  timeLists: SerializedList[];
  collections: SerializedList[];
  countFor: (listId: string) => number;
  openListId: string | null;
  doneCount: number;
  onTimeList: (list: SerializedList) => void;
  onCollection: (list: SerializedList) => void;
  onCreateList: (name: string) => void;
  onDone: () => void;
  onSettings: () => void;
  onShortcuts: () => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const name = draft.trim();
    if (!name) return;
    setDraft("");
    onCreateList(name);
  };

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
              selected={openListId === list.id}
              onSelect={onCollection}
            />
          ))}
          <li>
            <label className="flex h-9 items-center gap-2 rounded-[0.5rem] px-2.5 text-[0.9375rem] text-n-ink-muted focus-within:bg-n-surface">
              <Plus size={15} aria-hidden="true" className="shrink-0" />
              <span className="sr-only">New list name</span>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add();
                  }
                  if (e.key === "Escape") {
                    setDraft("");
                    e.currentTarget.blur();
                  }
                }}
                placeholder="New list"
                className="min-w-0 flex-1 bg-transparent p-0 text-n-ink outline-none placeholder:text-n-ink-muted"
              />
            </label>
          </li>
        </ul>
      </nav>
      <nav aria-label="More" className="mt-auto flex flex-col gap-0.5">
        <SidebarButton onClick={onDone}>
          <span className="flex-1">Done</span>
          <span className="font-normal text-n-ink-muted tabular-nums">
            <span className="sr-only">, </span>
            {doneCount}
          </span>
        </SidebarButton>
        <SidebarButton onClick={onSettings}>Settings</SidebarButton>
        <button
          type="button"
          onClick={onShortcuts}
          aria-keyshortcuts="?"
          className="mt-3 flex cursor-pointer items-center gap-2 rounded-[0.5rem] px-2.5 py-1.5 text-left text-xs leading-[1.6] text-n-ink-muted n-focus pointer-fine:hover:text-n-ink"
        >
          <Keyboard size={14} aria-hidden="true" className="shrink-0" />
          <span>
            Keyboard shortcuts <kbd className="font-n-text">?</kbd>
          </span>
        </button>
      </nav>
    </aside>
  );
}

function SidebarButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className={`${ENTRY} font-medium`}>
      {children}
    </button>
  );
}
