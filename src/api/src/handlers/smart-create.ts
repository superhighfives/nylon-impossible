import type { Context } from "hono";
import { z } from "zod/v4";
import { createSmartTodo } from "../lib/create-todo";
import { getDb } from "../lib/db";
import { apiError, apiValidationError, readJsonBody } from "../lib/errors";
import type { Env } from "../types";

const smartCreateSchema = z.object({
  text: z.string().min(1, "Text is required").max(10000, "Text is too long"),
  // AI is opt-in per request. `enrich` runs the enrichment model (which may in
  // turn detect and run research); `research` runs research directly. Both
  // require the `aiEnabled` master switch server-side, regardless of the client.
  enrich: z.boolean().optional(),
  research: z.boolean().optional(),
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

  const { todo, ai } = await createSmartTodo(
    getDb(c.env.DB),
    c.env,
    c.get("userId"),
    text,
    {
      aiEnabled: c.get("aiEnabled"),
      enrich: parsed.data.enrich,
      research: parsed.data.research,
      waitUntil: (p) => c.executionCtx.waitUntil(p),
    },
  );

  return c.json({ todos: [todo], ai });
}
