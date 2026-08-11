import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWebSocketSync } from "@/hooks/useWebSocket";
import { Sentry } from "@/lib/sentry";
import { messageFromError, toast } from "@/lib/toast";
import { createList, deleteList, getLists, updateList } from "@/server/lists";
import type {
  CreateListInput,
  SerializedList,
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
        createdAt: now,
        updatedAt: now,
      };

      queryClient.setQueryData<SerializedList[]>(LISTS_QUERY_KEY, [
        ...(previousLists ?? []),
        optimisticList,
      ]);

      return { previousLists, optimisticId: optimisticList.id };
    },
    onError: (err, _input, context) => {
      Sentry.captureException(err, { tags: { mutation: "createList" } });
      toast.error(messageFromError(err, "Couldn't create list"));
      if (context?.previousLists !== undefined) {
        queryClient.setQueryData(LISTS_QUERY_KEY, context.previousLists);
      }
    },
    onSuccess: () => {
      notifyChanged();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: LISTS_QUERY_KEY });
    },
  });
}

export function useUpdateList() {
  const queryClient = useQueryClient();
  const { notifyChanged } = useWebSocketSync();

  return useMutation({
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
                }
              : list,
          ),
        );
      }

      return { previousLists };
    },
    onError: (err, _vars, context) => {
      Sentry.captureException(err, { tags: { mutation: "updateList" } });
      toast.error(messageFromError(err, "Couldn't update list"));
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
      toast.error(messageFromError(err, "Couldn't delete list"));
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
