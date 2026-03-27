import { useAuth } from "@clerk/tanstack-react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWebSocketSync } from "@/hooks/useWebSocket";
import { API_URL } from "@/lib/config";
import { createTodo, deleteTodo, getTodos, updateTodo } from "@/server/todos";
import type {
  CreateTodoInput,
  TodoWithUrls,
  UpdateTodoInput,
} from "@/types/database";

const TODOS_QUERY_KEY = ["todos"];

export function useTodos() {
  return useQuery<TodoWithUrls[]>({
    queryKey: TODOS_QUERY_KEY,
    queryFn: () => getTodos(),
  });
}

export function useCreateTodo() {
  const queryClient = useQueryClient();
  const { notifyChanged } = useWebSocketSync();
  const { userId } = useAuth();

  return useMutation({
    mutationFn: (input: CreateTodoInput) => createTodo({ data: input }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: TODOS_QUERY_KEY });
      const previousTodos =
        queryClient.getQueryData<TodoWithUrls[]>(TODOS_QUERY_KEY);

      const optimisticTodo: TodoWithUrls = {
        id: `temp-${crypto.randomUUID()}`,
        userId: userId ?? "",
        title: input.title,
        description: input.description ?? null,
        completed: false,
        position: "a0", // placeholder — replaced when onSettled invalidates
        dueDate: input.dueDate?.toISOString() ?? null,
        priority: input.priority ?? null,
        aiStatus: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        urls: [],
      };

      queryClient.setQueryData<TodoWithUrls[]>(TODOS_QUERY_KEY, [
        optimisticTodo,
        ...(previousTodos ?? []),
      ]);

      return { previousTodos, optimisticId: optimisticTodo.id };
    },
    onError: (_err, _variables, context) => {
      if (!context) {
        return;
      }

      if (context.previousTodos !== undefined) {
        // Restore the previous cache state when it existed
        queryClient.setQueryData(TODOS_QUERY_KEY, context.previousTodos);
        return;
      }

      if (context.optimisticId) {
        // No previous cache: remove the optimistic entry we added
        queryClient.setQueryData<TodoWithUrls[] | undefined>(
          TODOS_QUERY_KEY,
          (current) =>
            current?.filter((todo) => todo.id !== context.optimisticId) ??
            current,
        );
      }
    },
    onSuccess: () => {
      // Only notify other clients when the create actually succeeded
      notifyChanged();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TODOS_QUERY_KEY });
    },
  });
}

export function useUpdateTodo() {
  const queryClient = useQueryClient();
  const { notifyChanged } = useWebSocketSync();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTodoInput }) =>
      updateTodo({ data: { id, input } }),
    onMutate: async ({ id, input }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: TODOS_QUERY_KEY });

      // Snapshot previous value
      const previousTodos =
        queryClient.getQueryData<TodoWithUrls[]>(TODOS_QUERY_KEY);

      // Optimistically update
      if (previousTodos) {
        queryClient.setQueryData<TodoWithUrls[]>(
          TODOS_QUERY_KEY,
          previousTodos.map((todo) => {
            if (todo.id !== id) return todo;
            // Build optimistic update, converting Date to ISO string
            return {
              ...todo,
              ...(input.title !== undefined && { title: input.title }),
              ...(input.description !== undefined && {
                description: input.description,
              }),
              ...(input.completed !== undefined && {
                completed: input.completed,
              }),
              ...(input.position !== undefined && { position: input.position }),
              ...(input.dueDate !== undefined && {
                dueDate: input.dueDate?.toISOString() ?? null,
              }),
              ...(input.priority !== undefined && { priority: input.priority }),
            };
          }),
        );
      }

      return { previousTodos };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousTodos) {
        queryClient.setQueryData(TODOS_QUERY_KEY, context.previousTodos);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TODOS_QUERY_KEY });
      notifyChanged();
    },
  });
}

export function useDeleteTodo() {
  const queryClient = useQueryClient();
  const { notifyChanged } = useWebSocketSync();

  return useMutation({
    mutationFn: (id: string) => deleteTodo({ data: id }),
    onMutate: async (id) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: TODOS_QUERY_KEY });

      // Snapshot previous value
      const previousTodos =
        queryClient.getQueryData<TodoWithUrls[]>(TODOS_QUERY_KEY);

      // Optimistically remove
      if (previousTodos) {
        queryClient.setQueryData<TodoWithUrls[]>(
          TODOS_QUERY_KEY,
          previousTodos.filter((todo) => todo.id !== id),
        );
      }

      return { previousTodos };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousTodos) {
        queryClient.setQueryData(TODOS_QUERY_KEY, context.previousTodos);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TODOS_QUERY_KEY });
      notifyChanged();
    },
  });
}

/**
 * Hook to fetch a single todo with its URLs.
 * Only fetches when todoId is provided and enabled.
 */
export function useTodoWithUrls(todoId: string | null) {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["todo", todoId],
    queryFn: async (): Promise<TodoWithUrls> => {
      const token = await getToken();
      const response = await fetch(`${API_URL}/todos/${todoId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(
          (error as { error?: string } | null)?.error ??
            `Request failed (${response.status})`,
        );
      }

      return response.json();
    },
    enabled: !!todoId,
    staleTime: 30_000, // Consider fresh for 30 seconds
  });
}

interface SmartCreateResponse {
  todos: TodoWithUrls[];
  ai: boolean;
}

/**
 * Hook to create todos via the smart create API endpoint.
 * Routes through AI extraction when the text contains multiple items or dates.
 */
export function useSmartCreate() {
  const queryClient = useQueryClient();
  const { notifyChanged } = useWebSocketSync();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (text: string): Promise<SmartCreateResponse> => {
      const token = await getToken();
      const response = await fetch(`${API_URL}/todos/smart`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(
          (error as { error?: string } | null)?.error ??
            `Request failed (${response.status})`,
        );
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TODOS_QUERY_KEY });
      notifyChanged();
    },
  });
}
