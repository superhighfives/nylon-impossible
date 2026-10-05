import type { Context } from "hono";
import { z } from "zod/v4";
import { createSmartTodo } from "../lib/create-todo";
import { getDb } from "../lib/db";
import { apiError, apiValidationError, readJsonBody } from "../lib/errors";
import { listIdSchema } from "../lib/list-id";
import { verifyListOwnership } from "../lib/lists";
import type { Env } from "../types";

const smartCreateSchema = z.object({
  text: z.string().min(1, "Text is required").max(10000, "Text is too long"),
  listId: listIdSchema.optional(),
});

// POST /todos/smart — thin wrapper over the shared createSmartTodo core so the
// REST endpoint and the Gmail add-on stay on the exact same create path.
export async function smartCreate(c: Context<Env>) {
  const json = await readJsonBody(c);
  if (!json.ok) return json.response;
  const parsed = smartCreateSchema.safeParse(json.body);

  if (!parsed.success) {
    return apiValidationError(c, parsed.error);
  }

  const text = parsed.data.text.trim();

  if (text.length === 0) {
    return apiError(c, "text_required");
  }

  const db = getDb(c.env.DB);
  const userId = c.get("userId");

  let listId: string | undefined;
  if (parsed.data.listId) {
    const verified = await verifyListOwnership(db, userId, parsed.data.listId);
    if (!verified) {
      return apiError(c, "list_not_found");
    }
    listId = verified;
  }

  const { todo } = await createSmartTodo(db, c.env, userId, text, {
    listId,
    waitUntil: (p) => c.executionCtx.waitUntil(p),
  });

  return c.json({ todos: [todo] });
}
