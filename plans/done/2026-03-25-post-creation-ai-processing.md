# Post-Creation AI Processing Implementation Plan

**Status:** Complete
**Completed:** 2026-03-27
**PR:** #94

## Overview

Moved AI processing to happen asynchronously after todo creation using `waitUntil`, making todo creation instant. AI now only extracts metadata (URLs, due dates, priority) without rephrasing titles.

## Architecture

- Todos created immediately with original text
- `aiStatus` column tracks processing state: `pending` → `processing` → `complete`/`failed`
- Background AI enrichment via `waitUntil`:
  - Extracts URLs/domains and removes them from title
  - Extracts due dates from natural language
  - Extracts priority if mentioned
- WebSocket notifies clients to sync when enrichment completes
- Web and iOS show subtle loading indicator during processing

**Tech Stack:** Hono, Cloudflare Workers (`waitUntil`), Drizzle ORM, Workers AI

---

## Original Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move AI processing to happen AFTER todo creation, making the fast path immediate and AI enrichment asynchronous.

**Architecture:** Create todo immediately with original text, then use `waitUntil` to process with AI in background. AI can update title, extract URLs, set due date. Remove the `shouldUseAI` heuristic - when AI is enabled, always process post-creation.

**Tech Stack:** Hono, Cloudflare Workers (`waitUntil`), Drizzle ORM, Workers AI

---

## Current State

The current flow in `src/api/src/handlers/smart-create.ts`:
1. Check if `aiEnabled && shouldUseAI(text)` 
2. If true: call AI synchronously, wait for response, create todo(s) from extracted data
3. If false: create single todo with original text immediately

Problems:
- AI extraction blocks the response (slow UX)
- `shouldUseAI` heuristic is fragile and misses cases
- Users see delay before todo appears

## Target State

New flow:
1. Always create todo immediately with original text (fast path)
2. If `aiEnabled`: use `waitUntil` to process in background
3. AI updates existing todo: title, dueDate, extracts URLs
4. WebSocket notifies clients to refresh

Key changes:
- Remove `shouldUseAI` heuristic entirely
- AI enriches existing todo rather than creating new ones
- No more multi-todo extraction (simplification)

---

## Task 1: Add AI Processing Status to Todos Table

**Files:**
- Create: `src/api/migrations/0003_add_ai_processing_status.sql`
- Modify: `src/shared/src/schema.ts:30-60`

- [ ] **Step 1: Create migration file**

```sql
-- Migration: Add AI processing status to todos
-- This tracks whether a todo is pending AI processing, currently being processed, or complete

ALTER TABLE todos ADD COLUMN ai_status TEXT DEFAULT NULL;
-- Values: NULL (not applicable), 'pending', 'processing', 'complete', 'failed'
```

- [ ] **Step 2: Update Drizzle schema**

In `src/shared/src/schema.ts`, add the `aiStatus` column to the `todos` table:

```typescript
export const todos = sqliteTable("todos", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  position: text("position").notNull(),
  dueDate: integer("due_date", { mode: "timestamp" }),
  priority: text("priority", { enum: ["low", "medium", "high"] }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  aiStatus: text("ai_status", {
    enum: ["pending", "processing", "complete", "failed"],
  }),
});
```

- [ ] **Step 3: Apply migration locally**

Run: `pnpm db:migrate`
Expected: Migration 0003 applied successfully

- [ ] **Step 4: Commit**

```bash
git add src/api/migrations/0003_add_ai_processing_status.sql src/shared/src/schema.ts
git commit -m "add ai_status column to todos table"
```

---

## Task 2: Create AI Enrichment Function

**Files:**
- Create: `src/api/src/lib/ai-enrich.ts`
- Modify: `src/api/src/lib/ai.ts:176-231` (update function signature)

- [ ] **Step 1: Create the AI enrichment module**

Create `src/api/src/lib/ai-enrich.ts`:

