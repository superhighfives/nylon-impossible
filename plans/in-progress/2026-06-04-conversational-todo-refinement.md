# Conversational Todo Refinement

**Date**: 2026-06-04
**Status**: In progress
**Scope**: API + Web + iOS

## Phase 0 outcome (2026-06-05): Fall back — do NOT adopt Flue

Spiked `@flue/runtime@0.9.2` in `src/api/` (throwaway, since deleted). Findings:

- **Dependency weight.** Installing it pulled in **275 transitive packages**,
  including native modules (`node-liblzma` requiring `node-gyp`, which failed to
  build; `@mongodb-js/zstd`) plus Node-server-only deps (`@hono/node-server`,
  `ws`, `@google/genai`, `protobufjs`). A throwaway worker that merely *references*
  an agent bundled to **8.8 MB (1.2 MB gzip)** — versus the current lean worker.
- **No clean stateless run path.** `createAgent()` returns only an initializer
  (`{ __flueCreatedAgent, initialize }`); it is not directly runnable. Getting a
  typed result requires `FlueSession.prompt(text, { result: schema })`, and a
  session is created via `handleAgentRequest`/`DirectAgent`, whose `createContext`
  on Cloudflare wires **DO env + DO SQLite session store + CF sandbox**
  (`cfSandboxToSessionEnv`). The `./cloudflare` export is built around Durable
  Objects and R2 (`getDurableObjectIdentity`, `hydrateFromBucket`, `store`,
  WebSocket sessions). `dispatch()` is fire-and-forget (returns a receipt), not a
  synchronous typed result. Running it truly statelessly means hand-rolling a
  custom `SessionStore`, `sandbox: false`, and manual context — reimplementing
  the platform glue Flue exists to provide. That is exactly the "fights the
  existing architecture" case the gate warned about.

