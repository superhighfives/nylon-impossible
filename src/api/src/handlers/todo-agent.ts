import type { Context } from "hono";
import { z } from "zod/v4";
import { and, eq, getDb, todos } from "../lib/db";
import { apiError, apiValidationError, readJsonBody } from "../lib/errors";
import type { Env } from "../types";

/**
 * Confirm `todoId` exists and belongs to `userId`. Every route in this file
 * needs this before it's safe to talk to the todo-agent Worker — the
 * Service Binding forwards the request as-is, so this is the only place
 * ownership gets checked before a message reaches the agent (or its
 * conversation gets read back).
 */
async function requireOwnedTodo(
  c: Context<Env>,
  todoId: string,
  userId: string,
) {
  const db = getDb(c.env.DB);
  const [todo] = await db
    .select({ id: todos.id })
    .from(todos)
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));
  return todo ?? null;
}

const sendMessageSchema = z.object({
  message: z.string().min(1).max(4000),
});

// POST /todos/:id/agent/message — send a message to this todo's chat agent.
// Thin proxy over src/todo-agent's own createAgentRouter (`POST /:id`),
// reached via the TODO_AGENT Service Binding. userId rides as `initialData`
// so the agent instance's tools can act on the todo — see
// plans/in-progress/2026-07-17-flue-per-todo-agents.md for why that's the
// mechanism (Flue's own `useInitialData()`, not parsed out of the id).
export async function sendAgentMessage(c: Context<Env>) {
  const todoId = c.req.param("id");
  if (!todoId) return apiError(c, "todo_id_required");
  const userId = c.get("userId");

  const owned = await requireOwnedTodo(c, todoId, userId);
  if (!owned) return apiError(c, "todo_not_found");

  const json = await readJsonBody(c);
  if (!json.ok) return json.response;
  const parsed = sendMessageSchema.safeParse(json.body);
  if (!parsed.success) return apiValidationError(c, parsed.error);

  const res = await c.env.TODO_AGENT.fetch(`https://internal/${todoId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      // The HTTP layer of Flue's createAgentRouter wants the delivered
      // message FLAT at the top level — { kind, body, initialData? } — not
      // wrapped in a `message` key. Confirmed against a live todo-agent
      // Worker: `{ message: {...} }` 400s ("Delivered messages must be {
      // kind: 'user', body: string, ... }"), because the router peels off
      // only `initialData`/`uid`/`idempotencyKey` and treats everything
      // else as the message itself. This is different from the JS
      // dispatch() function's `{ id, message, initialData }` shape — easy
      // to get wrong by analogy.
      kind: "user",
      body: parsed.data.message,
      initialData: { userId },
    }),
  });

  return new Response(res.body, res);
}

// GET /todos/:id/agent/messages — read this todo's chat conversation.
// Streaming passthrough of src/todo-agent's `GET /:id` (an AI-SDK-style
// resumable data stream, per Flue's createAgentRouter) — forwards query
// params (offset, etc.) as-is so the client's own resume logic works
// unmodified.
export async function readAgentMessages(c: Context<Env>) {
  const todoId = c.req.param("id");
  if (!todoId) return apiError(c, "todo_id_required");
  const userId = c.get("userId");

  const owned = await requireOwnedTodo(c, todoId, userId);
  if (!owned) return apiError(c, "todo_not_found");

  const search = new URL(c.req.url).search;
  const res = await c.env.TODO_AGENT.fetch(
    `https://internal/${todoId}${search}`,
    { method: c.req.method },
  );

  return new Response(res.body, res);
}
