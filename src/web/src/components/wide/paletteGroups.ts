import { displayTitle } from "@/components/phone/model";
import { moveMenuPlan, readRecentMoves } from "@/components/phone/moveMenu";
import type { SerializedList, TodoWithUrls } from "@/types/database";
import {
  filterItems,
  type PaletteGroup,
  type PaletteItem,
} from "./CommandPalette";
import { type Board, keyHint, visibleCommands } from "./commands";

/** What the palette is showing: everything, just lists, or Move to. */
export type PaletteState =
  | { mode: "all" }
  | { mode: "lists" }
  | { mode: "move"; todoId: string };

/** The board data and the moves the palette's results make. */
export interface PaletteSource {
  timeLists: SerializedList[];
  collections: SerializedList[];
  countFor: (listId: string) => number;
  doneCount: number;
  /** Every todo, for searching; `searchable` drops ones deleted with Undo. */
  todos: TodoWithUrls[];
  searchable: (todo: TodoWithUrls) => boolean;
  listName: (listId: string) => string;
  /** The selection, for the commands that act on it. */
  selected: TodoWithUrls | null;
  /** Send feedback, for admins. */
  admin: boolean;
  board: Board;
  goToColumn: (list: SerializedList) => void;
  openList: (list: SerializedList) => void;
  showDone: () => void;
  goToTodo: (todo: TodoWithUrls) => void;
  moveTodo: (todo: TodoWithUrls, listId: string) => void;
  moveToNewList: (todo: TodoWithUrls, name: string) => void;
}

/** Go to: the time lists, your lists and Done, with counts and ⇧ hints. */
function goToItems(s: PaletteSource): PaletteItem[] {
  return [
    ...s.timeLists.map((l) => ({
      id: `go:${l.id}`,
      label: l.name,
      meta: String(s.countFor(l.id)),
      hint: keyHint(`go-${l.systemKind}`),
      run: () => s.goToColumn(l),
    })),
    ...s.collections.map((l, index) => ({
      id: `go:${l.id}`,
      label: l.name,
      meta: String(s.countFor(l.id)),
      hint: index < 6 ? `⇧${index + 4}` : undefined,
      run: () => s.openList(l),
    })),
    {
      id: "go:done",
      label: "Done",
      meta: String(s.doneCount),
      hint: keyHint("go-done"),
      run: s.showDone,
    },
  ];
}

/** Commands: the registry's palette commands, labelled for the selection. */
function commandItems(s: PaletteSource): PaletteItem[] {
  return visibleCommands(s.admin).flatMap((c) => {
    const label = c.palette?.(s.selected);
    if (!label) return [];
    return [
      {
        id: `cmd:${c.id}`,
        label,
        hint: keyHint(c.id),
        run: () => c.run(s.board),
      },
    ];
  });
}

/** Todos: up to eight matching titles, Done included. */
function todoItems(s: PaletteSource, query: string): PaletteItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return s.todos
    .filter(
      (t) =>
        t.parentId == null &&
        s.searchable(t) &&
        displayTitle(t).toLowerCase().includes(q),
    )
    .slice(0, 8)
    .map((t) => ({
      id: `todo:${t.id}`,
      label: displayTitle(t),
      meta: t.completed ? "Done" : s.listName(t.listId),
      run: () => s.goToTodo(t),
    }));
}

/**
 * Move to: every list but the todo's own, with counts and 1/2/3 hints, and
 * New list "…" when what's typed matches none. The time lists come first,
 * then the two lists you moved to most recently, then the rest, as the
 * phone's menu orders them.
 */
function moveItems(
  s: PaletteSource,
  todo: TodoWithUrls,
  query: string,
): PaletteItem[] {
  const lists = [...s.timeLists, ...s.collections];
  const plan = moveMenuPlan(
    s.collections
      .filter((l) => l.id !== todo.listId)
      .map((l) => ({ id: l.id, label: l.name, kind: null })),
    readRecentMoves(),
  );
  const ordered = [
    ...s.timeLists.filter((l) => l.id !== todo.listId),
    ...[...plan.recent, ...plan.more].flatMap(
      (t) => s.collections.find((l) => l.id === t.id) ?? [],
    ),
  ];
  const items = filterItems(
    ordered.map((l) => ({
      id: `move:${l.id}`,
      label: l.name,
      meta: String(s.countFor(l.id)),
      hint: l.systemKind ? keyHint(`move-${l.systemKind}`) : undefined,
      run: () => s.moveTodo(todo, l.id),
    })),
    query,
  );
  const name = query.replace(/\s+/g, " ").trim();
  const exists = lists.some((l) => l.name.toLowerCase() === name.toLowerCase());
  if (name && !exists) {
    items.push({
      id: "move:new",
      label: `New list “${name}”`,
      run: () => s.moveToNewList(todo, name),
    });
  }
  return items;
}

/** The palette's results for what's typed, in order. */
export function paletteGroups(
  state: PaletteState | null,
  moving: TodoWithUrls | undefined,
  s: PaletteSource,
  query: string,
): PaletteGroup[] {
  if (state?.mode === "lists") {
    return [{ label: "Lists", items: filterItems(goToItems(s), query) }];
  }
  if (state?.mode === "move") {
    return moving
      ? [{ label: "Move to", items: moveItems(s, moving, query) }]
      : [];
  }
  return [
    { label: "Todos", items: todoItems(s, query) },
    { label: "Go to", items: filterItems(goToItems(s), query) },
    { label: "Commands", items: filterItems(commandItems(s), query) },
  ];
}