```typescript
/**
 * Background AI enrichment for todos
 *
 * Takes an existing todo and enriches it with AI-extracted data:
 * - Cleaner title (action-oriented)
 * - Extracted URLs
 * - Due date from natural language
 */

import { generateNKeysBetween } from "fractional-indexing";
import { eq, getDb, todos, todoUrls } from "./db";
import { extractTodos } from "./ai";
import { fetchUrlMetadata } from "./url-metadata";
import { truncateTitle } from "./url-helpers";

interface EnrichmentResult {
  title?: string;
  urls?: string[];
  dueDate?: string;
}

/**
 * Enrich a todo with AI-extracted data in the background.
 * Updates the todo in place and notifies connected clients.
 */
export async function enrichTodoWithAI(
  db: ReturnType<typeof getDb>,
  ai: Ai,
  env: { USER_SYNC: DurableObjectNamespace },
  todoId: string,
  userId: string,
  originalText: string,
): Promise<void> {
  const now = new Date();

  // Mark as processing
  await db
    .update(todos)
    .set({ aiStatus: "processing", updatedAt: now })
    .where(eq(todos.id, todoId));

  try {
    const extracted = await extractTodos(ai, originalText);

    // If AI returned nothing useful, mark complete and exit
    if (!extracted || extracted.length === 0) {
      await db
        .update(todos)
        .set({ aiStatus: "complete", updatedAt: new Date() })
        .where(eq(todos.id, todoId));
      return;
    }

    // Use the first extracted item (we no longer support multi-todo extraction)
    const enrichment = extracted[0];
    const updates: Partial<typeof todos.$inferSelect> = {
      aiStatus: "complete",
      updatedAt: new Date(),
    };

    // Update title if AI provided a cleaner one
    if (enrichment.title && enrichment.title !== originalText) {
      updates.title = truncateTitle(enrichment.title);
    }

    // Update due date if extracted
    if (enrichment.dueDate) {
      updates.dueDate = new Date(enrichment.dueDate);
    }

    await db.update(todos).set(updates).where(eq(todos.id, todoId));

    // Handle URLs if extracted
    if (enrichment.urls && enrichment.urls.length > 0) {
      await insertAndFetchUrls(db, todoId, enrichment.urls, env, userId);
    }

    // Notify clients to refresh
    await notifySync(env, userId);
  } catch (error) {
    console.error("AI enrichment failed for todo:", todoId, error);
    await db
      .update(todos)
      .set({ aiStatus: "failed", updatedAt: new Date() })
      .where(eq(todos.id, todoId));

    // Still notify so UI can show the failed state
    await notifySync(env, userId);
  }
}

/**
 * Insert URL records and fetch metadata in background
 */
async function insertAndFetchUrls(
  db: ReturnType<typeof getDb>,
  todoId: string,
  urls: string[],
  env: { USER_SYNC: DurableObjectNamespace },
  userId: string,
): Promise<void> {
  const now = new Date();
  const urlPositions = generateNKeysBetween(null, null, urls.length);

  const urlRecords = urls.map((url, i) => ({
    id: crypto.randomUUID(),
    todoId,
    url,
    position: urlPositions[i],
    fetchStatus: "pending" as const,
    createdAt: now,
    updatedAt: now,
  }));

  await db.insert(todoUrls).values(urlRecords);

  // Fetch metadata for each URL
  await Promise.allSettled(
    urlRecords.map(async (record) => {
      try {
        const metadata = await fetchUrlMetadata(record.url);
        await db
          .update(todoUrls)
          .set({
            title: metadata.title,
            description: metadata.description,
            siteName: metadata.siteName,
            favicon: metadata.favicon,
            fetchStatus: "fetched" as const,
            fetchedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(todoUrls.id, record.id));
      } catch (error) {
        console.error(`Failed to fetch metadata for ${record.url}:`, error);
        await db
          .update(todoUrls)
          .set({
            fetchStatus: "failed" as const,
            updatedAt: new Date(),
          })
          .where(eq(todoUrls.id, record.id));
      }
    }),
  );
}

/**
 * Notify all connected WebSocket clients for this user to sync
 */
async function notifySync(
  env: { USER_SYNC: DurableObjectNamespace },
  userId: string,
): Promise<void> {
  try {
    const id = env.USER_SYNC.idFromName(userId);
    const stub = env.USER_SYNC.get(id);
    await stub.fetch(new Request("http://internal/notify", { method: "POST" }));
  } catch {
    // Non-critical - clients will sync on next poll
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/api/src/lib/ai-enrich.ts
git commit -m "add AI enrichment module for background processing"
```

