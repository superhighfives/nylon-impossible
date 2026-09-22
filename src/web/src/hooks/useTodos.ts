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

export function useTodos() {
  const queryClient = useQueryClient();
  const query = useQuery<TodoWithUrls[]>({
    queryKey: TODOS_QUERY_KEY,
    queryFn: () => getTodos(),
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
        // Caller-supplied (each list column's "+ New Todo" passes its own
        // listId; the `n` shortcut passes the Today list). Falls back to ""
        // only if omitted — resolved for real once the server responds.
        listId: input.listId ?? "",
        title: input.title,
        notes: input.notes ?? null,
        completed: false,
        completedAt: null,
        // Use the caller's explicit position when given (e.g. a subtask inserted
        // at the top of its parent's list) so the optimistic row lands in the
        // right place; otherwise a placeholder replaced when onSettled invalidates.
        position: input.position ?? "a0",
        dueDate: input.dueDate?.toISOString() ?? null,
        recurrence: input.recurrence ?? null,
        sticky: false,
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
              ...(input.recurrence !== undefined && {
                recurrence: input.recurrence,
              }),
              ...(input.completedAt !== undefined && {
                completedAt: input.completedAt?.toISOString() ?? null,
              }),
              ...(input.sticky !== undefined && { sticky: input.sticky }),
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
            if (becameComplete && merged.sticky) {
              merged.sticky = false;
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
}

export interface SmartCreateInput {
  text: string;
}

/**
 * Hook to create todos via the smart create API endpoint.
 * Extracts URLs and titles from pasted text, splitting multiple lines into
 * separate todos.
 */
export function useSmartCreate() {
  const queryClient = useQueryClient();
  const { notifyChanged } = useWebSocketSync();
  const { getToken, userId } = useAuth();

  return useMutation({
    mutationFn: async ({
      text,
    }: SmartCreateInput): Promise<SmartCreateResponse> => {
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
        // Smart-create defaults to Today server-side; the placeholder is
        // reconciled wholesale by the onSettled refetch regardless.
        listId: "",
        title: text.trim(),
        notes: null,
        completed: false,
        completedAt: null,
        position: generateKeyBetween(null, minPosition),
        dueDate: null,
        recurrence: null,
        sticky: false,
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
 * Hook to re-run link processing on a todo: attach any URLs in its text, fetch
 * what's behind them, and name the todo after what turned up if it's still
 * carrying a "Check {domain}" placeholder.
 *
 * Deliberately not an AI action — no model runs and it works with AI turned
 * off. It's the retry for a link whose fetch failed, and the way a todo
 * captured as a bare URL gets a real title. Results arrive via sync; the links
 * flip to pending server-side so the row shows a spinner meanwhile.
 */
export function useProcessTodo() {
  const queryClient = useQueryClient();
  const { notifyChanged } = useWebSocketSync();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (todoId: string) => {
      const token = await getToken();
      const response = await fetch(`${API_URL}/todos/${todoId}/process`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const message = await getApiError(response);
        throw new Error(message ?? `Request failed (${response.status})`);
      }

      return response.json() as Promise<{ status: string; links: number }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: TODOS_QUERY_KEY });
      notifyChanged();
      if (result.links === 0) {
        toast.info("No links to process on this task");
      }
    },
    onError: (err) => {
      Sentry.captureException(err, { tags: { mutation: "processTodo" } });
      toast.error(messageFromError(err, "Couldn't process todo"));
    },
  });
}
