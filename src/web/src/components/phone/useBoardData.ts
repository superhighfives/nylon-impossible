import { useCallback, useMemo } from "react";
import { useHints } from "@/hooks/useHints";
import { useLists } from "@/hooks/useLists";
import { useLocalMidnightTick } from "@/hooks/useLocalMidnightTick";
import { useTodos } from "@/hooks/useTodos";
import type { TodoWithUrls } from "@/types/database";
import { openRows, splitLists, TIME_KINDS } from "./model";
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
  const { data: lists, isLoading: listsLoading } = useLists();
  const {
    data: todosData,
    isLoading: todosLoading,
    error,
    refetch,
    isFetching,
  } = useTodos();
  const todos = todosData ?? EMPTY;

  const { byKind, collections } = useMemo(() => splitLists(lists), [lists]);
  const listName = useCallback(
    (id: string) => lists?.find((l) => l.id === id)?.name ?? "List",
    [lists],
  );
  const actions = useTodoActions({ timeZone, listName, allTodos: todos });

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
        .map((l) => ({ id: l.id, label: l.name })),
    [byKind, collections],
  );

  const doneCount = useMemo(
    () => todos.filter((t) => t.parentId == null && t.completed).length,
    [todos],
  );

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
    doneCount,
    loading: listsLoading || todosLoading,
    todosLoading,
    error,
    refetch,
    isFetching,
  };
}

export type BoardData = ReturnType<typeof useBoardData>;
