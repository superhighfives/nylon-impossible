import { env } from "cloudflare:workers";
import * as v from "valibot";

/** Minimal shape of a todo as returned by src/api's /internal/agent/* routes. */
interface TodoSummary {
  id: string;
  title: string;
  notes: string | null;
  completed: boolean;
  dueDate: string | null;
  parentId: string | null;
}

class TodoAgentApiError extends Error {}

/**
 * POST to one of src/api's `/internal/agent/*` routes over the `API`
 * Service Binding, with the shared bearer secret both Workers are
 * configured with. Throws `TodoAgentApiError` with a message a tool can
 * hand straight back to the model on anything but a 200.
 */
async function callInternalAgentRoute(
  path: string,
  body: Record<string, unknown>,
): Promise<TodoSummary> {
  const secret = env.INTERNAL_AGENT_SECRET;
  if (!secret) {
    throw new TodoAgentApiError(
      "The todo-agent Worker isn't configured with INTERNAL_AGENT_SECRET.",
    );
  }

  const res = await env.API.fetch(`https://internal${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 404) {
    throw new TodoAgentApiError("That todo doesn't exist anymore.");
  }
  if (!res.ok) {
    throw new TodoAgentApiError(
      `The todo couldn't be updated (${res.status}).`,
    );
  }

  const { todo } = await res.json<{ todo: TodoSummary }>();
  return todo;
}

interface ToolContext {
  todoId: string;
  userId: string;
}

export function updateTodoTool({ todoId, userId }: ToolContext) {
  return {
    name: "update_todo",
    description:
      "Update this todo's title and/or notes. Omit a field to leave it unchanged.",
    input: v.object({
      title: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(500))),
      notes: v.optional(v.nullable(v.string())),
    }),
    run: async ({
      data,
    }: {
      data: { title?: string; notes?: string | null };
    }) => {
      const todo = await callInternalAgentRoute(
        `/internal/agent/todos/${todoId}/update`,
        { userId, ...data },
      );
      return `Updated. Title is now "${todo.title}".`;
    },
  };
}

export function setDueDateTool({ todoId, userId }: ToolContext) {
  return {
    name: "set_due_date",
    description:
      "Set or clear this todo's due date. Pass an ISO 8601 date/time, or null to clear it.",
    input: v.object({
      dueDate: v.nullable(v.pipe(v.string(), v.isoTimestamp())),
    }),
    run: async ({ data }: { data: { dueDate: string | null } }) => {
      const todo = await callInternalAgentRoute(
        `/internal/agent/todos/${todoId}/update`,
        { userId, dueDate: data.dueDate },
      );
      return todo.dueDate
        ? `Due date set to ${todo.dueDate}.`
        : "Due date cleared.";
    },
  };
}

export function addSubtaskTool({ todoId, userId }: ToolContext) {
  return {
    name: "add_subtask",
    description: "Add a subtask under this todo.",
    input: v.object({
      title: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
    }),
    run: async ({ data }: { data: { title: string } }) => {
      const subtask = await callInternalAgentRoute(
        `/internal/agent/todos/${todoId}/subtasks`,
        { userId, title: data.title },
      );
      return `Added subtask "${subtask.title}".`;
    },
  };
}

export function completeTodoTool({ todoId, userId }: ToolContext) {
  return {
    name: "complete_todo",
    description: "Mark this todo (and any of its subtasks) as done.",
    run: async () => {
      await callInternalAgentRoute(`/internal/agent/todos/${todoId}/complete`, {
        userId,
      });
      return "Marked complete.";
    },
  };
}
