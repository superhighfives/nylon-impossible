import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useWebSocketSync } from "@/hooks/useWebSocket";
import { applyMoves, type ListMove } from "@/lib/listOrder";
import {
  listCreateFailed,
  listCreateSaved,
  listCreateStarted,
} from "@/lib/pending-lists";
import { Sentry } from "@/lib/sentry";
import { messageFromError, toast } from "@/lib/toast";
import { createList, deleteList, getLists, updateList } from "@/server/lists";
import type {
  CreateListInput,
  SerializedList,
  TodoWithUrls,
  UpdateListInput,
} from "@/types/database";

const LISTS_QUERY_KEY = ["lists"];

/** Your lists: what `useLists` reads, and what the board's loader prefetches. */
export const listsQuery = queryOptions<SerializedList[]>({
  queryKey: LISTS_QUERY_KEY,
  queryFn: () => getLists(),
});

export function useLists() {
  return useQuery(listsQuery);
}

export function useCreateList() {
  const queryClient = useQueryClient();
  const { notifyChanged } = useWebSocketSync();

  return useMutation({
    mutationKey: LISTS_QUERY_KEY,
    mutationFn: (input: CreateListInput) => createList({ data: input }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: LISTS_QUERY_KEY });
      const previousLists =
        queryClient.getQueryData<SerializedList[]>(LISTS_QUERY_KEY);

      const now = new Date().toISOString();
      const optimisticList: SerializedList = {
        id: `temp-${crypto.randomUUID()}`,
        userId: "",
        name: input.name,
        kind: "custom",
        systemKind: null,
        position: input.position ?? "a0",
        columnHidden: false,
        createdAt: now,
        updatedAt: now,
      };
      // An add or move aimed at the new list before it's saved waits on this.
      listCreateStarted(optimisticList.id);

      queryClient.setQueryData<SerializedList[]>(LISTS_QUERY_KEY, [
        ...(previousLists ?? []),
        optimisticList,
      ]);

      return { previousLists, optimisticId: optimisticList.id };
    },
    onError: (err, _input, context) => {
      Sentry.captureException(err, { tags: { mutation: "createList" } });
      toast.error(messageFromError(err, "Couldn’t create the list"));
      if (context?.previousLists !== undefined) {
        queryClient.setQueryData(LISTS_QUERY_KEY, context.previousLists);
      }
      if (context) listCreateFailed(context.optimisticId);
    },
    onSuccess: (created, _input, context) => {
      // Swap the optimistic row for the real one now, so a caller that opens
      // the new list finds it before the refetch lands.
      queryClient.setQueryData<SerializedList[]>(LISTS_QUERY_KEY, (lists) =>
        lists?.map((l) => (l.id === context?.optimisticId ? created : l)),
      );
      if (context) {
        // Todos already shown in the new list (an add or move waiting on
        // this create) follow it to its real id, so they don't drop out of
        // it until their own request returns.
        queryClient.setQueryData<TodoWithUrls[]>(["todos"], (todos) =>
          todos?.some((t) => t.listId === context.optimisticId)
            ? todos.map((t) =>
                t.listId === context.optimisticId
                  ? { ...t, listId: created.id }
                  : t,
              )
            : todos,
        );
        listCreateSaved(context.optimisticId, created.id);
      }
      notifyChanged();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: LISTS_QUERY_KEY });
    },
  });
}

/**
 * One update covers three actions on the web, so the failure names the one
 * that was tried: renaming, reordering, or hiding/showing the column.
 */
function updateListFailure(input: UpdateListInput): string {
  if (input.name !== undefined) return "Couldn’t rename the list";
  if (input.position !== undefined) return "Couldn’t save the new order";
  return "Couldn’t save that change";
}