---

## Task 3: Refactor Smart Create Handler

**Files:**
- Modify: `src/api/src/handlers/smart-create.ts`
- Delete reference: `src/api/src/lib/smart-input.ts` (no longer imported)

- [ ] **Step 1: Rewrite smart-create.ts to use post-creation AI**

Replace the entire content of `src/api/src/handlers/smart-create.ts`:

```typescript
import { generateNKeysBetween } from "fractional-indexing";
import type { Context } from "hono";
import { z } from "zod/v4";
import { enrichTodoWithAI } from "../lib/ai-enrich";
import { eq, getDb, todos, todoUrls } from "../lib/db";
import {
  cleanUrlString,
  createFallbackFromUrl,
  truncateTitle,
} from "../lib/url-helpers";
import { fetchUrlMetadata } from "../lib/url-metadata";
import type { Env } from "../types";

const smartCreateSchema = z.object({
  text: z.string().min(1, "Text is required").max(10000, "Text is too long"),
});

function serializeTodo(todo: typeof todos.$inferSelect) {
  return {
    id: todo.id.toLowerCase(),
    userId: todo.userId,
    title: todo.title,
    description: todo.description,
    completed: todo.completed,
    position: todo.position,
    dueDate: todo.dueDate?.toISOString() ?? null,
    priority: todo.priority,
    aiStatus: todo.aiStatus,
    createdAt: todo.createdAt.toISOString(),
    updatedAt: todo.updatedAt.toISOString(),
  };
}

/** URL regex to extract URLs from text */
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

/** Common trailing punctuation that shouldn't be part of URLs */
const TRAILING_PUNCT = /[.,;:!?)]+$/;

/**
 * Create initial todo data from input text.
 * Handles URL-only input specially by extracting domain for title.
 */
function createInitialTodo(text: string): {
  title: string;
  urls?: string[];
} {
  // Check if input is primarily a URL (URL takes up >80% of the text)
  const urlMatch = text.match(URL_REGEX);
  if (urlMatch && urlMatch[0].length > text.length * 0.8) {
    const cleanedUrl = cleanUrlString(urlMatch[0]);
    const fallback = createFallbackFromUrl(cleanedUrl);
    if (fallback) {
      return { title: fallback.title, urls: [fallback.url] };
    }
  }

  // Extract any URLs from text
  const rawMatches = text.match(URL_REGEX) ?? [];
  const urls = rawMatches
    .map((url) => {
      const cleaned = url.replace(TRAILING_PUNCT, "");
      try {
        const parsed = new URL(cleaned);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          return parsed.href;
        }
      } catch {
        // Invalid URL, skip
      }
      return null;
    })
    .filter((url): url is string => url !== null);

  return {
    title: truncateTitle(text),
    urls: urls.length > 0 ? urls : undefined,
  };
}

// POST /todos/smart
export async function smartCreate(c: Context<Env>) {
  const body = await c.req.json();
  const parsed = smartCreateSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.message }, 400);
  }

  const text = parsed.data.text.trim();

  if (text.length === 0) {
    return c.json({ error: "Text is required" }, 400);
  }

  const db = getDb(c.env.DB);
  const userId = c.get("userId");
  const aiEnabled = c.get("aiEnabled");

  // Get the lowest position so new todo is prepended at the start
  const firstTodo = await db
    .select({ position: todos.position })
    .from(todos)
    .where(eq(todos.userId, userId))
    .orderBy(todos.position)
    .limit(1)
    .then((rows) => rows[0]);

  const position = generateNKeysBetween(null, firstTodo?.position ?? null, 1)[0];
  const now = new Date();

  // Create initial todo data
  const initial = createInitialTodo(text);
  const todoId = crypto.randomUUID();

  // Insert todo immediately - this is the fast path
  await db.insert(todos).values({
    id: todoId,
    userId,
    title: initial.title,
    completed: false,
    position,
    aiStatus: aiEnabled ? "pending" : null,
    createdAt: now,
    updatedAt: now,
  });

  // Insert any extracted URLs
  if (initial.urls && initial.urls.length > 0) {
    const urlPositions = generateNKeysBetween(null, null, initial.urls.length);
    await db.insert(todoUrls).values(
      initial.urls.map((url, i) => ({
        id: crypto.randomUUID(),
        todoId,
        url,
        position: urlPositions[i],
        fetchStatus: "pending" as const,
        createdAt: now,
        updatedAt: now,
      })),
    );

    // Fetch URL metadata in background
    c.executionCtx.waitUntil(
      fetchUrlMetadataBackground(db, todoId, initial.urls, c.env, userId),
    );
  }

  // If AI is enabled, enrich in background
  if (aiEnabled) {
    c.executionCtx.waitUntil(
      enrichTodoWithAI(db, c.env.AI, c.env, todoId, userId, text),
    );
  }

  // Fetch the created todo to return
  const created = await db
    .select()
    .from(todos)
    .where(eq(todos.id, todoId))
    .then((rows) => rows[0]);

  await notifySync(c.env, userId);

  return c.json({ todos: [serializeTodo(created)], ai: aiEnabled });
}

/** Fetch metadata for URLs in background */
async function fetchUrlMetadataBackground(
  db: ReturnType<typeof getDb>,
  todoId: string,
  urls: string[],
  env: { USER_SYNC: DurableObjectNamespace },
  userId: string,
): Promise<void> {
  // Get the URL records we just created
  const urlRecords = await db
    .select()
    .from(todoUrls)
    .where(eq(todoUrls.todoId, todoId));

  await Promise.allSettled(
    urlRecords.map(async (record) => {
      try {
        const metadata = await fetchUrlMetadata(record.url);
        await db
          .update(todoUrls)
          .set({
            title: metadata.title,
            description: metadata.description,
            siteName: metadata.siteName,
            favicon: metadata.favicon,
            fetchStatus: "fetched" as const,
            fetchedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(todoUrls.id, record.id));
      } catch (error) {
        console.error(`Failed to fetch metadata for ${record.url}:`, error);
        await db
          .update(todoUrls)
          .set({
            fetchStatus: "failed" as const,
            updatedAt: new Date(),
          })
          .where(eq(todoUrls.id, record.id));
      }
    }),
  );

  // Notify clients that metadata is ready
  await notifySync(env, userId);
}

/** Notify all connected WebSocket clients for this user to sync */
async function notifySync(
  env: { USER_SYNC: DurableObjectNamespace },
  userId: string,
): Promise<void> {
  try {
    const id = env.USER_SYNC.idFromName(userId);
    const stub = env.USER_SYNC.get(id);
    await stub.fetch(new Request("http://internal/notify", { method: "POST" }));
  } catch {
    // Non-critical
  }
}
```

