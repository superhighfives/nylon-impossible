import { useAuth } from "@clerk/tanstack-react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useWebSocketSync } from "@/hooks/useWebSocket";
import { API_URL } from "@/lib/config";
import { Sentry } from "@/lib/sentry";
import { createTodo, deleteTodo, getTodos, updateTodo } from "@/server/todos";
import type {
  CreateTodoInput,
  TodoWithUrls,
  UpdateTodoInput,
} from "@/types/database";

const ApiErrorSchema = z
  .object({ error: z.string() })
  .optional()
  .catch(undefined);

async function getApiError(response: Response): Promise<string | undefined> {
  const body = await response.json().catch(() => undefined);
  return ApiErrorSchema.parse(body)?.error;
}

const TODOS_QUERY_KEY = ["todos"];

// Must match RESEARCH_TIMEOUT_MS in src/api/src/lib/research.ts.
export const STALE_RESEARCH_MS = 5 * 60 * 1_000;

// AI enrichment has a 30s timeout (ENRICH_TIMEOUT_MS in ai.ts). Double it so
// we don't hide the spinner while a legitimate enrichment is still running.
export const STALE_AI_MS = 60 * 1_000;

// Show cancel + retry buttons after this long while research is pending.
export const SHOW_RETRY_MS = 30 * 1_000;

export function hasPendingNonStaleWork(todos: TodoWithUrls[]): boolean {
  return todos.some((todo) => {
    if (todo.aiStatus === "pending" || todo.aiStatus === "processing") {
      const age = Date.now() - new Date(todo.createdAt).getTime();
      return age < STALE_AI_MS;
    }
    if (todo.research?.status === "pending") {
      const age = Date.now() - new Date(todo.research.createdAt).getTime();
      return age < STALE_RESEARCH_MS;
    }
    return false;
  });
}

export function useTodos() {
  return useQuery<TodoWithUrls[]>({
    queryKey: TODOS_QUERY_KEY,
    queryFn: () => getTodos(),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      return hasPendingNonStaleWork(data) ? 3000 : false;
    },
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
        notes: input.notes ?? null,
        completed: false,
        position: "a0", // placeholder — replaced when onSettled invalidates
        dueDate: input.dueDate?.toISOString() ?? null,
        priority: input.priority ?? null,
        aiStatus: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        research: null,
        urls: [],
      };

      queryClient.setQueryData<TodoWithUrls[]>(TODOS_QUERY_KEY, [
        optimisticTodo,
        ...(previousTodos ?? []),
      ]);

      return { previousTodos, optimisticId: optimisticTodo.id };
    },
    onError: (_err, _variables, context) => {
      Sentry.captureException(_err, { tags: { mutation: "createTodo" } });
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
              ...(input.notes !== undefined && {
                notes: input.notes,
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
      Sentry.captureException(_err, { tags: { mutation: "updateTodo" } });
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
      Sentry.captureException(_err, { tags: { mutation: "deleteTodo" } });
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
        const message = await getApiError(response);
        throw new Error(message ?? `Request failed (${response.status})`);
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
        const message = await getApiError(response);
        throw new Error(message ?? `Request failed (${response.status})`);
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TODOS_QUERY_KEY });
      notifyChanged();
    },
  });
}

/**
 * Hook to trigger re-research for a todo.
 * Deletes existing research and kicks off a fresh research run.
 */
export function useReresearch() {
  const queryClient = useQueryClient();
  const { notifyChanged } = useWebSocketSync();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (todoId: string) => {
      const token = await getToken();
      const response = await fetch(`${API_URL}/todos/${todoId}/research`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const message = await getApiError(response);
        throw new Error(message ?? `Request failed (${response.status})`);
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TODOS_QUERY_KEY });
      notifyChanged();
    },
  });
}

/**
 * Hook to cancel pending research for a todo.
 * Marks research as failed so the user isn't stuck on a spinner.
 * The queue worker checks for cancellation before writing results.
 */
export function useCancelResearch() {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (todoId: string) => {
      const token = await getToken();
      const response = await fetch(`${API_URL}/todos/${todoId}/research`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const message = await getApiError(response);
        throw new Error(message ?? `Request failed (${response.status})`);
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TODOS_QUERY_KEY });
    },
  });
}