**Decision.** Keep the existing `src/api/src/lib/ai.ts` structure (hand-written
JSON-Schema tool definitions + Workers AI tool calls via the AI Gateway). We do
**not** adopt Flue, and we do **not** introduce Valibot — the codebase is Zod v4
throughout, and `ai.ts`'s tool-call parsing is already well-tested. The system
prompt stays an inline function (it interpolates today's date). Downstream phases
are unchanged in shape, per the plan. The `ask_user` tool is added the same way
`enrich_todo` already is.

## Problem

The current todo creation flow is one-shot: user types a todo, it's created immediately, and AI enriches it silently in the background (title cleanup, URLs, due dates, optional research via `waitUntil` + the research queue). This works well for actionable todos like "Buy milk" or "Email Sarah about Q3 numbers", where there's nothing to clarify.

It falls down for genuinely ambiguous todos. "Book a flight" gives the model nothing useful to enrich — no destination, no date, no priority signal. The current pipeline either guesses (badly) or produces a near-empty enrichment. The user then has to either edit the todo manually or just live with a thin todo.

We want the agent to ask a single clarifying question when (and only when) a follow-up answer would meaningfully improve the enrichment. The user answers in the todo's detail view, the agent re-enriches using the conversation history, and the todo gets meaningfully better.

This is conservative by design — most todos still go through silently. The agent only interrupts when it has a real reason to.

## Solution

A lightweight conversation thread lives on each todo. The existing enrichment pipeline gains one extra tool (`ask_user`) that lets the agent post a question instead of (or in addition to) enriching. When the user replies, the pipeline re-runs with the full message history.

### Lifecycle

```
User types "Book a flight" → POST /todos/smart
  → Todo created instantly (existing flow)
  → waitUntil(enrichOrAskWithAI(todo))
       │
       ▼
  Agent decides via tool call:
    - enrich_todo(...)  → existing behaviour (title/urls/date/research)
    - ask_user(question) → insert assistant message, set needs_input=1
    - both                → enrich AND ask (partial info known)
       │
       ▼
  Sync broadcast → web + iOS see the question
```

When the user replies:

```
User opens todo → types "Lisbon next Friday" → POST /todos/:id/reply
  → Insert user message
  → Clear awaiting_reply on the previous assistant message
  → waitUntil(enrichOrAskWithAI(todo, conversationHistory))
       │
       ▼
  Agent runs again with full history
    - Usually enriches now (dates, research, etc)
    - May ask a single follow-up if still ambiguous (soft-discouraged in prompt)
    - May decide nothing more is needed
```

### Rules that keep this safe

1. **Max one open question at a time.** `needs_input` is binary — the agent can't queue up multiple unanswered questions.
2. **The agent is allowed to ask nothing.** The default is silence. The tool definition makes "ask" an explicit choice with a high bar.
3. **Soft escalation rule in the prompt.** "If you've already asked once and the user answered, strongly prefer enriching with what you have. Only ask again if something is still genuinely blocking action." No hard round cap — guidance, not a wall.
4. **Dismiss is always available.** The user can dismiss a question without answering. Message stays in history, `needs_input` clears.
5. **Completing a todo clears any open question** automatically.
6. **Research is conversation-aware.** Re-enrichment after a reply can trigger fresh research with a `searchQuery` informed by the full conversation, replacing any stale research from the initial creation.

### Conservative system prompt examples

- "Buy milk" → enrich only, no question
- "Book a flight" → ask ("Where to, and when?")
- "Plan birthday party" → ask ("Whose birthday, and any date in mind?")
- "Research dog breeds" → enrich + research, no question
- "Email Sarah about the Q3 numbers" → enrich only (specific enough)
- "Call mom" → enrich only (no ambiguity worth asking about)

## Implementation

The plan is broken into phases. Phase 0 is a decision gate. Phases 1–2 build the API and data model. Phases 3–4 build the web and iOS UI. Phase 5 covers tests. Land each phase as one or more PRs and move the plan to `plans/in-progress/` when work starts.

### Phase 0: Flue spike (decision gate, ~half day)

Before committing to Flue (`@flue/runtime`), verify the assumption that it can be used as a stateless agent SDK without adopting its Durable Object session model. The current pipeline doesn't need Flue's sessions — the conversation lives in D1 and rides the existing sync protocol.

**What to spike:**

- Add `@flue/runtime` to `src/api/` as a dev dependency
- Build a throwaway agent in `src/api/spike/` that:
  - Uses Workers AI binding (`env.AI`) as the model
  - Returns a typed result via Valibot (`v.object({...})`)
  - Loads a role from a `.md` file
  - Does NOT use `triggers = { webhook: true }` — call it directly from a Hono handler
  - Does NOT touch Durable Object bindings
- Confirm it runs in `wrangler dev` without Flue trying to wire up DO bindings or fail at startup

**Decision gate:**

- **If Flue works as a stateless SDK** → proceed with Phase 1+ using Flue for the agent runtime (typed outputs, markdown roles, model abstraction). Keep Hono as the HTTP layer.
- **If Flue requires DO sessions or other infrastructure** that fights the existing architecture → fall back to keeping the current `src/api/src/lib/ai.ts` structure but adopt Valibot for typed outputs and move system prompts to `.md` files imported as text (see "Conditional file changes" below).

Either outcome is fine. The downstream phases don't change shape — only the implementation details of the LLM call shift. The spike code is throwaway; delete it after the decision, and record the outcome inline in this plan under a "Phase 0 outcome" subheading when work moves to `plans/in-progress/`.

### Phase 1: Data model

#### New migration: `0009_add_todo_messages.sql`

Create `src/api/migrations/0009_add_todo_messages.sql`:

```sql
CREATE TABLE todo_messages (
  id TEXT PRIMARY KEY,
  todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('assistant', 'user')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  awaiting_reply INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_todo_messages_todo_id ON todo_messages(todo_id, created_at);

ALTER TABLE todos ADD COLUMN needs_input INTEGER NOT NULL DEFAULT 0;
```

Messages are immutable and append-only. `awaiting_reply` is only set on the most recent assistant message when a user reply is expected; it clears when the user replies or dismisses. `needs_input` on `todos` is the cheap signal the list view uses to render the "agent has a question" affordance without joining `todo_messages` on every render.

Apply locally with `pnpm db:migrate`. Regenerate via `pnpm db:generate` if you edit the Drizzle schema first (recommended).

#### Drizzle schema: `src/shared/src/schema.ts`

The Drizzle schema is shared across web and API via the `@nylon-impossible/shared` package — this is where the new table goes, not in `src/api/src/lib/db.ts` (which only re-exports).

Add the `needsInput` column to `todos`:

```ts
export const todos = sqliteTable(
  "todos",
  {
    // ...existing columns
    aiStatus: text("ai_status", {
      enum: ["pending", "processing", "complete", "failed"],
    }),
    needsInput: integer("needs_input", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  // ...indexes unchanged
);
```

Add the `todoMessages` table:

```ts
export const todoMessages = sqliteTable(
  "todo_messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    todoId: text("todo_id")
      .notNull()
      .references(() => todos.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["assistant", "user"] }).notNull(),
    content: text("content").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    awaitingReply: integer("awaiting_reply", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (table) => [
    index("idx_todo_messages_todo_id").on(table.todoId, table.createdAt),
  ],
);
```

Add to the `todosRelations` block:

```ts
export const todosRelations = relations(todos, ({ one, many }) => ({
  // ...existing
  messages: many(todoMessages),
}));

export const todoMessagesRelations = relations(todoMessages, ({ one }) => ({
  todo: one(todos, {
    fields: [todoMessages.todoId],
    references: [todos.id],
  }),
}));
```

Export types at the bottom:

```ts
export type TodoMessage = typeof todoMessages.$inferSelect;
export type NewTodoMessage = typeof todoMessages.$inferInsert;
```

Re-export from `src/api/src/lib/db.ts`:

```ts
export {
  // ...existing
  type TodoMessage,
  type NewTodoMessage,
  todoMessages,
} from "@nylon-impossible/shared/schema";
```

#### Sync protocol updates

The existing sync uses `todos.updatedAt` as the cursor and returns todos plus their `urls` and `research` (see `src/api/src/handlers/sync.ts`). Messages need the same treatment. **Critical rule: any insert into `todo_messages` MUST also bump the parent `todos.updatedAt` to the current time.** Otherwise the next sync from the client won't pick the new message up.

In `src/api/src/handlers/sync.ts`:

1. Import `todoMessages` and `TodoMessage` from `../lib/db`.
2. Add a `serializeMessage` helper:

   ```ts
   function serializeMessage(m: TodoMessage) {
     return {
       id: m.id.toLowerCase(),
       todoId: m.todoId.toLowerCase(),
       role: m.role,
       content: m.content,
       createdAt: m.createdAt.toISOString(),
       awaitingReply: m.awaitingReply,
     };
   }
   ```

3. Extend `serializeTodo` to take a `messages` parameter and include it in the output:

   ```ts
   function serializeTodo(
     todo: typeof todos.$inferSelect,
     urls: ReturnType<typeof serializeUrl>[] = [],
     research: TodoResearch | null = null,
     messages: ReturnType<typeof serializeMessage>[] = [],
   ) {
     return {
       // ...existing fields
       needsInput: todo.needsInput,
       messages,
       urls,
     };
   }
   ```

4. After fetching `serverTodos` and `allUrls`/`allResearch`, fetch messages in the same batch:

   ```ts
   const [allUrls, allResearch, allMessages] = await Promise.all([
     // ...existing two queries
     db
       .select()
       .from(todoMessages)
       .where(inArray(todoMessages.todoId, todoIds))
       .orderBy(asc(todoMessages.createdAt)),
   ]);
   ```

5. Group by todoId into `messagesByTodoId` (same pattern as `urlsByTodoId`) and pass to `serializeTodo`.

Messages are immutable, so the client never sends them in `changes`. Replies use the dedicated `POST /todos/:id/reply` endpoint instead — keeps the sync protocol simple.

### Phase 2: API

#### Step 2.1: Extend `TodoEnrichment` and add `ask_user` tool

In `src/api/src/lib/ai.ts`:

Extend the enrichment shape with an optional `question` field:

```ts
export interface TodoEnrichment {
  title: string;
  urls?: string[];
  dueDate?: string;
  priority?: "high" | "low";
  research?: {
    type: "general" | "location";
  };
  searchQuery?: string;
  question?: string; // Present if the agent decided to ask the user
}
```

Add the new tool definition:

```ts
export const askUserTool = {
  type: "function" as const,
  function: {
    name: "ask_user",
    description:
      "Ask the user ONE clarifying question. Only use when the todo is genuinely unactionable without more info and a short answer would meaningfully improve enrichment (destination, date, scope). Do NOT use for stylistic preferences, things you can reasonably assume, or already-actionable todos like 'Buy milk' or 'Email Sarah'.",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "A single, specific question under 80 characters.",
        },
      },
      required: ["question"],
    },
  },
};
```

Update the model call site to pass both tools (existing `enrichTodoTool` plus the new `askUserTool`). The tool-call parser needs to handle:

- Only `enrich_todo` called → as today
- Only `ask_user` called → populate `question`, no other fields
- Both called → merge into one `TodoEnrichment` with `question` plus the other fields

Update the system prompt to include the conservative examples (see "Conservative system prompt examples" above) and append:

> Call `ask_user` ONLY when the todo is genuinely unactionable without more info. Most todos should not trigger a question. If a conversation history is provided and you have already asked once, strongly prefer enriching with what you have — only ask again if something is genuinely still blocking action.

Update the `hasEnrichment` check (around `enrichTodo`'s return-decision logic) so a `question` alone also counts:

```ts
const hasEnrichment =
  (enrichment.urls && enrichment.urls.length > 0) ||
  enrichment.dueDate ||
  enrichment.priority ||
  enrichment.research ||
  enrichment.question;
```

`enrichTodo`'s signature gains an optional `history` parameter (newest-last array of `{ role, content }`). When present, it's formatted into the prompt as preceding conversation turns. Keep the function name `enrichTodo` — the rename to `enrichOrAsk` is unnecessary churn now that the behaviour is just "enrich with optional question".

#### Step 2.2: Rename and extend `ai-enrich.ts`

In `src/api/src/lib/ai-enrich.ts`, rename `enrichTodoWithAI` to `enrichOrAskWithAI` and extend its signature:

```ts
export async function enrichOrAskWithAI(
  db: ReturnType<typeof getDb>,
  ai: Ai,
  env: { /* ...existing */ },
  todoId: string,
  userId: string,
  originalText: string,
  userLocation?: string | null,
  history?: Array<{ role: "assistant" | "user"; content: string }>,
): Promise<void>
```

After the existing enrichment-writing logic, add a block that handles `enrichment.question`:

```ts
if (enrichment.question) {
  const now = new Date();

  // Enforce "max one open question at a time": clear awaiting_reply on any
  // existing open assistant messages before posting the new one. Guards
  // against concurrent/background runs leaving multiple awaiting messages.
  await db
    .update(todoMessages)
    .set({ awaitingReply: false })
    .where(
      and(
        eq(todoMessages.todoId, todoId),
        eq(todoMessages.awaitingReply, true),
      ),
    );

  await db.insert(todoMessages).values({
    id: crypto.randomUUID(),
    todoId,
    role: "assistant",
    content: enrichment.question,
    createdAt: now,
    awaitingReply: true,
  });

  // Bump the parent todo so the sync cursor picks the message up,
  // and flip needs_input so the list view shows the affordance.
  await db
    .update(todos)
    .set({ needsInput: true, updatedAt: now })
    .where(eq(todos.id, todoId));

  await notifySync(env, userId);
}
```

Conversation-aware research: when `history` is non-empty AND the enrichment includes a `research` block AND there's already a `todoResearch` row for this todo, compare the new `searchQuery` against the existing `searchQuery`. If they differ (case-insensitive, trimmed), delete the existing research and URLs and create a new research row + enqueue, mirroring the title-change behaviour already in `updateTodo` (`src/api/src/handlers/todos.ts:227-272`). If they match, skip.

Update `src/api/src/handlers/smart-create.ts` to call `enrichOrAskWithAI` instead of `enrichTodoWithAI`. No other changes there.

#### Step 2.3: New endpoint — `POST /todos/:id/reply`

Create `src/api/src/handlers/reply.ts`:

```ts
import type { Context } from "hono";
import { z } from "zod/v4";
import {
  and,
  asc,
  eq,
  getDb,
  todoMessages,
  todos,
  users,
} from "../lib/db";
import { enrichOrAskWithAI } from "../lib/ai-enrich";
import { apiError, apiValidationError, readJsonBody } from "../lib/errors";
import type { Env } from "../types";

const replySchema = z.object({
  content: z.string().min(1).max(2000),
});

export async function replyToTodo(c: Context<Env>) {
  const todoId = c.req.param("id")?.toLowerCase();
  if (!todoId) return apiError(c, "todo_id_required");

  const json = await readJsonBody(c);
  if (!json.ok) return json.response;
  const parsed = replySchema.safeParse(json.body);
  if (!parsed.success) return apiValidationError(c, parsed.error);

  const db = getDb(c.env.DB);
  const userId = c.get("userId");

  const [todo] = await db
    .select()
    .from(todos)
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));
  if (!todo) return apiError(c, "todo_not_found");

  const now = new Date();

  // Insert user message
  const messageId = crypto.randomUUID();
  await db.insert(todoMessages).values({
    id: messageId,
    todoId,
    role: "user",
    content: parsed.data.content,
    createdAt: now,
    awaitingReply: false,
  });

  // Clear awaiting_reply on any open assistant messages in one UPDATE.
  // `needs_input` already guarantees at most one is open, so this is both
  // simpler and more robust than a SELECT-then-UPDATE on the most recent.
  // (Same approach as the dismiss endpoint.)
  await db
    .update(todoMessages)
    .set({ awaitingReply: false })
    .where(
      and(
        eq(todoMessages.todoId, todoId),
        eq(todoMessages.awaitingReply, true),
      ),
    );

  // Clear needs_input on the todo, bump updatedAt for sync
  await db
    .update(todos)
    .set({ needsInput: false, updatedAt: now })
    .where(eq(todos.id, todoId));

  // Load full conversation history for re-enrichment
  const history = await db
    .select()
    .from(todoMessages)
    .where(eq(todoMessages.todoId, todoId))
    .orderBy(asc(todoMessages.createdAt));

  // Fetch user location for research bias
  const [user] = await db
    .select({ location: users.location })
    .from(users)
    .where(eq(users.id, userId));

  // Notify sync immediately so the user sees their message,
  // then run enrichment in the background
  await notifySync(c.env, userId);

  c.executionCtx.waitUntil(
    enrichOrAskWithAI(
      db,
      c.env.AI,
      c.env,
      todoId,
      userId,
      todo.title,
      user?.location ?? null,
      history.map((m) => ({ role: m.role, content: m.content })),
    ),
  );

  return c.json({ id: messageId.toLowerCase() }, 201);
}

async function notifySync(env: Env["Bindings"], userId: string) {
  try {
    const id = env.USER_SYNC.idFromName(userId);
    const stub = env.USER_SYNC.get(id);
    await stub.fetch(new Request("http://internal/notify", { method: "POST" }));
  } catch {
    // Non-critical
  }
}
```

#### Step 2.4: New endpoint — `DELETE /todos/:id/question`

Create `src/api/src/handlers/dismiss-question.ts`:

```ts
import type { Context } from "hono";
import { and, eq, getDb, todoMessages, todos } from "../lib/db";
import { apiError } from "../lib/errors";
import type { Env } from "../types";

export async function dismissQuestion(c: Context<Env>) {
  const todoId = c.req.param("id")?.toLowerCase();
  if (!todoId) return apiError(c, "todo_id_required");

  const db = getDb(c.env.DB);
  const userId = c.get("userId");

  const [todo] = await db
    .select()
    .from(todos)
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));
  if (!todo) return apiError(c, "todo_not_found");

  const now = new Date();

  // Clear awaiting_reply on any open assistant messages
  await db
    .update(todoMessages)
    .set({ awaitingReply: false })
    .where(
      and(
        eq(todoMessages.todoId, todoId),
        eq(todoMessages.awaitingReply, true),
      ),
    );

  // Clear needs_input and bump updatedAt
  await db
    .update(todos)
    .set({ needsInput: false, updatedAt: now })
    .where(eq(todos.id, todoId));

  // Notify sync
  try {
    const id = c.env.USER_SYNC.idFromName(userId);
    const stub = c.env.USER_SYNC.get(id);
    await stub.fetch(new Request("http://internal/notify", { method: "POST" }));
  } catch {
    // Non-critical
  }

  return c.json({ success: true });
}
```

Note: this uses `DELETE /todos/:id/question` (deletes the question) rather than `POST /todos/:id/dismiss-question` to match REST semantics with the existing `DELETE /todos/:id/research` (cancel research) pattern.

#### Step 2.5: Register routes in `src/api/src/index.ts`

Add the imports:

```ts
import { dismissQuestion } from "./handlers/dismiss-question";
import { replyToTodo } from "./handlers/reply";
```

Register after the existing research routes:

```ts
app.post("/todos/:id/reply", replyToTodo);
app.delete("/todos/:id/question", dismissQuestion);
```

#### Step 2.6: Auto-clear on completion

In `src/api/src/handlers/todos.ts`, update the `updateTodo` handler. When `completed` transitions from `false` to `true` (i.e. `parsed.data.completed === true && existing.completed === false`), include these in the same update transaction:

```ts
// In the existing updates object:
if (
  parsed.data.completed === true &&
  existing.completed === false &&
  existing.needsInput
) {
  updates.needsInput = false;
  // Also clear awaiting_reply on open messages — separate query since
  // it's a different table
  await db
    .update(todoMessages)
    .set({ awaitingReply: false })
    .where(
      and(
        eq(todoMessages.todoId, todoId),
        eq(todoMessages.awaitingReply, true),
      ),
    );
}
```

Import `todoMessages` at the top of the file.

The existing sync broadcast on todo update already covers this — no extra `notifySync` needed.

#### Step 2.7: Make sync return messages

Already covered in Phase 1's "Sync protocol updates" section above. Verify the implementation by running the existing sync integration tests after Phase 1+2 changes are in.

### Phase 3: Web UI

#### Step 3.1: Update shared types

In `src/web/src/types/database.ts` (or wherever `TodoWithUrls` is defined), add:

```ts
export interface TodoMessage {
  id: string;
  todoId: string;
  role: "assistant" | "user";
  content: string;
  createdAt: string; // ISO
  awaitingReply: boolean;
}

export interface TodoWithUrls {
  // ...existing
  needsInput: boolean;
  messages: TodoMessage[];
}
```

#### Step 3.2: Server functions

In `src/web/src/server/todos.ts`, add two new server functions following the existing Effect pattern (look at how `updateTodo` and `deleteTodo` are implemented in the same file):

- `replyToTodo({ todoId, content })` — POST to `${API_URL}/todos/:id/reply`, returns `{ id }`
- `dismissTodoQuestion({ todoId })` — DELETE to `${API_URL}/todos/:id/question`

Both must be guarded by Clerk auth (use the existing `getAuthHeaders` helper) and return Effect-typed results with tagged errors from `src/web/src/lib/errors.ts`. Reference `src/web/AGENTS.md` and `docs/EFFECT_README.md` if you need a refresher on the Effect patterns.

#### Step 3.3: React Query hooks

In `src/web/src/hooks/useTodos.ts`, add two new mutation hooks (each ~30 lines, mirrors the shape of existing `useUpdateTodo`):

```ts
export function useReplyToTodo() {
  const queryClient = useQueryClient();
  const { notifyChanged } = useWebSocketSync();

  return useMutation({
    mutationFn: (input: { todoId: string; content: string }) =>
      replyToTodo({ data: input }),
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
    onError: (error, _vars, context) => {
      if (context?.previousTodos) {
        queryClient.setQueryData(TODOS_QUERY_KEY, context.previousTodos);
      }
      toast.error(messageFromError(error));
      Sentry.captureException(error);
    },
    onSettled: () => {
      notifyChanged();
      queryClient.invalidateQueries({ queryKey: TODOS_QUERY_KEY });
    },
  });
}

export function useDismissTodoQuestion() {
  // Same shape, optimistically sets `needsInput = false`,
  // marks any awaiting_reply messages as awaitingReply = false
  // (no new message added)
}
```

#### Step 3.4: List view affordance

The todo row lives in `src/web/src/components/TodoList.tsx` (around line 141, where `aiStatus === "pending" || aiStatus === "processing"` is rendered). When `todo.needsInput === true`, render a small badge alongside that AI status indicator. Use the existing `@/components/ui` components — no new primitives.

Suggested treatment: a small chat-bubble icon button in `bg-yellow-base hover:bg-yellow-hover` with `text-yellow` (the repo's high-contrast yellow token — `text-yellow-12` does not exist), sized as `Button shape="circle" size="xs"`. Clicking it opens the existing todo detail popover (call the same handler the row uses for opening detail).

#### Step 3.5: `ConversationSection` component

Create `src/web/src/components/ConversationSection.tsx`:

```tsx
import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { useDismissTodoQuestion, useReplyToTodo } from "@/hooks/useTodos";
import type { TodoWithUrls } from "@/types/database";

interface Props {
  todo: TodoWithUrls;
}

export function ConversationSection({ todo }: Props) {
  const [draft, setDraft] = useState("");
  const reply = useReplyToTodo();
  const dismiss = useDismissTodoQuestion();

  if (todo.messages.length === 0) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    reply.mutate({ todoId: todo.id, content });
    setDraft("");
  };

  return (
    <div className="border-t border-gray-subtle pt-3 flex flex-col gap-2">
      {todo.messages.map((m) => (
        <div
          key={m.id}
          className={`text-sm ${m.role === "assistant" ? "text-gray" : "text-gray-muted pl-4"}`}
        >
          {/* Accessible role label instead of an emoji: visible icon is
              decorative (aria-hidden), screen readers get the real word. */}
          <span className="sr-only">
            {m.role === "assistant" ? "Assistant: " : "You: "}
          </span>
          {m.content}
        </div>
      ))}

      {todo.needsInput && (
        <form onSubmit={handleSubmit} className="flex gap-2 items-center mt-1">
          <Input
            inputSize="sm"
            placeholder="Reply..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={reply.isPending}
          />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={reply.isPending}
            disabled={!draft.trim()}
          >
            Send
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => dismiss.mutate({ todoId: todo.id })}
            disabled={dismiss.isPending}
          >
            Dismiss
          </Button>
        </form>
      )}
    </div>
  );
}
```

Note: only Radix color tokens (`text-gray`, `text-gray-muted`, `border-gray-subtle`) — never raw Tailwind colors. Imports go through `@/components/ui` barrel.

#### Step 3.6: Wire into the expanded todo view

The expanded todo view is `src/web/src/components/TodoItemExpanded.tsx`. Below the URL preview / `ResearchSection` block, render `<ConversationSection todo={todo} />`.

### Phase 4: iOS UI

#### Step 4.1: SwiftData models

The iOS data layer lives at `src/ios/Nylon Impossible/Nylon Impossible/Models/`. Models follow the pattern `TodoItem.swift` (the model) + `TodoItem+APIConversion.swift` (API conversion helpers). Match that.

Create `src/ios/Nylon Impossible/Nylon Impossible/Models/TodoMessage.swift`:

```swift
import Foundation
import SwiftData

@Model
final class TodoMessage {
    @Attribute(.unique) var id: UUID
    var todoId: UUID
    var role: String // "assistant" | "user"
    var content: String
    var createdAt: Date
    var awaitingReply: Bool
    var isSynced: Bool

    init(
        id: UUID = UUID(),
        todoId: UUID,
        role: String,
        content: String,
        createdAt: Date = Date(),
        awaitingReply: Bool = false,
        isSynced: Bool = false
    ) {
        self.id = id
        self.todoId = todoId
        self.role = role
        self.content = content
        self.createdAt = createdAt
        self.awaitingReply = awaitingReply
        self.isSynced = isSynced
    }
}
```

Create `src/ios/Nylon Impossible/Nylon Impossible/Models/TodoMessage+APIConversion.swift` matching the pattern in `TodoUrl+APIConversion.swift`. Should expose:

- `TodoMessage(fromAPI:)` initializer from the API DTO
- `var apiDTO: [String: Any]` for outgoing payloads (only used for replies, since assistant messages are server-generated)

Add `needsInput: Bool` to the existing `TodoItem` model:

```swift
var needsInput: Bool = false
```

Add a `@Relationship(deleteRule: .cascade) var messages: [TodoMessage] = []` to `TodoItem` mirroring how `urls` is set up.

Add a SwiftData schema migration to register the new model and column. Follow whatever pattern the existing migrations use (check the project for `ModelContainer` setup).

#### Step 4.2: Sync service updates

In `src/ios/Nylon Impossible/Nylon Impossible/Services/SyncService.swift`:

- Update the sync response decoder to include `messages: [TodoMessageDTO]` and `needsInput: Bool` per todo.
- After upserting a todo, upsert its messages by ID (insert new, update `awaitingReply` on existing). Messages are immutable except for `awaitingReply`, so the only mutation is the awaiting-reply flag flipping to false.
- Push side: do NOT include messages in the regular sync `changes` payload. Replies go through a dedicated endpoint.

#### Step 4.3: Reply and dismiss endpoints

Add two methods to whatever class talks to the API (probably `APIClient` or `SyncService`):

```swift
func replyToTodo(todoId: UUID, content: String) async throws -> UUID
func dismissTodoQuestion(todoId: UUID) async throws
```

Both attach the Clerk Bearer token and hit the new endpoints. Offline pattern: write the user `TodoMessage` to SwiftData with `isSynced = false`, set the parent `TodoItem.needsInput = false`, then attempt the API call. On success, mark `isSynced = true`. On failure, leave `isSynced = false` for the next sync cycle to retry.

For dismiss, just optimistically clear `needsInput` locally and retry the DELETE on next sync if it fails.

#### Step 4.4: Detail view

Edit `src/ios/Nylon Impossible/Nylon Impossible/Views/Components/TodoEditSheet.swift` (where the existing `ResearchSection` is rendered for a todo's expanded state). Add a `ConversationSection` view below `ResearchSection`:

```swift
struct ConversationSection: View {
    let todo: TodoItem
    @State private var draft: String = ""
    @State private var isSubmitting: Bool = false
    @Environment(\.modelContext) private var modelContext
    let syncService: SyncService

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(todo.messages.sorted(by: { $0.createdAt < $1.createdAt })) { message in
                HStack(alignment: .top) {
                    Text(message.role == "assistant" ? "🤖" : "👤")
                    Text(message.content)
                        .foregroundStyle(message.role == "assistant" ? .primary : .secondary)
                }
                .font(.subheadline)
            }

            if todo.needsInput {
                HStack {
                    TextField("Reply...", text: $draft)
                        .textFieldStyle(.roundedBorder)
                    Button("Send") {
                        Task { await submit() }
                    }
                    .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty || isSubmitting)
                    Button("Dismiss") {
                        Task { await dismiss() }
                    }
                }
            }
        }
        .padding(.top, 8)
    }

    private func submit() async { /* ... */ }
    private func dismiss() async { /* ... */ }
}
```

Use the existing styling conventions in the iOS app — don't introduce new design tokens.

#### Step 4.5: List view affordance

Edit `src/ios/Nylon Impossible/Nylon Impossible/Views/Components/TodoItemRow.swift`. When `todo.needsInput == true`, render a small SF Symbol (`message.fill` or similar) in the same trailing-edge area as the existing AI status indicator. Match whatever the existing AI status indicator does for size and color.

### Phase 5: Tests

The repo uses `@cloudflare/vitest-pool-workers` for API tests (real Workers runtime + local D1) and Vitest + Testing Library on web. iOS uses XCTest.

#### API tests

Add to `src/api/test/integration/` (look at existing files for patterns):

- `reply.test.ts`:
  - Unauthenticated reply → 401
  - Reply to nonexistent todo → 404
  - Reply to someone else's todo → 404
  - Valid reply inserts user message, clears `needs_input`, clears `awaitingReply` on previous assistant message, bumps `todos.updatedAt`
  - Reply with empty content → 400
- `dismiss-question.test.ts`:
  - Unauthenticated → 401
  - Nonexistent todo → 404
  - Dismiss clears `needs_input` and `awaitingReply`, bumps `updatedAt`, does NOT trigger enrichment
- `sync.test.ts` (extend existing):
  - Sync payload returns `messages` array on todos that have them
  - Sync payload includes `needsInput` boolean
  - Messages appear in correct chronological order
- `todos.test.ts` (extend existing):
  - Completing a todo with an open question clears `needs_input` and `awaitingReply`

Add to `src/api/test/unit/`:

- `ai.test.ts` (extend): with mocked AI binding, verify `enrichTodo` parses both tool calls, handles `ask_user` only, handles both. Use the existing mock patterns there.

Conservative-prompting tests are inherently flaky against a real LLM — skip end-to-end "does the agent ask for 'Book a flight'" tests. Instead, unit-test the parser with fixture tool-call responses.

#### Web tests

Add to `src/web/test/`:

- Reply mutation: optimistic update inserts user message and clears `needsInput` immediately, rolls back on error
- Dismiss mutation: clears `needsInput` optimistically, rolls back on error
- `ConversationSection` component renders messages in order, shows reply form only when `needsInput`, hides dismiss button when no open question

#### iOS tests

- SyncService correctly upserts incoming messages and updates `awaitingReply`
- Offline reply: writes message locally with `isSynced = false`, syncs on next opportunity
- Dismiss: optimistically clears `needsInput` locally

## Files to modify

### Schema (shared)

- `src/shared/src/schema.ts` — add `todoMessages` table, `needsInput` column, relations, types
- `src/api/src/lib/db.ts` — re-export new types

### API

- `src/api/migrations/0009_add_todo_messages.sql` — new migration
- `src/api/src/lib/ai.ts` — add `askUserTool`, expand `TodoEnrichment` with `question`, update system prompt, update tool-call parser
- `src/api/src/lib/ai-enrich.ts` — rename to `enrichOrAskWithAI`, accept `history`, write assistant message, set `needsInput`, conversation-aware research re-run
- `src/api/src/handlers/reply.ts` — new file
- `src/api/src/handlers/dismiss-question.ts` — new file
- `src/api/src/handlers/sync.ts` — include `messages` and `needsInput` in payload
- `src/api/src/handlers/todos.ts` — clear `needsInput` on completion
- `src/api/src/handlers/smart-create.ts` — call `enrichOrAskWithAI` instead of `enrichTodoWithAI`
- `src/api/src/index.ts` — register `POST /todos/:id/reply`, `DELETE /todos/:id/question`
- `src/api/test/integration/reply.test.ts` — new file
- `src/api/test/integration/dismiss-question.test.ts` — new file
- `src/api/test/integration/sync.test.ts` — extend
- `src/api/test/integration/todos.test.ts` — extend
- `src/api/test/unit/ai.test.ts` — extend

### Web

- `src/web/src/types/database.ts` — add `TodoMessage`, extend `TodoWithUrls`
- `src/web/src/server/todos.ts` — `replyToTodo`, `dismissTodoQuestion` server functions
- `src/web/src/hooks/useTodos.ts` — `useReplyToTodo`, `useDismissTodoQuestion` mutation hooks
- `src/web/src/components/ConversationSection.tsx` — new file
- `src/web/src/components/TodoList.tsx` — add `needsInput` affordance next to `aiStatus` indicator
- `src/web/src/components/TodoItemExpanded.tsx` — render `ConversationSection`
- `src/web/test/` — new test files

### iOS

- `src/ios/Nylon Impossible/Nylon Impossible/Models/TodoMessage.swift` — new model
- `src/ios/Nylon Impossible/Nylon Impossible/Models/TodoMessage+APIConversion.swift` — new conversion helpers
- `src/ios/Nylon Impossible/Nylon Impossible/Models/TodoItem.swift` — add `needsInput`, `messages` relationship
- `src/ios/Nylon Impossible/Nylon Impossible/Services/SyncService.swift` — handle messages in sync
- `src/ios/Nylon Impossible/Nylon Impossible/Views/Components/TodoEditSheet.swift` — render `ConversationSection`
- `src/ios/Nylon Impossible/Nylon Impossible/Views/Components/TodoItemRow.swift` — add needs-input affordance
- `src/ios/Nylon Impossible/Nylon Impossible/Views/Components/ConversationSection.swift` — new file

### Conditional (Phase 0 outcome)

- If adopting Flue: `src/api/package.json`, `.flue/roles/todo-enricher.md`, optionally `.flue/agents/skills/research/SKILL.md`
- If not: keep prompt strings in `ai.ts`, or extract to a `.md` file imported via `wrangler.jsonc`'s `rules` (`{ "type": "Text", "globs": ["**/*.md"] }`)

## Key considerations

- **Conversation history is the session.** No Durable Object needed for the conversation itself — it lives in D1 and syncs via the existing protocol. iOS gets it for free.
- **Bump `todos.updatedAt` on every message insert.** Sync uses that as the cursor. Forgetting this means new messages won't sync.
- **No hard round cap.** Soft prompt guidance ("if you've already asked once, strongly prefer enriching") replaces the round limit. If models loop in testing, add a server-side guardrail then.
- **Conservative by default.** If the agent ends up asking questions too often during testing, dial the system prompt down further or add server-side heuristics (e.g. minimum input length before asking is allowed).
- **Research re-runs cost money.** Each reply that produces a meaningfully different `searchQuery` triggers a fresh Tavily call. Exact-string comparison is the cheap version; add similarity heuristics later if needed.
- **No agent-initiated todos in this scope.** The agent can only refine the todo it was given. Splitting into subtasks, creating related todos, or cross-todo reasoning are out of scope.
- **Existing `aiStatus` keeps its meaning.** It tracks enrichment processing state. `needsInput` is a separate, orthogonal signal — they can both be set at once (enrichment in progress AND a question already posted).
- **Use `@/components/ui` and Radix color tokens** in web code. Never raw Tailwind colors. See `src/web/AGENTS.md`.
- **Web ships first within the same plan.** API and data model are shared; web UI lands before iOS within the same plan. If iOS work blocks, the web flow can ship independently behind a feature flag.

## Acceptance criteria

- [x] Phase 0 spike completed, Flue decision documented inline in this plan under "Phase 0 outcome"
- [ ] Migration `0010_add_todo_messages.sql` creates `todo_messages` table and `todos.needs_input` column; `pnpm db:migrate` succeeds locally
- [ ] Sync protocol returns `messages: [...]` and `needsInput: boolean` per todo
- [ ] Inserting a message bumps `todos.updatedAt` (verified via integration test)
- [ ] Ambiguous todos like "Book a flight" trigger one question; specific todos like "Buy milk" do not (verified by unit-testing tool-call parser with fixture responses)
- [ ] `POST /todos/:id/reply` inserts a user message, clears `needs_input`, clears `awaitingReply`, triggers re-enrichment via `waitUntil`
- [ ] `DELETE /todos/:id/question` clears `needs_input` and `awaitingReply` without triggering enrichment
- [ ] Completing a todo with an open question auto-clears `needs_input` and `awaitingReply`
- [ ] Re-enrichment after a reply triggers fresh research when the conversation produces a meaningfully different `searchQuery`, replacing any stale research
- [ ] Web list shows a question indicator when `needsInput` is true
- [ ] Web detail popover shows the conversation thread with reply and dismiss actions
- [ ] Web optimistic updates work for both reply (insert message, clear indicator) and dismiss (clear indicator), with rollback on error
- [ ] iOS list shows a question indicator when `needsInput` is true
- [ ] iOS detail view shows the conversation thread with reply and dismiss actions
- [ ] Offline iOS reply queues with `isSynced = false` and syncs on reconnection
- [x] All existing AI behaviour (URL extraction, date parsing, research) continues to work unchanged for non-ambiguous todos (regression-checked via existing tests)
- [x] `pnpm check && pnpm typecheck && pnpm test` passes from repo root
- [x] `swiftlint` passes in `src/ios/Nylon Impossible/` (12 warnings, 0 serious — pre-existing file-length / implicit-optional warnings outside this change's scope)

## Out of scope

- Cross-todo agent memory or context
- Agent-initiated todo creation, splitting, or subtasks
- Voice replies on iOS
- Agent-suggested completion or follow-ups after the todo is enriched
- Replacing Tavily / research provider
- AI Gateway routing changes
- Server-side round cap on questions (revisit if testing shows the agent loops)

## Dependencies

- Related to: `plans/done/2026-03-25-ai-features.md` (post-creation AI processing)
- Related to: `plans/done/2026-03-13-research-agent.md` (research pipeline this extends)
- Related to: `plans/done/2026-02-26-smart-todo-input.md` (the `/todos/smart` endpoint this builds on)
