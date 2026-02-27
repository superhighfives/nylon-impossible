import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWebSocketSync } from "@/hooks/useWebSocket";
import type { ExtractedTodo } from "@/lib/ai-types";
import { extractTodosFromText } from "@/server/ai";
import { createTodo, deleteTodo, getTodos, updateTodo } from "@/server/todos";
import type { CreateTodoInput, Todo, UpdateTodoInput } from "@/types/database";

const TODOS_QUERY_KEY = ["todos"];

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

/**
 * Hook to extract todos from text using AI
 */
export function useExtractTodos() {
  return useMutation({
    mutationFn: (text: string) => extractTodosFromText({ data: { text } }),
  });
}

/**
 * Hook to create multiple todos at once (for AI extraction)
 */
export function useCreateTodosBatch() {
  const queryClient = useQueryClient();
  const { notifyChanged } = useWebSocketSync();

  return useMutation({
    mutationFn: async (todos: ExtractedTodo[]) => {
      // Create todos sequentially to maintain order
      const results: Todo[] = [];
      for (const todo of todos) {
        if (!todo.selected) continue;
        const input: CreateTodoInput = { title: todo.title };
        if (todo.dueDate) {
          input.dueDate = new Date(todo.dueDate);
        }
        const result = await createTodo({ data: input });
        results.push(result);
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TODOS_QUERY_KEY });
      notifyChanged();
    },
  });
}
