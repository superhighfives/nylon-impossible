import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod/v4";
import { createSmartTodo, InvalidParentTodoError } from "../lib/create-todo";
import { getDb } from "../lib/db";
import { apiError, apiValidationError, readJsonBody } from "../lib/errors";
import { setTodoCompleted, updateTodoCore } from "../lib/todos-core";
import type { Env } from "../types";

// Mounted at /internal/agent/*, meant to be reachable only via the Service
// Binding from src/todo-agent. Important deviation from the plan this
// implements: a Cloudflare custom domain (this Worker has one,
// api.nylonimpossible.com) routes every path on the Worker, not just ones a
// route table opts in — there's no such thing as "unreachable except
// Worker-to-Worker" purely from omitting a route. A Service Binding call
// also isn't otherwise distinguishable from a public request. So this group
// gets its own bearer-secret check, same shape as the Gmail add-on's
// non-Clerk auth. `userId` comes from the request body: the todo-agent
// Worker gets it once, at dispatch time, from src/api's own authenticated
// `POST /todos/:id/agent/message`, records it as the agent instance's
// `initialData`, and its tools pass it back on every call. Handlers still
// scope every query by `userId` on top of that — a leaked/forged secret
// alone still can't cross user boundaries without also guessing a userId.
export const internalAgentAuthMiddleware = createMiddleware<Env>(
  async (c, next) => {
    const expected = c.env.INTERNAL_AGENT_SECRET;
    const header = c.req.header("Authorization");
    if (!expected || header !== `Bearer ${expected}`) {
      return apiError(c, "unauthorized");
    }
    await next();
  },
);

const recurrenceSchema = z.object({
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
});

const updateSchema = z.object({
  userId: z.string().min(1),
  title: z.string().min(1).max(500).optional(),
  notes: z.string().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  recurrence: recurrenceSchema.nullable().optional(),
  sticky: z.boolean().optional(),
});

// POST /internal/agent/todos/:id/update — thin wrapper over updateTodoCore,
// used by the todo-agent's `updateTodo` and `setDueDate` tools.
export async function agentUpdateTodo(c: Context<Env>) {
  const todoId = c.req.param("id");
  if (!todoId) return apiError(c, "todo_id_required");

  const json = await readJsonBody(c);
  if (!json.ok) return json.response;
  const parsed = updateSchema.safeParse(json.body);
  if (!parsed.success) return apiValidationError(c, parsed.error);

  const { userId, ...patch } = parsed.data;
  const db = getDb(c.env.DB);

  const updated = await updateTodoCore(db, c.env, userId, todoId, patch);
  if (!updated) return apiError(c, "todo_not_found");

  return c.json({ todo: updated });
}

const completeSchema = z.object({
  userId: z.string().min(1),
});

// POST /internal/agent/todos/:id/complete — thin wrapper over
// setTodoCompleted, used by the todo-agent's `completeTodo` tool. Always
// completes (never uncompletes) — the tool only ever means "mark this done".
export async function agentCompleteTodo(c: Context<Env>) {
  const todoId = c.req.param("id");
  if (!todoId) return apiError(c, "todo_id_required");

  const json = await readJsonBody(c);
  if (!json.ok) return json.response;
  const parsed = completeSchema.safeParse(json.body);
  if (!parsed.success) return apiValidationError(c, parsed.error);

  const db = getDb(c.env.DB);
  const updated = await setTodoCompleted(
    db,
    c.env,
    parsed.data.userId,
    todoId,
    true,
  );
  if (!updated) return apiError(c, "todo_not_found");

  return c.json({ todo: updated });
}

const addSubtaskSchema = z.object({
  userId: z.string().min(1),
  title: z.string().min(1).max(500),
});

// POST /internal/agent/todos/:id/subtasks — thin wrapper over
// createSmartTodo with parentId set, used by the todo-agent's `addSubtask`
// tool. No AI enrichment/research here — the agent conversation already did
// the "smart" part; this just files the plain subtask.
export async function agentAddSubtask(c: Context<Env>) {
  const parentId = c.req.param("id");
  if (!parentId) return apiError(c, "todo_id_required");

  const json = await readJsonBody(c);
  if (!json.ok) return json.response;
  const parsed = addSubtaskSchema.safeParse(json.body);
  if (!parsed.success) return apiValidationError(c, parsed.error);

  const db = getDb(c.env.DB);

  try {
    const { todo } = await createSmartTodo(
      db,
      c.env,
      parsed.data.userId,
      parsed.data.title,
      {
        aiEnabled: false,
        parentId,
        waitUntil: (p) => c.executionCtx.waitUntil(p),
      },
    );
    return c.json({ todo });
  } catch (error) {
    if (error instanceof InvalidParentTodoError) {
      return apiError(c, "invalid_parent_todo");
    }
    throw error;
  }
}
