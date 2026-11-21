import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWebSocketSync } from "@/hooks/useWebSocket";
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

export function useLists() {
  return useQuery<SerializedList[]>({
    queryKey: LISTS_QUERY_KEY,
    queryFn: () => getLists(),
  });
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