export function useUpdateList() {
  const queryClient = useQueryClient();
  const { notifyChanged } = useWebSocketSync();

  return useMutation({
    mutationKey: LISTS_QUERY_KEY,
    mutationFn: ({ id, input }: { id: string; input: UpdateListInput }) =>
      updateList({ data: { id, input } }),
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: LISTS_QUERY_KEY });
      const previousLists =
        queryClient.getQueryData<SerializedList[]>(LISTS_QUERY_KEY);

      if (previousLists) {
        queryClient.setQueryData<SerializedList[]>(
          LISTS_QUERY_KEY,
          previousLists.map((list) =>
            list.id === id
              ? {
                  ...list,
                  ...(input.name !== undefined && { name: input.name }),
                  ...(input.position !== undefined && {
                    position: input.position,
                  }),
                  ...(input.columnHidden !== undefined && {
                    columnHidden: input.columnHidden,
                  }),
                }
              : list,
          ),
        );
      }

      return { previousLists };
    },
    onError: (err, { input }, context) => {
      Sentry.captureException(err, { tags: { mutation: "updateList" } });
      toast.error(messageFromError(err, updateListFailure(input)));
      if (context?.previousLists) {
        queryClient.setQueryData(LISTS_QUERY_KEY, context.previousLists);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: LISTS_QUERY_KEY });
      notifyChanged();
    },
  });
}

/**
 * Reorder your lists: each move is a `position` through the list update.
 * The new order goes into the cache before this returns, not a tick later
 * as a mutation's `onMutate` would, so a drop or ⌥↑ never shows the old
 * order for a frame. A failure puts the old order back.
 */
export function useReorderLists() {
  const queryClient = useQueryClient();
  const { notifyChanged } = useWebSocketSync();

  const mutation = useMutation({
    mutationKey: LISTS_QUERY_KEY,
    mutationFn: ({ moves }: { moves: ListMove[]; undo: ListMove[] }) =>
      Promise.all(
        moves.map((m) =>
          updateList({ data: { id: m.id, input: { position: m.position } } }),
        ),
      ),
    onError: (err, { moves, undo }) => {
      Sentry.captureException(err, { tags: { mutation: "reorderLists" } });
      toast.error(messageFromError(err, "Couldn’t save the new order"));
      // Only this save's lists go back, and only those no later reorder has
      // moved since, so a quick second reorder keeps its order.
      const current =
        queryClient.getQueryData<SerializedList[]>(LISTS_QUERY_KEY);
      if (!current) return;
      const ours = new Map(moves.map((m) => [m.id, m.position]));
      const pos = new Map(current.map((l) => [l.id, l.position]));
      const back = undo.filter((m) => pos.get(m.id) === ours.get(m.id));
      queryClient.setQueryData(LISTS_QUERY_KEY, applyMoves(current, back));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: LISTS_QUERY_KEY });
      notifyChanged();
    },
  });

  return (moves: ListMove[]) => {
    if (moves.length === 0) return;
    // A refetch already on its way would land the old order over this one.
    void queryClient.cancelQueries({ queryKey: LISTS_QUERY_KEY });
    const previous =
      queryClient.getQueryData<SerializedList[]>(LISTS_QUERY_KEY) ?? [];
    const was = new Map(previous.map((l) => [l.id, l.position]));
    const undo = moves.flatMap((m) => {
      const position = was.get(m.id);
      return position === undefined ? [] : [{ id: m.id, position }];
    });
    if (previous.length > 0) {
      queryClient.setQueryData(LISTS_QUERY_KEY, applyMoves(previous, moves));
    }
    mutation.mutate({ moves, undo });
  };
}

export function useDeleteList() {
  const queryClient = useQueryClient();
  const { notifyChanged } = useWebSocketSync();

  return useMutation({
    mutationKey: LISTS_QUERY_KEY,
    mutationFn: (id: string) => deleteList({ data: id }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: LISTS_QUERY_KEY });
      const previousLists =
        queryClient.getQueryData<SerializedList[]>(LISTS_QUERY_KEY);

      if (previousLists) {
        queryClient.setQueryData<SerializedList[]>(
          LISTS_QUERY_KEY,
          previousLists.filter((list) => list.id !== id),
        );
      }

      return { previousLists };
    },
    onError: (err, _id, context) => {
      Sentry.captureException(err, { tags: { mutation: "deleteList" } });
      toast.error(messageFromError(err, "Couldn’t delete the list"));
      if (context?.previousLists) {
        queryClient.setQueryData(LISTS_QUERY_KEY, context.previousLists);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: LISTS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      notifyChanged();
    },
  });
}
