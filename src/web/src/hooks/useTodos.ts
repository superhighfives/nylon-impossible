import { useAuth } from "@clerk/tanstack-react-start";
import { nextDueDate } from "@nylon-impossible/shared/recurrence";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { z } from "zod";
import { useWebSocketSync } from "@/hooks/useWebSocket";
import { updateAppBadge } from "@/lib/badge";
import { API_URL } from "@/lib/config";
import { Sentry } from "@/lib/sentry";
import { messageFromError, toast } from "@/lib/toast";
import {
  createTodo,
  deleteTodo,
  getTodos,
  importGoogleTasks,
  updateTodo,
} from "@/server/todos";
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
  const queryClient = useQueryClient();
  const query = useQuery<TodoWithUrls[]>({
    queryKey: TODOS_QUERY_KEY,
    queryFn: () => getTodos(),
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return false;
      return hasPendingNonStaleWork(data) ? 3000 : false;
    },
  });

  // Keep the app badge in sync with the visible cache. Recomputed whenever
  // the data changes (post-sync / post-mutation) and on tab visibility change
  // so the badge crosses the day boundary even without a sync.
  useEffect(() => {
    if (query.data) updateAppBadge(query.data);
  }, [query.data]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const data = queryClient.getQueryData<TodoWithUrls[]>(TODOS_QUERY_KEY);
      if (data) updateAppBadge(data);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [queryClient]);

  return query;
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
        recurrence: input.recurrence ?? null,
        aiStatus: null,
        needsInput: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        research: null,
        messages: [],
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
      toast.error(messageFromError(_err, "Couldn't add todo"));
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
            const merged: TodoWithUrls = {
              ...todo,
              ...(input.title !== undefined && { title: input.title }),
              ...(input.notes !== undefined && { notes: input.notes }),
              ...(input.completed !== undefined && {
                completed: input.completed,
              }),
              ...(input.position !== undefined && { position: input.position }),
              ...(input.dueDate !== undefined && {
                dueDate: input.dueDate?.toISOString() ?? null,
              }),
              ...(input.priority !== undefined && { priority: input.priority }),
              ...(input.recurrence !== undefined && {
                recurrence: input.recurrence,
              }),
            };
            // Optimistic recurrence advance: if this update marks a recurring
            // todo complete, roll dueDate forward and keep completed = false
            // so the UI doesn't flash "done" and disappear from the today view.
            // Mirrors the server's canonical advance in updateTodo / syncTodos.
            const becameComplete = input.completed === true && !todo.completed;
            const anchor = merged.dueDate ? new Date(merged.dueDate) : null;
            if (becameComplete && merged.recurrence && anchor) {
              merged.completed = false;
              merged.dueDate = nextDueDate(
                merged.recurrence,
                anchor,
                new Date(),
              ).toISOString();
            }
            return merged;
          }),
        );
      }

      return { previousTodos };
    },
    onError: (_err, _variables, context) => {
      Sentry.captureException(_err, { tags: { mutation: "updateTodo" } });
      toast.error(messageFromError(_err, "Couldn't save changes"));
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
      toast.error(messageFromError(_err, "Couldn't delete todo"));
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
 * Hook to import todos from the user's Google Tasks account. Surfaces a
 * success/skip summary via toast and refreshes the list on completion.
 */
export function useImportGoogleTasks() {
  const queryClient = useQueryClient();
  const { notifyChanged } = useWebSocketSync();

  return useMutation({
    mutationFn: () => importGoogleTasks(),
    onSuccess: ({ imported, skipped }) => {
      if (imported > 0) {
        toast.success(
          `Imported ${imported} ${imported === 1 ? "task" : "tasks"} from Google`,
        );
      } else if (skipped > 0) {
        toast.info("Your Google Tasks are already imported");
      } else {
        toast.info("No Google Tasks to import");
      }
      notifyChanged();
    },
    onError: (err) => {
      Sentry.captureException(err, { tags: { mutation: "importGoogleTasks" } });
      toast.error(messageFromError(err, "Couldn't import from Google Tasks"));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TODOS_QUERY_KEY });
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
    onError: (err) => {
      Sentry.captureException(err, { tags: { mutation: "reresearch" } });
      toast.error(messageFromError(err, "Couldn't start research"));
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
    onError: (err) => {
      Sentry.captureException(err, { tags: { mutation: "cancelResearch" } });
      toast.error(messageFromError(err, "Couldn't cancel research"));
    },
  });
}

/**
 * Hook to reply to the agent's clarifying question on a todo.
 * Optimistically appends the user's message and clears the needs-input
 * indicator; re-enrichment runs server-side and arrives via sync.
 */
export function useReplyToTodo() {
  const queryClient = useQueryClient();
  const { notifyChanged } = useWebSocketSync();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async ({
      todoId,
      content,
    }: {
      todoId: string;
      content: string;
    }) => {
      const token = await getToken();
      const response = await fetch(`${API_URL}/todos/${todoId}/reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        const message = await getApiError(response);
        throw new Error(message ?? `Request failed (${response.status})`);
      }

      return response.json();
    },
    onMutate: async ({ todoId, content }) => {
      await queryClient.cancelQueries({ queryKey: TODOS_QUERY_KEY });
      const previousTodos =
        queryClient.getQueryData<TodoWithUrls[]>(TODOS_QUERY_KEY);

      queryClient.setQueryData<TodoWithUrls[]>(TODOS_QUERY_KEY, (old) =>
        old?.map((todo) =>
          todo.id === todoId
            ? {
                ...todo,
                needsInput: false,
                messages: [
                  ...todo.messages,
                  {
                    id: `temp-${crypto.randomUUID()}`,
                    todoId,
                    role: "user" as const,
                    content,
                    createdAt: new Date().toISOString(),
                    awaitingReply: false,
                  },
                ],
              }
            : todo,
        ),
      );

      return { previousTodos };
    },
    onError: (err, _vars, context) => {
      if (context?.previousTodos) {
        queryClient.setQueryData(TODOS_QUERY_KEY, context.previousTodos);
      }
      Sentry.captureException(err, { tags: { mutation: "replyToTodo" } });
      toast.error(messageFromError(err, "Couldn't send reply"));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TODOS_QUERY_KEY });
      notifyChanged();
    },
  });
}

/**
 * Hook to dismiss the agent's open question without answering. Clears the
 * needs-input indicator optimistically; the message stays in history.
 */
export function useDismissTodoQuestion() {
  const queryClient = useQueryClient();
  const { notifyChanged } = useWebSocketSync();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async ({ todoId }: { todoId: string }) => {
      const token = await getToken();
      const response = await fetch(`${API_URL}/todos/${todoId}/question`, {
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
    onMutate: async ({ todoId }) => {
      await queryClient.cancelQueries({ queryKey: TODOS_QUERY_KEY });
      const previousTodos =
        queryClient.getQueryData<TodoWithUrls[]>(TODOS_QUERY_KEY);

      queryClient.setQueryData<TodoWithUrls[]>(TODOS_QUERY_KEY, (old) =>
        old?.map((todo) =>
          todo.id === todoId
            ? {
                ...todo,
                needsInput: false,
                messages: todo.messages.map((m) =>
                  m.awaitingReply ? { ...m, awaitingReply: false } : m,
                ),
              }
            : todo,
        ),
      );

      return { previousTodos };
    },
    onError: (err, _vars, context) => {
      if (context?.previousTodos) {
        queryClient.setQueryData(TODOS_QUERY_KEY, context.previousTodos);
      }
      Sentry.captureException(err, { tags: { mutation: "dismissQuestion" } });
      toast.error(messageFromError(err, "Couldn't dismiss question"));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TODOS_QUERY_KEY });
      notifyChanged();
    },
  });
}
