import { useCallback, useMemo } from "react";
import { useHints } from "@/hooks/useHints";
import { useLists } from "@/hooks/useLists";
import { useLocalMidnightTick } from "@/hooks/useLocalMidnightTick";
import { useTodos } from "@/hooks/useTodos";
import type { TodoWithUrls } from "@/types/database";
import { openRows, splitLists, TIME_KINDS } from "./model";
import { recordRecentMove } from "./moveMenu";
import { useTodoActions } from "./useTodoActions";

const EMPTY: TodoWithUrls[] = [];

/**
 * The data both layouts (phone and wide) render from: lists split into the
 * time lists and your own, every todo, the row actions, and the helpers that
 * turn those into rows, counts and move targets. One source, so the two
 * densities can't drift apart.
 */
export function useBoardData() {
  const { timeZone } = useHints();
  useLocalMidnightTick();
  const { data: lists, error: listsError } = useLists();
  const { data: todosData, error, refetch, isFetching } = useTodos();
  // Loading means "no data yet", not `isLoading`: that's false while a query
  // is idle, which it is in the server render and before the client's first
  // fetch starts, so the board painted empty (just "Nothing done yet.").
  const listsLoading = lists === undefined && !listsError;
  const todosLoading = todosData === undefined && !error;
  const todos = todosData ?? EMPTY;

  const listName = useCallback(
    (id: string) => lists?.find((l) => l.id === id)?.name ?? "List",
    [lists],
  );
  // Your lists moved to feed the Move to menu's recents. Stable, so the
  // actions built on it (`move`) stay stable too.
  const onMoved = useCallback(
    (listId: string) => {
      if (lists?.some((l) => l.id === listId && !l.systemKind)) {
        recordRecentMove(listId);
      }
    },
    [lists],
  );
  const actions = useTodoActions({
    timeZone,
    listName,
    allTodos: todos,
    onMoved,
  });
  // A list deleted with Undo still pending is gone from every view.
  const { hiddenLists } = actions;
  const { byKind, collections } = useMemo(() => {
    const split = splitLists(lists);
    return {
      ...split,
      collections: split.collections.filter((l) => !hiddenLists.has(l.id)),
    };
  }, [lists, hiddenLists]);
  /** Finished top-level todos, minus any deleted with Undo pending. */
  const doneTodos = useMemo(
    () =>
      todos.filter(
        (t) =>
          t.parentId == null &&
          t.completed &&
          !actions.hidden.has(t.id) &&
          !hiddenLists.has(t.listId),
      ),
    [todos, actions.hidden, hiddenLists],
  );

  const subtasksByParent = useMemo(() => {
    const map = new Map<string, TodoWithUrls[]>();
    for (const t of todos) {
      if (!t.parentId) continue;
      const siblings = map.get(t.parentId) ?? [];
      siblings.push(t);
      map.set(t.parentId, siblings);
    }
    return map;
  }, [todos]);

  const subtasksOf = useCallback(
    (id: string) => subtasksByParent.get(id) ?? EMPTY,
    [subtasksByParent],
  );

  const rowsFor = useCallback(
    (listId: string | undefined) =>
      listId ? openRows(todos, listId, actions.hidden) : EMPTY,
    [todos, actions.hidden],
  );

  /** Today, This week, Someday, then your lists — move and add targets. */
  const targets = useMemo(
    () =>
      [...TIME_KINDS.map((kind) => byKind[kind]), ...collections]
        .filter((l) => l !== undefined)
        .map((l) => ({ id: l.id, label: l.name, kind: l.systemKind })),
    [byKind, collections],
  );

  const doneCount = doneTodos.length;

  return {
    timeZone,
    lists,
    todos,
    byKind,
    collections,
    listName,
    actions,
    subtasksOf,
    rowsFor,
    targets,
    doneTodos,
    doneCount,
    loading: listsLoading || todosLoading,
    todosLoading,
    error,
    refetch,
    isFetching,
  };
}

export type BoardData = ReturnType<typeof useBoardData>;