- [ ] **Step 2: Run typecheck to verify**

Run: `pnpm api:typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/api/src/handlers/smart-create.ts
git commit -m "refactor smart-create to use post-creation AI processing"
```

---

## Task 4: Delete shouldUseAI Heuristic

**Files:**
- Delete: `src/api/src/lib/smart-input.ts`

- [ ] **Step 1: Remove the file**

```bash
rm src/api/src/lib/smart-input.ts
```

- [ ] **Step 2: Run typecheck to confirm no remaining references**

Run: `pnpm api:typecheck`
Expected: No errors (the import was already removed in Task 3)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "remove shouldUseAI heuristic - AI always processes when enabled"
```

---

## Task 5: Update Web Client to Handle aiStatus

**Files:**
- Modify: `src/web/src/lib/validation.ts`
- Modify: `src/web/src/components/TodoItem.tsx`

- [ ] **Step 1: Update Zod schema for todos**

In `src/web/src/lib/validation.ts`, update the `todoSchema` to include `aiStatus`:

Find this schema and add the aiStatus field:

```typescript
export const todoSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  completed: z.boolean(),
  position: z.string(),
  dueDate: z.string().datetime().nullable(),
  priority: z.enum(["low", "medium", "high"]).nullable(),
  aiStatus: z.enum(["pending", "processing", "complete", "failed"]).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
