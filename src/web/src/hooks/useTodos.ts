import { useAuth } from "@clerk/tanstack-react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWebSocketSync } from "@/hooks/useWebSocket";
import { createTodo, deleteTodo, getTodos, updateTodo } from "@/server/todos";
import type { CreateTodoInput, Todo, UpdateTodoInput } from "@/types/database";

const TODOS_QUERY_KEY = ["todos"];

const API_URL =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:8787"
    : "https://api.nylonimpossible.com";

export function useTodos() {
  return useQuery({
    queryKey: TODOS_QUERY_KEY,
    queryFn: () => getTodos(),
  });
}

export function useCreateTodo() {
  const queryClient = useQueryClient();
  const { notifyChanged } = useWebSocketSync();

  return useMutation({
    mutationFn: (input: CreateTodoInput) => createTodo({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TODOS_QUERY_KEY });
      notifyChanged();
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
      const previousTodos = queryClient.getQueryData<Todo[]>(TODOS_QUERY_KEY);

      // Optimistically update
      if (previousTodos) {
        queryClient.setQueryData<Todo[]>(
          TODOS_QUERY_KEY,
          previousTodos.map((todo) =>
            todo.id === id ? { ...todo, ...input } : todo,
          ),
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
      const previousTodos = queryClient.getQueryData<Todo[]>(TODOS_QUERY_KEY);

      // Optimistically remove
      if (previousTodos) {
        queryClient.setQueryData<Todo[]>(
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

interface SmartCreateResponse {
  todos: Todo[];
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
