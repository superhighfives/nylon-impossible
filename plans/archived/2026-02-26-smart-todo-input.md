# Plan: Centralise AI in the API with Smart Todo Input

## Context

AI-powered todo extraction currently lives in the web app (`src/web/src/server/ai.ts`) as a TanStack server function. It uses the OpenAI SDK pointed at Cloudflare AI Gateway, with secrets (`CF_ACCOUNT_ID`, `CF_API_TOKEN`, `AI_GATEWAY_NAME`) stored on the web worker. There's a separate "Extract with AI" button and a multi-step preview flow — users have to explicitly choose between "Add" (single todo) and "Extract with AI" (multiple), then confirm extracted items before creation.

This means:
- iOS has no access to AI extraction at all
- Web users have to make a conscious decision about whether to use AI
- Two separate paths for creating todos (direct vs AI-extracted)

### Goal

One text area. Press enter. It just works — whether you typed "Buy milk" or "Need to buy milk, email the team about Friday's meeting, and book flights for next week." The AI lives in the API so both web and iOS get the same behaviour.

## Architecture

**Approach: "Smart create" endpoint** — the API decides whether AI extraction is needed.

```
User presses enter
        │
        ▼
POST /todos/smart  { text: "..." }
        │
        ▼
  ┌─ Heuristic: multiple items? ─┐
  │                               │
  No                             Yes
  │                               │
  ▼                               ▼
Create single todo          Workers AI extracts
directly (fast, ~50ms)      structured todos (~1-3s)
  │                               │
  │                          Create all extracted
  │                          todos in batch
  │                               │
  ▼                               ▼
Return { todos: [created] }
```

### Why a heuristic fast-path?

Most todo input is simple: "Buy milk", "Call dentist". Sending every keystroke-enter through AI adds 1-3s of latency for no benefit. The heuristic catches the obvious single-item cases and creates them instantly. Anything that looks like it _might_ contain multiple items goes through AI — better to let the model decide than to miss something.

### Heuristic for multi-item detection

A text is routed to AI if **any** of:
- Contains a newline character
- Contains a comma followed by a space and a verb-like word (rough: `, [a-z]`)
- Contains " and " joining what look like separate clauses
- Contains list-like patterns (numbered: `1.`, `2.` / bulleted: `- `, `* `)
- Is longer than ~120 characters (long text is more likely to be multi-item)
- Mentions relative dates ("tomorrow", "by Friday", "next week", "due") — AI is needed to resolve these to actual dates anyway

Single items that mention dates (e.g. "Book flights by Friday") still go through AI so the date gets parsed.

### Workers AI binding vs AI Gateway

Currently the web worker uses AI Gateway via the OpenAI SDK (`gateway.ai.cloudflare.com/v1/.../compat`). For the API worker, two options:

**Option A: Workers AI binding** (`env.AI`)
- Add `[ai]` section to `wrangler.jsonc` — no secrets needed
- Direct binding is faster (no external HTTP round-trip)
- Call: `env.AI.run(model, { messages, tools })`
- Loses AI Gateway observability/caching dashboard

**Option B: AI Gateway from API** (same approach as web)
- Move `CF_ACCOUNT_ID`, `CF_API_TOKEN`, `AI_GATEWAY_NAME` secrets to API worker
- Keep OpenAI SDK approach
- Retains AI Gateway dashboard, caching, rate limiting

**Recommendation: Option A (Workers AI binding)** — simpler, faster, fewer secrets to manage. Observability is already covered by the worker's `"observability": { "enabled": true }`. If AI Gateway features are needed later, it can be added as a [gateway configuration](https://developers.cloudflare.com/ai-gateway/providers/workersai/) on the binding.

## File Changes

### 1. Modify: `src/api/wrangler.jsonc`

Add Workers AI binding:
```jsonc
{
  "ai": {
    "binding": "AI"
  }
}
```

### 2. Modify: `src/api/src/types.ts`

Add AI binding to `Env`:
```typescript
export interface Env {
  DB: D1Database;
  USER_SYNC: DurableObjectNamespace;
  AI: Ai;  // Workers AI binding
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
}
```

### 3. New: `src/api/src/lib/ai.ts`

AI extraction logic (moved from web, adapted for Workers AI binding):
- `extractTodos(ai: Ai, text: string)` — calls Workers AI with tool-calling prompt
- System prompt with today's date for relative date parsing
- Tool definition for `extract_todos` (same schema as current)
- Returns `Array<{ title: string; dueDate: string | null }>`

### 4. New: `src/api/src/lib/smart-input.ts`

Heuristic detection:
- `shouldUseAI(text: string): boolean` — runs the heuristic checks listed above
- Exported and unit-testable

### 5. New: `src/api/src/handlers/smart-create.ts`

The `POST /todos/smart` handler:
```typescript
async function smartCreate(req: AuthenticatedRequest, env: Env) {
  const { text } = await req.json();
  // Validate: non-empty, max 10,000 chars

  if (shouldUseAI(text)) {
    // AI path: extract todos, create each with position
    const extracted = await extractTodos(env.AI, text);
    const created = await createTodosInBatch(env.DB, req.userId, extracted);
    // Notify WebSocket
    return json({ todos: created, ai: true });
  } else {
    // Fast path: create single todo directly
    const todo = await createSingleTodo(env.DB, req.userId, text.trim());
    // Notify WebSocket
    return json({ todos: [todo], ai: false });
  }
}
```

