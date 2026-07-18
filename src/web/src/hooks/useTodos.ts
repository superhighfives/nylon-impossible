import { useAuth } from "@clerk/tanstack-react-start";
import { nextDueDate } from "@nylon-impossible/shared/recurrence";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { generateKeyBetween } from "fractional-indexing";
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
  updateTodo,
  updateTodoUrlPreview,
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
        parentId: input.parentId ?? null,
        title: input.title,
        notes: input.notes ?? null,
        completed: false,
        completedAt: null,
        // Use the caller's explicit position when given (e.g. a subtask inserted
        // at the top of its parent's list) so the optimistic row lands in the
        // right place; otherwise a placeholder replaced when onSettled invalidates.
        position: input.position ?? "a0",
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
            // Completion cascade: toggling a parent optimistically toggles its
            // subtasks, mirroring the server. Subtasks never recur, so this is a
            // plain flip.
            if (
              todo.parentId === id &&
              input.completed !== undefined &&
              todo.completed !== input.completed
            ) {
              return { ...todo, completed: input.completed };
            }
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
              ...(input.completedAt !== undefined && {
                completedAt: input.completedAt?.toISOString() ?? null,
              }),
            };
            // Optimistic recurrence advance: if this update marks a recurring
            // todo complete, roll dueDate forward, keep completed = false, and
            // stamp completedAt so it shows in Completed until local midnight.
            // Mirrors the server's canonical advance in updateTodo / syncTodos.
            const becameComplete = input.completed === true && !todo.completed;
            const anchor = merged.dueDate ? new Date(merged.dueDate) : null;
            if (becameComplete && merged.recurrence && anchor) {
              merged.completed = false;
              merged.completedAt = new Date().toISOString();
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

/**
 * Toggle whether a URL shows its fetched preview (page title/description) or
 * just the raw URL. Optimistically flips the flag on the matching URL.
 */
export function useUpdateUrlPreview() {
  const queryClient = useQueryClient();
  const { notifyChanged } = useWebSocketSync();

  return useMutation({
    mutationFn: ({ id, showPreview }: { id: string; showPreview: boolean }) =>
      updateTodoUrlPreview({ data: { id, showPreview } }),
    onMutate: async ({ id, showPreview }) => {
      await queryClient.cancelQueries({ queryKey: TODOS_QUERY_KEY });
      const previousTodos =
        queryClient.getQueryData<TodoWithUrls[]>(TODOS_QUERY_KEY);

      if (previousTodos) {
        queryClient.setQueryData<TodoWithUrls[]>(
          TODOS_QUERY_KEY,
          previousTodos.map((todo) =>
            todo.urls.some((url) => url.id === id)
              ? {
                  ...todo,
                  urls: todo.urls.map((url) =>
                    url.id === id ? { ...url, showPreview } : url,
                  ),
                }
              : todo,
          ),
        );
      }

      return { previousTodos };
    },
    onError: (err, _vars, context) => {
      Sentry.captureException(err, { tags: { mutation: "updateUrlPreview" } });
      toast.error(messageFromError(err, "Couldn't update link"));
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

export interface SmartCreateInput {
  text: string;
  // AI is opt-in per create: `enrich` runs the enrichment model, `research`
  // runs research. Both are Pro/aiEnabled-gated server-side.
  enrich?: boolean;
  research?: boolean;
}

/**
 * Hook to create todos via the smart create API endpoint.
 * Routes through AI extraction when the text contains multiple items or dates.
 */
export function useSmartCreate() {
  const queryClient = useQueryClient();
  const { notifyChanged } = useWebSocketSync();
  const { getToken, userId } = useAuth();

  return useMutation({
    mutationFn: async ({
      text,
      enrich,
      research,
    }: SmartCreateInput): Promise<SmartCreateResponse> => {
      const token = await getToken();
      const response = await fetch(`${API_URL}/todos/smart`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text, enrich, research }),
      });

      if (!response.ok) {
        const message = await getApiError(response);
        throw new Error(message ?? `Request failed (${response.status})`);
      }

      return response.json();
    },
    onMutate: async ({ text }) => {
      await queryClient.cancelQueries({ queryKey: TODOS_QUERY_KEY });
      const previousTodos =
        queryClient.getQueryData<TodoWithUrls[]>(TODOS_QUERY_KEY);

      // Prepend a single placeholder so the row appears instantly. Smart-create
      // may expand one line into several todos and rewrite the title/URLs, so
      // this is a stand-in reconciled wholesale by the onSettled refetch — not
      // patched in place. Position sorts before the current top-level minimum so
      // it lands at the top of the incomplete list, matching the server prepend.
      const minPosition = (previousTodos ?? [])
        .filter((t) => t.parentId == null && !t.completed)
        .reduce<string | null>(
          (min, t) => (min === null || t.position < min ? t.position : min),
          null,
        );

      const optimisticTodo: TodoWithUrls = {
        id: `temp-${crypto.randomUUID()}`,
        userId: userId ?? "",
        parentId: null,
        title: text.trim(),
        notes: null,
        completed: false,
        completedAt: null,
        position: generateKeyBetween(null, minPosition),
        dueDate: null,
        priority: null,
        recurrence: null,
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
    onError: (err, _text, context) => {
      Sentry.captureException(err, { tags: { mutation: "smartCreate" } });
      // Toasting is handled by the caller (TodoInput) which restores the input
      // text; here we just roll the cache back to before the optimistic insert.
      if (context?.previousTodos !== undefined) {
        queryClient.setQueryData(TODOS_QUERY_KEY, context.previousTodos);
        return;
      }
      if (context?.optimisticId) {
        queryClient.setQueryData<TodoWithUrls[] | undefined>(
          TODOS_QUERY_KEY,
          (current) =>
            current?.filter((todo) => todo.id !== context.optimisticId) ??
            current,
        );
      }
    },
    onSuccess: () => {
      notifyChanged();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TODOS_QUERY_KEY });
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
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (): Promise<{
      imported: number;
      skipped: number;
      importedIds: string[];
      datedTodos: { id: string; title: string; dueDate: string }[];
    }> => {
      const token = await getToken();
      const response = await fetch(`${API_URL}/todos/import/google-tasks`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const message = await getApiError(response);
        throw new Error(message ?? `Request failed (${response.status})`);
      }

      return response.json();
    },
    onSuccess: ({ imported, skipped }) => {
      // The success toast for imported > 0 is deferred: it fires once the
      // caller finishes the post-import repeat-schedule review, alongside
      // revealing the new rows. Only the no-op outcomes toast here.
      if (imported === 0) {
        toast.info(
          skipped > 0
            ? "Your Google Tasks are already imported"
            : "No Google Tasks to import",
        );
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
 * Hook to run AI enrichment on an existing todo on demand. AI is intentional —
 * nothing enriches automatically — so this backs the explicit per-todo "Enrich"
 * action. Marks the todo pending server-side; the result arrives via sync.
 */
export function useEnrichTodo() {
  const queryClient = useQueryClient();
  const { notifyChanged } = useWebSocketSync();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (todoId: string) => {
      const token = await getToken();
      const response = await fetch(`${API_URL}/todos/${todoId}/enrich`, {
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
      Sentry.captureException(err, { tags: { mutation: "enrichTodo" } });
      toast.error(messageFromError(err, "Couldn't enrich todo"));
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