```

- [ ] **Step 2: Add visual indicator for AI processing**

In `src/web/src/components/TodoItem.tsx`, add a subtle indicator when AI is processing:

Find the title display section and wrap it with a processing indicator:

```tsx
{/* After the checkbox, before or alongside the title */}
{todo.aiStatus === "pending" || todo.aiStatus === "processing" ? (
  <span className="text-gray-muted text-xs ml-2" title="AI is processing...">
    ...
  </span>
) : null}
```

- [ ] **Step 3: Run typecheck and tests**

Run: `pnpm web:typecheck && pnpm web:test`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/web/src/lib/validation.ts src/web/src/components/TodoItem.tsx
git commit -m "add aiStatus field to web client with processing indicator"
```

---

## Task 6: Update API Tests

**Files:**
- Modify: `src/api/test/todos.test.ts`

- [ ] **Step 1: Update smart create tests**

The existing tests for smart create need to be updated to reflect the new behavior:

1. Todo is created immediately (not after AI processing)
2. `aiStatus` field is included in response
3. AI enrichment happens in background

Update the relevant test cases in `src/api/test/todos.test.ts`:

```typescript
describe("POST /todos/smart", () => {
  it("creates todo immediately with aiStatus pending when AI enabled", async () => {
    // First enable AI for the user
    const patchRes = await app.request("/users/me", {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({ aiEnabled: true }),
    });
    expect(patchRes.status).toBe(200);

    const res = await app.request("/todos/smart", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ text: "buy milk and eggs tomorrow" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.todos).toHaveLength(1);
    expect(data.todos[0].aiStatus).toBe("pending");
    expect(data.ai).toBe(true);
  });

  it("creates todo with aiStatus null when AI disabled", async () => {
    const res = await app.request("/todos/smart", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ text: "simple task" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.todos).toHaveLength(1);
    expect(data.todos[0].aiStatus).toBeNull();
    expect(data.ai).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm api:test`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add src/api/test/todos.test.ts
git commit -m "update API tests for post-creation AI processing"
```

---

## Task 7: Final Verification

- [ ] **Step 1: Run full check suite**

Run: `pnpm check && pnpm typecheck && pnpm test`
Expected: All pass with no errors

- [ ] **Step 2: Manual test**

1. Start dev servers: `pnpm dev`
2. Create a todo with AI enabled - should appear immediately
3. Wait a moment - title should update when AI completes
4. Create a todo with AI disabled - should work as before
5. Create a todo with a URL - URL metadata should load in background

- [ ] **Step 3: Commit any final fixes**

If any fixes were needed during testing, commit them.

---

## Acceptance Criteria

- [ ] Todos are created immediately without waiting for AI
- [ ] `aiStatus` column tracks processing state (pending → processing → complete/failed)
- [ ] `shouldUseAI` heuristic is removed - AI always processes when enabled
- [ ] Web client shows visual indicator during AI processing
- [ ] All tests pass
- [ ] No TypeScript errors