Response includes `ai: boolean` so clients can optionally show feedback (e.g. a subtle "AI extracted 3 items" message).

### 6. Modify: `src/api/src/index.ts`

Add route:
```typescript
if (path === "/todos/smart" && method === "POST") {
  return smartCreate(req, env);
}
```

### 7. Modify: `src/web/src/hooks/useTodos.ts`

- Add `useSmartCreate()` mutation that calls the API's `POST /todos/smart` endpoint
- This replaces both `useCreateTodo()` and `useCreateTodosBatch()` for the input flow
- On success: invalidate queries, notify WebSocket
- Keep `useCreateTodo()` and `useUpdateTodo()` etc. — they're still used for individual operations (inline edit, reorder, etc.)

### 8. Modify: `src/web/src/components/TodoInput.tsx`

Simplify dramatically:
- Single text area, single enter-to-submit
- Remove "Extract with AI" button
- Remove mode state machine (`input` | `extracting` | `preview`)
- Remove `TodoPreview` integration
- Call `useSmartCreate()` on submit
- Show loading state while AI processes (for multi-item inputs)
- Optionally show brief confirmation: "Added 3 items" when AI extracts multiple

```tsx
export function TodoInput() {
  const [text, setText] = useState("");
  const smartCreate = useSmartCreate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    smartCreate.mutate(text.trim(), {
      onSuccess: (result) => {
        setText("");
        // Optionally flash "Added N items" if result.todos.length > 1
      },
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <InputArea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What needs to be done?"
        disabled={smartCreate.isPending}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
          }
        }}
      />
    </form>
  );
}
```

### 9. Modify: `src/ios/.../Views/Components/AddTaskInputView.swift`

No visual changes needed — it already has a single text field and submit button. The ViewModel/service layer needs updating.

### 10. Modify: `src/ios/.../Services/APIService.swift`

Add method:
```swift
func smartCreate(text: String) async throws -> SmartCreateResponse {
    // POST /todos/smart { text: "..." }
    // Returns { todos: [APITodo], ai: Bool }
}
```

### 11. Modify: `src/ios/.../ViewModels/TodoViewModel.swift`

Update `addTodo()` to call `apiService.smartCreate(text:)` instead of `apiService.createTodo(id:title:)`. Handle the response (may return multiple todos).

### 12. Delete or deprecate web AI files

Once migrated:
- Remove `src/web/src/server/ai.ts`
- Remove `src/web/src/lib/ai-types.ts` (move relevant types to API if needed)
- Remove `src/web/src/components/TodoPreview.tsx`
- Remove `useExtractTodos()` and `useCreateTodosBatch()` from `useTodos.ts`
- Remove AI Gateway secrets from web worker (`CF_ACCOUNT_ID`, `CF_API_TOKEN`, `AI_GATEWAY_NAME`)
- Remove `AI_MODEL` var from `src/web/wrangler.jsonc`

## API Contract

### `POST /todos/smart`

**Request:**
```json
{
  "text": "Buy milk, email team about Friday meeting, book flights for next week"
}
```

**Response (AI path):**
```json
{
  "todos": [
    { "id": "uuid-1", "title": "Buy milk", "dueDate": null, "completed": false, "position": "a0", "createdAt": "...", "updatedAt": "..." },
    { "id": "uuid-2", "title": "Email team about Friday meeting", "dueDate": "2026-02-27", "completed": false, "position": "a1", "createdAt": "...", "updatedAt": "..." },
    { "id": "uuid-3", "title": "Book flights", "dueDate": "2026-03-05", "completed": false, "position": "a2", "createdAt": "...", "updatedAt": "..." }
  ],
  "ai": true
}
```

**Response (fast path):**
```json
{
  "todos": [
    { "id": "uuid-1", "title": "Buy milk", "completed": false, "position": "a0", "createdAt": "...", "updatedAt": "..." }
  ],
  "ai": false
}
```

**Errors:**
- `400` — empty text or exceeds 10,000 characters
- `401` — unauthenticated
- `429` — rate limited (AI path)
- `500` — AI extraction failed (falls back to creating as single todo with original text)

### Fallback behaviour

If AI extraction fails (model error, timeout, etc.), the API should **not** return an error to the user. Instead, fall back to creating a single todo with the original text. The user typed something and pressed enter — they should always get at least one todo out of it. Log the AI error for debugging.

## Verification

1. **Fast path**: Type "Buy milk", press enter → todo created instantly, `ai: false` in response
2. **AI path**: Type "Buy milk, email team, book flights for Friday" → 3 todos created with appropriate dates, `ai: true`
3. **Date parsing**: Type "Call dentist tomorrow" → single todo with tomorrow's date
4. **Fallback**: Simulate AI failure → single todo created with original text
5. **iOS**: Same text inputs through iOS app, verify same behaviour
6. **Cross-device sync**: Create via smart input on web → appears on iOS via WebSocket/sync
7. **Web cleanup**: Verify no references to old AI server function or preview components remain

## Out of Scope

- Editing existing todos with AI (e.g. "postpone this to next week")
- AI-powered categorisation or priority setting
- Streaming/real-time extraction feedback
- User-configurable AI behaviour (always on/off toggle)
- Undo for batch-created todos (could be a future enhancement)
